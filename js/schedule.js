// Pure schedule calculations. Count calendar days in UTC to avoid DST drift.
export const DEFAULT_CYCLE_START = '2000-01-01';
export const DAY_TYPES = Object.freeze([
  { type: 'day1', label: 'Первая дневная', short: 'Д1', kind: 'day', time: '08:00–20:00' },
  { type: 'day2', label: 'Вторая дневная', short: 'Д2', kind: 'day', time: '08:00–20:00' },
  { type: 'off1', label: 'Первый выходной', short: 'В1', kind: 'off', time: 'Без смены' },
  { type: 'off2', label: 'Второй выходной', short: 'В2', kind: 'off', time: 'Без смены' },
  { type: 'night1', label: 'Первая ночная', short: 'Н1', kind: 'night', time: '20:00–08:00 следующего дня' },
  { type: 'night2', label: 'Вторая ночная', short: 'Н2', kind: 'night', time: '20:00–08:00 следующего дня' },
  { type: 'recovery', label: 'Восстановление', short: 'ВС', kind: 'recovery', time: 'Без новой смены' },
  { type: 'off', label: 'Выходной', short: 'В', kind: 'off', time: 'Без смены' },
]);
const types = new Map(DAY_TYPES.map(day => [day.type, day]));

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function ordinal(value) {
  if (!validDate(value)) throw new Error('Invalid schedule date');
  return Date.parse(value + 'T00:00:00Z') / 86400000;
}

export function shiftDate(value, days) {
  return new Date((ordinal(value) + days) * 86400000).toISOString().slice(0, 10);
}

export function normalizeSchedule(value) {
  const overrides = {};
  if (value?.overrides && typeof value.overrides === 'object') {
    for (const [date, type] of Object.entries(value.overrides)) {
      if (validDate(date) && types.has(type)) overrides[date] = type;
    }
  }
  return {
    cycleStart: validDate(value?.cycleStart) ? value.cycleStart : DEFAULT_CYCLE_START,
    overrides,
  };
}

export function daySchedule(date, schedule) {
  const start = schedule?.cycleStart || DEFAULT_CYCLE_START;
  const offset = ordinal(date) - ordinal(start);
  const index = ((offset % 8) + 8) % 8; // Also extrapolate dates before the anchor.
  const override = schedule?.overrides?.[date];
  const definition = types.get(override) || DAY_TYPES[index];
  const working = definition.kind === 'day' || definition.kind === 'night';
  return {
    ...definition, date, cycleDay: index + 1, overridden: types.has(override),
    startDate: working ? date : null,
    endDate: working ? (definition.kind === 'night' ? shiftDate(date, 1) : date) : null,
    startTime: working ? (definition.kind === 'night' ? '20:00' : '08:00') : null,
    endTime: working ? (definition.kind === 'night' ? '08:00' : '20:00') : null,
  };
}

// The previous night's end is separate from the shift starting on this date.
export function overnightCarry(date, schedule) {
  const previous = daySchedule(shiftDate(date, -1), schedule);
  return previous.kind === 'night' ? previous : null;
}
