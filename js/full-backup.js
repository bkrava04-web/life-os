import { STORAGE_KEY, validateData } from './storage.js?v=stage9.3.3';
import { validDate } from './schedule.js?v=stage9.3.3';
export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const encoder = new TextEncoder();
export async function sha256(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
}
function noSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:token|.*[_-]token|password|secret|.*[_-]secret|api[_-]?key|authorization|bridge_base_url)$/i.test(key)) throw new Error('В данных обнаружено поле секрета. Экспорт/импорт остановлен; данные не изменены.');
    if (typeof item === 'string' && /(?:Bearer\s+[A-Za-z0-9._-]+|sb_secret_[A-Za-z0-9_-]+)/i.test(item)) throw new Error('В данных обнаружен возможный секрет. Операция остановлена.');
    noSecrets(item);
  }
}
export function checkRaw(raw) {
  if (typeof raw !== 'string') throw new Error('Нет сохранения LIFE OS в этом браузере. Сначала проверь адрес и профиль.');
  const data = JSON.parse(raw); validateData(data); noSecrets(data); return data;
}
function toBase64(bytes) {
  let text=''; for(let i=0;i<bytes.length;i+=32768) text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);
}
function photoMetadata(photo, ids) {
  if (!validDate(photo.date) || !['front','side','back'].includes(photo.view) || photo.id!==`${photo.date}:${photo.view}` || ids.has(photo.id) || photo.mime!=='image/jpeg') throw new Error('Некорректная фотография или повтор ID');
  ids.add(photo.id);
}
function jpeg(bytes) { if(bytes.length<4 || bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217) throw new Error('Повреждённый JPEG'); }
export async function createArchive(raw, records) {
  checkRaw(raw); if(records.length>1000) throw new Error('Полная копия поддерживает до 1000 фотографий.'); const photos=[], ids=new Set();
  for(const record of records) {
    const bytes=new Uint8Array(await record.blob.arrayBuffer()); jpeg(bytes);
    const photo={id:record.id,date:record.date,view:record.view,mime:record.blob.type,size:bytes.length,sha256:await sha256(bytes),base64:toBase64(bytes)};
    photoMetadata(photo,ids);photos.push(photo);
  }
  const payload=JSON.stringify({storageKey:STORAGE_KEY,raw,photos});
  const result=JSON.stringify({format:'life-os-full-backup',version:1,algorithm:'SHA-256',payload,sha256:await sha256(payload)});
  if(encoder.encode(result).length>MAX_ARCHIVE_BYTES) throw new Error('Полная копия превышает 128 МБ. Данные не изменены.');return result;
}
export async function parseArchive(text, {decodeImage}={}) {
  if(typeof text!=='string'||encoder.encode(text).length>MAX_ARCHIVE_BYTES) throw new Error('Архив превышает 128 МБ');
  const root=JSON.parse(text);
  if(root?.format!=='life-os-full-backup'||root.version!==1||root.algorithm!=='SHA-256'||typeof root.payload!=='string')throw new Error('Неверный формат или версия полной копии');
  if(await sha256(root.payload)!==root.sha256)throw new Error('Нарушена целостность архива');
  const payload=JSON.parse(root.payload);
  if(payload.storageKey!==STORAGE_KEY||!Array.isArray(payload.photos)||payload.photos.length>1000)throw new Error('Некорректное содержимое архива');
  const data=checkRaw(payload.raw), photos=[],ids=new Set();
  for(const photo of payload.photos) {
    photoMetadata(photo,ids);
    if(typeof photo.base64!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo.base64))throw new Error('Некорректная кодировка фото');
    const bytes=Uint8Array.from(atob(photo.base64),c=>c.charCodeAt(0));jpeg(bytes);
    if(bytes.length!==photo.size||await sha256(bytes)!==photo.sha256)throw new Error('Нарушена целостность фотографии');
    const blob=new Blob([bytes],{type:photo.mime});if(decodeImage)await decodeImage(blob);
    photos.push({id:photo.id,date:photo.date,view:photo.view,blob});
  }
  return {raw:payload.raw,photos,summary:{tasks:data.tasks.length,projects:(data.objectives||[]).filter(x=>x.type==='project').length,goals:(data.objectives||[]).filter(x=>x.type==='goal').length,workouts:(data.sports?.sessions||[]).length,programs:(data.sports?.programs||[]).length,achievements:Object.values(data.achievementSystem?.entries||{}).filter(x=>x.state==='claimed'||x.state==='unlocked').length,customAchievements:(data.customAchievements||[]).length,photos:photos.length}};
}
// Dependencies allow fault injection without accessing a user's browser.
export async function recoverRestore(io) {
  const journal=await io.readRecovery();if(!journal)return false;
  io.writeRaw(journal.raw);await io.finishRestore(journal.photos);return true;
}
export async function restoreArchive(archive,io) {
  const old=io.readRaw();await io.prepareRestore(old);
  try { io.writeRaw(archive.raw);await io.finishRestore(archive.photos); }
  catch(error) {
    try { await recoverRestore(io); }
    catch { const failure = new Error('Восстановление прервано. Резервный журнал сохранён. Закрой другие вкладки и перезагрузи LIFE OS; не очищай данные браузера.'); failure.recoveryRequired = true; throw failure; }
    throw new Error('Восстановление отменено; прежние данные и фото возвращены. '+error.message);
  }
}
