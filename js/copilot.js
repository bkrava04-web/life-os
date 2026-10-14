import { PUBLIC_BUILD } from './runtime-config.js?v=stage9.3.3';
import { esc, isDone, tasksFor } from './tasks.js?v=stage9.3.3';
import { today } from './calendar.js?v=stage9.3.3';
import { objectiveProgress } from './organization.js?v=stage9.3.3';
import { daySchedule, overnightCarry } from './schedule.js?v=stage9.3.3';
import { renderMarkdown } from './markdown.js?v=stage9.3.3';
import { applyProposalRecord, assertTaskProposalIntent, captureTargetRevisions, extractProposalJSON, groundTaskLinks, intentChoiceIsCurrent, parseTaskIntent, proposalCatalog, proposalWarnings, resolveTaskIntent, revisionsMatch, summarizeProposal, taskCommandType, validateProposal } from './ai-manager.js?v=stage9.3.3';
import { classifyAIIntent, isProposalLikeResponse } from './ai-intent.js?v=stage9.3.3';

const MAX_MESSAGES = 20;
const MAX_BRIDGE_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_BYTES = 24000;
const MAX_USER_MESSAGE_CHARS = 3300;
const MAX_PROPOSAL_MESSAGE_CHARS = 1150;
const DAY_MS = 86400000;
const dayAfter = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
const utf8Size = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function localOffset(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const offset = new Date(year, month - 1, day, hour, minute).getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
function localDateTime(date, time) { return `${date}T${time}:00${localOffset(date, time)}`; }

export function todayScheduleSummary(data, date = today()) {
  const schedule = data.workSchedule;
  const current = daySchedule(date, schedule);
  const carry = overnightCarry(date, schedule);
  const lines = [`Сегодняшний тип дня по графику LIFE OS: ${current.label} (день цикла ${current.cycleDay} из 8; ${current.time}).`];
  if (carry) {
    lines.push(`Ночная смена предыдущего дня продолжается сегодня: ${carry.label}, началась ${carry.date} в 20:00 и завершается ${date} в 08:00.`);
  }
  return lines.join('\n');
}

export function aiHealthStatus(responseOk, result) {
  return responseOk && result?.status === 'online' ? 'online' : 'unavailable';
}

function buildGroundedPrompt(message, data, date) {
  return `${message}\n\n[Краткие инструкции LIFE OS]\nОтвечай преимущественно по-русски, естественно и конкретно. Используй только факты из контекста LIFE OS; явно отделяй их от рекомендаций и не придумывай отсутствующие данные. Если сведений недостаточно, скажи об этом. Учитывай смены, нагрузку и восстановление. На простой вопрос отвечай кратко, на сложный — подробно. При вопросе о сегодняшнем дне сначала назови график сегодня, затем задачи со сроком сегодня, потом рекомендации. Ты работаешь только на чтение.\n\n[Факт о сегодняшнем графике из настроек LIFE OS]\n${todayScheduleSummary(data, date)}`;
}

function shrinkContext(context) {
  if (context.active_tasks.length) context.active_tasks.pop();
  else if (context.completed_tasks.length) context.completed_tasks.pop();
  else if (context.workouts.length) context.workouts.pop();
  else if (context.shifts.length) context.shifts.pop();
  else if (context.goals.length) context.goals.pop();
  else if (context.projects.length) context.projects.pop();
  else return false;
  return true;
}

const PROPOSAL_INSTRUCTIONS = `Определи намерение по запросу и переписке. Явное поручение изменить LIFE OS — предложение JSON; вопрос, совет или размышление — обычный ответ; неоднозначность или нехватка обязательных данных — один короткий уточняющий вопрос. Описание можно оставить пустым, priority по умолчанию normal, type задачи simple. «Да» никогда не применяет изменения: это возможно только кнопкой карточки.\nДля предложения верни строго {"type":"proposal","version":1,"summary":"…","actions":[…]}, до 50 действий:\n- {"operation":"create_goal"|"create_project","temp_ref":"tmp_goal1","data":{"name":"…","description":"…","category_ref":"ID категории или null","priority":"low|normal|high","startDate":"YYYY-MM-DD или null","endDate":"YYYY-MM-DD или null"}}\n- {"operation":"create_stage","temp_ref":"tmp_stage1","data":{"objective_ref":"существующий ID или temp_ref созданной ранее цели","name":"…","description":"…"}}\n- {"operation":"create_task","temp_ref":"tmp_task1","data":{"name":"…","description":"…","frequency":"once|daily|3week|2week|weekly","date":"YYYY-MM-DD (для once обязательно, иначе null)","category_ref":"ID или null","objective_ref":"ID/temp_ref или null","stage_ref":"ID/temp_ref или null","type":"simple|compound","priority":"low|normal|high"}}\n- {"operation":"create_subtask","data":{"task_ref":"существующий ID или temp_ref созданного задания","name":"…","required":true}}\n- {"operation":"edit_goal"|"edit_project","data":{"id":"реальный ID из каталога","fields":{"name":"…","description":"…"}}}\n- {"operation":"edit_stage","data":{"id":"реальный ID из каталога","fields":{"name":"…","description":"…"}}}\n- {"operation":"edit_task","data":{"id":"реальный ID из каталога","fields":{"name":"…","description":"…","priority":"low|normal|high","date":"YYYY-MM-DD только для разового задания","categoryId":"ID или null","objectiveId":"ID или null","stageId":"ID или null"}}}\nНе добавляй неизвестные поля; ID бери только из proposal_catalog. Самостоятельная задача: objective_ref и stage_ref null; category_ref тоже null, если пользователь явно не назвал категорию (она необязательна). Связывай задачу только если пользователь прямо написал существующее название в формулировке вроде «в проекте <название>» или «к цели <название>»; никаких связей по смыслу названия задачи, последнему открытому проекту или одному лишь catalog. Учитывай aliases проекта только как точные сокращения, указанные в catalog. Если проект/цель не названы так явно, ставь оба поля null. Для команды переноса используй ровно edit_task с ID существующей задачи и меняй только objectiveId, stageId=null и категорию по новому проекту; никогда не создавай копию. Повтор одинакового названия задачи в каталоге требует уточнить дату и проект. Не создавай цель или проект ради задачи; создавать их можно только по прямой команде пользователя и с указанным названием. category_ref оставляй null, LIFE OS наследует категорию родителя. При несовместимой категории уточняй, не исправляй молча. temp_ref используй только для ранее созданных сущностей. Учитывай shift_days и workout_days. Разовые задачи имеют дату, повторы бессрочны; если у новой задачи не задана дата или частота — спроси. Нет удалений, завершений, XP, правок тренировок или экзаменов. Не заявляй, что изменения применены.`;

const TASK_INTENT_INSTRUCTIONS = `Преобразуй команду пользователя только в промежуточное намерение для LIFE OS. Не формируй proposal/actions и не выбирай ID. Верни один JSON без Markdown строго в формате {"type":"task_intent","version":1,"action":"create|move|edit","task_name":"точное название или формулировка существующей задачи","description":"текст или пустая строка","project_name":"название связи в написании пользователя или null","objective_type":"project|goal|null","stage_name":"этап, если назван, иначе null","frequency":"once|daily|3week|2week|weekly","date":"YYYY-MM-DD или null","priority":"low|normal|high","fields":{"name":"…","description":"…","date":"YYYY-MM-DD","priority":"low|normal|high"},"clarification":"короткий вопрос или null"}. Для create извлеки название, дату с учётом current_date, частоту и приоритет. Если проект/цель явно названы, перенеси project_name в точности как написано человеком, не исправляй сокращение, перевод или орфографию. Если связи нет, project_name=null. Для move найди из запроса название существующей задачи и название проекта, но не выбирай объект по ID. Для edit укажи только действительно запрошенные изменяемые поля в fields. Не придумывай дату, описание, приоритет или связь. Если значения неясны, задай один краткий вопрос в clarification. Каталог содержит только названия и даты, не является разрешением менять данные. Не создавай проекты. Текущая дата: `;

export function buildTaskIntentOutboundRequest(prompt, data, context) {
  const user = String(prompt || '').trim();
  if (!user || Array.from(user).length > MAX_PROPOSAL_MESSAGE_CHARS) throw new Error(`Для изменения задачи используй запрос до ${MAX_PROPOSAL_MESSAGE_CHARS} символов`);
  const catalog = {
    projects_goals: (data.objectives || []).slice(0, 30).map(item => ({ name: String(item.name || '').slice(0, 80), type: item.type, status: item.status })),
    tasks: (data.tasks || []).filter(item => item.active !== false).slice(0, 30).map(item => ({ name: String(item.name || '').slice(0, 90), date: item.date || null, frequency: item.frequency, project: data.objectives?.find(objective => objective.id === item.objectiveId)?.name || null })),
  };
  const makeContent = () => `${TASK_INTENT_INSTRUCTIONS}${context.current_date}\nТолько названия для понимания запроса, ID отсутствуют: ${JSON.stringify(catalog)}\nКоманда пользователя: ${user}`;
  while (Array.from(makeContent()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.tasks.length) catalog.tasks.pop();
  while (Array.from(makeContent()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.projects_goals.length) catalog.projects_goals.pop();
  const content = makeContent();
  if (Array.from(content).length > MAX_BRIDGE_MESSAGE_CHARS) throw new Error('Слишком много записей в каталоге для AI. Сузь запрос и повтори.');
  const outboundContext = structuredClone(context);
  while (utf8Size(outboundContext) > MAX_CONTEXT_BYTES && outboundContext.active_tasks.length) outboundContext.active_tasks.pop();
  while (utf8Size(outboundContext) > MAX_CONTEXT_BYTES && outboundContext.completed_tasks.length) outboundContext.completed_tasks.pop();
  while (utf8Size(outboundContext) > MAX_CONTEXT_BYTES && outboundContext.workouts.length) outboundContext.workouts.pop();
  if (utf8Size(outboundContext) > MAX_CONTEXT_BYTES || utf8Size(outboundContext) + utf8Size(content) > 28000) throw new Error('Контекст AI превышает допустимый размер');
  return { messages: [{ role: 'user', content }], context: outboundContext };
}

export function buildProposalOutboundRequest(prompt, data, context, { history = [], mode = 'action' } = {}) {
  const user = String(prompt || '').trim();
  if (!user || Array.from(user).length > MAX_PROPOSAL_MESSAGE_CHARS) throw new Error(`Для предложения используй запрос до ${MAX_PROPOSAL_MESSAGE_CHARS} символов`);
  const outboundContext = structuredClone(context);
  const catalog = proposalCatalog(data, context.current_date);
  const catalogText = () => `LIFE OS proposal_catalog (только фактические записи и ID): ${JSON.stringify(catalog)}`;
  while (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.workout_days.length > 8) catalog.workout_days.pop();
  while (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.tasks.length) catalog.tasks.pop();
  while (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.stages.length) catalog.stages.pop();
  while (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.objectives.length) catalog.objectives.pop();
  while (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS && catalog.categories.length) catalog.categories.pop();
  if (Array.from(catalogText()).length > MAX_BRIDGE_MESSAGE_CHARS) throw new Error('Справочник целей и задач не помещается в ограничение AI Bridge');
  const routeInstruction = mode === 'followup'
    ? 'Продолжи незавершённую просьбу по переписке. Если данных хватает — предложение; иначе один уточняющий вопрос.'
    : mode === 'auto'
      ? 'По переписке выбери: явная команда — предложение, вопрос/размышление — ответ, неясность — уточнение.'
      : 'Явная команда: подготовь предложение или уточни недостающие обязательные данные.';
  const finalContent = `${PROPOSAL_INSTRUCTIONS}\n\n[Маршрут]\n${routeInstruction}\n\nПоследнее сообщение пользователя:\n${user}`;
  if (Array.from(finalContent).length > MAX_BRIDGE_MESSAGE_CHARS) throw new Error('Запрос для AI слишком длинный; сократи его и повтори.');
  const transcript = history.slice(-6).map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '').slice(-1000) }));
  const outbound = [{ role: 'user', content: catalogText() }, ...transcript, { role: 'user', content: finalContent }];
  const combinedBytes = () => utf8Size(outboundContext) + outbound.reduce((sum, item) => sum + utf8Size(item.content) - 2, 0);
  const contextBytes = () => utf8Size(outboundContext);
  while (contextBytes() > MAX_CONTEXT_BYTES && outboundContext.active_tasks.length) outboundContext.active_tasks.pop();
  while (contextBytes() > MAX_CONTEXT_BYTES && outboundContext.completed_tasks.length) outboundContext.completed_tasks.pop();
  while (contextBytes() > MAX_CONTEXT_BYTES && outboundContext.workouts.length) outboundContext.workouts.pop();
  while (contextBytes() > MAX_CONTEXT_BYTES && outboundContext.shifts.length > 8) outboundContext.shifts.pop();
  while (combinedBytes() > 28000 && outboundContext.active_tasks.length) outboundContext.active_tasks.pop();
  while (combinedBytes() > 28000 && outboundContext.completed_tasks.length) outboundContext.completed_tasks.pop();
  while (combinedBytes() > 28000 && outboundContext.workouts.length) outboundContext.workouts.pop();
  while (combinedBytes() > 28000 && outboundContext.shifts.length > 8) outboundContext.shifts.pop();
  while (combinedBytes() > 28000 && outbound.length > 2) outbound.splice(1, 1);
  while (Array.from(finalContent).length > MAX_BRIDGE_MESSAGE_CHARS || contextBytes() > MAX_CONTEXT_BYTES || combinedBytes() > 28000) {
    if (outboundContext.active_tasks.length) outboundContext.active_tasks.pop();
    else if (outboundContext.completed_tasks.length) outboundContext.completed_tasks.pop();
    else if (outboundContext.workouts.length) outboundContext.workouts.pop();
    else if (outboundContext.shifts.length > 8) outboundContext.shifts.pop();
    else break;
  }
  if (Array.from(finalContent).length > MAX_BRIDGE_MESSAGE_CHARS || Array.from(outbound[0].content).length > MAX_BRIDGE_MESSAGE_CHARS || contextBytes() > MAX_CONTEXT_BYTES || combinedBytes() > 28000) throw new Error('Контекст предложения превышает допустимый размер');
  return { messages: outbound, context: outboundContext };
}

export function buildOutboundRequest(messages, data, context) {
  const outbound = messages.slice(-MAX_MESSAGES).map((item, index, selected) => {
    const content = String(item.content ?? '');
    // Bridge limits every history entry to 4,000 characters; model replies can
    // be longer, so shorten only the transmitted copy of older replies.
    const safeContent = index < selected.length - 1 && Array.from(content).length > MAX_BRIDGE_MESSAGE_CHARS
      ? `${Array.from(content).slice(0, 3800).join('')}…[предыдущий ответ сокращён]`
      : content;
    return { role: item.role, content: safeContent };
  });
  const outboundContext = structuredClone(context);
  const latest = outbound[outbound.length - 1];
  latest.content = buildGroundedPrompt(latest.content, data, context.current_date);
  const combinedBytes = () => utf8Size(outboundContext)
    + outbound.reduce((sum, item) => sum + utf8Size(item.content) - 2, 0);
  while (outbound.length > 1 && combinedBytes() > 28000) outbound.shift();
  while (combinedBytes() > 28000 && shrinkContext(outboundContext));
  return { messages: outbound, context: outboundContext };
}

// Deliberately select fields. Never include raw storage, photos, diary notes,
// measurement data, completion reward maps, or other private application state.
export function buildAIContext(data, date = today()) {
  const objectives = (data.objectives || []).filter(item => item.status !== 'completed' && item.status !== 'paused').slice(0, 40).map(item => {
    const progress = objectiveProgress(data, item);
    const result = { title: String(item.name || '').slice(0, 250) };
    if (progress.defined) result.progress_percent = progress.value;
    return { type: item.type, result };
  });

  const shifts = [];
  for (let offset = 0; offset < 40 && shifts.length < 20; offset++) {
    const current = dayAfter(date, offset);
    const shift = daySchedule(current, data.workSchedule);
    if (shift.kind !== 'day' && shift.kind !== 'night') continue;
    const endDate = shift.kind === 'night' ? dayAfter(current, 1) : current;
    shifts.push({
      start: localDateTime(current, shift.kind === 'night' ? '20:00' : '08:00'),
      end: localDateTime(endDate, shift.kind === 'night' ? '08:00' : '20:00'),
      label: `${shift.label} · день цикла ${shift.cycleDay} из 8`,
    });
  }
  const carry = overnightCarry(date, data.workSchedule);
  if (carry) {
    shifts.unshift({
      start: localDateTime(carry.date, '20:00'),
      end: localDateTime(date, '08:00'),
      label: `${carry.label} · продолжается после полуночи`,
    });
    shifts.length = Math.min(shifts.length, 20);
  }

  const sessions = [...(data.sports?.sessions || [])].sort((a, b) => a.date.localeCompare(b.date));
  const workouts = sessions.filter(session => session.date >= dayAfter(date, -6) && session.date <= dayAfter(date, 30)).slice(0, 30).map(session => ({
    date: session.date,
    activity: String(session.workoutSnapshot?.name || 'Тренировка').slice(0, 250),
    ...(Number.isInteger(session.workoutSnapshot?.durationMinutes) ? { duration_minutes: session.workoutSnapshot.durationMinutes } : {}),
    completed: !!data.checks?.[session.date]?.[session.taskId],
  }));
  const rollingStart = dayAfter(date, -6);
  const periodTaskChecks = Object.entries(data.checks || {}).filter(([key]) => key >= rollingStart && key <= date).reduce((sum, [, entries]) => sum + Object.values(entries).filter(Boolean).length, 0);
  const workoutsCompleted = sessions.filter(session => session.date >= rollingStart && session.date <= date && !!data.checks?.[session.date]?.[session.taskId]).length;
  const activeTasks = [];
  for (let offset = 0; offset < 8; offset++) {
    const due = dayAfter(date, offset);
    for (const task of tasksFor(data, due)) {
      if (isDone(data, task.id, due)) continue;
      const item = { title: String(task.name || '').slice(0, 250), due_date: due };
      const objective = data.objectives?.find(value => value.id === task.objectiveId);
      if (objective?.name) item.project = String(objective.name).slice(0, 250);
      activeTasks.push(item);
    }
  }
  const completedTasks = [];
  for (let offset = -6; offset <= 0; offset++) {
    const due = dayAfter(date, offset);
    for (const task of tasksFor(data, due)) {
      if (!isDone(data, task.id, due)) continue;
      const item = { title: String(task.name || '').slice(0, 250), due_date: due };
      const objective = data.objectives?.find(value => value.id === task.objectiveId);
      if (objective?.name) item.project = String(objective.name).slice(0, 250);
      completedTasks.push(item);
    }
  }
  const context = {
    current_date: date,
    goals: objectives.filter(item => item.type === 'goal').slice(0, 20).map(({ result }) => result),
    projects: objectives.filter(item => item.type === 'project').slice(0, 20).map(({ result }) => result),
    active_tasks: activeTasks.slice(0, 50),
    completed_tasks: completedTasks.slice(0, 50),
    shifts: shifts.slice(0, 20),
    workouts,
    progress: {
      tasks_completed: periodTaskChecks,
      workouts_completed: workoutsCompleted,
      period_days: 7,
    },
  };
  while (utf8Size(context) > MAX_CONTEXT_BYTES) {
    if (context.active_tasks.length) context.active_tasks.pop();
    else if (context.completed_tasks.length) context.completed_tasks.pop();
    else if (context.workouts.length) context.workouts.pop();
    else if (context.shifts.length > 8) context.shifts.pop();
    else if (context.goals.length > 1) context.goals.pop();
    else if (context.projects.length > 1) context.projects.pop();
    else break;
  }
  return context;
}

function withTimeout(milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    let timer;
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Clipboard unavailable')), 1200); }),
      ]);
      return;
    } catch {
      // Fall through to the local document copy fallback.
    } finally {
      clearTimeout(timer);
    }
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

const STATUS_LABEL = { pending: 'Ожидает подтверждения', applied: 'Применено', rejected: 'Отклонено', error: 'Ошибка применения' };
const OP_LABEL = { create_goal: 'Создать цель', create_project: 'Создать проект', create_stage: 'Создать этап', create_task: 'Создать задание', create_subtask: 'Создать подзадачу', edit_goal: 'Изменить цель', edit_project: 'Изменить проект', edit_stage: 'Изменить этап', edit_task: 'Изменить задание' };
const priorityLabel = { low: 'низкий', normal: 'обычный', high: 'высокий' };
export function proposalActionText(data, action, tempNames = new Map()) {
  const value = action.data;
  const resolveName = (id, collection, fallback) => {
    if (!id) return fallback;
    if (tempNames.has(id)) {
      const temporary = tempNames.get(id);
      return typeof temporary === 'object' ? temporary.name : temporary;
    }
    return collection.find(item => item.id === id)?.name || 'не найдено';
  };
  const objective = id => resolveName(id, data.objectives || [], 'без цели/проекта');
  const stage = id => resolveName(id, data.stages || [], 'без этапа');
  const category = id => resolveName(id, data.categories || [], 'без категории');
  const objectiveType = id => data.objectives?.find(item => item.id === id)?.type || tempNames.get(id)?.type?.replace('create_', '') || 'project';
  if (action.operation === 'create_goal' || action.operation === 'create_project') {
    tempNames.set(action.temp_ref, { name: value.name, type: action.operation });
    return `${OP_LABEL[action.operation]} «${value.name}» · ${category(value.category_ref)}${value.startDate ? ` · с ${value.startDate}` : ''}${value.endDate ? ` · до ${value.endDate}` : ''}`;
  }
  if (action.operation === 'create_stage') {
    tempNames.set(action.temp_ref, { name: value.name, type: action.operation });
    return `${OP_LABEL[action.operation]} «${value.name}» · ${objective(value.objective_ref)}`;
  }
  if (action.operation === 'create_task') {
    tempNames.set(action.temp_ref, value.name);
    const link = value.objective_ref ? `${objectiveType(value.objective_ref) === 'project' ? 'Проект' : 'Цель'}: ${objective(value.objective_ref)}` : 'Проект: Без проекта';
    return `${OP_LABEL[action.operation]} «${value.name}» · Дата: ${value.frequency === 'once' ? value.date : value.frequency} · Приоритет: ${priorityLabel[value.priority || 'normal']} · ${link}${value.stage_ref ? ` → ${stage(value.stage_ref)}` : ''}${!value.objective_ref && value.category_ref ? ` · ${category(value.category_ref)}` : ''} · +20 XP при выполнении`;
  }
  if (action.operation === 'create_subtask') return `${OP_LABEL[action.operation]} «${value.name}» · ${tempNames.get(value.task_ref) || data.tasks.find(item => item.id === value.task_ref)?.name || 'задание'}`;
  if (action.operation === 'edit_goal' || action.operation === 'edit_project') {
    const item = data.objectives.find(entry => entry.id === value.id);
    const patch = value.fields || {};
    return `${OP_LABEL[action.operation]} «${item?.name || tempNames.get(value.id) || 'новая цель/проект'}»${patch.name ? ` → «${patch.name}»` : ''}${'description' in patch ? ' · описание' : ''}`;
  }
  if (action.operation === 'edit_stage') {
    const item = data.stages.find(entry => entry.id === value.id);
    const patch = value.fields || {};
    return `${OP_LABEL[action.operation]} «${item?.name || tempNames.get(value.id) || 'этап'}»${patch.name ? ` → «${patch.name}»` : ''}${'description' in patch ? ' · описание' : ''}`;
  }
  if (action.operation !== 'edit_task') return 'Действие требует повторной проверки';
  const task = data.tasks.find(entry => entry.id === value.id);
  const patch = value.fields || {};
  const oldObjective = task?.objectiveId ? objective(task.objectiveId) : 'Без проекта';
  const newObjective = 'objectiveId' in patch ? (patch.objectiveId ? objective(patch.objectiveId) : 'Без проекта') : oldObjective;
  const isMove = 'objectiveId' in patch;
  const changes = [isMove ? 'проект и категория' : '', 'stageId' in patch ? 'этап' : '', 'date' in patch ? 'дата' : '', 'priority' in patch ? 'приоритет' : '', 'name' in patch ? 'название' : '', 'description' in patch ? 'описание' : ''].filter(Boolean).join(', ');
  return `${isMove ? 'Перенос задачи' : OP_LABEL.edit_task} · Задача: ${task?.name || tempNames.get(value.id) || 'задание'} · Дата: ${task?.date || 'по расписанию'}${isMove ? ` · Из: ${oldObjective} · В: ${newObjective} · Изменения: ${changes}` : `${patch.name ? ` → «${patch.name}»` : ''}${patch.date ? ` · новая дата ${patch.date}` : ''}${patch.priority ? ` · приоритет: ${priorityLabel[patch.priority]}` : ''}${patch.objectiveId ? ` · ${objective(patch.objectiveId)}` : ''}${patch.stageId ? ` → ${stage(patch.stageId)}` : ''}${'description' in patch ? ' · описание' : ''}`}`;
}

export function taskProposalConstraint(proposal) {
  if (proposal.actions.length !== 1) return null;
  const action = proposal.actions[0];
  if (action.operation === 'create_task') return { operation: action.operation, temp_ref: action.temp_ref, data: structuredClone(action.data), objective_ref: action.data.objective_ref || null, stage_ref: action.data.stage_ref || null };
  if (action.operation === 'edit_task') return { operation: action.operation, id: action.data.id, fields: structuredClone(action.data.fields) };
  return null;
}

export function checkTaskProposalConstraint(proposal, constraint) {
  if (!constraint) return true;
  if (proposal.actions.length !== 1 || proposal.actions[0].operation !== constraint.operation) throw new Error('Изменённое предложение больше не соответствует исходной команде.');
  const action = proposal.actions[0];
  if (constraint.operation === 'create_task') {
    if (action.temp_ref !== constraint.temp_ref || (action.data.objective_ref || null) !== constraint.objective_ref || (action.data.stage_ref || null) !== constraint.stage_ref) throw new Error('В изменённом предложении нельзя менять выбранный проект, цель или этап.');
    const allowedEdits = new Set(['name', 'description', 'frequency', 'date', 'priority']);
    const originalKeys = Object.keys(constraint.data).sort();
    const currentKeys = Object.keys(action.data).sort();
    if (originalKeys.length !== currentKeys.length || originalKeys.some(key => !currentKeys.includes(key))) throw new Error('В изменённом предложении нельзя добавлять или удалять поля задачи.');
    for (const key of originalKeys) if (!allowedEdits.has(key) && action.data[key] !== constraint.data[key]) throw new Error('В изменённом предложении изменено поле вне исходной команды.');
    return true;
  }
  if (action.data.id !== constraint.id) throw new Error('В изменённом предложении нельзя подменять выбранную задачу.');
  const fixedKeys = Object.keys(constraint.fields);
  const actualKeys = Object.keys(action.data.fields);
  if (actualKeys.length !== fixedKeys.length || actualKeys.some(key => !fixedKeys.includes(key))) throw new Error('Изменённое предложение затрагивает поля вне исходной команды.');
  for (const key of ['objectiveId', 'stageId', 'categoryId']) {
    if (key in constraint.fields && action.data.fields[key] !== constraint.fields[key]) throw new Error('В изменённом предложении нельзя менять выбранную связь с проектом или этапом.');
  }
  return true;
}

export function initCopilot({ getData, getLatestData = getData, commit = () => {} }) {
  const $ = id => document.getElementById(id);
  const messages = [];
  let pending = false;
  let applying = false;
  let editingProposalId = null;
  let pendingClarification = null;

  function historyOf(data = getData()) {
    return Array.isArray(data.aiManagerHistory) ? data.aiManagerHistory.filter(item => item && typeof item.id === 'string' && item.id.length <= 120
      && item.proposal && item.proposal.type === 'proposal' && item.proposal.version === 1
      && typeof item.proposal.summary === 'string' && item.proposal.summary.length <= 300
      && Array.isArray(item.proposal.actions) && item.proposal.actions.length <= 50
      && item.proposal.actions.every(action => action && typeof action.operation === 'string' && action.data && typeof action.data === 'object')
      && ['pending', 'applied', 'rejected', 'error'].includes(item.status)) : [];
  }
  function persistHistory(next, notice = '', base = getData()) {
    try {
      const data = structuredClone(base);
      const history = Array.isArray(data.aiManagerHistory) ? [...data.aiManagerHistory] : [];
      const index = history.findIndex(item => item.id === next.id);
      if (index < 0) history.push(next); else history[index] = next;
      data.aiManagerHistory = history.slice(-30);
      commit(data, { reconcile: false });
      renderProposals();
      if (notice) appendMessage('system', notice);
      return true;
    } catch (error) {
      appendMessage('system', error.message || 'Не удалось сохранить историю предложения.', 'ai-message-error');
      return false;
    }
  }
  function renderProposals() {
    const root = $('aiProposals');
    if (!root) return;
    const data = getData();
    const history = [...historyOf(data)].reverse();
    root.replaceChildren();
    root.classList.toggle('hidden', !history.length);
    if (!history.length) return;
    const heading = document.createElement('h3'); heading.className = 'section-title'; heading.textContent = 'Предложения AI'; root.append(heading);
    for (const item of history) {
      const card = document.createElement('article'); card.className = `ai-proposal-card ai-proposal-${item.status}`;
      const header = document.createElement('div'); header.className = 'ai-proposal-heading';
      const title = document.createElement('strong'); title.textContent = item.proposal.summary;
      const status = document.createElement('span'); status.className = `ai-proposal-status state-${item.status}`; status.textContent = STATUS_LABEL[item.status];
      header.append(title, status); card.append(header);
      const countLine = document.createElement('p'); countLine.className = 'ai-proposal-count';
      const counts = summarizeProposal(item.proposal);
      countLine.textContent = `${item.proposal.actions.length} ${item.proposal.actions.length === 1 ? 'действие' : 'действий'} · ` + Object.entries(counts).map(([key, value]) => `${(OP_LABEL[key] || 'неизвестное действие').replace(/^(Создать|Изменить) /, '').toLowerCase()}: ${value}`).join(' · ');
      card.append(countLine);
      const list = document.createElement('ol'); list.className = 'ai-proposal-actions';
      const tempNames = new Map();
      for (const action of item.proposal.actions) {
        const row = document.createElement('li'); row.textContent = proposalActionText(data, action, tempNames); list.append(row);
      }
      card.append(list);
      let warnings = [];
      try { warnings = proposalWarnings(data, item.proposal); } catch { warnings = ['Предложение из импорта требует проверки перед применением.']; }
      if (warnings.length) {
        const warning = document.createElement('div'); warning.className = 'ai-proposal-warnings';
        const label = document.createElement('strong'); label.textContent = 'Проверь расписание'; warning.append(label);
        const warningList = document.createElement('ul'); warnings.forEach(text => { const li = document.createElement('li'); li.textContent = text; warningList.append(li); }); warning.append(warningList); card.append(warning);
      }
      if (item.errorMessage) { const error = document.createElement('p'); error.className = 'ai-proposal-error'; error.textContent = item.errorMessage; card.append(error); }
      const time = document.createElement('p'); time.className = 'ai-proposal-time'; time.textContent = new Date(item.createdAt).toLocaleString('ru-RU'); card.append(time);
      if (item.status === 'pending') {
        const actions = document.createElement('div'); actions.className = 'actions ai-proposal-buttons';
        for (const [label, attr, cls] of [['Применить', 'data-ai-proposal-apply', 'primary'], ['Изменить предложение', 'data-ai-proposal-edit', ''], ['Отклонить', 'data-ai-proposal-reject', 'danger']]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (cls) button.className = cls; button.setAttribute(attr, item.id); actions.append(button);
        }
        card.append(actions);
      }
      root.append(card);
    }
  }

  function setStatus(status, detail = '') {
    const badge = $('aiStatus');
    badge.dataset.state = status;
    badge.textContent = ({ checking: 'Проверяем связь…', online: 'Онлайн · Qwen3 8B', unavailable: 'AI недоступен', error: 'Ошибка подключения' })[status] || 'Ошибка подключения';
    badge.title = detail || badge.textContent;
  }

  function appendMessage(role, content, kind = '') {
    const article = document.createElement('article');
    article.className = `ai-message ai-message-${role}${kind ? ' ' + kind : ''}`;
    const label = document.createElement('span');
    label.className = 'ai-message-label';
    label.textContent = role === 'user' ? 'Ты' : role === 'assistant' ? 'Qwen3' : 'Связь';
    if (kind === 'ai-message-pending') {
      const indicator = document.createElement('div');
      indicator.className = 'ai-typing-indicator';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'Qwen3 формирует ответ');
      const dots = document.createElement('span');
      dots.className = 'ai-typing-dots';
      for (let index = 0; index < 3; index++) dots.append(document.createElement('i'));
      const statusText = document.createElement('span');
      statusText.textContent = 'Формирую ответ…';
      indicator.append(dots, statusText);
      article.append(label, indicator);
    } else if (role === 'assistant' && kind !== 'ai-message-error') {
      const text = document.createElement('div');
      text.className = 'ai-message-text ai-markdown';
      // renderMarkdown escapes all input and emits only its own fixed safe tags.
      text.innerHTML = renderMarkdown(content);
      const copy = document.createElement('button');
      copy.className = 'ai-copy-button';
      copy.type = 'button';
      copy.textContent = 'Копировать';
      copy.setAttribute('aria-label', 'Скопировать ответ Qwen3');
      copy.addEventListener('click', async () => {
        copy.textContent = 'Копирую…';
        try {
          await copyText(content);
          copy.textContent = 'Скопировано';
        } catch {
          copy.textContent = 'Не удалось скопировать';
        }
      });
      article.append(label, text, copy);
    } else {
      const text = document.createElement('p');
      text.className = 'ai-message-text';
      text.textContent = content;
      article.append(label, text);
    }
    $('aiMessages').append(article);
    article.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return article;
  }

  async function saveTaskIntentProposal(data, rawProposal, originalRequest = '') {
    const proposal = validateProposal(data, rawProposal);
    const baseRevisions = await captureTargetRevisions(data, proposal.actions);
    const latest = structuredClone(getLatestData());
    if (!await revisionsMatch(latest, proposal.actions, baseRevisions)) throw new Error('Данные изменились, пока AI готовил предложение. Начни запрос заново.');
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const record = { id, createdAt: new Date().toISOString(), status: 'pending', proposal, baseRevisions, taskIntentConstraint: taskProposalConstraint(proposal) };
    const historyItems = Array.isArray(latest.aiManagerHistory) ? [...latest.aiManagerHistory] : [];
    latest.aiManagerHistory = [...historyItems, record].slice(-30);
    commit(latest, { reconcile: false });
    renderProposals();
    appendMessage('assistant', `Подготовил предложение «${proposal.summary}». Проверь карточку ниже; оно ещё не применено.`);
  }

  function showTaskClarification(data, intent, message, clarification, selection = {}, signatures = {}) {
    pendingClarification = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, intent, message, clarification, selection, signatures };
    appendMessage('assistant', clarification.reason);
    const card = document.createElement('article');
    card.className = 'ai-clarification-card';
    card.dataset.aiClarificationId = pendingClarification.id;
    const heading = document.createElement('strong'); heading.textContent = clarification.kind === 'task' ? 'Выбери задачу' : clarification.kind === 'stage' ? 'Выбери этап' : 'Выбери проект или цель';
    card.append(heading);
    const list = document.createElement('div'); list.className = 'ai-clarification-options';
    clarification.options.forEach((option, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.aiClarificationChoice = String(index);
      const label = document.createElement('strong'); label.textContent = option.label;
      const detail = document.createElement('span'); detail.textContent = option.detail;
      button.append(label, detail); list.append(button);
    });
    if (!clarification.options.length) {
      const empty = document.createElement('p'); empty.className = 'muted small'; empty.textContent = 'В LIFE OS пока нет подходящих записей для выбора.'; list.append(empty);
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отменить уточнение'; cancel.dataset.aiClarificationCancel = 'true'; cancel.className = 'ai-clarification-cancel';
    card.append(list, cancel); $('aiMessages').append(card); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function continueTaskIntent(data, intent, message, selection = {}, signatures = {}) {
    if (intent.clarification) { appendMessage('assistant', intent.clarification); return; }
    const result = resolveTaskIntent(data, intent, { selection, userMessage: message });
    if (result.kind === 'clarification') { showTaskClarification(data, intent, message, result.clarification, { ...selection, ...(result.selectionGuard || {}) }, { ...signatures, ...(result.guards || {}) }); return; }
    if (result.kind === 'error') { appendMessage('assistant', result.message); return; }
    pendingClarification = null;
    await saveTaskIntentProposal(data, result.proposal, message);
  }

  $('aiMessages').addEventListener('click', async event => {
    const cancel = event.target.closest('[data-ai-clarification-cancel]');
    const choose = event.target.closest('[data-ai-clarification-choice]');
    if (!cancel && !choose) return;
    const card = event.target.closest('[data-ai-clarification-id]');
    const state = pendingClarification;
    if (!card || !state || card.dataset.aiClarificationId !== state.id) return;
    if (cancel) {
      pendingClarification = null; card.remove(); appendMessage('system', 'Уточнение отменено. Данные LIFE OS не менялись.'); return;
    }
    const option = state.clarification.options[Number(choose.dataset.aiClarificationChoice)];
    if (!option) return;
    const current = structuredClone(getLatestData());
    if (!intentChoiceIsCurrent(current, option)) {
      pendingClarification = null; card.remove(); appendMessage('assistant', 'Эта запись изменилась после показа выбора. Начни запрос заново, чтобы увидеть актуальные варианты.', 'ai-message-error'); return;
    }
    for (const [kind, signature] of Object.entries(state.signatures)) {
      const id = state.selection[kind === 'project' ? 'objectiveId' : `${kind}Id`];
      const existingOption = id ? { kind, id, signature } : null;
      if (!existingOption || !intentChoiceIsCurrent(current, existingOption)) {
        pendingClarification = null; card.remove(); appendMessage('assistant', 'Выбранная запись изменилась после уточнения. Начни запрос заново.', 'ai-message-error'); return;
      }
    }
    const selection = { ...state.selection, [option.kind === 'project' ? 'objectiveId' : `${option.kind}Id`]: option.id };
    const signatures = { ...state.signatures, [option.kind]: option.signature };
    pendingClarification = null; card.remove();
    try { await continueTaskIntent(current, state.intent, state.message, selection, signatures); }
    catch (error) { appendMessage('assistant', error.message || 'Не удалось подготовить предложение.', 'ai-message-error'); }
  });

  async function checkHealth() {
    if (PUBLIC_BUILD) { setStatus('unavailable', 'Домашний AI доступен в локальном LIFE OS. Удалённое подключение не настроено.'); return; }
    setStatus('checking');
    const timeout = withTimeout(4500);
    try {
      const response = await fetch('./api/ai/health', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: timeout.signal });
      const result = await response.json();
      setStatus(aiHealthStatus(response.ok, result), result.message || 'AI Bridge не отвечает');
    } catch {
      setStatus('unavailable', 'Локальный AI-прокси или Windows AI Bridge недоступен');
    } finally {
      timeout.clear();
    }
  }

  async function sendMessage(raw) {
    if (PUBLIC_BUILD) return;
    const message = String(raw || '').trim();
    if (!message || pending) return;
    if (message.length > MAX_USER_MESSAGE_CHARS) { appendMessage('system', `Сообщение должно быть короче ${MAX_USER_MESSAGE_CHARS + 1} символов.`, 'ai-message-error'); return; }
    const generationData = structuredClone(getData());
    const route = classifyAIIntent(message, messages, { hasPendingProposal: historyOf(generationData).some(item => item.status === 'pending') });
    const managerCommand = taskCommandType(message);
    const history = messages.slice(-6);
    if (pendingClarification) {
      document.querySelector(`[data-ai-clarification-id="${CSS.escape(pendingClarification.id)}"]`)?.remove();
      pendingClarification = null;
      appendMessage('system', 'Предыдущее уточнение закрыто новым сообщением. Данные LIFE OS не менялись.');
    }
    $('aiPrompt').value = '';
    messages.push({ role: 'user', content: message });
    appendMessage('user', message);
    if (route === 'approval') {
      const response = 'Сообщение в чате не применяет изменения. Если предложение верное, нажми «Применить» в его карточке и подтверди действие.';
      messages.push({ role: 'assistant', content: response });
      appendMessage('assistant', response);
      return;
    }
    pending = true;
    $('aiSend').disabled = true;
    $('aiPrompt').disabled = true;
    const waiting = appendMessage('assistant', route === 'answer' ? 'Думаю…' : 'Проверяю запрос и готовлю ответ…', 'ai-message-pending');
    try {
      const context = buildAIContext(generationData);
      const request = route === 'answer'
        ? buildOutboundRequest(messages, generationData, context)
        : managerCommand
          ? buildTaskIntentOutboundRequest(message, generationData, context)
          : buildProposalOutboundRequest(message, generationData, context, { history, mode: route });
      const answer = await requestAnswer(request);
      waiting.remove();
      if (route === 'answer') {
        if (isProposalLikeResponse(answer)) throw new Error('AI вернул вместо ответа структурированное предложение. Оно не применено; повтори информационный вопрос.');
        messages.push({ role: 'assistant', content: answer });
        appendMessage('assistant', answer);
      } else if (managerCommand) {
        if (!isProposalLikeResponse(answer)) {
          messages.push({ role: 'assistant', content: answer });
          appendMessage('assistant', answer);
        } else {
          try {
            const intent = parseTaskIntent(answer);
            if (intent.clarification) appendMessage('assistant', intent.clarification);
          else await continueTaskIntent(generationData, intent, message);
          } catch (error) {
            appendMessage('assistant', error.message || 'Не удалось понять команду. Уточни, какую задачу и проект имеешь в виду.', 'ai-message-error');
          }
        }
      } else if (!isProposalLikeResponse(answer)) {
        if (route === 'action' && !/[?？]\s*$/.test(answer.trim())) {
          throw new Error('AI не подготовил проверяемое предложение. Данные не менялись — повтори команду короче и конкретнее.');
        }
        messages.push({ role: 'assistant', content: answer });
        appendMessage('assistant', answer);
      } else {
        try {
          const rawProposal = assertTaskProposalIntent(generationData, extractProposalJSON(answer), message);
          const proposal = validateProposal(generationData, groundTaskLinks(generationData, rawProposal, message));
          const baseRevisions = await captureTargetRevisions(generationData, proposal.actions);
          const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const record = { id, createdAt: new Date().toISOString(), status: 'pending', proposal, baseRevisions };
          messages.push({ role: 'assistant', content: `Подготовлено предложение: ${proposal.summary}. Оно ещё не применено.` });
          appendMessage('assistant', `Подготовил предложение «${proposal.summary}». Оно ещё не применено: проверь карточку ниже.`);
          const latest = structuredClone(getLatestData());
          const historyItems = Array.isArray(latest.aiManagerHistory) ? [...latest.aiManagerHistory] : [];
          latest.aiManagerHistory = [...historyItems, record].slice(-30);
          commit(latest, { reconcile: false });
          renderProposals();
        } catch (error) {
          throw new Error(proposalErrorMessage(error));
        }
      }
    } catch (error) {
      waiting.remove();
      const messageText = error.message || 'Не удалось связаться с AI.';
      appendMessage('system', messageText, 'ai-message-error');
      if (error.name === 'TypeError' || error.name === 'AbortError') setStatus('unavailable', messageText);
      else if ($('aiStatus').dataset.state === 'checking') setStatus('error', messageText);
    } finally {
      pending = false;
      $('aiSend').disabled = false;
      $('aiPrompt').disabled = false;
      $('aiPrompt').focus();
    }
  }

  function proposalErrorMessage(error) {
    const message = String(error?.message || '');
    if (/Категория задания должна совпадать/.test(message)) return 'Связь задания и категории противоречит настройкам LIFE OS. Самостоятельная задача может быть без категории; у задачи внутри цели категория наследуется от неё. Ничего не сохранено. Исправь связь в предложении или повтори запрос.';
    if (/JSON|предложени|неизвестное поле|не найдено|ссылк|дату/i.test(message)) return `Не удалось проверить предложение: ${message}. Ничего не изменено. Попроси AI сформировать его ещё раз или исправь предложение вручную.`;
    return message || 'Не удалось проверить предложение. Ничего не изменено; повтори запрос.';
  }

  async function requestAnswer(request) {
    if (PUBLIC_BUILD) throw new Error('Домашний AI не подключён к публичной версии');
    const timeout = withTimeout(125000);
    let response, result;
    try {
      response = await fetch('./api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
        signal: timeout.signal,
      });
      result = await response.json();
    } finally { timeout.clear(); }
    if (!response.ok) {
      const message = typeof result?.error?.message === 'string' ? result.error.message : `Запрос не выполнен (${response.status})`;
      const status = response.status === 429 ? 'online' : [502, 503, 504].includes(response.status) ? 'unavailable' : 'error';
      setStatus(status, message);
      throw new Error(message);
    }
    if (result.status !== 'ok' || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error(result.error?.message || 'AI Bridge вернул ответ в неожиданном формате');
    setStatus('online');
    return result.answer;
  }

  function freshHistoryRecord(id) {
    return historyOf(getLatestData()).find(item => item.id === id) || null;
  }
  function reviseHistory(id, patch, base = getLatestData()) {
    const record = historyOf(base).find(item => item.id === id);
    if (!record || record.status !== 'pending') return false;
    return persistHistory({ ...record, ...patch }, '', base);
  }
  async function applyPendingProposal(id) {
    if (applying) return;
    applying = true;
    const buttons = document.querySelectorAll(`[data-ai-proposal-apply="${CSS.escape(id)}"]`);
    buttons.forEach(button => { button.disabled = true; button.textContent = 'Проверяю…'; });
    try {
      let current = getLatestData();
      let record = freshHistoryRecord(id);
      if (!record || record.status !== 'pending') throw new Error('Это предложение уже обработано');
      const checked = validateProposal(current, record.proposal);
      checkTaskProposalConstraint(checked, record.taskIntentConstraint);
      if (!await revisionsMatch(current, checked.actions, record.baseRevisions)) throw new Error('Связанные данные изменились после создания предложения. Создай новое предложение на основе актуального состояния.');
      const warnings = proposalWarnings(current, checked);
      const tempNames = new Map();
      const details = checked.actions.map(action => proposalActionText(current, action, tempNames)).join('\n');
      const confirmText = `Применить предложение «${checked.summary}»?\n\n${checked.actions.length} изменений будут внесены одним пакетом. Проверь полный список и предупреждения в карточке.\n\n${details.slice(0, 3000)}${details.length > 3000 ? '\n…' : ''}${warnings.length ? `\n\nПредупреждения:\n${warnings.join('\n').slice(0, 1000)}` : ''}`;
      if (!confirm(confirmText)) return;
      // A fresh storage read after confirmation prevents applying against a stale tab.
      current = getLatestData();
      record = freshHistoryRecord(id);
      if (!record || record.status !== 'pending' || !await revisionsMatch(current, checked.actions, record.baseRevisions)) throw new Error('Данные успели измениться. Предложение не применено; создай новый план.');
      const applied = await applyProposalRecord(current, id);
      commit(applied, { reconcile: false });
      renderProposals();
      appendMessage('system', `Предложение «${checked.summary}» применено. Сохранено действий: ${checked.actions.length}.`);
    } catch (error) {
      const latest = getLatestData();
      const record = historyOf(latest).find(item => item.id === id);
      if (record?.status === 'pending') persistHistory({ ...record, status: 'error', errorMessage: String(error.message || 'Ошибка применения').slice(0, 500) }, '', latest);
      renderProposals();
      appendMessage('system', error.message || 'Не удалось применить предложение. Данные не изменены.', 'ai-message-error');
    } finally {
      applying = false;
      renderProposals();
    }
  }

  function openProposalEditor(id) {
    const record = historyOf(getData()).find(item => item.id === id && item.status === 'pending');
    if (!record) return;
    editingProposalId = id;
    $('aiProposalEditText').value = JSON.stringify(record.proposal, null, 2);
    $('aiProposalEditError').textContent = '';
    $('aiProposalEditDialog').showModal();
    $('aiProposalEditText').focus();
  }

  $('aiProposalEditForm').addEventListener('submit', async event => {
    event.preventDefault();
    const id = editingProposalId;
    if (!id) return;
    try {
      const latest = getLatestData();
      const record = historyOf(latest).find(item => item.id === id && item.status === 'pending');
      if (!record) throw new Error('Предложение уже обработано');
      const proposal = validateProposal(latest, $('aiProposalEditText').value);
      checkTaskProposalConstraint(proposal, record.taskIntentConstraint);
      const fresh = await captureTargetRevisions(latest, proposal.actions);
      const previousTargets = await captureTargetRevisions(latest, record.proposal.actions);
      const original = Object.fromEntries(Object.entries(record.baseRevisions || {}).filter(([key]) => Object.hasOwn(fresh, key) && Object.hasOwn(previousTargets, key)));
      const baseRevisions = { ...fresh, ...original };
      if (!reviseHistory(id, { proposal, baseRevisions }, latest)) throw new Error('Не удалось сохранить изменённое предложение');
      $('aiProposalEditDialog').close();
      editingProposalId = null;
      appendMessage('system', 'Изменённое предложение проверено и сохранено. Оно ожидает подтверждения.');
    } catch (error) { $('aiProposalEditError').textContent = error.message || 'Проверь JSON и ссылки.'; }
  });

  $('aiProposals').addEventListener('click', event => {
    const apply = event.target.closest('[data-ai-proposal-apply]');
    if (apply) { applyPendingProposal(apply.dataset.aiProposalApply); return; }
    const edit = event.target.closest('[data-ai-proposal-edit]');
    if (edit) { openProposalEditor(edit.dataset.aiProposalEdit); return; }
    const reject = event.target.closest('[data-ai-proposal-reject]');
    if (reject) {
      const record = freshHistoryRecord(reject.dataset.aiProposalReject);
      if (record?.status === 'pending') {
        reviseHistory(record.id, { status: 'rejected', rejectedAt: new Date().toISOString() });
        appendMessage('system', 'Предложение отклонено. Данные LIFE OS не менялись.');
      }
    }
  });

  $('aiForm').addEventListener('submit', event => {
    event.preventDefault();
    sendMessage($('aiPrompt').value);
  });
  $('aiClear').addEventListener('click', () => {
    if (pending) return;
    pendingClarification = null;
    messages.length = 0;
    $('aiMessages').replaceChildren();
    appendMessage('assistant', 'Спроси о LIFE OS или поручи действие — я отвечу либо подготовлю предложение. Любые изменения сохраняются только после твоей проверки и отдельного подтверждения.');
  });
  $('aiRetry').addEventListener('click', checkHealth);
  $('aiPrompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('aiForm').requestSubmit(); }
  });
  document.querySelectorAll('[data-ai-example]').forEach(button => button.addEventListener('click', () => {
    $('aiPrompt').value = button.dataset.aiExample || '';
    $('aiPrompt').focus();
  }));
  appendMessage('assistant', 'Спроси о LIFE OS или поручи действие — я отвечу либо подготовлю предложение. Любые изменения сохраняются только после твоей проверки и отдельного подтверждения.');
  renderProposals();
  if (PUBLIC_BUILD) { $('aiSend').disabled=true; $('aiPrompt').disabled=true; document.querySelectorAll('[data-ai-example]').forEach(button=>button.disabled=true); }
  checkHealth();
  return { render: renderProposals };
}
