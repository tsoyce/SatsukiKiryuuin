(function (global) {
  'use strict';
  const MAX_BYTES=4*1024*1024,MAX_ENTRIES=200,MAX_COPIES=200;
  const DEFAULTS=Object.freeze({theme:'classic',heading:'ДИПЛОМ',recipientLabel:'Награждается',eventName:'',eventSubtitle:'',date:'',city:'',showEvent:true,showEventSubtitle:true,showDate:true,showCity:true,showLogo:true,showReason:true,signatureMode:'department',departmentRole:'Руководитель кафедры',departmentName:'',committeeRole:'Оргкомитет',committeeName:'',fontSize:16,nameSize:28,printLayer:'all',laserBlack:true});
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const counters={listCalls:0,listProjectReads:0,projectReads:0,projectWrites:0};
  function fail(message){throw new Error(message);}
  function text(v,fallback,limit,label){if(v===undefined)return fallback;if(typeof v!=='string')fail(label+': ожидается текст.');if(v.length>limit)fail(label+': не более '+limit+' знаков.');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(label+': недопустимый управляющий символ.');return v;}
  function id(v,label){if(typeof v!=='string'||!v||v.length>160||/[\u0000-\u001f\u007f]/.test(v))fail(label+': неверный идентификатор.');return v;}
  function choice(v,values,label){if(!values.includes(v))fail(label+': неизвестное значение.');return v;}
  function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(label+': укажите число от '+min+' до '+max+'.');return v;}
  function boolean(v,fallback,label){if(v===undefined)return fallback;if(typeof v!=='boolean')fail(label+': ожидается включено или выключено.');return v;}
  function settings(value){
    if(value===undefined)return{...DEFAULTS};if(!object(value))fail('Настройки диплома должны быть объектом.');
    const out={...DEFAULTS},limits={heading:160,recipientLabel:160,eventName:1000,eventSubtitle:1000,date:160,city:240,departmentRole:240,departmentName:500,committeeRole:240,committeeName:500};
    for(const key of Object.keys(value)){
      if(!own(DEFAULTS,key))fail('Неизвестная настройка диплома: '+key+'.');
      const v=value[key];
      if(key==='theme')out[key]=choice(v,['classic','frost'],'Оформление');
      else if(key==='signatureMode')out[key]=choice(v,['department','committee','both'],'Подписи');
      else if(key==='printLayer')out[key]=choice(v,['all','inkjet','laser'],'Слой печати');
      else if(key==='laserBlack'||key.startsWith('show'))out[key]=boolean(v,true,key);
      else if(key==='fontSize')out[key]=number(v,13,20,'Размер основного текста');
      else if(key==='nameSize')out[key]=number(v,20,34,'Размер имени');
      else out[key]=text(v,DEFAULTS[key],limits[key],key);
    }
    return out;
  }
  function newId(prefix){const random=global.crypto?.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);return(prefix||'diploma')+'-'+random;}
  function validate(value){
    if(!object(value)||value.format!=='diploma-studio'||value.version!==1)fail('Это не проект дипломов поддерживаемой версии. Выберите JSON из раздела «Дипломы».');
    if(!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)fail('В проекте должно быть не больше '+MAX_ENTRIES+' дипломов.');
    const seen=new Set();let total=0;
    const entries=value.entries.map((entry,index)=>{
      const label='Диплом '+(index+1);if(!object(entry))fail(label+': неверная структура.');const entryId=id(entry.id,label);if(seen.has(entryId))fail('В проекте повторяется идентификатор диплома.');seen.add(entryId);
      const copies=entry.copies===undefined?1:number(entry.copies,1,100,label+', тираж');if(!Number.isInteger(copies))fail(label+': тираж должен быть целым.');total+=copies;
      return{id:entryId,recipient:text(entry.recipient,'',3000,label+', получатель'),reason:text(entry.reason,'',6000,label+', основание'),place:choice(entry.place===undefined?'none':entry.place,['none','1','2','3','hand'],label+', место'),copies,handRecipient:boolean(entry.handRecipient,false,label+', имя от руки'),handReason:boolean(entry.handReason,false,label+', основание от руки')};
    });
    if(total>MAX_COPIES)fail('В одном проекте можно подготовить до '+MAX_COPIES+' экземпляров. Уменьшите тираж.');
    const project={format:'diploma-studio',version:1,id:id(value.id,'Проект'),title:text(value.title,'Дипломы',240,'Название проекта'),entries,selectedId:typeof value.selectedId==='string'&&seen.has(value.selectedId)?value.selectedId:(entries[0]?.id||''),settings:settings(value.settings),updatedAt:typeof value.updatedAt==='string'&&Number.isFinite(Date.parse(value.updatedAt))?new Date(value.updatedAt).toISOString():new Date().toISOString()};
    if(new TextEncoder().encode(JSON.stringify(project)).byteLength>MAX_BYTES)fail('Проект превышает 4 МБ. Сократите текст и повторите импорт.');
    return project;
  }
  function create(seed){const s=object(seed)?seed:{};return validate({format:'diploma-studio',version:1,id:newId('diploma-project'),title:s.title===undefined?'Дипломы':s.title,entries:s.entries||[],selectedId:s.selectedId,settings:s.settings,updatedAt:new Date().toISOString()});}
  const directory=(global.location?.pathname||'/').replace(/[^/]*$/,''),databaseName='diploma-studio-v1:'+directory,lastKey='diploma-studio-last-v1:'+directory;
  let dbPromise;
  function storageError(error){if(error?.name==='QuotaExceededError')return new Error('Не хватает места в браузере. Скачайте проект в JSON. Последние изменения не сохранены.');return new Error('Браузер не сохранил проект дипломов. Скачайте резервную копию. '+(error?.message||'Проверьте разрешение на хранение данных сайта.'));}
  function database(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!global.indexedDB){reject(new Error('Хранение проектов в этом браузере недоступно. Используйте экспорт проекта в JSON.'));return;}
      let request,settled=false;try{request=global.indexedDB.open(databaseName,1);}catch(error){reject(storageError(error));return;}
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('projects',{keyPath:'id'});db.createObjectStore('metadata',{keyPath:'id'});};
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
      request.onerror=()=>{settled=true;reject(storageError(request.error));};
      request.onblocked=()=>{settled=true;reject(new Error('Закройте другие вкладки редактора, чтобы открыть хранилище дипломов.'));};
    }).catch(error=>{dbPromise=null;throw error;});return dbPromise;
  }
  async function transaction(stores,mode,run){const db=await database();return new Promise((resolve,reject)=>{let tx,result;try{try{tx=db.transaction(stores,mode,mode==='readwrite'?{durability:'strict'}:undefined);}catch(_){tx=db.transaction(stores,mode);}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(storageError(tx.error));tx.onabort=()=>reject(storageError(tx.error));run(tx,v=>{result=v;},error=>{try{tx.abort();}catch(_){}reject(storageError(error));});}catch(error){if(tx)try{tx.abort();}catch(_){}reject(storageError(error));}});}
  const metadataFor=p=>({id:p.id,title:p.title,updatedAt:p.updatedAt,entries:p.entries.length,totalCopies:p.entries.reduce((sum,e)=>sum+e.copies,0),selectedId:p.selectedId,theme:p.settings.theme});
  async function list(){counters.listCalls++;const records=await transaction(['metadata'],'readonly',(tx,done)=>{const r=tx.objectStore('metadata').getAll();r.onsuccess=()=>done(r.result);});return(records||[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  async function load(projectId){id(projectId,'Проект');const record=await transaction(['projects'],'readonly',(tx,done)=>{const r=tx.objectStore('projects').get(projectId);counters.projectReads++;r.onsuccess=()=>done(r.result);});return record?validate(record):null;}
  async function save(project){const value=validate(project);value.updatedAt=new Date().toISOString();await transaction(['projects','metadata'],'readwrite',tx=>{tx.objectStore('projects').put(value);tx.objectStore('metadata').put(metadataFor(value));counters.projectWrites++;});return value;}
  async function rename(projectId,title){id(projectId,'Проект');title=text(title,'',240,'Название проекта').trim();if(!title)fail('Введите название проекта.');return transaction(['projects','metadata'],'readwrite',(tx,done,abort)=>{const store=tx.objectStore('projects'),r=store.get(projectId);r.onsuccess=()=>{try{if(!r.result){done(null);return;}const current={...r.result,title,updatedAt:new Date().toISOString()};store.put(current);const meta=metadataFor(current);tx.objectStore('metadata').put(meta);counters.projectWrites++;done(meta);}catch(error){abort(error);}};});}
  async function remove(projectId){id(projectId,'Проект');await transaction(['projects','metadata'],'readwrite',tx=>{tx.objectStore('projects').delete(projectId);tx.objectStore('metadata').delete(projectId);});if(lastId()===projectId)setLastId('');}
  function lastId(){try{return global.localStorage.getItem(lastKey)||'';}catch(_){return'';}}
  function setLastId(projectId){if(projectId)id(projectId,'Проект');try{if(projectId)global.localStorage.setItem(lastKey,projectId);else global.localStorage.removeItem(lastKey);return true;}catch(_){return false;}}
  async function importFile(file){if(!file||typeof file.text!=='function')fail('Выберите JSON-файл проекта дипломов.');if(file.size>MAX_BYTES)fail('Файл проекта превышает 4 МБ.');let value;try{value=JSON.parse(await file.text());}catch(_){fail('Не удалось прочитать JSON. Выберите файл, сохранённый редактором дипломов.');}return validate(value);}
  global.DiplomaStore=Object.freeze({DEFAULTS,MAX_BYTES,MAX_ENTRIES,MAX_COPIES,newId,create,validate,list,load,save,rename,remove,lastId,setLastId,importFile,statistics:()=>({...counters})});
})(window);
