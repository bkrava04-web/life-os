import { categoryById, saveCategory, removeCategory, saveObjective, removeObjective, saveStage, removeStage, moveStage, linkedUnits, stageProgress, objectiveProgress } from './organization.js?v=stage9.3.3';
import { esc, taskHtml, taskOnDate, scheduled, isDone } from './tasks.js?v=stage9.3.3';
import { today, pretty, dateKey, parseDate } from './calendar.js?v=stage9.3.3';
import { validDate } from './schedule.js?v=stage9.3.3';

const statusNames = { active: 'Активна', paused: 'На паузе', completed: 'Завершена' };
const priorityNames = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
export function createOrganizationUI({ getData, commit, toast, openTask }) {
  const $ = id => document.getElementById(id);
  let selectedId = null, categoryEditId = null, objectiveEditId = null, stageEditId = null;
  const expandedStages = new Set();
  let deletingCategoryId = null, stageParentId = null, taskDate = today();
  function categoryOptions(selected = '') {
    const data = getData();
    return '<option value="">Без категории</option>' + data.categories.map(category => `<option value="${esc(category.id)}" ${category.id === selected ? 'selected' : ''}>${esc(category.icon)} ${esc(category.name)}</option>`).join('');
  }
  function progressHtml(result) {
    return result.defined ? `<div class="row small muted"><span>Прогресс</span><strong>${result.value}%</strong></div><div class="progress"><span style="width:${result.value}%"></span></div>` : '<p class="muted small">Прогресс пока не определён</p>';
  }
  function categoryBadge(data, id) {
    const category = categoryById(data, id);
    const color = category && /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : '#a594f9';
    return `<span class="category-badge" style="--category-color:${color}">${category ? esc(category.icon) + ' ' + esc(category.name) : 'Без категории'}</span>`;
  }
  function finishedStage(data, stage) {
    const progress = stageProgress(data, stage);
    return stage.status === 'completed' || (!progress.requiresConfirmation && progress.value === 100);
  }
  function stageCount(data, objective) {
    const stages = data.stages.filter(stage => stage.objectiveId === objective.id);
    return { total: stages.length, done: stages.filter(stage => finishedStage(data, stage)).length };
  }
  function objectiveCard(data, objective) {
    const count = stageCount(data, objective);
    return `<button type="button" class="card objective-card" data-open-objective="${esc(objective.id)}" aria-label="Открыть ${objective.type === 'project' ? 'проект' : 'цель'}: ${esc(objective.name)}"><span class="row wrap objective-card-meta">${categoryBadge(data, objective.categoryId)}<span class="objective-status status-${objective.status}">${statusNames[objective.status]}</span></span><span class="objective-card-title">${esc(objective.name)}</span><span class="objective-excerpt">${esc(objective.description || 'Описание не добавлено')}</span>${progressHtml(objectiveProgress(data, objective))}<span class="objective-card-footer"><span>${count.done}/${count.total} этапов завершено</span><span class="objective-card-arrow" aria-hidden="true">↗</span></span></button>`;
  }
  function nearestTask(data, objective) {
    if (objective.status !== 'active') return null;
    const candidates = [];
    for (const unit of linkedUnits(data, objective.id)) {
      if (unit.task.active === false || data.stages.find(stage => stage.id === unit.task.stageId)?.status === 'paused') continue;
      let date = unit.date || taskDate;
      if (!unit.date) {
        const cursor = parseDate(date);
        for (let i = 0; i < 8 && !scheduled(unit.task, date); i++) {
          cursor.setDate(cursor.getDate() + 1); date = dateKey(cursor);
        }
      }
      const task = taskOnDate(data, unit.task.id, date);
      if (task?.active !== false && task?.objectiveId === objective.id && scheduled(task, date) && !isDone(data, task.id, date)) candidates.push({ task, date });
    }
    return candidates.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  function unitsHtml(data, objectiveId, stageId) {
    const units = linkedUnits(data, objectiveId, stageId);
    if (!units.length) return '<p class="organization-empty">Пока нет заданий — добавь первый шаг.</p>';
    return units.map(unit => {
      const date = unit.date || taskDate;
      const task = taskOnDate(data, unit.task.id, date);
      if (!task || task.objectiveId !== objectiveId || (task.stageId || null) !== stageId || task.active === false || !scheduled(task, date)) {
        return `<div class="notice linked-task-muted"><strong>${esc(unit.task.name)}</strong><p class="muted small">${unit.done ? 'Есть завершённое выполнение' : 'Не завершено'} · ${unit.date ? pretty(unit.date) : 'На выбранную дату не запланировано'}</p><button data-edit-task="${esc(unit.task.id)}" data-date="${esc(date)}">Редактировать</button></div>`;
      }
      return `<div class="linked-task-date muted small">${pretty(date)}</div>` + taskHtml(data, task, date);
    }).join('');
  }
  function renderDetail(data, objective) {
    $('objectiveDetail').querySelectorAll('[data-stage-accordion]').forEach(detail => {
      if (detail.open) expandedStages.add(detail.dataset.stageAccordion);
      else expandedStages.delete(detail.dataset.stageAccordion);
    });
    const stages = data.stages.filter(stage => stage.objectiveId === objective.id);
    const count = stageCount(data, objective);
    const currentStage = stages.find(stage => stage.status === 'active' && !finishedStage(data, stage));
    const next = nearestTask(data, objective);
    const stageRows = stages.map((stage, index) => {
      const progress = stageProgress(data, stage);
      return `<div class="stage-shell"><details class="stage-accordion" data-stage-accordion="${esc(stage.id)}" ${expandedStages.has(stage.id) ? 'open' : ''}><summary><span class="stage-chevron" aria-hidden="true">›</span><span class="stage-index">${String(index + 1).padStart(2, '0')}</span><span class="stage-summary-title">${esc(stage.name)}</span><span class="objective-status status-${stage.status}">${statusNames[stage.status]}</span><span class="stage-summary-progress" title="${progress.defined ? 'Прогресс этапа' : 'Прогресс пока не определён'}">${progress.defined ? progress.value + '%' : '—'}</span></summary><div class="stage-body">${stage.description ? `<p class="task-description small">${esc(stage.description)}</p>` : ''}${stage.status === 'completed' ? '<p class="muted small">Завершён вручную; XP заданий не изменён.</p>' : ''}${unitsHtml(data, objective.id, stage.id)}<button data-objective-task="${esc(objective.id)}" data-stage-id="${esc(stage.id)}" class="stage-add-task">+ Добавить задание</button></div></details><details class="stage-menu"><summary aria-label="Действия этапа ${esc(stage.name)}" title="Действия этапа">⋯</summary><div class="stage-menu-items"><button data-edit-stage="${esc(stage.id)}">Редактировать</button><button data-move-stage="${esc(stage.id)}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑ Переместить выше</button><button data-move-stage="${esc(stage.id)}" data-direction="1" ${index === stages.length - 1 ? 'disabled' : ''}>↓ Переместить ниже</button><button class="danger" data-delete-stage="${esc(stage.id)}">Удалить этап</button></div></details></div>`;
    }).join('');
    $('objectiveDetail').innerHTML = `<div class="objective-detail-layout"><div class="row wrap objective-breadcrumb"><button id="backToObjectives">← Все цели и проекты</button><div class="actions"><button data-edit-objective="${esc(objective.id)}">Редактировать</button><button class="danger" data-delete-objective="${esc(objective.id)}">Удалить</button></div></div><header class="objective-detail-header"><div class="row wrap">${categoryBadge(data, objective.categoryId)}<span class="objective-status status-${objective.status}">${objective.type === 'project' ? 'Проект' : 'Цель'} · ${statusNames[objective.status]}</span></div><h2 class="objective-title">${esc(objective.name)}</h2>${objective.description ? `<p class="task-description objective-detail-description">${esc(objective.description)}</p>` : ''}<p class="objective-dates muted small">Приоритет: ${priorityNames[objective.priority] || 'Обычный'}${objective.startDate ? ' · ' + pretty(objective.startDate) : ''}${objective.endDate ? ' → ' + pretty(objective.endDate) : ''}</p></header><div class="objective-pulse"><div class="pulse-stage"><span class="eyebrow">Текущий этап</span><strong>${currentStage ? esc(currentStage.name) : count.total && count.done === count.total ? 'Все этапы выполнены' : 'Нет активного этапа'}</strong><span class="muted small">${count.done} из ${count.total} этапов завершено</span></div><div class="pulse-progress">${progressHtml(objectiveProgress(data, objective))}</div><div class="pulse-next"><span class="eyebrow">Ближайшее задание</span>${next ? `<button data-focus-linked-task="${esc(next.task.id)}" data-task-date="${esc(next.date)}" data-stage-id="${esc(next.task.stageId || '')}">${esc(next.task.name)} <span aria-hidden="true">↗</span></button><span class="muted small">${pretty(next.date)}</span>` : '<span class="muted small">Нет актуальных заданий</span>'}</div></div><div class="objective-stage-toolbar"><h3 class="section-title">Этапы <span class="muted small">${stages.length}</span></h3><div class="actions"><label class="visually-hidden" for="objectiveTaskDate">Дата повторяющихся заданий</label><input id="objectiveTaskDate" type="date" value="${taskDate}" title="Дата повторяющихся заданий"><button data-new-stage="${esc(objective.id)}">+ Этап</button></div></div><div class="stage-list">${stageRows || '<p class="organization-empty">Этапов пока нет. Можно добавить этап или начать с задания.</p>'}</div><section class="objective-unassigned"><div class="row wrap"><h3 class="section-title">Задания без этапа</h3><button data-objective-task="${esc(objective.id)}">+ Задание</button></div>${unitsHtml(data, objective.id, null)}</section></div>`;
  }
  function render() {
    const data = getData();
    const filter = $('organizationFilter').value;
    $('organizationFilter').innerHTML = '<option value="all">Все категории</option>' + categoryOptions();
    $('organizationFilter').value = [...$('organizationFilter').options].some(option => option.value === filter) ? filter : 'all';
    $('categoryList').innerHTML = data.categories.length ? data.categories.map(category => `<div class="category-row">${categoryBadge(data, category.id)}<div class="actions"><button data-edit-category="${esc(category.id)}">Изменить</button><button class="danger" data-remove-category="${esc(category.id)}">Удалить</button></div></div>`).join('') : '<p class="muted small">Категорий нет. Задания могут оставаться без категории.</p>';
    const objective = data.objectives.find(objective => objective.id === selectedId);
    if (!objective) selectedId = null;
    $('objectiveDetail').classList.toggle('hidden', !objective);
    $('objectiveLists').classList.toggle('hidden', !!objective);
    if (objective) { renderDetail(data, objective); return; }
    const categoryFilter = $('organizationFilter').value;
    const visible = data.objectives.filter(objective => categoryFilter === 'all' || (objective.categoryId || '') === categoryFilter);
    const groups = [
      ['Активные цели', visible.filter(o => o.type === 'goal' && o.status === 'active')],
      ['Активные проекты', visible.filter(o => o.type === 'project' && o.status === 'active')],
      ['Приостановленные', visible.filter(o => o.status === 'paused')],
      ['Завершённые', visible.filter(o => o.status === 'completed')],
    ];
    $('objectiveLists').innerHTML = groups.map(([title, items]) => `<section class="objective-group"><h2 class="section-title group-title">${title}<span>${items.length}</span></h2><div class="objective-grid">${items.length ? items.map(objective => objectiveCard(data, objective)).join('') : '<p class="organization-empty">Пока нет.</p>'}</div></section>`).join('');
  }
  function openCategory(id = null) {
    categoryEditId = id;
    const category = categoryById(getData(), id);
    $('categoryForm').reset(); $('categoryDialogTitle').textContent = category ? 'Изменить категорию' : 'Новая категория';
    $('categoryName').value = category?.name || ''; $('categoryIcon').value = category?.icon || '◇';
    $('categoryColor').value = /^#[0-9a-f]{6}$/i.test(category?.color) ? category.color : '#a594f9';
    $('categoryDialog').showModal();
  }
  function openObjective(id = null, type = 'goal') {
    objectiveEditId = id;
    const objective = getData().objectives.find(objective => objective.id === id);
    $('objectiveForm').reset(); $('objectiveDialogTitle').textContent = objective ? 'Изменить цель или проект' : 'Новая цель или проект';
    $('objectiveType').value = objective?.type || type; $('objectiveName').value = objective?.name || '';
    $('objectiveDescription').value = objective?.description || ''; $('objectiveCategory').innerHTML = categoryOptions(objective?.categoryId);
    $('objectiveStatus').value = objective?.status || 'active'; $('objectivePriority').value = objective?.priority || 'normal';
    $('objectiveStart').value = objective?.startDate || ''; $('objectiveEnd').value = objective?.endDate || '';
    $('objectiveDialog').showModal();
  }
  function openStage(objectiveId, id = null) {
    stageEditId = id; stageParentId = objectiveId;
    const stage = getData().stages.find(stage => stage.id === id);
    $('stageForm').reset(); $('stageDialogTitle').textContent = stage ? 'Изменить этап' : 'Новый этап';
    $('stageName').value = stage?.name || ''; $('stageDescription').value = stage?.description || ''; $('stageStatus').value = stage?.status || 'active';
    $('stageDialog').showModal();
  }
  function submit(formId, dialogId, action) {
    $(formId).addEventListener('submit', event => {
      event.preventDefault();
      try { action(); commit(); $(dialogId).close(); toast('Сохранено'); }
      catch (error) { toast(error.message); }
    });
  }
  submit('categoryForm', 'categoryDialog', () => saveCategory(getData(), categoryEditId, { name: $('categoryName').value, icon: $('categoryIcon').value, color: $('categoryColor').value }));
  submit('categoryDeleteForm', 'categoryDeleteDialog', () => removeCategory(getData(), deletingCategoryId, $('categoryTransfer').value || null));
  submit('objectiveForm', 'objectiveDialog', () => {
    const startDate = $('objectiveStart').value || null, endDate = $('objectiveEnd').value || null;
    if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && endDate < startDate)) throw new Error('Проверь даты начала и завершения');
    const objective = saveObjective(getData(), objectiveEditId, { name: $('objectiveName').value, type: $('objectiveType').value, description: $('objectiveDescription').value.trim(), categoryId: $('objectiveCategory').value || null, status: $('objectiveStatus').value, priority: $('objectivePriority').value, startDate, endDate });
    selectedId = objective.id;
  });
  submit('stageForm', 'stageDialog', () => {
    const stage = saveStage(getData(), stageEditId, { objectiveId: stageParentId, name: $('stageName').value, description: $('stageDescription').value.trim(), status: $('stageStatus').value });
    expandedStages.add(stage.id);
  });
  $('organizationFilter').addEventListener('change', () => { selectedId = null; render(); });
  $('manageCategories').addEventListener('click', () => $('categoryManagerDialog').showModal());
  $('newCategory').addEventListener('click', () => openCategory());
  $('newGoal').addEventListener('click', () => openObjective(null, 'goal'));
  $('newProject').addEventListener('click', () => openObjective(null, 'project'));
  document.addEventListener('change', event => {
    if (event.target.id === 'objectiveTaskDate' && validDate(event.target.value)) { taskDate = event.target.value; render(); }
  });
  document.addEventListener('click', event => {
    const menu = event.target.closest('.stage-menu');
    document.querySelectorAll('.stage-menu[open]').forEach(open => { if (open !== menu) open.open = false; });
    const button = event.target.closest('button');
    if (!button) return;
    if (menu) menu.open = false;
    const data = getData();
    if (button.id === 'backToObjectives') { const previousId = selectedId; selectedId = null; render(); [...$('objectiveLists').querySelectorAll('[data-open-objective]')].find(card => card.dataset.openObjective === previousId)?.focus(); }
    if (button.dataset.openObjective) { selectedId = button.dataset.openObjective; render(); $('backToObjectives').focus(); }
    if (button.dataset.focusLinkedTask) {
      taskDate = button.dataset.taskDate;
      render();
      if (button.dataset.stageId) {
        const stage = [...$('objectiveDetail').querySelectorAll('[data-stage-accordion]')].find(item => item.dataset.stageAccordion === button.dataset.stageId);
        if (stage) { stage.open = true; expandedStages.add(button.dataset.stageId); }
      }
      const detail = [...$('objectiveDetail').querySelectorAll('[data-task-details]')].find(item => item.dataset.taskDetails === button.dataset.focusLinkedTask && item.dataset.date === taskDate);
      if (detail) { detail.open = true; detail.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); detail.querySelector('summary').focus({ preventScroll: true }); }
    }
    if (button.dataset.editCategory) openCategory(button.dataset.editCategory);
    if (button.dataset.removeCategory) {
      deletingCategoryId = button.dataset.removeCategory;
      $('categoryDeleteName').textContent = categoryById(data, deletingCategoryId)?.name || '';
      $('categoryTransfer').innerHTML = '<option value="">Оставить без категории</option>' + data.categories.filter(category => category.id !== deletingCategoryId).map(category => `<option value="${esc(category.id)}">Перенести в ${esc(category.name)}</option>`).join('');
      $('categoryDeleteDialog').showModal();
    }
    if (button.dataset.editObjective) openObjective(button.dataset.editObjective);
    if (button.dataset.deleteObjective && confirm('Удалить цель или проект и его этапы? Задания и прогресс останутся самостоятельными.')) { removeObjective(data, button.dataset.deleteObjective); commit(); }
    if (button.dataset.newStage) openStage(button.dataset.newStage);
    if (button.dataset.editStage) { const stage = data.stages.find(stage => stage.id === button.dataset.editStage); if (stage) openStage(stage.objectiveId, stage.id); }
    if (button.dataset.deleteStage && confirm('Удалить этап? Задания сохранятся у цели или проекта без этапа.')) { removeStage(data, button.dataset.deleteStage); commit(); }
    if (button.dataset.moveStage) { moveStage(data, button.dataset.moveStage, Number(button.dataset.direction)); commit(); }
    if (button.dataset.objectiveTask) openTask({ date: taskDate, fromCalendar: true, objectiveId: button.dataset.objectiveTask, stageId: button.dataset.stageId || null });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target.closest('.stage-menu[open]')) {
      const menu = event.target.closest('.stage-menu'); menu.open = false; menu.querySelector('summary').focus(); event.preventDefault();
    }
  });
  return { render, open(id) { selectedId = id; render(); } };
}
