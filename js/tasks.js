import { categoryName, taskPath, achievementCategory } from './organization.js?v=stage9.3.3';
import { dateKey, parseDate, today } from './calendar.js?v=stage9.3.3';

export const uid = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12);
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function freqName(frequency) {
  return ({ once: 'на выбранную дату', daily: 'ежедневно', '3week': 'Пн / Ср / Пт', '2week': 'Пн / Чт', weekly: 'каждый понедельник' })[frequency] || 'по расписанию';
}
export function scheduled(task, date) {
  if (task.frequency === 'once') return task.date === date;
  if (task.frequency === 'daily') return true;
  const day = parseDate(date).getDay();
  if (task.frequency === '3week') return [1, 3, 5].includes(day);
  if (task.frequency === '2week') return [1, 4].includes(day);
  if (task.frequency === 'weekly') return day === 1;
  return true;
}
export function taskOnDate(data, id, date) {
  const base = data.tasks.find(task => task.id === id);
  if (!base) return null;
  return { ...base, ...(data.taskOverrides?.[date]?.[id] || {}), id: base.id };
}
export function tasksFor(data, date) {
  return data.tasks.filter(task => task.active !== false && scheduled(task, date))
    .map(task => taskOnDate(data, task.id, date));
}
export function isDone(data, id, date) { return !!data.checks[date]?.[id]; }
export function checkCount(data, date) { return Object.values(data.checks[date] || {}).filter(Boolean).length; }
export function allCheckEntries(data) {
  return Object.values(data.checks).reduce((sum, checks) => sum + Object.values(checks).filter(Boolean).length, 0);
}
export function completionCategory(data, id, date) {
  const task = taskOnDate(data, id, date);
  return data.completionRewards?.[date]?.[id]?.category ?? (task ? achievementCategory(data, task) : null);
}
export function totalXP(data) {
  let xp = 0;
  for (const [date, checks] of Object.entries(data.checks)) {
    for (const [id, done] of Object.entries(checks)) {
      const task = taskOnDate(data, id, date);
      if (done && task) xp += Number(data.completionRewards?.[date]?.[id]?.xp ?? task.xp) || 0;
    }
  }
  // Claimed achievement bonuses are part of the same XP total as task rewards.
  // Legacy claims carry rewardXP: 0 so a migration can never pay them twice.
  for (const entry of Object.values(data.achievementSystem?.entries || {})) {
    if (entry?.state === 'claimed') xp += Number(entry.rewardXP) || 0;
  }
  return xp;
}
export function levelInfo(data) {
  const xp = totalXP(data);
  return { xp, level: Math.floor(xp / 100) + 1, into: xp % 100, need: 100 - xp % 100 };
}
export function activeDates(data) { return Object.keys(data.checks).filter(date => checkCount(data, date) > 0).sort(); }
export function streak(data) {
  const dates = new Set(activeDates(data)), date = parseDate(today());
  let count = 0;
  if (!dates.has(dateKey(date))) {
    date.setDate(date.getDate() - 1);
    if (!dates.has(dateKey(date))) return 0;
  }
  while (dates.has(dateKey(date))) { count++; date.setDate(date.getDate() - 1); }
  return count;
}
export function subtaskDone(data, id, date, subId) { return !!data.subtaskChecks?.[date]?.[id]?.[subId]; }
export function subtaskProgress(data, task, date) {
  const subtasks = task.subtasks || [];
  return {
    done: subtasks.filter(step => subtaskDone(data, task.id, date, step.id)).length,
    total: subtasks.length,
    ready: subtasks.length > 0 && subtasks.filter(step => step.required !== false)
      .every(step => subtaskDone(data, task.id, date, step.id)),
  };
}
export function toggleCompletion(data, id, date, checked) {
  const task = taskOnDate(data, id, date);
  if (!task) return false;
  if (checked && task.type === 'compound' && !subtaskProgress(data, task, date).ready) return false;
  if (checked) {
    if (!data.checks[date]) data.checks[date] = {};
    if (!isDone(data, id, date)) {
      data.completionRewards ||= {};
      data.completionRewards[date] ||= {};
      data.completionRewards[date][id] = { xp: Number(task.xp) || 0, category: achievementCategory(data, task) };
    }
    data.checks[date][id] = true;
  } else {
    if (data.checks[date]) {
      delete data.checks[date][id];
      if (!Object.keys(data.checks[date]).length) delete data.checks[date];
    }
    if (data.completionRewards?.[date]) {
      delete data.completionRewards[date][id];
      if (!Object.keys(data.completionRewards[date]).length) delete data.completionRewards[date];
    }
  }
  return true;
}
export function toggleSubtask(data, id, date, subId, checked) {
  const task = taskOnDate(data, id, date);
  const step = task?.subtasks?.find(step => step.id === subId);
  if (!step) return false;
  data.subtaskChecks ||= {};
  data.subtaskChecks[date] ||= {};
  data.subtaskChecks[date][id] ||= {};
  if (checked) data.subtaskChecks[date][id][subId] = true;
  else delete data.subtaskChecks[date][id][subId];
  if (!checked && step.required !== false) toggleCompletion(data, id, date, false);
  return true;
}
export function addTask(data, fields) {
  const task = { ...fields, id: uid(), name: fields.name.trim(),
    xp: Math.max(1, Math.min(500, Number(fields.xp) || 20)), active: true };
  data.tasks.push(task);
  return task;
}
// Finished dates retain their definition and reward when a series changes.
// Subtask IDs remain stable during editing, so partial progress is never reset.
export function editTask(data, id, date, scope, fields) {
  const base = data.tasks.find(task => task.id === id);
  if (!base) return;
  data.taskOverrides ||= {};
  if (scope === 'date' && base.frequency !== 'once') {
    data.taskOverrides[date] ||= {};
    const { frequency, date: ignoredDate, ...content } = fields;
    data.taskOverrides[date][id] = { ...taskOnDate(data, id, date), ...content };
    const edited = taskOnDate(data, id, date);
    if (edited.type === 'compound' && !subtaskProgress(data, edited, date).ready) toggleCompletion(data, id, date, false);
  } else {
    for (const [completedDate, checks] of Object.entries(data.checks)) {
      if (checks[id]) {
        data.taskOverrides[completedDate] ||= {};
        data.taskOverrides[completedDate][id] = structuredClone(taskOnDate(data, id, completedDate));
      }
    }
    // Organizing an existing series also links its finished history. Date-specific
    // links to other objectives remain explicit exceptions; XP/steps stay frozen.
    if (['categoryId', 'objectiveId', 'stageId'].some(key => key in fields && fields[key] !== base[key])) {
      for (const entries of Object.values(data.taskOverrides)) {
        const override = entries[id];
        if (!override || (override.objectiveId || null) !== (base.objectiveId || null) || (override.stageId || null) !== (base.stageId || null)) continue;
        for (const key of ['categoryId', 'category', 'objectiveId', 'stageId']) if (key in fields) override[key] = fields[key];
      }
    }
    Object.assign(base, fields);
    // A one-off task has only this occurrence; explicit edits take precedence.
    if (base.frequency === 'once') {
      if (data.taskOverrides[date]) delete data.taskOverrides[date][id];
      if (base.type === 'compound' && !subtaskProgress(data, base, base.date).ready) toggleCompletion(data, id, base.date, false);
    }
  }
}
export function deleteTask(data, id) {
  const task = data.tasks.find(item => item.id === id);
  if (!task || task.workoutSessionId || data.sports?.sessions?.some(session => session.taskId === id)) return false;
  data.tasks = data.tasks.filter(item => item.id !== id);
  // Remove live occurrence links for this task only. Completion checks and
  // reward snapshots remain as historical records; no other task is touched.
  for (const [date, entries] of Object.entries(data.taskOverrides || {})) {
    if (entries && Object.hasOwn(entries, id)) delete entries[id];
    if (entries && !Object.keys(entries).length) delete data.taskOverrides[date];
  }
  for (const [date, entries] of Object.entries(data.subtaskChecks || {})) {
    if (entries && Object.hasOwn(entries, id)) delete entries[id];
    if (entries && !Object.keys(entries).length) delete data.subtaskChecks[date];
  }
  for (const [date, ids] of Object.entries(data.dayFocus || {})) {
    data.dayFocus[date] = ids.filter(taskId => taskId !== id);
    if (!data.dayFocus[date].length) delete data.dayFocus[date];
  }
  return true;
}
export function toggleTask(data, id) {
  const task = data.tasks.find(task => task.id === id);
  if (task) task.active = task.active === false;
}
// A focus pin belongs to a single calendar date and task instance. Repeating
// series keep their existing IDs; another date gets an independent pin.
export function toggleDayFocus(data, id, date) {
  data.dayFocus ||= {};
  data.dayFocus[date] ||= [];
  const pinned = data.dayFocus[date];
  const index = pinned.indexOf(id);
  if (index >= 0) pinned.splice(index, 1);
  else pinned.push(id);
  if (!pinned.length) delete data.dayFocus[date];
  return index < 0;
}
export function taskHtml(data, task, date) {
  const id = esc(task.id), day = esc(date), done = isDone(data, task.id, date);
  const compound = task.type === 'compound';
  const progress = subtaskProgress(data, task, date);
  const steps = compound ? `<div class="subtask-progress"><span>${progress.done}/${progress.total} подзадач</span><div class="progress"><span style="width:${progress.total ? progress.done / progress.total * 100 : 0}%"></span></div></div><div class="subtask-list">${(task.subtasks || []).map(step => `<label class="subtask"><input type="checkbox" data-subtask="${esc(step.id)}" data-task-id="${id}" data-date="${day}" ${subtaskDone(data, task.id, date, step.id) ? 'checked' : ''}><span>${esc(step.name)}${step.required === false ? '<small class="muted"> · необязательно</small>' : ''}</span></label>`).join('')}</div><button class="${done ? '' : 'primary'}" data-complete-task="${id}" data-date="${day}" ${!done && !progress.ready ? 'disabled' : ''}>${done ? 'Отменить завершение' : 'Завершить задание'}</button>${!done && !progress.ready ? '<p class="muted small">Отметь все обязательные подзадачи, чтобы завершить.</p>' : ''}` : '';
  const planning = [task.activityType, task.duration ? `${task.duration} мин` : '', ({ light: 'лёгкая', medium: 'средняя', high: 'высокая' })[task.intensity]].filter(Boolean).map(esc).join(' · ');
  const dayNames = { day: 'дневная', night: 'ночная', off: 'выходной', recovery: 'восстановление' };
  const path = taskPath(data, task);
  const suitable = (task.suitableDays || []).map(kind => dayNames[kind]).filter(Boolean).join(', ');
  return `<article class="task-card ${done ? 'done' : ''}"><div class="task-summary">${!compound ? `<input type="checkbox" data-check="${id}" data-date="${day}" ${done ? 'checked' : ''} aria-label="Выполнено: ${esc(task.name)}">` : '<span class="compound-icon" aria-hidden="true">▤</span>'}<div class="task-text"><div class="task-name">${esc(task.name)}</div><div class="task-meta">${esc(categoryName(data, task))} · ${task.frequency === 'once' ? esc(prettyTaskDate(task.date)) : freqName(task.frequency)} · ${done ? 'Выполнено' : compound ? `${progress.done}/${progress.total} подзадач` : 'Запланировано'}</div></div><span class="xp">+${Number(task.xp) || 0} XP</span></div><details data-task-details="${id}" data-date="${day}"><summary>Подробности</summary><div class="task-detail-body">${path ? `<p class="task-path">${esc(path)}</p>` : ''}${task.description ? `<p class="task-description">${esc(task.description)}</p>` : ''}${task.goal ? `<p class="small"><strong>Цель:</strong> ${esc(task.goal)}</p>` : ''}${planning ? `<p class="muted small">${planning}</p>` : ''}${suitable ? `<p class="muted small">Подходящие дни: ${esc(suitable)}</p>` : ''}${steps}${task.workoutSessionId ? `<button class="primary small" data-open-session="${esc(task.workoutSessionId)}" style="margin-top:12px">Дневник тренировки</button>` : ''}${!compound && !task.description && !planning && !task.goal && !suitable ? '<p class="muted small">Отметь выполнение галочкой рядом с названием.</p>' : ''}<div class="actions task-detail-actions"><button data-edit-task="${id}" data-date="${day}">Редактировать</button><button class="danger" data-delete-task="${id}">Удалить</button></div></div></details></article>`;
}
function prettyTaskDate(date) { return date ? parseDate(date).toLocaleDateString('ru-RU') : 'на дату'; }
export function renderTasks(data) {
  document.getElementById('allTasks').innerHTML = data.tasks.length
    ? data.tasks.map(task => `<div class="task"><div style="flex:1;min-width:0"><div class="task-name">${esc(task.name)} ${task.active === false ? '<span class="badge">выключено</span>' : ''}</div><div class="task-meta">${esc(categoryName(data, task))} · ${task.frequency === 'once' ? prettyTaskDate(task.date) : freqName(task.frequency)} · ${Number(task.xp) || 0} XP${task.type === 'compound' ? ' · составное' : ''}</div></div><div class="actions"><button data-edit-task="${esc(task.id)}" data-date="${esc(task.frequency === 'once' ? task.date : today())}">Редактировать</button><button data-toggle-task="${esc(task.id)}">${task.active === false ? 'Включить' : 'Выключить'}</button><button class="danger" data-delete-task="${esc(task.id)}">Удалить</button></div></div>`).join('')
    : '<div class="empty">Пока нет заданий. Создай первое справа.</div>';
}
