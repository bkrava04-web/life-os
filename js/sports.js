import { validateFeedback } from './sports-feedback.js?v=stage9.3.3';
import { validDate, shiftDate, daySchedule, overnightCarry } from './schedule.js?v=stage9.3.3';
export const PROGRAM_FORMAT = 'life-os-workout-program';
export const PROGRAM_VERSION = 1;
export const newSportsId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, name, max = 5000) => { if (typeof value !== 'string' || value.length > max) throw new Error(`${name}: ожидается текст до ${max} символов`); return value; };
const id = value => { if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value) || (value in Object.prototype || value === 'prototype')) throw new Error('Некорректный ID'); return value; };
const number = (value, name, min, max, integer = false) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${name}: число ${min}–${max}`); return value; };
function unique(items, name) { if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`Повторяющиеся ID: ${name}`); }
export function validateProgram(program) {
  if (!record(program)) throw new Error('Ожидается объект program');
  id(program.id); if (!text(program.name, 'Название', 150).trim()) throw new Error('Укажи название программы');
  text(program.description ?? '', 'Описание'); number(program.minDurationDays, 'Минимальная продолжительность в днях', 1, 365, true);
  number(program.minGapDays ?? 1, 'Интервал между занятиями', 1, 14, true);
  if (!Array.isArray(program.workouts) || !program.workouts.length || program.workouts.length > 50) throw new Error('Нужно 1–50 тренировок');
  unique(program.workouts, 'тренировки');
  for (const workout of program.workouts) {
    if (!record(workout)) throw new Error('Некорректная тренировка');
    id(workout.id); if (!text(workout.name, 'Название тренировки', 150).trim()) throw new Error('Укажи название тренировки');
    if (!['light','medium','high'].includes(workout.intensity)) throw new Error('Интенсивность: light, medium, high');
    number(workout.durationMinutes, 'Минуты тренировки', 1, 1440, true); number(workout.repeatCount, 'Число занятий', 1, 100, true); number(workout.xp, 'XP', 1, 500, true);
    text(workout.recommendations ?? '', 'Рекомендации');
    if (workout.suitableDayTypes !== undefined && (!Array.isArray(workout.suitableDayTypes) || workout.suitableDayTypes.some(kind => !['day','night','off','recovery'].includes(kind)))) throw new Error('Некорректные типы дней');
    if (!Array.isArray(workout.exercises) || !workout.exercises.length || workout.exercises.length > 100) throw new Error('Нужно 1–100 упражнений');
    unique(workout.exercises, 'упражнения');
    for (const exercise of workout.exercises) {
      if (!record(exercise)) throw new Error('Некорректное упражнение');
      id(exercise.id); if (!text(exercise.name, 'Название упражнения', 200).trim()) throw new Error('Укажи название упражнения');
      number(exercise.sets, 'Подходы', 1, 100, true);
      if (exercise.reps != null) number(exercise.reps, 'Повторения', 1, 10000, true);
      if (exercise.durationSeconds != null) number(exercise.durationSeconds, 'Длительность упражнения', 1, 86400, true);
      if (exercise.reps == null && exercise.durationSeconds == null) throw new Error('Укажи повторения или длительность упражнения');
      number(exercise.restSeconds ?? 0, 'Отдых', 0, 3600, true); text(exercise.recommendations ?? '', 'Рекомендации упражнения');
      if (exercise.required !== undefined && typeof exercise.required !== 'boolean') throw new Error('required должен быть boolean');
    }
  }
  if (program.workouts.reduce((sum, workout) => sum + workout.repeatCount, 0) > 500) throw new Error('Не больше 500 занятий в программе');
  if (program.exam != null) {
    if (!record(program.exam) || !text(program.exam.name, 'Название экзамена', 150).trim()) throw new Error('Некорректный экзамен');
    if (!Array.isArray(program.exam.criteria) || !program.exam.criteria.length || program.exam.criteria.length > 30) throw new Error('Нужно 1–30 нормативов');
    unique(program.exam.criteria, 'нормативы');
    for (const criterion of program.exam.criteria) {
      id(criterion.id); if (!text(criterion.name, 'Норматив', 200).trim()) throw new Error('Укажи норматив');
      text(criterion.unit, 'Единицы', 30);
      if (!['gte','lte'].includes(criterion.operator)) throw new Error('Сравнение: gte или lte');
      number(criterion.target, 'Целевой результат', 0, 1000000);
    }
  }
  return program;
}
export function programDefinition(program) {
  return { id: program.id, name: program.name, description: program.description || '', minDurationDays: program.minDurationDays, minGapDays: program.minGapDays || 1, workouts: structuredClone(program.workouts), exam: program.exam ? structuredClone(program.exam) : null };
}
export function parseProgramJSON(source) {
  const value = JSON.parse(source);
  if (!record(value) || value.format !== PROGRAM_FORMAT || value.version !== PROGRAM_VERSION) throw new Error('Нужен формат life-os-workout-program, version: 1');
  return programDefinition(validateProgram(value.program));
}
export function exportProgramJSON(program) { return JSON.stringify({ format: PROGRAM_FORMAT, version: PROGRAM_VERSION, program: programDefinition(program) }, null, 2); }
export function ensureSports(data) { data.sports ||= { version: 1, programs: [], sessions: [], examAttempts: [], extensions: [] }; return data; }
function validateLog(log) {
  if (!record(log) || !record(log.exercises) || typeof log.notes !== 'string' || log.notes.length > 5000) throw new Error('Invalid diary log');
  validateFeedback(log);
  if (log.difficulty != null) number(log.difficulty, 'Difficulty', 1, 10);
  for (const [exerciseId, result] of Object.entries(log.exercises)) {
    id(exerciseId); if (!record(result)) throw new Error('Invalid actual exercise results');
    for (const field of ['sets','reps','durationSeconds']) if (result[field] != null) number(result[field], 'Actual result', 0, 100000, true);
  }
}
export function validateSports(sports) {
  if (sports === undefined) return;
  if (!record(sports) || sports.version !== 1) throw new Error('Некорректная версия спортивной базы');
  for (const key of ['programs','sessions','examAttempts','extensions']) {
    if (!Array.isArray(sports[key])) throw new Error(`Некорректная коллекция sports.${key}`);
    for (const item of sports[key]) { if (!record(item)) throw new Error('Некорректная спортивная запись'); id(item.id); }
    unique(sports[key], key);
  }
  for (const program of sports.programs) {
    validateProgram(program);
    if (program.archivedAt != null && (typeof program.archivedAt !== 'string' || !Number.isFinite(Date.parse(program.archivedAt)))) throw new Error('Некорректная дата архива программы');
    for (const link of [program.objectiveId, program.stageId]) if (typeof link !== 'string' || !link || ['__proto__','constructor','prototype'].includes(link)) throw new Error('Invalid sports binding');
    if (!Number.isInteger(program.revision) || program.revision < 1 || !Array.isArray(program.revisions) || (program.startDate != null && !validDate(program.startDate))) throw new Error('Invalid program history');
  }
  const keys = new Set();
  for (const session of sports.sessions) {
    id(session.taskId); id(session.programId); if (!validDate(session.date) || !record(session.workoutSnapshot)) throw new Error('Некорректная история тренировки');
    const temp = { id: 'validation', name: 'validation', minDurationDays: 1, workouts: [session.workoutSnapshot] }; validateProgram(temp);
    if (typeof session.planKey !== 'string' || keys.has(session.planKey)) throw new Error('Дубликат запланированного занятия'); keys.add(session.planKey);
    if (!Array.isArray(session.logHistory) || !Array.isArray(session.moves) || !record(session.log) || !record(session.log.exercises) || typeof session.log.notes !== 'string') throw new Error('Некорректный дневник');
    validateLog(session.log);
    if (session.adaptations !== undefined) {
      if (!Array.isArray(session.adaptations)) throw new Error('Некорректная история адаптации');
      for (const entry of session.adaptations) {
        id(entry.id); id(entry.sourceSessionId);
        if (!['user','recommendation'].includes(entry.source) || typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 5000 || !Number.isFinite(Date.parse(entry.at)) || (entry.undoneAt != null && !Number.isFinite(Date.parse(entry.undoneAt)))) throw new Error('Некорректная запись адаптации');
        for (const snapshot of [entry.before,entry.after]) validateProgram({id:'validation',name:'validation',minDurationDays:1,workouts:[snapshot]});
      }
    }
    for (const entry of session.logHistory) {
      if (!record(entry) || !validDate(entry.date) || !Array.isArray(entry.completedExercises)) throw new Error('Invalid diary history');
      validateLog(entry.log); entry.completedExercises.forEach(id);
      if(entry.planSnapshot) validateProgram({id:'validation',name:'validation',minDurationDays:1,workouts:[entry.planSnapshot]});
    }
    for (const move of session.moves) if (!record(move) || !validDate(move.from) || !validDate(move.to)) throw new Error('Invalid move history');
  }
  for (const attempt of sports.examAttempts) {
    if (!validDate(attempt.date) || !['scheduled','passed','failed'].includes(attempt.status) || !Array.isArray(attempt.criteriaSnapshot) || !attempt.criteriaSnapshot.length || attempt.criteriaSnapshot.length > 30 || !record(attempt.results)) throw new Error('Некорректный экзамен');
    unique(attempt.criteriaSnapshot, 'exam snapshot');
    id(attempt.programId);
    if (typeof attempt.stageId !== 'string' || !attempt.stageId || ['__proto__','constructor','prototype'].includes(attempt.stageId)) throw new Error('Invalid stage reference');
    for (const criterion of attempt.criteriaSnapshot) {
      id(criterion.id); text(criterion.name, 'Criterion', 200); text(criterion.unit, 'Unit', 30);
      if (!['gte','lte'].includes(criterion.operator)) throw new Error('Invalid criterion comparison');
      number(criterion.target, 'Target', 0, 1000000);
    }
    for (const value of Object.values(attempt.results)) number(value, 'Exam result', 0, 1000000);
  }
  for (const extension of sports.extensions) {
    id(extension.programId); id(extension.fromAttemptId);
    if (!validDate(extension.startDate) || !validDate(extension.endDate) || !validDate(extension.retakeDate) || shiftDate(extension.startDate, 6) !== extension.endDate || extension.retakeDate <= extension.endDate) throw new Error('Некорректное продление');
  }
}
export function boundPrograms(data, stageId) { return (data.sports?.programs || []).filter(program => program.stageId === stageId); }
export function latestAttempt(data, programId) {
  return [...(data.sports?.examAttempts || [])].reverse().find(attempt => attempt.programId === programId) || null;
}
export function stageExamStatus(data, stageId) {
  const programs = boundPrograms(data, stageId).filter(program => program.exam);
  if (!programs.length) return 'none';
  if (programs.every(program => latestAttempt(data, program.id)?.status === 'passed')) return 'passed';
  if (programs.some(program => latestAttempt(data, program.id)?.status === 'failed')) return 'failed';
  return 'pending';
}
export function programEnd(data, program) {
  if (!program.startDate) return null;
  const plannedEnd = (data.sports?.sessions || []).filter(session => session.programId === program.id).reduce((end, session) => session.date > end ? session.date : end, shiftDate(program.startDate, program.minDurationDays - 1));
  return (data.sports?.extensions || []).filter(extension => extension.programId === program.id)
    .reduce((end, extension) => extension.endDate > end ? extension.endDate : end, plannedEnd);
}
export function workoutSafety(data, workout, date) {
  const day = daySchedule(date, data.workSchedule);
  const suitable = workout.suitableDayTypes?.length ? workout.suitableDayTypes : workout.intensity === 'light' ? ['day','off','recovery'] : ['off'];
  if (!suitable.includes(day.kind)) return 'Не подходит тип рабочего дня';
  if (workout.intensity !== 'light' && day.kind !== 'off') return 'На сменах и восстановлении — только лёгкие занятия';
  if (workout.intensity !== 'light' && overnightCarry(date, data.workSchedule)) return 'После ночной — только лёгкое занятие';
  return null;
}
export function programProgress(data, programId) {
  const program = data.sports?.programs.find(program => program.id === programId);
  const sessions = (data.sports?.sessions || []).filter(session => session.programId === programId);
  const expected = new Set(sessions.map(session => session.planKey));
  for (const workout of program?.workouts || []) {
    for (let index = 0; index < workout.repeatCount; index++) expected.add(`${programId}:base:${workout.id}:${index}`);
  }
  const done = sessions.filter(session => !!data.checks[session.date]?.[session.taskId]).length;
  return { done, total: expected.size, scheduled: sessions.length, value: expected.size ? Math.round(done / expected.size * 100) : null };
}
export { shiftDate, validDate };
