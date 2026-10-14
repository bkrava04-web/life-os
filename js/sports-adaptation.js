import { isDone, subtaskDone } from './tasks.js?v=stage9.3.3';
import { daySchedule, overnightCarry } from './schedule.js?v=stage9.3.3';
import { today } from './calendar.js?v=stage9.3.3';
const dimensions=['sets','reps','durationSeconds'];
const equalLoad=(a,b)=>dimensions.every(key=>(a[key]??null)===(b[key]??null));
const gentle=(session,exercise)=>/мобильност|восстановлен|растяж|размин|замин|дыхани|расслаб|отдых|warmup|cooldown|stretch|mobility/i.test(session.workoutSnapshot.name+' '+exercise.name+' '+exercise.id);
function recovery(data,session){
 const f=session.log.feedback,day=daySchedule(session.date,data.workSchedule);
 if(f?.pain)return 'Отмечена боль: прекрати болезненное упражнение и оцени необходимость медицинской консультации. Повышение не предлагается.';
 if(f?.sleep==='poor'||f?.energy<=2&&f?.energy!=null||f?.overallDifficulty>=4)return 'Недосып или выраженная усталость: сначала восстановление, без повышения нагрузки.';
 if(day.kind==='day'&&session.workoutSnapshot.intensity!=='light')return 'Дневная смена и силовая нагрузка: приоритет восстановлению, без повышения.';
 if(day.kind==='night'||day.kind==='recovery'||overnightCarry(session.date,data.workSchedule))return 'Ночная смена или восстановление после неё: приоритет сну и восстановлению.';
 return null;
}
function goodRecovery(session){const f=session.log.feedback;return f&&f.pain===false&&f.sleep==='good'&&f.energy>=3&&f.overallDifficulty!=null&&f.overallDifficulty<=3;}
function met(exercise,result){return result&&dimensions.filter(key=>exercise[key]!=null).every(key=>result[key]!=null&&result[key]>=exercise[key]);}
export function recommendations(data,sessionId){
 const current=data.sports.sessions.find(s=>s.id===sessionId);if(!current||!isDone(data,current.taskId,current.date))return [];
 return current.workoutSnapshot.exercises.map(exercise=>{
  const item={exerciseId:exercise.id,name:exercise.name,type:'keep',before:structuredClone(exercise),after:structuredClone(exercise),reason:'Недостаточно сопоставимых данных. Сохрани текущую нагрузку.'};
  const latest=data.sports.sessions.filter(s=>s.programId===current.programId&&(s.log.feedback||s.logHistory.length||isDone(data,s.taskId,s.date))).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const warning=recovery(data,current)||(latest&&latest.date>current.date?recovery(data,latest):null);if(warning)return {...item,type:'recovery',reason:warning};
  if(gentle(current,exercise))return {...item,reason:'Разминка, отдых и мобильность не оцениваются как неудача и не требуют автоматического повышения.'};
  const result=current.log.exercises[exercise.id];
  const earlier=data.sports.sessions.filter(s=>s.id!==current.id&&s.programId===current.programId&&s.date<=current.date&&(s.logHistory.length||s.log.feedback||isDone(data,s.taskId,s.date))&&s.workoutSnapshot.exercises.some(e=>e.id===exercise.id&&e.name===exercise.name)).sort((a,b)=>b.date.localeCompare(a.date));
  const previous=earlier[0],oldExercise=previous?.workoutSnapshot.exercises.find(e=>e.id===exercise.id&&e.name===exercise.name),oldResult=previous?.log.exercises[exercise.id];
  const comparable=previous&&equalLoad(oldExercise,exercise)&&(oldExercise.restSeconds||0)===(exercise.restSeconds||0)&&previous.workoutSnapshot.intensity===current.workoutSnapshot.intensity;
  const short=result&&dimensions.some(key=>exercise[key]!=null&&result[key]!=null&&result[key]<exercise[key]);
  const previousShort=oldResult&&dimensions.some(key=>oldExercise[key]!=null&&oldResult[key]!=null&&oldResult[key]<oldExercise[key]);
  let direction=0;
  if(result?.difficulty===5||result?.technique==='poor'||comparable&&short&&previousShort){direction=-1;item.reason=result?.technique==='poor'?'Отмечено ухудшение техники: уменьши нагрузку.':result?.difficulty===5?'Упражнение оценено как слишком тяжёлое.':'План не выполнен в двух сопоставимых занятиях.';}
  else if(comparable&&isDone(data,previous.taskId,previous.date)&&subtaskDone(data,current.taskId,current.date,exercise.id)&&subtaskDone(data,previous.taskId,previous.date,exercise.id)&&met(exercise,result)&&met(oldExercise,oldResult)&&[1,2].includes(result.difficulty)&&[1,2].includes(oldResult?.difficulty)&&result.technique==='good'&&oldResult.technique==='good'&&goodRecovery(current)&&goodRecovery(previous)&&!recovery(data,previous)){
   direction=1;item.reason='Две сопоставимые успешные тренировки с запасом, хорошей техникой и нормальным восстановлением.';
  }else if(result?.difficulty===3)item.reason='Сложность подходящая: оставь нагрузку.';
  if(direction){const key=direction<0&&comparable&&result?.sets<exercise.sets&&oldResult?.sets<oldExercise.sets&&exercise.sets>1?'sets':exercise.reps!=null?'reps':'durationSeconds';if(exercise[key]!=null){item.type=direction>0?'increase':'decrease';item.after[key]=Math.min(key==='sets'?100:key==='reps'?10000:86400,Math.max(1,exercise[key]+direction*(key==='durationSeconds'?5:1)));if(equalLoad(item.before,item.after)){item.type='keep';item.reason='Граница допустимой нагрузки достигнута. Пересмотри упражнение вручную.';}}}
  return item;
 });
}
export function futureTargets(data,sourceId,date=today()){
 const source=data.sports.sessions.find(s=>s.id===sourceId);if(!source)return [];
 return data.sports.sessions.filter(s=>{if(s.programId!==source.programId||s.date<=date||s.date<=source.date)return false;try{return !!writable(data,s,date);}catch{return false;}});
}
function loadLabel(exercise){return `${exercise.sets} подходов${exercise.reps!=null?' × '+exercise.reps:''}${exercise.durationSeconds!=null?' · '+exercise.durationSeconds+' с':''}`;}
export {loadLabel};
function writable(data,session,date){
 if(!session||session.date<=date||isDone(data,session.taskId,session.date)||session.logHistory.length||session.log.feedback||session.log.difficulty!=null||session.log.notes||Object.values(session.log.exercises).some(r=>Object.values(r).some(v=>v!=null)))throw new Error('Изменять можно только будущую тренировку без результатов');
 if(data.sports.programs.find(p=>p.id===session.programId)?.archivedAt)throw new Error('Программа в архиве');
 if(Object.values(data.checks||{}).some(e=>e[session.taskId])||Object.values(data.subtaskChecks||{}).some(e=>Object.values(e[session.taskId]||{}).some(Boolean))||Object.values(data.completionRewards||{}).some(e=>e[session.taskId]))throw new Error('У занятия есть отметки или XP');
 const task=data.tasks.find(t=>t.id===session.taskId);if(!task||task.workoutSessionId!==session.id||data.sports.sessions.some(s=>s.id!==session.id&&s.taskId===session.taskId))throw new Error('Связь с заданием неоднозначна');
 return task;
}
export function applyAdaptation(data,{sourceId,targetIds,changes,source='recommendation',reason},date=today()){
 if(!['recommendation','user'].includes(source)||!Array.isArray(targetIds)||!targetIds.length||new Set(targetIds).size!==targetIds.length||!changes.length)throw new Error('Выбери занятия и изменения');
 const origin=data.sports.sessions.find(s=>s.id===sourceId);if(!origin||!isDone(data,origin.taskId,origin.date))throw new Error('Исходная тренировка должна быть завершена');
 const offers=recommendations(data,sourceId),patches=[];
 for(const id of targetIds){const session=data.sports.sessions.find(s=>s.id===id),task=writable(data,session,date);
  if(session.programId!==origin.programId||session.date<=origin.date)throw new Error('Выбери последующие занятия этой программы');
  const snapshot=structuredClone(session.workoutSnapshot);
  for(const change of changes){const exercise=snapshot.exercises.find(e=>e.id===change.exerciseId),offer=offers.find(o=>o.exerciseId===change.exerciseId);
   if(!exercise||!offer||exercise.name!==offer.name||!equalLoad(exercise,change.before))throw new Error('Нагрузка выбранного упражнения отличается. Пересоздай предложение или выбери другое занятие.');
   const edited=dimensions.filter(key=>(change.after[key]??null)!==(exercise[key]??null));
   if(edited.length!==1)throw new Error('За один шаг меняй только подходы, повторения или время');
   const key=edited[0],value=change.after[key];if(!Number.isInteger(value)||value<1||value>(key==='sets'?100:key==='reps'?10000:86400)||exercise[key]==null)throw new Error('Некорректная нагрузка');
   if(value>exercise[key]&&value-exercise[key]>(key==='durationSeconds'?15:1))throw new Error('Выбери небольшой шаг: +1 подход/повторение или до +15 секунд');
   if(source==='recommendation'&&((exercise.restSeconds||0)!==(offer.before.restSeconds||0)||session.workoutSnapshot.intensity!==origin.workoutSnapshot.intensity))throw new Error('Отдых или интенсивность будущего занятия отличаются: используй ручную правку');
   if(source==='recommendation'&&(!['increase','decrease'].includes(offer.type)||!equalLoad(offer.after,change.after)))throw new Error('Рекомендация изменилась. Пересоздай анализ');
   if(value>exercise[key]&&(offers.some(o=>o.type==='recovery')||recovery(data,origin)||daySchedule(session.date,data.workSchedule).kind==='day'&&session.workoutSnapshot.intensity!=='light'||daySchedule(session.date,data.workSchedule).kind==='night'||daySchedule(session.date,data.workSchedule).kind==='recovery'||overnightCarry(session.date,data.workSchedule)))throw new Error('Повышение недоступно после боли, плохого восстановления или перед восстановлением после ночной');
   exercise[key]=value;
  }
  patches.push({session,task,snapshot,before:structuredClone(session.workoutSnapshot)});
 }
 if(typeof reason!=='string'||!reason.trim()||reason.length>5000)throw new Error('Укажи причину изменения');
 for(const {session,task,snapshot,before} of patches){session.adaptations ||= [];session.adaptations.push({id:crypto.randomUUID(),at:new Date().toISOString(),source,sourceSessionId:sourceId,reason,before,after:structuredClone(snapshot),undoneAt:null});session.workoutSnapshot=snapshot;
  for(const record of [task,...Object.values(data.taskOverrides||{}).map(entries=>entries[task.id]).filter(Boolean)])for(const step of record.subtasks||[]){const e=snapshot.exercises.find(e=>e.id===step.id);if(e)step.name=`${e.name} · ${loadLabel(e)}`;}
 }
 return patches.length;
}
export function undoAdaptation(data,sessionId,date=today()){
 const session=data.sports.sessions.find(s=>s.id===sessionId),task=writable(data,session,date),entry=[...(session.adaptations||[])].reverse().find(a=>!a.undoneAt);
 if(!entry)throw new Error('Нет изменений для отмены');
 if(JSON.stringify(session.workoutSnapshot)!==JSON.stringify(entry.after))throw new Error('Нагрузка уже изменена другим действием');
 session.workoutSnapshot=structuredClone(entry.before);entry.undoneAt=new Date().toISOString();
 for(const record of [task,...Object.values(data.taskOverrides||{}).map(entries=>entries[task.id]).filter(Boolean)])for(const step of record.subtasks||[]){const e=entry.before.exercises.find(e=>e.id===step.id);if(e)step.name=`${e.name} · ${loadLabel(e)}`;}
}
