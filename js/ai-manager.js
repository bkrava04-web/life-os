import { saveObjective, saveStage } from './organization.js?v=stage9.3.3';
import { addTask, editTask, scheduled } from './tasks.js?v=stage9.3.3';
import { daySchedule, overnightCarry, validDate } from './schedule.js?v=stage9.3.3';
import { today } from './calendar.js?v=stage9.3.3';

export const MAX_PROPOSAL_ACTIONS = 50;
const MAX_PROPOSAL_CHARS = 25000;
const TEMP_REF = /^tmp_[a-z0-9_-]{1,40}$/i;
const SAFE_ID = /^[\w-]{1,100}$/;
const OBJECTIVE_FIELDS = new Set(['name', 'description']);
const TASK_FIELDS = new Set(['name', 'description', 'priority', 'date', 'categoryId', 'objectiveId', 'stageId']);
const OPERATIONS = new Set([
  'create_goal', 'create_project', 'create_stage', 'create_task', 'create_subtask',
  'edit_goal', 'edit_project', 'edit_stage', 'edit_task',
]);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const ownKeysOnly = (value, allowed, label) => {
  if (!record(value)) throw new Error(`${label}: ожидается объект`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}: неизвестное поле «${key}»`);
};
const cleanText = (value, label, max, { optional = false, nonempty = false } = {}) => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new Error(`${label}: ожидается текст${nonempty ? ' (не пустой)' : ''} до ${max} символов`);
  return value;
};
function ref(value, label) {
  if (typeof value !== 'string' || !value || value.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${label}: некорректная ссылка`);
  return value;
}
function checkDate(value, label, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return value ?? null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validDate(value)) throw new Error(`${label}: укажи существующую дату в формате ГГГГ-ММ-ДД`);
  return value;
}
function checkTemp(value, used, label) {
  if (typeof value !== 'string' || !TEMP_REF.test(value) || used.has(value)) throw new Error(`${label}: нужен уникальный временный идентификатор tmp_…`);
  used.add(value);
}
function checkRefExists(data, value, kind, tempKinds, label) {
  ref(value, label);
  if (TEMP_REF.test(value)) {
    if (tempKinds.get(value) !== kind) throw new Error(`${label}: временная ссылка не создана ранее или имеет другой тип`);
    return;
  }
  const list = kind === 'objective' ? data.objectives : kind === 'stage' ? data.stages : kind === 'category' ? data.categories : data.tasks;
  if (!list?.some(item => item.id === value)) throw new Error(`${label}: объект «${value}» не найден`);
}

function normalizeAction(raw, data, state) {
  if (!record(raw) || typeof raw.operation !== 'string' || !OPERATIONS.has(raw.operation)) throw new Error('Неизвестное или некорректное действие предложения');
  const op = raw.operation;
  if (op.startsWith('create_') && op !== 'create_subtask') {
    ownKeysOnly(raw, new Set(['operation', 'temp_ref', 'data']), op);
    checkTemp(raw.temp_ref, state.tempRefs, op);
    state.tempKinds.set(raw.temp_ref, op === 'create_goal' || op === 'create_project' ? 'objective' : op === 'create_stage' ? 'stage' : 'task');
    if (!record(raw.data)) throw new Error(`${op}: отсутствуют данные`);
    if (op === 'create_goal' || op === 'create_project') {
      ownKeysOnly(raw.data, new Set(['name', 'description', 'category_ref', 'priority', 'startDate', 'endDate']), op);
      const name = cleanText(raw.data.name, 'Название', 150, { nonempty: true });
      const description = cleanText(raw.data.description ?? '', 'Описание', 5000);
      const categoryRef = raw.data.category_ref == null ? null : ref(raw.data.category_ref, 'Категория');
      if (categoryRef) checkRefExists(data, categoryRef, 'category', state.tempKinds, 'Категория');
      const priority = raw.data.priority ?? 'normal';
      if (!['low', 'normal', 'high'].includes(priority)) throw new Error('Некорректный приоритет цели или проекта');
      const startDate = checkDate(raw.data.startDate, 'Дата начала', { optional: true });
      const endDate = checkDate(raw.data.endDate, 'Дата завершения', { optional: true });
      if (startDate && endDate && endDate < startDate) throw new Error('Дата завершения раньше даты начала');
      return { operation: op, temp_ref: raw.temp_ref, data: { name, description, category_ref: categoryRef, priority, startDate, endDate } };
    }
    if (op === 'create_stage') {
      ownKeysOnly(raw.data, new Set(['objective_ref', 'name', 'description']), op);
      const objectiveRef = ref(raw.data.objective_ref, 'Цель или проект');
      checkRefExists(data, objectiveRef, 'objective', state.tempKinds, 'Цель или проект');
      return { operation: op, temp_ref: raw.temp_ref, data: { objective_ref: objectiveRef, name: cleanText(raw.data.name, 'Название этапа', 150, { nonempty: true }), description: cleanText(raw.data.description ?? '', 'Описание этапа', 5000) } };
    }
    ownKeysOnly(raw.data, new Set(['name', 'description', 'frequency', 'date', 'category_ref', 'objective_ref', 'stage_ref', 'type', 'priority']), op);
    const name = cleanText(raw.data.name, 'Название задания', 200, { nonempty: true });
    const description = cleanText(raw.data.description ?? '', 'Описание задания', 5000);
    const frequency = raw.data.frequency ?? 'once';
    if (!['once', 'daily', '3week', '2week', 'weekly'].includes(frequency)) throw new Error('Некорректное повторение задания');
    const date = frequency === 'once' ? checkDate(raw.data.date, 'Дата задания') : raw.data.date == null ? null : (() => { throw new Error('Повторяющееся задание не принимает дату начала в модели LIFE OS; для плана с датами используй once'); })();
    const categoryRef = raw.data.category_ref == null ? null : ref(raw.data.category_ref, 'Категория');
    const objectiveRef = raw.data.objective_ref == null ? null : ref(raw.data.objective_ref, 'Цель или проект');
    const stageRef = raw.data.stage_ref == null ? null : ref(raw.data.stage_ref, 'Этап');
    if (categoryRef) checkRefExists(data, categoryRef, 'category', state.tempKinds, 'Категория');
    if (objectiveRef) checkRefExists(data, objectiveRef, 'objective', state.tempKinds, 'Цель или проект');
    if (stageRef) checkRefExists(data, stageRef, 'stage', state.tempKinds, 'Этап');
    if ((objectiveRef === null) !== (stageRef === null) && stageRef) throw new Error('Для этапа нужно указать связанную цель или проект');
    const type = raw.data.type ?? 'simple';
    if (!['simple', 'compound'].includes(type)) throw new Error('Некорректный тип задания');
    const priority = raw.data.priority ?? 'normal';
    if (!['low', 'normal', 'high'].includes(priority)) throw new Error('Приоритет задания должен быть low, normal или high');
    return { operation: op, temp_ref: raw.temp_ref, data: { name, description, frequency, date, category_ref: categoryRef, objective_ref: objectiveRef, stage_ref: stageRef, type, priority } };
  }
  if (op === 'create_subtask') {
    ownKeysOnly(raw, new Set(['operation', 'data']), op);
    ownKeysOnly(raw.data, new Set(['task_ref', 'name', 'required']), op);
    const taskRef = ref(raw.data.task_ref, 'Задание');
    checkRefExists(data, taskRef, 'task', state.tempKinds, 'Задание');
    if (raw.data.required !== undefined && typeof raw.data.required !== 'boolean') throw new Error('Подзадача: required должен быть true или false');
    return { operation: op, data: { task_ref: taskRef, name: cleanText(raw.data.name, 'Название подзадачи', 200, { nonempty: true }), required: raw.data.required ?? true } };
  }
  ownKeysOnly(raw, new Set(['operation', 'data']), op);
  if (!record(raw.data)) throw new Error(`${op}: отсутствуют данные`);
  if (op === 'edit_goal' || op === 'edit_project') {
    ownKeysOnly(raw.data, new Set(['id', 'fields']), op);
    const id = ref(raw.data.id, 'ID цели или проекта');
    checkRefExists(data, id, 'objective', state.tempKinds, 'Цель или проект');
    const existing = data.objectives.find(item => item.id === id);
    if (!TEMP_REF.test(id) && existing?.type !== (op === 'edit_goal' ? 'goal' : 'project')) throw new Error(`${op}: тип объекта не совпадает`);
    ownKeysOnly(raw.data.fields, OBJECTIVE_FIELDS, `${op}.fields`);
    const patch = {};
    if ('name' in raw.data.fields) patch.name = cleanText(raw.data.fields.name, 'Название', 150, { nonempty: true });
    if ('description' in raw.data.fields) patch.description = cleanText(raw.data.fields.description, 'Описание', 5000);
    if (!Object.keys(patch).length) throw new Error(`${op}: нет изменяемых полей`);
    return { operation: op, data: { id, fields: patch } };
  }
  if (op === 'edit_stage') {
    ownKeysOnly(raw.data, new Set(['id', 'fields']), op);
    const id = ref(raw.data.id, 'ID этапа');
    checkRefExists(data, id, 'stage', state.tempKinds, 'Этап');
    ownKeysOnly(raw.data.fields, OBJECTIVE_FIELDS, `${op}.fields`);
    const patch = {};
    if ('name' in raw.data.fields) patch.name = cleanText(raw.data.fields.name, 'Название этапа', 150, { nonempty: true });
    if ('description' in raw.data.fields) patch.description = cleanText(raw.data.fields.description, 'Описание этапа', 5000);
    if (!Object.keys(patch).length) throw new Error('Нет изменяемых полей этапа');
    return { operation: op, data: { id, fields: patch } };
  }
  ownKeysOnly(raw.data, new Set(['id', 'fields']), op);
  const id = ref(raw.data.id, 'ID задания');
  checkRefExists(data, id, 'task', state.tempKinds, 'Задание');
  ownKeysOnly(raw.data.fields, TASK_FIELDS, 'Поля задания');
  const patch = {};
  const fields = raw.data.fields;
  if ('name' in fields) patch.name = cleanText(fields.name, 'Название задания', 200, { nonempty: true });
  if ('description' in fields) patch.description = cleanText(fields.description, 'Описание задания', 5000);
  if ('priority' in fields) {
    if (!['low', 'normal', 'high'].includes(fields.priority)) throw new Error('Приоритет должен быть low, normal или high');
    patch.priority = fields.priority;
  }
  if ('date' in fields) {
    patch.date = checkDate(fields.date, 'Срок задания');
    const task = data.tasks.find(item => item.id === id);
    if (task && task.frequency !== 'once' && !TEMP_REF.test(id)) throw new Error('Срок можно менять только у задания на конкретную дату; повторяющуюся серию не менял');
  }
  for (const key of ['categoryId', 'objectiveId', 'stageId']) if (key in fields) patch[key] = fields[key] == null ? null : ref(fields[key], key);
  if (!Object.keys(patch).length) throw new Error('Нет изменяемых полей задания');
  const task = data.tasks.find(item => item.id === id);
  const currentObjective = task && data.objectives.find(item => item.id === task.objectiveId);
  const objectiveId = patch.objectiveId === undefined ? (task?.objectiveId || null) : patch.objectiveId;
  const stageId = patch.stageId === undefined ? (task?.stageId || null) : patch.stageId;
  if (objectiveId && !TEMP_REF.test(objectiveId)) checkRefExists(data, objectiveId, 'objective', state.tempKinds, 'Цель или проект');
  if (stageId && !TEMP_REF.test(stageId)) checkRefExists(data, stageId, 'stage', state.tempKinds, 'Этап');
  if (TEMP_REF.test(objectiveId || '')) checkRefExists(data, objectiveId, 'objective', state.tempKinds, 'Цель или проект');
  if (TEMP_REF.test(stageId || '')) checkRefExists(data, stageId, 'stage', state.tempKinds, 'Этап');
  if (stageId && !objectiveId) throw new Error('У самостоятельного задания не может быть этапа');
  if (stageId) {
    const stage = data.stages.find(item => item.id === stageId);
    if (stage && stage.objectiveId !== objectiveId) throw new Error('Этап не относится к выбранной цели или проекту');
  }
  if (objectiveId && !TEMP_REF.test(objectiveId)) {
    const objective = data.objectives.find(item => item.id === objectiveId);
      if (patch.categoryId !== undefined && patch.categoryId !== (objective.categoryId || null)) throw new Error('Категория задания должна совпадать с категорией цели или проекта');
    patch.categoryId = objective.categoryId || null;
  } else if (patch.objectiveId === null) {
    if (patch.stageId === undefined) patch.stageId = null;
  }
  for (const field of ['categoryId']) if (patch[field]) checkRefExists(data, patch[field], 'category', state.tempKinds, 'Категория');
  if (patch.categoryId !== undefined && !objectiveId) {
    const category = patch.categoryId && data.categories.find(item => item.id === patch.categoryId);
    patch.category = category?.name || '';
  }
  return { operation: op, data: { id, fields: patch } };
}

export function extractProposalJSON(answer) {
  const source = String(answer || '').trim();
  if (!source || source.length > MAX_PROPOSAL_CHARS) throw new Error('Ответ предложения пустой или слишком большой');
  const fence = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const input = fence ? fence[1] : source;
  const start = input.indexOf('{');
  if (start < 0) throw new Error('В ответе нет JSON-предложения');
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let index = start; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) { end = index + 1; break; }
  }
  if (end < 0) throw new Error('JSON-предложение не завершено');
  if (input.slice(end).trim().replace(/^```\s*$/, '').trim()) throw new Error('После JSON есть лишний текст');
  try { return JSON.parse(input.slice(start, end)); }
  catch { throw new Error('AI вернул некорректный JSON. Попроси сформировать предложение ещё раз.'); }
}

function explicitLinkedName(text, name, kind) {
  if (!name) return false;
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const noun = kind === 'project' ? 'проект(?:а|у|е|ом)?' : kind === 'goal' ? 'цел(?:ь|и|ью)' : 'этап(?:а|у|е|ом)?';
  const pattern = new RegExp(`(?:^|[\\s,;:])(?:в|для|к|по)\\s+(?:${noun}\\s+)?${escapeRegex(name)}(?=$|[\\s,.;:!?])`, 'iu');
  if (pattern.test(String(text || ''))) return true;
  if (kind !== 'project') return false;
  const compact = String(name).toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '');
  if (!compact.startsWith('ai') || compact.length <= 2) return false;
  const alias = compact.slice(2);
  return new RegExp(`(?:^|[\\s,;:])(?:в|для|к|по)\\s+(?:${noun}\\s+)?${alias}(?=$|[\\s,.;:!?])`, 'iu').test(String(text || ''));
}
function explicitlyCreatesName(text, name, kind) {
  if (!name) return false;
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const noun = kind === 'project' ? 'проект' : 'цель';
  return new RegExp(`(?:создай(?:те)?|создать|добавь(?:те)?|добавить|заведи(?:те)?|завести)\\s+(?:(?:мне|новый|новую)\\s+)*${noun}\\s+${escapeRegex(name)}(?=$|[\\s,.;:!?])`, 'iu').test(String(text || ''));
}
function explicitCategory(data, message) {
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const matches = (data.categories || []).filter(category => new RegExp(`(?:^|[\\s,;:])(?:категори(?:я|и|ю)|в категорию|по категории)\\s+${escapeRegex(category.name)}(?=$|[\\s,.;:!?])`, 'iu').test(message));
  if (matches.length > 1) throw new Error(`Уточни категорию задачи: указано несколько вариантов — ${matches.map(item => `«${item.name}»`).join(', ')}.`);
  return matches[0]?.id || null;
}

const normalizeMatch = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/[«»“”"']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

function explicitObjectiveTarget(data, message) {
  const candidates = (data.objectives || []).filter(item => explicitLinkedName(message, item.name, item.type === 'project' ? 'project' : 'goal'));
  if (candidates.length > 1) throw new Error(`Уточни, к какому проекту или цели привязать задачу: ${candidates.map(item => `«${item.name}»`).join(', ')}.`);
  if (!candidates.length && /(?:проект[а-яё]*|цел(?:ь|и|ью))/iu.test(message)) throw new Error('Не удалось однозначно найти названный проект или цель. Уточни точное название; предложение не сохранено.');
  return candidates[0] || null;
}

function explicitTransferTask(data, message) {
  const quoted = String(message).match(/(?:перенеси|перемести)\s+(?:задачу\s+)?[«“"]([^»”"]+)[»”"]/iu)?.[1];
  if (!quoted) throw new Error('Уточни название задачи для переноса, лучше укажи его в кавычках.');
  const matches = (data.tasks || []).filter(task => normalizeMatch(task.name) === normalizeMatch(quoted));
  if (!matches.length) throw new Error(`Не нашёл задачу «${quoted}». Проверь название; предложение не сохранено.`);
  if (matches.length > 1) {
    const details = matches.map(task => {
      const project = data.objectives?.find(item => item.id === task.objectiveId)?.name || 'Без проекта';
      return `«${task.name}» · ${task.frequency === 'once' ? task.date || 'без даты' : task.frequency} · ${project}`;
    });
    throw new Error(`Нашёл несколько задач с таким названием. Уточни, какую перенести: ${details.join('; ')}.`);
  }
  return matches[0];
}

function taskCommand(message) {
  const text = String(message || '').trim();
  if (!/задач[а-яё]*/iu.test(text)) return null;
  if (/^(?:перенеси(?:те)?|перемести(?:те)?)/iu.test(text) && /(?:^|\s)(?:в|для|к)\s+(?:проект[а-яё]*\s+)?[\p{L}\p{N}]/iu.test(text)) return 'transfer';
  if (/^(?:переименуй(?:те)?|измени(?:те)?\s+(?:дату\s+)?|обнови(?:те)?|поменяй(?:те)?|поставь(?:те)?|установи(?:те)?)/iu.test(text)) return 'edit';
  if (/^(?:создай(?:те)?|добавь(?:те)?|добавить|создать)/iu.test(text)) return 'create';
  return null;
}
export function taskCommandType(message) { return taskCommand(message); }

// Verify task intent against operation type and stable IDs before a proposal
// can be validated, persisted, or given an Apply button.
export function assertTaskProposalIntent(data, rawProposal, userMessage) {
  const command = taskCommand(userMessage);
  if (!command) return rawProposal;
  if (!record(rawProposal) || !Array.isArray(rawProposal.actions)) throw new Error('AI не вернул проверяемый список действий. Ничего не изменено; повтори запрос.');
  if (command === 'create') {
    const actions = rawProposal.actions.filter(item => item?.operation === 'create_task');
    if (actions.length !== 1 || rawProposal.actions.some(item => !['create_task', 'create_subtask'].includes(item?.operation))) throw new Error('Команда просит создать задачу, а AI предложил другое действие. Ничего не изменено; повтори запрос.');
    const target = explicitObjectiveTarget(data, userMessage);
    const ref = actions[0]?.data?.objective_ref ?? null;
    if ((target?.id || null) !== ref) throw new Error(target
      ? `AI не связал задачу с явно указанным проектом «${target.name}». Предложение отклонено; повтори запрос.`
      : 'AI добавил к задаче неуказанный проект или цель. Предложение отклонено; повтори запрос.');
    return rawProposal;
  }
  if (command === 'transfer') {
    const task = explicitTransferTask(data, userMessage);
    const target = explicitObjectiveTarget(data, userMessage);
    if (!target || target.type !== 'project') throw new Error('Для переноса укажи существующий проект.');
    if (rawProposal.actions.length !== 1 || rawProposal.actions[0]?.operation !== 'edit_task') throw new Error('Команда просит перенести существующую задачу, а AI предложил создать новую или другое действие. Ничего не изменено; повтори запрос.');
    const action = rawProposal.actions[0], fields = action?.data?.fields || {};
    const allowed = new Set(['objectiveId', 'stageId', 'categoryId']);
    if (action.data?.id !== task.id || fields.objectiveId !== target.id || fields.stageId !== null || Object.keys(fields).some(key => !allowed.has(key))) throw new Error(`AI предложил неверный перенос задачи «${task.name}». ID и остальные поля должны сохраниться; предложение отклонено.`);
    return rawProposal;
  }
  const title = String(userMessage).match(/[«“"]([^»”"]+)[»”"]/u)?.[1];
  if (!title) throw new Error('Уточни название существующей задачи в кавычках.');
  const matches = (data.tasks || []).filter(task => normalizeMatch(task.name) === normalizeMatch(title));
  if (matches.length !== 1) throw new Error(matches.length ? `Есть несколько задач «${title}». Уточни дату или проект.` : `Задача «${title}» не найдена.`);
  if (rawProposal.actions.length !== 1 || rawProposal.actions[0]?.operation !== 'edit_task' || rawProposal.actions[0]?.data?.id !== matches[0].id) throw new Error('Команда просит изменить существующую задачу, а предложение AI ей не соответствует. Ничего не изменено; повтори запрос.');
  const fields = rawProposal.actions[0]?.data?.fields || {};
  const allowed = /дату/iu.test(userMessage) ? new Set(['date']) : new Set(['name']);
  if (!Object.keys(fields).length || Object.keys(fields).some(key => !allowed.has(key))) throw new Error('Предложение затрагивает поля, которые не указаны в команде. Ничего не изменено.');
  return rawProposal;
}

const entityTokens = value => normalizeMatch(value).split(' ').map(token => ({ веб: 'web', студия: 'studio', студио: 'studio', studio: 'studio', webstudio: 'webstudio', ai: 'ai', ии: 'ai' })[token] || token).filter(Boolean);
const compactEntity = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '');

export function parseTaskIntent(value) {
  const input = typeof value === 'string' ? extractProposalJSON(value) : value;
  ownKeysOnly(input, new Set(['type', 'version', 'action', 'task_name', 'description', 'project_name', 'objective_type', 'stage_name', 'frequency', 'date', 'priority', 'fields', 'clarification']), 'Намерение задания');
  if (input.type !== 'task_intent' || input.version !== 1 || !['create', 'move', 'edit'].includes(input.action)) throw new Error('AI вернул неподдерживаемое намерение задания. Повтори команду.');
  const taskName = cleanText(input.task_name, 'Название задания', 200, { optional: true, nonempty: true });
  const description = cleanText(input.description ?? '', 'Описание задания', 5000);
  const projectName = input.project_name == null ? null : cleanText(input.project_name, 'Название проекта', 150, { nonempty: true });
  const stageName = input.stage_name == null ? null : cleanText(input.stage_name, 'Название этапа', 150, { nonempty: true });
  const objectiveType = input.objective_type == null ? null : input.objective_type;
  if (objectiveType !== null && !['project', 'goal'].includes(objectiveType)) throw new Error('Некорректный тип цели или проекта в намерении');
  const frequency = input.frequency ?? 'once';
  if (input.action === 'create' && !['once', 'daily', '3week', '2week', 'weekly'].includes(frequency)) throw new Error('Некорректное расписание новой задачи');
  const date = input.action === 'create' && input.date != null && input.date !== '' ? checkDate(input.date, 'Дата задания') : null;
  const priority = input.priority ?? 'normal';
  if (!['low', 'normal', 'high'].includes(priority)) throw new Error('Некорректный приоритет задания');
  const fields = input.action === 'edit' ? input.fields ?? {} : {};
  if (!record(fields)) throw new Error('Поля изменения задания должны быть объектом');
  ownKeysOnly(fields, new Set(['name', 'description', 'date', 'priority']), 'Поля изменения задания');
  const normalizedFields = {};
  if ('name' in fields) normalizedFields.name = cleanText(fields.name, 'Название задания', 200, { nonempty: true });
  if ('description' in fields) normalizedFields.description = cleanText(fields.description, 'Описание задания', 5000);
  if ('date' in fields) normalizedFields.date = checkDate(fields.date, 'Дата задания');
  if ('priority' in fields) {
    if (!['low', 'normal', 'high'].includes(fields.priority)) throw new Error('Некорректный приоритет задания');
    normalizedFields.priority = fields.priority;
  }
  if (input.action !== 'create' && !taskName) throw new Error('AI не определил существующую задачу для изменения.');
  if (input.action === 'edit' && !Object.keys(normalizedFields).length) throw new Error('AI не указал, какое поле задачи нужно изменить.');
  if (input.action === 'create' && frequency === 'once' && !date) throw new Error('Для разовой задачи нужна дата.');
  if (input.clarification != null) cleanText(input.clarification, 'Уточнение', 300);
  return { type: 'task_intent', version: 1, action: input.action, task_name: taskName || null, description, project_name: projectName, objective_type: objectiveType, stage_name: stageName, frequency, date, priority, fields: normalizedFields, clarification: input.clarification || null };
}

function matchNamedEntities(items, name, { requireProjectAlias = false } = {}) {
  if (!name) return { exact: [], suggestions: [] };
  const requested = entityTokens(name), requestedCompact = compactEntity(name);
  const exact = [], suggestions = [];
  for (const item of items || []) {
    const canonical = entityTokens(item.name), canonicalCompact = compactEntity(item.name);
    const projectSuffix = item.type === 'project' && canonical[0] === 'ai' ? canonical.slice(1) : canonical;
    const abbreviation = item.type === 'project' && requestedCompact === canonicalCompact.replace(/^ai/, '') && /^webstudio$/i.test(String(name).trim());
    const fullMatch = requested.length === canonical.length && requested.every((token, index) => token === canonical[index]);
    if (fullMatch || abbreviation) { exact.push(item); continue; }
    if (requested.length && requested.length < canonical.length && requested.every(token => projectSuffix.includes(token)) && requested.length / projectSuffix.length >= 0.66) suggestions.push(item);
  }
  return { exact, suggestions };
}

function choiceItems(items, kind) {
  return items.map(item => {
    const detail = kind === 'task'
      ? `${item.frequency === 'once' ? item.date || 'без даты' : 'повторяется'} · ${item.objectiveId ? 'Проект: ' + (item.objectiveName || 'связан') : 'Без проекта'} · ID …${String(item.id).slice(-6)}`
      : `${item.type === 'goal' ? 'Цель' : kind === 'stage' ? 'Этап' : 'Проект'} · ${item.status === 'paused' ? 'на паузе' : item.status === 'completed' ? 'завершён' : 'активен'}`;
    const { objectiveName, ...signatureItem } = item;
    return { kind, id: item.id, label: item.name, detail, signature: JSON.stringify(signatureItem) };
  });
}

export function intentChoiceIsCurrent(data, option) {
  const collection = option?.kind === 'task' ? data.tasks : option?.kind === 'stage' ? data.stages : option?.kind === 'project' ? data.objectives : null;
  const item = collection?.find(entry => entry.id === option?.id);
  return !!item && JSON.stringify(item) === option.signature;
}

function resolveObjectiveForIntent(data, intent, selection = {}) {
  if (!intent.project_name) {
    if (selection.objectiveId) return { item: (data.objectives || []).find(item => item.id === selection.objectiveId) || null, clarify: null, stale: !(data.objectives || []).some(item => item.id === selection.objectiveId) };
    if (intent.action === 'move') {
      const projects = (data.objectives || []).filter(item => item.type === 'project');
      return { item: null, clarify: { kind: 'project', reason: 'Укажи проект, в который перенести задачу.', options: choiceItems(projects, 'project') } };
    }
    return { item: null, clarify: null };
  }
  const targetType = intent.objective_type || 'project';
  const all = (data.objectives || []).filter(item => item.type === targetType);
  const match = matchNamedEntities(all, intent.project_name);
  if (selection.objectiveId) {
    const chosen = all.find(item => item.id === selection.objectiveId);
    if (!chosen) return { item: null, stale: true };
    return { item: chosen, clarify: null };
  }
  if (match.exact.length === 1) return { item: match.exact[0], clarify: null };
  const candidates = match.exact.length ? match.exact : match.suggestions;
  const clarification = candidates.length || all.length
    ? { kind: 'project', reason: candidates.length ? 'Нашёл несколько или неуверенно совпадающих проектов. Выбери нужный.' : 'Не нашёл точного совпадения. Выбери существующий проект или цель.', options: choiceItems(candidates.length ? candidates : all, 'project') }
    : { kind: 'project', reason: 'Такого проекта или цели пока нет. В LIFE OS нет подходящей существующей записи.', options: [] };
  return { item: null, clarify: clarification };
}

export function resolveTaskIntent(data, intent, { selection = {}, userMessage = '' } = {}) {
  let parsed = parseTaskIntent(intent);
  const expected = taskCommand(userMessage);
  const expectedAction = expected === 'create' ? 'create' : expected === 'transfer' ? 'move' : expected === 'edit' ? 'edit' : null;
  if (expectedAction && parsed.action !== expectedAction) return { kind: 'error', message: 'AI неверно понял тип команды. Ничего не изменено; повтори запрос.' };
  if (!parsed.objective_type) parsed = { ...parsed, objective_type: /цел(?:ь|и|ью)/iu.test(userMessage) ? 'goal' : /проект[а-яё]*/iu.test(userMessage) ? 'project' : null };
  if (!parsed.project_name && !selection.objectiveId) {
    const direct = (data.objectives || []).filter(item => explicitLinkedName(userMessage, item.name, item.type === 'project' ? 'project' : 'goal'));
    if (direct.length === 1) parsed = { ...parsed, project_name: direct[0].name, objective_type: direct[0].type };
    else if (direct.length > 1) return { kind: 'clarification', clarification: { kind: 'project', reason: 'В сообщении совпали несколько проектов или целей. Выбери нужную запись.', options: choiceItems(direct, 'project') } };
    else if (/(?:проект[а-яё]*|цел(?:ь|и|ью))/iu.test(userMessage) || /(?:^|\s)(?:в|для|к)\s+(?:(?:проект|цель)[а-яё]*\s+)?(?:(?:ai\s+)?web|webstudio|веб|студи[а-яё]*)/iu.test(userMessage)) {
      if (parsed.action !== 'edit') {
        const targetType = /цел(?:ь|и|ью)/iu.test(userMessage) ? 'goal' : 'project';
        parsed = { ...parsed, objective_type: parsed.objective_type || targetType };
        return { kind: 'clarification', clarification: { kind: 'project', reason: parsed.project_name ? 'Не удалось надёжно распознать указанное название. Выбери существующий проект или цель.' : 'Ты указал проект или цель, но AI не извлёк название. Выбери существующую запись.', options: choiceItems((data.objectives || []).filter(item => item.type === targetType), 'project') } };
      }
    }
  }
  if (parsed.action === 'create' && !parsed.project_name && !parsed.task_name) return { kind: 'error', message: 'Не удалось определить название новой задачи.' };
  if (parsed.action === 'create' && parsed.frequency === 'once' && !parsed.date) return { kind: 'error', message: 'Не удалось определить дату новой задачи.' };
  const taskMatches = parsed.task_name ? (data.tasks || []).filter(task => normalizeMatch(task.name) === normalizeMatch(parsed.task_name)) : [];
  let task = null;
  if (parsed.action !== 'create') {
    if (selection.taskId) {
      task = taskMatches.find(item => item.id === selection.taskId) || null;
      if (!task) return { kind: 'error', message: 'Выбранная задача изменилась или больше не существует. Начни уточнение заново.' };
    } else if (taskMatches.length > 1) {
      return { kind: 'clarification', clarification: { kind: 'task', reason: `Нашёл ${taskMatches.length} задачи «${parsed.task_name}». Выбери конкретную запись.`, options: choiceItems(taskMatches.map(item => ({ ...item, objectiveName: data.objectives?.find(objective => objective.id === item.objectiveId)?.name })), 'task') } };
    } else if (taskMatches.length === 1) task = taskMatches[0];
    else return { kind: 'error', message: `Не нашёл задачу «${parsed.task_name}». Проверь её название в LIFE OS.` };
  }
  const objective = resolveObjectiveForIntent(data, parsed, selection);
  if (objective.stale) return { kind: 'error', message: 'Выбранный проект изменился после уточнения. Выбери его заново.' };
  const guards = task ? { task: JSON.stringify(task) } : {};
  if (objective.clarify) return { kind: 'clarification', clarification: objective.clarify, guards, ...(task ? { selectionGuard: { taskId: task.id } } : {}) };
  let stage = null;
  if (parsed.stage_name) {
    const stages = (data.stages || []).filter(item => item.objectiveId === objective.item?.id);
    const match = matchNamedEntities(stages, parsed.stage_name);
    if (selection.stageId) stage = stages.find(item => item.id === selection.stageId) || null;
    else if (match.exact.length === 1) stage = match.exact[0];
    else return { kind: 'clarification', clarification: { kind: 'stage', reason: match.exact.length || match.suggestions.length ? 'Уточни этап для этой цели или проекта.' : `Этап «${parsed.stage_name}» не найден у выбранного проекта.`, options: choiceItems(match.exact.length ? match.exact : match.suggestions, 'stage') }, guards: { ...guards, ...(objective.item ? { project: JSON.stringify(objective.item) } : {}) }, selectionGuard: { ...(task ? { taskId: task.id } : {}), ...(objective.item ? { objectiveId: objective.item.id } : {}) } };
    if (!stage) return { kind: 'error', message: 'Выбранный этап изменился после уточнения. Выбери его заново.' };
  }
  let action;
  if (parsed.action === 'create') {
    action = { operation: 'create_task', temp_ref: `tmp_task_${Date.now().toString(36)}`, data: { name: parsed.task_name, description: parsed.description, frequency: parsed.frequency, date: parsed.frequency === 'once' ? parsed.date : null, category_ref: null, objective_ref: objective.item?.id || null, stage_ref: stage?.id || null, type: 'simple', priority: parsed.priority } };
  } else if (parsed.action === 'move') {
    if (!objective.item || objective.item.type !== 'project') return { kind: 'error', message: 'Для переноса укажи существующий проект.' };
    action = { operation: 'edit_task', data: { id: task.id, fields: { objectiveId: objective.item.id, stageId: stage?.id || null } } };
  } else {
    const fieldsMentioned = Object.keys(parsed.fields);
    const request = String(userMessage || '').toLocaleLowerCase('ru-RU');
    const fieldWasRequested = key => key === 'date' ? /дат[ауы]|срок/iu.test(request)
      : key === 'priority' ? /приоритет|важност/iu.test(request)
        : key === 'name' ? /переимен|назван|имя/iu.test(request)
          : /описан/iu.test(request);
    if (fieldsMentioned.some(key => !fieldWasRequested(key))) return { kind: 'error', message: 'Предложение AI затрагивает поле, которое ты не просил менять. Ничего не изменено; повтори команду точнее.' };
    action = { operation: 'edit_task', data: { id: task.id, fields: parsed.fields } };
  }
  return { kind: 'proposal', proposal: { type: 'proposal', version: 1, summary: parsed.action === 'create' ? `Создать задачу «${parsed.task_name}»` : parsed.action === 'move' ? `Перенести «${task.name}» в «${objective.item.name}»` : `Изменить задачу «${task.name}»`, actions: [action] } };
}

// The model's proposal may contain valid but unrequested links. Ground new
// task links in an exact, explicit name from the current user message before
// schema validation; task wording or the catalog alone is never evidence.
export function groundTaskLinks(data, rawProposal, userMessage) {
  const grounded = structuredClone(rawProposal);
  if (!record(grounded) || !Array.isArray(grounded.actions)) return grounded;
  const message = String(userMessage || '');
  const categoryId = explicitCategory(data, message);
  const removedTempObjectives = new Set();
  grounded.actions = grounded.actions.filter(action => {
    if (!['create_goal', 'create_project'].includes(action?.operation)) return true;
    const kind = action.operation === 'create_project' ? 'project' : 'goal';
    if (explicitlyCreatesName(message, action.data?.name, kind)) return true;
    removedTempObjectives.add(action.temp_ref);
    return false;
  }).filter(action => !(action?.operation === 'create_stage' && removedTempObjectives.has(action.data?.objective_ref)));
  const targets = [
    ...(data.objectives || []).filter(item => explicitLinkedName(message, item.name, item.type === 'project' ? 'project' : 'goal')).map(item => ({ ref: item.id, name: item.name, type: item.type })),
    ...grounded.actions.filter(item => ['create_goal', 'create_project'].includes(item?.operation) && explicitLinkedName(message, item.data?.name, item.operation === 'create_project' ? 'project' : 'goal')).map(item => ({ ref: item.temp_ref, name: item.data.name, type: item.operation === 'create_project' ? 'project' : 'goal' })),
  ];
  const explicitTarget = explicitObjectiveTarget(data, message);
  if (targets.length > 1) throw new Error(`Уточни, к какому проекту или цели привязать задачу: ${targets.map(item => `«${item.name}»`).join(', ')}.`);
  const target = explicitTarget ? { ref: explicitTarget.id, name: explicitTarget.name, type: explicitTarget.type } : targets[0] || null;
  for (const action of grounded.actions) {
    if (action?.operation !== 'create_task' || !record(action.data)) continue;
    action.data.objective_ref = target?.ref || null;
    action.data.stage_ref = null;
    action.data.category_ref = categoryId;
    if (target) {
      const stages = [
        ...(data.stages || []).filter(item => item.objectiveId === target.ref && explicitLinkedName(message, item.name, 'stage')).map(item => ({ id: item.id, name: item.name })),
        ...grounded.actions.filter(item => item?.operation === 'create_stage' && item.data?.objective_ref === target.ref && explicitLinkedName(message, item.data.name, 'stage')).map(item => ({ id: item.temp_ref, name: item.data.name })),
      ];
      if (stages.length > 1) throw new Error(`Уточни этап проекта «${target.name}»: указано несколько подходящих этапов.`);
      action.data.stage_ref = stages[0]?.id || null;
      // Linked tasks inherit their category at apply time.
      action.data.category_ref = null;
    }
  }
  return grounded;
}

export function validateProposal(data, rawProposal) {
  const input = typeof rawProposal === 'string' ? extractProposalJSON(rawProposal) : rawProposal;
  ownKeysOnly(input, new Set(['type', 'version', 'summary', 'actions']), 'Предложение');
  if (input.type !== 'proposal' || input.version !== 1) throw new Error('Ожидается предложение LIFE OS версии 1');
  const summary = cleanText(input.summary, 'Краткое описание', 300, { nonempty: true });
  if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > MAX_PROPOSAL_ACTIONS) throw new Error(`В предложении должно быть от 1 до ${MAX_PROPOSAL_ACTIONS} действий`);
  const state = { tempRefs: new Set(), tempKinds: new Map() };
  const actions = input.actions.map(action => normalizeAction(action, data, state));
  // Resolve every temporary relationship after parsing to reject forward or cross-type links.
  const kinds = new Map();
  for (const action of actions) if (action.temp_ref) kinds.set(action.temp_ref, action.operation === 'create_goal' || action.operation === 'create_project' ? 'objective' : action.operation === 'create_stage' ? 'stage' : 'task');
  const checkResolved = (value, expected) => { if (value && TEMP_REF.test(value) && kinds.get(value) !== expected) throw new Error('Временная ссылка не указывает на создаваемый объект нужного типа'); };
  for (const action of actions) {
    const value = action.data;
    if (action.operation === 'create_stage') checkResolved(value.objective_ref, 'objective');
    if (action.operation === 'create_task') {
      checkResolved(value.objective_ref, 'objective'); checkResolved(value.stage_ref, 'stage'); checkResolved(value.category_ref, 'category');
      if (value.objective_ref) {
        const objective = data.objectives.find(item => item.id === value.objective_ref);
        const objectiveAction = actions.find(item => item.temp_ref === value.objective_ref && ['create_goal', 'create_project'].includes(item.operation));
        const objectiveCategory = objective?.categoryId || objectiveAction?.data.category_ref || null;
        if (value.category_ref && value.category_ref !== objectiveCategory) throw new Error('Категория задания должна совпадать с категорией цели или проекта');
      }
      if (value.stage_ref) {
        const stageAction = actions.find(item => item.temp_ref === value.stage_ref && item.operation === 'create_stage');
        if (stageAction && stageAction.data.objective_ref !== value.objective_ref) throw new Error('Создаваемый этап не относится к указанной цели');
        const stage = data.stages.find(item => item.id === value.stage_ref);
        if (stage && stage.objectiveId !== value.objective_ref) throw new Error('Этап не относится к указанной цели или проекту');
      }
    }
    if (action.operation === 'create_subtask') checkResolved(value.task_ref, 'task');
    if (action.operation === 'edit_task') {
      checkResolved(value.id, 'task');
      checkResolved(value.fields.objectiveId, 'objective'); checkResolved(value.fields.stageId, 'stage'); checkResolved(value.fields.categoryId, 'category');
    }
    if (action.operation === 'edit_goal' || action.operation === 'edit_project') checkResolved(value.id, 'objective');
    if (action.operation === 'edit_stage') checkResolved(value.id, 'stage');
  }
  const createdCompound = new Set(actions.filter(action => action.operation === 'create_task' && action.data.type === 'compound').map(action => action.temp_ref));
  for (const compound of createdCompound) if (!actions.some(action => action.operation === 'create_subtask' && action.data.task_ref === compound)) throw new Error('Составному заданию нужно добавить хотя бы одну подзадачу в этом плане');
  return { type: 'proposal', version: 1, summary, actions };
}

function targetDescriptors(data, actions) {
  const targets = new Map();
  const add = (kind, id) => {
    if (!id || TEMP_REF.test(id)) return;
    const collection = kind === 'task' ? data.tasks : kind === 'stage' ? data.stages : kind === 'objective' ? data.objectives : data.categories;
    const item = collection?.find(value => value.id === id);
    if (!item) return;
    let snapshot = item;
    if (kind === 'task') snapshot = {
      task: item,
      overrides: Object.fromEntries(Object.entries(data.taskOverrides || {}).filter(([, entries]) => entries?.[id]).map(([date, entries]) => [date, entries[id]])),
      checks: Object.fromEntries(Object.entries(data.checks || {}).filter(([, entries]) => Object.hasOwn(entries || {}, id)).map(([date, entries]) => [date, entries[id]])),
      subtaskChecks: Object.fromEntries(Object.entries(data.subtaskChecks || {}).filter(([, entries]) => Object.hasOwn(entries || {}, id)).map(([date, entries]) => [date, entries[id]])),
      completionRewards: Object.fromEntries(Object.entries(data.completionRewards || {}).filter(([, entries]) => Object.hasOwn(entries || {}, id)).map(([date, entries]) => [date, entries[id]])),
    };
    targets.set(`${kind}:${id}`, snapshot);
  };
  for (const action of actions) {
    const value = action.data;
    if (['edit_goal', 'edit_project'].includes(action.operation)) add('objective', value.id);
    if (action.operation === 'edit_stage') add('stage', value.id);
    if (action.operation === 'edit_task' || action.operation === 'create_subtask') add('task', action.operation === 'edit_task' ? value.id : value.task_ref);
    if (action.operation === 'create_goal' || action.operation === 'create_project') add('category', value.category_ref);
    if (action.operation === 'create_stage') add('objective', value.objective_ref);
    if (action.operation === 'create_task') {
      add('objective', value.objective_ref); add('stage', value.stage_ref); add('category', value.category_ref);
      if (value.frequency === 'once') targets.set(`day:${value.date}`, {
        shift: data.workSchedule ? daySchedule(value.date, data.workSchedule) : null,
        tasks: (data.tasks || []).filter(task => task.active !== false && scheduled(task, value.date)).map(task => ({ id: task.id, name: task.name, priority: task.priority || 'normal' })),
        workouts: (data.sports?.sessions || []).filter(session => session.date === value.date).map(session => ({ id: session.id, date: session.date })),
      });
    }
    if (action.operation === 'edit_task') {
      add('objective', value.fields.objectiveId); add('stage', value.fields.stageId); add('category', value.fields.categoryId);
      if (value.fields.date) targets.set(`day:${value.fields.date}`, {
        shift: data.workSchedule ? daySchedule(value.fields.date, data.workSchedule) : null,
        tasks: (data.tasks || []).filter(task => task.active !== false && scheduled(task, value.fields.date)).map(task => ({ id: task.id, name: task.name, priority: task.priority || 'normal' })),
        workouts: (data.sports?.sessions || []).filter(session => session.date === value.fields.date).map(session => ({ id: session.id, date: session.date })),
      });
    }
  }
  return targets;
}

function digest(value) {
  const source = JSON.stringify(value);
  if (globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)).then(bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
  }
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return Promise.resolve((hash >>> 0).toString(16));
}

export async function captureTargetRevisions(data, actions) {
  const targets = targetDescriptors(data, actions);
  return Object.fromEntries(await Promise.all([...targets].map(async ([key, value]) => [key, await digest(value)])));
}

export async function revisionsMatch(data, actions, revisions) {
  const current = await captureTargetRevisions(data, actions);
  const recorded = revisions && typeof revisions === 'object' && !Array.isArray(revisions) ? revisions : {};
  const keys = Object.keys(current);
  return keys.length === Object.keys(recorded).length && keys.every(key => current[key] === recorded[key]);
}

export function proposalWarnings(data, proposal) {
  const warnings = new Set();
  const dates = new Map();
  for (const action of proposal.actions) {
    if (action.operation !== 'create_task') continue;
    if (action.data.frequency !== 'once') {
      warnings.add(`«${action.data.name}» будет повторяться без конечной даты по расписанию LIFE OS (${action.data.frequency}).`);
      continue;
    }
    const date = action.data.date;
    dates.set(date, (dates.get(date) || 0) + 1);
    const shift = data.workSchedule && daySchedule(date, data.workSchedule);
    if (shift?.kind === 'day' || shift?.kind === 'night') warnings.add(`${date}: приходится на ${shift.label.toLocaleLowerCase('ru-RU')}${shift.kind === 'night' ? ' (20:00–08:00 следующего дня)' : ' (08:00–20:00)'}. Проверь, подходит ли задача к смене.`);
    const workouts = (data.sports?.sessions || []).filter(session => session.date === date);
    if (workouts.length) warnings.add(`${date}: уже запланировано занятий тренировок: ${workouts.length}.`);
    const existing = (data.tasks || []).filter(task => task.active !== false && (task.frequency === 'once' ? task.date === date : true));
    if (existing.length) warnings.add(`${date}: в LIFE OS уже есть ${existing.length} активных заданий по расписанию.`);
    const duplicate = (data.tasks || []).some(task => task.active !== false && normalizeMatch(task.name) === normalizeMatch(action.data.name) && scheduled(task, date));
    if (duplicate) warnings.add(`Похожая задача уже существует на ${date}. Проверь название и дату; при подтверждении можно осознанно создать дубликат.`);
  }
  for (const [date, count] of dates) if (count > 1) warnings.add(`${date}: предложение добавляет ${count} задач на один день.`);
  return [...warnings];
}

function resolve(refValue, created) { return refValue == null ? null : created.get(refValue) || refValue; }
function generatedId(data, prefix) {
  let id;
  do { id = `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 14)}`; }
  while (data.objectives.some(item => item.id === id) || data.stages.some(item => item.id === id) || data.tasks.some(item => item.id === id));
  return id;
}

export function applyProposal(data, proposal, { date = today() } = {}) {
  const checked = validateProposal(data, proposal);
  const staged = structuredClone(data);
  const created = new Map();
  const changedTasks = new Set();
  const resolveIn = value => resolve(value, created);
  for (const action of checked.actions) {
    const value = action.data;
    if (action.operation === 'create_goal' || action.operation === 'create_project') {
      const categoryId = resolveIn(value.category_ref);
      const item = saveObjective(staged, null, { name: value.name, type: action.operation === 'create_goal' ? 'goal' : 'project', description: value.description, categoryId, status: 'active', priority: value.priority, startDate: value.startDate, endDate: value.endDate });
      created.set(action.temp_ref, item.id);
    } else if (action.operation === 'create_stage') {
      const item = saveStage(staged, null, { objectiveId: resolveIn(value.objective_ref), name: value.name, description: value.description, status: 'active' });
      created.set(action.temp_ref, item.id);
    } else if (action.operation === 'create_task') {
      const objectiveId = resolveIn(value.objective_ref), stageId = resolveIn(value.stage_ref);
      const objective = staged.objectives.find(item => item.id === objectiveId);
      if (stageId && !staged.stages.some(item => item.id === stageId && item.objectiveId === objectiveId)) throw new Error('Этап не относится к выбранной цели');
      const categoryId = objective ? (objective.categoryId || null) : resolveIn(value.category_ref);
      const category = staged.categories.find(item => item.id === categoryId);
      const task = addTask(staged, { name: value.name, type: value.type, description: value.description, category: category?.name || '', categoryId, objectiveId, stageId, frequency: value.frequency, date: value.date, priority: value.priority, subtasks: [] });
      created.set(action.temp_ref, task.id);
      changedTasks.add(task.id);
    } else if (action.operation === 'create_subtask') {
      const id = resolveIn(value.task_ref);
      const task = staged.tasks.find(item => item.id === id);
      if (!task) throw new Error('Задание для подзадачи не найдено');
      if (task.frequency === 'once' && staged.checks?.[task.date]?.[id]) throw new Error('Нельзя добавлять обязательную подзадачу к уже выполненному заданию: это изменит его отметку и XP');
      const fields = { ...task, type: 'compound', subtasks: [...(task.subtasks || []), { id: generatedId({ ...staged, objectives: [], stages: [] }, 'sub'), name: value.name, required: value.required }] };
      editTask(staged, id, date, 'series', fields);
      changedTasks.add(id);
    } else if (action.operation === 'edit_goal' || action.operation === 'edit_project') {
      const id = resolveIn(value.id), existing = staged.objectives.find(item => item.id === id);
      if (!existing || existing.type !== (action.operation === 'edit_goal' ? 'goal' : 'project')) throw new Error('Цель или проект изменились после проверки предложения');
      saveObjective(staged, id, { ...existing, ...value.fields });
    } else if (action.operation === 'edit_stage') {
      const id = resolveIn(value.id), existing = staged.stages.find(item => item.id === id);
      if (!existing) throw new Error('Этап изменился после проверки предложения');
      saveStage(staged, id, { ...existing, ...value.fields });
    } else if (action.operation === 'edit_task') {
      const id = resolveIn(value.id), existing = staged.tasks.find(item => item.id === id);
      if (!existing) throw new Error('Задание изменилось после проверки предложения');
      const fields = { ...existing, ...value.fields };
      if (fields.objectiveId) {
        const objective = staged.objectives.find(item => item.id === fields.objectiveId);
        if (!objective) throw new Error('Связанная цель или проект больше не существует');
        fields.categoryId = objective.categoryId || null;
        fields.category = staged.categories.find(item => item.id === fields.categoryId)?.name || '';
      } else if (value.fields.objectiveId === null) {
        fields.stageId = value.fields.stageId === undefined ? null : value.fields.stageId;
      }
      if (fields.stageId && !staged.stages.some(item => item.id === fields.stageId && item.objectiveId === fields.objectiveId)) throw new Error('Этап не относится к выбранной цели или проекту');
      editTask(staged, id, date, 'series', fields);
      changedTasks.add(id);
    }
  }
  // Final invariant checks run before the caller performs the one storage write.
  for (const task of staged.tasks.filter(item => changedTasks.has(item.id))) {
    if (task.stageId && !staged.stages.some(stage => stage.id === task.stageId && stage.objectiveId === task.objectiveId)) throw new Error(`Нарушена связь этапа у задания «${task.name}»`);
    if (task.objectiveId && !staged.objectives.some(objective => objective.id === task.objectiveId)) throw new Error(`Нарушена связь цели у задания «${task.name}»`);
    if (task.type === 'compound' && !(task.subtasks || []).length) throw new Error(`Составному заданию «${task.name}» нужна подзадача`);
  }
  return { data: staged, created: Object.fromEntries(created) };
}

export async function applyProposalRecord(data, proposalId, { date = today() } = {}) {
  const record = (data.aiManagerHistory || []).find(item => item.id === proposalId);
  if (!record || record.status !== 'pending') throw new Error('Предложение уже обработано или отсутствует');
  const proposal = validateProposal(data, record.proposal);
  if (!await revisionsMatch(data, proposal.actions, record.baseRevisions)) throw new Error('Связанные данные изменились после создания предложения');
  const result = applyProposal(data, proposal, { date });
  result.data.aiManagerHistory = (result.data.aiManagerHistory || []).map(item => item.id === proposalId
    ? { ...item, status: 'applied', appliedAt: new Date().toISOString(), errorMessage: undefined }
    : item);
  return result.data;
}

export function proposalCatalog(data, date) {
  const dateAfter = (value, days) => new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const shiftDays = Array.from({ length: 35 }, (_, offset) => {
    const day = dateAfter(date, offset), shift = daySchedule(day, data.workSchedule), carry = overnightCarry(day, data.workSchedule);
    return { date: day, type: shift.kind, cycle_day: shift.cycleDay, ...(shift.kind === 'day' || shift.kind === 'night' ? { time: shift.time } : {}), ...(carry ? { overnight_from: carry.date } : {}) };
  });
  const workoutDays = (data.sports?.sessions || []).filter(session => session.date >= date && session.date <= dateAfter(date, 34)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14).map(session => ({ date: session.date, name: String(session.workoutSnapshot?.name || 'Тренировка').slice(0, 60) }));
  return {
    categories: (data.categories || []).slice(0, 40).map(item => ({ id: item.id, name: item.name })),
    objectives: (data.objectives || []).slice(0, 50).map(item => ({ id: item.id, type: item.type, name: item.name, ...(item.type === 'project' && String(item.name).toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '').startsWith('ai') ? { aliases: [String(item.name).toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '').slice(2)] } : {}), categoryId: item.categoryId || null, status: item.status })),
    stages: (data.stages || []).slice(0, 80).map(item => ({ id: item.id, objectiveId: item.objectiveId, name: item.name, status: item.status })),
    tasks: (data.tasks || []).filter(item => item.active !== false).slice(0, 100).map(item => ({ id: item.id, name: item.name, frequency: item.frequency, date: item.date || null, objectiveId: item.objectiveId || null, stageId: item.stageId || null, priority: item.priority || 'normal' })),
    shift_days: shiftDays,
    workout_days: workoutDays,
    current_date: date,
  };
}

export function summarizeProposal(proposal) {
  const counts = {};
  for (const action of proposal.actions) counts[action.operation] = (counts[action.operation] || 0) + 1;
  return counts;
}

