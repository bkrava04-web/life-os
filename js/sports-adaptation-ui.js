import { recommendations,futureTargets,loadLabel,applyAdaptation,undoAdaptation } from './sports-adaptation.js?v=stage9.3.3';
import { esc } from './tasks.js?v=stage9.3.3';
import { pretty } from './calendar.js?v=stage9.3.3';
const types={increase:'Увеличить нагрузку',keep:'Оставить нагрузку',decrease:'Снизить нагрузку',recovery:'Восстановление'};
export function createAdaptationUI({getData,commit,toast,refresh}){
 const $=id=>document.getElementById(id);let diaryId=null,draft=null;
 function render(id){diaryId=id;const data=getData(),session=data.sports.sessions.find(s=>s.id===id),offers=recommendations(data,id);
 $('sportsRecommendations').innerHTML=offers.length?'<h3 class="section-title">Рекомендации для следующей тренировки</h3>'+offers.map(o=>`<article class="sports-adapt-card"><div class="row wrap"><strong>${esc(o.name)}</strong><span class="small muted">${types[o.type]}</span></div><p class="small">${loadLabel(o.before)}${['increase','decrease'].includes(o.type)?' → '+loadLabel(o.after):''}</p><p class="small muted">${esc(o.reason)}</p><div class="actions">${['increase','decrease'].includes(o.type)?`<button data-adapt-offer="${esc(o.exerciseId)}">Применить</button>`:''}<button data-adapt-keep="${esc(o.exerciseId)}">Оставить как есть</button><button data-adapt-manual="${esc(o.exerciseId)}">Изменить вручную</button></div></article>`).join(''):'';
 const related=data.sports.sessions.filter(s=>s.programId===session.programId);
 $('sportsAdaptHistory').innerHTML=related.flatMap(s=>(s.adaptations||[]).map(a=>`<article class="sports-adapt-card"><strong>${pretty(s.date)} · ${esc(s.workoutSnapshot.name)}</strong><p class="small muted">${esc(a.at)} · ${a.source==='user'?'Пользователь':'Автоматическая рекомендация, подтверждена пользователем'}${a.undoneAt?' · отменено '+esc(a.undoneAt):''}<br>${esc(a.reason)}</p>${a.before.exercises.filter(e=>{const after=a.after.exercises.find(x=>x.id===e.id);return after&&loadLabel(e)!==loadLabel(after);}).map(e=>`<p class="small">${esc(e.name)}: ${loadLabel(e)} → ${loadLabel(a.after.exercises.find(x=>x.id===e.id))}</p>`).join('')}${!a.undoneAt&&[...(s.adaptations||[])].reverse().find(x=>!x.undoneAt)?.id===a.id?`<button data-adapt-undo="${esc(s.id)}">Отменить последнее изменение</button>`:''}</article>`)).join('')||'<p class="organization-empty">Изменений нагрузки пока нет.</p>';
 }
 function open(exerciseId,manual){const data=getData(),offer=recommendations(data,diaryId).find(o=>o.exerciseId===exerciseId);if(!offer)return;
 draft={offer,manual,sourceId:diaryId,before:offer.before};$('sportsAdaptTitle').textContent=offer.name;$('sportsAdaptReason').textContent=offer.reason;
 const load=manual?offer.before:offer.after;
 for(const [id,key] of [['sportsAdaptSets','sets'],['sportsAdaptReps','reps'],['sportsAdaptSeconds','durationSeconds']]){$(id).value=load[key]??'';$(id).disabled=!manual||load[key]==null;}
 $('sportsAdaptComment').value=manual?'':offer.reason;
 const origin=data.sports.sessions.find(s=>s.id===diaryId);
 const targets=futureTargets(data,diaryId).filter(s=>(manual||s.workoutSnapshot.intensity===origin.workoutSnapshot.intensity)&&s.workoutSnapshot.exercises.some(e=>e.id===exerciseId&&e.name===offer.name&&(manual||loadLabel(e)===loadLabel(offer.before)&&(e.restSeconds||0)===(offer.before.restSeconds||0))));
 $('sportsAdaptTargets').innerHTML=targets.length?targets.map(s=>`<label class="sports-check"><input type="${manual?'radio':'checkbox'}" name="adaptTarget" data-adapt-target="${esc(s.id)}">${pretty(s.date)} · ${esc(s.workoutSnapshot.name)} · ${loadLabel(s.workoutSnapshot.exercises.find(e=>e.id===exerciseId))}</label>`).join(''):'<p class="notice">Нет будущих занятий с такой же нагрузкой и упражнением. Создай расписание или перенеси занятие на будущую дату.</p>';
 if(manual&&targets.length){const first=$('sportsAdaptTargets').querySelector('input');first.checked=true;selectManualTarget(first.dataset.adaptTarget);}
 $('sportsAdaptForm').querySelector('button[type="submit"]').disabled=!targets.length;$('sportsAdaptDialog').showModal();
 }
 function selectManualTarget(id){const exercise=getData().sports.sessions.find(s=>s.id===id).workoutSnapshot.exercises.find(e=>e.id===draft.offer.exerciseId);draft.before=structuredClone(exercise);for(const [id,key] of [['sportsAdaptSets','sets'],['sportsAdaptReps','reps'],['sportsAdaptSeconds','durationSeconds']]){$(id).value=exercise[key]??'';$(id).disabled=exercise[key]==null;}$('sportsAdaptReason').textContent='Нагрузка выбранного будущего занятия: '+loadLabel(exercise)+'. '+draft.offer.reason;}
 $('sportsAdaptTargets').onchange=event=>{if(draft?.manual&&event.target.dataset.adaptTarget)selectManualTarget(event.target.dataset.adaptTarget);};
 $('sportsAdaptForm').onsubmit=event=>{event.preventDefault();try{const after={...draft.before};for(const [id,key] of [['sportsAdaptSets','sets'],['sportsAdaptReps','reps'],['sportsAdaptSeconds','durationSeconds']])after[key]=$(id).value===''?null:Number($(id).value);
 const count=applyAdaptation(getData(),{sourceId:draft.sourceId,targetIds:[...$('sportsAdaptTargets').querySelectorAll('[data-adapt-target]:checked')].map(e=>e.dataset.adaptTarget),changes:[{exerciseId:draft.offer.exerciseId,before:draft.before,after}],source:draft.manual?'user':'recommendation',reason:$('sportsAdaptComment').value.trim()});commit();$('sportsAdaptDialog').close();refresh(diaryId);toast(`Обновлено будущих занятий: ${count}`);
 }catch(error){toast(error.message);}};
 $('sportsRecommendations').onclick=event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.adaptOffer)open(button.dataset.adaptOffer,false);if(button.dataset.adaptManual)open(button.dataset.adaptManual,true);if(button.dataset.adaptKeep){button.closest('article').querySelector('.actions').innerHTML='<span class="small muted">Нагрузка сохранена без изменений</span>';}};
 $('sportsAdaptHistory').onclick=event=>{const button=event.target.closest('[data-adapt-undo]');if(!button)return;try{undoAdaptation(getData(),button.dataset.adaptUndo);commit();refresh(diaryId);toast('Последнее изменение отменено');}catch(error){toast(error.message);}};
 return {render};
}
