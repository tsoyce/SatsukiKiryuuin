/* XSatsu Студия · окно «Шрифты»: выбор гарнитуры с превью и добавление шрифтов в проект.
 * Источники: встроенные, каталог Google Fonts (fonts/google-catalog.json; файлы — через server/src/Fonts.php),
 * шрифты этого компьютера (Local Font Access API, Chrome/Edge) и свои файлы TTF/OTF/WOFF/WOFF2.
 * Любой добавленный шрифт хранится в проекте байтами (doc.fonts) — одинаково для экрана, вёрстки и PDF. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const F = () => XS.Fonts;
  const TABS = [['project', 'font', 'В проекте'], ['google', 'globe', 'Google Fonts'], ['local', 'monitor', 'С компьютера'], ['file', 'upload', 'Из файла']];
  const CATS = [['', 'Все'], ['s', 'Без засечек'], ['r', 'С засечками'], ['d', 'Акцидентные'], ['h', 'Рукописные'], ['m', 'Моноширинные']];
  const PAGE = 60;
  const VARIANT_RU = {regular: 'обычный', bold: 'жирный', italic: 'курсив', bolditalic: 'жирный курсив'};

  let tab = 'project', opts = {}, query = '', cat = '', cyrOnly = true, shown = PAGE, sample = '';
  let localFonts = null; // [{family, faces: FontData[]}]
  const previewLinks = new Set();
  let observer = null;

  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const has = family => F().families(S.doc).some(f => f.family === family);

  /* opts: {value, onPick(family), allowEmpty: 'подпись пустого варианта', title} */
  function open(o = {}) {
    if (!S.doc) return;
    opts = o; query = ''; shown = PAGE;
    sample = o.sample || sampleText();
    tab = o.tab || 'project';
    ensureDialog();
    $('fpSearch').value = ''; $('fpSample').value = sample;
    $('fontsDialog').querySelector('h2').textContent = o.onPick ? 'Выбор шрифта' : 'Шрифты проекта';
    render();
    if (!$('fontsDialog').open) $('fontsDialog').showModal();
    setTimeout(() => $('fpSearch')?.focus(), 40);
  }
  /* Превью — текст выделенного элемента (с подставленной записью), иначе панграмма. */
  function sampleText() {
    const el = UI.selected?.()?.find(e => e.type === 'text');
    let t = el ? el.text : '';
    try { const row = S.doc.data.rows[S.row]; if (t && row) t = XS.Fields.fill(t, XS.Fields.context(S.doc, row, S.row)); } catch (e) { /* поля не важны для превью */ }
    t = String(t || '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    return t.length >= 3 ? t.slice(0, 60) : 'Съешь же ещё этих мягких французских булок';
  }

  function ensureDialog() {
    if ($('fontsDialog')) return;
    const d = h('dialog', 'dialog wide fonts-dialog'); d.id = 'fontsDialog';
    d.innerHTML = `<header class="dialog-head"><h2>Шрифты</h2><div id="fpTabs" class="tabs inline-tabs"></div><button class="btn icon" id="fpClose" type="button" aria-label="Закрыть">${XS.Icons.icon('close', 18)}</button></header>
      <div class="fp-bar"><label class="fp-search">${XS.Icons.icon('search', 15)}<input id="fpSearch" type="search" placeholder="Найти шрифт по названию" autocomplete="off"></label>
        <label class="fp-sample" title="Текст для превью">${XS.Icons.icon('text', 15)}<input id="fpSample" type="text" placeholder="Текст для превью"></label></div>
      <div id="fpFilters" class="fp-filters"></div>
      <div id="fpBody" class="dialog-body fp-body"></div>
      <footer class="dialog-foot"><span id="fpFoot" class="muted small"></span><span class="spacer"></span><button class="btn primary" id="fpDone" type="button">Готово</button></footer>`;
    document.body.append(d);
    const close = () => d.close();
    $('fpClose').onclick = close; $('fpDone').onclick = close;
    $('fpSearch').oninput = XS.debounce(() => { query = $('fpSearch').value; shown = PAGE; renderBody(); }, 120);
    $('fpSample').oninput = XS.debounce(() => { sample = $('fpSample').value || 'Аа Бб Вв'; d.querySelectorAll('.fp-sample-text').forEach(e => { e.textContent = sample; }); if (tab === 'google') { previewLinks.clear(); renderBody(); } }, 250);
    // Перетаскивание файлов шрифтов прямо в окно — на любой вкладке.
    d.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); d.classList.add('drop'); } });
    d.addEventListener('dragleave', e => { if (e.target === d) d.classList.remove('drop'); });
    d.addEventListener('drop', UI.safe(async e => { e.preventDefault(); d.classList.remove('drop'); const files = [...(e.dataTransfer?.files || [])]; if (files.length) await addFiles(files); }));
    XS.Icons.hydrate?.(d);
  }

  function render() {
    $('fpTabs').replaceChildren(...TABS.map(([id, icon, label]) => {
      const b = h('button', 'tab' + (id === tab ? ' active' : ''), XS.Icons.icon(icon, 15) + label); b.type = 'button';
      b.onclick = () => { tab = id; shown = PAGE; render(); };
      return b;
    }));
    $('fpSearch').closest('.fp-bar').hidden = tab === 'file';
    renderFilters(); renderBody();
  }
  function renderFilters() {
    const box = $('fpFilters'); box.replaceChildren(); box.hidden = tab !== 'google';
    if (tab !== 'google') return;
    for (const [id, label] of CATS) {
      const b = h('button', 'chip' + (id === cat ? ' on' : ''), label); b.type = 'button';
      b.onclick = () => { cat = id; shown = PAGE; renderFilters(); renderBody(); };
      box.append(b);
    }
    const l = h('label', 'check small'); const c = h('input'); c.type = 'checkbox'; c.checked = cyrOnly;
    c.onchange = () => { cyrOnly = c.checked; shown = PAGE; renderBody(); };
    l.append(c, document.createTextNode('только с кириллицей')); box.append(l);
  }
  function renderBody() {
    const body = $('fpBody');
    observer?.disconnect();
    ({project: renderProject, google: renderGoogle, local: renderLocal, file: renderFile})[tab](body);
  }
  function foot(text) { $('fpFoot').textContent = text || ''; }

  /* ---------- общая строка шрифта ---------- */
  function fontRow({family, meta, css, current, actions = [], onClick}) {
    const r = h('div', 'fp-row' + (current ? ' current' : '') + (onClick ? ' pickable' : ''));
    const main = h('div', 'fp-main');
    const name = h('div', 'fp-name'); name.textContent = family;
    const smp = h('div', 'fp-sample-text'); smp.textContent = sample;
    if (css) { name.style.fontFamily = css; smp.style.fontFamily = css; }
    main.append(name, smp);
    const m = h('div', 'fp-meta muted small'); m.innerHTML = meta || ''; main.append(m);
    const act = h('div', 'fp-actions'); act.append(...actions);
    r.append(main, act);
    if (onClick) { r.tabIndex = 0; r.onclick = e => { if (!e.target.closest('button, select, input')) onClick(); }; r.onkeydown = e => { if (e.key === 'Enter' && e.target === r) onClick(); }; }
    return r;
  }
  function btn(label, fn, cls = 'btn small') { const b = h('button', cls, label); b.type = 'button'; b.onclick = UI.safe(async e => { e.stopPropagation(); await fn(b); }); return b; }
  const cssFamily = name => '"' + String(name).replace(/["\\]/g, '') + '"';

  function pick(family) {
    if (!opts.onPick) return;
    opts.value = family;
    opts.onPick(family);
    $('fpBody').querySelectorAll('.fp-row.current').forEach(r => r.classList.remove('current'));
    $('fpBody').querySelector(`.fp-row[data-family="${CSS.escape(family)}"]`)?.classList.add('current');
    foot('Выбран «' + family + '».');
  }

  /* ---------- В проекте ---------- */
  function renderProject(body) {
    const q = norm(query);
    const list = F().families(S.doc).filter(f => !q || norm(f.family).includes(q));
    body.replaceChildren();
    if (opts.allowEmpty) {
      const r = fontRow({family: opts.allowEmpty, meta: 'гарнитура основного текста', current: !opts.value, onClick: () => pick('')});
      r.dataset.family = ''; r.querySelector('.fp-sample-text').remove(); body.append(r);
    }
    for (const f of list) {
      const user = f.source !== 'builtin';
      const count = F().usage(S.doc, f.family);
      const meta = XS.esc(f.category) + ' · ' + (user ? XS.esc(F().SOURCE[f.source] || 'загружен') + ' · ' : 'встроенный · ') +
        f.variants.map(v => VARIANT_RU[v]).join(', ') + (count ? ' · в макете: ' + count : '');
      const actions = [];
      if (opts.onPick) actions.push(btn(opts.value === f.family ? 'Выбран' : 'Выбрать', () => pick(f.family), 'btn small' + (opts.value === f.family ? '' : ' primary')));
      if (user) actions.push(btn(XS.Icons.icon('trash', 14), () => removeFamily(f.family), 'btn small ghost icon-only'));
      if (user) actions.at(-1).title = 'Убрать шрифт из проекта';
      const r = fontRow({family: f.family, meta, current: opts.onPick && opts.value === f.family, actions, onClick: opts.onPick ? () => pick(f.family) : null});
      r.dataset.family = f.family;
      body.append(r);
      // Превью встроенными/загруженными байтами (тот же файл, что уйдёт в PDF).
      F().ensure(S.doc, f.family, false, false).then(face => { if (face) { r.querySelector('.fp-name').style.fontFamily = face.css; r.querySelector('.fp-sample-text').style.fontFamily = face.css; } }).catch(() => {});
    }
    if (!list.length) body.append(h('p', 'muted', 'Ничего не найдено в проекте. Поищите в Google Fonts — там почти 300 семейств с кириллицей.'));
    const more = h('div', 'fp-more');
    more.append(btn(XS.Icons.icon('globe', 14) + 'Ещё шрифты: Google Fonts', () => { tab = 'google'; render(); }), btn(XS.Icons.icon('upload', 14) + 'Загрузить файл…', () => chooseFiles()));
    body.append(more);
    const nUser = new Set(S.doc.fonts.map(f => f.family)).size;
    foot('Встроенных: ' + F().BUILTIN.length + (nUser ? ' · добавлено в проект: ' + nUser : '') + '. Шрифты сохраняются внутри проекта и встраиваются в PDF.');
  }

  async function removeFamily(family) {
    const n = F().usage(S.doc, family);
    if (n && !confirm('Шрифт «' + family + '» используется в макете (элементов: ' + n + '). Убрать его? Эти тексты будут набраны шрифтом PT Sans.')) return;
    UI.edit(d => { d.fonts = d.fonts.filter(f => f.family !== family); });
    UI.refresh();
    renderBody();
    UI.toast('Шрифт «' + family + '» убран из проекта.');
  }

  /* ---------- Google Fonts ---------- */
  async function renderGoogle(body) {
    let list;
    try { list = await F().catalog(); }
    catch (e) { body.replaceChildren(h('p', 'note', 'Не удалось загрузить каталог Google Fonts: ' + XS.esc(e.message))); return; }
    if (tab !== 'google') return;
    const q = norm(query);
    const found = list.filter(f => (!cyrOnly || f.cyrillic) && (!cat || f.cat === cat) && (!q || norm(f.family).includes(q)))
      .sort((a, b) => q ? (norm(a.family).startsWith(q) ? 0 : 1) - (norm(b.family).startsWith(q) ? 0 : 1) : 0);
    body.replaceChildren();
    if (!XS.Api?.available) body.append(h('p', 'note warn', 'Сервер Студии недоступен: каталог можно смотреть, а добавить шрифт в проект получится, когда появится связь. Свой файл шрифта можно загрузить на вкладке «Из файла».'));
    const io = observer = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); loadPreview(en.target); }
    }, {root: body, rootMargin: '200px'});
    for (const f of found.slice(0, shown)) {
      const inProject = has(f.family);
      const meta = XS.esc(f.category) + ' · ' + (f.weights.length > 1 ? 'начертаний: ' + f.weights.length * (f.italic ? 2 : 1) : f.italic ? 'с курсивом' : 'одно начертание') +
        (f.cyrillic ? '' : ' · <b>без кириллицы</b>') + (inProject ? ' · <span class="ok">в проекте</span>' : '');
      const actions = [];
      let weightSel = null;
      if (f.weights.length > 1) {
        weightSel = h('select', 'fp-weight'); weightSel.title = 'Какое начертание считать обычным; жирное подберётся само';
        for (const w of f.weights) weightSel.add(new Option(w + ' · ' + F().WEIGHT_RU[w], w, false, w === 400 || (!f.weights.includes(400) && w === f.weights[0])));
        weightSel.onchange = () => { const r = weightSel.closest('.fp-row'); r.dataset.weight = weightSel.value; loadPreview(r, true); const go = r.querySelector('.fp-actions .btn.primary'); if (go && F().isBuiltin(f.family)) go.textContent = +weightSel.value === 400 ? (opts.onPick ? 'Выбрать' : 'Встроен') : opts.onPick ? 'Добавить и выбрать' : 'Добавить'; };
        actions.push(weightSel);
      }
      // Встроенный шрифт с обычной насыщенностью уже есть — скачивать нечего.
      const builtinNow = () => F().isBuiltin(f.family) && +(weightSel?.value || 400) === 400;
      actions.push(btn(builtinNow() ? (opts.onPick ? 'Выбрать' : 'Встроен') : opts.onPick ? 'Добавить и выбрать' : 'Добавить', async b => {
        if (builtinNow()) { pick(f.family); return; }
        const family = await addGoogle(f, +(weightSel?.value || 400), b);
        if (family) { pick(family); if (!opts.onPick) renderBody(); }
      }, 'btn small primary'));
      const r = fontRow({family: f.family, meta, actions, onClick: null});
      r.dataset.family = f.family; r.dataset.weight = weightSel?.value || 400;
      body.append(r); io.observe(r);
    }
    if (found.length > shown) {
      const more = btn('Показать ещё (' + (found.length - shown) + ')', () => { shown += PAGE * 2; renderBody(); }, 'btn');
      const wrap = h('div', 'fp-more'); wrap.append(more); body.append(wrap);
      new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { o.disconnect(); more.click(); } }, {root: body, rootMargin: '300px'}).observe(wrap);
    }
    if (!found.length) body.append(h('p', 'muted', 'Ничего не нашлось.' + (cyrOnly ? ' Попробуйте снять «только с кириллицей».' : '')));
    foot('Найдено: ' + found.length + ' из ' + list.length + '. Превью грузится с fonts.google.com; в проект шрифт сохраняется целиком и печатается без интернета.');
  }
  /* Превью названия и образца: крошечный CSS Google только с нужными буквами. */
  function loadPreview(row, force) {
    const family = row.dataset.family, weight = +row.dataset.weight || 400;
    const text = family + sample;
    const href = F().previewCss(family, text, weight);
    if (force || !previewLinks.has(href)) {
      previewLinks.add(href);
      const link = h('link'); link.rel = 'stylesheet'; link.href = href; link.dataset.fpPreview = '1';
      document.head.append(link);
    }
    const css = cssFamily(family) + ', var(--font-ui, sans-serif)';
    row.querySelector('.fp-name').style.fontFamily = css; row.querySelector('.fp-sample-text').style.fontFamily = css;
    row.querySelector('.fp-name').style.fontWeight = row.querySelector('.fp-sample-text').style.fontWeight = weight;
  }

  /* Скачивает начертания через сервер и кладёт их в проект. Возвращает имя семейства в проекте. */
  async function addGoogle(entry, base, button) {
    const plan = F().plan(entry, base);
    const label = button?.innerHTML;
    if (button) { button.disabled = true; button.textContent = 'Скачиваем…'; }
    try {
      const results = await Promise.allSettled(plan.files.map(f => F().fetchGoogle(entry.family, f.weight, f.italic)));
      const got = [];
      results.forEach((r, i) => { if (r.status === 'fulfilled') got.push({...plan.files[i], ...r.value}); });
      if (!got.some(g => g.variant === 'regular')) throw results.find(r => r.status === 'rejected')?.reason || new Error('Не удалось скачать шрифт.');
      const fonts = got.map(g => ({id: XS.uid('font'), family: plan.family, variant: g.variant, source: 'google', category: entry.cat,
        name: entry.family + ' ' + g.weight + (g.italic ? ' Italic' : ''), data: XS.bytesToDataUrl(g.bytes, g.mime)}));
      UI.edit(d => { d.fonts = d.fonts.filter(f => f.family !== plan.family).concat(fonts); });
      await F().ensure(S.doc, plan.family, false, false);
      UI.refresh();
      const kinds = got.map(g => VARIANT_RU[g.variant]).join(', ');
      UI.toast('Шрифт «' + plan.family + '» добавлен в проект: ' + kinds + '.');
      return plan.family;
    } finally { if (button && button.isConnected) { button.disabled = false; button.innerHTML = label; } }
  }

  /* ---------- шрифты компьютера ---------- */
  function renderLocal(body) {
    body.replaceChildren();
    if (!('queryLocalFonts' in global)) {
      body.append(h('p', 'note', 'Этот браузер не умеет отдавать сайтам шрифты компьютера. Откройте Студию в Chrome или Edge — или найдите файл шрифта (например, в <code>C:\\Windows\\Fonts</code>) и загрузите его на вкладке «Из файла».'));
      return;
    }
    if (!localFonts) {
      body.append(h('p', 'note', 'Студия покажет шрифты, установленные на этом компьютере (Arial, Times New Roman, фирменные шрифты вуза…). Браузер спросит разрешение один раз. В проект попадает копия файла шрифта — PDF будет одинаковым на любом компьютере.'));
      const go = btn(XS.Icons.icon('monitor', 15) + 'Показать шрифты компьютера', async () => {
        const all = await global.queryLocalFonts();
        const map = new Map();
        for (const fd of all) { if (!map.has(fd.family)) map.set(fd.family, []); map.get(fd.family).push(fd); }
        localFonts = [...map].map(([family, faces]) => ({family, faces})).sort((a, b) => a.family.localeCompare(b.family));
        if (!localFonts.length) UI.toast('Браузер не дал список шрифтов. Проверьте разрешение «Шрифты» для сайта.', true);
        renderBody();
      }, 'btn primary');
      body.append(go);
      return;
    }
    const q = norm(query);
    const found = localFonts.filter(f => !q || norm(f.family).includes(q));
    for (const f of found.slice(0, shown)) {
      const styles = f.faces.map(x => x.style).join(', ');
      const actions = [btn(has(f.family) ? 'Обновить в проекте' : opts.onPick ? 'Добавить и выбрать' : 'Добавить', async b => {
        const family = await addLocal(f, b);
        if (family) { pick(family); if (!opts.onPick) renderBody(); }
      }, 'btn small primary')];
      const r = fontRow({family: f.family, css: cssFamily(f.family), meta: XS.esc(styles) + (has(f.family) ? ' · <span class="ok">в проекте</span>' : ''), actions});
      r.dataset.family = f.family; body.append(r);
    }
    if (found.length > shown) { const wrap = h('div', 'fp-more'); wrap.append(btn('Показать ещё (' + (found.length - shown) + ')', () => { shown += PAGE * 2; renderBody(); }, 'btn')); body.append(wrap); }
    if (!found.length) body.append(h('p', 'muted', 'Ничего не нашлось.'));
    foot('Шрифтов на компьютере: ' + localFonts.length + '. Проверьте лицензию шрифта, если макет уходит в типографию.');
  }
  async function addLocal(entry, button) {
    if (button) { button.disabled = true; button.textContent = 'Читаем…'; }
    try {
      const picked = {};
      for (const fd of entry.faces) {
        let info, bytes;
        try { bytes = new Uint8Array(await (await fd.blob()).arrayBuffer()); info = F().inspect(bytes); } catch (e) { continue; }
        const st = String(fd.style).toLowerCase();
        const exact = /^(regular|normal|обычный|bold|italic|bold italic|oblique|bold oblique)$/.test(st);
        if (!picked[info.variant] || (exact && !picked[info.variant].exact)) picked[info.variant] = {bytes, info, exact, name: fd.fullName};
      }
      const variants = Object.keys(picked);
      if (!variants.length) throw new Error('Не удалось прочитать «' + entry.family + '» — возможно, это коллекция шрифтов (TTC). Загрузите отдельный файл TTF/OTF.');
      if (Object.values(picked).some(p => p.info.restricted)) UI.toast('Автор шрифта «' + entry.family + '» запретил встраивать его в документы — для печати в типографии лучше выбрать другой.', true);
      const fonts = variants.map(v => ({id: XS.uid('font'), family: entry.family, variant: v, source: 'local', name: picked[v].name, data: XS.bytesToDataUrl(picked[v].bytes, mimeOf(picked[v].bytes))}));
      UI.edit(d => { d.fonts = d.fonts.filter(f => f.family !== entry.family).concat(fonts); });
      await F().ensure(S.doc, entry.family, false, false);
      UI.refresh();
      UI.toast('Шрифт «' + entry.family + '» добавлен в проект: ' + variants.map(v => VARIANT_RU[v]).join(', ') + '.');
      return entry.family;
    } finally { if (button?.isConnected) { button.disabled = false; button.textContent = 'Обновить в проекте'; } }
  }
  function mimeOf(b) {
    const sig = String.fromCharCode(b[0], b[1], b[2], b[3]);
    return sig === 'OTTO' ? 'font/otf' : sig === 'wOFF' ? 'font/woff' : sig === 'wOF2' ? 'font/woff2' : 'font/ttf';
  }

  /* ---------- из файла ---------- */
  function renderFile(body) {
    body.replaceChildren();
    const drop = h('div', 'fp-drop');
    drop.innerHTML = XS.Icons.icon('upload', 28) + '<b>Перетащите сюда файлы шрифтов</b><span class="muted small">TTF, OTF, WOFF, WOFF2 — можно сразу несколько: обычный, жирный, курсив одного семейства соберутся вместе</span>';
    drop.append(btn('Выбрать файлы…', () => chooseFiles(), 'btn primary'));
    body.append(drop);
    body.append(h('p', 'note', 'Где взять шрифты с кириллицей: <a href="https://fonts.google.com/?subset=cyrillic" target="_blank" rel="noopener">Google Fonts</a> (уже есть на вкладке рядом), <a href="https://www.paratype.ru/collections/pt/44157" target="_blank" rel="noopener">ParaType (PT Sans, PT Serif…)</a>, <a href="https://fonts.adobe.com/" target="_blank" rel="noopener">Adobe Fonts</a>, фирменный стиль вашей организации. Проверяйте, что лицензия разрешает встраивание в PDF.'));
    foot('Шрифт копируется в проект и уходит в PDF вместе с ним.');
  }
  function chooseFiles() {
    const i = h('input'); i.type = 'file'; i.multiple = true; i.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    i.onchange = UI.safe(async () => { if (i.files.length) await addFiles([...i.files]); });
    i.click();
  }
  async function addFiles(files) {
    const added = [];
    for (const file of files) {
      if (!/\.(ttf|otf|woff2?)$/i.test(file.name) && !/^font\//.test(file.type)) { UI.toast('«' + file.name + '» — не файл шрифта.', true); continue; }
      try { added.push(await UI.addFont(file, {quiet: true})); } catch (e) { UI.toast(file.name + ': ' + e.message, true); }
    }
    if (!added.length) return;
    const families = [...new Set(added.map(a => a.family))];
    UI.toast('Добавлено в проект: ' + families.map(f => '«' + f + '»').join(', ') + '.');
    if (opts.onPick && families.length === 1) pick(families[0]);
    tab = 'project'; render();
  }

  UI.FontPicker = {open, addGoogle, addFiles};

  /* Кнопка-«выпадашка» гарнитуры для панели свойств: название набрано самим шрифтом. */
  UI.fontButton = function (value, set, {allowEmpty, placeholder, title} = {}) {
    const b = h('button', 'font-pick'); b.type = 'button'; b.title = title || 'Выбрать шрифт: встроенные, Google Fonts, с компьютера, из файла';
    const paint = v => {
      b.innerHTML = '<span class="fp-label"></span>' + XS.Icons.icon('chevronDown', 14);
      const l = b.firstChild; l.textContent = v || allowEmpty || placeholder || '—'; l.classList.toggle('muted', !v);
      if (v) F().ensure(S.doc, v, false, false).then(face => { if (face) l.style.fontFamily = face.css; }).catch(() => {});
    };
    paint(value);
    // Панель свойств могла перерисоваться, пока окно открыто (шрифт добавился в проект) — тогда рисуем её заново.
    b.onclick = () => open({value, allowEmpty, onPick: v => { value = v; set(v); if (b.isConnected) paint(v); else UI.Inspector?.render(); }});
    return b;
  };
})(typeof window !== 'undefined' ? window : globalThis);
