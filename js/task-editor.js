import { categoryById } from './organization.js?v=stage9.3.3';
import { addTask, editTask, taskOnDate, uid, esc } from './tasks.js?v=stage9.3.3';
import { today, pretty } from './calendar.js?v=stage9.3.3';
import { validDate } from './schedule.js?v=stage9.3.3';

// Draft changes live only in this dialog until the user saves them.
export function createTaskEditor({ getData, commit, toast }) {
  const $ = id => document.getElementById(id);
  let editingId = null, selectedDate = today(), steps = [];
  const dialog = $('taskDialog');

  function renderSteps() {
    $('subtaskEditor').innerHTML = steps.map((step, index) => `<div class="subtask-editor-row" data-step="${esc(step.id)}"><span class="step-number">${index + 1}</span><input aria-label="Подзадача ${index + 1}" data-step-name="${esc(step.id)}" value="${esc(step.name)}" maxlength="200" required><label class="step-required"><input type="checkbox" data-step-required="${esc(step.id)}" ${step.required !== false ? 'checked' : ''}>Обязательная</label><div class="actions"><button type="button" data-step-up="${esc(step.id)}" aria-label="Переместить подзадачу ${index + 1} вверх" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-step-down="${esc(step.id)}" aria-label="Переместить подзадачу ${index + 1} вниз" ${index === steps.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-step-remove="${esc(step.id)}" class="danger" aria-label="Удалить подзадачу ${index + 1}">×</button></div></div>`).join('');
  }
  function updateFields() {
    const compound = $('taskType').value === 'compound';
    $('compoundFields').classList.toggle('hidden', !compound);
    $('taskGoalField').classList.toggle('hidden', !compound);
    $('subtaskEditor').querySelectorAll('input[data-step-name]').forEach(input => input.required = compound);
    const base = getData().tasks.find(task => task.id === editingId);
    const occurrence = !!base && base.frequency !== 'once' && $('editScope').value === 'date';
    $('taskFrequency').disabled = occurrence;
    $('taskDateField').classList.toggle('hidden', $('taskFrequency').value !== 'once' && !occurrence);
    $('taskDate').disabled = occurrence;
    $('taskDate').required = !occurrence && $('taskFrequency').value === 'once';
    $('scopeHint').textContent = occurrence ? 'Название, план и XP изменятся только для выбранной даты. Повторение серии сохраняется.' : 'Завершённые дни сохраняют свой план и награду. Изменения серии применяются к остальным дням; отдельные исключения сохраняются.';
  }
  function refreshObjectives(selected = null) {
    const data = getData();
    const categoryId = data.categories.find(category => category.name === $('taskCategory').value)?.id || null;
    const current = selected || $('taskObjective').value;
    $('taskObjective').innerHTML = '<option value="">Самостоятельное задание</option>' + data.objectives.filter(objective => (objective.categoryId || null) === categoryId).map(objective => `<option value="${esc(objective.id)}">${objective.type === 'project' ? 'Проект' : 'Цель'}: ${esc(objective.name)}</option>`).join('');
    $('taskObjective').value = [...$('taskObjective').options].some(option => option.value === current) ? current : '';
    refreshStages();
  }
  function refreshStages(selected = null) {
    const current = selected || $('taskStage').value;
    $('taskStage').innerHTML = '<option value="">Без этапа</option>' + getData().stages.filter(stage => stage.objectiveId === $('taskObjective').value).map(stage => `<option value="${esc(stage.id)}">${esc(stage.name)}</option>`).join('');
    $('taskStage').value = [...$('taskStage').options].some(option => option.value === current) ? current : '';
    $('taskStage').disabled = !$('taskObjective').value;
  }
  $('taskCategory').addEventListener('change', () => refreshObjectives());
  $('taskObjective').addEventListener('change', () => refreshStages());
  function open({ id = null, date = today(), fromCalendar = false, objectiveId = null, stageId = null } = {}) {
    editingId = id;
    selectedDate = date;
    const task = id ? taskOnDate(getData(), id, date) : null;
    $('taskForm').reset();
    $('taskDialogTitle').textContent = task ? 'Редактировать задание' : 'Новое задание';
    $('taskContextDate').textContent = pretty(date);
    $('taskName').value = task?.name || '';
    $('taskType').value = task?.type || 'simple';
    $('taskDescription').value = task?.description || '';
    $('taskGoal').value = task?.goal || '';
    const data = getData();
    const objective = data.objectives.find(item => item.id === (task?.objectiveId || objectiveId));
    $('taskCategory').innerHTML = '<option value="">Без категории</option>' + data.categories.map(category => `<option value="${esc(category.name)}">${esc(category.icon)} ${esc(category.name)}</option>`).join('');
    $('taskCategory').value = categoryById(data, objective?.categoryId || task?.categoryId)?.name || '';
    refreshObjectives(task?.objectiveId || objectiveId);
    refreshStages(task?.stageId || stageId);
    $('taskXp').value = task?.xp ?? 20;
    $('taskFrequency').value = task?.frequency || (fromCalendar ? 'once' : 'daily');
    $('taskDate').value = task?.date || date;
    $('taskActivity').value = task?.activityType || '';
    $('taskDuration').value = task?.duration || '';
    $('taskIntensity').value = task?.intensity || '';
    document.querySelectorAll('[name="suitableDay"]').forEach(input => input.checked = (task?.suitableDays || []).includes(input.value));
    steps = (task?.subtasks || []).map(step => ({ ...step }));
    const recurring = !!task && getData().tasks.find(item => item.id === id)?.frequency !== 'once';
    $('editScopeField').classList.toggle('hidden', !recurring);
    $('editScope').value = recurring && fromCalendar ? 'date' : 'series';
    $('scopeHint').classList.toggle('hidden', !task);
    renderSteps();
    updateFields();
    dialog.showModal();
    $('taskName').focus();
  }
  ['taskType', 'taskFrequency', 'editScope'].forEach(id => $(id).addEventListener('change', updateFields));
  $('addSubtask').addEventListener('click', () => {
    steps.push({ id: uid(), name: '', required: true });
    renderSteps(); updateFields();
    $('subtaskEditor').querySelectorAll('[data-step-name]').item(steps.length - 1)?.focus();
  });
  $('subtaskEditor').addEventListener('input', event => {
    const input = event.target;
    const step = steps.find(step => step.id === (input.dataset.stepName || input.dataset.stepRequired));
    if (!step) return;
    if (input.dataset.stepName) step.name = input.value;
    if (input.dataset.stepRequired) step.required = input.checked;
  });
  $('subtaskEditor').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.stepUp || button.dataset.stepDown || button.dataset.stepRemove;
    const index = steps.findIndex(step => step.id === id);
    if (index < 0) return;
    if (button.dataset.stepRemove) steps.splice(index, 1);
    else {
      const target = index + (button.dataset.stepUp ? -1 : 1);
      if (target < 0 || target >= steps.length) return;
      [steps[index], steps[target]] = [steps[target], steps[index]];
    }
    renderSteps(); updateFields();
  });
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('taskName').value.trim();
    const compound = $('taskType').value === 'compound';
    if (!name) { toast('Укажи название'); return; }
    if (compound && (!steps.length || steps.some(step => !step.name.trim()))) {
      toast('Добавь хотя бы одну подзадачу и заполни названия'); return;
    }
    const frequency = $('taskFrequency').value;
    if (frequency === 'once' && !validDate($('taskDate').value)) { toast('Выбери дату задания'); return; }
    const duration = $('taskDuration').value ? Math.max(1, Math.min(1440, Number($('taskDuration').value))) : null;
    const fields = {
      name, type: compound ? 'compound' : 'simple',
      description: $('taskDescription').value.trim(), goal: compound ? $('taskGoal').value.trim() : '',
      category: $('taskCategory').value,
      categoryId: getData().categories.find(category => category.name === $('taskCategory').value)?.id || null,
      objectiveId: $('taskObjective').value || null, stageId: $('taskStage').value || null,
      xp: Math.max(1, Math.min(500, Number($('taskXp').value) || 20)),
      frequency, date: frequency === 'once' ? $('taskDate').value : null,
      subtasks: compound ? steps.map(step => ({ ...step, name: step.name.trim() })) : [],
      activityType: $('taskActivity').value || null, duration,
      intensity: $('taskIntensity').value || null,
      suitableDays: [...document.querySelectorAll('[name="suitableDay"]:checked')].map(input => input.value),
    };
    if (editingId) editTask(getData(), editingId, selectedDate, $('editScope').value, fields);
    else addTask(getData(), fields);
    commit();
    dialog.close();
    toast(editingId ? 'Задание обновлено' : 'Задание добавлено');
  });
  return { open };
}
