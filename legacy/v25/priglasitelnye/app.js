(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback;
  const text = (value, fallback = '', max = 10000) => typeof value === 'string' ? value.slice(0, max) : fallback;
  const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New'];
  const DEFAULT_SETTINGS = {
    eventName: 'День социолога 2026',
    textTemplate: '{обращение},\n{ФИО}!\n\nКафедра общей и экономической социологии ТюмГУ\nприглашает Вас на День социолога!\n\n12 ноября 2026 года в 13:30\nг. Тюмень, ул. Ленина, д. 16, аудитория L300',
    greetingMale: 'Уважаемый', greetingFemale: 'Уважаемая', greetingNeutral: 'Здравствуйте',
    fontFamily: 'Arial', fontSize: 10, fontBold: false, fontItalic: true,
    textColor: '#24232b', textAlign: 'left', lineHeight: 1.2, textCase: 'normal', autoFit: true,
    boxX: 4, boxY: 28, boxW: 92, boxH: 26, verticalAlign: 'top', backgroundFit: 'stretch',
    imageFormat: 'image/jpeg', exportDpi: 300, printMargin: 0, showGuides: true,
    textFill:'solid', gradientColor:'#ae7396', gradientAngle:0, foil:false, blockVisible:true,
    showGrid:false, snapGrid:true, gridStep:5, showRulers:true, foilDpi:600, registrationMarks:true,
    nameAccentEnabled:false,nameFontFamily:'Georgia',nameFontSize:13,nameFontBold:true,nameFontItalic:false,
    nameTextColor:'#694983',nameTextFill:'solid',nameGradientColor:'#bd819d',nameGradientAngle:0,nameUnderline:false,nameLetterSpacing:0,nameHighlight:false,nameHighlightColor:'#fff1c9',
    blankCount:4,blankGreeting:'Здравствуйте,',blankLine:true,
    cardFormat:'a6',cardOrientation:'portrait',cardWidth:105,cardHeight:148,scaleTypeOnFormat:true,templatePreset:'original',
    printScope:'all',printLayer:'composite',printPaper:'a4',printLayout:'auto',printOrientation:'auto',printGrid:true,printFit:false
  };
  const FORMAT_PRESETS={a6:{width:105,height:148,label:'А6'},a5:{width:148,height:210,label:'А5'},a4:{width:210,height:297,label:'А4'},dl:{width:99,height:210,label:'DL'},slim:{width:74,height:210,label:'Узкая'}};
  function cardSize(s=state.settings){
    const preset=FORMAT_PRESETS[s.cardFormat]||FORMAT_PRESETS.a6;
    let width=s.cardFormat==='custom'?number(s.cardWidth,105,50,420):preset.width,height=s.cardFormat==='custom'?number(s.cardHeight,148,50,420):preset.height;
    if(s.cardOrientation==='landscape'&&width<height||s.cardOrientation!=='landscape'&&width>height)[width,height]=[height,width];
    return{width,height,label:s.cardFormat==='custom'?'Свой формат':preset.label};
  }
  const BLOCK_KEYS = ['textTemplate','fontFamily','fontSize','fontBold','fontItalic','textColor','textAlign','lineHeight','textCase','autoFit','boxX','boxY','boxW','boxH','verticalAlign','textFill','gradientColor','gradientAngle','foil','blockVisible','nameAccentEnabled','nameFontFamily','nameFontSize','nameFontBold','nameFontItalic','nameTextColor','nameTextFill','nameGradientColor','nameGradientAngle','nameUnderline','nameLetterSpacing','nameHighlight','nameHighlightColor'];
  const blockId = () => 'block-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  function blockFromSettings(settings, label='Текст', id=blockId()) { return Object.assign({id,label},Object.fromEntries(BLOCK_KEYS.map(key=>[key,settings[key]]))); }
  function activeBlock() { return state.blocks?.find(block=>block.id===state.activeBlockId) || state.blocks?.[0]; }
  function storeActiveBlock() { const block=activeBlock(); if(block) BLOCK_KEYS.forEach(key=>{block[key]=state.settings[key];}); }
  let state = {
    format: 'invite-studio', version: 1, settings: {...clone(DEFAULT_SETTINGS),cardFormat:'a5',cardWidth:148,cardHeight:210,fontSize:14,nameFontSize:18},
    guests: [GuestData.createGuest('Иванов Иван Иванович', 'male', ''), GuestData.createGuest('Петрова Анна Сергеевна', 'female', '')],
    selectedId: '', template: '', templateName: 'День социолога · исходный макет', fonts: [], isSample: true
  };
  state.selectedId = state.guests[0].id;
  let background = null, saveTimer, renderFrame, toastTimer, dbPromise, cancelRequested = false;
  let fontFaces = new Map(), dirty = false, savingVersion = 0;
  const textMetricCache = new Map(), guestRowsById = new Map();
  let sampleGuestBanner = null, emptyGuestList = null, renderedGuestRows = [], guestListSummary = null;
  const guestSearchValues = new WeakMap();
  function clearTextMetrics() { textMetricCache.clear(); }
  function canvasMetrics(ctx, value) {
    const key=ctx.font+'|'+(ctx.fontKerning||'auto')+'|'+(ctx.letterSpacing||'0px')+'|'+value;
    if(textMetricCache.has(key))return textMetricCache.get(key);
    const metrics=ctx.measureText(value),result={width:metrics.width,actualBoundingBoxAscent:metrics.actualBoundingBoxAscent,actualBoundingBoxDescent:metrics.actualBoundingBoxDescent};
    if(textMetricCache.size>=2500)textMetricCache.delete(textMetricCache.keys().next().value);
    textMetricCache.set(key,result);return result;
  }
  let importResult = null, importPreviewTimer, confirmResolve = null, busy = false;
  const history = window.InviteHistory ? window.InviteHistory.create({limit:40,mergeWindow:700}) : null;
  let historyReady = false, historyRestoring = false, historyGesture = false, historyAssetSerial = 0, projectEpoch = 0;
  function validCode(code) { return typeof code==='string' && Array.from(code.trim()).length>=1 && Array.from(code.trim()).length<=128 && !/[\u0000-\u001f\u007f]/.test(code); }
  const invitationPath = window.ProjectLibrary?.invitationScope() || location.pathname;
  const invitationPaths = window.ProjectLibrary?.invitationAliases() || [invitationPath];
  const initialLaunch = window.ProjectLibrary?.consumeInvitationLaunch() || null;
  const launchMode = initialLaunch?.mode || new URLSearchParams(location.search).get('intent') || new URLSearchParams(location.search).get('mode');
  function scopeForCode(code, path = invitationPath) { return validCode(code) ? 'cloud:' + path + ':' + encodeURIComponent(code.trim()) : 'local:' + path; }
  function startupBinding() {
    if(launchMode==='local')return null;
    for(const path of invitationPaths)try {
      const raw=localStorage.getItem('invitation-cloud-v1:' + path);if(raw===null)continue;
      const value = JSON.parse(raw);
      return value && validCode(value.code) && Number.isInteger(value.revision) && value.revision >= 1 ? value : null;
    } catch (_) {}return null;
  }
  const initialCloudBinding = startupBinding();
  let storageScope = scopeForCode(initialCloudBinding?.code), editorLocks = 0;
  function setStorageScope(code) {
    const next = scopeForCode(code);
    if (storageScope === next) return;
    clearTimeout(saveTimer); storageScope = next; savingVersion += 1; dirty = true;
    if(history && historyReady && !historyRestoring) resetHistory();
  }
  function lockEditor(locked) {
    editorLocks = Math.max(0, editorLocks + (locked ? 1 : -1));
    const header = document.querySelector('.app-header'), workspace = document.querySelector('.workspace'), navigation = document.querySelector('.project-navigation'),sections=document.querySelector('.section-navigation');
    if (editorLocks && workspace.contains(document.activeElement)) document.activeElement.blur();
    header.inert = editorLocks > 0; workspace.inert = editorLocks > 0;
    if (navigation) navigation.inert = editorLocks > 0;
    if(sections)sections.inert=editorLocks>0;
    if($('projectTitle'))$('projectTitle').disabled=editorLocks>0;
    document.body.classList.toggle('is-project-loading', editorLocks > 0);
    if(history) updateHistoryControls();
  }

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8500 : 4500);
  }
  function safe(handler) {
    return async function (event) {
      try { await handler(event); }
      catch (error) { console.error(error); toast(error.message || 'Не удалось выполнить действие.', true); }
    };
  }
  function currentGuest() { return state.guests.find(guest => guest.id === state.selectedId) || state.guests[0]; }
  function validGuests() { return state.guests.filter(guest => guest.name.trim()); }
  function eventTitle() { return state.settings.eventName.trim() || 'Мероприятие'; }
  function setProjectTitle(value) {
    const name=text(value,'',160);if(name===state.settings.eventName)return;
    state.settings.eventName=name;if($('eventName'))$('eventName').value=name;
    if($('projectTitle')&&document.activeElement!==$('projectTitle'))$('projectTitle').value=name;
    changed(true,'project-title');scheduleRender();
  }
  function imageName(guest) {
    return InviteExport.sanitizeFilename(eventTitle() + ' _ Пригласительный _ ' + guest.name + (state.settings.imageFormat === 'image/png' ? '.png' : '.jpg'));
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = InviteExport.sanitizeFilename(name);
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function activity(action,detail) { document.dispatchEvent(new CustomEvent('invitation:activity',{detail:{action,detail:String(detail||'').slice(0,300)}})); }
  function readDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
      reader.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось открыть изображение. Используйте PNG, JPG или WebP.'));
      image.src = src;
    });
  }
  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('invitation-studio-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Хранилище занято другой вкладкой.'));
    });
    return dbPromise;
  }
  async function readSaved(scope = storageScope) {
    const local=scope.startsWith('local:'),code=local?'':decodeURIComponent(scope.slice(('cloud:'+invitationPath+':').length));
    const scopes=invitationPaths.map(path=>scopeForCode(code,path)),candidates=[];
    for(const key of scopes.map(value=>'invitation-studio-v1:'+value).concat(local?['invitation-studio-v1']:[]))try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value)candidates.push(value);}catch(_){}
    try {
      const db=await openDB(),store=db.transaction('projects').objectStore('projects');
      const records=await Promise.all(scopes.map(value=>'current@'+value).concat(local?['current']:[]).map(key=>new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);})));candidates.push(...records.filter(Boolean));
    }catch(_){}
    return candidates.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0]||null;
  }
  function changed(sync = true, mergeKey = '') {
    storeActiveBlock();
    if(history) { if(sync && !historyRestoring) rememberHistory(mergeKey); else if(!sync) history.breakMerge(); updateHistoryControls(); }
    renderBlocks();
    if($('projectHeading')) $('projectHeading').textContent=state.settings.eventName||'Без названия';
    if($('projectTitle')&&document.activeElement!==$('projectTitle'))$('projectTitle').value=state.settings.eventName;
    dirty = true; savingVersion += 1;
    $('saveStatus').textContent = 'Сохраняем…';
    clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 550);
    document.dispatchEvent(new CustomEvent('invitation:changed', {detail: {sync}}));
  }
  async function saveLocal() {
    const version = savingVersion, scope = storageScope, snapshot = {...clone(state), savedAt: Date.now()};
    try {
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put(snapshot, 'current@' + scope);
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
      } catch (_) { localStorage.setItem('invitation-studio-v1:' + scope, JSON.stringify(snapshot)); }
      if(scope.startsWith('local:'))try{localStorage.setItem('invitation-local-meta-v1:'+invitationPath,JSON.stringify({title:snapshot.settings.eventName||'Без названия',updatedAt:new Date(snapshot.savedAt).toISOString()}));}catch(_){}
      if (version === savingVersion && scope === storageScope) { dirty = false; $('saveStatus').textContent = 'Сохранено в браузере'; document.dispatchEvent(new CustomEvent('invitation:local-saved',{detail:{scope}})); return true; }
      return false;
    } catch (_) {
      $('saveStatus').textContent = 'Сохраните проект в файл';
      // Binary assets may exceed a browser's local storage quota. The project file remains available.
      return false;
    }
  }
  function normalizeSettings(input) {
    const s = Object.assign({}, DEFAULT_SETTINGS), v = input || {};
    ['eventName', 'textTemplate', 'greetingMale', 'greetingFemale', 'greetingNeutral', 'fontFamily','nameFontFamily','blankGreeting'].forEach(key => { s[key] = text(v[key], s[key], key === 'textTemplate' ? 10000 : 160); });
    ['fontBold','fontItalic','autoFit','showGuides','foil','blockVisible','showGrid','snapGrid','showRulers','registrationMarks','nameAccentEnabled','nameFontBold','nameFontItalic','nameUnderline','nameHighlight','blankLine','scaleTypeOnFormat','printGrid','printFit'].forEach(key => { if (typeof v[key] === 'boolean') s[key] = v[key]; });
    s.fontSize = number(v.fontSize, s.fontSize, 5, 72);
    s.nameFontSize=number(v.nameFontSize,s.nameFontSize,5,72);s.nameLetterSpacing=number(v.nameLetterSpacing,0,0,3);s.blankCount=Math.round(number(v.blankCount,4,1,200));
    for(const key of ['nameTextColor','nameGradientColor','nameHighlightColor'])if(/^#[a-f\d]{6}$/i.test(v[key]))s[key]=v[key];
    s.nameTextFill=v.nameTextFill==='gradient'?'gradient':'solid';s.nameGradientAngle=number(v.nameGradientAngle,0,0,360);
    s.lineHeight = number(v.lineHeight, s.lineHeight, 1, 2.5);
    s.boxX = number(v.boxX, s.boxX, 0, 95); s.boxY = number(v.boxY, s.boxY, 0, 97);
    s.boxW = number(v.boxW, s.boxW, 5, 100 - s.boxX); s.boxH = number(v.boxH, s.boxH, 3, 100 - s.boxY);
    if (/^#[a-f\d]{6}$/i.test(v.textColor)) s.textColor = v.textColor;
    if (/^#[a-f\d]{6}$/i.test(v.gradientColor)) s.gradientColor = v.gradientColor;
    s.textFill = v.textFill === 'gradient' ? 'gradient' : 'solid'; s.gradientAngle = number(v.gradientAngle,0,0,360);
    s.gridStep = number(v.gridStep,5,1,20); s.foilDpi = Number(v.foilDpi)===300 ? 300 : 600;
    for (const [key, allowed] of Object.entries({textAlign: ['left', 'center', 'right'], textCase: ['normal', 'upper'], verticalAlign: ['top', 'middle', 'bottom'], backgroundFit: ['stretch', 'contain', 'cover'], imageFormat: ['image/jpeg', 'image/png']})) {
      if (allowed.includes(v[key])) s[key] = v[key];
    }
    s.exportDpi = Number(v.exportDpi) === 150 ? 150 : 300;
    s.printMargin = [0, 5, 10].includes(Number(v.printMargin)) ? Number(v.printMargin) : 0;
    s.cardFormat=Object.prototype.hasOwnProperty.call(FORMAT_PRESETS,v.cardFormat)||v.cardFormat==='custom'?v.cardFormat:'a6';s.cardOrientation=v.cardOrientation==='landscape'?'landscape':'portrait';
    s.cardWidth=number(v.cardWidth,105,50,420);s.cardHeight=number(v.cardHeight,148,50,420);const size=cardSize(s);s.cardWidth=size.width;s.cardHeight=size.height;
    s.templatePreset=['clean','frame'].includes(v.templatePreset)?v.templatePreset:'original';
    for(const [key,allowed]of Object.entries({printScope:['current','all','blank'],printLayer:['composite','background','text'],printPaper:['a4','a5','card'],printLayout:['auto','one'],printOrientation:['auto','portrait','landscape']}))if(allowed.includes(v[key]))s[key]=v[key];
    return s;
  }
  function normalizeProject(input) {
    if (!input || input.format !== 'invite-studio' || input.version !== 1 || !Array.isArray(input.guests)) throw new Error('Это не проект «Пригласительной». Для списка гостей используйте «Импорт».');
    if (input.guests.length > 10000) throw new Error('В одном проекте поддерживается до 10 000 гостей.');
    const usedIds = new Set();
    const guests = input.guests.map(g => {
      if (!g || typeof g !== 'object') throw new Error('Некорректная строка в списке гостей проекта.');
      const guest = GuestData.createGuest(text(g.name, '', 500), g.genderMode==='auto'?'':(['male','female','neutral'].includes(g.gender) ? g.gender : 'neutral'), text(g.email, '', 320));
      guest.genderMode=g.genderMode==='auto'?'auto':'manual';
      if (typeof g.id === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(g.id) && !usedIds.has(g.id)) guest.id = g.id;
      usedIds.add(guest.id); return guest;
    });
    const selectedIndex = input.guests.findIndex(g => g.id === input.selectedId);
    const safeFontData = data => typeof data==='string' && /^data:[^,]*;base64,[A-Za-z0-9+/=]+$/.test(data) && data.length<14000000;
    const fonts = Array.isArray(input.fonts) ? input.fonts.slice(0, 30).filter(f => f && typeof f.id === 'string' && /^custom-[\w-]+$/.test(f.id) && safeFontData(f.data)).map(f => ({id:f.id,name:text(f.name,'Шрифт',100),data:f.data,source:text(f.source,'',50),provider:text(f.provider,'',30),sourceURL:text(f.sourceURL,'',500),license:text(f.license,'',80),faces:Array.isArray(f.faces)?f.faces.slice(0,30).filter(face=>safeFontData(face.data)).map(face=>({data:face.data,unicodeRange:text(face.unicodeRange,'U+0-10FFFF',50000)})):undefined})) : [];
    const settings = normalizeSettings(input.settings);
    if (!SYSTEM_FONTS.includes(settings.fontFamily) && !fonts.some(f => f.id === settings.fontFamily)) settings.fontFamily = 'Arial';
    if(!SYSTEM_FONTS.includes(settings.nameFontFamily)&&!fonts.some(f=>f.id===settings.nameFontFamily))settings.nameFontFamily='Georgia';
    const template = typeof input.template === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.template) && input.template.length < 30000000 ? input.template : '';
    const blocks = Array.isArray(input.blocks) && input.blocks.length ? input.blocks.slice(0,30).map((block,i)=> {
      const style=normalizeSettings({...settings,...block});
      if(!SYSTEM_FONTS.includes(style.fontFamily) && !fonts.some(font=>font.id===style.fontFamily)) style.fontFamily='Arial';
      if(!SYSTEM_FONTS.includes(style.nameFontFamily)&&!fonts.some(font=>font.id===style.nameFontFamily))style.nameFontFamily='Georgia';
      return blockFromSettings(style,text(block.label,'Текст '+(i+1),70),typeof block.id==='string'&&/^[\w-]{1,100}$/.test(block.id)?block.id:blockId());
    }) : [blockFromSettings(settings,'Текст приглашения')];
    const activeBlockId=blocks.some(block=>block.id===input.activeBlockId)?input.activeBlockId:blocks[0].id;
    Object.assign(settings,Object.fromEntries(BLOCK_KEYS.map(key=>[key,blocks.find(block=>block.id===activeBlockId)[key]])));
    return {format: 'invite-studio', version: 1, guests, settings, blocks,activeBlockId, selectedId: guests[Math.max(0, selectedIndex)]?.id || '', fonts, template, templateName: text(input.templateName, 'Загруженный макет', 160), isSample: input.isSample === true};
  }
  function defaultBlocks(settings) {
    return [
      blockFromSettings({...settings,textTemplate:'{обращение},\n{ФИО}!',boxY:28,boxH:8.5,foil:true},'Обращение и ФИО'),
      blockFromSettings({...settings,textTemplate:'Кафедра общей и экономической социологии ТюмГУ\nприглашает Вас на День социолога!',boxY:38,boxH:8,foil:false},'Текст приглашения'),
      blockFromSettings({...settings,textTemplate:'12 ноября 2026 года в 13:30\nг. Тюмень, ул. Ленина, д. 16, аудитория L300',boxY:47,boxH:7,foil:false},'Дата и адрес')
    ];
  }
  function createEmptyProject(title = 'Новое мероприятие') {
    const settings={...DEFAULT_SETTINGS,eventName:text(title,'Новое мероприятие',160).trim()||'Новое мероприятие',cardFormat:'a5',cardWidth:148,cardHeight:210,fontSize:14,nameFontSize:18};
    const blocks=defaultBlocks(settings);
    blocks[1].textTemplate='Приглашаем Вас на {мероприятие}!';
    blocks[2].textTemplate='Дата и время\nМесто проведения';
    Object.assign(settings,Object.fromEntries(BLOCK_KEYS.map(key=>[key,blocks[0][key]])));
    return {format:'invite-studio',version:1,settings,blocks,activeBlockId:blocks[0].id,guests:[],selectedId:'',template:window.DEFAULT_TEMPLATE,templateName:'Исходный макет',fonts:[],isSample:false};
  }
  function historySnapshot() {
    // Binary strings and immutable font records are shared between snapshots.
    const previous=history.current(),sameAssets=previous && previous.project.template===state.template && previous.project.fonts.length===state.fonts.length && previous.project.fonts.every((font,i)=>font===state.fonts[i]);
    const assetKey=sameAssets?previous.assetKey:++historyAssetSerial;
    const project={...state,settings:{...state.settings},blocks:state.blocks.map(block=>({...block})),guests:state.guests.map(guest=>({...guest})),fonts:state.fonts.slice()};
    const globalSettings=Object.fromEntries(Object.entries(project.settings).filter(([key])=>!BLOCK_KEYS.includes(key)));
    const signature=assetKey+':'+JSON.stringify({settings:globalSettings,blocks:project.blocks,guests:project.guests,templateName:project.templateName,isSample:project.isSample});
    return {project,assetKey,signature};
  }
  function resetHistory() {
    if(!history || !state.blocks)return;
    historyReady=true; const snapshot=historySnapshot();history.reset(snapshot,{signature:snapshot.signature});updateHistoryControls();
  }
  function rememberHistory(mergeKey) {
    if(!historyReady)return;
    const snapshot=historySnapshot();history.record(snapshot,{mergeKey,signature:snapshot.signature});
  }
  function updateHistoryControls() {
    const locked=!historyReady||historyRestoring||historyGesture||busy||editorLocks>0;
    if($('undoChange')) $('undoChange').disabled=locked||!history.canUndo;
    if($('redoChange')) $('redoChange').disabled=locked||!history.canRedo;
  }
  async function restoreHistory(direction) {
    if(!history || !historyReady || historyRestoring || historyGesture || busy || editorLocks>0)return;
    const snapshot=direction==='undo'?history.undo():history.redo();if(!snapshot)return;
    historyRestoring=true;lockEditor(true);
    try {
      const next=snapshot.project;
      await activateProject({...next,settings:{...next.settings},blocks:next.blocks.map(block=>({...block})),guests:next.guests.map(guest=>({...guest})),fonts:next.fonts.slice()},false);
      $('guestSearch').value='';renderGuests();changed();await saveLocal();
    } catch(error) {
      if(direction==='undo')history.redo();else history.undo();throw error;
    } finally {historyRestoring=false;lockEditor(false);updateHistoryControls();}
  }
  function bindHistory() {
    if(!history)return;
    $('undoChange')?.addEventListener('click',safe(()=>restoreHistory('undo')));
    $('redoChange')?.addEventListener('click',safe(()=>restoreHistory('redo')));
    document.addEventListener('keydown',event=>{
      if(event.defaultPrevented||event.isComposing||event.altKey||(!event.ctrlKey&&!event.metaKey)||document.querySelector('dialog[open]'))return;
      const target=event.target;
      if(target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'))return;
      const key=event.key.toLowerCase(),direction=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'&&!event.shiftKey?'redo':'';
      if(!direction||historyRestoring||historyGesture||busy||editorLocks>0)return;
      if(direction==='undo'?!history.canUndo:!history.canRedo)return;
      event.preventDefault();safe(()=>restoreHistory(direction))();
    });
  }
  async function installFont(font, targetState, targetEpoch) {
    const faces=[];
    for(const part of font.faces?.length ? font.faces : [{data:font.data}]) {
      if(targetState && (state!==targetState || editorLocks>0 || (targetEpoch!==undefined && projectEpoch!==targetEpoch)))return false;
      const face = new FontFace(font.id, 'url(' + part.data + ')', part.unicodeRange ? {unicodeRange:part.unicodeRange} : {});
      await face.load();
      if(targetState && (state!==targetState || editorLocks>0 || (targetEpoch!==undefined && projectEpoch!==targetEpoch)))return false;
      faces.push(face);
    }
    faces.forEach(face=>document.fonts.add(face)); fontFaces.set(font.id, faces);clearTextMetrics();
    return true;
  }
  async function activateProject(nextState, clearHistory = true) {
    const token=++projectEpoch,previous={state,background,fontFaces},sameAssets=nextState.template===state.template && nextState.fonts.length===state.fonts.length && nextState.fonts.every((font,i)=>font===state.fonts[i]);
    const nextImage=sameAssets&&background?background:await loadImage(nextState.template || window.DEFAULT_TEMPLATE),nextFaces=sameAssets?fontFaces:new Map(),failed=[];
    if(!sameAssets)for(const font of nextState.fonts) {
      try {
        const faces=[];
        for(const part of font.faces?.length?font.faces:[{data:font.data}]) {
          const face=new FontFace(font.id,'url('+part.data+')',part.unicodeRange?{unicodeRange:part.unicodeRange}:{});await face.load();faces.push(face);
          if(token!==projectEpoch)throw new Error('Открытие проекта отменено.');
        }
        nextFaces.set(font.id,faces);
      } catch(error) {if(token!==projectEpoch)throw error;failed.push(font.name);}
    }
    if(token!==projectEpoch)throw new Error('Открытие проекта отменено.');
    for(const block of nextState.blocks||[])if(block.fontFamily.startsWith('custom-')&&!nextFaces.has(block.fontFamily))block.fontFamily='Arial';
    if(nextState.settings.fontFamily.startsWith('custom-')&&!nextFaces.has(nextState.settings.fontFamily))nextState.settings.fontFamily='Arial';
    try {
      if(!sameAssets) {for(const faces of fontFaces.values())for(const face of faces)document.fonts.delete(face);for(const faces of nextFaces.values())for(const face of faces)document.fonts.add(face);}
      state=nextState;background=nextImage;fontFaces=nextFaces;clearTextMetrics();
      syncControls();renderBlocks();renderGuests();selectGuest(state.selectedId,false);updateTemplateInfo();scheduleRender();
      if(clearHistory)resetHistory();
    } catch(error) {
      if(!sameAssets) {for(const faces of nextFaces.values())for(const face of faces)document.fonts.delete(face);for(const faces of previous.fontFaces.values())for(const face of faces)document.fonts.add(face);}
      state=previous.state;background=previous.background;fontFaces=previous.fontFaces;
      try {syncControls();renderBlocks();renderGuests();selectGuest(state.selectedId,false);updateTemplateInfo();scheduleRender();} catch(_) {}
      throw error;
    }
    if(failed.length)toast('Не удалось загрузить шрифты: '+failed.join(', ')+'. Выбран Arial.',true);
  }

  function syncControls() {
    if($('projectHeading')) $('projectHeading').textContent=state.settings.eventName||'Без названия';
    if($('projectTitle'))$('projectTitle').value=state.settings.eventName;
    updateFontOptions();
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      const input = $(key); if (!input) return;
      if (input.type === 'checkbox') input.checked = state.settings[key];
      else if (key === 'fontBold' || key === 'fontItalic') input.setAttribute('aria-pressed', String(state.settings[key]));
      else input.value = ['boxX','boxW'].includes(key) ? +(state.settings[key]*cardSize().width/100).toFixed(2) : ['boxY','boxH'].includes(key) ? +(state.settings[key]*cardSize().height/100).toFixed(2) : state.settings[key];
    });
    if($('blockName')) $('blockName').value=activeBlock()?.label||'';
    if($('gradientControls')) $('gradientControls').hidden=state.settings.textFill!=='gradient';
    updateAccentControls();
    updateFormatUI();
    updateTextBox();
  }
  function updateFontOptions() {
    for(const id of ['fontFamily','nameFontFamily']){const select=$(id);if(!select)continue;select.replaceChildren();
      for (const font of SYSTEM_FONTS) select.add(new Option(font, font));
      for (const font of state.fonts) select.add(new Option(font.name + (fontFaces.has(font.id) ? ' · загружен' : ' · ошибка'), font.id));
      select.value = state.settings[id];}
  }
  function updateAccentControls(){if($('nameAccentControls'))$('nameAccentControls').hidden=!state.settings.nameAccentEnabled;if($('nameGradientControls'))$('nameGradientControls').hidden=state.settings.nameTextFill!=='gradient';}
  function renderBlocks() {
    const list=$('blockList'); if(!list)return;list.replaceChildren();
    for(const block of state.blocks||[]) {
      const button=document.createElement('button');button.className='block-row'+(block.id===state.activeBlockId?' active':'');button.setAttribute('aria-pressed',String(block.id===state.activeBlockId));
      const title=document.createElement('strong');title.textContent=block.label;const detail=document.createElement('small');
      detail.textContent=(!block.blockVisible?'Скрыт · ':'')+(+block.fontSize.toFixed(1))+' пт';button.append(title,detail);button.addEventListener('click',()=>selectBlock(block.id));list.append(button);
    }
    const foilList=$('foilBlockList');if(foilList){foilList.replaceChildren();for(const block of state.blocks||[]){const label=document.createElement('label');label.className='check-label';const input=document.createElement('input');input.type='checkbox';input.checked=block.foil;input.addEventListener('change',()=>{block.foil=input.checked;if(block.id===state.activeBlockId)state.settings.foil=input.checked;changed();scheduleRender();});const name=document.createElement('span');name.textContent=block.label;label.append(input,name);foilList.append(label);}}
  }
  function selectBlock(id,storePrevious=true) {
    if(storePrevious)storeActiveBlock();const block=state.blocks?.find(item=>item.id===id);if(!block)return;
    state.activeBlockId=id;BLOCK_KEYS.forEach(key=>{state.settings[key]=block[key];});syncControls();renderBlocks();changed(false);scheduleRender();
  }
  function syncBoxFields() {
    const size=cardSize();for(const key of ['boxX','boxY','boxW','boxH']) $(key).value=+(state.settings[key]*(['boxX','boxW'].includes(key)?size.width:size.height)/100).toFixed(2);
    $('boxX').max=+((100-state.settings.boxW)*size.width/100).toFixed(2);$('boxY').max=+((100-state.settings.boxH)*size.height/100).toFixed(2);$('boxW').max=size.width;$('boxH').max=size.height;
  }
  function snapPercent(value,mm) {return state.settings.snapGrid?Math.round(value*mm/100/state.settings.gridStep)*state.settings.gridStep/mm*100:value;}
  function renderGrid() {
    const svg=$('layoutGrid');if(!svg)return;const s=state.settings,size=cardSize(),key=[s.showGrid,s.showRulers,s.gridStep,size.width,size.height].join(':');
    svg.hidden=!s.showGrid&&!s.showRulers;if(svg.dataset.key===key)return;svg.dataset.key=key;svg.replaceChildren();
    svg.setAttribute('viewBox','0 0 '+size.width+' '+size.height);
    const add=(tag,attrs,value)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(value!=null)el.textContent=value;svg.append(el);};
    if(s.showGrid) {
      for(let x=s.gridStep;x<size.width;x+=s.gridStep)add('line',{x1:x,y1:0,x2:x,y2:size.height,class:x%10<.01?'grid-major':'grid-minor'});
      for(let y=s.gridStep;y<size.height;y+=s.gridStep)add('line',{x1:0,y1:y,x2:size.width,y2:y,class:y%10<.01?'grid-major':'grid-minor'});
    }
    if(s.showRulers) {
      for(let x=10;x<size.width;x+=10)add('text',{x,y:Math.max(2.5,size.width/42),class:'ruler-label',style:'font-size:'+size.width/62+'px'},x);
      for(let y=10;y<size.height;y+=10)add('text',{x:1,y,class:'ruler-label',style:'font-size:'+size.width/62+'px'},y);
    }
  }
  function printGeometry(){
    if(!window.InvitePrint)throw new Error('Не загружен модуль печати. Обновите страницу.');
    const size=cardSize(),s=state.settings;
    return window.InvitePrint.calculateLayout({cardWidth:size.width,cardHeight:size.height,paper:s.printPaper,orientation:s.printOrientation,layout:s.printLayout,margin:s.printMargin,fit:s.printFit});
  }
  function updatePrintPdfAvailability(){
    const valid=guestListSummary?.guests===state.guests?guestListSummary.valid:state.guests.filter(guest=>guest.name.trim()).length;
    const available=state.settings.printScope==='blank'||state.settings.printScope==='current'||state.settings.printLayer==='background'||valid>0;
    for(const id of ['exportPdf','quickPDF'])if($(id))$(id).disabled=!available;
  }
  function updateFormatUI(){
    updatePrintPdfAvailability();
    const size=cardSize(),label=size.label+' · '+size.width+' × '+size.height+' мм';
    for(const id of ['formatTag','previewFormat','footerFormat'])if($(id))$(id).textContent=label;
    document.querySelectorAll?.('.format-tag').forEach(el=>{el.textContent=label;});
    const stage=$('paperStage');if(stage?.style)stage.style.aspectRatio=size.width+' / '+size.height;
    for(const id of ['cardWidth','cardHeight'])if($(id))$(id).disabled=state.settings.cardFormat!=='custom';
    if($('customCardSize'))$('customCardSize').hidden=state.settings.cardFormat!=='custom';
    if($('formatHelp'))$('formatHelp').textContent=label+'. '+(state.settings.scaleTypeOnFormat?'При смене формата кегль меняется вместе с размером карточки.':'Кегль остаётся в заданных пунктах.');
    if($('fontSizeHint'))$('fontSizeHint').textContent=state.settings.fontSize<11?'Для печати '+state.settings.fontSize.toFixed(1)+' пт может быть мелко. Попробуйте А5 или увеличьте кегль.':'Кегль задан в печатных пунктах.';
    if($('templateFormatNote'))$('templateFormatNote').textContent='Формат '+size.label+': '+size.width+' × '+size.height+' мм. Фон и текст печатаются в одном масштабе.';
    if($('printInfo'))try{const layout=printGeometry();$('printInfo').textContent=layout.capacity+' шт. на листе '+layout.pageWidth+' × '+layout.pageHeight+' мм. '+(layout.scale<.999?'Уменьшение до '+Math.round(layout.scale*100)+'%.':'Фактический размер 100%.');}catch(error){$('printInfo').textContent=error.message;}
  }
  function changeFormat(key,value){
    storeActiveBlock();const before=cardSize(),raw={...state.settings,[key]:value};if(['cardWidth','cardHeight'].includes(key)){raw.cardFormat='custom';raw.cardOrientation=raw.cardWidth>raw.cardHeight?'landscape':'portrait';}const next=normalizeSettings(raw),wide=key==='cardFormat'&&['dl','slim'].includes(value);
    if(wide){next.cardOrientation='landscape';next.templatePreset='clean';}
    const after=cardSize(next),scaled=Math.sqrt(after.width*after.height/(before.width*before.height)),factor=state.settings.scaleTypeOnFormat?(wide?Math.max(1,scaled):scaled):1;
    for(const block of state.blocks){block.fontSize=Math.round(clamp(block.fontSize*factor,wide&&state.settings.scaleTypeOnFormat?12:5,72)*10)/10;block.nameFontSize=Math.round(clamp(block.nameFontSize*factor,wide&&state.settings.scaleTypeOnFormat?16:5,72)*10)/10;block.nameLetterSpacing=Math.round(clamp(block.nameLetterSpacing*factor,0,3)*10)/10;}
    if(wide){const count=state.blocks.length;for(let i=0;i<count;i++)Object.assign(state.blocks[i],{boxX:5,boxY:16+i*76/count,boxW:90,boxH:Math.max(3,Math.min(73,76/count-2))});}
    if(next.templatePreset==='original'&&background&&Math.abs((background.width/background.height)/(after.width/after.height)-1)>.03)next.backgroundFit='contain';
    next.cardWidth=after.width;next.cardHeight=after.height;Object.assign(next,Object.fromEntries(BLOCK_KEYS.map(k=>[k,activeBlock()[k]])));state.settings=normalizeSettings(next);
    syncControls();syncBoxFields();updateTemplateInfo();changed();scheduleRender();
  }
  function bindBlockTools() {
    $('blockName').addEventListener('input',()=>{activeBlock().label=$('blockName').value.slice(0,70);changed(true,'block-name:'+state.activeBlockId);updateTextBox();});
    $('addBlock').addEventListener('click',()=>{
      if(state.blocks.length>=30){toast('Можно добавить до 30 блоков.',true);return;}
      storeActiveBlock();const block=blockFromSettings({...state.settings,textTemplate:'Новый текст',boxX:10,boxY:35,boxW:80,boxH:10,foil:false,blockVisible:true},'Текст '+(state.blocks.length+1));
      state.blocks.push(block);selectBlock(block.id);changed();
    });
    $('duplicateBlock').addEventListener('click',()=>{
      if(state.blocks.length>=30)return;storeActiveBlock();const block={...clone(activeBlock()),id:blockId(),label:activeBlock().label+' — копия'};block.boxY=clamp(block.boxY+2,0,100-block.boxH);state.blocks.push(block);selectBlock(block.id);changed();
    });
    $('deleteBlock').addEventListener('click',()=>{
      if(state.blocks.length===1){toast('Оставьте хотя бы один текстовый блок.');return;}
      const index=state.blocks.findIndex(block=>block.id===state.activeBlockId);state.blocks.splice(index,1);selectBlock(state.blocks[Math.max(0,index-1)].id,false);changed();
    });
    for(const [id,direction] of [['blockUp',-1],['blockDown',1]]) $(id).addEventListener('click',()=>{
      storeActiveBlock();const index=state.blocks.findIndex(block=>block.id===state.activeBlockId),target=index+direction;if(target<0||target>=state.blocks.length)return;
      [state.blocks[index],state.blocks[target]]=[state.blocks[target],state.blocks[index]];changed();scheduleRender();
    });
    document.querySelectorAll('[data-align-block]').forEach(button=>button.addEventListener('click',()=>{
      const s=state.settings;switch(button.dataset.alignBlock){case'left':s.boxX=0;break;case'center':s.boxX=(100-s.boxW)/2;break;case'right':s.boxX=100-s.boxW;break;case'top':s.boxY=0;break;case'middle':s.boxY=(100-s.boxH)/2;break;case'bottom':s.boxY=100-s.boxH;break;}
      syncBoxFields();changed();scheduleRender();
    }));
    $('previewMode').addEventListener('change',scheduleRender);
    $('exportFoil').addEventListener('click',safe(exportFoilKit));
    $('fontLibrary').addEventListener('click',()=>{$('fontLibraryDialog').showModal();renderFontLibrary();});
    $('librarySearch').addEventListener('input',renderFontLibrary);
    $('libraryProvider')?.addEventListener('change',renderFontLibrary);
    $('nameStylePreset')?.addEventListener('change',()=>{
      const value=$('nameStylePreset').value,s=state.settings;if(value==='none')return;
      Object.assign(s,{nameAccentEnabled:true,nameFontFamily:value==='contrast'?'Arial':'Georgia',nameFontSize:clamp(s.fontSize*(value==='contrast'?1.4:1.3),5,72),nameFontBold:value==='contrast',nameFontItalic:value==='script',nameTextColor:'#694983',nameTextFill:value==='contrast'?'gradient':'solid',nameGradientColor:'#bd819d',nameUnderline:false,nameLetterSpacing:0,nameHighlight:false});
      if(value==='script'){const uploaded=state.fonts.find(font=>/gogol|гогол|caveat|marck|script/i.test(font.name));if(uploaded)s.nameFontFamily=uploaded.id;}
      syncControls();changed();scheduleRender();
    });
    $('exportBlankPdf')?.addEventListener('click',safe(exportBlankPDF));$('exportBlankPng')?.addEventListener('click',safe(exportBlankPNG));$('exportBlankFoil')?.addEventListener('click',safe(()=>exportFoilKit(true)));
  }
  function renderFontLibrary() {
    const list=$('fontLibraryList'),query=$('librarySearch').value.toLowerCase(),provider=$('libraryProvider')?.value||'google';list.replaceChildren();
    const matches=InviteFonts.catalog.filter(font=>(font.provider||'google')===provider&&font.name.toLowerCase().includes(query));
    if(provider==='google'&&query.trim()&&!matches.length)matches.push({name:$('librarySearch').value.trim(),category:'Загрузка семейства по имени',provider});
    if(!matches.length){const message=document.createElement('p');message.className='hint';message.textContent='В этой библиотеке ничего не найдено. Измените запрос или загрузите свой файл шрифта.';list.append(message);}
    for(const font of matches) {
      const row=document.createElement('div');row.className='font-library-row';const label=document.createElement('div');
      const name=document.createElement('strong');name.textContent=font.name;const category=document.createElement('small');category.textContent=font.category;label.append(name,category);
      const button=document.createElement('button');button.className='button outline';button.textContent='Добавить';
      button.addEventListener('click',safe(async()=>{
        if(state.fonts.length>=30)throw new Error('В проекте уже 30 загруженных шрифтов.');
        const targetState=state,targetEpoch=projectEpoch,targetBlockId=state.activeBlockId;button.disabled=true;button.textContent='Загрузка…';
        try {
          const data=await InviteFonts.download(font.name,(done,total)=>{button.textContent=done+'/'+total;},font.provider||provider);
          if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
          const loaded={...data,id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)};
          if(!await installFont(loaded,targetState,targetEpoch))return;
          if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
          state.fonts.push(loaded);const target=state.blocks.find(block=>block.id===targetBlockId);if(target)target.fontFamily=loaded.id;if(state.activeBlockId===targetBlockId)state.settings.fontFamily=loaded.id;updateFontOptions();changed();scheduleRender();toast('Добавлен '+font.name);button.textContent='Добавлен';
          activity('font_import',font.name+' · '+(loaded.source||provider));
        } catch(error){button.disabled=false;button.textContent='Повторить';if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;throw error;}
      }));row.append(label,button);list.append(row);
    }
  }
  function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('ru-RU') || '+'; }
  function genderLabel(gender) { return {male: 'Мужское обращение', female: 'Женское обращение', neutral: 'Нейтральное обращение'}[gender] || 'Нейтральное обращение'; }
  function guestMatches(guest,query) {
    if(!query)return true;
    let cached=guestSearchValues.get(guest);
    if(!cached||cached.name!==guest.name||cached.email!==guest.email){cached={name:guest.name,email:guest.email,value:(guest.name+' '+guest.email).toLocaleLowerCase('ru-RU')};guestSearchValues.set(guest,cached);}
    return cached.value.includes(query);
  }
  function updateGuestGenderControls(){
    const guest=currentGuest();if(!guest)return;
    if($('guestGenderMode'))$('guestGenderMode').value=guest.genderMode==='auto'?'auto':'manual';
    $('guestGender').value=guest.gender;
    if($('guestGenderHint')){const info=GuestData.inferGenderDetails?.(guest.name),reasons={'patronymic':'по отчеству','first-name':'по имени',surname:'по фамилии',conflict:'признаки расходятся',unknown:'недостаточно данных'};$('guestGenderHint').textContent=guest.genderMode==='auto'?'Авто: '+genderLabel(guest.gender).toLocaleLowerCase('ru-RU')+(info?.reason?' · '+(reasons[info.reason]||'по ФИО'):''):'Обращение выбрано вручную';}
  }
  function guestRow(guest,active) {
    let entry=guestRowsById.get(guest.id);
    if(!entry){
      const button=document.createElement('button');button.className='guest-row';button.dataset.id=guest.id;
      const avatar=document.createElement('span');avatar.className='avatar';
      const wrap=document.createElement('span');wrap.className='guest-row-text';
      const name=document.createElement('strong'),gender=document.createElement('small'),mark=document.createElement('span');mark.className='row-check';mark.textContent='✓';
      wrap.append(name,gender);button.append(avatar,wrap);button.addEventListener('click',()=>selectGuest(button.dataset.id));
      entry={button,avatar,name,gender,mark,nameValue:null,genderValue:null,active:null};guestRowsById.set(guest.id,entry);
    }
    if(entry.nameValue!==guest.name){entry.name.textContent=guest.name||'Новый гость';entry.name.title=guest.name;entry.avatar.textContent=initials(guest.name);entry.nameValue=guest.name;}
    if(entry.genderValue!==guest.gender){entry.button.dataset.gender=guest.gender;entry.gender.textContent=genderLabel(guest.gender);entry.genderValue=guest.gender;}
    if(entry.active!==active){entry.button.classList.toggle('active',active);entry.button.setAttribute('aria-pressed',String(active));if(active)entry.button.append(entry.mark);else entry.mark.remove();entry.active=active;}
    return entry.button;
  }
  function updateGuestSummary(selected) {
    const {total,neutral,valid}=guestListSummary;
    for(const [id,value]of [['guestCount',String(total)],['exportCount',String(valid)],['guestStats',total?total+' в списке'+(neutral?' · '+neutral+' с нейтральным обращением':' · обращения настроены'):'Ваш список пока пуст']])if($(id).textContent!==value)$(id).textContent=value;
    $('guestEditor').hidden=!selected;updateGuestGenderControls();
    ['exportAll','exportFoil','quickFoil'].forEach(id=>{$(id).disabled=!valid;});updatePrintPdfAvailability();$('checkAll').disabled=!total;
    ['exportCurrent','quickCurrent'].forEach(id=>{$(id).disabled=!selected?.name.trim();});
  }
  function renderGuests() {
    const container=$('guestList'),query=$('guestSearch').value.trim().toLocaleLowerCase('ru-RU'),selected=currentGuest(),selectedId=selected?.id;
    const rows=[],ids=new Set();let neutral=0,valid=0,shown=0;
    if(state.isSample){if(!sampleGuestBanner){sampleGuestBanner=document.createElement('div');sampleGuestBanner.className='sample-banner';sampleGuestBanner.textContent='Пример списка · замените своими гостями';}rows.push(sampleGuestBanner);}
    for(const guest of state.guests){
      ids.add(guest.id);if(guest.gender==='neutral')neutral++;if(guest.name.trim())valid++;
      if(!guestMatches(guest,query))continue;
      shown++;rows.push(guestRow(guest,guest.id===selectedId));
    }
    for(const id of guestRowsById.keys())if(!ids.has(id))guestRowsById.delete(id);
    if(!shown){if(!emptyGuestList){emptyGuestList=document.createElement('div');emptyGuestList.className='empty-list';}emptyGuestList.textContent=query?'Гости не найдены':'Начните со списка гостей\nили добавьте первого вручную';rows.push(emptyGuestList);}
    // Editing one guest updates that row without detaching the entire list.
    if(renderedGuestRows.length!==rows.length||rows.some((row,index)=>renderedGuestRows[index]!==row)){container.replaceChildren(...rows);renderedGuestRows=rows;}
    guestListSummary={guests:state.guests,total:state.guests.length,neutral,valid,query,isSample:state.isSample};updateGuestSummary(selected);
  }
  function updateEditedGuest(guest,previous) {
    const summary=guestListSummary,query=$('guestSearch').value.trim().toLocaleLowerCase('ru-RU');
    // A field edit changes one keyed row. Rebuild only if the visible result set changes.
    if(!summary||summary.guests!==state.guests||summary.total!==state.guests.length||summary.query!==query||summary.isSample!==state.isSample||guestMatches(previous,query)!==guestMatches(guest,query)){renderGuests();return;}
    summary.valid+=Number(!!guest.name.trim())-Number(!!previous.name.trim());
    summary.neutral+=Number(guest.gender==='neutral')-Number(previous.gender==='neutral');
    if(guestMatches(guest,query))guestRow(guest,guest.id===state.selectedId);
    updateGuestSummary(currentGuest());
  }
  function selectGuest(id, persist = true) {
    const previousId=state.selectedId;state.selectedId=state.guests.some(g=>g.id===id)?id:state.guests[0]?.id||'';
    const guest=currentGuest();$('guestName').value=guest?.name||'';$('guestGender').value=guest?.gender||'neutral';$('guestEmail').value=guest?.email||'';
    updateGuestGenderControls();$('guestEditor').hidden=!guest;
    for(const candidate of new Set([previousId,state.selectedId])){const entry=guestRowsById.get(candidate);if(!entry)continue;const active=candidate===state.selectedId;entry.button.classList.toggle('active',active);entry.button.setAttribute('aria-pressed',String(active));if(active)entry.button.append(entry.mark);else entry.mark.remove();entry.active=active;}
    if(persist)changed(false);scheduleRender();
  }
  function updateTemplateInfo() {
    if (!background) return;
    const size=cardSize(),ratio=background.width/background.height,target=size.width/size.height;
    $('templateInfo').textContent=state.settings.templatePreset==='original'?state.templateName+' · '+background.width+' × '+background.height+' px.'+(Math.abs(ratio/target-1)>.03?' Пропорции отличаются: выберите «Уместить целиком» или чистый фон.':' Пропорции подходят.'):(state.settings.templatePreset==='frame'?'Светлый фон с рамкой.':'Чистый светлый фон.');
  }
  function buildText(guest, style = state.settings) {
    const s = state.settings;
    const greeting = guest.__blank ? s.blankGreeting.replace(/[,!\s]+$/,'') : guest.gender === 'female' ? s.greetingFemale : guest.gender === 'male' ? s.greetingMale : s.greetingNeutral;
    const values = {'обращение': greeting, 'фио': guest.__blank?'\uFFFC':guest.name, 'имя': guest.__blank?'\uFFFC':guest.name, 'мероприятие': s.eventName, 'email': guest.email};
    let result = style.textTemplate.replace(/\{([^{}]+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? values[key.toLowerCase()] : match);
    if (style.textCase === 'upper') result = result.toLocaleUpperCase('ru-RU');
    return result;
  }
  function wrapText(ctx, content, width) {
    const lines = [];
    for (const paragraph of content.replace(/\r\n?/g, '\n').split('\n')) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? line + ' ' + word : word;
        if (canvasMetrics(ctx,candidate).width <= width) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        if (canvasMetrics(ctx,word).width <= width) { line = word; continue; }
        for (const char of Array.from(word)) {
          if (line && canvasMetrics(ctx,line + char).width > width) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  function setCanvasFont(ctx, pt, scale, s = state.settings) {
    ctx.font = (s.fontItalic ? 'italic ' : '') + (s.fontBold ? '700 ' : '400 ') + (pt * scale) + 'px "' + s.fontFamily + '"';
  }
  function layoutText(ctx, guest, width, height, s = state.settings) {
    const scale = width / cardSize(s).width * 25.4 / 72;
    const box = {x: width * s.boxX / 100, y: height * s.boxY / 100, w: width * s.boxW / 100, h: height * s.boxH / 100};
    const content = buildText(guest,s);
    // Preserve the token boundary: only a name token gets the accent, even if
    // the same name appears in the ordinary invitation text elsewhere.
    const fragments=[];let cursor=0;
    for(const match of s.textTemplate.matchAll(/\{([^{}]+)\}/g)) {
      if(match.index>cursor)fragments.push({text:s.textTemplate.slice(cursor,match.index),accent:false});
      const name=['фио','имя'].includes(match[1].toLowerCase());
      fragments.push({text:buildText(guest,{...s,textTemplate:match[0]}),accent:name&&s.nameAccentEnabled,blank:name&&guest.__blank});cursor=match.index+match[0].length;
    }
    if(cursor<s.textTemplate.length)fragments.push({text:s.textTemplate.slice(cursor),accent:false});
    if(s.textCase==='upper')for(const fragment of fragments)fragment.text=fragment.text.toLocaleUpperCase('ru-RU');
    function measure(pt) {
      const padding = Math.min(box.w * .05, pt * scale * .12);
      const available=Math.max(1,box.w-2*padding),richLines=[];let runs=[];
      const namePt=s.nameFontSize*(pt/s.fontSize);
      function styleFor(accent){return accent?{...s,fontFamily:s.nameFontFamily,fontBold:s.nameFontBold,fontItalic:s.nameFontItalic}:s;}
      function runMetrics(run) {
        const size=run.accent?namePt:pt;setCanvasFont(ctx,size,scale,styleFor(run.accent));
        const spacing=run.accent?s.nameLetterSpacing*scale*(pt/s.fontSize):0,chars=Array.from(run.text);
        const metrics=canvasMetrics(ctx,'ЙÅЩруg');
        return {...run,pt:size,spacing,width:run.blank?available*.8:spacing?chars.reduce((sum,char)=>sum+canvasMetrics(ctx,char).width,0)+Math.max(0,chars.length-1)*spacing:canvasMetrics(ctx,run.text).width,
          ascent:metrics.actualBoundingBoxAscent||size*scale*.85,descent:metrics.actualBoundingBoxDescent||size*scale*.2};
      }
      const widthOf=list=>list.reduce((sum,run)=>sum+runMetrics(run).width,0);
      function append(text,accent,blank=false) {
        if(!blank&&runs.length&&runs[runs.length-1].accent===accent&&!runs[runs.length-1].blank)runs[runs.length-1].text+=text;
        else runs.push({text,accent,blank});
      }
      function finish(){
        while(runs.length&&!runs[runs.length-1].blank){runs[runs.length-1].text=runs[runs.length-1].text.replace(/\s+$/,'');if(runs[runs.length-1].text)break;runs.pop();}
        const row=runs.map(runMetrics);setCanvasFont(ctx,pt,scale,s);const normal=canvasMetrics(ctx,'ЙÅЩруg');
        const ascent=Math.max(normal.actualBoundingBoxAscent||pt*scale*.85,...row.map(run=>run.ascent));
        const descent=Math.max(normal.actualBoundingBoxDescent||pt*scale*.2,...row.map(run=>run.descent));
        richLines.push({runs:row,width:row.reduce((sum,run)=>sum+run.width,0),ascent,descent,height:Math.max(pt*scale*s.lineHeight,ascent+descent)});runs=[];
      }
      for(const fragment of fragments) {
        if(fragment.blank){if(runs.length&&widthOf(runs)+available*.8>available)finish();append('',false,true);continue;}
        for(const token of fragment.text.replace(/\r\n?/g,'\n').match(/\n|[^\S\n]+|[^\s]+/g)||[]) {
          if(token==='\n'){finish();continue;}
          const space=/^\s+$/.test(token);if(space&&!runs.length)continue;
          const candidate=runs.map(run=>({...run}));if(candidate.length&&candidate[candidate.length-1].accent===fragment.accent&&!candidate[candidate.length-1].blank)candidate[candidate.length-1].text+=space?' ':token;else candidate.push({text:space?' ':token,accent:fragment.accent,blank:false});
          if(widthOf(candidate)<=available){append(space?' ':token,fragment.accent);continue;}
          if(space){finish();continue;}
          if(runs.length)finish();
          if(runMetrics({text:token,accent:fragment.accent}).width<=available){append(token,fragment.accent);continue;}
          for(const char of Array.from(token)){const probe=runs.map(run=>({...run}));if(probe.length)probe[probe.length-1].text+=char;else probe.push({text:char,accent:fragment.accent});if(runs.length&&widthOf(probe)>available)finish();append(char,fragment.accent);}
        }
      }
      if(runs.length||!richLines.length||s.textTemplate.endsWith('\n'))finish();
      return {pt,minPt:s.nameAccentEnabled?Math.min(pt,namePt):pt,lines:richLines.map(row=>row.runs.map(run=>run.blank?'':run.text).join('')),richLines,linePx:pt*scale*s.lineHeight,padding,ascent:richLines[0]?.ascent||0,maxWidth:Math.max(0,...richLines.map(row=>row.width)),totalHeight:richLines.reduce((sum,row)=>sum+row.height,0)};
    }
    let result = measure(s.fontSize);
    const fits = r => r.totalHeight <= box.h + .1 && r.maxWidth <= box.w - 2 * r.padding + .1;
    if (s.autoFit && !fits(result) && s.fontSize > 5) {
      let min = Math.min(s.fontSize,Math.max(5,s.nameAccentEnabled?5*s.fontSize/s.nameFontSize:5)), max = s.fontSize;
      result = measure(min);
      if (fits(result)) {
        for (let i = 0; i < 13; i++) { const mid = (min + max) / 2, probe = measure(mid); if (fits(probe)) min = mid; else max = mid; }
        result = measure(Math.floor(min * 100) / 100);
      }
    }
    setCanvasFont(ctx, result.pt, scale,s);
    return {...result, box, scale, overflow: !fits(result), unknownTokens: /\{[^{}]+\}/.test(content), empty: !content.trim(), reduced: result.pt < s.fontSize - .05};
  }
  function drawCard(guest, canvas, width = 1240, mode='composite') {
    if(mode==='blank'){guest={name:'',gender:'neutral',email:'',__blank:true};mode='composite';}
    if (canvas.width !== width) canvas.width = width;
    const size=cardSize(),height = Math.round(width * size.height / size.width);
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if(mode==='text')ctx.clearRect(0,0,width,height);else{ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);}
    if(state.settings.templatePreset!=='original'&&mode!=='foil'&&mode!=='text'){
      const pxPerMm=width/size.width;ctx.fillStyle='#fffcf6';ctx.fillRect(0,0,width,height);
      if(state.settings.templatePreset==='frame'){ctx.strokeStyle='#91729f';ctx.lineWidth=pxPerMm*.3;ctx.strokeRect(pxPerMm*4,pxPerMm*4,width-pxPerMm*8,height-pxPerMm*8);}
    }else if (background && mode!=='foil'&&mode!=='text') {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const fit = state.settings.backgroundFit;
      if (fit === 'stretch') ctx.drawImage(background, 0, 0, width, height);
      else {
        const factor = (fit === 'cover' ? Math.max : Math.min)(width / background.width, height / background.height);
        const w = background.width * factor, h = background.height * factor;
        ctx.drawImage(background, (width - w) / 2, (height - h) / 2, w, h);
      }
    }
    if(state.settings.templatePreset!=='original'&&mode!=='foil'&&mode!=='background'){
      const pxPerMm=width/size.width;ctx.save();ctx.fillStyle='#705580';ctx.textAlign='center';ctx.textBaseline='top';let pt=Math.max(12,Math.min(24,size.height*.085));setCanvasFont(ctx,pt,pxPerMm*25.4/72,{fontFamily:'Georgia',fontBold:false,fontItalic:false});while(ctx.measureText(eventTitle()).width>width*.86&&pt>6){pt-=.5;setCanvasFont(ctx,pt,pxPerMm*25.4/72,{fontFamily:'Georgia',fontBold:false,fontItalic:false});}ctx.fillText(eventTitle(),width/2,height*.055);ctx.restore();
    }
    if(mode==='background')return{results:[],pt:state.settings.fontSize,overflow:false,unknownTokens:false,empty:false,reduced:false};
    if (!guest) return null;
    storeActiveBlock(); const results=[];
    for(const block of state.blocks||[]) {
      if(!block.blockVisible) continue;
      const s={...state.settings,...block}, result=layoutText(ctx,guest,width,height,s), b=result.box;
      results.push({...result,id:block.id,label:block.label});
      if((mode==='foil'&&!block.foil)||(mode==='base'&&block.foil)) continue;
      const extra=Math.max(0,b.h-result.totalHeight), top=b.y+(s.verticalAlign==='middle'?extra/2:s.verticalAlign==='bottom'?extra:0);
      ctx.save(); ctx.beginPath(); ctx.rect(b.x,b.y,b.w,b.h); ctx.clip();
      ctx.textAlign='left';ctx.textBaseline='alphabetic';let rowTop=top;
      for(const row of result.richLines){
        let x=s.textAlign==='center'?b.x+(b.w-row.width)/2:s.textAlign==='right'?b.x+b.w-result.padding-row.width:b.x+result.padding;
        const baseline=rowTop+row.ascent;
        for(const run of row.runs){
          const color=run.accent?s.nameTextColor:s.textColor,fill=run.accent?s.nameTextFill:s.textFill,second=run.accent?s.nameGradientColor:s.gradientColor,angle=run.accent?s.nameGradientAngle:s.gradientAngle;
          if(run.accent&&s.nameHighlight&&mode!=='foil'){ctx.fillStyle=s.nameHighlightColor;ctx.fillRect(x,baseline-run.ascent,run.width,run.ascent+run.descent);}
          ctx.fillStyle=mode==='foil'?'#000000':color;
          if(mode!=='foil'&&fill==='gradient'){const a=angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),rw=run.accent?run.width:b.w,rh=run.accent?row.height:b.h,cx=run.accent?x+run.width/2:b.x+b.w/2,cy=run.accent?baseline+(run.descent-run.ascent)/2:b.y+b.h/2,half=(Math.abs(rw*dx)+Math.abs(rh*dy))/2;const gradient=ctx.createLinearGradient(cx-dx*half,cy-dy*half,cx+dx*half,cy+dy*half);gradient.addColorStop(0,color);gradient.addColorStop(1,second);ctx.fillStyle=gradient;}
          setCanvasFont(ctx,run.pt,result.scale,run.accent?{...s,fontFamily:s.nameFontFamily,fontBold:s.nameFontBold,fontItalic:s.nameFontItalic}:s);
          if(run.blank){if(state.settings.blankLine){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(.6,result.scale*.5);ctx.beginPath();ctx.moveTo(x,baseline);ctx.lineTo(x+run.width,baseline);ctx.stroke();}}
          else if(run.spacing){let xx=x;for(const char of Array.from(run.text)){ctx.fillText(char,xx,baseline);xx+=canvasMetrics(ctx,char).width+run.spacing;}}
          else ctx.fillText(run.text,x,baseline);
          if(run.accent&&s.nameUnderline){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(.6,result.scale*.45);ctx.beginPath();ctx.moveTo(x,baseline+run.descent*.7);ctx.lineTo(x+run.width,baseline+run.descent*.7);ctx.stroke();}
          x+=run.width;
        }rowTop+=row.height;
      }ctx.restore();
    }
    return summarizeLayouts(results);
  }
  function summarizeLayouts(results) {
    return {results,pt:results.length?Math.min(...results.map(r=>r.minPt||r.pt)):state.settings.fontSize,overflow:results.some(r=>r.overflow),unknownTokens:results.some(r=>r.unknownTokens),empty:!results.length||results.every(r=>r.empty),reduced:results.some(r=>r.reduced)};
  }
  function measureCard(guest,ctx,width=1240) {
    const size=cardSize(),height=Math.round(width*size.height/size.width),results=[];storeActiveBlock();
    for(const block of state.blocks||[])if(block.blockVisible){const result=layoutText(ctx,guest,width,height,{...state.settings,...block});results.push({...result,id:block.id,label:block.label});}
    return summarizeLayouts(results);
  }
  function updateTextBox() {
    const s = state.settings, box = $('textBox');
    box.style.left = s.boxX + '%'; box.style.top = s.boxY + '%'; box.style.width = s.boxW + '%'; box.style.height = s.boxH + '%';
    box.hidden = !s.showGuides || $('previewMode')?.value==='background' || (!currentGuest()&&$('previewMode')?.value!=='blank');
    const outlines=$('blockOutlines');
    if(outlines) {
      outlines.replaceChildren();
      if(s.showGuides&&$('previewMode')?.value!=='background') for(const block of state.blocks||[]) if(block.id!==state.activeBlockId&&block.blockVisible) {
        const outline=document.createElement('button');outline.className='block-outline';outline.title=block.label;outline.setAttribute('aria-label','Выбрать блок '+block.label);
        Object.assign(outline.style,{left:block.boxX+'%',top:block.boxY+'%',width:block.boxW+'%',height:block.boxH+'%'});
        outline.textContent=block.label;outline.addEventListener('click',()=>selectBlock(block.id));outlines.append(outline);
      }
    }
    if($('textBoxLabel')) $('textBoxLabel').textContent=activeBlock()?.label||'Текст';
    renderGrid();
  }
  function scheduleRender() {
    storeActiveBlock();
    cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(renderPreview);
  }
  function renderPreview() {
    const guest = currentGuest(), result = drawCard(guest, $('previewCanvas'),1240,$('previewMode')?.value||'composite');
    updateFormatUI();
    if($('fontSizeHint')&&result?.pt)$('fontSizeHint').textContent=result.pt<11?'Самый мелкий печатный текст: '+result.pt.toFixed(1)+' пт. Для чтения лучше увеличить кегль или выбрать А5.':'Самый мелкий печатный текст: '+result.pt.toFixed(1)+' пт.';
    ['exportCurrent', 'quickCurrent'].forEach(id => { $(id).disabled = !guest?.name.trim(); });
    updateTextBox(); const blank=$('previewMode')?.value==='blank',backgroundOnly=$('previewMode')?.value==='background';$('previewEmpty').hidden = blank||backgroundOnly||!!guest;
    const index = state.guests.findIndex(g => g.id === guest?.id);
    $('previewGuestName').textContent = backgroundOnly?'Фон карточки':blank?'Бланк для заполнения':guest?.name || (guest ? 'Введите имя гостя' : 'Список гостей пуст');
    $('previewPosition').textContent = backgroundOnly?'Без добавленного текста':blank?'ФИО вписывается от руки':guest ? (index + 1) + ' из ' + state.guests.length + ' · ' + genderLabel(guest.gender).toLowerCase() : 'Добавьте гостей слева';
    $('prevGuest').disabled = blank||backgroundOnly||index <= 0; $('nextGuest').disabled = blank||backgroundOnly||index < 0 || index >= state.guests.length - 1;
    const status = $('layoutStatus'); status.className = 'preview-note';
    if(backgroundOnly)status.textContent='Печать фона без текстовых блоков';
    else if(blank)status.textContent=result?.overflow?'Текст бланка не помещается. Увеличьте рамку.':'Бланк: ФИО вписывается от руки';
    else if (!guest) status.textContent = '';
    else if (!guest.name.trim()) { status.textContent = 'Укажите ФИО перед сохранением открытки'; status.classList.add('error'); }
    else if (result.empty) { status.textContent = 'Текст приглашения пуст'; status.classList.add('error'); }
    else if (result.unknownTokens) { status.textContent = 'В тексте есть неизвестная переменная {…}'; status.classList.add('error'); }
    else if (result.overflow) { status.textContent = 'Текст не помещается. Увеличьте рамку или уменьшите шрифт.'; status.classList.add('error'); }
    else if (result.pt < 11) { status.textContent = 'Для печати мелко: ' + result.pt.toFixed(1) + ' пт. Попробуйте А5 или увеличьте кегль.'; status.classList.add('warning'); }
    else status.textContent = '✓ Текст помещается' + (result.reduced ? ' · шрифт уменьшен до ' + result.pt.toFixed(1) + ' пт' : ' · ' + result.pt.toFixed(1) + ' пт');
  }
  function validateGuest(guest, canvas, dpi=state.settings.exportDpi, mode='composite') {
    if (mode!=='background'&&!guest?.__blank && !guest?.name.trim()) throw new Error('Заполните ФИО у всех гостей или удалите пустые строки.');
    const result = drawCard(guest, canvas, Math.round(cardSize().width / 25.4 * dpi),mode);
    if (result.empty) throw new Error('Текст приглашения пуст. Добавьте его на вкладке «Текст».');
    if (result.unknownTokens) throw new Error('В тексте остались неизвестные переменные. Используйте {обращение}, {ФИО} и {мероприятие}.');
    if (result.overflow) { selectGuest(guest.id); const failed=result.results.find(r=>r.overflow);selectBlock(failed.id);throw new Error('Блок «'+failed.label+'» не помещается у гостя «'+guest.name+'». Увеличьте рамку или уменьшите шрифт.'); }
    return result;
  }
  function toBlob(canvas, mime, quality = .95) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось сохранить изображение.')), mime, quality));
  }
  async function withBusy(title, work) {
    if (busy) return;
    const dialogControls=Array.from(document.querySelectorAll('dialog[open] button,dialog[open] input,dialog[open] select,dialog[open] textarea')).filter(el=>!['advancedCancel','printCancelGeneration','cancelExport'].includes(el.id)).map(el=>({el,disabled:el.disabled}));dialogControls.forEach(({el})=>{el.disabled=true;});
    for(const id of ['advancedCancel','printCancelGeneration'])if($(id)){$(id).hidden=!$(id).closest('dialog')?.open;$(id).disabled=false;}
    busy = true; lockEditor(true); cancelRequested = false; $('busyTitle').textContent = title;
    $('busyDetail').textContent = 'Подготовка…'; $('busyProgress').value = 0;
    $('busyOverlay').hidden = false; document.body.classList.add('is-busy');
    if($('advancedStatus'))$('advancedStatus').textContent=title+'…';
    try { await pause(); await document.fonts.ready; await work();if($('advancedStatus'))$('advancedStatus').textContent='Готово.'; }
    catch (error) {if($('advancedStatus'))$('advancedStatus').textContent=error.message; if (error.message === 'Отменено') toast('Генерация отменена.'); else throw error; }
    finally { $('busyOverlay').hidden = true; document.body.classList.remove('is-busy'); busy = false; lockEditor(false);dialogControls.forEach(({el,disabled})=>{el.disabled=disabled;});for(const id of ['advancedCancel','printCancelGeneration'])if($(id))$(id).hidden=true; }
  }
  function progress(done, total, detail) {
    if (cancelRequested) throw new Error('Отменено');
    $('busyProgress').value = total ? done / total * 100 : 0; $('busyDetail').textContent = detail;
    if($('advancedStatus')&&$('advancedDialog')?.open)$('advancedStatus').textContent=detail;
  }
  async function exportCurrent() {
    await withBusy('Готовим открытку', async () => {
      const guest = currentGuest(), canvas = document.createElement('canvas');
      validateGuest(guest, canvas); const blob = await toBlob(canvas, state.settings.imageFormat);
      progress(1, 1, guest.name); download(blob, imageName(guest));
      toast('Открытка готова: ' + guest.name);
      activity('export_image','Одна открытка: '+guest.name);
    });
  }
  async function exportAll() {
    if (!state.guests.length) return;
    await withBusy('Собираем приглашения в ZIP', async () => {
      const files = [], canvas = document.createElement('canvas'), guests = state.guests;
      for (let i = 0; i < guests.length; i++) {
        progress(i, guests.length, (i + 1) + ' из ' + guests.length + ' · ' + guests[i].name);
        validateGuest(guests[i], canvas);
        files.push({name: imageName(guests[i]), blob: await toBlob(canvas, state.settings.imageFormat)});
        if (i % 4 === 0) await pause();
      }
      const archive = await InviteExport.zip(files, (done, total) => progress(done, total, 'Архив: ' + done + ' из ' + total));
      progress(1, 1, 'Готово'); download(archive, eventTitle() + ' _ Пригласительные.zip');
      toast('Готово: ' + files.length + ' открыток в одном архиве.');
      activity('export_images','Архив: '+files.length+' открыток');
    });
  }
  async function printPages(mode,dpi,guests=state.guests,onPage) {
    const layout=printGeometry(),pxPerMm=dpi/25.4,page=document.createElement('canvas'),card=document.createElement('canvas'),pages=[];
    page.width=Math.round(layout.pageWidth*pxPerMm);page.height=Math.round(layout.pageHeight*pxPerMm);const ctx=page.getContext('2d');
    try {
      for(let start=0;start<guests.length;start+=layout.capacity){
        ctx.fillStyle='#fff';ctx.fillRect(0,0,page.width,page.height);
        for(let slotIndex=0;slotIndex<layout.capacity&&start+slotIndex<guests.length;slotIndex++){
          const i=start+slotIndex,slot=layout.slots[slotIndex];progress(i,guests.length,(i+1)+' из '+guests.length+' · '+guests[i].name);
          validateGuest(guests[i],card,dpi,mode);ctx.save();
          if(slot.rotation===90){ctx.translate((slot.x+slot.width)*pxPerMm,slot.y*pxPerMm);ctx.rotate(Math.PI/2);ctx.drawImage(card,0,0,layout.cardWidth*layout.scale*pxPerMm,layout.cardHeight*layout.scale*pxPerMm);}
          else ctx.drawImage(card,slot.x*pxPerMm,slot.y*pxPerMm,slot.width*pxPerMm,slot.height*pxPerMm);
          ctx.restore();await pause();
        }
        window.InvitePrint.drawMarks(ctx,layout,pxPerMm,{cuts:state.settings.printGrid,registration:state.settings.registrationMarks&&state.settings.printMargin>=5});
        if(onPage)await onPage(page,layout,Math.floor(start/layout.capacity)+1);
        else pages.push(mode==='foil'?InviteExport.maskFromCanvas(page):{jpeg:await toBlob(page,'image/jpeg',.98),width:page.width,height:page.height});
      }
      pages.layout=layout;return pages;
    } finally {page.width=1;page.height=1;card.width=1;card.height=1;}
  }
  function pdfOptions(pages,title){return{title,pageWidth:pages.layout.pageWidth,pageHeight:pages.layout.pageHeight};}
  function createPrintAdapter({pdfDpi=200}={}){
    const scopeGuests=()=>state.settings.printScope==='blank'?blankGuests():state.settings.printScope==='current'?[currentGuest()||blankGuests()[0]]:state.guests.length?state.guests:state.settings.printLayer==='background'?blankGuests():[];
    const source=()=>{const layout=printGeometry(),guests=scopeGuests(),count=Math.ceil(guests.length/layout.capacity);return{title:eventTitle(),sheetCount:count,availableBack:false,side:'front',layer:({background:'inkjet',text:'laser'})[state.settings.printLayer]||'all',width:layout.pageWidth,height:layout.pageHeight,paperLabel:'листов '+layout.paperLabel,counts:Array.from({length:count},(_,i)=>Math.min(layout.capacity,guests.length-i*layout.capacity))};};
    const signature=()=>JSON.stringify(InvitationStudio.getProject());
    async function renderPage(data,pageInfo,pass,dpi){
      if(signature()!==data.signature)throw new Error('Проект изменился после подготовки. Настройте тираж заново, чтобы слои совпали.');
      const g=data.layout,scale=dpi/25.4,canvas=document.createElement('canvas'),card=document.createElement('canvas');canvas.width=Math.round(g.pageWidth*scale);canvas.height=Math.round(g.pageHeight*scale);const ctx=canvas.getContext('2d'),mode=({inkjet:'background',laser:'text'})[pass.layer]||'composite';
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(pass.profile.offsetX*scale,pass.profile.offsetY*scale);
      const start=pageInfo.sheetIndex*g.capacity;
      for(let i=0;i<g.capacity&&start+i<data.guests.length;i++){const guest=data.guests[start+i],slot=g.slots[i];validateGuest(guest,card,dpi,mode);ctx.save();if(slot.rotation===90){ctx.translate((slot.x+slot.width)*scale,slot.y*scale);ctx.rotate(Math.PI/2);ctx.drawImage(card,0,0,g.cardWidth*g.scale*scale,g.cardHeight*g.scale*scale);}else ctx.drawImage(card,slot.x*scale,slot.y*scale,slot.width*scale,slot.height*scale);ctx.restore();}
      if(mode!=='background')InvitePrint.drawMarks(ctx,g,scale,{cuts:data.project.settings.printGrid,registration:data.project.settings.registrationMarks&&data.project.settings.printMargin>=5});ctx.restore();card.width=1;card.height=1;return canvas;
    }
    return {describe:source,
      settingsElement:()=> $('invitationPrintSetup'),restoreSettings:restorePrintSettings,
      capture:async()=>{storeActiveBlock();await document.fonts.ready;const project=InvitationStudio.getProject(),guests=clone(scopeGuests()),layout=printGeometry();if(!guests.length)throw new Error('Добавьте гостей или выберите бланки под ручку.');return{project,guests,layout,signature:signature()};},
      preview:async(data,pass)=>{const canvas=await renderPage(data,pass.pages[0],pass,96);const blob=await toBlob(canvas,'image/png');canvas.width=1;canvas.height=1;return blob;},
      print:async(data,pass,context)=>{const job=InvitePrint.createJob({title:data.project.settings.eventName+' · '+pass.label});try{const g=data.layout,dpi=Math.min(200,Math.floor(25.4*Math.sqrt(90000000/(g.pageWidth*g.pageHeight*pass.pages.length))));if(dpi<96)throw new Error('Для этого пакета недостаточно памяти. Уменьшите число листов.');for(let i=0;i<pass.pages.length;i++){if(busy)progress(i,pass.pages.length,'Подготовка листа '+(i+1)+' из '+pass.pages.length+'…');context.status('Подготовка листа '+(i+1)+' из '+pass.pages.length+'…');const canvas=await renderPage(data,pass.pages[i],pass,dpi);await job.addPage(canvas,{mime:'image/png'});canvas.width=1;canvas.height=1;if(busy)progress(i+1,pass.pages.length,'Подготовлен лист '+(i+1)+' из '+pass.pages.length);await pause();}if(busy&&cancelRequested)throw new Error('Отменено');await job.print({pageWidth:g.pageWidth,pageHeight:g.pageHeight});activity('print_browser','Диалог печати: '+pass.label+', '+pass.pages.length+' стр.');}catch(e){job.close();throw e;}},
      pdf:async(data,pass,context)=>{const pages=[];for(let i=0;i<pass.pages.length;i++){if(busy)progress(i,pass.pages.length,'PDF: лист '+(i+1)+' из '+pass.pages.length+'…');context.status('PDF: лист '+(i+1)+' из '+pass.pages.length+'…');const canvas=await renderPage(data,pass.pages[i],pass,pdfDpi);pages.push({jpeg:await toBlob(canvas,'image/jpeg',.98),width:canvas.width,height:canvas.height});canvas.width=1;canvas.height=1;await pause();}if(busy)progress(1,1,'Сохраняем PDF…');const pdf=await InviteExport.pdf(pages,{title:data.project.settings.eventName+' · '+pass.label,pageWidth:data.layout.pageWidth,pageHeight:data.layout.pageHeight});if(busy&&cancelRequested)throw new Error('Отменено');download(pdf,eventTitle()+' _ '+pass.id+(pass.batchCount>1?' _ пакет '+pass.batch:'')+'.pdf');}
    };
  }
  function restorePrintSettings(element){
    const dialog=$('printDialog'),button=$('printNow');
    if(button)dialog.insertBefore(element,button);else dialog.append(element);
    const layerLabel=$('printLayer')?.closest('label');if(layerLabel)layerLabel.hidden=false;
  }
  function openPrintSettings(){
    if(busy||window.PrintCenter?.getState?.().open)return;
    restorePrintSettings($('invitationPrintSetup'));
    const dialog=$('printDialog');if(!dialog.open){dialog.showModal();dialog.scrollTop=0;}
  }
  function openPrintCenter(){
    if(busy)return;if(!window.PrintCenter)throw new Error('Не загружен мастер печати. Обновите все файлы приложения.');
    if($('printDialog').open)$('printDialog').close();
    PrintCenter.open(createPrintAdapter());
  }
  async function quickPrint(){
    if(busy)return;
    if(typeof window.PrintCenter?.quickPrint!=='function')throw new Error('Не загружен модуль печати. Обновите все файлы приложения.');
    if($('printDialog').open)$('printDialog').close();
    await withBusy('Подготовка печати…',async()=>{
      await PrintCenter.quickPrint(createPrintAdapter(),{onStatus:text=>{$('busyDetail').textContent=text;if($('printStatus'))$('printStatus').textContent=text;}});
      if($('printStatus'))$('printStatus').textContent='Системное окно печати открыто. Выберите принтер и нужное число экземпляров.';
    });
  }
  async function exportPDF() {
    if(busy)return;
    if(typeof window.PrintCenter?.quickPDF!=='function')throw new Error('Не загружен модуль PDF. Обновите все файлы приложения.');
    await withBusy('Готовим PDF для печати',async()=>{
      const result=await PrintCenter.quickPDF(createPrintAdapter({pdfDpi:state.settings.exportDpi}),{onStatus:text=>{$('busyDetail').textContent=text;}});
      toast('PDF подготовлен: '+result.pages+' стр.');
      activity('export_pdf',result.pages+' стр., '+({all:'весь макет',inkjet:'фон и цвет',laser:'текст'}[result.layer]||result.layer)+', '+cardSize().label);
    });
  }
  async function exportFoilKit(blanks = false) {
    blanks=blanks===true;
    storeActiveBlock();
    if(!state.blocks.some(block=>block.blockVisible&&block.foil&&block.textTemplate.trim())) throw new Error('Отметьте хотя бы один текстовый блок для фольгирования.');
    await withBusy('Формы для тонерного фольгирования',async()=>{
      const files=[],dpi=state.settings.foilDpi;
      for(const [mode,name,title] of [['base','01_Основа_без_фольги.pdf','Цветная основа без фольгируемых блоков'],['foil','02_Фольга_черный_тонер.pdf','Чёрная маска для лазерного принтера'],['composite','03_Контроль_совмещения.pdf','Контроль полного приглашения']]) {
        $('busyTitle').textContent=title;const pages=await printPages(mode,dpi,blanks?blankGuests():state.guests);progress(1,1,'Сохраняем '+name);await pause();
        files.push({name,blob:await InviteExport.pdf(pages,pdfOptions(pages,eventTitle()+' — '+title))});
      }
      const guide='ТОНЕРНОЕ ФОЛЬГИРОВАНИЕ\r\n\r\n01 — цветная основа без отмеченных блоков.\r\n02 — только отмеченные блоки: чёрно-белая маска 1 бит, '+dpi+' dpi, без JPEG.\r\n03 — контроль внешнего вида; не печатайте его как основу для фольги.\r\n\r\nВсе слои имеют одинаковый формат листа, позиции гостей и линии реза. Печатайте в фактическом размере 100%, без подгонки, с одной ориентацией и одинаковой подачей бумаги. Поля: '+state.settings.printMargin+' мм.\r\n\r\nПечатайте основу струйным способом либо защищайте от фольги остальные участки тонера. Фольга реагирует на весь открытый тонер, а не только на чёрную маску. Маску печатайте лазерным принтером, в чёрно-белом режиме, без экономии тонера.\r\n\r\nДля меток совмещения выберите поля 5 или 10 мм. Физический размер сохраняется, если не включено явное уменьшение. Сначала проверьте совмещение на одном листе; точность повторной подачи зависит от принтера. Затем используйте совместимую тонерную фольгу и режим ламинатора по инструкции производителя.\r\n';
      files.push({name:'Порядок_печати.txt',blob:new Blob(['\ufeff'+guide],{type:'text/plain;charset=utf-8'})});
      download(await InviteExport.zip(files,(done,total)=>progress(done,total,'Упаковка печатных форм')),eventTitle()+(blanks?' _ Бланки':'')+' _ Фольгирование.zip');
      toast('Подготовлены основа, чёрная маска и контрольный PDF.');
      activity(blanks?'export_blank_foil':'export_foil',blanks?state.settings.blankCount+' бланков':'Комплект для фольгирования');
    });
  }
  function blankGuests(){return Array.from({length:state.settings.blankCount},()=>({name:'Бланк для заполнения',email:'',gender:'neutral',__blank:true}));}
  async function exportBlankPDF(){
    await withBusy('Готовим бланки для заполнения от руки',async()=>{
      const pages=await printPages(state.settings.printLayer,state.settings.exportDpi,blankGuests());
      download(await InviteExport.pdf(pages,pdfOptions(pages,eventTitle()+' — бланки '+cardSize().label)),eventTitle()+' _ Бланки '+cardSize().label+'.pdf');
      activity('export_blanks',state.settings.blankCount+' бланков '+cardSize().label);toast('Готово: '+state.settings.blankCount+' бланков для заполнения от руки.');
    });
  }
  async function exportBlankPNG(){
    await withBusy('Готовим пустой бланк',async()=>{const canvas=document.createElement('canvas');validateGuest(blankGuests()[0],canvas);download(await toBlob(canvas,'image/png'),eventTitle()+' _ Бланк '+cardSize().label+'.png');activity('export_blank_image','Пустой бланк '+cardSize().label);});
  }
  async function checkAll() {
    const rows = [];
    await withBusy('Проверяем все приглашения', async () => {
      const canvas = document.createElement('canvas'),context=canvas.getContext('2d');
      for (let i = 0; i < state.guests.length; i++) {
        const guest = state.guests[i]; progress(i, state.guests.length, guest.name || 'Пустое ФИО');
        const result = measureCard(guest,context);
        const errors = [];
        if (!guest.name.trim()) errors.push('Не заполнено ФИО');
        if (result.overflow) errors.push('Текст не помещается');
        if (result.empty) errors.push('Текст пуст');
        if (result.unknownTokens) errors.push('Неизвестная переменная');
        const notes = [];
        if (guest.gender === 'neutral') notes.push('Нейтральное обращение');
        if (result.pt < 11) notes.push('Мелкий печатный шрифт: '+result.pt.toFixed(1)+' пт');
        rows.push({guest, errors, notes, pt: result.pt});
        if (i % 8 === 0) await pause();
      }
      progress(1, 1, 'Проверка завершена');
    });
    if (cancelRequested) return;
    const failed = rows.filter(r => r.errors.length).length;
    $('reportTitle').textContent = failed ? 'Нужно поправить ' + failed + ' приглашений' : 'Все приглашения помещаются';
    $('reportSummary').textContent = 'Проверено: ' + rows.length + '. ' + (failed ? 'Исправьте ошибки перед экспортом.' : 'Можно сохранять открытки и PDF.') + ' Нейтральных обращений: ' + rows.filter(r => r.guest.gender === 'neutral').length + '.';
    const list = $('reportList'); list.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('div'); item.className = 'report-row';
      const wrap = document.createElement('span'), name = document.createElement('span'), note = document.createElement('small');
      name.textContent = row.guest.name || 'Пустое ФИО'; if (row.errors.length) name.className = 'bad';
      note.textContent = (row.errors.length ? row.errors : ['✓ ' + row.pt.toFixed(1) + ' пт']).concat(row.notes).join(' · ');
      wrap.append(name, note);
      const open = document.createElement('button'); open.textContent = 'Открыть'; open.addEventListener('click', () => { $('reportDialog').close(); selectGuest(row.guest.id); });
      item.append(wrap, open); list.append(item);
    }
    $('reportDialog').showModal();
  }

  function confirmAction(title, message) {
    $('confirmTitle').textContent = title; $('confirmMessage').textContent = message; $('confirmDialog').showModal();
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function finishConfirm(value) { $('confirmDialog').close(); if (confirmResolve) { confirmResolve(value); confirmResolve = null; } }
  function parseImport() {
    importResult = GuestData.parse($('pasteGuests').value);
    const summary = $('importSummary'); summary.hidden = false;
    const counts={male:0,female:0,neutral:0};importResult.guests.forEach(guest=>{counts[guest.gender]+=1;});
    summary.textContent = 'Распознано гостей: ' + importResult.guests.length + '. Мужчин: '+counts.male+', женщин: '+counts.female+', проверить: '+counts.neutral+'.' + (importResult.warnings.length ? '\n' + importResult.warnings.slice(0, 5).join('\n') + (importResult.warnings.length > 5 ? '\n… и ещё ' + (importResult.warnings.length - 5) + ' замечаний.' : '') : '');
    $('applyImport').textContent = importResult.guests.length ? 'Импортировать: ' + importResult.guests.length : 'Проверить список';
    return importResult;
  }
  async function applyImport() {
    clearTimeout(importPreviewTimer);if (!importResult) parseImport();
    const result = importResult;
    if (!result.guests.length) { toast('Не найдено гостей. Проверьте список и разделители.', true); return; }
    const replacing = document.querySelector('input[name=importMode]:checked').value === 'replace';
    if (result.guests.length + (replacing ? 0 : state.guests.length) > 10000) throw new Error('В одном проекте поддерживается до 10 000 гостей.');
    if (replacing && state.guests.length && !await confirmAction('Заменить список гостей?', 'Текущий список будет заменён импортируемым. Сохраните проект в файл, если нужна копия.')) return;
    state.guests = replacing ? result.guests : state.guests.concat(result.guests);
    state.isSample = false; $('guestSearch').value = '';
    renderGuests(); selectGuest(result.guests[0].id); changed(); $('importDialog').close();
    toast('Добавлено гостей: ' + result.guests.length + (result.warnings.length ? '. Замечания были показаны при импорте.' : '.'));
    activity('import_guests','Импортировано '+result.guests.length+' гостей');
  }
  async function chooseTemplate(event) {
    const targetState=state,targetEpoch=projectEpoch;
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw new Error('Макет слишком большой. Максимум 20 МБ.');
    const data = await readDataURL(file);
    if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data)) throw new Error('Поддерживаются PNG, JPG и WebP.');
    const image = await loadImage(data);
    if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
    if (image.width * image.height > 50000000) throw new Error('Изображение слишком большое: уменьшите его до 50 мегапикселей.');
    background = image; state.template = data; state.templateName = file.name;state.settings.templatePreset='original';if($('templatePreset'))$('templatePreset').value='original';const size=cardSize();if(Math.abs((image.width/image.height)/(size.width/size.height)-1)>.03)state.settings.backgroundFit='contain';changed(); updateTemplateInfo(); scheduleRender();
    activity('template_import',file.name);
    toast('Новый макет загружен. Проверьте размещение текста.');
  }
  async function chooseFonts(event) {
    const targetState=state,targetEpoch=projectEpoch,targetBlockId=state.activeBlockId;
    const files = Array.from(event.target.files); event.target.value = '';
    for (const file of files) {
      if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
      if (state.fonts.length >= 30) throw new Error('В проект можно загрузить до 30 шрифтов.');
      if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { toast('Нужен TTF, OTF, WOFF или WOFF2: ' + file.name, true); continue; }
      if (file.size > 10 * 1024 * 1024) { toast('Шрифт больше 10 МБ: ' + file.name, true); continue; }
      const font = {id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), name: file.name.replace(/\.[^.]+$/, ''), data: await readDataURL(file)};
      if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
      try { if(!await installFont(font,targetState,targetEpoch))return; }
      catch (_) { if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;toast('Браузер не распознал шрифт: ' + file.name, true); continue; }
      if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
      state.fonts.push(font);const targetBlock=state.blocks.find(block=>block.id===targetBlockId);if(targetBlock)targetBlock.fontFamily=font.id;if(state.activeBlockId===targetBlockId)state.settings.fontFamily=font.id;changed();
      updateFontOptions(); renderFonts(); scheduleRender(); toast('Выбран шрифт ' + font.name);
      activity('font_import',font.name);
    }
  }
  function renderFonts() {
    const list = $('fontsList'); list.replaceChildren();
    if (!state.fonts.length) { const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Пока используются стандартные шрифты. Добавьте свой первый файл.'; note.style.marginBottom = '20px'; list.append(note); }
    for (const font of state.fonts) {
      const row = document.createElement('div'); row.className = 'font-row';
      const wrap = document.createElement('div'), name = document.createElement('strong'), specimen = document.createElement('small');
      name.textContent = font.name; specimen.textContent = 'Уважаемая Анна Сергеевна'; specimen.style.fontFamily = font.id;
      wrap.append(name, specimen);
      const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Удалить';
      remove.addEventListener('click', () => {
        if (state.settings.fontFamily === font.id) state.settings.fontFamily = 'Arial';
        if (fontFaces.has(font.id)) for(const face of fontFaces.get(font.id)) document.fonts.delete(face);
        fontFaces.delete(font.id);
        for(const block of state.blocks){if(block.fontFamily===font.id)block.fontFamily='Arial';if(block.nameFontFamily===font.id)block.nameFontFamily='Georgia';}
        if(state.settings.nameFontFamily===font.id)state.settings.nameFontFamily='Georgia';
        state.fonts = state.fonts.filter(f => f.id !== font.id); changed(); updateFontOptions(); renderFonts(); scheduleRender();
      });
      row.append(wrap, remove); list.append(row);
    }
  }
  function bindSettings() {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const input = $(key); if (!input) continue;
      if (key === 'fontBold' || key === 'fontItalic') {
        input.addEventListener('click', () => { state.settings[key] = !state.settings[key]; input.setAttribute('aria-pressed', String(state.settings[key])); changed(); scheduleRender(); });
        continue;
      }
      input.addEventListener(['cardWidth','cardHeight'].includes(key)||input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'color' ? 'change' : 'input', () => {
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'number') { if (!input.value || !Number.isFinite(input.valueAsNumber)) return; value = input.valueAsNumber; }
        if(['cardFormat','cardOrientation','cardWidth','cardHeight'].includes(key)){changeFormat(key,value);return;}
        if(['boxX','boxW'].includes(key))value=value/cardSize().width*100;
        if(['boxY','boxH'].includes(key))value=value/cardSize().height*100;
        if(key==='boxX')value=clamp(value,0,100-state.settings.boxW);
        if(key==='boxY')value=clamp(value,0,100-state.settings.boxH);
        state.settings = normalizeSettings({...state.settings, [key]: value});
        if (key.startsWith('box')) syncBoxFields();
        if(key==='textFill')$('gradientControls').hidden=value!=='gradient';
        if(key.startsWith('name'))updateAccentControls();
        if(key.startsWith('name')&&$('nameStylePreset'))$('nameStylePreset').value='none';
        if(key==='templatePreset'||key==='backgroundFit')updateTemplateInfo();
        if(key.startsWith('print')||key==='scaleTypeOnFormat')updateFormatUI();
        changed(true,input.tagName==='SELECT'||input.type==='checkbox'||input.type==='color'?'':'setting:'+key+':'+state.activeBlockId); scheduleRender();
      });
      if (input.type === 'number') input.addEventListener('blur', () => { if(key.startsWith('box'))syncBoxFields();else input.value = state.settings[key]; });
    }
  }
  function bindDragging() {
    const box = $('textBox'); let drag = null;
    box.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false || drag) return;
      const rect = $('paperStage').getBoundingClientRect();
      drag = {pointerId:event.pointerId,x: event.clientX, y: event.clientY, rect, settings: {...state.settings}, resize: event.target === $('resizeHandle')};
      historyGesture=true;if(history){history.breakMerge();updateHistoryControls();}
      box.setPointerCapture(event.pointerId); box.focus(); event.preventDefault();
    });
    box.addEventListener('pointermove', event => {
      if (!drag || event.pointerId!==drag.pointerId) return;
      const dx = (event.clientX - drag.x) / drag.rect.width * 100, dy = (event.clientY - drag.y) / drag.rect.height * 100;
      const s = state.settings, initial = drag.settings;
      const size=cardSize();if (drag.resize) { s.boxW = clamp(snapPercent(initial.boxW + dx,size.width), 5, 100 - s.boxX); s.boxH = clamp(snapPercent(initial.boxH + dy,size.height), 3, 100 - s.boxY); }
      else { s.boxX = clamp(snapPercent(initial.boxX + dx,size.width), 0, 100 - s.boxW); s.boxY = clamp(snapPercent(initial.boxY + dy,size.height), 0, 100 - s.boxH); }
      syncBoxFields();
      updateTextBox(); scheduleRender();
    });
    const finish = event => { if (drag && (event?.pointerId===undefined || event.pointerId===drag.pointerId)) { const pointerId=drag.pointerId;drag = null;historyGesture=false;if(box.hasPointerCapture(pointerId))box.releasePointerCapture(pointerId);changed(); } };
    box.addEventListener('pointerup', finish); box.addEventListener('pointercancel', finish); box.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')finish();});
    box.addEventListener('keydown', event => {
      const resize=event.target===$('resizeHandle');
      if(resize&&(event.key==='Enter'||event.key===' ')){event.preventDefault();document.querySelector('[data-tab="layout"]').click();$('boxW').focus();return;}
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const s = state.settings, step=event.altKey ? 0.1 : event.shiftKey ? 10 : s.snapGrid ? s.gridStep : 1;
      const size=cardSize();if (event.key === 'ArrowLeft') {if(resize)s.boxW=clamp(s.boxW-step/size.width*100,5,100-s.boxX);else s.boxX = clamp(s.boxX - step/size.width*100, 0, 100 - s.boxW);}
      if (event.key === 'ArrowRight') {if(resize)s.boxW=clamp(s.boxW+step/size.width*100,5,100-s.boxX);else s.boxX = clamp(s.boxX + step/size.width*100, 0, 100 - s.boxW);}
      if (event.key === 'ArrowUp') {if(resize)s.boxH=clamp(s.boxH-step/size.height*100,3,100-s.boxY);else s.boxY = clamp(s.boxY - step/size.height*100, 0, 100 - s.boxH);}
      if (event.key === 'ArrowDown') {if(resize)s.boxH=clamp(s.boxH+step/size.height*100,3,100-s.boxY);else s.boxY = clamp(s.boxY + step/size.height*100, 0, 100 - s.boxH);}
      const position=$('textBoxPosition');if(position){const mm=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:1});position.textContent=resize?'Размер: '+mm(s.boxW*size.width/100)+' на '+mm(s.boxH*size.height/100)+' мм.':'Положение: '+mm(s.boxX*size.width/100)+' мм слева, '+mm(s.boxY*size.height/100)+' мм сверху.';}
      syncControls(); changed(true,(resize?'resize:':'move:')+state.activeBlockId); scheduleRender();
    });
  }
  function bindEvents() {
    bindSettings(); bindDragging();bindBlockTools();bindHistory();
    document.querySelector('.brand:not([data-project-navigation])')?.addEventListener('click', event => { event.preventDefault(); window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); });
    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(button => { const active = button === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
      document.querySelectorAll('.tab-content').forEach(panel => { panel.hidden = panel.id !== 'tab-' + tab.dataset.tab; });
    }));
    const tabs = Array.from(document.querySelectorAll('.tab'));
    tabs.forEach((tab, index) => {
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        tabs[next].click(); tabs[next].focus();
      });
    });
    $('openProject').setAttribute('aria-label', 'Открыть проект'); $('saveProject').setAttribute('aria-label', 'Скачать проект');
    const uploadZone = document.querySelector('.upload-zone'); uploadZone.tabIndex = 0; uploadZone.setAttribute('role', 'button');
    uploadZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('templateFile').click(); } });
    document.querySelectorAll('dialog').forEach(dialog => {
      const heading = dialog.querySelector('h2'); if (!heading.id) heading.id = dialog.id + '-title'; dialog.setAttribute('aria-labelledby', heading.id);
      dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    });
    document.querySelectorAll('[data-token]').forEach(button => button.addEventListener('click', () => {
      const field = $('textTemplate'); field.setRangeText(button.dataset.token, field.selectionStart, field.selectionEnd, 'end'); field.focus(); field.dispatchEvent(new Event('input'));
    }));
    $('guestSearch').addEventListener('input', renderGuests);
    $('addGuest').addEventListener('click', () => {
      if (state.guests.length >= 10000) { toast('В одном проекте поддерживается до 10 000 гостей.', true); return; }
      const guest = GuestData.createGuest('', '', ''); guest.genderMode='auto';state.guests.push(guest); state.isSample = false;
      $('guestSearch').value = ''; renderGuests(); selectGuest(guest.id);changed(); $('guestName').focus();
    });
    for (const [id, key] of [['guestName','name'], ['guestGender','gender'], ['guestEmail','email']]) {
      $(id).addEventListener(id === 'guestGender' ? 'change' : 'input', () => {
        const guest = currentGuest(); if (!guest) return;const previous={name:guest.name,email:guest.email,gender:guest.gender};
        guest[key] = $(id).value.slice(0, key === 'name' ? 500 : 320); state.isSample = false;
        if(key==='gender')guest.genderMode='manual';
        if(key==='name'&&guest.genderMode==='auto')guest.gender=GuestData.inferGender(guest.name);
        changed(true,key==='gender'?'':'guest:'+guest.id+':'+key); updateEditedGuest(guest,previous); scheduleRender();
      });
    }
    $('guestGenderMode')?.addEventListener('change',()=>{const guest=currentGuest();if(!guest)return;guest.genderMode=$('guestGenderMode').value==='auto'?'auto':'manual';if(guest.genderMode==='auto')guest.gender=GuestData.inferGender(guest.name);changed();updateGuestGenderControls();renderGuests();scheduleRender();});
    $('detectGuestGender')?.addEventListener('click',()=>{const guest=currentGuest();if(!guest)return;guest.genderMode='auto';guest.gender=GuestData.inferGender(guest.name);changed();updateGuestGenderControls();renderGuests();scheduleRender();});
    $('detectAllGenders')?.addEventListener('click',()=>{let count=0;for(const guest of state.guests)if(guest.genderMode==='auto'){guest.gender=GuestData.inferGender(guest.name);count++;}if(count){changed();renderGuests();scheduleRender();}toast('Обновлено автоматических обращений: '+count+'. Ручной выбор сохранён.');activity('gender_detect','Обновлено '+count+' автоматических обращений');});
    $('deleteGuest').addEventListener('click', () => {
      const index = state.guests.findIndex(g => g.id === state.selectedId); state.guests.splice(index, 1); state.isSample = false;
      renderGuests(); selectGuest(state.guests[Math.min(index, state.guests.length - 1)]?.id || ''); changed();
    });
    $('clearGuests').addEventListener('click', safe(async () => {
      if (!state.guests.length || !await confirmAction('Очистить список?', 'Все гости будут удалены из текущего проекта. Можно предварительно сохранить проект или экспортировать список.')) return;
      state.guests = []; state.selectedId = ''; state.isSample = false; renderGuests(); selectGuest(''); changed();
    }));
    $('prevGuest').addEventListener('click', () => { const index = state.guests.findIndex(g => g.id === state.selectedId); if (index > 0) selectGuest(state.guests[index - 1].id); });
    $('nextGuest').addEventListener('click', () => { const index = state.guests.findIndex(g => g.id === state.selectedId); if (index < state.guests.length - 1) selectGuest(state.guests[index + 1].id); });
    $('exportCurrent').addEventListener('click', safe(exportCurrent)); $('exportAll').addEventListener('click', safe(exportAll)); $('exportPdf').addEventListener('click', safe(exportPDF)); $('checkAll').addEventListener('click', safe(checkAll));
    $('quickCurrent').addEventListener('click',safe(exportCurrent));$('quickPDF').addEventListener('click',safe(exportPDF));$('quickFoil').addEventListener('click',safe(exportFoilKit));
    $('printNow')?.addEventListener('click',safe(()=>quickPrint()));
    $('cancelExport').addEventListener('click', () => { cancelRequested = true; $('busyDetail').textContent = 'Отменяем…'; });
    for(const id of ['advancedCancel','printCancelGeneration'])$(id)?.addEventListener('click',()=>{cancelRequested=true;if($('printStatus'))$('printStatus').textContent='Отменяем подготовку…';if($('advancedStatus'))$('advancedStatus').textContent='Отменяем подготовку…';});
    $('reportClose').addEventListener('click', () => $('reportDialog').close());
    $('confirmNo').addEventListener('click', () => finishConfirm(false)); $('confirmYes').addEventListener('click', () => finishConfirm(true));
    $('confirmDialog').addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
    $('importGuests').addEventListener('click', () => { importResult = null; $('applyImport').textContent = 'Проверить список'; $('importSummary').hidden = true; $('importDialog').showModal(); });
    $('chooseGuestFile').addEventListener('click', () => $('guestFile').click());
    $('guestFile').addEventListener('change', safe(async event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw new Error('Список слишком большой: максимум 10 МБ.');
      const bytes = await file.arrayBuffer(); let contents = new TextDecoder('utf-8').decode(bytes);
      if (contents.includes('\ufffd')) { contents = new TextDecoder('windows-1251').decode(bytes); toast('Файл прочитан в кодировке Windows-1251.'); }
      $('pasteGuests').value = contents; parseImport();
    }));
    $('pasteGuests').addEventListener('input', () => { clearTimeout(importPreviewTimer);$('importSummary').hidden = true; importResult = null; $('applyImport').textContent = 'Импортировать';if($('pasteGuests').value.trim())importPreviewTimer=setTimeout(parseImport,180); });
    $('applyImport').addEventListener('click', safe(applyImport));
    $('sampleCsv').addEventListener('click', () => download(new Blob([GuestData.toCSV([GuestData.createGuest('Иванов Иван Иванович', 'male', 'ivan@example.ru'), GuestData.createGuest('Петрова Анна Сергеевна', 'female', 'anna@example.ru')])], {type: 'text/csv;charset=utf-8'}), 'Пример списка гостей.csv'));
    $('exportGuests').addEventListener('click', () => {
      const list = $('reportList'); list.replaceChildren(); $('reportTitle').textContent = 'Сохранить список гостей'; $('reportSummary').textContent = 'CSV открывается в Excel. JSON подходит для повторного импорта без изменений.';
      for (const [label, format] of [['Скачать CSV для Excel','csv'], ['Скачать JSON','json']]) {
        const button = document.createElement('button'); button.className = 'button outline full'; button.textContent = label;
        button.addEventListener('click', () => {download(new Blob([format === 'csv' ? GuestData.toCSV(state.guests) : GuestData.toJSON(state.guests)], {type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'}), eventTitle() + ' _ Гости.' + format);activity('export_guests',format.toUpperCase()+': '+state.guests.length+' гостей');}); list.append(button);
      }
      $('reportDialog').showModal();
    });
    $('templateFile').addEventListener('change', safe(chooseTemplate));
    $('restoreTemplate').addEventListener('click', safe(async () => {
      const targetState=state,targetEpoch=projectEpoch,image=await loadImage(window.DEFAULT_TEMPLATE);
      if(state!==targetState||projectEpoch!==targetEpoch||editorLocks>0)return;
      background=image; state.template = ''; state.templateName = 'День социолога · исходный макет';state.settings.templatePreset='original';if($('templatePreset'))$('templatePreset').value='original';changed(); updateTemplateInfo(); scheduleRender(); toast('Исходный макет восстановлен.');
    }));
    $('uploadFont').addEventListener('click', () => $('fontFile').click()); $('addFontInDialog').addEventListener('click', () => $('fontFile').click());
    $('fontFile').addEventListener('change', safe(chooseFonts));
    $('manageFonts').addEventListener('click', () => { renderFonts(); $('fontsDialog').showModal(); });
    $('centerBox').addEventListener('click', () => { state.settings.boxX = (100 - state.settings.boxW) / 2; syncControls(); changed(); scheduleRender(); });
    $('resetBox').addEventListener('click', () => { ['boxX','boxY','boxW','boxH'].forEach(key => { state.settings[key] = DEFAULT_SETTINGS[key]; }); syncControls(); changed(); scheduleRender(); });
    $('saveProject').addEventListener('click', () => {
      const project = {...clone(state), template: state.template || window.DEFAULT_TEMPLATE};
      download(new Blob([JSON.stringify(project)], {type: 'application/json;charset=utf-8'}), eventTitle() + ' _ Проект.json'); toast('Проект сохранён вместе с макетом, списком и шрифтами.');
      activity('export_project','Резервная копия JSON');
    });
    $('openProject').addEventListener('click', () => $('projectFile').click());
    $('projectFile').addEventListener('change', safe(async event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      if (file.size > 512 * 1024 * 1024) throw new Error('Проект слишком большой: максимум 512 МБ.');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (_) { throw new Error('Не удалось прочитать JSON проекта.'); }
      const project = normalizeProject(parsed);
      if(window.InvitationCloudUI?.beforeLocalImport){if(await window.InvitationCloudUI.beforeLocalImport(()=>activateProject(project))===false)return;}
      else {if (!await confirmAction('Открыть другой проект?', 'Текущий проект будет заменён данными из файла. Сохраните текущий проект, если нужна его копия.')) return;lockEditor(true);try{if(await saveLocal()===false)throw new Error('Браузер не сохранил текущий проект. Скачайте резервную копию перед открытием другого.');await activateProject(project);}finally{lockEditor(false);}}
      $('guestSearch').value = ''; renderGuests(); changed(); toast('Проект открыт.');
      activity('project_import',file.name);
    }));
    window.addEventListener('beforeunload', event => { if (dirty) { saveLocal(); event.preventDefault(); event.returnValue = ''; } });
  }

  async function initialize() {
    bindEvents();
    $('projectTitle')?.addEventListener('input',()=>setProjectTitle($('projectTitle').value));
    const saved = await readSaved(); let next = state, localRestored = false;
    if (saved) { try { next = normalizeProject(saved); localRestored = true; } catch (_) { toast('Сохранённый проект не прочитан. Открыт исходный макет.', true); } }
    if(!next.blocks) {
      next=normalizeProject(next);
      next.blocks=defaultBlocks(next.settings);next.activeBlockId=next.blocks[0].id;Object.assign(next.settings,Object.fromEntries(BLOCK_KEYS.map(key=>[key,next.blocks[0][key]])));
    }
    await activateProject(next); $('saveStatus').textContent = saved ? 'Восстановлено из браузера' : 'Новый проект';
    if(localRestored)await saveLocal();
    window.InvitationStudio = Object.freeze({
      getProject: () => {storeActiveBlock();return {...clone(state), template: state.template || window.DEFAULT_TEMPLATE};}, getProjectTitle: eventTitle, setProjectTitle,
      setProject: async (project, code) => {
        const normalized = normalizeProject(project); lockEditor(true);
        try { await activateProject(normalized); if (code !== undefined) setStorageScope(code); $('guestSearch').value = ''; renderGuests(); changed(false); await saveLocal(); }
        finally { lockEditor(false); }
      },
      restoreLocalProject: async () => {const saved=await readSaved(scopeForCode(''));const project=saved?normalizeProject(saved):createEmptyProject('Новое мероприятие');await activateProject(project);setStorageScope('');changed(false);return saveLocal();},
      openPrint:quickPrint, openPrintWizard:openPrintCenter, openPrintSettings, saveLocal, setStorageScope, lockEditor, createEmptyProject, confirm: confirmAction, notify: toast, hasLocalProject: localRestored, initialCloudBinding: clone(initialCloudBinding), initialLaunch:initialLaunch?clone(initialLaunch):null, launchMode
    });
    document.dispatchEvent(new CustomEvent('invitation:ready'));
  }
  initialize().catch(error => { console.error(error); toast('Не удалось запустить мастерскую: ' + error.message, true); $('saveStatus').textContent = 'Ошибка запуска'; });
})();
