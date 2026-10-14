import { categoryName, taskPath } from './organization.js?v=stage9.3.3';
import { esc, isDone, subtaskProgress, taskOnDate, tasksFor } from './tasks.js?v=stage9.3.3';
import { dateKey, parseDate, pretty, today } from './calendar.js?v=stage9.3.3';

const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3 };
export function shiftedDate(value, amount) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
function recordsFor(data, tab) {
  const sessions = new Map((data.sports?.sessions || []).map(session => [session.taskId, session]));
  const result = [];
  if (tab === 'completed') {
    for (const [date, entries] of Object.entries(data.checks || {})) for (const [id, done] of Object.entries(entries)) {
      if (!done) continue;
      const task = taskOnDate(data, id, date);
      if (task) result.push({ task, date, done: true, session: sessions.get(id), key: `${date}:${id}` });
    }
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }
  if (tab === 'today' || tab === 'week') {
    const days = tab === 'today' ? [today()] : Array.from({ length: 7 }, (_, index) => shiftedDate(today(), index));
    for (const date of days) for (const task of tasksFor(data, date)) result.push({ task, date, done: isDone(data, task.id, date), session: sessions.get(task.id), key: `${date}:${task.id}` });
    return result;
  }
  for (const task of data.tasks || []) {
    if (task.workoutSessionId) continue;
    const date = task.frequency === 'once' ? task.date : today();
    result.push({ task: taskOnDate(data, task.id, date) || task, date, done: isDone(data, task.id, date), session: null, key: `${date}:${task.id}`, series: task.frequency !== 'once' });
  }
  for (const session of data.sports?.sessions || []) {
    const task = taskOnDate(data, session.taskId, session.date);
    if (task) result.push({ task, date: session.date, done: isDone(data, task.id, session.date), session, key: `${session.date}:${task.id}` });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function taskEmoji(data, task, session = null) {
  const program = session && data.sports?.programs.find(item => item.id === session.programId);
  const category = data.categories?.find(item => item.id === task.categoryId);
  const workoutName = session?.workoutSnapshot ? `${session.workoutSnapshot.name} ${session.workoutSnapshot.id}` : '';
  const activity = `${workoutName} ${task.name} ${task.activityType || ''}`.toLocaleLowerCase('ru');
  const label = `${program?.name || ''} ${activity} ${category?.name || task.category || ''}`.toLocaleLowerCase('ru');
  if (/силов|подтяг|брусь|гантел|strength/.test(activity)) return '💪';
  if (/кардио|орбитрек|бег|велосипед|cardio|elliptical/.test(activity)) return '🏃';
  if (/мобиль|растяж|йога|mobility|stretch/.test(activity)) return '🧘';
  if (/футбол/.test(label)) return '⚽';
  if (/обуч|англий|курс|урок/.test(label)) return '📚';
  if (/работ|бизнес|проект/.test(label)) return '💼';
  if (/спорт/.test(label)) return '⚽';
  if (/здоров/.test(label)) return '💚';
  if (/личн/.test(label)) return '✨';
  return '◦';
}
function groupFor(data, record) {
  if (record.session) {
    const program = data.sports?.programs.find(item => item.id === record.session.programId);
    return program ? { id: `program:${program.id}`, name: program.name, icon: taskEmoji(data, record.task, record.session), kind: 'program', link: program.id } : { id: `objective:${record.task.objectiveId || 'none'}`, name: taskPath(data, record.task) || 'Связанные задачи', icon: taskEmoji(data, record.task), kind: 'objective', link: record.task.objectiveId };
  }
  if (record.task.objectiveId) {
    const objective = data.objectives?.find(item => item.id === record.task.objectiveId);
    if (objective) return { id: `objective:${objective.id}`, name: objective.name, icon: taskEmoji(data, record.task), kind: 'objective', link: objective.id };
  }
  return null;
}
function matches(data, record, filters) {
  const { task } = record;
  if (filters.category !== 'all' && task.categoryId !== filters.category) return false;
  if (filters.objective !== 'all' && task.objectiveId !== filters.objective) return false;
  if (filters.priority !== 'all' && (task.priority || 'normal') !== filters.priority) return false;
  return true;
}
function sessionProgress(data, record) {
  const session = record.session;
  const progress = subtaskProgress(data, record.task, record.date);
  return { session, progress, xp: Number(record.task.xp) || 0 };
}
function rowHtml(data, record, tab) {
  const { task, date, done, session, series } = record;
  const path = taskPath(data, task);
  const label = categoryName(data, task);
  const status = done ? 'Выполнено' : task.active === false ? 'Выключено' : series ? 'Повторяется' : 'Запланировано';
  const duration = task.duration ? ` · ${task.duration} мин` : '';
  const key = `${esc(date)}:${esc(task.id)}`;
  const control = session
    ? `<button class="task-open-button" data-open-workout="${esc(session.id)}">Открыть тренировку →</button>`
    : tab === 'completed'
      ? `<button class="task-open-button" data-edit-task="${esc(task.id)}" data-date="${esc(date)}">Открыть →</button>`
      : `<button class="task-open-button" data-edit-task="${esc(task.id)}" data-date="${esc(date)}">Открыть / изменить →</button>`;
  const check = tab !== 'all' && !session && task.type !== 'compound'
    ? `<input type="checkbox" data-check="${esc(task.id)}" data-date="${esc(date)}" ${done ? 'checked' : ''} aria-label="${done ? 'Отменить выполнение' : 'Выполнить'}: ${esc(task.name)}">`
    : '';
  return `<article class="task-manager-row ${done ? 'is-done' : ''}" data-record-key="${key}"><div class="task-manager-main">${check}<span class="task-manager-emoji" aria-hidden="true">${esc(taskEmoji(data, task, session))}</span><div class="task-manager-text"><strong>${esc(task.name)}</strong><span>${esc(path || label)}${duration} · ${status}${tab === 'week' || tab === 'completed' ? ` · ${pretty(date)}` : ''}</span></div><span class="xp">+${Number(task.xp) || 0} XP</span></div><div class="task-manager-actions">${control}<details class="task-manager-menu"><summary aria-label="Дополнительные действия" aria-haspopup="menu">⋯</summary><div class="task-manager-menu-panel" popover="auto" role="menu"><button role="menuitem" data-edit-task="${esc(task.id)}" data-date="${esc(date)}">Редактировать</button>${!session ? `<button role="menuitem" data-toggle-task="${esc(task.id)}">${task.active === false ? 'Включить' : 'Выключить'}</button><button role="menuitem" class="danger" data-delete-task="${esc(task.id)}">Удалить задачу</button>` : `<button role="menuitem" data-open-workout="${esc(session.id)}">Дневник и результаты</button>`}</div></details></div></article>`;
}
export function buildTaskManager(data, tab = 'today', filters = { category: 'all', objective: 'all', priority: 'all' }) {
  const records = recordsFor(data, tab).filter(record => matches(data, record, filters));
  const grouped = new Map(), standalone = [];
  for (const record of records) {
    const group = groupFor(data, record);
    if (!group) standalone.push(record);
    else {
      if (!grouped.has(group.id)) grouped.set(group.id, { ...group, records: [] });
      grouped.get(group.id).records.push(record);
    }
  }
  for (const group of grouped.values()) group.records.sort((a, b) => a.date.localeCompare(b.date));
  const sortedGroups = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const row = record => rowHtml(data, record, tab);
  const groupsHtml = sortedGroups.map(group => {
    const done = group.records.filter(record => record.done).length;
    const unit = group.kind === 'program' ? 'тренировок' : 'задач';
    return `<details class="task-manager-group"><summary><span class="task-manager-group-icon">${esc(group.icon)}</span><span class="task-manager-group-copy"><strong>${esc(group.name)}</strong><small>${group.records.length} ${unit} · ${done} выполнено</small></span><span class="task-manager-chevron" aria-hidden="true">⌄</span></summary><div class="task-manager-group-rows">${group.records.map(row).join('')}</div></details>`;
  }).join('');
  const standaloneHtml = standalone.length ? `<section class="task-manager-standalone"><h3>Без группы <span>${standalone.length}</span></h3>${standalone.map(row).join('')}</section>` : '';
  const done = records.filter(record => record.done).length;
  return { records, grouped: sortedGroups, html: records.length ? groupsHtml + standaloneHtml : '<div class="empty task-manager-empty">Для выбранного периода и фильтров заданий нет.</div>', summary: `${records.length} в списке · ${done} выполнено` };
}
export function calendarWorkoutHtml(data, task, date) {
  const session = data.sports?.sessions.find(item => item.id === task.workoutSessionId);
  if (!session) return '';
  const { progress } = sessionProgress(data, { task, date, session });
  const workout = session.workoutSnapshot;
  const type = taskEmoji(data, task, session);
  const label = /силов|strength/i.test(workout.name + ' ' + workout.id) ? 'Силовая' : /кардио|орбитрек|cardio/i.test(workout.name + ' ' + workout.id) ? 'Кардио' : /мобиль|растяж|mobility/i.test(workout.name + ' ' + workout.id) ? 'Мобильность' : 'Тренировка';
  const intensity = ({ light: 'Легко', medium: 'Умеренно', high: 'Интенсивно' })[workout.intensity] || '—';
  return `<article class="calendar-workout"><div class="calendar-workout-icon" aria-hidden="true">${type}</div><div class="calendar-workout-content"><strong>${esc(workout.name)}</strong><span>${label} · ${workout.durationMinutes} мин · ${intensity}</span><small>${progress.done}/${progress.total} упражнений · +${Number(task.xp) || 0} XP</small><div class="progress"><span style="width:${progress.total ? progress.done / progress.total * 100 : 0}%"></span></div></div><button class="task-open-button" data-open-workout="${esc(session.id)}">Открыть тренировку →</button></article>`;
}
export function calendarTaskHtml(data, task, date) {
  const done = isDone(data, task.id, date);
  const path = taskPath(data, task);
  const category = data.categories?.find(item => item.id === task.categoryId);
  const icon = taskEmoji(data, task);
  return `<article class="calendar-task-row ${done ? 'is-done' : ''}"><input type="checkbox" data-check="${esc(task.id)}" data-date="${esc(date)}" ${done ? 'checked' : ''} aria-label="Выполнено: ${esc(task.name)}"><span class="task-manager-emoji" aria-hidden="true">${esc(icon)}</span><div class="calendar-task-copy"><strong>${esc(task.name)}</strong><small>${esc(path || categoryName(data, task))}${task.duration ? ` · ${task.duration} мин` : ''}</small></div><button class="task-open-button" data-edit-task="${esc(task.id)}" data-date="${esc(date)}" aria-label="Открыть ${esc(task.name)}">Открыть →</button></article>`;
}
export function rankFocusTasks(data, records, date) {
  const focus = data.dayFocus?.[date] || [];
  return [...records].sort((a, b) => {
    const ai = focus.indexOf(a.id), bi = focus.indexOf(b.id);
    return Number(ai < 0) - Number(bi < 0) || (ai < 0 ? 0 : ai - bi)
      || (PRIORITY[a.priority] ?? PRIORITY.normal) - (PRIORITY[b.priority] ?? PRIORITY.normal)
      || Number(!(a.frequency === 'once' && a.date === date)) - Number(!(b.frequency === 'once' && b.date === date))
      || a.name.localeCompare(b.name, 'ru');
  });
}
