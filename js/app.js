import { initCloudFoundation } from './cloud-foundation-ui.js?v=stage9.3.3';
import { initPlatform } from './pwa.js?v=stage9.3.3';
import { recoverBeforeStartup, initFullBackup } from './full-backup-ui.js?v=stage9.3.3';
import { createBodyUI } from './body-ui.js?v=stage9.3.3';
import { createSportsUI } from './sports-ui.js?v=stage9.3.3';
import { createOrganizationUI } from './organization-ui.js?v=stage9.3.3';
import { createTaskEditor } from './task-editor.js?v=stage9.3.3';
import { DAY_TYPES, daySchedule, overnightCarry, validDate } from './schedule.js?v=stage9.3.3';
import { loadData, saveData, resetData, serializeData, parseBackup } from './storage.js?v=stage9.3.3';
import * as tasks from './tasks.js?v=stage9.3.3';
import { createCalendar, today, dateKey, parseDate, pretty } from './calendar.js?v=stage9.3.3';
import { achievementList, renderAchievements, reconcileAchievements, claimAchievement, toggleShowcase } from './achievements.js?v=stage9.3.3';
import { initCopilot } from './copilot.js?v=stage9.3.3';
import { buildTaskManager, calendarTaskHtml, calendarWorkoutHtml, rankFocusTasks, taskEmoji } from './task-manager.js?v=stage9.3.3';

export async function startPrivateApplication(access) {
if (!access?.authorized) throw new Error('Доступ владельца не подтверждён');
// Composition root: state, navigation, events and overview rendering.
// Feature modules never import app.js, so dependencies have no cycles.
const $ = id => document.getElementById(id);
await recoverBeforeStartup();
let backupBusy = false;
let data = loadData();
let currentView = 'overview';
let copilot = null;
const calendar = createCalendar();
const editor = createTaskEditor({ getData: () => data, commit, toast });
const organization = createOrganizationUI({ getData: () => data, commit, toast, openTask: options => editor.open(options) });
const sports = createSportsUI({ getData: () => data, commit, toast, openObjective: id => { go('organization'); organization.open(id); } });
const body = createBodyUI({ getData: () => data, commit, toast });
let editingShiftDate = today();
const expandedTasks = new Set();
let taskTab = 'today';
let taskFilters = { category: 'all', objective: 'all', priority: 'all' };
let showAllToday = false;
let achievementFilters = { category: 'all', rarity: 'all', state: 'all' };
function detailKey(detail) {
  return `${detail.closest('#selectedTasks') ? 'calendar' : detail.closest('#objectiveDetail') ? 'objective' : 'overview'}:${detail.dataset.date}:${detail.dataset.taskDetails}`;
}
function rememberDetails(root = document) {
  root.querySelectorAll('[data-task-details]').forEach(detail => {
    const key = detailKey(detail);
    if (detail.open) expandedTasks.add(key); else expandedTasks.delete(key);
  });
}
function restoreDetails() {
  document.querySelectorAll('[data-task-details]').forEach(detail => {
    detail.open = expandedTasks.has(detailKey(detail));
  });
}
function shiftOptions() {
  return '<option value="auto">По циклу</option>' + DAY_TYPES.map(day => `<option value="${day.type}">${day.label}</option>`).join('');
}
function openShift(date) {
  editingShiftDate = date;
  $('shiftDialogDate').textContent = pretty(date);
  $('dayShiftType').innerHTML = shiftOptions();
  $('dayShiftType').value = data.workSchedule.overrides[date] || 'auto';
  $('shiftDialog').showModal();
}
function setShift(date, type) {
  if (!validDate(date)) { toast('Выбери корректную дату'); return false; }
  if (type === 'auto') delete data.workSchedule.overrides[date];
  else if (DAY_TYPES.some(day => day.type === type)) data.workSchedule.overrides[date] = type;
  else return false;
  commit();
  toast(type === 'auto' ? 'День снова рассчитывается по циклу' : 'Исключение сохранено');
  return true;
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.remove('hidden');
  setTimeout(() => element.classList.add('hidden'), 2200);
}

function commit(replacement = null, { reconcile = true } = {}) {
  if (backupBusy) throw new Error('Дождись завершения резервного копирования.');
  if (!access.authorized) throw new Error('Приватный доступ закрыт. Войди снова.');
  const next = replacement || data;
  const newlyUnlocked = reconcile ? reconcileAchievements(next) : [];
  // For AI batches, persist the fully validated clone before swapping app state.
  // A storage error therefore leaves the live in-memory data untouched.
  saveData(next);
  if (replacement) data = replacement;
  render();
  if (newlyUnlocked.length) showAchievementNotice(newlyUnlocked);
}

function showAchievementNotice(achievements) {
  const first = achievements[0];
  $('achievementNoticeEmoji').textContent = first.emoji;
  $('achievementNoticeName').textContent = first.name;
  $('achievementNoticeDescription').textContent = first.description;
  $('achievementNoticeRarity').textContent = `${({ COMMON: '⚪ Обычное', RARE: '🔵 Редкое', EPIC: '🟣 Эпическое', LEGENDARY: '🟠 Легендарное', MYTHIC: '🔴 Мифическое' })[first.rarity]} достижение · награда +${({ COMMON: 25, RARE: 75, EPIC: 150, LEGENDARY: 300, MYTHIC: 500 })[first.rarity]} XP${achievements.length > 1 ? ` · ещё открыто: ${achievements.length - 1}` : ''}`;
  if (!$('achievementNotice').open) $('achievementNotice').showModal();
}

function renderCalendar() {
  rememberDetails($('selectedTasks'));
  calendar.render({
    tasksFor: date => tasks.tasksFor(data, date),
    workoutHtml: (task, date) => calendarWorkoutHtml(data, task, date),
    taskHtml: (task, date) => calendarTaskHtml(data, task, date),
    checkCount: date => tasks.checkCount(data, date),
    scheduleFor: date => daySchedule(date, data.workSchedule),
    schedule: data.workSchedule,
    isDone: (id, date) => tasks.isDone(data, id, date),
  });
  restoreDetails();
}

function renderOverview() {
  const shift = daySchedule(today(), data.workSchedule);
  const carry = overnightCarry(today(), data.workSchedule);
  $('todayShiftTitle').textContent = shift.label + (shift.overridden ? ' · ✎ исключение' : '');
  $('todayShiftTitle').className = 'section-title shift-' + shift.kind;
  $('todayShiftTime').textContent = shift.time + (shift.kind === 'night' ? ` · до ${pretty(shift.endDate)}` : '');
  $('todayShiftCarry').textContent = carry ? `Ночная от ${pretty(carry.date)} заканчивается сегодня в 08:00.` : '';

  const info = tasks.levelInfo(data);
  const todayTasks = tasks.tasksFor(data, today());
  const done = todayTasks.filter(task => tasks.isDone(data, task.id, today())).length;
  $('level').textContent = `Уровень ${info.level}`;
  $('rank').textContent = data.playerName || 'Игрок';
  $('levelBar').style.width = info.into + '%';
  $('xpLabel').textContent = info.xp + ' XP';
  $('nextXp').textContent = `До следующего уровня: ${info.need} XP`;
  $('todayCount').textContent = `${done} / ${todayTasks.length}`;
  $('todayBar').style.width = (todayTasks.length ? done / todayTasks.length * 100 : 0) + '%';
  const streak = tasks.streak(data);
  $('streak').textContent = streak + ' ' + (streak === 1 ? 'день 🔥' : 'дней 🔥');
  const day = today(), focus = data.dayFocus?.[day] || [];
  const sortedToday = rankFocusTasks(data, todayTasks, day);
  const visibleToday = showAllToday ? sortedToday : sortedToday.slice(0, 3);
  $('todayTasks').innerHTML = visibleToday.length ? visibleToday.map(task => {
    const pinned = focus.includes(task.id), done = tasks.isDone(data, task.id, day);
    const category = data.categories?.find(item => item.id === task.categoryId);
    const objective = data.objectives?.find(item => item.id === task.objectiveId);
    const session = data.sports?.sessions.find(item => item.taskId === task.id);
    const title = objective?.name || category?.name || task.category || 'Без категории';
    const action = session ? `<button class="today-open" data-open-workout="${tasks.esc(session.id)}">Открыть →</button>` : `<button class="today-open" data-edit-task="${tasks.esc(task.id)}" data-date="${day}">Открыть →</button>`;
    return `<article class="focus-task-row ${done ? 'is-done' : ''}"><button class="focus-star ${pinned ? 'pinned' : ''}" data-focus-task="${tasks.esc(task.id)}" data-date="${day}" aria-pressed="${pinned}" aria-label="${pinned ? 'Убрать из фокуса дня' : 'Закрепить в фокусе дня'}">${pinned ? '★' : '☆'}</button><span class="focus-task-icon" aria-hidden="true">${tasks.esc(taskEmoji(data, task, session))}</span><div class="focus-task-copy"><strong class="focus-link">${objective ? `<span>${tasks.esc(title)}</span>` : ''}${tasks.esc(task.name)}</strong><small>${task.duration ? `${tasks.esc(task.activityType || 'Задача')} · ${task.duration} минут · ` : ''}${done ? 'Выполнено' : task.type === 'compound' ? 'В процессе' : 'Запланировано'}</small></div>${action}</article>`;
  }).join('') : `<div class="focus-empty"><strong>Сегодня всё свободно</strong><span>Оставь день открытым или добавь следующий шаг.</span><button id="addTodayTask" class="primary">+ Добавить задачу</button></div>`;
  $('showMoreToday').classList.toggle('hidden', sortedToday.length <= 3);
  $('showMoreToday').textContent = showAllToday ? 'Свернуть список' : `Показать остальные · ${sortedToday.length - 3}`;
  $('totalXp').textContent = info.xp;
  $('completedTotal').textContent = tasks.allCheckEntries(data);
  $('activeDays').textContent = tasks.activeDates(data).length;
  const achievements = achievementList(data);
  $('achievementCount').textContent = `${achievements.filter(achievement => achievement.state !== 'locked').length} / ${achievements.length}`;
  const next = achievements.find(achievement => achievement.state === 'unlocked') || achievements.find(achievement => achievement.state === 'locked');
  $('nextAchievement').textContent = next
    ? `${next.emoji} ${next.name} — ${next.description}${next.state === 'unlocked' ? ' · награда доступна' : ''}`
    : 'Все достижения получены.';

  const nextWorkoutCard = $('overviewNextWorkout');
  const nextWorkout = [...(data.sports?.sessions || [])]
    .filter(session => session.date >= today() && !tasks.isDone(data, session.taskId, session.date))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextWorkoutCard) {
    nextWorkoutCard.classList.toggle('hidden', !nextWorkout);
    if (nextWorkout) {
      const name = nextWorkout.workoutSnapshot?.name || 'Тренировка';
      const duration = nextWorkout.workoutSnapshot?.durationMinutes;
      nextWorkoutCard.innerHTML = `<div><div class="eyebrow">Ближайшая тренировка</div><strong>${tasks.esc(name)}</strong><span class="muted small">${tasks.esc(pretty(nextWorkout.date))}${duration ? ` · ${duration} минут` : ''}</span></div><button type="button" class="today-open" data-open-workout="${tasks.esc(nextWorkout.id)}">Открыть →</button>`;
    } else nextWorkoutCard.replaceChildren();
  }
}

function renderInterface() {
  const titles = {
    overview: ['Твой обзор', 'Маленькие шаги. Заметный прогресс.'],
    calendar: ['Календарь', 'Твой ритм, день за днём.'],
    tasks: ['Задания', 'Освободи внимание для того, что важно.'],
    achievements: ['Достижения', 'Каждый шаг заслуживает признания.'],
    copilot: ['AI-агент', 'Планы и изменения — только после твоего подтверждения.'],
    body: ['Тело и прогресс', 'Замечай изменения, сохраняя историю.'],
    sports: ['Тренировки', 'Программы, дневник и контроль результата.'],
    organization: ['Цели и проекты', 'Свяжи ежедневные шаги с тем, чего хочешь достичь.'],
    settings: ['Настройки', 'Твоё пространство. Твои правила.'],
  };
  $('viewTitle').textContent = titles[currentView][0];
  $('viewSubtitle').textContent = titles[currentView][1];
  $('headerDate').textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  $('profileName').textContent = data.playerName || 'Игрок';
  $('profileInitial').textContent = (data.playerName || 'Игрок').slice(0, 1).toUpperCase();
  $('profileLevel').textContent = 'Уровень ' + tasks.levelInfo(data).level;
  document.querySelectorAll('#nav button').forEach(button => {
    const label = button.dataset.view === 'achievements' ? 'Достижения' : button.textContent.trim();
    button.setAttribute('aria-label', label);
    if (button.dataset.view === currentView) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const primaryViews = new Set(['overview', 'calendar', 'tasks', 'sports']);
  document.querySelectorAll('#mobileTabbar [data-view]').forEach(button => {
    const active = button.dataset.view === currentView;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const moreButton = $('mobileMoreButton');
  if (moreButton) {
    const active = !primaryViews.has(currentView);
    moreButton.classList.toggle('active', active);
    if (active) moreButton.setAttribute('aria-current', 'page'); else moreButton.removeAttribute('aria-current');
  }
  document.querySelectorAll('#mobileMoreMenu [data-view]').forEach(button => {
    if (button.dataset.view === currentView) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const rewardsAvailable = achievementList(data).filter(item => item.state === 'unlocked').length;
  $('availableAchievementCount').textContent = rewardsAvailable ? String(rewardsAvailable) : '';
  $('availableAchievementCount').classList.toggle('hidden', !rewardsAvailable);
  $('navAchievements').setAttribute('aria-label', rewardsAvailable ? `Достижения, доступных наград: ${rewardsAvailable}` : 'Достижения');
  const todayTasks = tasks.tasksFor(data, today());
  const done = todayTasks.filter(task => tasks.isDone(data, task.id, today())).length;
  const percent = todayTasks.length ? Math.round(done / todayTasks.length * 100) : 0;
  $('todayRing').style.setProperty('--value', percent);
  $('todayRing').dataset.label = percent + '%';
  $('todayRing').setAttribute('aria-label', 'Выполнено ' + percent + ' процентов');
  let sum = 0;
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = parseDate(today());
    date.setDate(date.getDate() - i);
    const key = dateKey(date);
    const count = tasks.checkCount(data, key);
    sum += count;
    week.push({ date, key, count });
  }
  const max = Math.max(1, ...week.map(day => day.count));
  $('weekActivity').innerHTML = week.map(day => `<div class="week-day ${day.key === today() ? 'today' : ''}" aria-label="${pretty(day.key)}: ${day.count} выполнено"><strong>${day.count}</strong><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="height:${day.count / max * 100}%"></div></div><span>${day.date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span></div>`).join('');
  $('weekSummary').textContent = 'Выполнено за неделю: ' + sum;
}

function render() {
  if (!access.authorized) return;
  rememberDetails();
  renderInterface();
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('hidden', view.id !== 'view-' + currentView));
  document.querySelectorAll('#nav button').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));
  renderOverview();
  renderCalendar();
  renderTaskManager();
  renderAchievements(data, achievementFilters);
  organization.render();
  sports.render();
  body.render(currentView === 'body').catch(error => toast(error.message));
  copilot?.render();
  $('playerName').value = data.playerName || '';
  $('cycleStart').value = data.workSchedule.cycleStart;
  $('settingsShiftType').innerHTML = shiftOptions();
  $('settingsShiftDate').value ||= today();
  $('settingsShiftType').value = data.workSchedule.overrides[$('settingsShiftDate').value] || 'auto';
  $('shiftExceptions').textContent = Object.entries(data.workSchedule.overrides).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, type]) => `${pretty(date)} — ${DAY_TYPES.find(day => day.type === type)?.label || type}`).join(' · ') || 'Ручных исключений нет.';
  restoreDetails();
}

function renderTaskManager() {
  const category = $('taskFilterCategory'), objective = $('taskFilterObjective');
  const categoryValue = taskFilters.category, objectiveValue = taskFilters.objective;
  category.innerHTML = '<option value="all">Все категории</option>' + data.categories.map(item => `<option value="${tasks.esc(item.id)}">${tasks.esc(item.icon || '')} ${tasks.esc(item.name)}</option>`).join('');
  objective.innerHTML = '<option value="all">Все цели и проекты</option>' + data.objectives.map(item => `<option value="${tasks.esc(item.id)}">${tasks.esc(item.name)}</option>`).join('');
  category.value = data.categories.some(item => item.id === categoryValue) ? categoryValue : 'all';
  objective.value = data.objectives.some(item => item.id === objectiveValue) ? objectiveValue : 'all';
  $('taskFilterPriority').value = taskFilters.priority;
  const filterCount = Object.values(taskFilters).filter(value => value !== 'all').length;
  $('taskFilterCount').textContent = String(filterCount);
  $('taskFilterCount').classList.toggle('is-active', filterCount > 0);
  document.querySelectorAll('[data-task-tab]').forEach(button => {
    const active = button.dataset.taskTab === taskTab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
  });
  const result = buildTaskManager(data, taskTab, taskFilters);
  $('allTasks').innerHTML = result.html;
  $('taskManagerSummary').textContent = result.summary;
}

function positionTaskMenu(details) {
  const panel = details?.querySelector('.task-manager-menu-panel');
  const anchor = details?.querySelector('summary');
  if (!panel || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const availableBelow = window.innerHeight - rect.bottom - pad;
  const availableAbove = rect.top - pad;
  const height = Math.min(panel.scrollHeight || panel.offsetHeight, window.innerHeight - pad * 2);
  const openUp = availableBelow < height + 8 && availableAbove > availableBelow;
  const width = panel.offsetWidth || 180;
  panel.style.left = `${Math.max(pad, Math.min(rect.right - width, window.innerWidth - width - pad))}px`;
  panel.style.top = `${Math.max(pad, openUp ? rect.top - height - 6 : rect.bottom + 6)}px`;
  panel.style.maxHeight = `${Math.max(80, Math.min(window.innerHeight - pad * 2, openUp ? availableAbove : availableBelow) - 6)}px`;
}

function closeTaskMenu(details) {
  if (!details) return;
  const panel = details.querySelector('.task-manager-menu-panel');
  if (panel?.matches(':popover-open')) panel.hidePopover();
  details.open = false;
}

function go(view) {
  currentView = view;
  render();
}

function exportData() {
  const blob = new Blob([serializeData(data)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'life-os-backup-' + today() + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
  toast('JSON скачан. Фотографии экспортируются отдельно в «Тело и прогресс».');
}

function initEvents() {
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches('.task-manager-menu')) return;
    const panel = details.querySelector('.task-manager-menu-panel');
    if (!panel) return;
    if (details.open) {
      document.querySelectorAll('.task-manager-menu[open]').forEach(other => { if (other !== details) closeTaskMenu(other); });
      if (typeof panel.showPopover === 'function') panel.showPopover();
      positionTaskMenu(details);
    } else if (panel.matches(':popover-open')) panel.hidePopover();
  }, true);
  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (panel instanceof HTMLElement && panel.matches('.task-manager-menu-panel[popover]') && event.newState === 'closed') {
      const details = panel.closest('.task-manager-menu');
      if (details?.open) details.open = false;
    }
  }, true);
  const repositionOpenTaskMenus = () => document.querySelectorAll('.task-manager-menu[open]').forEach(positionTaskMenu);
  window.addEventListener('resize', repositionOpenTaskMenus);
  window.addEventListener('scroll', repositionOpenTaskMenus, true);
  $('scheduleForm').addEventListener('submit', event => {
    event.preventDefault();
    const start = $('cycleStart').value;
    if (!validDate(start)) { toast('Выбери корректную дату начала цикла'); return; }
    data.workSchedule.cycleStart = start;
    commit();
    toast('Рабочий график сохранён');
  });
  $('dayShiftForm').addEventListener('submit', event => {
    event.preventDefault();
    if (setShift(editingShiftDate, $('dayShiftType').value)) $('shiftDialog').close();
  });
  $('settingsShiftForm').addEventListener('submit', event => {
    event.preventDefault();
    setShift($('settingsShiftDate').value, $('settingsShiftType').value);
  });
  $('settingsShiftDate').addEventListener('change', () => {
    $('settingsShiftType').value = data.workSchedule.overrides[$('settingsShiftDate').value] || 'auto';
  });
  $('changeSelectedShift').addEventListener('click', () => openShift(calendar.getSelectedDate()));
  $('addSelectedTask').addEventListener('click', () => editor.open({ date: calendar.getSelectedDate(), fromCalendar: true }));
  $('newTask').addEventListener('click', () => editor.open());
  $('showMoreToday').addEventListener('click', () => { showAllToday = !showAllToday; renderOverview(); });
  $('todayTasks').addEventListener('click', event => {
    if (event.target.closest('#addTodayTask')) editor.open({ date: today() });
  });
  document.querySelectorAll('[data-task-tab]').forEach(button => button.addEventListener('click', () => { taskTab = button.dataset.taskTab; renderTaskManager(); }));
  $('taskFilterCategory').addEventListener('change', event => { taskFilters.category = event.target.value; renderTaskManager(); });
  $('taskFilterObjective').addEventListener('change', event => { taskFilters.objective = event.target.value; renderTaskManager(); });
  $('taskFilterPriority').addEventListener('change', event => { taskFilters.priority = event.target.value; renderTaskManager(); });
  ['achievementFilterCategory', 'achievementFilterRarity', 'achievementFilterState'].forEach(id => $(id).addEventListener('change', () => {
    achievementFilters = { category: $('achievementFilterCategory').value, rarity: $('achievementFilterRarity').value, state: $('achievementFilterState').value };
    renderAchievements(data, achievementFilters);
  }));
  document.querySelectorAll('#nav button, #mobileTabbar [data-view], #mobileMoreMenu [data-view]').forEach(button => button.addEventListener('click', () => {
    const sheet = $('mobileMoreDialog');
    if (sheet.open) sheet.close();
    go(button.dataset.view);
  }));
  $('mobileMoreButton').addEventListener('click', () => {
    const sheet = $('mobileMoreDialog');
    if (!sheet.open) sheet.showModal();
  });
  $('mobileMoreDialog').addEventListener('click', event => { if (event.target === $('mobileMoreDialog')) $('mobileMoreDialog').close(); });
  $('mobileMoreDialog').querySelector('.mobile-more-close').addEventListener('click', () => $('mobileMoreDialog').close());
  document.addEventListener('click', event => {
    const claim = event.target.closest('[data-claim-achievement]');
    if (claim) {
      const result = claimAchievement(data, claim.dataset.claimAchievement);
      if (result.ok) { commit(); toast(`Награда получена · +${result.rewardXP} XP`); }
      else toast(result.reason);
    }
    const pinTrophy = event.target.closest('[data-pin-trophy]');
    const toggleTrophy = event.target.closest('[data-toggle-trophy], [data-unpin-trophy]');
    if (pinTrophy || toggleTrophy) {
      const id = pinTrophy ? $('achievementTrophySelect').value : toggleTrophy.dataset.toggleTrophy || toggleTrophy.dataset.unpinTrophy;
      if (!id) { toast('Выбери открытое достижение'); return; }
      const result = toggleShowcase(data, id);
      if (result.ok) commit(); else toast(result.reason);
    }
    if (event.target.closest('[data-close-achievement-notice]')) $('achievementNotice').close();
    if (event.target.closest('[data-open-achievements]')) { $('achievementNotice').close(); go('achievements'); }
    const close = event.target.closest('[data-close-dialog]');
    if (close) $(close.dataset.closeDialog).close();
    const edit = event.target.closest('[data-edit-task]');
    if (edit) {
      const task = data.tasks.find(task => task.id === edit.dataset.editTask);
      if (task?.workoutSessionId) sports.openDiary(task.workoutSessionId);
      else editor.open({ id: edit.dataset.editTask, date: edit.dataset.date, fromCalendar: !!edit.closest('#selectedTasks') });
    }
    const subtask = event.target.closest('[data-subtask]');
    if (subtask && tasks.toggleSubtask(data, subtask.dataset.taskId, subtask.dataset.date, subtask.dataset.subtask, subtask.checked)) commit();
    const complete = event.target.closest('[data-complete-task]');
    if (complete) {
      const done = tasks.isDone(data, complete.dataset.completeTask, complete.dataset.date);
      if (tasks.toggleCompletion(data, complete.dataset.completeTask, complete.dataset.date, !done)) {
        commit(); toast(done ? 'Завершение отменено · XP пересчитан' : 'Задание завершено · XP начислен');
      } else toast('Сначала отметь обязательные подзадачи');
    }
    const goto = event.target.closest('[data-goto]');
    if (goto) go(goto.dataset.goto);
    const openWorkout = event.target.closest('[data-open-workout]');
    if (openWorkout) sports.openWorkout(openWorkout.dataset.openWorkout);
    const focus = event.target.closest('[data-focus-task]');
    if (focus) {
      tasks.toggleDayFocus(data, focus.dataset.focusTask, focus.dataset.date);
      commit();
    }
    const day = event.target.closest('[data-day]');
    if (day) { calendar.select(day.dataset.day); renderCalendar(); }
    const checkbox = event.target.closest('[data-check]');
    if (checkbox) {
      if (!tasks.toggleCompletion(data, checkbox.dataset.check, checkbox.dataset.date, checkbox.checked)) {
        checkbox.checked = false; toast('Сначала отметь обязательные подзадачи'); return;
      }
      commit();
      toast(checkbox.checked ? 'Задание выполнено · XP начислен' : 'Выполнение отменено');
    }
    const remove = event.target.closest('[data-delete-task]');
    if (remove) {
      const task = data.tasks.find(item => item.id === remove.dataset.deleteTask);
      if (!task) { toast('Задание уже удалено'); return; }
      closeTaskMenu(remove.closest('.task-manager-menu'));
      if (!confirm(`Удалить задачу «${task.name}»? История отметок останется, начисленный за неё XP будет пересчитан. Связанная цель или проект не удаляются.`)) return;
      if (!tasks.deleteTask(data, task.id)) { toast('Задание связано с тренировочной историей и не может быть удалено из этого меню'); return; }
      commit(null, { reconcile: false });
      toast('Задание удалено');
    }
    const toggle = event.target.closest('[data-toggle-task]');
    if (toggle) { tasks.toggleTask(data, toggle.dataset.toggleTask); commit(); }
  });
  $('prevMonth').addEventListener('click', () => { calendar.shiftMonth(-1); renderCalendar(); });
  $('nextMonth').addEventListener('click', () => { calendar.shiftMonth(1); renderCalendar(); });
  $('saveSettings').addEventListener('click', () => {
    data.playerName = $('playerName').value.trim() || 'Игрок';
    commit();
    toast('Настройки сохранены');
  });
  ['exportBtn2'].forEach(id => $(id).addEventListener('click', exportData));
  ['importBtn2'].forEach(id => $(id).addEventListener('click', () => $('importFile').click()));
  $('importFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      data = parseBackup(await file.text());
      expandedTasks.clear();
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      commit();
      toast('Данные восстановлены');
    } catch (error) {
      alert('Не удалось импортировать файл. Выбери резервную копию LIFE OS.');
    }
    event.target.value = '';
  });
  $('resetBtn').addEventListener('click', () => {
    if (confirm('Сбросить JSON-данные, включая измерения? Сначала сохрани резервную копию. Фотографии останутся в отдельном хранилище и удаляются в разделе «Тело и прогресс».')) {
      data = resetData();
      render();
      toast('Прогресс сброшен');
    }
  });
}

initFullBackup({ setBusy: value => { backupBusy = value; }, onRestored: raw => { data = parseBackup(raw); expandedTasks.clear(); render(); } });
initPlatform();
initCloudFoundation(access);
initEvents();
copilot = initCopilot({ getData: () => data, getLatestData: () => loadData(), commit: (replacement, options) => commit(replacement, options) });
render();

function refreshAtMidnight() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  setTimeout(() => { render(); refreshAtMidnight(); }, next.getTime() - Date.now() + 100);
}
refreshAtMidnight();
let displayedDay = today();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && displayedDay !== today()) {
    displayedDay = today();
    render();
  }
});

return { refresh: async () => { if (!access.authorized) throw new Error('Доступ не подтверждён'); data = loadData(); render(); } };
}
