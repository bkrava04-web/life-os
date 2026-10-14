import { boundPrograms, stageExamStatus } from './sports.js?v=stage9.3.3';
// Independent organization model: no DOM, storage or XP side effects.
const initialCategories = [
  ['Работа', '▣', '#94a5d4'], ['Спорт', '⚽', '#8fc9ae'], ['Бизнес', '◆', '#d9b778'],
  ['Здоровье', '♡', '#d995ad'], ['Обучение', '✦', '#ab95eb'], ['Личное', '☀', '#88b8d0'],
];
export const entityId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12);
const normalizedName = name => String(name || '').trim().toLocaleLowerCase('ru');
function legacyCategoryId(name) {
  let hash = 2166136261;
  for (const char of normalizedName(name)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return 'cat-' + (hash >>> 0).toString(36);
}
export function migrateOrganization(data) {
  const legacy = data.categories === undefined;
  data.categories ||= [];
  data.objectives ||= [];
  data.stages ||= [];
  if (legacy) {
    const names = [...initialCategories.map(([name]) => name), ...data.tasks.map(task => task.category),
      ...Object.values(data.taskOverrides || {}).flatMap(entries => Object.values(entries).map(task => task.category))];
    for (const name of names) {
      if (!normalizedName(name) || data.categories.some(category => normalizedName(category.name) === normalizedName(name))) continue;
      const preset = initialCategories.find(([value]) => normalizedName(value) === normalizedName(name));
      let id = legacyCategoryId(name);
      while (data.categories.some(category => category.id === id)) id += '-1';
      data.categories.push({ id, name: String(name).trim(), icon: preset?.[1] || '◇', color: preset?.[2] || '#a594f9', achievementCategory: ['Обучение', 'Личное'].includes(String(name).trim()) ? String(name).trim() : null });
    }
  }
  const definitions = [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)];
  for (const task of definitions) {
    if (task.categoryId === undefined) task.categoryId = data.categories.find(category => normalizedName(category.name) === normalizedName(task.category))?.id || null;
    task.objectiveId ??= null;
    task.stageId ??= null;
  }
  // Snapshot existing rewards before editable category names can change. This
  // only preserves XP already derived from checks; it creates no completions.
  data.completionRewards ||= {};
  for (const [date, checks] of Object.entries(data.checks)) {
    for (const [id, done] of Object.entries(checks)) {
      const base = data.tasks.find(task => task.id === id);
      if (!done || !base || data.completionRewards[date]?.[id]) continue;
      const task = { ...base, ...(data.taskOverrides?.[date]?.[id] || {}) };
      data.completionRewards[date] ||= {};
      data.completionRewards[date][id] = { xp: Number(task.xp) || 0, category: achievementCategory(data, task) };
    }
  }
  data.organizationVersion = 1;
  return data;
}
export function categoryName(data, task) {
  if (task.categoryId === undefined) return task.category || 'Без категории';
  return data.categories?.find(category => category.id === task.categoryId)?.name || 'Без категории';
}
export function achievementCategory(data, task) {
  return data.categories?.find(category => category.id === task.categoryId)?.achievementCategory || task.category;
}
export function categoryById(data, id) { return data.categories.find(category => category.id === id); }
export function taskPath(data, task) {
  const objective = data.objectives?.find(objective => objective.id === task.objectiveId);
  const stage = data.stages?.find(stage => stage.id === task.stageId && stage.objectiveId === objective?.id);
  return objective ? [objective.type === 'project' ? 'Проект: ' + objective.name : 'Цель: ' + objective.name, stage?.name].filter(Boolean).join(' → ') : '';
}
export function saveCategory(data, id, fields) {
  const name = fields.name.trim();
  if (!name) throw new Error('Укажи название категории');
  if (data.categories.some(category => category.id !== id && normalizedName(category.name) === normalizedName(name))) throw new Error('Категория с таким названием уже существует');
  const category = id ? categoryById(data, id) : { id: entityId(), achievementCategory: ['Обучение', 'Личное'].includes(name) ? name : null };
  if (!category) throw new Error('Категория не найдена');
  Object.assign(category, { name, icon: fields.icon.trim().slice(0, 8) || '◇', color: /^#[0-9a-f]{6}$/i.test(fields.color) ? fields.color : '#a594f9' });
  if (!id) data.categories.push(category);
  for (const task of [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)]) {
    if (task.categoryId === category.id) task.category = category.name;
  }
  return category;
}
export function removeCategory(data, id, replacementId = null) {
  if (replacementId === id || (replacementId && !categoryById(data, replacementId))) throw new Error('Выбери другую категорию');
  const replacement = categoryById(data, replacementId);
  for (const task of [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)]) {
    if (task.categoryId === id) { task.categoryId = replacementId; task.category = replacement?.name || ''; }
  }
  for (const objective of data.objectives) if (objective.categoryId === id) objective.categoryId = replacementId;
  data.categories = data.categories.filter(category => category.id !== id);
}
export function saveObjective(data, id, fields) {
  if (!fields.name.trim()) throw new Error('Укажи название');
  const objective = id ? data.objectives.find(objective => objective.id === id) : { id: entityId() };
  if (!objective) throw new Error('Цель или проект не найдены');
  Object.assign(objective, fields, { name: fields.name.trim() });
  if (!id) data.objectives.push(objective);
  // Linked tasks always belong to the category of their objective.
  for (const task of [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)]) {
    if (task.objectiveId === objective.id) { task.categoryId = objective.categoryId; task.category = categoryById(data, objective.categoryId)?.name || ''; }
  }
  return objective;
}
export function saveStage(data, id, fields) {
  if (!fields.name.trim()) throw new Error('Укажи название этапа');
  const stage = id ? data.stages.find(stage => stage.id === id) : { id: entityId() };
  if (!stage || !data.objectives.some(objective => objective.id === fields.objectiveId)) throw new Error('Цель не найдена');
  if (fields.status === 'completed' && stageExamStatus(data, stage.id) !== 'none' && stageExamStatus(data, stage.id) !== 'passed') throw new Error('Сначала сдай обязательный экзамен спортивного этапа');
  Object.assign(stage, fields, { name: fields.name.trim() });
  if (!id) data.stages.push(stage);
  return stage;
}
export function removeStage(data, id) {
  for (const task of [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)]) if (task.stageId === id) task.stageId = null;
  data.stages = data.stages.filter(stage => stage.id !== id);
}
export function moveStage(data, id, direction) {
  const stage = data.stages.find(stage => stage.id === id);
  if (!stage) return;
  const siblings = data.stages.filter(item => item.objectiveId === stage.objectiveId);
  const target = siblings[siblings.indexOf(stage) + direction];
  if (!target) return;
  const a = data.stages.indexOf(stage), b = data.stages.indexOf(target);
  [data.stages[a], data.stages[b]] = [data.stages[b], data.stages[a]];
}
export function removeObjective(data, id) {
  for (const task of [...data.tasks, ...Object.values(data.taskOverrides || {}).flatMap(Object.values)]) {
    if (task.objectiveId === id) { task.objectiveId = null; task.stageId = null; }
  }
  data.stages = data.stages.filter(stage => stage.objectiveId !== id);
  data.objectives = data.objectives.filter(objective => objective.id !== id);
}
function effectiveTask(data, task, date) { return { ...task, ...(data.taskOverrides?.[date]?.[task.id] || {}) }; }
function sameLink(a, b) { return (a.objectiveId || null) === (b.objectiveId || null) && (a.stageId || null) === (b.stageId || null); }
// A series is one measurable unit. Explicitly re-linked dates are finite units.
export function linkedUnits(data, objectiveId, stageId = undefined) {
  const units = [];
  const matches = task => task.objectiveId === objectiveId && (stageId === undefined || (task.stageId || null) === stageId);
  for (const task of data.tasks) {
    if (matches(task)) {
      const done = Object.entries(data.checks).some(([date, checks]) => checks[task.id] && (task.frequency !== 'once' || task.date === date) && sameLink(effectiveTask(data, task, date), task));
      units.push({ task, date: task.frequency === 'once' ? task.date : null, done });
    }
    for (const [date, entries] of Object.entries(data.taskOverrides || {})) {
      const override = entries[task.id];
      if (!override) continue;
      const effective = effectiveTask(data, task, date);
      if (!sameLink(effective, task) && matches(effective)) units.push({ task: effective, date, done: !!data.checks[date]?.[task.id] });
    }
  }
  return units;
}
function progress(values) {
  return values.length ? { defined: true, value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100), total: values.length } : { defined: false, value: null, total: 0 };
}
export function stageProgress(data, stage) {
  const units = linkedUnits(data, stage.objectiveId, stage.id);
  const result = progress(units.map(unit => unit.done ? 1 : 0));
  return { ...result, requiresConfirmation: boundPrograms(data, stage.id).length > 0, examStatus: stageExamStatus(data, stage.id), value: result.defined && stage.status === 'completed' ? 100 : result.value, done: units.filter(unit => unit.done).length };
}
export function objectiveProgress(data, objective) {
  const stages = data.stages.filter(stage => stage.objectiveId === objective.id);
  const values = stages.map(stage => {
    if (stage.status === 'completed') return 1;
    if (boundPrograms(data, stage.id).length) return 0;
    const result = stageProgress(data, stage);
    return result.defined ? result.value / 100 : 0;
  });
  values.push(...linkedUnits(data, objective.id, null).map(unit => unit.done ? 1 : 0));
  return progress(values);
}
