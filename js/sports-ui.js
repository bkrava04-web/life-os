import { createAdaptationUI } from './sports-adaptation-ui.js?v=stage9.3.3';
import { programRemovalPreview, deleteProgram, archiveProgram, restoreProgram } from './sports-lifecycle.js?v=stage9.3.3';
import { parseProgramJSON, exportProgramJSON, programDefinition, newSportsId, programProgress, latestAttempt, programEnd, validDate } from './sports.js?v=stage9.3.3';
import { saveProgram, previewPlan, applyPlan, moveSession, saveDiary, scheduleExam, recordExam, previewExtension, applyExtension, finishSportsStage } from './sports-actions.js?v=stage9.3.3';
import { esc, isDone, subtaskDone, toggleCompletion, toggleSubtask } from './tasks.js?v=stage9.3.3';
import { today, pretty } from './calendar.js?v=stage9.3.3';
const intensities = { light: 'Лёгкая', medium: 'Средняя', high: 'Высокая' };
const examNames = { scheduled: 'Назначен', passed: 'Сдан', failed: 'Не сдан' };
export function createSportsUI({ getData, commit, toast, openObjective }) {
  const $ = id => document.getElementById(id);
  let selectedId = null, draft = null, importDraft = null, preview = null, diaryId = null, moveId = null, attemptId = null, lifecycleId = null;
  const adaptation = createAdaptationUI({getData,commit,toast,refresh: id => openDiary(id)});
  function options(items, selected, label) { return items.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(label ? label(item) : item.name)}</option>`).join(''); }
  function binding(prefix, objectiveId = null, stageId = null) {
    const data = getData();
    $(prefix + 'Goal').innerHTML = '<option value="">Выбери цель</option>' + options(data.objectives.filter(item => item.type === 'goal'), objectiveId);
    bindingStages(prefix, stageId);
  }
  function bindingStages(prefix, stageId = null) {
    $(prefix + 'Stage').innerHTML = '<option value="">Выбери этап</option>' + options(getData().stages.filter(stage => stage.objectiveId === $(prefix + 'Goal').value), stageId);
  }
  function run(action) {
    try { action(); } catch (error) { toast(error.message); }
  }
  function menu(program) {
    return `<details class="sports-program-menu"><summary aria-label="Действия программы ${esc(program.name)}">⋯</summary><div><button data-edit-program="${esc(program.id)}">Редактировать</button>${program.archivedAt ? `<button data-restore-program="${esc(program.id)}">Вернуть из архива</button>` : `<button data-archive-program="${esc(program.id)}">Архивировать</button>`}<button class="danger" data-delete-program="${esc(program.id)}">Удалить</button></div></details>`;
  }
  function openLifecycle(id) {
    lifecycleId = id;
    const data = getData(), summary = programRemovalPreview(data, id), program = data.sports.programs.find(p => p.id === id);
    $('sportsLifecycleTitle').textContent = 'Программа: ' + program.name;
    $('sportsLifecycleSummary').textContent = `Затрагивается: 1 программа, ${summary.sessions} занятий, ${summary.tasks} заданий. Испытаний: ${summary.exams}; продлений: ${summary.extensions}.`;
    $('sportsLifecycleReason').textContent = summary.reason || (summary.requiresFutureConsent ? 'Результатов нет. Для полного удаления отдельно подтверди удаление будущих занятий.' : 'Занятий и истории нет. Программу можно полностью удалить.');
    $('sportsDeleteFuture').checked = false;
    $('sportsDeleteFutureLabel').classList.toggle('hidden', !summary.canDelete || !summary.requiresFutureConsent);
    $('sportsLifecycleDelete').disabled = !summary.canDelete || summary.requiresFutureConsent;
    $('sportsLifecycleArchive').disabled = !!program.archivedAt;
    $('sportsLifecycleDialog').showModal();
  }
  $('sportsProgramFilter').addEventListener('change', () => { selectedId = null; render(); });
  $('sportsDeleteFuture').addEventListener('change', () => { const summary = programRemovalPreview(getData(), lifecycleId); $('sportsLifecycleDelete').disabled = !summary.canDelete || (summary.requiresFutureConsent && !$('sportsDeleteFuture').checked); });
  $('sportsLifecycleDelete').addEventListener('click', () => run(() => {
    if (!confirm('Полностью удалить программу и подтверждённые будущие занятия? Это действие нельзя отменить.')) return;
    deleteProgram(getData(), lifecycleId, { deleteFutureSessions: $('sportsDeleteFuture').checked });
    selectedId = null; commit(); $('sportsLifecycleDialog').close(); toast('Программа удалена');
  }));
  $('sportsLifecycleArchive').addEventListener('click', () => run(() => {
    if (!confirm('Архивировать программу с сохранением всех занятий, XP и истории?')) return;
    archiveProgram(getData(), lifecycleId); selectedId = null; commit(); $('sportsLifecycleDialog').close(); toast('Программа перенесена в архив');
  }));
  function render() {
    const data = getData(), sports = data.sports;
    const program = sports.programs.find(item => item.id === selectedId);
    $('sportsDetail').classList.toggle('hidden', !program); $('sportsPrograms').classList.toggle('hidden', !!program);
    const visible = sports.programs.filter(item => !!item.archivedAt === ($('sportsProgramFilter').value === 'archive'));
    $('sportsPrograms').innerHTML = visible.length ? visible.map(program => {
      const progress = programProgress(data, program.id), attempt = latestAttempt(data, program.id);
      return `<article class="card sports-program-shell">${menu(program)}<button class="sports-program-card" data-sports-program="${esc(program.id)}"><span class="eyebrow">${esc(data.objectives.find(goal => goal.id === program.objectiveId)?.name || 'Цель удалена')}</span><strong>${esc(program.name)}</strong><span class="muted small">${esc(data.stages.find(stage => stage.id === program.stageId)?.name || 'Этап удалён')} · минимум ${program.minDurationDays} дней</span><span class="row small"><span>Занятия: ${progress.done}/${progress.total}</span><span>${progress.value == null ? 'Не запланировано' : progress.value + '%'}</span></span><span class="progress"><span style="width:${progress.value || 0}%"></span></span><span class="muted small">Экзамен: ${program.exam ? attempt ? examNames[attempt.status] : 'Не назначен' : 'Не предусмотрен'}</span></button></article>`;
    }).join('') : `<div class="empty">${$('sportsProgramFilter').value === 'archive' ? 'Архивных программ пока нет.' : 'Программ пока нет. Создай программу или импортируй JSON. Цель и этап можно подготовить в разделе «Цели и проекты».'}</div>`;
    if (!program) { selectedId = null; return; }
    const progress = programProgress(data, program.id), attempt = latestAttempt(data, program.id), end = programEnd(data, program);
    const sessions = sports.sessions.filter(session => session.programId === program.id).sort((a,b) => a.date.localeCompare(b.date));
    const stage = data.stages.find(stage => stage.id === program.stageId);
    $('sportsDetail').innerHTML = `<div class="row wrap"><button id="backSports">← Программы</button><div class="actions">${menu(program)}<button data-export-program="${esc(program.id)}">JSON ↓</button><button data-sports-objective="${esc(program.objectiveId)}">Цель →</button></div></div><h2 class="objective-title">${esc(program.name)}${program.archivedAt ? ' <span class="muted small">· Архив</span>' : ''}</h2><p class="task-description muted small">${esc(program.description || '')}</p><div class="sports-metrics"><div><span class="eyebrow">Тренировки</span><strong>${progress.value == null ? '—' : progress.value + '%'}</strong><span class="small muted">${progress.done} / ${progress.total} занятий${progress.scheduled < progress.total ? ' · назначено ' + progress.scheduled : ''}</span></div><div><span class="eyebrow">Экзамен</span><strong>${program.exam ? attempt ? examNames[attempt.status] : 'Не назначен' : 'Без экзамена'}</strong><span class="small muted">Этап: ${stage?.status === 'completed' ? 'завершён' : 'не завершён'}</span></div><div><span class="eyebrow">Минимальный срок</span><strong>${program.minDurationDays} дней</strong><span class="small muted">${end ? 'До ' + pretty(end) : 'Начало ещё не запланировано'}</span></div></div><div class="actions"><button class="primary" data-plan-program="${esc(program.id)}" ${program.archivedAt ? 'disabled' : ''}>Предварительное расписание</button>${!program.archivedAt && stage && stage.status !== 'completed' && (!program.exam || attempt?.status === 'passed') ? `<button data-finish-sport-stage="${esc(program.id)}">Завершить этап и перейти дальше</button>` : ''}${!program.archivedAt && attempt?.status === 'failed' ? `<button data-extend-program="${esc(program.id)}">Продлить на 7 дней и повторить экзамен</button>` : ''}</div><p class="muted small">Завершение тренировок не завершает этап автоматически. Планирование добавляет только новые занятия.</p><h3 class="section-title" style="margin-top:24px">Занятия</h3><div class="sports-session-list">${sessions.length ? sessions.map(session => `<div class="sports-session-row"><div><strong>${esc(session.workoutSnapshot.name)}</strong><div class="small muted">${pretty(session.date)} · ${intensities[session.workoutSnapshot.intensity]} · ${isDone(data, session.taskId, session.date) ? 'Завершена' : data.tasks.some(task => task.id === session.taskId) ? 'Запланирована' : 'Задание удалено, история сохранена'}</div></div><div class="actions"><button data-open-session="${esc(session.id)}">Дневник</button><button data-move-session="${esc(session.id)}" ${isDone(data, session.taskId, session.date) ? 'disabled' : ''}>Перенести</button></div></div>`).join('') : '<p class="organization-empty">Сначала посмотри предварительное расписание.</p>'}</div><details class="sports-template-details"><summary>Состав программы · ${program.workouts.length} тренировок</summary>${definitionHtml(program)}</details>${program.exam || sports.examAttempts.some(item => item.programId === program.id) ? `<section class="sports-exams"><h3 class="section-title">${esc(program.exam?.name || 'История испытаний')}</h3><form id="scheduleExamForm"><label class="small muted" for="sportsExamDate">Дата испытания</label><div class="actions"><input id="sportsExamDate" type="date" required value="${end || today()}"><button type="submit" ${program.archivedAt || !program.exam || !end || stage?.status === 'completed' || attempt?.status === 'scheduled' ? 'disabled' : ''}>Назначить</button></div></form>${sports.examAttempts.filter(item => item.programId === program.id).map(item => `<div class="sports-session-row"><div><strong>${pretty(item.date)} · ${examNames[item.status]}</strong><div class="small muted">${item.criteriaSnapshot.map(criterion => `${esc(criterion.name)}: ${item.results[criterion.id] ?? '—'} / ${criterion.operator === 'gte' ? '≥' : '≤'} ${criterion.target} ${esc(criterion.unit)}`).join(' · ')}</div></div>${item.status === 'scheduled' ? `<button data-exam-attempt="${esc(item.id)}">Записать результаты</button>` : ''}</div>`).join('')}</section>` : ''}<details class="sports-template-details"><summary>История продлений · ${sports.extensions.filter(item => item.programId === program.id).length}</summary>${sports.extensions.filter(item => item.programId === program.id).map(item => `<p class="small muted">${pretty(item.startDate)} — ${pretty(item.endDate)} · повторное испытание ${pretty(item.retakeDate)}</p>`).join('') || '<p class="organization-empty">Продлений ещё нет.</p>'}</details>`;
  }
  function definitionHtml(program) {
    return program.workouts.map(workout => `<div class="sports-template"><strong>${esc(workout.name)}</strong><p class="muted small">${intensities[workout.intensity]} · ${workout.durationMinutes} мин · ${workout.repeatCount} занятий · ${workout.xp} XP</p>${workout.exercises.map(exercise => `<p class="small">${esc(exercise.name)} · ${exercise.sets} подходов${exercise.reps != null ? ' × ' + exercise.reps : ''}${exercise.durationSeconds != null ? ' · ' + exercise.durationSeconds + ' с' : ''} · отдых ${exercise.restSeconds || 0} с${exercise.required === false ? ' · необязательно' : ''}${exercise.recommendations ? '<br><span class="muted">' + esc(exercise.recommendations) + '</span>' : ''}</p>`).join('')}<p class="small muted">${esc(workout.recommendations || '')}</p></div>`).join('');
  }
  function input(field, value, type, attrs, dataAttrs, label) {
    return `<label class="sports-field"><span>${label}</span><input type="${type}" value="${esc(value ?? '')}" data-field="${field}" ${dataAttrs} ${attrs || ''} aria-label="${label}"></label>`;
  }
  function renderDraft() {
    $('sportsWorkoutEditor').innerHTML = draft.workouts.map((workout, wi) => {
      const w = `data-workout-index="${wi}"`;
      return `<section class="sports-workout-editor"><div class="row"><strong>Тренировка ${wi + 1}</strong><button type="button" data-remove-workout="${wi}" class="danger">Удалить</button></div>${input('name',workout.name,'text','required maxlength="150"',w,'Название тренировки')}<div class="sports-fields">${input('durationMinutes',workout.durationMinutes,'number','required min="1" max="1440"',w,'Минуты')}${input('repeatCount',workout.repeatCount,'number','required min="1" max="100"',w,'Число занятий')}${input('xp',workout.xp,'number','required min="1" max="500"',w,'XP')}</div><label class="sports-field"><span>Интенсивность</span><select data-field="intensity" ${w}>${['light','medium','high'].map(value => `<option value="${value}" ${value === workout.intensity ? 'selected' : ''}>${intensities[value]}</option>`).join('')}</select></label>${input('recommendations',workout.recommendations,'text','maxlength="5000"',w,'Рекомендации')}<div class="sports-exercise-editor">${workout.exercises.map((exercise, ei) => {
        const ex = `${w} data-exercise-index="${ei}"`;
        return `<div class="sports-exercise-row">${input('name',exercise.name,'text','required maxlength="200"',ex,'Упражнение')}<div class="sports-fields">${input('sets',exercise.sets,'number','required min="1" max="100"',ex,'Подходы')}${input('reps',exercise.reps,'number','min="1" max="10000"',ex,'Повторения')}${input('durationSeconds',exercise.durationSeconds,'number','min="1" max="86400"',ex,'Секунды')}${input('restSeconds',exercise.restSeconds,'number','min="0" max="3600"',ex,'Отдых, с')}</div>${input('recommendations',exercise.recommendations,'text','maxlength="5000"',ex,'Рекомендации упражнения')}<div class="row wrap"><label class="sports-check"><input type="checkbox" data-field="required" ${ex} ${exercise.required !== false ? 'checked' : ''}>Обязательное</label><button type="button" data-remove-exercise="${wi}:${ei}" class="danger small">Удалить упражнение</button></div></div>`;
      }).join('')}</div><button type="button" data-add-exercise="${wi}">+ Упражнение</button></section>`;
    }).join('');
    $('sportsCriteriaEditor').innerHTML = (draft.exam?.criteria || []).map((criterion,index) => `<div class="sports-exercise-row">${input('name',criterion.name,'text','required maxlength="200"',`data-criterion-index="${index}"`,'Норматив')}<div class="sports-fields">${input('unit',criterion.unit,'text','maxlength="30"',`data-criterion-index="${index}"`,'Единицы')}${input('target',criterion.target,'number','required min="0" max="1000000" step="any"',`data-criterion-index="${index}"`,'Норматив')}<label class="sports-field"><span>Сравнение</span><select data-field="operator" data-criterion-index="${index}"><option value="gte" ${criterion.operator === 'gte' ? 'selected' : ''}>Не меньше</option><option value="lte" ${criterion.operator === 'lte' ? 'selected' : ''}>Не больше</option></select></label></div><button type="button" data-remove-criterion="${index}" class="danger small">Удалить норматив</button></div>`).join('');
    $('sportsExamFields').classList.toggle('hidden', !$('sportsHasExam').checked);
    $('sportsExamFields').querySelectorAll('input').forEach(control => { control.disabled = !$('sportsHasExam').checked; });
  }
  function openEditor(programId = null) {
    const program = getData().sports.programs.find(item => item.id === programId);
    draft = program ? programDefinition(program) : { id: newSportsId(), name: '', description: '', minDurationDays: 7, minGapDays: 1, workouts: [], exam: null };
    $('sportsProgramForm').reset(); $('sportsProgramName').value = draft.name; $('sportsProgramDescription').value = draft.description;
    $('sportsMinDays').value = draft.minDurationDays; $('sportsGapDays').value = draft.minGapDays;
    $('sportsHasExam').checked = !!draft.exam; $('sportsExamName').value = draft.exam?.name || '';
    binding('sportsProgram',program?.objectiveId,program?.stageId); renderDraft(); $('sportsProgramDialog').showModal();
  }
  function openDiary(id) {
    const session = getData().sports.sessions.find(item => item.id === id);
    if (!session) { toast('Занятие не найдено'); return; }
    diaryId = id; $('sportsDiaryTitle').textContent = session.workoutSnapshot.name;
    $('sportsDiaryDate').textContent = pretty(session.date) + ' · рекомендации: ' + (session.workoutSnapshot.recommendations || 'не указаны');
    $('sportsDiaryExercises').innerHTML = session.workoutSnapshot.exercises.map(exercise => {
      const actual = session.log.exercises[exercise.id] || {};
      return `<section class="sports-exercise-row"><label class="sports-check"><input type="checkbox" data-diary-exercise="${esc(exercise.id)}" ${subtaskDone(getData(),session.taskId,session.date,exercise.id) ? 'checked' : ''}>${esc(exercise.name)}${exercise.required === false ? ' · необязательно' : ''}</label><p class="muted small">План: ${exercise.sets} подходов${exercise.reps != null ? ' × ' + exercise.reps : ''}${exercise.durationSeconds != null ? ' · ' + exercise.durationSeconds + ' с' : ''} · отдых ${exercise.restSeconds || 0} с</p><p class="muted small">${esc(exercise.recommendations || '')}</p><div class="sports-fields">${['sets','reps','durationSeconds'].map((field,index) => `<label class="sports-field"><span>${['Факт: подходы','Повторения','Секунды'][index]}</span><input type="number" min="0" max="100000" data-actual-exercise="${esc(exercise.id)}" data-actual-field="${field}" value="${actual[field] ?? ''}"></label>`).join('')}</div><div class="sports-feedback-grid"><label>Сложность упражнения<select data-exercise-rating="${esc(exercise.id)}"><option value="">Без оценки</option>${['Очень легко','Легко','Нормально','Тяжело','Слишком тяжело'].map((label,i)=>`<option value="${i+1}" ${actual.difficulty===i+1?'selected':''}>${i+1} · ${label}</option>`).join('')}</select></label><label>Техника<select data-exercise-technique="${esc(exercise.id)}"><option value="">Не оценена</option><option value="good" ${actual.technique==='good'?'selected':''}>Уверенная</option><option value="poor" ${actual.technique==='poor'?'selected':''}>Нарушается</option></select></label></div></section>`;
    }).join('');
    $('sportsDifficulty').value = session.log.feedback?.overallDifficulty ?? ''; $('sportsEnergy').value=session.log.feedback?.energy??''; $('sportsSleep').value=session.log.feedback?.sleep||''; $('sportsPain').checked=!!session.log.feedback?.pain; $('sportsPainAdvice').classList.toggle('hidden',!$('sportsPain').checked); $('sportsLegacyDifficulty').textContent=session.log.difficulty!=null?'Прежняя оценка: '+session.log.difficulty+' / 10 (сохранена без преобразования)':''; $('sportsDiaryNotes').value = session.log.notes || '';
    $('sportsDiaryHistory').innerHTML = session.logHistory.map(entry => `<p class="small muted">${pretty(entry.date)} · ${esc(entry.at)} · сложность ${entry.log.feedback?.overallDifficulty != null ? entry.log.feedback.overallDifficulty+' / 5' : entry.log.difficulty != null ? entry.log.difficulty+' / 10 (прежняя)' : '—'} · ${entry.completedExercises.length} упражнений${entry.log.feedback?' · энергия '+(entry.log.feedback.energy??'—')+'/5 · сон '+esc(({good:'хороший',average:'средний',poor:'плохой'})[entry.log.feedback.sleep]||'не указан')+' · боль '+(entry.log.feedback.pain?'отмечена':'не отмечена'):''}<br>${Object.entries(entry.log.exercises).map(([id,result]) => `${esc(session.workoutSnapshot.exercises.find(exercise => exercise.id === id)?.name || id)}: ${result.sets ?? '—'} / ${result.reps ?? '—'} / ${result.durationSeconds ?? '—'} с${result.difficulty!=null?' · сложность '+result.difficulty+'/5':''}${result.technique?' · техника '+(result.technique==='good'?'уверенная':'нарушается'):''}`).join(' · ')}</p>`).join('') || '<p class="organization-empty">Записей ещё нет.</p>';
    $('sportsDiaryHistory').innerHTML += session.moves.map(move => `<p class="small muted">Перенос: ${pretty(move.from)} → ${pretty(move.to)}${move.warning ? ' · ' + esc(move.warning) : ''}</p>`).join('');
    $('sportsDiaryUndo').disabled = !isDone(getData(), session.taskId, session.date);
    adaptation.render(id);
    updateDiaryButton(); if (!$('sportsDiaryDialog').open) $('sportsDiaryDialog').showModal();
  }
  function exerciseTime(seconds) {
    const mins = Math.floor(seconds / 60), secs = seconds % 60;
    return `${mins ? mins + ' мин' : ''}${mins && secs ? ' ' : ''}${secs ? secs + ' с' : ''}`;
  }
  function openWorkout(id) {
    const data = getData(), session = data.sports.sessions.find(item => item.id === id);
    if (!session) { toast('Занятие не найдено'); return; }
    diaryId = id;
    const task = data.tasks.find(item => item.id === session.taskId);
    const objective = data.objectives.find(item => item.id === session.workoutSnapshot.objectiveId) || data.objectives.find(item => item.id === task?.objectiveId);
    const stage = data.stages.find(item => item.id === session.workoutSnapshot.stageId) || data.stages.find(item => item.id === task?.stageId);
    const done = isDone(data, session.taskId, session.date);
    $('workoutQuickDate').textContent = pretty(session.date);
    $('workoutQuickTitle').textContent = session.workoutSnapshot.name;
    $('workoutQuickMeta').textContent = [objective?.name, stage?.name, `${session.workoutSnapshot.durationMinutes} минут`, ({light:'Лёгкая',medium:'Умеренная',high:'Интенсивная'})[session.workoutSnapshot.intensity]].filter(Boolean).join(' · ');
    $('workoutQuickXp').textContent = `+${Number(task?.xp) || 0} XP`;
    $('workoutQuickExercises').innerHTML = session.workoutSnapshot.exercises.map(exercise => {
      const time = exercise.durationSeconds == null ? '' : exerciseTime(exercise.durationSeconds);
      const prescription = `${exercise.sets} ${exercise.sets === 1 ? 'подход' : 'подхода'}${exercise.reps != null ? ` × ${exercise.reps} повторений` : ''}${time ? ` · ${time}` : ''}`;
      return `<article class="workout-quick-exercise"><label><input type="checkbox" data-quick-exercise="${esc(exercise.id)}" ${subtaskDone(data, session.taskId, session.date, exercise.id) ? 'checked' : ''} ${exercise.required === false ? '' : 'data-quick-required="true"'}><span><strong>${esc(exercise.name)}</strong><small>${esc(prescription)}</small></span></label>${exercise.recommendations ? `<details><summary>Техника и рекомендации</summary><p>${esc(exercise.recommendations)}</p></details>` : ''}</article>`;
    }).join('') + (session.workoutSnapshot.recommendations ? `<details class="workout-quick-recommendations"><summary>Общие рекомендации</summary><p>${esc(session.workoutSnapshot.recommendations)}</p></details>` : '');
    $('workoutQuickComplete').textContent = done ? 'Занятие выполнено' : 'Завершить занятие';
    $('workoutQuickComplete').disabled = done;
    updateQuickWorkout();
    $('workoutQuickDialog').showModal();
  }
  function updateQuickWorkout() {
    const session = getData().sports.sessions.find(item => item.id === diaryId);
    if (!session) return;
    const checked = [...$('workoutQuickExercises').querySelectorAll('[data-quick-exercise]:checked')].map(input => input.dataset.quickExercise);
    const required = session.workoutSnapshot.exercises.filter(exercise => exercise.required !== false);
    const done = isDone(getData(), session.taskId, session.date);
    $('workoutQuickProgressText').textContent = `${checked.length}/${session.workoutSnapshot.exercises.length} упражнений · ${done ? 'Выполнено' : 'В процессе'}`;
    $('workoutQuickProgress').style.width = `${session.workoutSnapshot.exercises.length ? checked.length / session.workoutSnapshot.exercises.length * 100 : 0}%`;
    $('workoutQuickComplete').disabled = done;
    if (done) $('workoutQuickComplete').textContent = 'Занятие выполнено';
  }
  function updateDiaryButton() {
    const session = getData().sports.sessions.find(item => item.id === diaryId);
    if (!session) return;
    const checked = [...$('sportsDiaryExercises').querySelectorAll('[data-diary-exercise]:checked')].map(input => input.dataset.diaryExercise);
    $('sportsDiaryComplete').disabled = !session.workoutSnapshot.exercises.filter(exercise => exercise.required !== false).every(exercise => checked.includes(exercise.id));
  }
  function persistDiary() {
    const session = getData().sports.sessions.find(item=>item.id===diaryId);
    const exercises = structuredClone(session.log.exercises);
    $('sportsDiaryExercises').querySelectorAll('[data-actual-exercise]').forEach(control => {
      exercises[control.dataset.actualExercise] ||= {}; exercises[control.dataset.actualExercise][control.dataset.actualField] = control.value === '' ? null : Number(control.value);
    });
    $('sportsDiaryExercises').querySelectorAll('[data-exercise-rating]').forEach(control=>{exercises[control.dataset.exerciseRating] ||= {}; exercises[control.dataset.exerciseRating].difficulty=control.value===''?null:Number(control.value);});
    $('sportsDiaryExercises').querySelectorAll('[data-exercise-technique]').forEach(control=>{exercises[control.dataset.exerciseTechnique] ||= {}; exercises[control.dataset.exerciseTechnique].technique=control.value||null;});
    const completed = [...$('sportsDiaryExercises').querySelectorAll('[data-diary-exercise]:checked')].map(control => control.dataset.diaryExercise);
    saveDiary(getData(), diaryId, { ...session.log, exercises, difficulty: session.log.difficulty ?? null, feedback:{overallDifficulty:$('sportsDifficulty').value===''?null:Number($('sportsDifficulty').value),energy:$('sportsEnergy').value===''?null:Number($('sportsEnergy').value),sleep:$('sportsSleep').value||null,pain:$('sportsPain').checked}, notes: $('sportsDiaryNotes').value.trim() }, completed);
  }
  function showPreview(value) {
    preview = value;
    $('sportsPlanPreview').innerHTML = `<p class="muted small">Добавится занятий: ${preview.entries.length}${preview.unplaced.length ? ' · Не удалось разместить: ' + esc(preview.unplaced.join(', ')) : ''}</p>${preview.entries.map(entry => `<div class="sports-session-row"><strong>${pretty(entry.date)}</strong><span>${esc(entry.name)} · ${intensities[entry.intensity]}</span></div>`).join('')}${(preview.warnings||[]).map(warning=>`<p class="notice">${esc(warning)}</p>`).join('')}${preview.unplacedDetails?.length?`<details class="sports-template-details" open><summary>Почему занятия не помещаются</summary>${preview.unplacedDetails.map(item=>`<p class="small"><strong>${esc(item.name)}</strong><br>${item.reasons.map(r=>esc(r.reason)).join('<br>')}</p>`).join('')}<p class="notice">${esc(preview.periodAdvice)}</p></details>`:''}${preview.retakeDate ? `<p class="small">Продление: ${pretty(preview.startDate)} — ${pretty(preview.endDate)}. Повторное испытание: ${pretty(preview.retakeDate)}.</p>` : ''}<p class="muted small">Уже существующие задания не меняются. Повторное сохранение не добавит те же занятия.</p>`;
    $('sportsApplyPlan').disabled = !preview.entries.length && !preview.retakeDate;
  }
  $('sportsNewProgram').addEventListener('click', () => openEditor());
  $('sportsImportProgram').addEventListener('click', () => $('sportsProgramFile').click());
  ['sportsProgram','sportsImport'].forEach(prefix => $(prefix + 'Goal').addEventListener('change', () => bindingStages(prefix)));
  $('sportsProgramFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      importDraft = parseProgramJSON(await file.text());
      const existing = getData().sports.programs.find(item => item.id === importDraft.id);
      binding('sportsImport',existing?.objectiveId,existing?.stageId);
      $('sportsImportPreview').innerHTML = `<h3>${esc(importDraft.name)}</h3><p class="muted small">${esc(importDraft.description || '')} · минимум ${importDraft.minDurationDays} дней</p>${definitionHtml(importDraft)}${importDraft.exam ? `<p class="small">Экзамен: ${esc(importDraft.exam.name)} · ${importDraft.exam.criteria.map(criterion => `${esc(criterion.name)} ${criterion.operator === 'gte' ? '≥' : '≤'} ${criterion.target} ${esc(criterion.unit)}`).join(' · ')}</p>` : ''}`;
      $('sportsImportConfirm').textContent = existing ? 'Обновить программу (занятия не меняются)' : 'Импортировать программу';
      $('sportsImportDialog').showModal();
    } catch(error) { toast(error.message); }
    event.target.value = '';
  });
  $('sportsImportForm').addEventListener('submit', event => { event.preventDefault(); run(() => { const program = saveProgram(getData(),importDraft,$('sportsImportGoal').value,$('sportsImportStage').value); selectedId = program.id; $('sportsProgramFilter').value = program.archivedAt ? 'archive' : 'active'; commit(); $('sportsImportDialog').close(); toast('Программа импортирована'); }); });
  $('sportsHasExam').addEventListener('change', () => { draft.exam ||= { name: '', criteria: [] }; renderDraft(); });
  $('sportsAddWorkout').addEventListener('click', () => { draft.workouts.push({ id:newSportsId(),name:'',intensity:'light',durationMinutes:20,repeatCount:1,xp:20,exercises:[],recommendations:'' }); renderDraft(); });
  $('sportsAddCriterion').addEventListener('click', () => { draft.exam ||= { name:'',criteria:[] }; draft.exam.criteria.push({id:newSportsId(),name:'',unit:'',operator:'gte',target:0}); renderDraft(); });
  $('sportsProgramForm').addEventListener('input', event => {
    const control = event.target; if (!control.dataset.field) return;
    let target = control.dataset.criterionIndex !== undefined ? draft.exam.criteria[Number(control.dataset.criterionIndex)] : draft.workouts[Number(control.dataset.workoutIndex)];
    if (control.dataset.exerciseIndex !== undefined) target = target.exercises[Number(control.dataset.exerciseIndex)];
    target[control.dataset.field] = control.type === 'checkbox' ? control.checked : control.type === 'number' ? control.value === '' ? null : Number(control.value) : control.value;
  });
  $('sportsProgramForm').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.addExercise !== undefined) draft.workouts[Number(button.dataset.addExercise)].exercises.push({id:newSportsId(),name:'',sets:1,reps:null,durationSeconds:null,restSeconds:0,required:true,recommendations:''});
    else if (button.dataset.removeExercise) {const [w,e]=button.dataset.removeExercise.split(':').map(Number); draft.workouts[w].exercises.splice(e,1);}
    else if (button.dataset.removeWorkout !== undefined) draft.workouts.splice(Number(button.dataset.removeWorkout),1);
    else if (button.dataset.removeCriterion !== undefined) draft.exam.criteria.splice(Number(button.dataset.removeCriterion),1);
    else return;
    renderDraft();
  });
  $('sportsProgramForm').addEventListener('submit', event => { event.preventDefault(); run(() => {
    draft.name = $('sportsProgramName').value.trim(); draft.description = $('sportsProgramDescription').value.trim(); draft.minDurationDays = Number($('sportsMinDays').value); draft.minGapDays = Number($('sportsGapDays').value);
    if ($('sportsHasExam').checked) { draft.exam ||= { criteria:[] }; draft.exam.name = $('sportsExamName').value.trim(); } else draft.exam = null;
    const program = saveProgram(getData(),draft,$('sportsProgramGoal').value,$('sportsProgramStage').value); selectedId = program.id; $('sportsProgramFilter').value = program.archivedAt ? 'archive' : 'active'; commit(); $('sportsProgramDialog').close(); toast('Программа сохранена');
  }); });
  $('sportsPlanForm').addEventListener('submit', event => { event.preventDefault(); run(() => showPreview(previewPlan(getData(),selectedId,$('sportsPlanStart').value,Number($('sportsPlanHorizon').value)))); });
  $('sportsApplyPlan').addEventListener('click', () => run(() => { const count = preview.retakeDate ? applyExtension(getData(),preview) : applyPlan(getData(),preview); commit(); $('sportsPlanDialog').close(); toast(`Добавлено занятий: ${count}`); }));
  $('sportsMoveForm').addEventListener('submit', event => { event.preventDefault(); run(() => { moveSession(getData(),moveId,$('sportsMoveDate').value,$('sportsMoveWarning').checked); commit(); $('sportsMoveDialog').close(); toast('Занятие перенесено'); }); });
  $('sportsDiaryForm').addEventListener('input',()=>{ $('sportsRecommendations').innerHTML='<p class="notice">Сохрани дневник, чтобы пересчитать рекомендации по новым оценкам.</p>'; });
  $('sportsDiaryForm').addEventListener('change',()=>{ $('sportsRecommendations').innerHTML='<p class="notice">Сохрани дневник, чтобы пересчитать рекомендации по новым оценкам.</p>'; });
  $('sportsPain').addEventListener('change',()=> $('sportsPainAdvice').classList.toggle('hidden',!$('sportsPain').checked));
  $('sportsDiaryExercises').addEventListener('change', updateDiaryButton);
  $('workoutQuickExercises').addEventListener('click', event => {
    if (!event.target.closest('[data-quick-exercise]')) return;
    setTimeout(updateQuickWorkout, 0);
  });
  function persistQuickChecks(session, completed) {
    for (const exercise of session.workoutSnapshot.exercises) toggleSubtask(getData(), session.taskId, session.date, exercise.id, completed.includes(exercise.id));
    commit();
  }
  $('workoutOpenDiary').addEventListener('click', () => {
    const id = diaryId, session = getData().sports.sessions.find(item => item.id === id);
    const checked = [...$('workoutQuickExercises').querySelectorAll('[data-quick-exercise]:checked')].map(input => input.dataset.quickExercise);
    if (session) persistQuickChecks(session, checked);
    $('workoutQuickDialog').close(); openDiary(id);
  });
  $('workoutQuickComplete').addEventListener('click', () => run(() => {
    const session = getData().sports.sessions.find(item => item.id === diaryId);
    const completed = [...$('workoutQuickExercises').querySelectorAll('[data-quick-exercise]:checked')].map(input => input.dataset.quickExercise);
    if (!session.workoutSnapshot.exercises.filter(exercise => exercise.required !== false).every(exercise => completed.includes(exercise.id))) throw new Error('Отметь обязательные упражнения');
    saveDiary(getData(), diaryId, structuredClone(session.log), completed);
    if (!toggleCompletion(getData(), session.taskId, session.date, true)) throw new Error('Отметь обязательные упражнения');
    commit(); openWorkout(diaryId); toast('Тренировка завершена · XP начислен');
  }));
  $('sportsDiaryForm').addEventListener('submit', event => { event.preventDefault(); run(() => { persistDiary(); commit(); const session=getData().sports.sessions.find(s=>s.id===diaryId); if(isDone(getData(),session.taskId,session.date)) openDiary(diaryId); else $('sportsDiaryDialog').close(); toast('Дневник сохранён'); }); });
  $('sportsDiaryComplete').addEventListener('click', () => run(() => { persistDiary(); const session = getData().sports.sessions.find(item => item.id === diaryId); if (!toggleCompletion(getData(),session.taskId,session.date,true)) throw new Error('Отметь обязательные упражнения'); commit(); openDiary(diaryId); toast('Тренировка завершена · рекомендации готовы'); }));
  $('sportsDiaryUndo').addEventListener('click', () => run(() => { const session = getData().sports.sessions.find(item => item.id === diaryId); toggleCompletion(getData(),session.taskId,session.date,false); commit(); $('sportsDiaryDialog').close(); toast('Завершение отменено'); }));
  $('sportsExamForm').addEventListener('submit', event => { event.preventDefault(); run(() => { const results={}; $('sportsExamResults').querySelectorAll('[data-criterion-result]').forEach(control => { results[control.dataset.criterionResult] = control.value === '' ? null : Number(control.value); }); const attempt = recordExam(getData(),attemptId,results,$('sportsExamAttemptDate').value); commit(); $('sportsExamDialog').close(); toast(examNames[attempt.status]); }); });
  document.addEventListener('submit', event => {
    if (event.target.id === 'scheduleExamForm') {event.preventDefault(); run(() => { scheduleExam(getData(),selectedId,$('sportsExamDate').value); commit(); toast('Испытание назначено'); });}
  });
  document.addEventListener('click', event => {
    document.querySelectorAll('.sports-program-menu[open]').forEach(menu => { if(!menu.contains(event.target) || event.target.closest('button')) menu.open=false; });
    const button=event.target.closest('button'); if(!button)return;
    run(() => {
      const data=getData();
      if(button.id==='backSports'){selectedId=null;render();}
      if(button.dataset.sportsProgram){selectedId=button.dataset.sportsProgram;render();}
      if(button.dataset.archiveProgram || button.dataset.deleteProgram)openLifecycle(button.dataset.archiveProgram || button.dataset.deleteProgram);
      if(button.dataset.restoreProgram){restoreProgram(data,button.dataset.restoreProgram);selectedId=null;$('sportsProgramFilter').value='active';commit();toast('Программа возвращена в активные');}
      if(button.dataset.editProgram)openEditor(button.dataset.editProgram);
      if(button.dataset.sportsObjective)openObjective(button.dataset.sportsObjective);
      if(button.dataset.openSession)openDiary(button.dataset.openSession);
      if(button.dataset.exportProgram){const program=data.sports.programs.find(item=>item.id===button.dataset.exportProgram);const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([exportProgramJSON(program)],{type:'application/json'}));link.download='workout-program-'+program.id+'.json';link.click();URL.revokeObjectURL(link.href);}
      if(button.dataset.planProgram){selectedId=button.dataset.planProgram;preview=null;$('sportsPlanForm').classList.remove('hidden');$('sportsPlanStart').value=today();$('sportsPlanHorizon').value=90;$('sportsPlanPreview').innerHTML='';$('sportsApplyPlan').disabled=true;$('sportsPlanDialog').showModal();}
      if(button.dataset.extendProgram){selectedId=button.dataset.extendProgram;$('sportsPlanForm').classList.add('hidden');showPreview(previewExtension(data,selectedId));$('sportsPlanDialog').showModal();}
      if(button.dataset.moveSession){moveId=button.dataset.moveSession;$('sportsMoveDate').value=data.sports.sessions.find(item=>item.id===moveId).date;$('sportsMoveWarning').checked=false;$('sportsMoveDialog').showModal();}
      if(button.dataset.examAttempt){attemptId=button.dataset.examAttempt;const attempt=data.sports.examAttempts.find(item=>item.id===attemptId);$('sportsExamTitle').textContent='Результаты · '+pretty(attempt.date);$('sportsExamAttemptDate').value=attempt.date;$('sportsExamResults').innerHTML=attempt.criteriaSnapshot.map(criterion=>`<label class="sports-field"><span>${esc(criterion.name)} · норматив ${criterion.operator==='gte'?'≥':'≤'} ${criterion.target} ${esc(criterion.unit)}</span><input type="number" min="0" max="1000000" step="any" required data-criterion-result="${esc(criterion.id)}"></label>`).join('');$('sportsExamDialog').showModal();}
      if(button.dataset.finishSportStage){const next=finishSportsStage(data,button.dataset.finishSportStage);commit();toast(next?'Этап завершён. Следующий: '+next.name:'Этап завершён');}
    });
  });
  document.addEventListener('keydown', event => { if(event.key==='Escape') document.querySelectorAll('.sports-program-menu[open]').forEach(menu => { menu.open=false; }); });
  return {render,openDiary,openWorkout};
}
