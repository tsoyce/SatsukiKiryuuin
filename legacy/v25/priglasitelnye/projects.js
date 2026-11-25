(function (global) {
  'use strict';
  const Library = global.ProjectLibrary, $ = id => document.getElementById(id);
  const list = $('projectList'), dialog = $('projectDialog'), form = $('projectForm');
  const bookmarkRoute = document.documentElement.dataset.bookmarkRoute || 'bookmarks.html';
  let items = [], bookmarkItems = [], diplomaItems = [], draftItem = null, serverItems = [], visible = 100, generation = 0, action = null, busy = false, serverAvailable = null, storageFilter='all';
  const typeName = type => ({bookmark:'Закладки',diploma:'Дипломы',invitation:'Пригласительные'}[type] || 'Проект');
  function text(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
  function feedback(message, error = false) { $('libraryStatus').textContent = message; $('libraryStatus').classList.toggle('library-error', error); }
  function serverFeedback(message, error = false) { $('serverStatus').textContent = message; $('serverStatus').classList.toggle('library-error', error); }
  function bookmarkHref(id) { const url = new URL(bookmarkRoute, location.href); url.searchParams.set('project', id); return url.href; }
  function storedActor() { try { return Library.getActor() || ''; } catch (_) { return ''; } }
  function actor() { return $('libraryActor').value.trim(); }
  function identityName(){const name=storedActor();$('identityNameSummary').textContent=name||'Не указано';global.dispatchEvent(new CustomEvent('studio:identity'));}
  function setActor(value) { const normalized = global.InviteCloud.normalizeActor(value); Library.setActor(normalized); $('libraryActor').value = normalized; identityName(); return normalized; }
  function render() {
    const query = $('projectSearch').value.trim().toLocaleLowerCase('ru'), type = $('projectType').value;
    items = [...bookmarkItems, ...diplomaItems, ...(draftItem ? [draftItem] : []), ...serverItems].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    const found = items.filter(item => (type === 'all' || item.type === type) && (storageFilter==='all'||(storageFilter==='server'?item.storage==='server':item.storage!=='server')) && (!query || item.title.toLocaleLowerCase('ru').includes(query)));
    $('homeAllCount').textContent=items.length;$('homeServerCount').textContent=serverAvailable===true&&actor()?serverItems.length:'—';$('homeServerCount').setAttribute('aria-label',serverAvailable===true&&actor()?'Проектов на хостинге: '+serverItems.length:'Количество проектов на хостинге пока неизвестно');$('homeBrowserCount').textContent=bookmarkItems.length+diplomaItems.length+(draftItem?1:0);
    $('homeProjectsHeading').textContent=storageFilter==='server'?'Проекты на хостинге':storageFilter==='browser'?'Проекты на устройстве':'Все проекты';
    const fragment = document.createDocumentFragment();
    for (const item of found.slice(0, visible)) {
      const row = text('li', '', 'library-row'), main = text('div', '', 'library-row-main');
      const link = text('button', item.title || 'Без названия', 'library-project-link'); link.type = 'button'; link.addEventListener('click', () => open(item)); main.append(link);
      const meta = text('div', '', 'library-row-meta'); meta.append(text('span', typeName(item.type)));
      meta.append(text('span', item.storage === 'server' ? (item.protected ? 'На хостинге · с кодом' : 'На хостинге · без кода') : 'В этом браузере', 'library-storage'));
      if (Number.isFinite(Date.parse(item.updatedAt))) { const time = text('time', new Intl.DateTimeFormat('ru', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}).format(new Date(item.updatedAt))); time.dateTime = new Date(item.updatedAt).toISOString(); meta.append(time); }
      main.append(meta); row.append(main);
      const controls = text('div', '', 'library-row-actions');
      for (const [label, mode] of [['Открыть','open'],['Переименовать','rename'],['Копия','copy']]) {
        if (item.storage === 'draft' && mode !== 'open') continue;
        const button = text('button', label, 'button quiet'); button.type = 'button'; button.setAttribute('aria-label', label + ': ' + item.title);
        button.addEventListener('click', () => mode === 'open' ? open(item) : showDialog(mode, item)); controls.append(button);
      }
      row.append(controls); fragment.append(row);
    }
    list.replaceChildren(fragment); $('showMoreProjects').hidden = found.length <= visible;
    $('libraryEmpty').hidden = found.length !== 0;
    const offline=storageFilter==='server'&&serverAvailable===false;
    $('emptyTitle').textContent = offline?'Нет связи с хостингом':query || type !== 'all' ? 'Проекты не найдены' : storageFilter==='server'&&!actor()?'Укажите имя для проектов на хостинге':'Здесь появятся ваши проекты';
    $('emptyText').textContent = offline?'Не удалось загрузить серверные проекты. Нажмите «Обновить» или откройте проекты на устройстве.':query || type !== 'all' ? 'Измените поиск или фильтры.' : storageFilter==='server'&&!actor()?'Откройте «Ваше имя» слева и сохраните подпись для истории.':'Нажмите «Новый проект» или выберите вид материала выше.';
    return {total:items.length, found:found.length};
  }
  async function refresh() {
    const ticket = ++generation; $('refreshProjects').disabled = true; feedback('Обновляем список…');
    const errors = [];
    const paint = () => { if (ticket === generation) { const count = render(); feedback(count.total ? 'Проектов: ' + count.total : 'Загрузка списка…'); } };
    // Local projects appear as soon as IndexedDB answers, independently of the network.
    const results = await Promise.allSettled([
      Library.listBookmarks().then(projects => { if (ticket !== generation) return; bookmarkItems = projects.map(item => ({...item, title:String(item.title || 'Без названия'), type:'bookmark', storage:'browser'})); paint(); }),
      Library.getInvitationLocalMeta().then(meta => { if (ticket !== generation) return; draftItem = meta ? {...meta,id:'local-invitation',title:String(meta.title || 'Черновик пригласительных'),type:'invitation',storage:'draft'} : null; paint(); }),
      Library.listInvitations(actor()).then(result => {
        if (ticket !== generation) return;
        const available = result.available === true; serverAvailable = available;
        if (dialog.open) updateDialog();
        serverItems = (result.projects || []).map(item => ({...item, title:String(item.title || 'Без названия'), type:'invitation', storage:'server'}));
        serverFeedback(available ? (actor() ? 'Проекты на хостинге доступны. Ваше имя записывается в историю.' : 'Укажите имя / login, чтобы открыть проекты на хостинге.') : (result.message || 'Хостинг недоступен. Проекты на устройстве можно открыть.'), !available && location.protocol !== 'file:'); paint();
      }),
      Library.listDiplomas().then(projects => { if (ticket !== generation) return; diplomaItems = projects.map(item => ({...item, title:String(item.title || 'Без названия'), type:'diploma', kind:'diploma', storage:'browser'})); paint(); })
    ]);
    if (ticket !== generation) return;
    if (results[0].status === 'rejected') errors.push('Не удалось прочитать закладки в браузере: ' + results[0].reason.message);
    if (results[1].status === 'rejected') errors.push('Не удалось прочитать черновик пригласительных: ' + results[1].reason.message);
    if (results[2].status === 'rejected') { serverItems = []; serverAvailable = false; if (dialog.open) updateDialog(); serverFeedback(results[2].reason.message || 'Не удалось загрузить список. Нажмите «Обновить».', true); }
    if (results[3].status === 'rejected') errors.push('Не удалось прочитать дипломы в браузере: ' + results[3].reason.message);
    const counts = render(); feedback(errors.length ? errors.join(' ') : (serverAvailable===false?'На устройстве: '+(bookmarkItems.length+diplomaItems.length+(draftItem?1:0))+'. Серверные проекты временно недоступны.':counts.total ? 'Проектов: ' + counts.total : 'Пока нет сохранённых проектов.'), !!errors.length);
    $('refreshProjects').disabled = false;
  }
  function open(item) {
    if (item.type === 'bookmark') { location.assign(bookmarkHref(item.id)); return; }
    if (item.type === 'diploma') { location.assign(Library.launchDiploma({id:item.id})); return; }
    if (item.storage === 'draft') { openLocal(); return; }
    if (item.protected || !actor()) showDialog('open', item);
    else { try { location.assign(Library.launchInvitation({id:item.id, actor:setActor(actor()), code:'', mode:'open'})); } catch (error) { feedback(error.message, true); } }
  }
  function openLocal() {
    const person = actor() || storedActor();
    // The editor can collect a name itself; navigation never depends on a server response.
    location.assign(Library.launchInvitation({mode:'local', actor:person}));
  }
  function showDialog(mode, item = null, kind = 'invitation') {
    action = {mode, item}; form.reset(); $('newProjectType').value = item?.type || kind;
    $('projectName').value = item ? (mode === 'copy' ? item.title + ' — копия' : item.title) : '';
    $('projectActor').value = actor() || storedActor(); $('protectProject').checked = mode === 'copy' && item?.protected === true;
    $('projectDialogError').hidden = true; $('newCode').removeAttribute('aria-invalid'); updateDialog(); dialog.showModal();
    (mode === 'open' ? ($('projectActor').value && item?.protected ? $('sourceCode') : $('projectActor')) : $('projectName')).focus();
    if (mode === 'rename') $('projectName').select();
  }
  function updateDialog() {
    const mode = action.mode, item = action.item, type = item?.type || $('newProjectType').value, server = type === 'invitation';
    $('dialogTitle').textContent = {new:'Новый проект', open:'Открыть проект', rename:'Переименовать проект', copy:'Создать копию'}[mode];
    $('submitProjectDialog').textContent = {new:'Создать', open:'Открыть', rename:'Сохранить название', copy:'Создать копию'}[mode];
    $('kindField').hidden = mode !== 'new'; $('titleField').hidden = mode === 'open'; $('projectName').required = mode !== 'open';
    $('serverFields').hidden = !server; $('projectActor').required = server;
    $('sourceCodeField').hidden = !server || !item?.protected; $('sourceCode').required = server && !!item?.protected;
    $('newCodeFields').hidden = !server || !['new','copy'].includes(mode);
    const needsCode = server && ['new','copy'].includes(mode) && $('protectProject').checked;
    $('newCodeField').hidden = !needsCode; $('newCode').required = needsCode;
    $('dialogLocalInvitation').hidden = !server || mode !== 'new';
    $('dialogNote').textContent = server ? (mode === 'copy' && item?.protected ? 'Для открытия нужен код исходного проекта. Для копии выберите другой код или снимите защиту явно.' : (mode === 'new' ? (serverAvailable === false ? 'Хостинг недоступен. Для нового серверного проекта повторите позже. Можно открыть черновик в этом браузере.' : 'Новый проект будет сохраняться на хостинге автоматически.') : 'Изменения сохранятся на хостинге.')) : (type === 'diploma' ? 'Проект дипломов сохраняется на этом устройстве автоматически.' : 'Проект закладок сохраняется на этом устройстве автоматически.');
  }
  function setBusy(value) { busy = value; dialog.setAttribute('aria-busy', String(value)); for (const el of form.elements) el.disabled = value; }
  function closeDialog() { if (!busy) dialog.close(); }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    $('projectDialogError').hidden = true;
    const {mode,item} = action, type = item?.type || $('newProjectType').value, title = $('projectName').value.trim();
    let person = '', code = $('sourceCode').value.trim(), newCode = $('protectProject').checked ? $('newCode').value.trim() : '', errorField = null;
    try {
      if (mode !== 'open' && !title) throw new Error('Укажите название проекта.');
      if (type === 'invitation') person = setActor($('projectActor').value);
      if (type === 'invitation' && ['new','copy'].includes(mode) && $('protectProject').checked && !newCode) {
        errorField = $('newCode'); errorField.setAttribute('aria-invalid', 'true');
        throw new Error('Введите код нового проекта. Код не может состоять только из пробелов.');
      }
      if (mode === 'copy' && item?.protected && newCode && newCode === code) throw new Error('Для новой копии выберите другой код. Код исходного проекта уже занят.');
      setBusy(true);
      if (type === 'bookmark') {
        if (mode === 'rename') await Library.renameBookmark(item.id,title);
        else { const project = mode === 'copy' ? await Library.copyBookmark(item.id,title) : await Library.createBookmark(title); location.assign(bookmarkHref(project.id)); return; }
      } else if (type === 'diploma') {
        if (mode === 'rename') await Library.renameDiploma(item.id,title);
        else { const project = mode === 'copy' ? await Library.copyDiploma(item.id,title) : await Library.createDiploma(title); location.assign(Library.launchDiploma({id:project.id})); return; }
      } else if (mode === 'open') { location.assign(Library.launchInvitation({id:item.id, actor:person, code, mode:'open'})); return; }
      else if (mode === 'new') {
        const probe = await global.InviteCloud.probe();
        serverAvailable = probe.available === true; updateDialog();
        if (!probe.available) throw new Error('Не удалось создать проект на хостинге. Повторите позже или нажмите «Открыть черновик в браузере».');
        location.assign(Library.launchInvitation({actor:person, code:newCode, mode:'new', title})); return;
      } else if (mode === 'rename') await Library.renameInvitation(item.id,{actor:person, code, title});
      else { const project = await Library.copyInvitation(item.id,{actor:person,code,title,newCode}); location.assign(Library.launchInvitation({id:project.id,actor:person,code:newCode,mode:'open'})); return; }
      setBusy(false); dialog.close(); await refresh();
    } catch (error) { setBusy(false); $('projectDialogError').textContent = error.message || 'Не удалось выполнить действие. Повторите попытку.'; $('projectDialogError').hidden = false; if (errorField) errorField.focus(); }
  });
  $('createProject').addEventListener('click', () => showDialog('new'));
  document.querySelectorAll('[data-create-type]').forEach(button=>button.addEventListener('click',()=>showDialog('new',null,button.dataset.createType)));
  document.querySelectorAll('[data-library-storage]').forEach(button=>button.addEventListener('click',()=>{storageFilter=button.dataset.libraryStorage;visible=100;document.querySelectorAll('[data-library-storage]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));const count=render();feedback('Найдено: '+count.found);}));
  $('closeProjectDialog').addEventListener('click', closeDialog); $('cancelProjectDialog').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('newProjectType').addEventListener('change', updateDialog); $('protectProject').addEventListener('change', updateDialog);
  $('newCode').addEventListener('input', () => $('newCode').removeAttribute('aria-invalid'));
  $('openDialogLocalInvitation').addEventListener('click', () => {
    if (busy) return;
    let person = '';
    try { person = setActor($('projectActor').value); } catch (_) { /* The editor can ask for a name. */ }
    try { location.assign(Library.launchInvitation({mode:'local', actor:person})); }
    catch (error) { $('projectDialogError').textContent = error.message || 'Не удалось открыть черновик.'; $('projectDialogError').hidden = false; }
  });
  $('identityForm').addEventListener('submit', event => { event.preventDefault(); try { setActor(actor()); if(matchMedia('(max-width:760px)').matches)$('identityPanel').open=false;refresh(); } catch (error) { serverFeedback(error.message,true); $('identityPanel').open=true;$('libraryActor').focus(); } });
  for (const id of ['projectSearch','projectType']) $(id).addEventListener(id === 'projectSearch' ? 'input' : 'change', () => { visible = 100; const count = render(); feedback('Найдено: ' + count.found); });
  $('showMoreProjects').addEventListener('click', () => { visible += 100; render(); });
  $('refreshProjects').addEventListener('click', refresh); $('openLocalInvitation').addEventListener('click', openLocal);
  global.addEventListener('pageshow', event => { if (event.persisted) { setBusy(false); dialog.close(); form.reset(); refresh(); } });
  let refreshedAt = Date.now();
  global.addEventListener('focus', () => { if (!dialog.open && Date.now() - refreshedAt > 3000) { refreshedAt=Date.now(); refresh(); } });
  function focusIdentity(){if(location.hash==='#identityForm'){$('identityPanel').open=true;$('libraryActor').focus({preventScroll:true});}}
  global.addEventListener('hashchange',focusIdentity);
  // Native fragment navigation may focus the form after deferred scripts run.
  global.addEventListener('pageshow',()=>{if(location.hash==='#identityForm')requestAnimationFrame(()=>requestAnimationFrame(focusIdentity));});
  document.querySelector('a[href="#identityForm"]')?.addEventListener('click',()=>{ $('identityPanel').open=true;requestAnimationFrame(()=>$('libraryActor').focus({preventScroll:true}));});
  $('libraryActor').value = storedActor();identityName();if(storedActor()&&matchMedia('(max-width:760px)').matches)$('identityPanel').open=false;focusIdentity();refresh();
})(window);
