import { calculatePlan } from './sports-planner.js?v=stage9.3.3';
import { validateFeedback } from './sports-feedback.js?v=stage9.3.3';
import { ensureSports, validateProgram, programDefinition, newSportsId, workoutSafety, latestAttempt, programEnd, shiftDate, validDate, stageExamStatus } from './sports.js?v=stage9.3.3';
import { addTask, tasksFor, toggleSubtask, subtaskDone, isDone, toggleCompletion } from './tasks.js?v=stage9.3.3';
const stamp = () => new Date().toISOString();
export function saveProgram(data, definition, objectiveId, stageId) {
  ensureSports(data); validateProgram(definition);
  const objective = data.objectives.find(item => item.id === objectiveId && item.type === 'goal');
  const stage = data.stages.find(item => item.id === stageId && item.objectiveId === objectiveId);
  if (!objective || !stage) throw new Error('Выбери существующую цель и её этап');
  const previous = data.sports.programs.find(item => item.id === definition.id);
  if (previous && data.sports.sessions.some(session => session.programId === previous.id) && (previous.stageId !== stageId || previous.objectiveId !== objectiveId)) throw new Error('У программы есть занятия: привязку нельзя менять. Создай программу с новым ID.');
  const program = previous || { id: definition.id, startDate: null, revisions: [] };
  if (previous) program.revisions.push({ at: stamp(), definition: programDefinition(previous) });
  Object.assign(program, programDefinition(definition), { objectiveId, stageId, revision: (program.revision || 0) + 1 });
  if (!previous) data.sports.programs.push(program);
  return program;
}
function sportingTask(task) { return !!task.workoutSessionId || task.activityType === 'Спорт' || task.category === 'Спорт'; }
function occupied(data, date, ignoreTaskId = null) {
  return tasksFor(data, date).some(task => task.id !== ignoreTaskId && sportingTask(task));
}
function intenseNeighbor(data, date, ignoreTaskId = null) {
  return [shiftDate(date, -1), shiftDate(date, 1)].some(day => tasksFor(data, day).some(task => task.id !== ignoreTaskId && sportingTask(task) && task.intensity === 'high'));
}
const calculate = calculatePlan;
export function previewPlan(data, programId, startDate, horizonDays = 90) {
  ensureSports(data); const program = data.sports.programs.find(item => item.id === programId);
  if (!program) throw new Error('Программа не найдена');
  if (program.archivedAt) throw new Error('Программа в архиве. Сначала верни её в активные.');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) throw new Error('Период поиска: 1–365 дней');
  return calculate(data, program, startDate, shiftDate(startDate, horizonDays - 1), 'base');
}
function checkPreview(data, preview) {
  const program = data.sports.programs.find(item => item.id === preview.programId);
  if (program?.archivedAt) throw new Error('Программа в архиве. План не сохранён.');
  if (!program || program.revision !== preview.revision) throw new Error('Программа изменена. Пересоздай предварительный план.');
  if (!data.stages.some(stage => stage.id === program.stageId) || !data.objectives.some(objective => objective.id === program.objectiveId)) throw new Error('Цель или этап удалены');
  if (!Array.isArray(preview.entries) || new Set(preview.entries.map(entry=>entry.planKey)).size !== preview.entries.length) throw new Error('Дубликат в предварительном плане');
  const fresh = calculate(data, program, preview.startDate, preview.endDate, preview.run, {suggest:false});
  const remaining = preview.entries.filter(entry => !data.sports.sessions.some(session => session.planKey === entry.planKey));
  for (const entry of remaining) {
    if (!fresh.entries.some(item => item.planKey === entry.planKey && item.date === entry.date && item.workoutId === entry.workoutId)) throw new Error('График или занятые даты изменились. Пересоздай план.');
  }
  return { program, remaining };
}
function appendSessions(data, program, entries) {
  const objective = data.objectives.find(item => item.id === program.objectiveId);
  for (const entry of entries) {
    const workout = structuredClone(program.workouts.find(item => item.id === entry.workoutId));
    const sessionId = newSportsId();
    const task = addTask(data, { name: workout.name, description: workout.recommendations || program.description || '', type: 'compound', frequency: 'once', date: entry.date, category: data.categories.find(category => category.id === objective.categoryId)?.name || '', categoryId: objective.categoryId, objectiveId: program.objectiveId, stageId: program.stageId, xp: workout.xp, activityType: 'Спорт', intensity: workout.intensity, duration: workout.durationMinutes, workoutSessionId: sessionId, subtasks: workout.exercises.map(exercise => ({ id: exercise.id, name: `${exercise.name} · ${exercise.sets} подходов${exercise.reps != null ? ' × ' + exercise.reps : ''}${exercise.durationSeconds != null ? ' · ' + exercise.durationSeconds + ' с' : ''}`, required: exercise.required !== false })) });
    data.sports.sessions.push({ id: sessionId, programId: program.id, programRevision: program.revision, workoutId: workout.id, workoutSnapshot: workout, taskId: task.id, planKey: entry.planKey, date: entry.date, log: { exercises: {}, difficulty: null, notes: '' }, logHistory: [], moves: [] });
  }
}
export function applyPlan(data, preview) {
  const { program, remaining } = checkPreview(data, preview);
  appendSessions(data, program, remaining);
  if (!program.startDate && remaining.length) program.startDate = preview.startDate;
  return remaining.length;
}
export function moveSession(data, sessionId, date, acceptWarning = false) {
  if (!validDate(date)) throw new Error('Выбери корректную дату');
  const session = data.sports.sessions.find(item => item.id === sessionId);
  const task = data.tasks.find(item => item.id === session?.taskId);
  if (!session || !task) throw new Error('Занятие не найдено');
  if (date === session.date) return;
  if (isDone(data, task.id, session.date)) throw new Error('Завершённое занятие нельзя переносить: история остаётся на фактической дате');
  if (occupied(data, date, task.id)) throw new Error('На этой дате уже есть тренировка');
  const warning = workoutSafety(data, session.workoutSnapshot, date) || (session.workoutSnapshot.intensity === 'high' && intenseNeighbor(data, date, task.id) ? 'Рядом уже запланирована интенсивная тренировка' : null);
  if (warning && !acceptWarning) throw new Error(warning + '. Для ручного переноса подтверди предупреждение.');
  const oldDate = session.date;
  for (const field of ['checks','subtaskChecks','completionRewards','taskOverrides']) {
    if (!data[field]?.[oldDate]?.[task.id]) continue;
    data[field][date] ||= {}; data[field][date][task.id] = data[field][oldDate][task.id];
    if (field === 'taskOverrides' && data[field][date][task.id].frequency === 'once') data[field][date][task.id].date = date;
    delete data[field][oldDate][task.id];
    if (!Object.keys(data[field][oldDate]).length) delete data[field][oldDate];
  }
  task.date = date; session.date = date;
  session.moves.push({ from: oldDate, to: date, at: stamp(), warning: warning || null });
}
export function saveDiary(data, sessionId, log, completedExercises) {
  const session = data.sports.sessions.find(item => item.id === sessionId);
  if (!session || !data.tasks.some(task => task.id === session.taskId)) throw new Error('Занятие удалено');
  validateFeedback(log);
  if (log.difficulty != null && (!Number.isFinite(log.difficulty) || log.difficulty < 1 || log.difficulty > 10)) throw new Error('Сложность: 1–10');
  for (const exercise of session.workoutSnapshot.exercises) {
    const result = log.exercises[exercise.id] || {};
    for (const field of ['sets','reps','durationSeconds']) if (result[field] != null && (!Number.isFinite(result[field]) || result[field] < 0 || result[field] > 100000 || !Number.isInteger(result[field]))) throw new Error('Фактические показатели: целые неотрицательные числа');
  }
  session.log = structuredClone(log);
  for (const exercise of session.workoutSnapshot.exercises) toggleSubtask(data, session.taskId, session.date, exercise.id, completedExercises.includes(exercise.id));
  session.logHistory.push({ at: stamp(), date: session.date, log: structuredClone(log), planSnapshot: structuredClone(session.workoutSnapshot), completedExercises: [...completedExercises] });
}
export function scheduleExam(data, programId, date) {
  const program = data.sports.programs.find(item => item.id === programId), end = program && programEnd(data, program);
  if (program?.archivedAt) throw new Error('Программа в архиве. Новые испытания не назначаются.');
  if (!program?.exam || !end || !validDate(date) || date < end) throw new Error('Экзамен возможен после планирования программы и не раньше её минимального окончания');
  if (data.stages.find(stage => stage.id === program.stageId)?.status === 'completed') throw new Error('Этап уже завершён');
  if (data.sports.examAttempts.some(attempt => attempt.programId === programId && attempt.status === 'scheduled')) throw new Error('Уже есть назначенное испытание');
  const attempt = { id: newSportsId(), programId, stageId: program.stageId, date, status: 'scheduled', criteriaSnapshot: structuredClone(program.exam.criteria), results: {}, createdAt: stamp() };
  data.sports.examAttempts.push(attempt); return attempt;
}
export function recordExam(data, attemptId, results, date = null) {
  const attempt = data.sports.examAttempts.find(item => item.id === attemptId);
  if (!attempt || attempt.status !== 'scheduled') throw new Error('Результат сохранён. Для новой сдачи назначь отдельную попытку.');
  const program = data.sports.programs.find(item => item.id === attempt.programId);
  const actualDate = date || attempt.date;
  if (!validDate(actualDate) || actualDate < programEnd(data, program)) throw new Error('Дата испытания раньше актуального окончания программы');
  const values = {};
  for (const criterion of attempt.criteriaSnapshot) {
    const value = results[criterion.id];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new Error('Заполни все фактические результаты');
    values[criterion.id] = value;
  }
  if (actualDate !== attempt.date) { attempt.reschedules ||= []; attempt.reschedules.push({ from: attempt.date, to: actualDate, at: stamp() }); attempt.date = actualDate; }
  attempt.results = values;
  attempt.status = attempt.criteriaSnapshot.every(criterion => criterion.operator === 'gte' ? values[criterion.id] >= criterion.target : values[criterion.id] <= criterion.target) ? 'passed' : 'failed';
  attempt.recordedAt = stamp(); return attempt;
}
export function previewExtension(data, programId) {
  const program = data.sports.programs.find(item => item.id === programId), attempt = latestAttempt(data, programId);
  if (program?.archivedAt) throw new Error('Программа в архиве. Продление недоступно.');
  if (!program || attempt?.status !== 'failed') throw new Error('Продление доступно после несданного испытания');
  if (data.sports.extensions.some(extension => extension.fromAttemptId === attempt.id)) throw new Error('Эта попытка уже продлена');
  const end = programEnd(data, program);
  const startDate = shiftDate(attempt.date > end ? attempt.date : end, 1), endDate = shiftDate(startDate, 6);
  const preview = calculate(data, program, startDate, endDate, 'extension-' + attempt.id);
  let retakeDate = shiftDate(endDate, 1);
  for (let i = 0; i < 32; i++) {
    const day = dayScheduleForExam(data, retakeDate);
    if (day) break; retakeDate = shiftDate(retakeDate, 1);
  }
  if (!dayScheduleForExam(data, retakeDate)) throw new Error('Нет свободной подходящей даты для повторного испытания');
  return { ...preview, fromAttemptId: attempt.id, retakeDate };
}
function dayScheduleForExam(data, date) {
  // A control test is proposed on a free day, not immediately after a night.
  return !workoutSafety(data, { intensity: 'high', suitableDayTypes: ['off'] }, date) && !occupied(data, date);
}
export function applyExtension(data, preview) {
  if (data.sports.extensions.some(extension => extension.fromAttemptId === preview.fromAttemptId)) return 0;
  if (latestAttempt(data, preview.programId)?.id !== preview.fromAttemptId || latestAttempt(data, preview.programId)?.status !== 'failed') throw new Error('Состояние экзамена изменилось. Пересоздай продление.');
  const { program, remaining } = checkPreview(data, preview);
  if (!validDate(preview.retakeDate) || preview.retakeDate <= preview.endDate || !dayScheduleForExam(data, preview.retakeDate)) throw new Error('Дата повторного экзамена изменилась. Пересоздай продление.');
  appendSessions(data, program, remaining);
  data.sports.extensions.push({ id: newSportsId(), programId: program.id, fromAttemptId: preview.fromAttemptId, startDate: preview.startDate, endDate: preview.endDate, retakeDate: preview.retakeDate, createdAt: stamp() });
  scheduleExam(data, program.id, preview.retakeDate);
  return remaining.length;
}
export function finishSportsStage(data, programId) {
  const program = data.sports.programs.find(item => item.id === programId);
  if (!program) throw new Error('Программа не найдена');
  if (program.archivedAt) throw new Error('Программа в архиве. Сначала верни её в активные.');
  const stage = data.stages.find(item => item.id === program.stageId);
  if (!stage) throw new Error('Этап удалён');
  if (stageExamStatus(data, stage.id) !== 'none' && stageExamStatus(data, stage.id) !== 'passed') throw new Error('Сначала сдай все обязательные экзамены этого этапа');
  stage.status = 'completed';
  const siblings = data.stages.filter(item => item.objectiveId === stage.objectiveId);
  const next = siblings[siblings.indexOf(stage) + 1];
  if (next?.status === 'paused') next.status = 'active';
  return next || null;
}
