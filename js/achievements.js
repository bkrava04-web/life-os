import { activeDates, totalXP, allCheckEntries, esc, completionCategory, streak } from './tasks.js?v=stage9.3.3';

export const RARITIES = Object.freeze({
  COMMON: { name: 'Обычное', emoji: '⚪', xp: 25, color: '#9aa0aa' },
  RARE: { name: 'Редкое', emoji: '🔵', xp: 75, color: '#63a9ff' },
  EPIC: { name: 'Эпическое', emoji: '🟣', xp: 150, color: '#ae89ff' },
  LEGENDARY: { name: 'Легендарное', emoji: '🟠', xp: 300, color: '#ffbf69' },
  MYTHIC: { name: 'Мифическое', emoji: '🔴', xp: 500, color: '#ff718a' },
});

const make = (id, emoji, name, description, category, rarity, metric, target) => ({ id, emoji, name, description, category, rarity, metric, target });
export const ACHIEVEMENT_CATALOG = Object.freeze([
  // Stable IDs from the original version are retained for safe migration.
  make('first', '🌱', 'Первый шаг', 'Выполни первое задание', 'life', 'COMMON', 'tasks', 1),
  make('xp100', '✨', 'Первые 100 XP', 'Набери 100 опыта', 'life', 'COMMON', 'xp', 100),
  make('days3', '📅', 'В ритме', 'Будь активен в 3 разных днях', 'discipline', 'COMMON', 'activeDays', 3),
  make('days7', '🗓️', 'Неделя прогресса', 'Будь активен в 7 разных днях', 'discipline', 'RARE', 'activeDays', 7),
  make('tasks10', '✅', 'Десятка', 'Выполни 10 заданий', 'life', 'RARE', 'tasks', 10),
  make('learn5', '📚', 'Ученик', 'Выполни 5 заданий по обучению', 'learning', 'COMMON', 'learningTasks', 5),
  make('streak3', '🔥', 'Три дня подряд', 'Будь активен 3 дня подряд', 'discipline', 'COMMON', 'streak', 3),
  make('level2', '🏆', 'Новый уровень', 'Достигни 2-го уровня', 'life', 'COMMON', 'level', 2),

  make('sport-first', '⚽', 'Первое занятие', 'Заверши первую тренировку', 'sport', 'COMMON', 'workouts', 1),
  make('sport-3', '⚽', 'Первые шаги', 'Заверши 3 тренировки', 'sport', 'COMMON', 'workouts', 3),
  make('sport-10', '💪', 'Ритм тренировок', 'Заверши 10 тренировок', 'sport', 'RARE', 'workouts', 10),
  make('sport-25', '🏅', 'Опытный атлет', 'Заверши 25 тренировок', 'sport', 'EPIC', 'workouts', 25),
  make('sport-hours', '🏃', 'Долгая дистанция', 'Заверши тренировки общей плановой длительностью 10 часов', 'sport', 'EPIC', 'workoutMinutes', 600),
  make('sport-stage', '⚽', 'Возвращение легенды', 'Заверши спортивный этап, связанный с программой', 'sport', 'EPIC', 'sportStages', 1),

  make('learn-first', '📖', 'Начало пути', 'Выполни первое задание по обучению', 'learning', 'COMMON', 'learningTasks', 1),
  make('learn-10', '🧠', 'Любознательный', 'Выполни 10 заданий по обучению', 'learning', 'RARE', 'learningTasks', 10),
  make('learn-goal', '🎓', 'Учебная цель', 'Заверши цель с категорией «Обучение»', 'learning', 'EPIC', 'learningGoals', 1),

  make('project-first', '🚀', 'Первый запуск', 'Создай первый проект', 'work', 'COMMON', 'projects', 1),
  make('project-task', '🛠️', 'Первый вклад', 'Выполни первое задание проекта', 'work', 'COMMON', 'projectTasks', 1),
  make('project-tasks-10', '🧰', 'Создатель', 'Выполни 10 заданий проектов', 'work', 'RARE', 'projectTasks', 10),
  make('project-done', '✅', 'Дело сделано', 'Заверши первый проект', 'work', 'RARE', 'completedProjects', 1),
  make('project-5', '🏗️', 'Архитектор', 'Заверши 5 проектов', 'work', 'LEGENDARY', 'completedProjects', 5),

  make('active-14', '🌿', 'Две недели движения', 'Будь активен в 14 разных днях', 'discipline', 'RARE', 'activeDays', 14),
  make('active-30', '💎', 'Несокрушимый', 'Будь активен в 30 разных днях', 'discipline', 'EPIC', 'activeDays', 30),
  make('streak-7', '🔥', 'Неделя силы', 'Поддерживай серию активности 7 дней', 'discipline', 'RARE', 'streak', 7),
  make('streak-14', '🧭', 'Верность пути', 'Поддерживай серию активности 14 дней', 'discipline', 'EPIC', 'streak', 14),
  make('streak-30', '👑', 'Несгибаемый ритм', 'Поддерживай серию активности 30 дней', 'discipline', 'LEGENDARY', 'streak', 30),

  make('goal-first', '🎯', 'Целеустремлённый', 'Создай первую цель', 'life', 'COMMON', 'goals', 1),
  make('goal-done', '🏁', 'Финишная черта', 'Заверши первую цель', 'life', 'RARE', 'completedGoals', 1),
  make('goal-5', '🏆', 'Победитель', 'Заверши 5 целей', 'life', 'LEGENDARY', 'completedGoals', 5),
  make('level5', '⭐', 'Уверенный игрок', 'Достигни 5-го уровня LIFE OS', 'life', 'RARE', 'level', 5),
  make('level10', '🌟', 'Новая глава', 'Достигни 10-го уровня LIFE OS', 'life', 'EPIC', 'level', 10),
  make('level20', '🌌', 'Легенда LIFE OS', 'Достигни 20-го уровня LIFE OS', 'life', 'MYTHIC', 'level', 20),
]);

export const ACHIEVEMENT_CATEGORIES = Object.freeze({
  sport: '⚽ Спорт и здоровье', learning: '📚 Обучение', work: '💼 Работа и проекты',
  discipline: '🔥 Дисциплина', life: '🌍 Жизнь',
});

function categoryName(data, objective) {
  return data.categories?.find(category => category.id === objective?.categoryId)?.achievementCategory
    || data.categories?.find(category => category.id === objective?.categoryId)?.name || '';
}
function isLearning(value) { return ['обучение', 'learning'].includes(String(value || '').trim().toLocaleLowerCase('ru')); }
function checkedRows(data) {
  const rows = [];
  for (const [date, checks] of Object.entries(data.checks || {})) for (const [id, done] of Object.entries(checks || {})) {
    if (!done) continue;
    const task = data.tasks.find(item => item.id === id);
    if (!task) continue;
    rows.push({ date, task: { ...task, ...(data.taskOverrides?.[date]?.[id] || {}) } });
  }
  return rows;
}
function legacyLearningCount(data) {
  return checkedRows(data).filter(({ task, date }) => ['Обучение', 'Личное'].includes(completionCategory(data, task.id, date))).length;
}

export function achievementStats(data) {
  const rows = checkedRows(data);
  const objectives = data.objectives || [];
  const sessions = data.sports?.sessions || [];
  const completedSessions = sessions.filter(session => !!data.checks?.[session.date]?.[session.taskId]);
  const projectTasks = rows.filter(({ task }) => objectives.some(objective => objective.id === task.objectiveId && objective.type === 'project'));
  const learningTasks = rows.filter(({ task, date }) => isLearning(completionCategory(data, task.id, date)));
  const xp = totalXP(data);
  const level = Math.floor(xp / 100) + 1;
  const learningGoals = objectives.filter(objective => objective.type === 'goal' && objective.status === 'completed' && isLearning(categoryName(data, objective))).length;
  const sportStages = (data.stages || []).filter(stage => stage.status === 'completed' && (data.sports?.programs || []).some(program => program.stageId === stage.id)).length;
  return {
    tasks: rows.length,
    xp,
    level,
    activeDays: activeDates(data).length,
    streak: streak(data),
    learningTasks: learningTasks.length,
    workouts: completedSessions.length,
    workoutMinutes: completedSessions.reduce((sum, session) => sum + (Number(session.workoutSnapshot?.durationMinutes) || 0), 0),
    sportStages,
    learningGoals,
    projects: objectives.filter(objective => objective.type === 'project').length,
    projectTasks: projectTasks.length,
    completedProjects: objectives.filter(objective => objective.type === 'project' && objective.status === 'completed').length,
    goals: objectives.filter(objective => objective.type === 'goal').length,
    completedGoals: objectives.filter(objective => objective.type === 'goal' && objective.status === 'completed').length,
  };
}

function eligible(item, stats) { return (Number(stats[item.metric]) || 0) >= item.target; }
function progressText(item, value = item.current) {
  if (item.metric === 'workoutMinutes') {
    const hours = minutes => `${Math.round(minutes / 60 * 10) / 10} ч`;
    return `${hours(value)} / ${hours(item.target)}`;
  }
  return `${value} / ${item.target}`;
}
function remainingText(item) {
  const remaining = Math.max(0, item.target - item.current);
  if (item.metric === 'workoutMinutes') return remaining >= 60 ? `Осталось ${Math.round(remaining / 60 * 10) / 10} ч` : `Осталось ${remaining} мин`;
  return `Осталось ${remaining}`;
}
function ensureState(data) {
  data.achievementSystem ||= { version: 1, entries: {}, showcase: [] };
  data.achievementSystem.version = 1;
  data.achievementSystem.entries ||= {};
  data.achievementSystem.showcase ||= [];
  return data.achievementSystem;
}

// The old page had ten derived badges and never awarded badge XP. Keep earned
// legacy badges as historical claims with a zero reward, then backfill measurable
// new badges as available without emitting startup notifications.
export function migrateAchievements(data, now = new Date().toISOString()) {
  const state = ensureState(data);
  if (state.migrationComplete) return false;
  const stats = achievementStats(data);
  const oldLearning = legacyLearningCount(data);
  const oldDone = allCheckEntries(data);
  const oldEarned = {
    first: oldDone >= 1, xp100: stats.xp >= 100, days3: stats.activeDays >= 3,
    days7: stats.activeDays >= 7, tasks10: oldDone >= 10, learn5: oldLearning >= 5,
    streak3: stats.streak >= 3, level2: stats.level >= 2,
  };
  for (const [id, earned] of Object.entries(oldEarned)) {
    if (earned && !state.entries[id]) state.entries[id] = { state: 'claimed', legacy: true, rewardXP: 0, claimedAt: null, unlockedAt: null };
  }
  for (const item of ACHIEVEMENT_CATALOG) {
    if (state.entries[item.id] || !eligible(item, stats)) continue;
    state.entries[item.id] = { state: 'unlocked', historical: true, unlockedAt: null };
  }
  state.showcase = state.showcase.filter(id => {
    const item = ACHIEVEMENT_CATALOG.find(achievement => achievement.id === id);
    return !!item && (['unlocked', 'claimed'].includes(state.entries[id]?.state) || eligible(item, stats));
  }).slice(0, 3);
  state.migrationComplete = true;
  state.migratedAt ||= now;
  return true;
}

export function reconcileAchievements(data, now = new Date().toISOString()) {
  const state = ensureState(data);
  if (!state.migrationComplete) { migrateAchievements(data, now); return []; }
  const stats = achievementStats(data);
  const newlyUnlocked = [];
  for (const item of ACHIEVEMENT_CATALOG) {
    const entry = state.entries[item.id];
    if (entry?.state === 'claimed') continue;
    if (!eligible(item, stats)) {
      if (entry?.state === 'unlocked') entry.state = 'locked';
      continue;
    }
    if (entry?.state === 'unlocked') continue;
    const unlocked = { ...(entry || {}), state: 'unlocked', unlockedAt: entry?.unlockedAt || now };
    if (!unlocked.notifiedAt) { unlocked.notifiedAt = now; newlyUnlocked.push(item); }
    state.entries[item.id] = unlocked;
  }
  state.showcase = state.showcase.filter(id => ['unlocked', 'claimed'].includes(state.entries[id]?.state));
  return newlyUnlocked;
}

export function achievementList(data) {
  const stats = achievementStats(data), entries = ensureState(data).entries;
  return ACHIEVEMENT_CATALOG.map(item => {
    const stored = entries[item.id];
    const state = stored?.state === 'claimed' ? 'claimed' : stored?.state === 'unlocked' || eligible(item, stats) ? 'unlocked' : 'locked';
    const progress = Number(stats[item.metric]) || 0;
    return { ...item, ok: state !== 'locked', state, progress: Math.min(progress, item.target), current: progress, reward: RARITIES[item.rarity].xp, record: stored || null };
  });
}

export function claimAchievement(data, id, now = new Date().toISOString()) {
  const item = ACHIEVEMENT_CATALOG.find(achievement => achievement.id === id);
  if (!item) return { ok: false, reason: 'Достижение не найдено' };
  const state = ensureState(data), previous = state.entries[id];
  if (previous?.state === 'claimed') return { ok: false, reason: 'Эта награда уже получена' };
  if (!eligible(item, achievementStats(data))) return { ok: false, reason: 'Условие больше не выполнено. Выполни его снова, чтобы забрать награду.' };
  const rewardXP = RARITIES[item.rarity].xp;
  state.entries[id] = { ...(previous || {}), state: 'claimed', claimedAt: now, rewardXP, legacy: false };
  return { ok: true, rewardXP, achievement: item };
}

export function toggleShowcase(data, id) {
  const state = ensureState(data);
  const achievement = achievementList(data).find(item => item.id === id);
  if (!achievement || achievement.state === 'locked') return { ok: false, reason: 'В витрину можно добавить только открытые достижения' };
  if (state.showcase.includes(id)) { state.showcase = state.showcase.filter(item => item !== id); return { ok: true, pinned: false }; }
  if (state.showcase.length >= 3) return { ok: false, reason: 'В витрине может быть не больше трёх трофеев' };
  state.showcase.push(id);
  return { ok: true, pinned: true };
}

export function renderAchievements(data, filters = { category: 'all', rarity: 'all', state: 'all' }) {
  const $ = id => document.getElementById(id);
  const list = achievementList(data), stats = achievementStats(data), state = ensureState(data);
  const claimed = list.filter(item => item.state === 'claimed').length;
  const opened = list.filter(item => item.state !== 'locked').length;
  const rare = list.filter(item => item.state !== 'locked' && ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].includes(item.rarity)).length;
  $('achievementProgress').textContent = `${claimed} / ${list.length} получено`;
  $('achievementStatUnlocked').textContent = `${opened} / ${list.length}`;
  $('achievementStatRare').textContent = String(rare);
  $('achievementStatStreak').textContent = String(stats.streak);
  $('achievementStatLevel').textContent = String(stats.level);

  const byId = new Map(list.map(item => [item.id, item]));
  $('achievementShowcase').innerHTML = Array.from({ length: 3 }, (_, index) => {
    const item = byId.get(state.showcase[index]);
    return item ? `<article class="trophy-slot trophy-${item.rarity.toLowerCase()}" style="--rarity:${RARITIES[item.rarity].color}"><span class="trophy-medal">${item.emoji}</span><div><strong>${esc(item.name)}</strong><small>${RARITIES[item.rarity].emoji} ${RARITIES[item.rarity].name} · +${item.record?.legacy ? 0 : item.record?.rewardXP ?? item.reward} XP</small></div><button data-unpin-trophy="${esc(item.id)}" aria-label="Убрать ${esc(item.name)} из витрины">×</button></article>`
      : `<div class="trophy-slot trophy-empty"><span class="trophy-medal">＋</span><strong>Свободный слот ${index + 1}</strong></div>`;
  }).join('');
  const pinnable = list.filter(item => item.state !== 'locked' && !state.showcase.includes(item.id));
  $('achievementTrophyPicker').innerHTML = `<select id="achievementTrophySelect" aria-label="Выбери достижение для витрины"><option value="">Добавить трофей…</option>${pinnable.map(item => `<option value="${esc(item.id)}">${item.emoji} ${esc(item.name)}</option>`).join('')}</select><button data-pin-trophy class="primary" ${state.showcase.length >= 3 || !pinnable.length ? 'disabled' : ''}>Закрепить</button>`;

  const nearest = list.filter(item => item.state === 'locked' && item.metric).map(item => ({ item, remaining: Math.max(0, item.target - item.current) }))
    .sort((a, b) => (a.remaining / a.item.target) - (b.remaining / b.item.target) || a.remaining - b.remaining).slice(0, 3);
  $('nearestAchievements').innerHTML = nearest.length ? nearest.map(({ item }) => {
    const percent = Math.round(item.progress / item.target * 100);
    return `<article class="nearest-achievement"><div class="nearest-head"><span>${item.emoji}</span><div><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></div><span class="rarity-chip rarity-${item.rarity.toLowerCase()}" style="--rarity:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].emoji} ${RARITIES[item.rarity].name}</span></div><div class="achievement-progress-track"><span style="width:${percent}%"></span></div><div class="nearest-foot"><span>${progressText(item)}</span><span>${item.target > item.current ? remainingText(item) : 'Условие выполнено'}</span></div></article>`;
  }).join('') : '<p class="achievement-empty small">Все измеримые условия уже выполнены.</p>';

  $('achievements').innerHTML = list.filter(item => (filters.category === 'all' || item.category === filters.category)
    && (filters.rarity === 'all' || item.rarity === filters.rarity)
    && (filters.state === 'all' || item.state === filters.state)).map(item => achievementCard(item, state.showcase.includes(item.id))).join('')
    || '<div class="achievement-empty">По этим фильтрам достижений нет.</div>';
  $('customAchievements').innerHTML = data.customAchievements?.length
    ? data.customAchievements.map(item => `<article class="custom-achievement"><strong>⭐ ${esc(item.name)}</strong><span>${esc(item.desc || 'Личная отметка, созданная AI-агентом')}</span></article>`).join('')
    : '<p class="achievement-empty small">Личных отметок пока нет.</p>';
}

function achievementCard(item, pinned) {
  const rarity = RARITIES[item.rarity], record = item.record;
  const progress = item.state === 'locked' && item.metric ? `<div class="achievement-progress-track"><span style="width:${Math.round(item.progress / item.target * 100)}%"></span></div><small class="achievement-progress-label">${progressText(item)}</small>` : '';
  const action = item.state === 'unlocked' ? `<div class="achievement-card-action"><span>🎁 Награда доступна · +${item.reward} XP</span><button class="primary" data-claim-achievement="${esc(item.id)}">Забрать награду</button></div>`
    : item.state === 'claimed' ? `<div class="achievement-card-action claimed"><span>${record?.legacy ? 'Получено до обновления · без повторной награды' : `Получено ${record?.claimedAt ? new Date(record.claimedAt).toLocaleDateString('ru-RU') : ''}`}</span><strong>+${record?.legacy ? 0 : record?.rewardXP || 0} XP</strong></div>`
      : `<div class="achievement-card-action locked-label"><span>🔒 Заблокировано</span><span>Награда +${item.reward} XP</span></div>`;
  const pin = item.state !== 'locked' ? `<button class="achievement-pin ${pinned ? 'is-pinned' : ''}" data-toggle-trophy="${esc(item.id)}" aria-label="${pinned ? 'Убрать из витрины' : 'Добавить в витрину'}">${pinned ? '★ В витрине' : '☆ В витрину'}</button>` : '';
  return `<article class="achievement-card state-${item.state} rarity-${item.rarity.toLowerCase()}" style="--rarity:${rarity.color}"><div class="achievement-card-top"><div class="achievement-medal ${item.state === 'locked' ? 'silhouette' : ''}">${item.state === 'locked' ? '✦' : item.emoji}</div><div class="achievement-card-titles"><strong>${esc(item.name)}</strong><span>${esc(item.description)}</span></div><span class="rarity-chip">${rarity.emoji} ${rarity.name}</span></div>${progress}<div class="achievement-card-bottom"><span class="achievement-category">${esc(ACHIEVEMENT_CATEGORIES[item.category])}</span>${action}${pin}</div></article>`;
}

export function legacyAchievementIds(data) {
  const stats = achievementStats(data);
  const oldDone = allCheckEntries(data);
  const entries = { first: oldDone >= 1, xp100: stats.xp >= 100, days3: stats.activeDays >= 3, days7: stats.activeDays >= 7,
    tasks10: oldDone >= 10, learn5: legacyLearningCount(data) >= 5, streak3: stats.streak >= 3, level2: stats.level >= 2 };
  return Object.keys(entries).filter(id => entries[id]);
}
