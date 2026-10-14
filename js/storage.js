import { ensureBody, validateBody } from './body.js?v=stage9.3.3';
import { ensureSports, validateSports } from './sports.js?v=stage9.3.3';
import { migrateOrganization } from './organization.js?v=stage9.3.3';
import { normalizeSchedule, validDate } from './schedule.js?v=stage9.3.3';
import { migrateAchievements } from './achievements.js?v=stage9.3.3';

// The only module that reads or writes localStorage. Legacy fields remain unchanged.
export const STORAGE_KEY = 'lifeOS_standalone_v1';

const defaultTasks = [
  { id: 't1', name: 'Выпить достаточно воды', category: 'Здоровье', xp: 10, frequency: 'daily', active: true },
  { id: 't2', name: 'Развитие / обучение 20 минут', category: 'Обучение', xp: 20, frequency: 'daily', active: true },
  { id: 't3', name: 'Физическая активность', category: 'Спорт', xp: 25, frequency: '3week', active: true },
  { id: 't4', name: 'Главная задача по работе', category: 'Работа', xp: 20, frequency: 'daily', active: true },
];

export function createInitialData() {
  return ensureBody(ensureSports(migrateOrganization({
    tasks: defaultTasks.map(task => ({ ...task })),
    checks: {},
    customAchievements: [],
    achievementSystem: { version: 1, entries: {}, showcase: [] },
    playerName: 'Игрок',
    workSchedule: normalizeSchedule(),
    subtaskChecks: {}, taskOverrides: {}, completionRewards: {},
    dayFocus: {},
  })));
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = validateData(JSON.parse(raw));
      const data = ensureBody(ensureSports(migrateOrganization({ ...createInitialData(), ...saved, categories: saved.categories, workSchedule: normalizeSchedule(saved.workSchedule) })));
      migrateAchievements(data); // Read-time normalization stays in memory; never rewrites a backup.
      return data;
    }
  } catch (error) {
    console.warn('Could not load saved data', error);
  }
  const initial = createInitialData();
  migrateAchievements(initial);
  return initial;
}

export function saveData(data) {
  ensureBody(ensureSports(migrateOrganization(data)));
  migrateAchievements(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  const data = createInitialData();
  saveData(data);
  return data;
}

export function serializeData(data) {
  return JSON.stringify(data, null, 2);
}

// Add defaults without changing legacy fields; validate before replacing data.
export function parseBackup(text) {
  const data = validateData(JSON.parse(text));
  const migrated = ensureBody(ensureSports(migrateOrganization({
    ...data,
    tasks: data.tasks,
    checks: data.checks || {},
    customAchievements: data.customAchievements || [],
    achievementSystem: data.achievementSystem || { version: 1, entries: {}, showcase: [] },
    playerName: data.playerName || 'Игрок',
    workSchedule: normalizeSchedule(data.workSchedule),
    subtaskChecks: data.subtaskChecks || {},
    taskOverrides: data.taskOverrides || {},
    completionRewards: data.completionRewards || {},
    dayFocus: data.dayFocus || {},
  })));
  migrateAchievements(migrated);
  return migrated;
}

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function safeId(value) {
  return typeof value === 'string' && !!value && !['__proto__', 'constructor', 'prototype'].includes(value);
}
// Validate before replacing current data. Unknown additive fields survive import.
export function validateData(data) {
  if (!isRecord(data) || !Array.isArray(data.tasks) || !isRecord(data.checks)) throw new Error('Invalid LIFE OS backup');
  const ids = new Set();
  function validateTask(task) {
    if (!isRecord(task) || !safeId(task.id)) throw new Error('Invalid task');
    if (task.frequency === 'once' && !validDate(task.date)) throw new Error('Invalid task date');
    if (task.date != null && !validDate(task.date)) throw new Error('Invalid task date');
    if (task.subtasks !== undefined) {
      if (!Array.isArray(task.subtasks)) throw new Error('Invalid subtasks');
      const seen = new Set();
      for (const step of task.subtasks) {
        if (!isRecord(step) || !safeId(step.id) || typeof step.name !== 'string' || seen.has(step.id)) throw new Error('Invalid subtask');
        seen.add(step.id);
      }
    }
    if (task.suitableDays !== undefined && !Array.isArray(task.suitableDays)) throw new Error('Invalid suitable days');
  }
  for (const task of data.tasks) {
    validateTask(task);
    if (ids.has(task.id)) throw new Error('Duplicate task ID');
    ids.add(task.id);
  }
  if (data.customAchievements !== undefined && (!Array.isArray(data.customAchievements) || data.customAchievements.some(item => !isRecord(item)))) throw new Error('Invalid achievements');
  if (data.achievementSystem !== undefined) {
    const system = data.achievementSystem;
    if (!isRecord(system) || system.version !== 1 || !isRecord(system.entries) || !Array.isArray(system.showcase) || system.showcase.length > 3 || new Set(system.showcase).size !== system.showcase.length || (system.migrationComplete !== undefined && typeof system.migrationComplete !== 'boolean') || (system.migratedAt != null && (typeof system.migratedAt !== 'string' || !Number.isFinite(Date.parse(system.migratedAt)))) ) throw new Error('Invalid achievement state');
    for (const [id, entry] of Object.entries(system.entries)) {
      if (!safeId(id) || !isRecord(entry) || !['locked', 'unlocked', 'claimed'].includes(entry.state)) throw new Error('Invalid achievement entry');
      if (entry.rewardXP !== undefined && (!Number.isFinite(entry.rewardXP) || entry.rewardXP < 0 || entry.rewardXP > 500)) throw new Error('Invalid achievement reward');
      for (const field of ['claimedAt', 'unlockedAt']) if (entry[field] != null && (typeof entry[field] !== 'string' || !Number.isFinite(Date.parse(entry[field])))) throw new Error('Invalid achievement date');
    }
    if (system.showcase.some(id => !safeId(id))) throw new Error('Invalid achievement showcase');
  }
  for (const field of ['checks', 'subtaskChecks', 'taskOverrides', 'completionRewards']) {
    if (data[field] === undefined) continue;
    if (!isRecord(data[field])) throw new Error('Invalid progress');
    for (const [date, entries] of Object.entries(data[field])) {
      if (!validDate(date) || !isRecord(entries)) throw new Error('Invalid progress date');
      for (const [id, value] of Object.entries(entries)) {
        if (!safeId(id)) throw new Error('Invalid progress ID');
        if (field === 'checks' && typeof value !== 'boolean') throw new Error('Invalid completion');
        if (field === 'subtaskChecks') {
          if (!isRecord(value) || Object.entries(value).some(([subId, done]) => !safeId(subId) || typeof done !== 'boolean')) throw new Error('Invalid subtask progress');
        }
        if (field === 'taskOverrides') validateTask(value);
        if (field === 'completionRewards' && !isRecord(value)) throw new Error('Invalid reward');
      }
    }
  }
  if (data.dayFocus !== undefined) {
    if (!isRecord(data.dayFocus)) throw new Error('Invalid day focus');
    for (const [date, ids] of Object.entries(data.dayFocus)) {
      if (!validDate(date) || !Array.isArray(ids) || ids.some(id => !safeId(id)) || new Set(ids).size !== ids.length) throw new Error('Invalid day focus');
    }
  }
  for (const field of ['categories', 'objectives', 'stages']) {
    if (data[field] === undefined) continue;
    if (!Array.isArray(data[field])) throw new Error('Invalid organization collection');
    const seen = new Set();
    for (const item of data[field]) {
      if (!isRecord(item) || !safeId(item.id) || typeof item.name !== 'string' || !item.name.trim() || seen.has(item.id)) throw new Error('Invalid organization entity');
      seen.add(item.id);
      if (field !== 'categories' && !['active', 'paused', 'completed'].includes(item.status)) throw new Error('Invalid status');
      if (field === 'objectives' && (!['goal', 'project'].includes(item.type) || (item.startDate && !validDate(item.startDate)) || (item.endDate && !validDate(item.endDate)))) throw new Error('Invalid objective');
      if (field === 'stages' && !data.objectives?.some(objective => objective.id === item.objectiveId)) throw new Error('Invalid stage parent');
    }
  }
  validateSports(data.sports);
  validateBody(data.body);
  return data;
}
