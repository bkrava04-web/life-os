import { validDate, shiftDate } from './schedule.js?v=stage9.3.3';
export function ensureBody(data) { data.body ||= { version: 1, measurements: [] }; return data; }
export function validateBody(body) {
  if (body === undefined) return;
  if (!body || body.version !== 1 || !Array.isArray(body.measurements)) throw new Error('Некорректный формат измерений');
  const ids = new Set(), dates = new Set();
  for (const entry of body.measurements) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !validDate(entry.date) || dates.has(entry.date)) throw new Error('Некорректная дата или ID измерения');
    for (const [key, max] of [['weightKg',500],['waistCm',400]]) if (entry[key] != null && (!Number.isFinite(entry[key]) || entry[key] <= 0 || entry[key] > max)) throw new Error('Некорректное значение измерения');
    if (typeof entry.comment !== 'string' || entry.comment.length > 2000 || (entry.weightKg == null && entry.waistCm == null)) throw new Error('Укажи хотя бы один показатель');
    ids.add(entry.id); dates.add(entry.date);
  }
}
export function saveMeasurement(data, entry) {
  ensureBody(data);
  const next = { id: entry.id || crypto.randomUUID(), date: entry.date, weightKg: entry.weightKg ?? null, waistCm: entry.waistCm ?? null, comment: entry.comment || '' };
  const entries = data.body.measurements.filter(item => item.id !== next.id);
  entries.push(next); validateBody({version:1,measurements:entries}); data.body.measurements = entries; return next;
}
export function metricSeries(data, key) { return (data.body?.measurements || []).filter(e => e[key] != null).sort((a,b)=>a.date.localeCompare(b.date)); }
export function metricChange(data,key) { const entries=metricSeries(data,key); return entries.length ? {first:entries[0],latest:entries.at(-1),delta:entries.at(-1)[key]-entries[0][key]} : null; }
export function nextReminder(dates, today) { const last=dates.filter(date=>date<=today).sort().at(-1); return last ? {date:shiftDate(last,14),due:shiftDate(last,14)<=today} : null; }
