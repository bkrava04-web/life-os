import { daySchedule, overnightCarry } from './schedule.js?v=stage9.3.3';
import { tasksFor, isDone } from './tasks.js?v=stage9.3.3';
import { workoutSafety, shiftDate, validDate } from './sports.js?v=stage9.3.3';
const ordinal=date=>Date.parse(date+'T00:00:00Z')/86400000;
const sport=task=>!!task.workoutSessionId||task.activityType==='Спорт'||task.category==='Спорт';
export function trainingKind(workout) {
  const name=(workout.name||'')+' '+(workout.id||'');
  if(/силов|strength|resistance/i.test(name))return 'strength';
  if(/мобильност|растяж|mobility|stretch|yoga|йога/i.test(name))return 'mobility';
  if(/кардио|cardio|орбитрек|elliptical|бег|running|cycling|велосипед|плаван/i.test(name))return 'cardio';
  return workout.intensity&&workout.intensity!=='light'?'strength':'unknown';
}
// With no appointment times, compare the latest possible earlier finish with
// the earliest possible later start. Three dates normally ensure >=48h; DST
// is handled in the browser's local timezone, not rounded UTC day differences.
export function minimumRestHours(a,b) {
  if(a===b)return 0;const [early,late]=[a,b].sort();
  return Math.max(0,(new Date(late+'T00:00:00')-new Date(shiftDate(early,1)+'T00:00:00'))/3600000);
}
function recoveryState(data) {
  const latest=[...(data.sports?.sessions||[])].filter(s=>s.log?.feedback).sort((a,b)=>b.date.localeCompare(a.date)||String(b.logHistory?.at(-1)?.at||'').localeCompare(String(a.logHistory?.at(-1)?.at||'')))[0];
  const f=latest?.log.feedback;
  const poor=f=>f&&(f.pain||f.sleep==='poor'||f.energy!=null&&f.energy<=2||f.overallDifficulty>=4);
  if(poor(f)||(latest&&(data.sports.sessions||[]).some(s=>s.date===latest.date&&poor(s.log?.feedback))))return 'poor';
  return f&&!f.pain&&f.sleep==='good'&&f.energy>=3&&f.overallDifficulty!=null&&f.overallDifficulty<=3?'normal':'unknown';
}
function planSlots(program,run) {
  const slots=[],count=run==='base'?Math.max(...program.workouts.map(w=>w.repeatCount)):1;
  for(let index=0;index<count;index++)for(const workout of program.workouts)if(run!=='base'||index<workout.repeatCount)slots.push({workout,kind:trainingKind(workout),planKey:`${program.id}:${run}:${workout.id}:${index}`,index:slots.length});
  return slots;
}
function descriptor(workout,date,programId,planKey=null){return {date,programId,planKey,kind:trainingKind(workout),intensity:workout.intensity,duration:workout.durationMinutes??workout.duration};}
function compatible(a,b,state){
  if(state==='poor'||a.kind==='unknown'||b.kind==='unknown')return false;
  const mobile=a.kind==='mobility'?a:b.kind==='mobility'?b:null,main=mobile===a?b:a;
  return mobile&&mobile.intensity==='light'&&mobile.duration>0&&mobile.duration<=20&&
    (main.kind==='cardio'&&main.intensity==='light'||main.kind==='strength'&&['light','medium'].includes(main.intensity));
}
export function calculatePlan(data,program,startDate,endDate,run='base',{suggest=true}={}) {
  if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)throw new Error('Некорректный период планирования');
  const slots=planSlots(program,run),existing=data.sports.sessions,byKey=new Map(existing.map(s=>[s.planKey,s]));
  const sessionById=new Map(existing.map(s=>[s.id,s]));
  const entries=[],unplacedDetails=[],assigned=new Map(),state=recoveryState(data),baseCache=new Map();
  const priority={strength:0,cardio:1,unknown:2,mobility:3};
  const ordered=slots.filter(s=>!byKey.has(s.planKey)).sort((a,b)=>priority[a.kind]-priority[b.kind]||a.index-b.index);
  const outsideHistory=existing.filter(s=>isDone(data,s.taskId,s.date)||s.logHistory?.length);
  function baseLoads(date){
    if(!baseCache.has(date)){
      const tasks=tasksFor(data,date).filter(sport),loads=tasks.map(task=>{
        const session=sessionById.get(task.workoutSessionId);
        return descriptor(session?.workoutSnapshot||task,date,session?.programId,session?.planKey);
      });
      for(const session of outsideHistory.filter(s=>s.date===date))if(!tasks.some(t=>t.id===session.taskId))loads.push(descriptor(session.workoutSnapshot,date,session.programId,session.planKey));
      baseCache.set(date,loads);
    }
    return baseCache.get(date);
  }
  function loads(date){return [...baseLoads(date),...entries.filter(e=>e.date===date).map(e=>descriptor(program.workouts.find(w=>w.id===e.workoutId),date,program.id,e.planKey))];}
  function blocked(slot,date){
    if(slot.kind==='strength'&&(daySchedule(date,data.workSchedule).kind==='recovery'||overnightCarry(date,data.workSchedule)))return 'После ночной смены силовые не назначаются, даже с лёгкой интенсивностью';
    const unsafe=workoutSafety(data,slot.workout,date);if(unsafe)return unsafe;
    const current=descriptor(slot.workout,date,program.id),same=loads(date);
    if(current.kind==='strength'&&same.some(s=>s.kind==='strength'))return 'Две силовые в один день запрещены; нужен интервал не менее 48 часов';
    if(same.length&&(same.length>=2||!compatible(current,same[0],state)))return same.some(s=>s.kind==='unknown')?'День занят спортивным заданием без описания нагрузки':state==='poor'?'Совмещение отключено: в дневнике отмечено плохое восстановление':'Несовместимая нагрузка или лимит двух занятий в день';
    for(let offset=-4;offset<=4;offset++)if(offset){for(const other of loads(shiftDate(date,offset))){
      if(current.kind==='strength'&&other.kind==='strength'&&minimumRestHours(date,other.date)<48)return 'Между силовыми нельзя гарантировать 48 часов без заданного времени';
      if((current.intensity==='high'||other.intensity==='high')&&current.kind!=='mobility'&&other.kind!=='mobility'&&other.kind!=='unknown'&&minimumRestHours(date,other.date)<48)return 'Недостаточный интервал рядом с интенсивной тренировкой';
      if(other.programId===program.id&&Math.abs(offset)<(program.minGapDays||1))return 'Минимальный интервал программы между разными датами';
    }}
    // Retain explicitly longer program gaps, including >4 days.
    if((program.minGapDays||1)>5)for(let offset=5;offset<program.minGapDays;offset++)for(const sign of [-1,1])if(loads(shiftDate(date,offset*sign)).some(l=>l.programId===program.id))return 'Минимальный интервал программы между разными датами';
    return null;
  }
  const failedKinds=new Set();
  for(const slot of ordered){
    const reasons=new Map();let found=null,earliest=startDate,latest=endDate;
    for(const other of slots.filter(s=>s.kind===slot.kind&&s.planKey!==slot.planKey)){
      const fixed=byKey.get(other.planKey)?.date||assigned.get(other.planKey);
      if(!fixed)continue;
      if(other.index<slot.index&&fixed>earliest)earliest=fixed;
      if(other.index>slot.index&&fixed<latest)latest=fixed;
    }
    if(failedKinds.has(slot.kind))reasons.set('Предыдущее занятие этого типа не помещается: порядок прогрессии сохранён',1);
    else for(let date=earliest;date<=latest;date=shiftDate(date,1)){
      const reason=blocked(slot,date);if(reason){reasons.set(reason,(reasons.get(reason)||0)+1);continue;}
      found={planKey:slot.planKey,workoutId:slot.workout.id,name:slot.workout.name,intensity:slot.workout.intensity,date};break;
    }
    if(found){entries.push(found);assigned.set(slot.planKey,found.date);}else{failedKinds.add(slot.kind);if(!reasons.size)reasons.set('Нет дат между уже назначенными занятиями этого типа',1);unplacedDetails.push({planKey:slot.planKey,name:slot.workout.name,reasons:[...reasons].map(([reason,days])=>({reason,days}))});}
  }
  entries.sort((a,b)=>a.date.localeCompare(b.date)||slots.find(s=>s.planKey===a.planKey).index-slots.find(s=>s.planKey===b.planKey).index);
  const combined=entries.some(e=>loads(e.date).length>1);
  let unknownDays=0;for(let date=startDate;date<=endDate;date=shiftDate(date,1))if(baseLoads(date).some(l=>l.kind==='unknown'))unknownDays++;
  const firstStrength=entries.find(e=>trainingKind(program.workouts.find(w=>w.id===e.workoutId))==='strength');
  const earlyLight=firstStrength&&entries.some(e=>e.date<firstStrength.date);
  const constraints=unknownDays?[`Дней, занятых спортивными заданиями без описания нагрузки: ${unknownDays}. Они сохраняются и не считаются автоматически совместимыми.`]:[];
  const result={programId:program.id,revision:program.revision,startDate,endDate,run,entries,unplaced:unplacedDetails.map(d=>d.name),unplacedDetails,
    warnings:[...constraints,...(state==='poor'?['В последней записи отмечено плохое восстановление. Совмещение отключено; перед выполнением оцени самочувствие и при необходимости перенеси занятие.']:[]),...(earlyLight?['Лёгкие занятия могут предшествовать первой силовой. Порядок силовых A/B и прогрессия кардио сохраняются отдельно.']:[]),...(combined?[state==='unknown'?'Совмещение запланировано условно: актуальных оценок восстановления нет. Кардио и короткая мобильность вместе допустимы только при нормальном самочувствии; при усталости разнеси их по датам.':'Совмещение допустимо только при нормальном восстановлении. Перед занятием оцени самочувствие.']:[])],suggestedHorizonDays:null,periodAdvice:''};
  if(suggest&&unplacedDetails.length){
    const limit=shiftDate(startDate,364);
    if(endDate<limit){const longer=calculatePlan(data,program,startDate,limit,run,{suggest:false});if(!longer.unplaced.length){const last=longer.entries.reduce((date,e)=>e.date>date?e.date:date,startDate);result.suggestedHorizonDays=Math.max(ordinal(endDate)-ordinal(startDate)+2,ordinal(last)-ordinal(startDate)+1);result.periodAdvice=`Увеличь период поиска минимум до ${result.suggestedHorizonDays} дней. Существующие занятия останутся на своих датах.`;}}
    if(!result.periodAdvice)result.periodAdvice='Даже период до 365 дней не гарантирует размещение. Проверь разрешённые типы дней, занятые спортивные даты и данные восстановления; ограничения не ослаблялись.';
  }
  return result;
}
