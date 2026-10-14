import { STORAGE_KEY } from './storage.js?v=stage9.3.3';
import { listPhotos, readRecovery, prepareRestore, finishRestore } from './body-photos.js?v=stage9.3.3';
import { createArchive, parseArchive, restoreArchive, recoverRestore, MAX_ARCHIVE_BYTES } from './full-backup.js?v=stage9.3.3';
export const backupIO={readRaw:()=>localStorage.getItem(STORAGE_KEY),writeRaw:raw=>raw===null?localStorage.removeItem(STORAGE_KEY):localStorage.setItem(STORAGE_KEY,raw),readRecovery,prepareRestore,finishRestore};
export async function recoverBeforeStartup() {
  try { await recoverRestore(backupIO); }
  catch { document.body.replaceChildren();const message=document.createElement('p');message.textContent='Не удалось завершить откат резервной копии. Не очищай данные браузера. Закрой другие вкладки LIFE OS, освободи место и перезагрузи страницу. Приложение остановлено для сохранения данных.';document.body.append(message);throw new Error('Recovery required'); }
}
export function initFullBackup({onRestored,setBusy}) {
  const $=id=>document.getElementById(id);let pending=null;let busy=false;let blocked=false;
  async function run(operation) {
    if(busy)return;busy=true;setBusy(true);$('fullExport').disabled=$('fullImport').disabled=$('fullRestoreConfirm').disabled=true;
    const regions=[document.querySelector('main'),document.querySelector('.sidebar'),document.querySelector('.top')];regions.forEach(x=>{if(x)x.inert=true;});
    try {await operation();}catch(error){blocked=!!error.recoveryRequired;alert(error.message||'Операция не выполнена.');}
    finally {if(blocked){document.body.inert=true;return;}busy=false;setBusy(false);regions.forEach(x=>{if(x)x.inert=false;});$('fullExport').disabled=$('fullImport').disabled=$('fullRestoreConfirm').disabled=false;}
  }
  $('fullExport').onclick=()=>run(async()=>{
    const raw=backupIO.readRaw(), photos=await listPhotos();
    if(raw!==backupIO.readRaw())throw new Error('Данные изменились в другой вкладке. Закрой её и повтори экспорт.');
    const text=await createArchive(raw,photos);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`life-os-full-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  $('fullImport').onclick=()=>{ $('fullBackupFile').value='';$('fullBackupFile').click(); };
  $('fullBackupFile').onchange=event=>run(async()=>{
    pending=null;const file=event.target.files[0];if(!file)return;if(file.size>MAX_ARCHIVE_BYTES)throw new Error('Архив превышает 128 МБ');
    pending=await parseArchive(await file.text(),{decodeImage:async blob=>{const bitmap=await createImageBitmap(blob);bitmap.close();}});
    const s=pending.summary;$('fullRestoreSummary').textContent=`Задач: ${s.tasks}. Проектов: ${s.projects}. Целей: ${s.goals}. Тренировок: ${s.workouts} (программ: ${s.programs}). Открытых/полученных достижений: ${s.achievements}; пользовательских определений: ${s.customAchievements}. Фотографий: ${s.photos}.`;
    $('fullRestoreDialog').showModal();
  });
  $('fullRestoreCancel').onclick=()=>{pending=null;$('fullRestoreDialog').close();};
  $('fullRestoreDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else pending=null;});
  $('fullRestoreConfirm').onclick=()=>run(async()=>{
    if(!pending)return;
    if(!confirm('Заменить все данные и фотографии этого браузера содержимым копии? Закрой другие вкладки LIFE OS перед продолжением.'))return;
    const archive=pending;await restoreArchive(archive,backupIO);pending=null;$('fullRestoreDialog').close();onRestored(archive.raw);alert('Полная копия восстановлена. Данные и оригинальные фотографии сохранены.');
  });
}
