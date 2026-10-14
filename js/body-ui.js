import { saveMeasurement, metricSeries, metricChange, nextReminder } from './body.js?v=stage9.3.3';
import { listPhotos, putPhotos, deletePhoto, compressPhoto, exportPhotosJSON, parsePhotosJSON, PHOTO_VIEWS } from './body-photos.js?v=stage9.3.3';
import { today, pretty } from './calendar.js?v=stage9.3.3';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2});
function chart(data,key,label,unit) {
  const entries=metricSeries(data,key);
  if(!entries.length) return '<div class="body-chart-empty">Первый график появится после измерения</div>';
  const values=entries.map(e=>e[key]), min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*0.15,0.5),low=min-pad,high=max+pad;
  const start=Date.parse(entries[0].date),end=Date.parse(entries.at(-1).date);
  const points=entries.map(e=>({x:entries.length===1?215:55+(Date.parse(e.date)-start)/(end-start)*325,y:150-(e[key]-low)/(high-low)*120,e}));
  return `<svg class="body-chart" viewBox="0 0 400 190" role="img" aria-label="${label}: ${entries.map(e=>`${pretty(e.date)} — ${number(e[key])} ${unit}`).join('; ')}"><title>${label}</title>${[0,1,2].map(i=>{const y=30+i*60;return `<line x1="55" x2="380" y1="${y}" y2="${y}" class="body-chart-grid"/><text x="5" y="${y+4}">${number(high-(high-low)*i/2)}</text>`;}).join('')}<polyline class="body-chart-line" points="${points.map(p=>`${p.x},${p.y}`).join(' ')}"/>${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"><title>${pretty(p.e.date)}: ${number(p.e[key])} ${unit}</title></circle>`).join('')}<text x="55" y="179">${entries[0].date.slice(5).split('-').reverse().join('.')}</text>${entries.length>1?`<text x="380" y="179" text-anchor="end">${entries.at(-1).date.slice(5).split('-').reverse().join('.')}</text>`:''}</svg>`;
}
export function createBodyUI({getData,commit,toast}) {
  let photos=[],urls=[],modalUrls=[],generation=0,fieldGeneration=0,editingId=null,photoDate=null,pendingImport=null;
  function revoke(){urls.forEach(url=>URL.revokeObjectURL(url));urls=[];}
  function photoImage(photo,modal=false){const url=URL.createObjectURL(photo.blob);(modal?modalUrls:urls).push(url);return `<img src="${url}" alt="${PHOTO_VIEWS[photo.view]} — ${pretty(photo.date)}" loading="lazy">`;}
  function message(error){toast(error.message || 'Не удалось выполнить действие');}
  function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderComparison(){
    revoke();
    $('bodyComparison').innerHTML=['bodyCompareA','bodyCompareB'].map(id=>{
      const date=$(id).value;return `<div class="body-compare-column"><h3>${date?pretty(date):'Выбери дату'}</h3><div class="body-photo-grid">${Object.entries(PHOTO_VIEWS).map(([view,label])=>{const photo=photos.find(p=>p.date===date&&p.view===view);return `<figure>${photo?photoImage(photo):'<div class="body-no-photo">Нет фото</div>'}<figcaption>${label}</figcaption></figure>`;}).join('')}</div></div>`;
    }).join('');
  }
  async function render(active=true){
    const token=++generation;
    if(!active){revoke();return;}
    const data=getData();
    for(const [key,label,unit,id] of [['weightKg','Вес','кг','bodyWeight'],['waistCm','Талия','см','bodyWaist']]){
      const change=metricChange(data,key);
      $(id).innerHTML=`<div class="row"><h2>${label}</h2><span class="muted small">${unit}</span></div><div class="body-metric">${change?number(change.latest[key]):'—'} <small>${unit}</small></div><p class="muted small">${change?`${change.delta>0?'+':''}${number(change.delta)} ${unit} с ${pretty(change.first.date)}`:'Исходные показатели ещё не внесены'}</p>${chart(data,key,label,unit)}`;
    }
    try { const loaded=await listPhotos(); if(token!==generation)return;photos=loaded;$('bodyPhotoStatus').textContent=''; } catch(error) { if(token!==generation)return; $('bodyPhotoStatus').textContent='Хранилище фотографий недоступно: '+error.message; photos=[]; }
    revoke();
    const waist=nextReminder(metricSeries(data,'waistCm').map(e=>e.date),today()),photo=nextReminder(photos.map(p=>p.date),today());
    $('bodyReminders').innerHTML=[['Талия',waist],['Фотографии',photo]].map(([label,item])=>`<div><span class="muted small">${label} · каждые 14 дней</span><strong>${item?`${item.due?'Пора обновить · ':''}${pretty(item.date)}`:'Добавь первую запись'}</strong></div>`).join('');
    const entries=data.body.measurements,dates=[...new Set([...entries.map(e=>e.date),...photos.map(p=>p.date)])].sort().reverse();
    $('bodyHistory').innerHTML=dates.length?dates.map(date=>{
      const entry=entries.find(e=>e.date===date),dayPhotos=photos.filter(p=>p.date===date);
      return `<article class="body-history-row"><div><h3>${pretty(date)}</h3><div class="body-history-values">${entry?.weightKg!=null?`<span>${number(entry.weightKg)} кг</span>`:''}${entry?.waistCm!=null?`<span>Талия ${number(entry.waistCm)} см</span>`:''}<span class="muted small">${dayPhotos.length?`${dayPhotos.length} фото`:'Без фотографий'}</span></div>${entry?.comment?`<p class="muted small">${escape(entry.comment)}</p>`:''}</div><div class="actions">${entry?`<button data-body-edit="${escape(entry.id)}" aria-label="Изменить измерение ${date}">Изменить</button><button data-body-delete="${escape(entry.id)}" aria-label="Удалить измерение ${date}">Удалить</button>`:''}<button data-body-photos="${date}">Фото</button></div></article>`;
    }).join(''):'<p class="muted">Начни с одной записи. Целевые показатели приложение не устанавливает.</p>';
    const photoDates=[...new Set(photos.map(p=>p.date))].sort();
    for(const id of ['bodyCompareA','bodyCompareB']) {const previous=$(id).value;$(id).innerHTML='<option value="">Выбрать дату</option>'+photoDates.map(date=>`<option value="${date}">${pretty(date)}</option>`).join('');$(id).value=photoDates.includes(previous)?previous:(id==='bodyCompareA'?photoDates[0]:photoDates.at(-1)) || '';}
    renderComparison();
    $('bodyPhotoCount').textContent=`${photos.length} фото · хранятся только в этом браузере`;
  }
  function openMeasurement(id=null){
    const entry=getData().body.measurements.find(e=>e.id===id);editingId=entry?.id||null;
    $('bodyMeasureTitle').textContent=entry?'Изменить измерение':'Новое измерение';
    $('bodyMeasureDate').value=entry?.date||today();$('bodyMeasureWeight').value=entry?.weightKg??'';$('bodyMeasureWaist').value=entry?.waistCm??'';$('bodyMeasureComment').value=entry?.comment||'';
    $('bodyMeasureDialog').showModal();
  }
  async function openPhotos(date=today()){
    $('bodyPhotoForm').reset();$('bodyPhotoDate').value=date;
    await photoFields();$('bodyPhotosDialog').showModal();
  }
  async function photoFields(){
    const date=$('bodyPhotoDate').value;if(!date)return;
    const token=++fieldGeneration,records=await listPhotos();if(token!==fieldGeneration)return;photoDate=date;photos=records;modalUrls.forEach(url=>URL.revokeObjectURL(url));modalUrls=[];
    $('bodyPhotoFields').innerHTML=Object.entries(PHOTO_VIEWS).map(([view,label])=>{const photo=photos.find(p=>p.date===date&&p.view===view);return `<div class="body-photo-field"><label for="bodyPhoto-${view}">${label}</label>${photo?photoImage(photo,true):'<div class="body-no-photo">Необязательно</div>'}<input id="bodyPhoto-${view}" data-photo-file="${view}" type="file" accept="image/jpeg,image/png,image/webp">${photo?`<button type="button" data-photo-delete="${photo.id}">Удалить фото</button>`:''}</div>`;}).join('');
  }
  $('bodyNewMeasurement').onclick=()=>openMeasurement();
  $('bodyAddPhotos').onclick=()=>openPhotos().catch(message);
  $('bodyMeasureForm').onsubmit=event=>{
    event.preventDefault();try{
      const value=id=>$(id).value.trim()===''?null:Number($(id).value);
      saveMeasurement(getData(),{id:editingId,date:$('bodyMeasureDate').value,weightKg:value('bodyMeasureWeight'),waistCm:value('bodyMeasureWaist'),comment:$('bodyMeasureComment').value});commit();$('bodyMeasureDialog').close();toast('Измерение сохранено');
    }catch(error){message(error);}
  };
  $('bodyHistory').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.bodyEdit)openMeasurement(button.dataset.bodyEdit);
    if(button.dataset.bodyDelete&&confirm('Удалить измерение? Фотографии этой даты останутся и удаляются отдельно.')) {getData().body.measurements=getData().body.measurements.filter(e=>e.id!==button.dataset.bodyDelete);commit();}
    if(button.dataset.bodyPhotos)openPhotos(button.dataset.bodyPhotos).catch(message);
  };
  $('bodyPhotoDate').onchange=()=>photoFields().catch(message);
  $('bodyPhotoFields').onclick=async event=>{const button=event.target.closest('[data-photo-delete]');if(!button||!confirm('Удалить эту фотографию с устройства?'))return;try{await deletePhoto(button.dataset.photoDelete);await photoFields();await render();}catch(error){message(error);}};
  $('bodyPhotoForm').onsubmit=async event=>{
    event.preventDefault();const button=$('bodyPhotoSave');button.disabled=true;$('bodyPhotoDate').disabled=true;
    try{
      const date=$('bodyPhotoDate').value,files=[...$('bodyPhotoFields').querySelectorAll('[data-photo-file]')].filter(input=>input.files[0]);
      if(photoDate!==date)throw new Error('Дождись обновления выбранной даты и выбери фотографии снова');
      if(!files.length)throw new Error('Выбери хотя бы одну фотографию');
      if(files.some(input=>photos.some(p=>p.date===date&&p.view===input.dataset.photoFile))&&!confirm('Заменить существующие фотографии выбранных ракурсов?'))return;
      const records=[];for(const input of files) {const view=input.dataset.photoFile;records.push({id:`${date}:${view}`,date,view,blob:await compressPhoto(input.files[0])});}
      await putPhotos(records);$('bodyPhotosDialog').close();await render();toast('Фотографии сжаты и сохранены локально');
    }catch(error){message(error);}finally{button.disabled=false;$('bodyPhotoDate').disabled=false;}
  };
  $('bodyPhotosDialog').addEventListener('close',()=>{fieldGeneration++;modalUrls.forEach(url=>URL.revokeObjectURL(url));modalUrls=[];});
  $('bodyPhotoImportDialog').addEventListener('close',()=>{pendingImport=null;});
  for(const id of ['bodyCompareA','bodyCompareB'])$(id).onchange=()=>{revoke();renderComparison();};
  $('bodyExportPhotos').onclick=async()=>{try{download(await exportPhotosJSON(),`life-os-photos-${today()}.json`);toast('Фотоархив скачан отдельно от измерений');}catch(error){message(error);}};
  $('bodyImportPhotos').onclick=()=>$('bodyPhotoImportFile').click();
  $('bodyPhotoImportFile').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{if(file.size>100*1024*1024)throw new Error('Фотоархив превышает 100 МБ');pendingImport=await parsePhotosJSON(await file.text());const existing=await listPhotos();const duplicates=pendingImport.filter(p=>existing.some(e=>e.id===p.id)).length;
      $('bodyPhotoImportSummary').textContent=`Проверено фотографий: ${pendingImport.length}. Совпадений по дате и ракурсу: ${duplicates}. По умолчанию существующие фото сохраняются.`;$('bodyPhotoOverwrite').checked=false;$('bodyPhotoImportDialog').showModal();
    }catch(error){pendingImport=null;message(error);}
  };
  $('bodyPhotoRestore').onclick=async()=>{
    if(!pendingImport)return;const button=$('bodyPhotoRestore');button.disabled=true;
    try{const existing=await listPhotos();const overwrite=$('bodyPhotoOverwrite').checked;if(overwrite&&!confirm('Заменить совпадающие фотографии из архива?'))return;
      const records=pendingImport.filter(p=>overwrite||!existing.some(e=>e.id===p.id));await putPhotos(records);pendingImport=null;$('bodyPhotoImportDialog').close();await render();toast(`Восстановлено фото: ${records.length}`);
    }catch(error){message(error);}finally{button.disabled=false;}
  };
  return {render};
}
