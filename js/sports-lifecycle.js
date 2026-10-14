import { today } from './calendar.js?v=stage9.3.3';

// Lifecycle never awards XP or changes goals, stages, exercises or scheduled dates.
export function programRemovalPreview(data, programId, date = today()) {
  const program = data.sports.programs.find(item => item.id === programId);
  if (!program) throw new Error('Программа не найдена');
  const sessions = data.sports.sessions.filter(item => item.programId === programId);
  const sessionIds = new Set(sessions.map(item => item.id));
  const taskIds = new Set(sessions.map(item => item.taskId));
  const tasks = data.tasks.filter(task => taskIds.has(task.id) || sessionIds.has(task.workoutSessionId));
  tasks.forEach(task => taskIds.add(task.id));
  const exams = data.sports.examAttempts.filter(item => item.programId === programId);
  const extensions = data.sports.extensions.filter(item => item.programId === programId);
  const marked = ['checks','subtaskChecks','completionRewards'].some(field =>
    Object.values(data[field] || {}).some(entries => [...taskIds].some(id => {
      const value = entries[id];
      return field === 'checks' ? value === true : field === 'subtaskChecks' ? Object.values(value || {}).some(Boolean) : value != null;
    })));
  const results = sessions.some(session => session.logHistory.length || session.adaptations?.length || session.log.feedback || session.log.difficulty != null || session.log.notes.trim() ||
    Object.values(session.log.exercises).some(result => Object.values(result).some(value => value != null)));
  const ambiguous = data.sports.sessions.some(session => session.programId !== programId && taskIds.has(session.taskId)) ||
    tasks.some(task => task.workoutSessionId && !sessionIds.has(task.workoutSessionId));
  const past = sessions.some(session => session.date <= date) || tasks.some(task => task.frequency !== 'once' || !task.date || task.date <= date);
  const foreignOverride = Object.values(data.taskOverrides || {}).some(entries => Object.entries(entries).some(([id, task]) => sessionIds.has(task.workoutSessionId) && !taskIds.has(id)));
  const missingBinding = tasks.some(task => !sessionIds.has(task.workoutSessionId));
  const protectedHistory = marked || results || exams.length > 0 || extensions.length > 0 || ambiguous || past || foreignOverride || missingBinding;
  return { programId, sessions: sessions.length, tasks: tasks.length, exams: exams.length, extensions: extensions.length,
    taskIds: [...taskIds], sessionIds: [...sessionIds], canDelete: !protectedHistory,
    requiresFutureConsent: sessions.length > 0 || tasks.length > 0,
    reason: protectedHistory ? 'Есть результаты, отметки, XP, испытания, прошлые/сегодняшние занятия или связи, которые нужно сохранить. Доступно архивирование.' : '' };
}
export function deleteProgram(data, programId, { deleteFutureSessions = false, date = today() } = {}) {
  // Recheck at confirmation time, including marks created after the preview.
  const preview = programRemovalPreview(data, programId, date);
  if (!preview.canDelete) throw new Error(preview.reason);
  if (preview.requiresFutureConsent && !deleteFutureSessions) throw new Error('Подтверди отдельное удаление будущих занятий и их заданий');
  const ids = new Set(preview.taskIds), sessions = new Set(preview.sessionIds);
  data.tasks = data.tasks.filter(task => !ids.has(task.id));
  data.sports.sessions = data.sports.sessions.filter(session => !sessions.has(session.id));
  for (const field of ['checks','subtaskChecks','completionRewards','taskOverrides']) {
    for (const [date, entries] of Object.entries(data[field] || {})) {
      const affected = [...ids].some(id => Object.hasOwn(entries, id));
      if (!affected) continue;
      for (const id of ids) delete entries[id];
      if (!Object.keys(entries).length) delete data[field][date];
    }
  }
  data.sports.programs = data.sports.programs.filter(program => program.id !== programId);
  return preview;
}
export function archiveProgram(data, programId) {
  const program = data.sports.programs.find(item => item.id === programId);
  if (!program) throw new Error('Программа не найдена');
  program.archivedAt ||= new Date().toISOString();
  return program;
}
export function restoreProgram(data, programId) {
  const program = data.sports.programs.find(item => item.id === programId);
  if (!program) throw new Error('Программа не найдена');
  delete program.archivedAt;
  return program;
}
