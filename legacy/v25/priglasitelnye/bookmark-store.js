(function (global) {
  'use strict';

  const MAX_BYTES = 50 * 1024 * 1024, MAX_CARDS = 300, MAX_COPIES = 600;
  const DEFAULTS = Object.freeze({size:'safe',font:'montserrat',fontSize:10.5,minFontSize:9,nameSize:12,photoWidth:25,photoHeight:30,showPhoto:true,frame:true,footer:true,accent:'#000000',lineHeight:1.2,quoteAlign:'left',cuts:true,direction:'horizontal',design:'editorial',backgroundId:'',backgroundFit:'cover',backgroundOpacity:.18,backBackgroundId:'',backBackgroundFit:'cover',backBackgroundOpacity:1,backText:'С Днём социолога!',backTextColor:'#000000',backDesign:'match',printSide:'front',duplexFlip:'long',theme:'custom',backTemplate:'text',seriesGroup:0,ornamentStrength:.4,brandVisible:true,printLayer:'all',laserBlack:true});
  const commonOnly = new Set(['size','cuts','backgroundId','backgroundFit','backgroundOpacity','backBackgroundId','backBackgroundFit','backBackgroundOpacity','backText','backTextColor','backDesign','printSide','duplexFlip','theme','backTemplate','seriesGroup','ornamentStrength','brandVisible','printLayer','laserBlack']);
  const styleKeys = new Set(Object.keys(DEFAULTS).filter(key => !commonOnly.has(key)));
  // Image objects are immutable in normal editor snapshots. Checking the current
  // string against the cached value also detects a caller mutating an object.
  const checkedImages = new WeakMap();
  const counters = {assetReads:0,assetWrites:0,assetDeletes:0,projectWrites:0,listCalls:0,listProjectReads:0,migratedProjects:0};
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function fail(message) { throw new Error(message); }
  function identifier(value, label) {
    if (typeof value !== 'string' || !value || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) fail(label + ': неверный идентификатор.');
    return value;
  }
  function string(value, fallback, limit, label) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') fail(label + ': ожидается текст.');
    if (value.length > limit) fail(label + ': слишком длинный текст (максимум ' + limit + ' знаков).');
    return value;
  }
  function numeric(value, minimum, maximum, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(label + ': укажите число от ' + minimum + ' до ' + maximum + '.');
    return value;
  }
  function choice(value, choices, label) {
    if (!choices.includes(value)) fail(label + ': неизвестное значение.');
    return value;
  }
  function settings(value, partial) {
    if (value === undefined) return partial ? {} : {...DEFAULTS};
    if (!object(value)) fail('Настройки оформления должны быть объектом.');
    const out = partial ? {} : {...DEFAULTS};
    for (const key of Object.keys(value)) {
      if (!own(DEFAULTS, key) || (partial && !styleKeys.has(key))) fail('Неизвестная настройка оформления: ' + key + '.');
      const v = value[key];
      if (key === 'size') out[key] = choice(v, ['safe','full'], 'Размер закладки');
      else if (key === 'font') out[key] = choice(v, ['montserrat','compact'], 'Шрифт');
      else if (key === 'quoteAlign') out[key] = choice(v, ['left','center','right'], 'Выравнивание цитаты');
      else if (key === 'direction') out[key] = choice(v, ['horizontal','vertical'], 'Направление текста');
      else if (key === 'design') out[key] = choice(v, ['editorial','minimal','classic'], 'Оформление');
      else if (key === 'theme') out[key] = choice(v,['custom','frost','cards'],'Дизайн');
      else if (key === 'backTemplate') out[key] = choice(v,['text','department','series','ornament'],'Макет оборота');
      else if (key === 'seriesGroup') { out[key] = numeric(v,0,6,'Группа преподавателей'); if (!Number.isInteger(v)) fail('Группа преподавателей должна быть целым числом от 0 до 6.'); }
      else if (key === 'ornamentStrength') out[key] = numeric(v,0,1,'Насыщенность орнамента');
      else if (key === 'backgroundFit' || key === 'backBackgroundFit') out[key] = choice(v, ['cover','contain'], 'Размещение фона');
      else if (key === 'backgroundId' || key === 'backBackgroundId') out[key] = string(v,'',160,'Фоновое изображение');
      else if (key === 'backgroundOpacity' || key === 'backBackgroundOpacity') out[key] = numeric(v,0,1,'Непрозрачность фона');
      else if (key === 'backText') out[key] = string(v,'',500,'Текст на обороте');
      else if (key === 'backDesign') out[key] = choice(v,['plain','match'],'Оформление оборота');
      else if (key === 'printSide') out[key] = choice(v,['front','back','duplex'],'Сторона для печати');
      else if (key === 'duplexFlip') out[key] = choice(v,['long','short'],'Переворот листа');
      else if (key === 'printLayer') out[key] = choice(v,['all','inkjet','laser'],'Слой печати');
      else if (key === 'laserBlack') {
        if (typeof v !== 'boolean') fail('Чёрный цвет лазерного слоя должен быть включён или отключён.');
        out[key] = v;
      }
      else if (['showPhoto','frame','footer','cuts','brandVisible'].includes(key)) {
        if (typeof v !== 'boolean') fail('Настройка ' + key + ' должна быть включена или отключена.');
        out[key] = v;
      } else if (key === 'accent' || key === 'backTextColor') {
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) fail('Цвет акцента должен быть в формате #000000.');
        out[key] = v;
      } else {
        const ranges = {fontSize:[9,18],minFontSize:[9,18],nameSize:[9,20],photoWidth:[15,45],photoHeight:[15,45],lineHeight:[1,1.6]};
        out[key] = numeric(v, ...ranges[key], 'Настройка ' + key);
      }
    }
    if (!partial && out.minFontSize > out.fontSize) fail('Минимальный кегль не может быть больше основного.');
    if (partial && own(out,'minFontSize') && own(out,'fontSize') && out.minFontSize > out.fontSize) fail('Минимальный кегль карточки не может быть больше основного.');
    return out;
  }
  function newId(prefix) {
    const random = global.crypto && typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
    return (prefix || 'bookmark') + '-' + random;
  }
  function validate(value) {
    if (!object(value) || value.format !== 'bookmark-studio' || value.version !== 1) fail('Это не проект закладок поддерживаемой версии. Выберите JSON, сохранённый в разделе «Закладки».');
    const id = identifier(value.id, 'Проект');
    const title = string(value.title, 'Закладки ко Дню социолога', 240, 'Название проекта');
    if (!Array.isArray(value.cards) || value.cards.length > MAX_CARDS) fail('В проекте должно быть не больше ' + MAX_CARDS + ' карточек.');
    if (!Array.isArray(value.images) || value.images.length > 400) fail('В проекте должно быть не больше 400 фотографий.');
    const imageIds = new Set(), cardIds = new Set();
    const images = value.images.map((image, index) => {
      if (!object(image)) fail('Фотография ' + (index + 1) + ': неверная структура.');
      const imageId = identifier(image.id, 'Фотография ' + (index + 1));
      if (imageIds.has(imageId)) fail('В проекте повторяется идентификатор фотографии.');
      imageIds.add(imageId);
      const url = image.dataUrl;
      const cached = checkedImages.get(image);
      if (!cached || cached !== url) {
        if (typeof url === 'string' && url.length > MAX_BYTES) fail('Проект превышает 50 МБ. Уменьшите фотографии и повторите импорт.');
        if (typeof url !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url)) fail('Фотография ' + (index + 1) + ': поддерживаются встроенные PNG, JPEG и WebP.');
        if ((url.length-url.indexOf(',')-1) % 4 === 1) fail('Фотография ' + (index + 1) + ': повреждены данные изображения.');
        checkedImages.set(image,url);
      }
      const normalized = {id:imageId,name:string(image.name,'Фото ' + (index + 1),240,'Название фотографии'),dataUrl:url};
      checkedImages.set(normalized,url);
      return normalized;
    });
    let totalCopies = 0;
    const cards = value.cards.map((card, index) => {
      const label = 'Карточка ' + (index + 1);
      if (!object(card)) fail(label + ': неверная структура.');
      const cardId = identifier(card.id, label);
      if (cardIds.has(cardId)) fail('В проекте повторяется идентификатор карточки.');
      cardIds.add(cardId);
      const copies = card.copies === undefined ? 1 : numeric(card.copies,1,100,label + ', количество экземпляров');
      if (!Number.isInteger(copies)) fail(label + ': количество экземпляров должно быть целым.');
      totalCopies += copies;
      const photoId = string(card.photoId,'',160,label + ', фотография');
      if (photoId && !imageIds.has(photoId)) fail(label + ': связанная фотография отсутствует в проекте.');
      const crop = card.crop === undefined ? {x:50,y:50,zoom:1} : card.crop;
      if (!object(crop)) fail(label + ': неверные настройки кадрирования.');
      const normalized = {
        id:cardId,
        name:string(card.name,'',1000,label + ', имя'),
        quote:string(card.quote,'',10000,label + ', цитата'),
        photoId,copies,
        crop:{x:crop.x === undefined ? 50 : numeric(crop.x,0,100,label + ', кадр по горизонтали'),y:crop.y === undefined ? 50 : numeric(crop.y,0,100,label + ', кадр по вертикали'),zoom:crop.zoom === undefined ? 1 : numeric(crop.zoom,1,4,label + ', масштаб фото')},
        overrides:settings(card.overrides,true)
      };
      if (card.sourceName !== undefined) normalized.sourceName = string(card.sourceName,'',1000,label + ', исходное имя');
      if (card.sourceQuoteId !== undefined) normalized.sourceQuoteId = identifier(card.sourceQuoteId,label + ', исходная цитата');
      if (card.sourceImageName !== undefined) normalized.sourceImageName = string(card.sourceImageName,'',240,label + ', исходное изображение');
      if (card.review !== undefined) normalized.review = string(card.review,'',2000,label + ', примечание проверки');
      return normalized;
    });
    if (totalCopies > MAX_COPIES) fail('В одном проекте можно подготовить до ' + MAX_COPIES + ' экземпляров (100 листов А4). Уменьшите тираж.');
    const projectSettings = settings(value.settings,false);
    for (const key of ['backgroundId','backBackgroundId']) if (projectSettings[key] && !imageIds.has(projectSettings[key])) fail('Фоновое изображение отсутствует в проекте: ' + key + '.');
    cards.forEach((card,index) => {
      const merged = {...projectSettings,...card.overrides};
      if (merged.minFontSize > merged.fontSize) fail('Карточка ' + (index + 1) + ': минимальный кегль больше основного с учётом общих настроек.');
    });
    const warnings = value.warnings === undefined ? [] : value.warnings;
    if (!Array.isArray(warnings) || warnings.length > 1000) fail('Список замечаний проекта повреждён.');
    const normalizedWarnings = warnings.map(item => string(item,'',4000,'Замечание проекта'));
    const selectedId = typeof value.selectedId === 'string' && cardIds.has(value.selectedId) ? value.selectedId : (cards[0]?.id || '');
    const updatedAt = typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : new Date().toISOString();
    const normalized = {format:'bookmark-studio',version:1,id,title,cards,images,settings:projectSettings,selectedId,updatedAt,warnings:normalizedWarnings};
    // data URLs contain ASCII only and never need JSON escaping. Count them
    // directly; serialize only the small editable metadata, not megabytes of
    // unchanged photographs on every autosave.
    const metadata = {...normalized,images:images.map(image=>({...image,dataUrl:''}))};
    const bytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength + images.reduce((sum,image)=>sum+image.dataUrl.length,0);
    if (bytes > MAX_BYTES) fail('Проект превышает 50 МБ. Уменьшите фотографии и повторите импорт.');
    return normalized;
  }
  function create(seed) {
    const source = object(seed) ? seed : {};
    const value = validate({format:'bookmark-studio',version:1,id:newId('project'),title:source.title === undefined ? 'Закладки ко Дню социолога' : source.title,cards:source.cards || [],images:source.images || [],settings:source.settings,selectedId:source.selectedId,updatedAt:new Date().toISOString(),warnings:source.warnings});
    normalizeAuthors(value);
    return value;
  }
  // Name repair is limited to project entry points. Autosave and validation
  // retain exactly what the user is typing, including unfamiliar names.
  function normalizeAuthors(project) {
    const authors = global.BookmarkAuthors;
    const changes = authors?.normalizeCards(project.cards) || [];
    const warningsChanged = authors?.normalizeWarnings?.(project.warnings) || false;
    return changes.length > 0 || warningsChanged;
  }
  function storageError(error) {
    if (error && error.name === 'QuotaExceededError') return new Error('Не хватает места в браузере. Скачайте проект с фотографиями и освободите место. Последние изменения не сохранены.');
    return new Error('Браузер не сохранил проект. Скачайте резервную копию. ' + (error?.message || 'Проверьте, что хранение данных сайта разрешено.'));
  }
  const directory = (global.location?.pathname || '/').replace(/[^/]*$/, '');
  const databaseName = 'bookmark-studio-v1:' + directory;
  const lastKey = 'bookmark-studio-last-v1:' + directory;
  const metadataFor = project => ({id:project.id,title:project.title,updatedAt:project.updatedAt,cards:project.cards.length,totalCopies:project.cards.reduce((sum,card)=>sum+card.copies,0)});
  let dbPromise,assetCache=null;
  function database() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject) => {
      if (!global.indexedDB) { reject(new Error('Хранение проектов в этом браузере недоступно. Используйте экспорт проекта в JSON.')); return; }
      let request,settled=false,upgradeFailure=null,migrated=0;
      try { request = global.indexedDB.open(databaseName,2); } catch (error) { reject(storageError(error)); return; }
      request.onupgradeneeded = () => {
        const db=request.result,tx=request.transaction;
        tx.addEventListener('error',event=>{upgradeFailure=event.target.error||tx.error;});
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects',{keyPath:'id'});
        if (!db.objectStoreNames.contains('assets')) {const assets=db.createObjectStore('assets',{keyPath:'key'});assets.createIndex('projectId','projectId');}
        if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata',{keyPath:'id'});
        // Upgrade the existing database in one atomic versionchange transaction.
        // If storage refuses any new asset, IndexedDB restores all v1 records.
        const projects=tx.objectStore('projects'),assets=tx.objectStore('assets'),metadata=tx.objectStore('metadata'),cursor=projects.openCursor();
        cursor.onsuccess=()=>{
          try{
            const item=cursor.result;if(!item)return;const project=item.value;
            if(project.storageVersion!==2){
              for(const image of project.images||[])assets.put({key:[project.id,image.id],projectId:project.id,id:image.id,dataUrl:image.dataUrl});
              item.update({...project,images:(project.images||[]).map(image=>({id:image.id,name:image.name})),storageVersion:2,assetsVersion:newId('assets')});
              migrated++;
            }
            metadata.put(metadataFor(project));item.continue();
          }catch(error){upgradeFailure=error;tx.abort();}
        };
      };
      request.onsuccess = () => {
        const db = request.result;
        if(settled){db.close();return;}settled=true;
        counters.migratedProjects+=migrated;
        db.onversionchange = () => { db.close(); dbPromise = undefined;assetCache=null; };
        resolve(db);
      };
      request.onerror = () => {settled=true;reject(storageError(upgradeFailure||request.error));};
      request.onblocked = () => {settled=true;reject(new Error('Закройте другие вкладки редактора, чтобы открыть хранилище закладок.'));};
    }).catch(error => { dbPromise = undefined; throw error; });
    return dbPromise;
  }
  async function transaction(stores,mode,run) {
    const db = await database();
    return new Promise((resolve,reject) => {
      let tx, result;
      try {
        try { tx = db.transaction(stores,mode,mode === 'readwrite' ? {durability:'strict'} : undefined); }
        catch (_) { tx = db.transaction(stores,mode); }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(storageError(tx.error));
        tx.onabort = () => reject(storageError(tx.error));
        run(tx,value=>{result=value;},error=>{try{tx.abort();}catch(_){}reject(storageError(error));});
      } catch (error) { if (tx) try { tx.abort(); } catch (_) {} reject(storageError(error)); }
    });
  }
  async function list() {
    counters.listCalls++;
    const records=await transaction(['metadata'],'readonly',(tx,done)=>{const request=tx.objectStore('metadata').getAll();request.onsuccess=()=>done(request.result);});
    return (records||[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  async function load(id) {
    identifier(id,'Проект');
    // Read and repair the latest compact record under one write lock. A second
    // tab cannot have its newer edits replaced by a previously loaded snapshot.
    // Images and their assetsVersion are untouched by this metadata migration.
    const result=await transaction(['projects','assets'],'readwrite',(tx,done,abort)=>{
      const request=tx.objectStore('projects').get(id);
      request.onsuccess=()=>{
        try {
          const record=request.result;if(!record){done(null);return;}
          if(normalizeAuthors(record)){tx.objectStore('projects').put(record);counters.projectWrites++;}
          const images=[];let pending=record.images.length,missing=false;
          if(!pending){done({record,images});return;}
          record.images.forEach((image,index)=>{
            const asset=tx.objectStore('assets').get([id,image.id]);counters.assetReads++;
            asset.onsuccess=()=>{if(!asset.result)missing=true;else images[index]={...image,dataUrl:asset.result.dataUrl};if(!--pending)done({record,images,missing});};
          });
        } catch (error) { abort(error); }
      };
    });
    if(!result)return null;
    if(result.missing)fail('Не удалось загрузить фотографию из проекта. Не перезаписывайте проект; откройте резервную копию с фотографиями.');
    const value=validate({...result.record,images:result.images});
    assetCache={id,version:result.record.assetsVersion,images:new Map(value.images.map(image=>[image.id,image.dataUrl]))};
    return value;
  }
  async function rename(id, title) {
    identifier(id,'Проект');
    title = string(title,'',240,'Название проекта').trim();
    if (!title) fail('Введите название проекта.');
    // Read and update the current record in the same transaction. The catalogue
    // never loads photographs or writes an older snapshot over editor changes.
    return transaction(['projects','metadata'],'readwrite',(tx,done)=>{
      const projects=tx.objectStore('projects'),request=projects.get(id);
      request.onsuccess=()=>{
        const current=request.result;
        if(!current){done(null);return;}
        const updated={...current,title,updatedAt:new Date().toISOString()};
        projects.put(updated);counters.projectWrites++;
        const metadata=metadataFor(updated);tx.objectStore('metadata').put(metadata);done(metadata);
      };
    });
  }
  async function save(project) {
    const value = validate(project);
    value.updatedAt = new Date().toISOString();
    let storedVersion;
    await transaction(['projects','assets','metadata'],'readwrite',(tx,done)=>{
      const projects=tx.objectStore('projects'),assets=tx.objectStore('assets'),request=projects.get(value.id);
      request.onsuccess=()=>{
        const current=request.result,existing=new Set((current?.images||[]).map(image=>image.id)),retained=new Set(value.images.map(image=>image.id));
        const cached=assetCache?.id===value.id&&assetCache.version===current?.assetsVersion?assetCache:null;
        let changed=false,pending=0;
        const putAsset=image=>{assets.put({key:[value.id,image.id],projectId:value.id,id:image.id,dataUrl:image.dataUrl});counters.assetWrites++;changed=true;};
        const finish=()=>{
          storedVersion=changed||!current?newId('assets'):current.assetsVersion;
          projects.put({...value,images:value.images.map(image=>({id:image.id,name:image.name})),storageVersion:2,assetsVersion:storedVersion});counters.projectWrites++;
          tx.objectStore('metadata').put(metadataFor(value));done(value);
        };
        for(const id of existing)if(!retained.has(id)){assets.delete([value.id,id]);counters.assetDeletes++;changed=true;}
        for(const image of value.images){
          if(!existing.has(image.id)){putAsset(image);continue;}
          if(cached){if(cached.images.get(image.id)!==image.dataUrl)putAsset(image);continue;}
          // Another tab can change an asset with the same ID. Compare only after
          // the compact assetsVersion says our one-project cache is stale.
          pending++;const check=assets.get([value.id,image.id]);counters.assetReads++;
          check.onsuccess=()=>{if(check.result?.dataUrl!==image.dataUrl)putAsset(image);if(!--pending)finish();};
        }
        if(!pending)finish();
      };
    });
    assetCache={id:value.id,version:storedVersion,images:new Map(value.images.map(image=>[image.id,image.dataUrl]))};
    return value;
  }
  async function remove(id) {
    identifier(id,'Проект');
    await transaction(['projects','assets','metadata'],'readwrite',tx=>{
      tx.objectStore('projects').delete(id);tx.objectStore('metadata').delete(id);
      const cursor=tx.objectStore('assets').index('projectId').openCursor(global.IDBKeyRange.only(id));
      cursor.onsuccess=()=>{const item=cursor.result;if(item){item.delete();counters.assetDeletes++;item.continue();}};
    });
    if(assetCache?.id===id)assetCache=null;
    if (lastId() === id) setLastId('');
  }
  function lastId() { try { return global.localStorage.getItem(lastKey) || ''; } catch (_) { return ''; } }
  function setLastId(id) {
    if (id) identifier(id,'Проект');
    try { if (id) global.localStorage.setItem(lastKey,id); else global.localStorage.removeItem(lastKey); return true; } catch (_) { return false; }
  }
  async function importFile(file) {
    if (!file || typeof file.text !== 'function') fail('Выберите JSON-файл проекта закладок.');
    if (file.size > MAX_BYTES) fail('Файл проекта превышает 50 МБ.');
    let value;
    try { value = JSON.parse(await file.text()); } catch (_) { fail('Не удалось прочитать JSON. Выберите файл, сохранённый редактором закладок.'); }
    const project = validate(value);
    normalizeAuthors(project);
    return project;
  }
  global.BookmarkStore = Object.freeze({DEFAULTS,MAX_BYTES,MAX_CARDS,MAX_COPIES,newId,create,validate,list,load,save,rename,remove,lastId,setLastId,importFile,statistics:()=>({...counters}),resetStatistics:()=>{Object.keys(counters).forEach(key=>{counters[key]=0;});}});
})(window);
