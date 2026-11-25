/* XSatsu Студия · состояние интерфейса и общие действия.
 * Все правки документа идут через UI.edit(): запись в историю → изменение → автосохранение → перерисовка. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const $ = id => document.getElementById(id);

  const S = {doc: null, side: 0, row: 0, sel: null, selectedRows: new Set(), zoom: 0, history: XS.History.create(), warnings: [], saving: Promise.resolve()};
  const UI = XS.UI = {S, $};

  /* ---------- сообщения ---------- */
  let toastTimer;
  UI.toast = (text, error = false) => {
    const t = $('toast');
    t.textContent = text; t.classList.toggle('error', !!error); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, error ? 7000 : 3500);
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
  UI.element = (id = S.sel) => UI.side().elements.find(e => e.id === id) || null;
  UI.fieldNames = () => {
    const cols = S.doc.data.columns.map(c => c.name);
    const extra = ['№', 'Обращение', 'Проект', 'Дата'].filter(n => !cols.some(c => XS.key(c) === XS.key(n)));
    return [...cols, ...extra];
  };

  /* ---------- правки ---------- */
  UI.edit = (fn, mergeKey = '', opts = {}) => {
    S.history.record(S.doc, mergeKey);
    fn(S.doc);
    UI.changed(opts);
  };
  UI.changed = (opts = {}) => {
    S.doc.updatedAt = new Date().toISOString();
    setSaveState('Изменения…');
    scheduleSave();
    UI.refresh(opts);
  };
  UI.refresh = (opts = {}) => {
    const skip = new Set(opts.skip || []);
    if (!S.doc) return;
    S.side = Math.min(S.side, S.doc.sides.length - 1);
    S.row = Math.max(0, Math.min(S.row, S.doc.data.rows.length - 1));
    if (S.sel && !UI.element()) S.sel = null;
    $('undoBtn').disabled = !S.history.canUndo; $('redoBtn').disabled = !S.history.canRedo;
    if (document.activeElement !== $('docTitle')) $('docTitle').value = S.doc.title;
    $('docKind').value = S.doc.kind;
    if (!skip.has('stage')) UI.Stage.render();
    if (!skip.has('layers')) UI.Layers.render();
    if (!skip.has('data')) UI.Data.render(opts);
    if (!skip.has('inspector')) UI.Inspector.render();
  };
  UI.select = id => { S.sel = id; UI.refresh({skip: ['data']}); };
  UI.setRow = i => { S.row = Math.max(0, Math.min(i, S.doc.data.rows.length - 1)); UI.refresh({skip: ['inspector']}); UI.Inspector.render(); };
  UI.setSide = i => { S.side = i; S.sel = null; UI.refresh({skip: ['data']}); };

  UI.undo = () => { const d = S.history.undo(S.doc); if (d) { S.doc = XS.Model.normalizeDoc(d); UI.changed(); } };
  UI.redo = () => { const d = S.history.redo(S.doc); if (d) { S.doc = XS.Model.normalizeDoc(d); UI.changed(); } };

  /* ---------- сохранение ---------- */
  function setSaveState(text, error = false) { const el = $('saveState'); el.textContent = text; el.classList.toggle('error', error); }
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
    try { await XS.Store.save(doc, thumb); if (doc === S.doc) setSaveState('Сохранено'); }
    catch (e) { setSaveState('Не сохранено', true); UI.toast('Не удалось сохранить в браузере: ' + e.message + ' Скачайте файл проекта.', true); }
  }
  const scheduleSave = XS.debounce(() => { S.saving = S.saving.then(save, save); }, 700);
  UI.flush = async () => { scheduleSave.flush(); await S.saving; };

  /* ---------- открыть / закрыть ---------- */
  UI.open = async doc => {
    XS.Model.pruneAssets(doc); // неиспользуемые файлы чистим только здесь: история отмен начинается заново
    await XS.Fonts.ensureForDoc(doc).catch(e => UI.toast(e.message, true));
    Object.assign(S, {doc, side: 0, row: Math.min(doc.data.current || 0, Math.max(0, doc.data.rows.length - 1)), sel: null, selectedRows: new Set(), zoom: 0});
    S.history.clear();
    $('home').hidden = true; $('editor').hidden = false;
    if (location.hash !== '#/doc/' + doc.id) history.replaceState(null, '', '#/doc/' + doc.id);
    document.title = doc.title + ' — XSatsu Студия';
    setSaveState('Сохранено');
    UI.refresh();
    requestAnimationFrame(() => UI.Stage.fit());
  };
  UI.create = async doc => { await XS.Store.save(doc, await thumbnail(doc)); await UI.open(doc); };
  UI.goHome = async () => {
    if (S.doc) { S.doc.data.current = S.row; await UI.flush(); }
    S.doc = null;
    $('editor').hidden = true; $('home').hidden = false;
    history.replaceState(null, '', '#/');
    document.title = 'XSatsu Студия';
    await UI.Home.render();
  };

  UI.saveFile = () => { XS.download(XS.Store.toFile(S.doc), XS.Zip.sanitizeFilename(S.doc.title) + '.xsatsu.json'); };
  UI.addFont = async file => {
    const data = await XS.readFileAsDataUrl(file);
    const info = XS.Fonts.inspect(XS.dataUrlToBytes(data).bytes);
    if (!info.cyrillic) UI.toast('В шрифте «' + info.family + '» нет кириллицы — русский текст будет пропадать.', true);
    UI.edit(doc => { doc.fonts = doc.fonts.filter(f => !(f.family === info.family && f.variant === info.variant)); doc.fonts.push({id: XS.uid('font'), family: info.family, variant: info.variant, name: file.name, data}); });
    await XS.Fonts.ensure(S.doc, info.family, info.variant.includes('bold'), info.variant.includes('italic'));
    UI.refresh();
    UI.toast('Шрифт «' + info.family + '» добавлен в проект.');
    return info;
  };
  /* Новый фон текущей стороны: картинка или PDF. */
  UI.setBackground = async (file, {resizePage} = {}) => {
    const a = await UI.busy('Загружаем ' + file.name + '…', () => XS.Assets.fromFile(file));
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

  global.addEventListener('beforeunload', e => { if ($('saveState').textContent !== 'Сохранено' && S.doc) { scheduleSave.flush(); e.preventDefault(); } });
})(typeof window !== 'undefined' ? window : globalThis);
