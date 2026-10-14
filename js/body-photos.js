import { validDate } from './schedule.js?v=stage9.3.3';
export const PHOTO_VIEWS = { front:'Спереди', side:'Сбоку', back:'Со спины' };
const DB_NAME='lifeOS_body_photos_v1';
let connection;
function database() {
  if (!connection) connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,2);
    request.onupgradeneeded=()=>{ const db=request.result; if(!db.objectStoreNames.contains('photos')) db.createObjectStore('photos',{keyPath:'id'}); if(!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery'); };
    request.onsuccess=()=>{ const db=request.result; db.onversionchange=()=>{db.close();connection=null;}; resolve(db); };
    request.onerror=()=>{connection=null;reject(request.error);};
    request.onblocked=()=>{connection=null;reject(new Error('Закрой другие вкладки LIFE OS и повтори'));};
  });
  return connection;
}
async function transaction(mode, operation) {
  const db=await database(); return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos',mode), store=tx.objectStore('photos'); let result;
    tx.oncomplete=()=>resolve(result); tx.onerror=tx.onabort=()=>reject(tx.error || new Error('Не удалось сохранить фотографии'));
    const request=operation(store); if(request) request.onsuccess=()=>{result=request.result;};
  });
}
export async function listPhotos() { return (await transaction('readonly',store=>store.getAll())).sort((a,b)=>b.date.localeCompare(a.date)); }
export async function putPhotos(records) {
  for(const record of records) if(!validDate(record.date)||!Object.hasOwn(PHOTO_VIEWS,record.view)||record.id!==`${record.date}:${record.view}`||!(record.blob instanceof Blob)||record.blob.type!=='image/jpeg') throw new Error('Некорректная фотография');
  return transaction('readwrite',store=>{for(const record of records) store.put(record);}); }
export async function deletePhoto(id) { return transaction('readwrite',store=>store.delete(id)); }
export async function compressPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>30*1024*1024) throw new Error('Используй JPEG, PNG или WebP до 30 МБ. HEIC предварительно преобразуй в JPEG.');
  let bitmap;
  try { bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}); } catch { throw new Error('Не удалось прочитать изображение'); }
  try {
    const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
    if(!blob || blob.size>3*1024*1024) throw new Error('Изображение слишком большое после сжатия'); return blob;
  } finally { bitmap.close(); }
}
function dataURL(blob) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);}); }
export async function exportPhotosJSON() {
  const records=await listPhotos(), photos=[];
  for(const record of records) photos.push({date:record.date,view:record.view,image:await dataURL(record.blob)});
  return JSON.stringify({format:'life-os-body-photos',version:1,photos});
}
export async function parsePhotosJSON(text) {
  if(text.length>100*1024*1024) throw new Error('Фотоархив превышает 100 МБ');
  const root=JSON.parse(text);
  if(root?.format!=='life-os-body-photos' || root.version!==1 || !Array.isArray(root.photos) || root.photos.length>1000) throw new Error('Неверный формат фотоархива');
  const ids=new Set(), result=[];
  // Validate and decode everything before opening a write transaction.
  for(const photo of root.photos) {
    if(!validDate(photo.date) || !Object.hasOwn(PHOTO_VIEWS,photo.view) || typeof photo.image!=='string' || photo.image.length>8*1024*1024) throw new Error('Некорректная фотография');
    const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(photo.image);
    const id=`${photo.date}:${photo.view}`; if(!match || ids.has(id)) throw new Error('Некорректное изображение или повтор даты и ракурса'); ids.add(id);
    const raw=atob(match[2]), bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    result.push({id,date:photo.date,view:photo.view,blob:await compressPhoto(new Blob([bytes],{type:match[1]}))});
  }
  return result;
}

// A durable undo journal coordinates IndexedDB with the unchanged localStorage key.
export async function readRecovery() {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction('recovery','readonly');let value;tx.objectStore('recovery').get('restore').onsuccess=e=>{value=e.target.result;};tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error);});
}
export async function prepareRestore(raw) {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction(['photos','recovery'],'readwrite');
    tx.objectStore('recovery').get('restore').onsuccess=e=>{if(e.target.result){tx.abort();return;}
      tx.objectStore('photos').getAll().onsuccess=e=>{tx.objectStore('recovery').put({raw,photos:e.target.result},'restore');};};
    tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Есть незавершённое восстановление. Перезагрузи страницу.'));});
}
export async function finishRestore(records) {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction(['photos','recovery'],'readwrite');const store=tx.objectStore('photos');store.clear();for(const record of records)store.put(record);tx.objectStore('recovery').delete('restore');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Не удалось восстановить фотографии'));});
}
