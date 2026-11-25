(function (global) {
  'use strict';
  const HANDOFF_PREFIX='invitation-launch-v1:',HANDOFF_TTL=120000;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function route(attribute,fallback){
    const value=global.document.documentElement.getAttribute(attribute)||fallback;
    const url=new URL(value,global.location.href);
    if(url.origin!==global.location.origin||url.protocol!==global.location.protocol)throw new Error('Адрес редактора должен находиться на этом сайте.');
    url.search='';url.hash='';return url;
  }
  function invitationScope(){return route('data-invitation-scope','index.html').pathname;}
  function invitationRoute(){return route('data-invitation-route','invitations.html');}
  function bookmarkRoute(){return route('data-bookmark-route','bookmarks.html').href;}
  function diplomaRoute(){return route('data-diploma-route','diplomas.html').href;}
  function launchDiploma(input={}){
    const id=input.id;
    if(typeof id!=='string'||!id||id.length>160||/[\u0000-\u001f\u007f]/.test(id))throw new Error('Выберите проект дипломов из списка.');
    const url=new URL(diplomaRoute());url.searchParams.set('project',id);return url.href;
  }
  function invitationAliases(){
    const canonical=invitationScope(),directory=canonical.replace(/[^/]*$/,'');
    return Array.from(new Set([canonical,directory,invitationRoute().pathname]));
  }
  function read(key){try{return JSON.parse(global.localStorage.getItem(key)||'null');}catch(_){return null;}}
  function actor(value){
    const text=String(value==null?'':value).trim();
    if(!text||Array.from(text).length>80||/[\u0000-\u001f\u007f]/.test(text))throw new Error('Укажите имя или login: от 1 до 80 символов.');
    return text;
  }
  function getActor(){for(const path of invitationAliases()){const value=read('invitation-actor-v1:'+path);if(typeof value!=='string')continue;try{return actor(value);}catch(_){}}return '';}
  function setActor(value){
    const login=actor(value);
    try{global.localStorage.setItem('invitation-actor-v1:'+invitationScope(),JSON.stringify(login));}catch(_){}
    return login;
  }
  function title(value,limit=160){
    if(typeof value!=='string'||!value.trim()||value.trim().length>limit||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Введите название проекта: от 1 до '+limit+' символов.');
    return value.trim();
  }
  function projectId(value){if(typeof value!=='string'||!/^p_[a-f0-9]{32}$/.test(value))throw new Error('Выберите проект из списка.');return value;}
  function code(value){
    const text=String(value==null?'':value).trim();
    if(Array.from(text).length>128||/[\u0000-\u001f\u007f]/.test(text))throw new Error('Код проекта: до 128 символов без переводов строк.');
    return text;
  }
  function launchInvitation(input={}){
    const mode=input.mode||'open';if(!['open','new','local'].includes(mode))throw new Error('Неизвестный способ открытия проекта.');
    const url=invitationRoute(),id=mode==='open'?projectId(input.id):'';
    const value={mode,id,actor:input.actor?setActor(input.actor):'',code:code(input.code),at:Date.now(),route:url.pathname,origin:url.origin};
    if(mode==='new')value.title=title(input.title);
    if(id)url.searchParams.set('project',id);
    url.searchParams.set('intent',mode);
    try{
      const storage=global.sessionStorage;
      for(let index=storage.length-1;index>=0;index--){const key=storage.key(index);if(!key?.startsWith(HANDOFF_PREFIX))continue;let old;try{old=JSON.parse(storage.getItem(key));}catch(_){}if(!old||Date.now()-old.at>HANDOFF_TTL)storage.removeItem(key);}
      const nonce=global.crypto?.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
      value.nonce=nonce;storage.setItem(HANDOFF_PREFIX+nonce,JSON.stringify(value));url.searchParams.set('launch',nonce);
    }catch(_){/* The editor asks for credentials again if session storage is blocked. */}
    return url.href;
  }
  function consumeInvitationLaunch(){
    const url=new URL(global.location.href),nonce=url.searchParams.get('launch');
    if(!nonce||nonce.length>160||!/^[a-zA-Z0-9-]+$/.test(nonce))return null;
    let value;
    try{const raw=global.sessionStorage.getItem(HANDOFF_PREFIX+nonce);global.sessionStorage.removeItem(HANDOFF_PREFIX+nonce);value=JSON.parse(raw||'null');}catch(_){return null;}
    if(!object(value)||value.nonce!==nonce||value.route!==url.pathname||value.origin!==url.origin||!Number.isFinite(value.at)||Date.now()-value.at>HANDOFF_TTL||value.at>Date.now()+5000||value.mode!==url.searchParams.get('intent')||!['open','new','local'].includes(value.mode))return null;
    try{
      if(value.mode==='open'&&projectId(value.id)!==url.searchParams.get('project'))return null;
      if(value.mode!=='open'&&(value.id||url.searchParams.has('project')))return null;
      value.actor=value.actor?actor(value.actor):'';value.code=code(value.code);
      if(value.mode==='new')value.title=title(value.title);
      return value;
    }catch(_){return null;}
  }
  function store(){if(!global.BookmarkStore)throw new Error('Хранилище закладок не загрузилось. Обновите страницу.');return global.BookmarkStore;}
  async function listBookmarks(){return store().list();}
  async function createBookmark(name){const s=store(),project=s.create({title:title(name,240),settings:{footer:false,backText:''}});return s.save(project);}
  async function renameBookmark(id,name){const result=await store().rename(id,title(name,240));if(!result)throw new Error('Проект закладок не найден. Обновите список проектов.');return result;}
  async function copyBookmark(id,name){
    const s=store(),source=await s.load(id);if(!source)throw new Error('Проект закладок не найден. Обновите список проектов.');
    return s.save(s.create({...source,title:title(name,240)}));
  }
  function diplomaStore(){if(!global.DiplomaStore)throw new Error('Хранилище дипломов не загрузилось. Обновите страницу.');return global.DiplomaStore;}
  async function listDiplomas(){return diplomaStore().list();}
  async function createDiploma(name){const s=diplomaStore();return s.save(s.create({title:title(name,240)}));}
  async function renameDiploma(id,name){const result=await diplomaStore().rename(id,title(name,240));if(!result)throw new Error('Проект дипломов не найден. Обновите список проектов.');return result;}
  async function copyDiploma(id,name){
    const s=diplomaStore(),source=await s.load(id);if(!source)throw new Error('Проект дипломов не найден. Обновите список проектов.');
    return s.save(s.create({...source,title:title(name,240)}));
  }
  async function removeDiploma(id){return diplomaStore().remove(id);}
  async function importDiploma(file){const s=diplomaStore(),project=await s.importFile(file);return s.save(s.create(project));}
  async function exportDiploma(id){const s=diplomaStore(),project=await s.load(id);if(!project)throw new Error('Проект дипломов не найден. Обновите список проектов.');return s.validate(project);}
  function cloud(){if(!global.InviteCloud)throw new Error('Серверное сохранение не загрузилось. Обновите страницу.');return global.InviteCloud;}
  function as(login,work){cloud().setActor(login);return work();}
  async function listInvitations(login){
    const c=cloud(),status=await c.probe();if(!status.available)return {...status,projects:[]};
    if(!login)return {...status,projects:[],needsActor:true};
    login=setActor(login);const result=await as(login,()=>c.catalog());return {...status,projects:result.projects};
  }
  async function renameInvitation(id,options){
    const c=cloud(),login=setActor(options.actor),name=title(options.title),loaded=await as(login,()=>c.load(projectId(id),code(options.code)));
    if(!object(loaded.project.settings))throw new Error('Настройки проекта повреждены. Откройте резервную копию.');
    loaded.project.settings.eventName=name;
    return as(login,()=>c.save(id,loaded.project,loaded.revision,loaded.sessionToken));
  }
  async function copyInvitation(id,options){
    const c=cloud(),login=setActor(options.actor),name=title(options.title),sourceCode=code(options.code),loaded=await as(login,()=>c.load(projectId(id),sourceCode));
    if(loaded.protected&&!own(options,'newCode'))throw new Error('Укажите отдельный код для копии или явно выберите создание без кода.');
    const newCode=code(options.newCode);
    if(loaded.protected&&newCode&&newCode===sourceCode)throw new Error('Для копии нужен другой код: код исходного проекта уже занят.');
    if(!object(loaded.project.settings))throw new Error('Настройки проекта повреждены. Откройте резервную копию.');
    loaded.project.settings.eventName=name;
    return as(login,()=>c.create(loaded.project,newCode));
  }
  function localMetadata(value){
    if(!object(value)||typeof value.title!=='string'||!value.title.trim())return null;
    const date=typeof value.updatedAt==='number'?new Date(value.updatedAt):new Date(value.updatedAt);
    if(!Number.isFinite(date.getTime()))return null;
    return {title:value.title.slice(0,160),updatedAt:date.toISOString()};
  }
  function localProjectMetadata(project){
    if(!object(project)||project.format!=='invite-studio'||!object(project.settings)||!Number.isFinite(project.savedAt))return null;
    return localMetadata({title:project.settings.eventName||'Без названия',updatedAt:project.savedAt});
  }
  async function getInvitationLocalMeta(){
    const aliases=invitationAliases();
    for(const path of aliases){const metadata=localMetadata(read('invitation-local-meta-v1:'+path));if(metadata)return metadata;}
    // A cloud snapshot can occupy a legacy unscoped key. Only explicitly local
    // records are eligible, and the unscoped fallback is used without bindings.
    const snapshots=[];for(const path of aliases){const metadata=localProjectMetadata(read('invitation-studio-v1:local:'+path));if(metadata)snapshots.push(metadata);}
    const bound=aliases.some(path=>object(read('invitation-cloud-v1:'+path)));
    if(!bound){const metadata=localProjectMetadata(read('invitation-studio-v1'));if(metadata)snapshots.push(metadata);}
    if(global.indexedDB)try{
      const db=await new Promise((resolve,reject)=>{const request=global.indexedDB.open('invitation-studio-v1',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Хранилище занято.'));});
      try{const records=await new Promise((resolve,reject)=>{const tx=db.transaction('projects'),s=tx.objectStore('projects'),keys=aliases.map(path=>'current@local:'+path);if(!bound)keys.push('current');const values=[];keys.forEach(key=>{const request=s.get(key);request.onsuccess=()=>{const metadata=localProjectMetadata(request.result);if(metadata)values.push(metadata);};});tx.oncomplete=()=>resolve(values);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});snapshots.push(...records);}finally{db.close();}
    }catch(_){/* The main catalogue remains usable when browser storage is blocked. */}
    snapshots.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return snapshots[0]||null;
  }
  global.ProjectLibrary=Object.freeze({invitationScope,invocationScope:invitationScope,invitationAliases,bookmarkRoute,diplomaRoute,launchDiploma,getActor,setActor,launchInvitation,consumeInvitationLaunch,listBookmarks,createBookmark,renameBookmark,copyBookmark,listDiplomas,createDiploma,renameDiploma,copyDiploma,removeDiploma,importDiploma,exportDiploma,listInvitations,renameInvitation,copyInvitation,getInvitationLocalMeta});
})(window);
