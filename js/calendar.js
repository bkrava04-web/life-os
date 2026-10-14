import { overnightCarry } from './schedule.js?v=stage9.3.3';

// Local dates, month navigation and calendar rendering.
// Task access is supplied by app.js so this module does not import tasks.js.
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function today() {
  return dateKey(new Date());
}

export function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function pretty(value) {
  return parseDate(value).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function createCalendar() {
  const shownMonth = new Date();
  shownMonth.setDate(1);
  let selectedDate = today();
  const element = id => document.getElementById(id);

  function renderSelected({ tasksFor, taskHtml, workoutHtml, scheduleFor, schedule, isDone }) {
    const shift = scheduleFor(selectedDate);
    const carry = overnightCarry(selectedDate, schedule);
    element('selectedShift').innerHTML = `<strong class="shift-${shift.kind}">${shift.label}${shift.overridden ? ' · ✎ исключение' : ''}</strong><div>${shift.time}</div>${shift.kind === 'night' ? `<div class="small muted">Окончание: ${pretty(shift.endDate)}, 08:00</div>` : ''}${carry ? `<div class="small muted" style="margin-top:8px">Ночная от ${pretty(carry.date)} заканчивается сегодня в 08:00.</div>` : ''}<div class="small muted" style="margin-top:8px">День ${shift.cycleDay} из 8${shift.overridden ? ' · цикл не изменён' : ''}</div>`;
    element('selectedDateTitle').textContent = pretty(selectedDate);
    const tasks = tasksFor(selectedDate);
    const done = tasks.filter(task => isDone(task.id, selectedDate)).length;
    element('selectedTaskCount').textContent = `${done} / ${tasks.length}`;
    element('selectedTaskBar').style.width = (tasks.length ? done / tasks.length * 100 : 0) + '%';
    const workouts = tasks.map(task => workoutHtml?.(task, selectedDate) || '').filter(Boolean);
    const ordinary = tasks.filter(task => !workoutHtml?.(task, selectedDate));
    element('selectedWorkouts').innerHTML = workouts.length ? workouts.join('') : '<div class="empty compact-empty">Тренировок на этот день нет.</div>';
    element('selectedWorkoutSection').classList.toggle('hidden', !workouts.length);
    element('selectedTasks').innerHTML = ordinary.length
      ? ordinary.map(task => taskHtml(task, selectedDate)).join('')
      : '<div class="empty compact-empty">Других задач на этот день нет.</div>';
  }

  function render({ tasksFor, taskHtml, workoutHtml, checkCount, scheduleFor, schedule, isDone }) {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    element('monthLabel').textContent = shownMonth.toLocaleDateString('ru-RU', {
      month: 'long', year: 'numeric',
    });
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const last = new Date(year, month + 1, 0).getDate();
    let html = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
      .map(day => `<div class="weekday">${day}</div>`).join('');
    const cells = Math.ceil((offset + last) / 7) * 7;

    for (let i = 0; i < cells; i++) {
      const day = i - offset + 1;
      if (day < 1 || day > last) {
        const date = new Date(year, month, day);
        html += `<div class="day dim"><div class="num">${date.getDate()}</div></div>`;
        continue;
      }
      const key = dateKey(new Date(year, month, day));
      const shift = scheduleFor(key);
      const classes = ['day', 'day-shift-' + shift.kind, key === today() ? 'today' : '', key === selectedDate ? 'selected' : ''].join(' ');
      html += `<button type="button" class="${classes}" data-day="${key}" aria-label="${pretty(key)}, ${shift.label}, ${shift.time}${shift.overridden ? ', ручное исключение' : ''}, выполнено: ${checkCount(key)}" aria-pressed="${key === selectedDate}" ${key === today() ? 'aria-current="date"' : ''}><div class="num">${day}</div><span class="shift-mark shift-${shift.kind}">${shift.short}${shift.overridden ? ' ✎' : ''}</span>${checkCount(key) ? `<div><span class="dot"></span><span class="small muted">${checkCount(key)}</span></div>` : ''}</button>`;
    }
    element('calendar').innerHTML = html;
    renderSelected({ tasksFor, taskHtml, workoutHtml, scheduleFor, schedule, isDone });
  }

  return {
    render,
    getSelectedDate() { return selectedDate; },
    select(date) { selectedDate = date; },
    shiftMonth(offset) { shownMonth.setMonth(shownMonth.getMonth() + offset); },
  };
}
