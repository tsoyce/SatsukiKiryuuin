/* XSatsu Студия · состояние интерфейса и общие действия.
 * Все правки документа идут через UI.edit(): запись в историю → изменение → автосохранение → перерисовка. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const $ = id => document.getElementById(id);

  const S = {doc: null, side: 0, row: 0, selection: [], selectedRows: new Set(), zoom: 0, history: XS.History.create(), warnings: [], saving: Promise.resolve()};
  const UI = XS.UI = {S, $};

  /* ---------- сообщения ---------- */
  let toastTimer;
  UI.toast = (text, error = false) => {
    const t = $('toast');
    t.textContent = text; t.classList.toggle('error', !!error); t.classList.remove('leaving'); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => {
      if (UI.Motion?.reduced() !== false) { t.hidden = true; return; }
      t.classList.add('leaving'); toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('leaving'); }, 190);
    }, error ? 7000 : 3500);
  };
  UI.busyText = text => { $('busyText').textContent = text; };
  /* Проект открылся, но часть файлов (фон, картинки, шрифты) не пришла с сервера — говорим об этом прямо. */
  UI.warnMissingFiles = doc => {
    const m = doc && doc._missingFiles;
    if (!m || !m.length) return;
    UI.toast('Не загрузились файлы: ' + m.map(x => '«' + x.name + '»').join(', ') + '. ' + m[0].error + ' Откройте проект ещё раз позже — файлы на сервере не пропали.', true);
  };
  UI.busy = async (text, fn) => {
    $('busyText').textContent = text; $('busy').hidden = false;
    try { return await fn(); } finally { $('busy').hidden = true; }
  };
  /* Обёртка обработчиков: ошибки показываются пользователю, а не теряются в консоли. */
  UI.safe = fn => async (...args) => { try { return await fn(...args); } catch (e) { console.error(e); UI.toast(e.message || String(e), true); } };

  /* ---------- доступ к текущему ---------- */
  UI.side = () => S.doc.sides[S.side] || S.doc.sides[0];
  UI.row = () => S.doc.data.rows[S.row] || null;
  /* Один выделенный элемент (или по id). При нескольких выделенных — null: см. UI.selected(). */
  UI.element = id => (id === undefined ? (S.selection.length === 1 ? UI.side().elements.find(e => e.id === S.selection[0]) || null : null) : UI.side().elements.find(e => e.id === id) || null);
  UI.selected = () => { const set = new Set(S.selection); return UI.side().elements.filter(e => set.has(e.id)); };
  UI.fieldNames = () => {
    const cols = S.doc.data.columns.map(c => c.name);
    const extra = ['№', 'Обращение', 'Проект', 'Дата'].filter(n => !cols.some(c => XS.key(c) === XS.key(n)));
    return [...cols, ...extra];
  };

  /* ---------- правки ---------- */
  UI.edit = (fn, mergeKey = '', opts = {}) => {
    if (S.readOnly) { readOnlyNotice(); return; }
    S.history.record(S.doc, mergeKey);
    fn(S.doc);
    UI.changed(opts);
  };
  let roShown = 0;
  function readOnlyNotice() { if (Date.now() - roShown > 4000) { roShown = Date.now(); UI.toast('Только просмотр. Чтобы менять, сделайте копию: «Проект → Сделать копию».', true); } }
  UI.changed = (opts = {}) => {
    S.doc.updatedAt = new Date().toISOString();
    if (S.readOnly) { readOnlyNotice(); UI.refresh(opts); return; }
    setSaveState('Изменения…');
    scheduleSave();
    UI.refresh(opts);
    UI.Photos?.schedule(); // картинки по ссылкам — скачать в проект
  };
  UI.refresh = (opts = {}) => {
    const skip = new Set(opts.skip || []);
    if (!S.doc) return;
    S.side = Math.min(S.side, S.doc.sides.length - 1);
    S.row = Math.max(0, Math.min(S.row, S.doc.data.rows.length - 1));
    if (S.selection.length) { const have = new Set(UI.side().elements.map(e => e.id)); S.selection = S.selection.filter(id => have.has(id)); }
    $('undoBtn').disabled = !S.history.canUndo; $('redoBtn').disabled = !S.history.canRedo;
    if (document.activeElement !== $('docTitle')) $('docTitle').value = S.doc.title;
    $('docKind').value = S.doc.kind;
    if (!skip.has('stage')) UI.Stage.render();
    if (!skip.has('layers')) UI.Layers.render();
    if (!skip.has('data')) UI.Data.render(opts);
    if (!skip.has('inspector')) UI.Inspector.render();
  };
  /* mode: 'set' — заменить, 'toggle' — Shift/Ctrl-клик, 'add' — добавить. */
  UI.select = (list, mode = 'set') => {
    const arr = list == null ? [] : Array.isArray(list) ? list : [list];
    if (mode === 'set') S.selection = [...new Set(arr)];
    else if (mode === 'add') S.selection = [...new Set([...S.selection, ...arr])];
    else if (mode === 'toggle') { const all = arr.every(id => S.selection.includes(id)); S.selection = all ? S.selection.filter(id => !arr.includes(id)) : [...new Set([...S.selection, ...arr])]; }
    UI.refresh({skip: ['data']});
  };
  UI.setRow = i => { S.row = Math.max(0, Math.min(i, S.doc.data.rows.length - 1)); UI.refresh({skip: ['inspector']}); UI.Inspector.render(); };
  UI.setSide = i => { S.side = i; S.selection = []; UI.refresh({skip: ['data']}); };

  UI.undo = () => { const d = S.history.undo(S.doc); if (d) { S.doc = XS.Model.normalizeDoc(d); UI.changed(); } };
  UI.redo = () => { const d = S.history.redo(S.doc); if (d) { S.doc = XS.Model.normalizeDoc(d); UI.changed(); } };

  /* ---------- сохранение ---------- */
  function setSaveState(text, error = false) {
    const el = $('saveState');
    const remote = S.doc && XS.Store.where(S.doc.id) === 'remote';
    el.innerHTML = (S.readOnly ? XS.Icons.icon('eye', 14) : XS.Icons.icon(remote ? (error ? 'cloudOff' : 'cloud') : 'file', 14)) + '<span>' + XS.esc(S.readOnly ? 'Только просмотр' : text) + '</span>';
    el.title = S.readOnly ? 'Изменения не сохраняются' : remote ? 'Проект хранится на сервере, в вашем аккаунте' : 'Проект хранится только в этом браузере';
    el.dataset.state = text;
    el.classList.toggle('error', error);
  }
  UI.setSaveState = setSaveState;
  async function thumbnail(doc) {
    try {
      await XS.Fonts.ensureForDoc(doc);
      const scene = XS.Scene.build(doc, 0, doc.data.rows[0] || null, 0);
      const canvas = await XS.CanvasRender.toCanvas(scene, Math.min(40, 4000 / Math.max(doc.page.width, doc.page.height)));
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  }
  let thumbAt = 0;
  async function save() {
    const doc = S.doc;
    if (!doc) return;
    setSaveState('Сохранение…');
    const withThumb = Date.now() - thumbAt > 4000;
    const thumb = withThumb ? await thumbnail(doc) : '';
    if (withThumb) thumbAt = Date.now();
    try { await XS.Store.save(doc, thumb); if (doc === S.doc) { setSaveState('Сохранено'); retry.cancel(); } }
    catch (e) {
      if (e.status === 409 && UI.Account) { setSaveState('Конфликт', true); UI.Account.conflict(e); return; }
      if (e.offline || e.status >= 500 || e.status === 0) { setSaveState('Нет связи — повторим', true); retry(); return; }
      setSaveState('Не сохранено', true);
      UI.toast('Не удалось сохранить: ' + e.message + ' Скачайте файл проекта.', true);
    }
  }
  const scheduleSave = XS.debounce(() => { if (S.readOnly || !S.doc) return; S.saving = S.saving.then(save, save); }, 700);
  const retry = XS.debounce(() => scheduleSave(), 15000);
  UI.saveNow = async opts => { scheduleSave.cancel(); await S.saving; await XS.Store.save(S.doc, await thumbnail(S.doc), opts); setSaveState('Сохранено'); };
  UI.thumbnail = thumbnail;
  UI.flush = async () => { scheduleSave.flush(); await S.saving; };

  /* ---------- открыть / закрыть ---------- */
  UI.open = async (doc, {readOnly = false, link = ''} = {}) => {
    XS.Model.pruneAssets(doc); // неиспользуемые файлы чистим только здесь: история отмен начинается заново
    await XS.Fonts.ensureForDoc(doc).catch(e => UI.toast(e.message, true));
    Object.assign(S, {readOnly: readOnly || XS.Store.remote.meta.get(doc.id)?.permission === 'view', link, doc, side: 0, row: Math.min(doc.data.current || 0, Math.max(0, doc.data.rows.length - 1)), selection: [], selectedRows: new Set(), zoom: 0});
    S.history.clear();
    const entering = $('editor').hidden;
    $('home').hidden = true; $('editor').hidden = false;
    if (entering) UI.Motion?.screen($('editor'));
    UI.Mobile?.close();
    const hash = link ? '#/link/' + link : '#/doc/' + doc.id;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    document.body.classList.toggle('read-only', S.readOnly);
    document.title = doc.title + ' — XSatsu Студия';
    setSaveState('Сохранено');
    UI.refresh();
    requestAnimationFrame(() => UI.Stage.fit());
  };
  UI.create = async doc => { await XS.Store.create(doc, await thumbnail(doc)); await UI.open(doc); };
  UI.goHome = async () => {
    if (S.doc) { S.doc.data.current = S.row; await UI.flush(); }
    S.doc = null; S.readOnly = false; S.link = '';
    document.body.classList.remove('read-only');
    $('editor').hidden = true; $('home').hidden = false;
    UI.Mobile?.close();
    UI.Motion?.screen($('home'));
    history.replaceState(null, '', '#/');
    document.title = 'XSatsu Студия';
    await UI.Home.render();
  };

  UI.saveFile = () => { XS.download(XS.Store.toFile(S.doc), XS.Zip.sanitizeFilename(S.doc.title) + '.xsatsu.json'); };
  /* Свой файл шрифта (TTF/OTF/WOFF/WOFF2). Семейство и начертание берутся из самого файла. */
  UI.addFont = async (file, {quiet = false} = {}) => {
    const data = await XS.readFileAsDataUrl(file);
    const info = XS.Fonts.inspect(XS.dataUrlToBytes(data).bytes);
    if (!info.cyrillic) UI.toast('В шрифте «' + info.family + '» нет кириллицы — русский текст будет пропадать.', true);
    else if (info.restricted) UI.toast('Автор шрифта «' + info.family + '» запретил встраивать его в документы — проверьте лицензию перед печатью в типографии.', true);
    UI.edit(doc => { doc.fonts = doc.fonts.filter(f => !(f.family === info.family && f.variant === info.variant)); doc.fonts.push({id: XS.uid('font'), family: info.family, variant: info.variant, source: 'upload', name: file.name, data}); });
    await XS.Fonts.ensure(S.doc, info.family, info.variant.includes('bold'), info.variant.includes('italic'));
    UI.refresh();
    if (!quiet) UI.toast('Шрифт «' + info.family + '» добавлен в проект.');
    return info;
  };
  /* Новый фон текущей стороны: картинка или PDF. */
  UI.setBackground = async (file, {resizePage} = {}) => {
    const a = await UI.busy('Загружаем ' + file.name + '…', () => XS.Assets.fromFile(file, {maxPx: 8000}));
    const doc = S.doc;
    const first = !doc.sides.some(s => s.background);
    UI.edit(d => {
      const stored = XS.Model.addAsset(d, a);
      UI.side().background = {asset: stored.id, page: 1, fit: 'stretch', opacity: 1};
      const size = a.pages ? a.pages[0] : null;
      if (size && (resizePage || first) && (Math.abs(size.width - d.page.width) > 0.5 || Math.abs(size.height - d.page.height) > 0.5)) {
        d.page.width = +size.width.toFixed(2); d.page.height = +size.height.toFixed(2);
        UI.toast('Размер макета взят из PDF: ' + Math.round(size.width) + '×' + Math.round(size.height) + ' мм.');
      }
      if (a.pages && a.pages.length > 1 && d.sides.length === 1) {
        const back = XS.Model.side('back', 'Оборот');
        back.background = {asset: stored.id, page: 2, fit: 'stretch', opacity: 1};
        d.sides.push(back);
        UI.toast('В PDF ' + a.pages.length + ' стр.: страница 2 стала оборотом. Номер страницы можно поменять справа.');
      }
    });
    UI.Stage.fit();
  };

  global.addEventListener('beforeunload', e => { if (S.doc && !S.readOnly && $('saveState').dataset.state !== 'Сохранено') { scheduleSave.flush(); e.preventDefault(); } });
})(typeof window !== 'undefined' ? window : globalThis);
