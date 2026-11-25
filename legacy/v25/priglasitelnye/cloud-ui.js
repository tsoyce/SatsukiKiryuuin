(function () {
'use strict';
const $=id=>document.getElementById(id),path=window.ProjectLibrary?.invitationScope()||location.pathname,paths=window.ProjectLibrary?.invitationAliases()||[path],storageKey='invitation-cloud-v1:'+path,draftKey='invitation-cloud-drafts-v2:'+path,actorKey='invitation-actor-v1:'+path,auditKey='invitation-local-audit-v1:'+path;
let studio,binding=null,server={available:false},phase='checking',activeActor='',timer,saving=false,operationBusy=false,generation=0,changeVersion=0,gateLocked=false,chosen=null,projects=[],creationMode='new',createdCandidate=null,initial=null,initialProject=null;
const sessions=new Map();let activityFlushing=false,intentionalNavigation=false,localAuditTimer,pendingLocalSave=null,auditQueue=[];
const json=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(_){return fallback;}};
function put(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
function migrateNamespaces(){
 for(const prefix of ['invitation-cloud-v1:','invitation-actor-v1:'])try{if(localStorage.getItem(prefix+path)===null)for(const alias of paths.slice(1)){const raw=localStorage.getItem(prefix+alias);if(raw!==null){localStorage.setItem(prefix+path,raw);break;}}}catch(_){}
 const drafts={},events=new Map();for(const alias of paths.slice().reverse()){
  Object.assign(drafts,json('invitation-cloud-drafts-v2:'+alias,{}));
  for(const entry of json('invitation-local-audit-v1:'+alias,[]))events.set(entry.id||[entry.at,entry.actor,entry.action,entry.projectId].join('|'),entry);
 }
 if(Object.keys(drafts).length)put(draftKey,drafts);if(events.size)put(auditKey,[...events.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,1000));
}migrateNamespaces();
function title(){return studio.getProjectTitle?studio.getProjectTitle():studio.getProject().settings.eventName||'Без названия';}
function actor(value){value=String(value||'').trim();if(!value||Array.from(value).length>80||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Укажите ваше имя / login: от 1 до 80 символов.');return value;}
function as(login,work){InviteCloud.setActor(login);return work();}
function dated(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU'):'';}
function message(id,text,error=false){$(id).textContent=text;$(id).hidden=!text;$(id).classList.toggle('error',error);}
const feedback=(t,e=false)=>message('cloudFeedback',t,e),resumeFeedback=(t,e=false)=>message('resumeFeedback',t,e),creationFeedback=(t,e=false)=>message('newProjectFeedback',t,e);
function remember(){
 if(!binding)return put(storageKey,null);
 const meta={code:binding.id,projectId:binding.id,protected:binding.protected,revision:binding.revision,updatedAt:binding.updatedAt,pending:binding.pending,autosave:binding.autosave,actor:binding.actor};
 const saved=put(storageKey,meta),drafts=json(draftKey,{});drafts[binding.id]=meta;return put(draftKey,drafts)&&saved;
}
function auditEntry(action,detail='',pendingServer=false){return{id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:new Date().toISOString(),actor:binding?.actor||activeActor||'Не указан',action,detail,projectTitle:title(),projectId:binding?.id||'',pendingServer};}
// Keep failed writes in memory; a later save, history view or explicit action retries them.
function auditEvents(){const seen=new Set();return auditQueue.slice().reverse().concat(json(auditKey,[])).filter(entry=>{if(!entry.id)return true;if(seen.has(entry.id))return false;seen.add(entry.id);return true;}).slice(0,1000);}
function persistAudit(events=auditEvents()){if(!put(auditKey,events))return false;auditQueue=[];return true;}
function queueLocalSave(){
 const entry=auditEntry('save','Изменён проект в браузере');
 if(pendingLocalSave&&pendingLocalSave.actor===entry.actor&&pendingLocalSave.projectId===entry.projectId){pendingLocalSave.at=entry.at;pendingLocalSave.projectTitle=entry.projectTitle;}else{if(pendingLocalSave)flushLocalSave();pendingLocalSave=entry;}
 clearTimeout(localAuditTimer);localAuditTimer=setTimeout(flushLocalSave,650);
}
function flushLocalSave(){clearTimeout(localAuditTimer);if(pendingLocalSave){auditQueue.push(pendingLocalSave);pendingLocalSave=null;}return !auditQueue.length||persistAudit();}
function localEvent(action,detail='',pendingServer=false){clearTimeout(localAuditTimer);if(pendingLocalSave){auditQueue.push(pendingLocalSave);pendingLocalSave=null;}const entry=auditEntry(action,detail,pendingServer);auditQueue.push(entry);persistAudit();return entry;}
const actionNames={login:'Вход',open:'Открытие проекта',create:'Создание проекта',save:'Изменения',access:'Изменение доступа',rename_code:'Изменение доступа',access_change:'Изменение доступа',export_image:'Экспорт открытки',export_zip:'Экспорт всех открыток',export_pdf:'PDF для печати',export_foil:'Комплект фольгирования',export_blank_pdf:'Печать бланков',export_blank_png:'Бланк PNG',guest_import:'Импорт гостей',guest_export:'Экспорт гостей',project_import:'Открытие файла проекта',project_download:'Резервная копия',font_add:'Добавление шрифта',font_remove:'Удаление шрифта',template_upload:'Замена макета',gender_update:'Определение пола'};
const aliases={export_images:'export_zip',export_blanks:'export_blank_pdf',export_blank_image:'export_blank_png',export_blank_foil:'export_foil',import_guests:'guest_import',export_project:'project_download',export_guests:'guest_export',font_import:'font_add',template_import:'template_upload',gender_detect:'gender_update'};
function logActivity(action,detail=''){action=aliases[action]||action;localEvent(action,String(detail||'').slice(0,500),!!binding);flushActivities();}
async function flushActivities(){
 if(activityFlushing||!binding||!server.available)return;activityFlushing=true;const current=binding;
 try{flushLocalSave();const pending=auditEvents().filter(e=>e.pendingServer&&e.projectId===current.id&&e.actor===current.actor).slice(0,50);for(const e of pending){if(binding!==current)break;try{await as(current.actor,()=>InviteCloud.activity(current.id,current.sessionToken,e.action,('Выполнено '+dated(e.at)+'. '+e.detail).slice(0,500)));const all=auditEvents(),saved=all.find(item=>item.id===e.id);if(saved)saved.pendingServer=false;persistAudit(all);}catch(_){break;}}}finally{activityFlushing=false;}
}
function update(){
 if(!studio)return;const locked=operationBusy||saving||['checking','loading'].includes(phase),connected=!!binding;
 const entry=binding&&projects.find(p=>p.id===binding.id);if(entry)Object.assign(entry,{title:title(),revision:binding.revision,updatedAt:binding.updatedAt,protected:binding.protected});
 const options=[];if(!connected){const o=document.createElement('option');o.value='';o.textContent='В браузере · '+title();options.push(o);}
 for(const p of projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.title+(p.protected?' · код':'');options.push(o);}
 if(binding&&!entry){const o=document.createElement('option');o.value=binding.id;o.textContent=title();options.push(o);}
 $('projectSwitch').replaceChildren(...options);$('projectSwitch').value=binding?.id||'';$('projectSwitch').disabled=locked||!activeActor||!projects.some(p=>p.id!==binding?.id);
 for(const id of ['projectOpenByCode','newProject','copyProject','profileButton','activityOpen'])$(id).disabled=locked||!activeActor;
 $('profileButton').textContent=activeActor||'Представиться';$('projectOpenByCode').textContent='Сменить проект';
 $('cloudButtonDot').hidden=!connected;$('cloudButtonDot').className='cloud-button-dot'+(binding?.pending||['conflict','error'].includes(phase)?' pending':'');
 $('cloudButtonLabel').textContent=!activeActor?'Выберите проект':phase==='loading'?'Открываем…':phase==='saving'?'Сохраняем…':phase==='conflict'?'Конфликт версий':phase==='error'?'Нет подтверждения':binding?.pending?'Есть изменения':connected?'На хостинге ✓':'На хостинге';
 $('memoryBadge').textContent=!activeActor?'● Укажите имя и выберите проект':phase==='loading'?'● Открываем проект…':phase==='saving'?'● Сохраняем на хостинге…':phase==='conflict'?'● На сервере другая версия':phase==='error'?'● Правки в браузере · сервер не подтверждён':binding?.pending?'● Правки ждут сохранения':connected?'● Проект сохранён на хостинге':'● Проект в памяти браузера';
 $('privacyNote').textContent=(connected?'Изменения сохраняются на хостинге.':'Изменения сохраняются в этом браузере.')+(activeActor?' В истории: '+activeActor+'.':'');
 $('cloudAvailability').textContent=server.available?'✓ Хостинг готов · до '+Math.floor((server.maxBytes||33554432)/1048576)+' МБ на проект':server.message||'Для серверных проектов нужен PHP-хостинг. Локальная работа доступна.';
 $('cloudAvailability').classList.toggle('unavailable',!server.available);$('cloudDisconnected').hidden=connected;$('cloudConnected').hidden=!connected;$('cloudConflict').hidden=phase!=='conflict';
 for(const id of ['cloudCreate','cloudLoad','cloudSaveNow','cloudReload','cloudCopyProject','cloudChangeCode','cloudRemoveCode'])$(id).disabled=locked||!server.available||!activeActor||(['cloudSaveNow','cloudChangeCode','cloudRemoveCode'].includes(id)&&phase==='conflict');
 $('cloudDetach').disabled=locked;$('cloudAutosave').disabled=locked;$('cloudRetry').disabled=locked;$('cloudRemoveCode').hidden=!binding?.protected;
 $('cloudAlert').hidden=!connected||!(['error','conflict'].includes(phase)||(!binding.autosave&&binding.pending));
 $('cloudAlertText').textContent=phase==='conflict'?'На сервере другая версия. Ваши правки сохранены в браузере. Обновите проект или создайте копию.':phase==='error'?'Последнее сохранение не подтверждено. Правки остаются в браузере.':'Автосохранение выключено. Есть несохранённые на хостинге правки.';
 if(binding){$('cloudProjectName').textContent=title();$('cloudAutosave').checked=binding.autosave;$('cloudRevision').textContent='Версия '+binding.revision+' · '+dated(binding.updatedAt)+' · '+binding.actor;$('cloudSaveState').textContent=phase==='conflict'?'Версии разошлись':phase==='error'?'Сохранение не подтверждено':binding.pending?'Есть изменения для сохранения':'✓ Всё сохранено';$('cloudSecret').value=binding.protected?(binding.accessCode||''):'Без кода';$('cloudSecret').placeholder=binding.protected?'Код не хранится между входами':'Без кода';$('cloudCopy').disabled=!binding.accessCode;$('cloudDownloadCode').disabled=!binding.accessCode;}
 $('newProjectSubmit').disabled=locked||(!server.available&&!createdCandidate);$('newProjectClose').disabled=operationBusy;for(const id of ['newProjectTitle','newProjectCode','newProjectProtected'])$(id).disabled=operationBusy||!!createdCandidate;
 $('sessionShowProjects').disabled=operationBusy;$('resumeOpen').disabled=operationBusy||!chosen;$('resumeLocal').disabled=operationBusy;$('resumeNew').disabled=operationBusy||!server.available;$('resumeCancel').hidden=!activeActor;$('resumeCancel').disabled=operationBusy;
}
function lockGate(on){if(on&&!gateLocked){gateLocked=true;studio.lockEditor(true);}if(!on&&gateLocked){gateLocked=false;studio.lockEditor(false);}}
function closeGate(){if($('resumeDialog').open)$('resumeDialog').close();lockGate(false);update();schedule();}
async function operation(work,where='cloud'){
 if(operationBusy||saving){studio.notify('Дождитесь завершения текущего действия.');return false;}operationBusy=true;clearTimeout(timer);update();
 try{await work();return true;}catch(error){const text=error.message||'Не удалось выполнить действие.';if(where==='resume'){resumeFeedback(text,true);if(!$('sessionActor').value.trim()){$('sessionActor').setAttribute('aria-invalid','true');$('sessionActor').focus();}}else if(where==='create'){creationFeedback(text,true);const invalid=!$('newProjectTitle').value.trim()?$('newProjectTitle'):$('newProjectProtected').checked&&!$('newProjectCode').value.trim()?$('newProjectCode'):null;if(invalid){invalid.setAttribute('aria-invalid','true');queueMicrotask(()=>{if(invalid.isConnected&&!invalid.disabled)invalid.focus();});}}else feedback(text,true);studio.notify(text,true);return false;}finally{operationBusy=false;update();schedule();}
}
function schedule(){clearTimeout(timer);if(binding?.pending&&binding.autosave&&server.available&&!operationBusy&&!saving&&!gateLocked&&phase==='ready')timer=setTimeout(()=>save(false),1500);}
async function save(manual,duringOperation=false){
 if(!binding||!server.available||['conflict','checking','loading'].includes(phase)||saving||(operationBusy&&!duringOperation))return false;if(!binding.pending)return true;
 const b=binding,version=changeVersion,token=generation,snapshot=studio.getProject();saving=true;phase='saving';update();
 try{await studio.saveLocal();const r=await as(b.actor,()=>InviteCloud.save(b.id,snapshot,b.revision,b.sessionToken));if(token!==generation||binding!==b)return false;binding.revision=r.revision;binding.updatedAt=r.updatedAt;if(r.sessionToken){binding.sessionToken=r.sessionToken;sessions.set(b.id,{sessionToken:r.sessionToken,accessCode:b.accessCode,actor:b.actor});}binding.pending=version!==changeVersion;phase='ready';remember();flushActivities();if(manual)feedback('Изменения сохранены.');return !binding.pending;}
 catch(error){if(token===generation){phase=error.status===409?'conflict':'error';feedback(error.message,true);remember();}return false;}finally{saving=false;update();schedule();}
}
async function preserve(allowConflictCopy=false){const local=await studio.saveLocal();if(binding?.pending){if(allowConflictCopy&&phase==='conflict')return;if(!await save(false,true)||binding.pending)throw new Error('Текущие правки ещё не сохранены на хостинге. Проверьте подключение или создайте копию.');}else if(!binding&&local===false)throw new Error('Браузер не сохранил текущий проект. Скачайте резервную копию перед переходом.');}
async function readScopedDraft(id){
 const meta=json(draftKey,{})[id];if(!meta?.pending)return null;const candidates=paths.map(alias=>json('invitation-studio-v1:cloud:'+alias+':'+encodeURIComponent(id),null)).filter(Boolean);
 try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('invitation-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const store=db.transaction('projects').objectStore('projects'),stored=await Promise.all(paths.map(alias=>new Promise((resolve,reject)=>{const r=store.get('current@cloud:'+alias+':'+encodeURIComponent(id));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})));db.close();candidates.push(...stored.filter(Boolean));}catch(_){}
 const project=candidates.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0];
 return project?{meta,project}:null;
}
async function applyLoaded(r,login,accessCode='',forceRemote=false){
 const id=r.id||r.projectId;let draft=forceRemote?null:await readScopedDraft(id);
 if(!forceRemote&&!draft&&accessCode&&accessCode!==id)draft=await readScopedDraft(accessCode);
 if(!forceRemote&&!draft&&initial?.pending&&initialProject&&((initial.projectId||initial.code)===id||(!initial.projectId&&accessCode&&initial.code===accessCode)))draft={meta:initial,project:initialProject};
 await studio.setProject(draft?draft.project:r.project,id);generation++;activeActor=login;put(actorKey,login);binding={id,revision:draft?draft.meta.revision:r.revision,updatedAt:r.updatedAt,protected:!!r.protected,sessionToken:r.sessionToken,accessCode,actor:login,autosave:true,pending:!!draft};sessions.set(id,{sessionToken:r.sessionToken,accessCode,actor:login});phase=draft&&draft.meta.revision!==r.revision?'conflict':'ready';remember();initial=null;initialProject=null;
 if(!projects.some(p=>p.id===id))projects.unshift({id,title:title(),protected:binding.protected,revision:binding.revision,updatedAt:binding.updatedAt});
 if(phase==='conflict')feedback('Открыты ваши локальные правки. На хостинге другая версия — можно сохранить отдельную копию.',true);flushActivities();
}
async function loadTarget(id,login,code='',forceRemote=false){
 studio.lockEditor(true);const previous=phase;phase='loading';update();
 try{const s=sessions.get(id),token=s?.actor===login?s.sessionToken:'';const r=await as(login,()=>InviteCloud.load(id,code,token));await applyLoaded(r,login,code||s?.accessCode||'',forceRemote);}catch(error){phase=previous==='conflict'?'conflict':binding?'ready':'unavailable';throw error;}finally{studio.lockEditor(false);update();}
}
function renderProjects(){
 const query=$('resumeSearch').value.trim().toLocaleLowerCase('ru-RU'),list=$('resumeList');list.replaceChildren();
 for(const p of projects.filter(p=>p.title.toLocaleLowerCase('ru-RU').includes(query))){const b=document.createElement('button');b.className='resume-project'+(chosen?.id===p.id?' selected':'');b.setAttribute('aria-pressed',String(chosen?.id===p.id));const n=document.createElement('strong');n.textContent=p.title;const s=document.createElement('span');s.textContent=(p.protected?'Код для входа':'Без кода')+' · '+dated(p.updatedAt);b.append(n,s);b.addEventListener('click',()=>chooseProject(p));list.append(b);}
 if(!list.children.length){const p=document.createElement('p');p.className='hint';p.textContent=projects.length?'Проекты не найдены.':'Пока нет проектов. Создайте новый или сохраните текущий на хостинге.';list.append(p);}
}
function chooseProject(p){chosen=p;$('resumeProjectName').textContent=p.title;$('resumeSelected').hidden=false;$('resumeCodeLabel').hidden=!p.protected;$('resumeCode').value='';renderProjects();update();if(p.protected)$('resumeCode').focus();}
async function fetchCatalog(){const login=actor($('sessionActor').value);const r=await as(login,()=>InviteCloud.catalog());projects=r.projects||[];chosen=null;$('resumeSearch').hidden=false;$('resumeSelected').hidden=true;resumeFeedback('Выберите проект. Для защищённого потребуется код.');renderProjects();const requested=new URLSearchParams(location.search).get('project'),target=projects.find(p=>p.id===requested);if(target)chooseProject(target);else if(requested)resumeFeedback('Этот проект не найден. Выберите другой проект или вернитесь к общему списку.',true);update();}
function openResume(targetId=''){
 clearTimeout(timer);lockGate(true);chosen=null;$('sessionActor').value=activeActor||json(actorKey,'')||'';$('sessionActor').removeAttribute('aria-invalid');$('resumeCode').value='';$('resumeSelected').hidden=true;$('resumeSearch').value='';$('resumeLocal').textContent=!binding&&initial&&initial.protected!==false?'Новый проект в браузере':'Продолжить в браузере';
 resumeFeedback(server.available?(projects.length?'Выберите проект или обновите список.':'Укажите имя / login и нажмите «Показать проекты».'):server.message||'Хостинг недоступен. Можно продолжить работу в браузере.');renderProjects();if(targetId){const p=projects.find(p=>p.id===targetId);if(p)chooseProject(p);}update();if(!$('resumeDialog').open)$('resumeDialog').showModal();$('sessionActor').focus();$('resumeDialog').scrollTop=0;
}
async function becomeLocal(login){await preserve();const restore=!!binding||!!initial;binding=null;generation++;activeActor=login;put(actorKey,login);remember();if(restore){if(await studio.restoreLocalProject()===false)throw new Error('Браузер не сохранил проект. Скачайте резервную копию.');initial=null;initialProject=null;}else{studio.setStorageScope('');if(await studio.saveLocal()===false)throw new Error('Браузер не сохранил проект. Скачайте резервную копию.');}phase=server.available?'ready':'unavailable';localEvent('login','Работа в браузере');closeGate();}
async function openSelected(){await operation(async()=>{const login=actor($('sessionActor').value);if(!chosen)throw new Error('Выберите проект.');await preserve();await loadTarget(chosen.id,login,$('resumeCode').value);closeGate();studio.notify(phase==='conflict'?'Открыты локальные правки. На хостинге другая версия.':'Открыт проект «'+title()+'».');},'resume');}
async function switchProject(id){if(!id||id===binding?.id){update();return;}const p=projects.find(p=>p.id===id);if(!p)return;if(p.protected&&sessions.get(id)?.actor!==activeActor){openResume(id);return;}await operation(async()=>{await preserve();try{await loadTarget(id,activeActor);}catch(error){if(error.status===401){sessions.delete(id);openResume(id);}throw error;}});}
function openNew(mode){
 if(!activeActor){openResume();return;}creationMode=mode;createdCandidate=null;$('newProjectHeading').textContent=mode==='copy'?'Копия проекта':'Новый проект';$('newProjectDescription').textContent=mode==='copy'?'Макет, гости, текст и шрифты будут скопированы в отдельный проект.':'Исходный макет А5, три текстовых блока и пустой список гостей.';
 $('newProjectTitle').value=mode==='copy'?(title()+' — копия').slice(0,160):'';$('newProjectCode').value='';$('newProjectCode').required=false;$('newProjectProtected').checked=false;$('newProjectCodeLabel').hidden=true;$('newProjectSubmit').textContent=mode==='copy'?'Создать копию':'Создать проект';for(const id of ['newProjectTitle','newProjectCode'])$(id).removeAttribute('aria-invalid');creationFeedback(server.available?'':'Создание на хостинге сейчас недоступно. Продолжайте текущий проект в браузере. Резервная копия: «Проект» → «Скачать проект».');update();$('newProjectDialog').showModal();$('newProjectTitle').focus();
}
async function createNamed(){
 await operation(async()=>{studio.lockEditor(true);try{
  if(!createdCandidate){const name=$('newProjectTitle').value.trim();if(!name)throw new Error('Введите название проекта.');const code=$('newProjectProtected').checked?InviteCloud.normalizeCode($('newProjectCode').value):'';await preserve(creationMode==='copy');const project=creationMode==='copy'?studio.getProject():studio.createEmptyProject(name);project.settings.eventName=name;const r=await as(activeActor,()=>InviteCloud.create(project,code));createdCandidate={...r,project,accessCode:code};}
  const c=createdCandidate;await studio.setProject(c.project,c.id||c.projectId);generation++;binding={id:c.id||c.projectId,revision:c.revision,updatedAt:c.updatedAt,protected:!!c.protected,sessionToken:c.sessionToken,accessCode:c.accessCode,actor:activeActor,autosave:true,pending:false};sessions.set(binding.id,{sessionToken:binding.sessionToken,accessCode:binding.accessCode,actor:activeActor});phase='ready';remember();projects.unshift({id:binding.id,title:title(),protected:binding.protected,revision:binding.revision,updatedAt:binding.updatedAt});createdCandidate=null;$('newProjectDialog').close();closeGate();studio.notify('Проект создан. Изменения сохраняются автоматически.');
 }catch(error){if(createdCandidate){$('newProjectSubmit').textContent='Открыть созданный проект';throw new Error('Проект создан на хостинге. Повторите открытие: '+error.message);}throw error;}finally{studio.lockEditor(false);}},'create');
}
async function changeCode(code){await operation(async()=>{if(!binding)return;await preserve();const r=await as(binding.actor,()=>InviteCloud.renameCode(binding.id,code,binding.revision,binding.sessionToken));binding.revision=r.revision;binding.updatedAt=r.updatedAt;binding.protected=!!r.protected;binding.sessionToken=r.sessionToken;binding.accessCode=code;sessions.set(binding.id,{sessionToken:binding.sessionToken,accessCode:code,actor:binding.actor});remember();$('cloudNewCode').value='';feedback(binding.protected?'Код изменён. Старый код больше не работает.':'Код отключён. Проект открывается по имени пользователя.');});}
async function showHistory(){
 flushLocalSave();
 if(!$('activityDialog').open)$('activityDialog').showModal();$('activityList').textContent='Загружаем историю…';
 try{let events;if(binding){await flushActivities();try{const r=await as(binding.actor,()=>InviteCloud.history(binding.id,binding.sessionToken));events=(r.events||[]).concat(auditEvents().filter(e=>e.projectId===binding.id&&e.pendingServer).map(e=>({...e,detail:'В браузере, ждёт отправки. '+e.detail})));$('activityDescription').textContent=title()+' · журнал на хостинге';}catch(_){events=auditEvents().filter(e=>e.projectId===binding.id);$('activityDescription').textContent='Сервер недоступен. Локальные записи проекта: '+title();}}else if(server.available&&InviteCloud.siteHistory){const r=await as(activeActor,()=>InviteCloud.siteHistory());events=r.events||[];$('activityDescription').textContent='История входов и проектов на этом хостинге';}else{events=auditEvents();$('activityDescription').textContent='История в этом браузере';}
 const list=$('activityList');list.replaceChildren();for(const e of events.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)))){const row=document.createElement('div');row.className='activity-row';const n=document.createElement('strong');n.textContent=e.actor+' · '+(actionNames[e.action]||e.action);const t=document.createElement('time');t.textContent=dated(e.at);const d=document.createElement('p');d.textContent=String(e.detail||'');row.append(n,t,d);list.append(row);}if(!events.length)list.textContent='Действий пока нет.';
 }catch(error){$('activityList').textContent=error.message;}
}
async function beforeLocalImport(apply){let allowed=false;await operation(async()=>{studio.lockEditor(true);try{
 await preserve();
 const message=binding?'Текущий проект сохранён на хостинге. Файл откроется как черновик в браузере и заменит прежний черновик, если он есть. Скачайте нужную копию перед заменой.':'Текущий черновик в браузере будет заменён данными из файла. Скачайте текущий проект, если нужна его копия.';
 if(!await studio.confirm('Открыть другой проект?',message))return;
 await apply();
 binding=null;generation++;remember();studio.setStorageScope('');phase=server.available?'ready':'unavailable';allowed=true;
 }finally{studio.lockEditor(false);}});return allowed;}
async function beforeNavigate(){
 if(operationBusy||saving){studio.notify('Дождитесь завершения текущего действия.');return false;}
 clearTimeout(timer);
 if(gateLocked&&!binding&&!studio.hasLocalProject){intentionalNavigation=true;return true;}
 if(await studio.saveLocal()===false){studio.notify('Браузер не сохранил правки. Скачайте проект перед переходом.',true);return false;}
 flushLocalSave();
 if(binding?.pending&&!remember()){studio.notify('Браузер не сохранил сведения о правках для хостинга. Скачайте проект перед переходом.',true);return false;}
 intentionalNavigation=true;setTimeout(()=>{intentionalNavigation=false;},2000);return true;
}
async function initialize(){
 studio=window.InvitationStudio;initial=studio.initialCloudBinding;if(initial?.pending&&studio.hasLocalProject){initialProject=studio.getProject();const drafts=json(draftKey,{});drafts[initial.projectId||initial.code]=initial;put(draftKey,drafts);}lockGate(true);
 $('projectSwitch').addEventListener('change',()=>switchProject($('projectSwitch').value));$('projectOpenByCode').addEventListener('click',()=>openResume());$('profileButton').addEventListener('click',()=>openResume());
 $('sessionShowProjects').addEventListener('click',()=>operation(fetchCatalog,'resume'));$('resumeSearch').addEventListener('input',renderProjects);$('resumeOpen').addEventListener('click',openSelected);$('resumeLocal').addEventListener('click',()=>operation(()=>becomeLocal(actor($('sessionActor').value)),'resume'));$('resumeNew').addEventListener('click',()=>operation(async()=>{await becomeLocal(actor($('sessionActor').value));openNew('new');},'resume'));
 $('sessionActor').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();operation(fetchCatalog,'resume');}});$('resumeCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();openSelected();}});
 for(const id of ['sessionActor','newProjectTitle','newProjectCode'])$(id).addEventListener('input',()=>$(id).removeAttribute('aria-invalid'));
 $('resumeCancel').addEventListener('click',closeGate);$('resumeDialog').addEventListener('cancel',e=>{e.preventDefault();if(activeActor&&!operationBusy)closeGate();});
 $('newProject').addEventListener('click',()=>openNew('new'));$('copyProject').addEventListener('click',()=>openNew('copy'));$('newProjectSubmit').addEventListener('click',createNamed);$('newProjectProtected').addEventListener('change',()=>{$('newProjectCodeLabel').hidden=!$('newProjectProtected').checked;$('newProjectCode').required=$('newProjectProtected').checked;if($('newProjectProtected').checked)$('newProjectCode').focus();else $('newProjectCode').removeAttribute('aria-invalid');});$('newProjectDialog').addEventListener('cancel',e=>{if(operationBusy)e.preventDefault();});
 for(const id of ['cloudOpen','cloudResolve'])$(id).addEventListener('click',()=>{feedback('');update();$('cloudDialog').showModal();});
 $('cloudCreate').addEventListener('click',()=>operation(async()=>{await preserve();const code=$('cloudAuthorCode').value.trim(),project=studio.getProject(),r=await as(activeActor,()=>InviteCloud.create(project,code));await applyLoaded({...r,project},activeActor,code,true);feedback('Проект сохранён на хостинге.');}));
 $('cloudCopyProject').addEventListener('click',()=>{$('cloudDialog').close();openNew('copy');});
 $('cloudLoad').addEventListener('click',()=>operation(async()=>{await preserve();const code=$('cloudCodeInput').value,r=await as(activeActor,()=>InviteCloud.loadByCode(code));await applyLoaded(r,activeActor,code);$('cloudDialog').close();}));
 $('cloudSaveNow').addEventListener('click',()=>save(true));$('cloudChangeCode').addEventListener('click',()=>{try{changeCode(InviteCloud.normalizeCode($('cloudNewCode').value));}catch(e){feedback(e.message,true);}});$('cloudRemoveCode').addEventListener('click',()=>changeCode(''));
 $('cloudRetry').addEventListener('click',()=>operation(async()=>{server=await InviteCloud.probe();if(!server.available)throw new Error(server.message||'Хранилище недоступно.');if(phase==='error')phase='ready';if(binding?.pending&&phase!=='conflict'){if(!await save(false,true))throw new Error('Подключение есть, но сохранение не подтверждено. Проверьте код и версию проекта.');}feedback('Подключение к хостингу работает.');flushActivities();}));
 $('cloudReload').addEventListener('click',()=>operation(async()=>{if(!binding)return;if(binding.pending&&!await studio.confirm('Открыть серверную версию?','Локальные правки будут заменены. Чтобы оставить обе версии, создайте копию проекта.'))return;await loadTarget(binding.id,binding.actor,binding.accessCode,true);}));
 $('cloudDetach').addEventListener('click',()=>operation(async()=>{await preserve();binding=null;generation++;remember();studio.setStorageScope('');await studio.saveLocal();phase='ready';feedback('Проект остаётся в этом браузере.');}));
 $('cloudAutosave').addEventListener('change',()=>{if(binding){binding.autosave=$('cloudAutosave').checked;remember();update();schedule();}});
 $('cloudReveal').addEventListener('click',()=>{const show=$('cloudSecret').type==='password';$('cloudSecret').type=show?'text':'password';$('cloudReveal').textContent=show?'Скрыть код':'Показать код';});
 $('cloudCopy').addEventListener('click',async()=>{if(binding?.accessCode){try{await navigator.clipboard.writeText(binding.accessCode);feedback('Код скопирован.');}catch(_){$('cloudSecret').type='text';$('cloudSecret').select();}}});
 $('cloudDownloadCode').addEventListener('click',()=>{if(!binding?.accessCode)return;const a=document.createElement('a'),u=URL.createObjectURL(new Blob(['\ufeff'+title()+'\r\n'+location.href+'\r\nКод: '+binding.accessCode],{type:'text/plain;charset=utf-8'}));a.href=u;a.download=InviteExport.sanitizeFilename(title()+' _ Код.txt');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);});
 $('activityOpen').addEventListener('click',showHistory);$('activityRefresh').addEventListener('click',showHistory);
 document.addEventListener('invitation:changed',e=>{if(!e.detail.sync||!activeActor)return;changeVersion++;if(binding){binding.pending=true;remember();schedule();}else queueLocalSave();update();});
 document.addEventListener('invitation:local-saved',e=>{if(!binding&&e.detail.scope.startsWith('local:'))flushLocalSave();});
 document.addEventListener('invitation:activity',e=>{if(activeActor)logActivity(e.detail.action,e.detail.detail);});
 document.addEventListener('invitation:disconnect',()=>{if(!binding)return;binding=null;generation++;remember();studio.setStorageScope('');studio.saveLocal();update();});
 window.addEventListener('beforeunload',e=>{flushLocalSave();if(binding?.pending&&!intentionalNavigation){e.preventDefault();e.returnValue='';}});window.addEventListener('online',()=>{flushLocalSave();if(binding?.pending&&phase==='error'){phase='ready';schedule();}flushActivities();});
 window.InvitationCloudUI=Object.freeze({beforeLocalImport,beforeNavigate});
 const launch=studio.initialLaunch;if(launch?.actor)try{activeActor=actor(launch.actor);}catch(_){}
 openResume();
 try{server=await InviteCloud.probe();if(server.available&&server.protocol!==2)server={available:false,message:'Обновите api.php и cloud.js на хостинге до текущей версии.'};}catch(error){server={available:false,message:error.message};}
 phase=server.available?'ready':'unavailable';update();
 if(launch&&activeActor){
  if(launch.mode==='open'&&launch.id){const opened=await operation(async()=>{await loadTarget(launch.id,activeActor,launch.code||'');closeGate();},'resume');if(!opened){const entry={id:launch.id,title:launch.title||'Выбранный проект',protected:true};projects=[entry];chooseProject(entry);}}
  else if(launch.mode==='local')await operation(()=>becomeLocal(activeActor),'resume');
  else if(launch.mode==='new'){openNew('new');$('newProjectTitle').value=launch.title||'';$('newProjectProtected').checked=!!launch.code;$('newProjectCode').value=launch.code||'';$('newProjectCodeLabel').hidden=!launch.code;$('newProjectCode').required=!!launch.code;if(server.available)await createNamed();}
 }
}
if(window.InvitationStudio)initialize();else document.addEventListener('invitation:ready',initialize,{once:true});
})();

