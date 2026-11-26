/* XSatsu Студия · фото для записей пачкой и картинки по ссылкам.
 * Окно «Фото для записей»: перетащить много фотографий или ZIP-архив → Студия раскладывает их по записям
 * (по ФИО, фамилии с инициалами, транслиту, номеру записи или имени файла из таблицы), всё видно и поправимо до применения.
 * Фоновая загрузка картинок по ссылкам (XS.RemoteImages): ссылка в ячейке → копия в проекте. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const IMG_RE = /\.(jpe?g|png|webp|gif|svg|heic|heif)$/i;
  const MAX_PX = 1600; // фото записи: на бейдже/дипломе хватает с запасом, проект остаётся лёгким
  let dlg = null, st = null;

  /* ---------- картинки по ссылкам в фоне ---------- */
  const failed = new Map(); // ссылка → ошибка (чтобы не стучаться повторно и не ругаться на каждое изменение)
  let syncing = false;
  async function sync() {
    if (!S.doc || S.readOnly || syncing || !XS.RemoteImages) return;
    const doc = S.doc;
    const need = XS.RemoteImages.missing(doc, doc.data.rows, {withColumns: true}).filter(u => !failed.has(u));
    if (!need.length) return;
    syncing = true;
    try {
      const res = await XS.RemoteImages.localize(doc, need.slice(0, 60));
      for (const f of res.failed) failed.set(f.url, f.message);
      if (doc !== S.doc) return;
      if (res.added) { UI.changed({skip: ['layers', 'inspector']}); if ($('tableDialog')?.open) UI.Sheet.render(); }
      if (res.failed.length) UI.toast('Не скачалась картинка по ссылке' + (res.failed.length > 1 ? ' (' + res.failed.length + ')' : '') + ': ' + res.failed[0].message + ' ' + short(res.failed[0].url), true);
      if (need.length > 60) schedule();
    } finally { syncing = false; }
  }
  const schedule = XS.debounce(() => { sync().catch(e => console.error(e)); }, 900);
  const short = u => { try { const x = new URL(u); return x.host + (x.pathname.length > 24 ? x.pathname.slice(0, 22) + '…' : x.pathname); } catch (e) { return u; } };
  /* Для формы и таблицы: что показать на месте ссылки. */
  function urlStatus(url) {
    const a = XS.RemoteImages?.find(S.doc, url);
    if (a) return {asset: a};
    if (failed.has(url)) return {error: failed.get(url)};
    return {pending: true};
  }

  /* Ссылку на картинку — сразу в проект (кнопка «По ссылке…» в форме записи). */
  async function fromUrl(row, col) {
    const url = prompt('Ссылка на картинку (https://…). Студия скачает её и сохранит в проекте:', '');
    if (!url) return;
    const u = url.trim();
    if (!XS.RemoteImages.isUrl(u)) throw new Error('Нужна ссылка, начинающаяся с http:// или https://.');
    const a = await UI.busy('Скачиваем картинку…', () => XS.RemoteImages.download(u).catch(e => { throw new Error('Картинка не скачалась: ' + e.message.replace(/^«[^»]*»:\s*/, '')); }));
    UI.edit(d => { row.cells[col.id] = 'asset:' + XS.Model.addAsset(d, a).id; });
    if ($('tableDialog').open) UI.Sheet.render();
  }

  /* ---------- окно «Фото для записей» ---------- */
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'dialog wide photos-dialog';
    dlg.innerHTML = `<header class="dialog-head"><h2>Фото для записей</h2><button class="btn icon" data-close aria-label="Закрыть">${XS.Icons.icon('close')}</button></header>
      <div class="dialog-body">
        <div class="ph-drop" data-drop tabindex="0">
          ${XS.Icons.icon('camera', 28)}
          <b>Перетащите сюда фотографии или ZIP-архив</b>
          <span class="muted small">«Иванов Иван.jpg», «Долгих Е.С.png», «ivanov_ivan.jpg», «003.jpg» (номер записи) или имя файла, записанное в таблице</span>
          <label class="btn small">Выбрать файлы…<input type="file" data-files accept="image/*,.zip,.heic" multiple hidden></label>
        </div>
        <div class="row-form-inline ph-opts"><span class="muted small">Узнавать по столбцу</span><select data-key></select>
          <span class="muted small">класть в</span><select data-col></select>
          <label class="check small"><input type="checkbox" data-over checked> заменять уже выбранные фото</label></div>
        <div class="ph-list" data-list></div>
      </div>
      <footer class="dialog-foot"><span class="muted small" data-sum></span><span class="spacer"></span><button class="btn" data-close>Отмена</button><button class="btn primary" data-go disabled>Разложить</button></footer>`;
    document.body.append(dlg);
    dlg.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => dlg.close(); });
    dlg.addEventListener('close', () => { st = null; });
    const drop = dlg.querySelector('[data-drop]');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', UI.safe(async e => { e.preventDefault(); drop.classList.remove('over'); await add([...e.dataTransfer.files]); }));
    dlg.querySelector('[data-files]').onchange = UI.safe(async e => { const f = [...e.target.files]; e.target.value = ''; await add(f); });
    dlg.querySelector('[data-key]').onchange = () => { rematch(); render(); };
    dlg.querySelector('[data-col]').onchange = () => { rematch(); render(); };
    dlg.querySelector('[data-over]').onchange = render;
    dlg.querySelector('[data-go]').onclick = UI.safe(apply);
  }

  function options() {
    const cols = S.doc.data.columns;
    const text = cols.filter(c => c.type !== 'image'), imgs = cols.filter(c => c.type === 'image');
    const fio = text.find(c => XS.ImportMap?.group(c.name) === 'fio') || text.find(c => XS.ImportMap?.columnKind(S.doc.data.rows.slice(0, 50).map(r => r.cells[c.id])) === 'fio') || text[0];
    const keySel = dlg.querySelector('[data-key]'), colSel = dlg.querySelector('[data-col]');
    keySel.innerHTML = text.map(c => `<option value="${c.id}" ${c === fio ? 'selected' : ''}>${XS.esc(c.name)}</option>`).join('');
    colSel.innerHTML = imgs.map(c => `<option value="${c.id}">${XS.esc(c.name)}</option>`).join('') + '<option value="">новый столбец «Фото»</option>';
    // столбец, на который уже ссылается картинка макета, — в приоритете
    const used = S.doc.sides.flatMap(s => s.elements).filter(e => e.type === 'image' && /^\{.+\}$/.test(e.src)).map(e => XS.Model.columnByName(S.doc, e.src.slice(1, -1))).find(c => c && c.type === 'image');
    if (used) colSel.value = used.id;
  }

  /* Файлы и ZIP → список {name, file} картинок. */
  async function expand(files) {
    const out = [], skipped = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
        let entries;
        try { entries = XS.Zip.unzip(new Uint8Array(await f.arrayBuffer()), n => IMG_RE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)); }
        catch (e) { skipped.push(f.name + ' — архив не открывается'); continue; }
        for (const [path, bytes] of Object.entries(entries)) {
          const name = path.split('/').pop();
          out.push({name, file: new File([bytes], name, {type: XS.Assets.sniff(bytes) || ''})});
        }
      } else if (IMG_RE.test(f.name) || /^image\//.test(f.type)) out.push({name: f.name, file: f});
      else skipped.push(f.name + ' — не картинка');
    }
    return {out, skipped};
  }

  async function add(files) {
    if (!files.length) return;
    const {out, skipped} = await expand(files);
    if (!out.length) throw new Error(skipped.length ? 'Нет картинок: ' + skipped.slice(0, 3).join('; ') : 'Нет картинок.');
    await UI.busy('Читаем фотографии: 0 из ' + out.length + '…', async () => {
      let n = 0;
      for (const item of out) {
        UI.busyText('Читаем фотографии: ' + (++n) + ' из ' + out.length + '…');
        try { item.asset = await XS.Assets.fromFile(item.file, {maxPx: MAX_PX}); }
        catch (e) { item.error = e.message.replace(/^«[^»]*»:\s*/, ''); }
        delete item.file;
        item.index = -1;
        st.items.push(item);
        await XS.pause();
      }
    });
    st.skipped.push(...skipped);
    rematch();
    render();
  }

  function rematch() {
    const key = dlg.querySelector('[data-key]').value, col = dlg.querySelector('[data-col]').value;
    const ready = st.items.filter(i => i.asset && !i.manual);
    const {matched} = XS.DataTools.matchPhotos(S.doc, ready, key, {imageColumnId: col});
    for (const i of ready) { i.index = -1; i.how = ''; i.conflict = false; }
    for (const m of matched) { m.file.index = m.index; m.file.how = m.how; }
    // одной записи — одно фото: если на запись претендуют несколько файлов, остаётся самое точное совпадение
    const rank = {file: 5, name: 4, initials: 3, number: 2, surname: 1};
    const best = new Map();
    for (const i of st.items) if (i.index >= 0) { const b = best.get(i.index); if (!b || (rank[i.how] || 6) > (rank[b.how] || 6)) best.set(i.index, i); }
    for (const i of st.items) if (i.index >= 0 && best.get(i.index) !== i && !i.manual) { i.index = -1; i.conflict = true; }
  }

  const HOW = {file: 'имя файла из таблицы', name: 'по ФИО', initials: 'по фамилии и инициалам', number: 'по номеру записи', surname: 'по фамилии', manual: 'выбрано вручную'};
  function render() {
    const rows = S.doc.data.rows, colId = dlg.querySelector('[data-col]').value, over = dlg.querySelector('[data-over]').checked;
    const label = r => { const c = XS.Model.labelColumn(S.doc); return c ? String(r.cells[c.id] ?? '').trim() || 'пусто' : ''; };
    const rowOptions = sel => '<option value="-1">— не класть —</option>' + rows.map((r, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}. ${XS.esc(label(r).slice(0, 50))}</option>`).join('');
    const list = dlg.querySelector('[data-list]');
    list.innerHTML = st.items.map((it, n) => {
      const has = it.index >= 0 && colId && String(rows[it.index]?.cells[colId] ?? '').trim();
      const status = it.error ? `<span class="ph-bad">${XS.esc(it.error)}</span>`
        : it.index < 0 ? `<span class="ph-bad">${it.conflict ? 'на эту запись уже есть фото точнее' : 'запись не найдена — выберите'}</span>`
        : `<span class="muted small">${HOW[it.manual ? 'manual' : it.how] || ''}${has ? (over ? ' · заменит прежнее' : ' · у записи уже есть фото — пропустим') : ''}</span>`;
      return `<div class="ph-item${it.index < 0 || it.error ? ' off' : ''}">
        ${it.asset ? `<img src="${it.asset.data}" alt="" loading="lazy">` : '<div class="ph-noimg">—</div>'}
        <div class="ph-meta"><b title="${XS.esc(it.name)}">${XS.esc(it.name)}</b>${status}</div>
        ${it.asset ? `<select data-i="${n}">${rowOptions(it.index)}</select>` : ''}
      </div>`;
    }).join('') + (st.skipped.length ? `<p class="muted small">Пропущено: ${st.skipped.slice(0, 10).map(XS.esc).join('; ')}${st.skipped.length > 10 ? '…' : ''}</p>` : '');
    list.querySelectorAll('select[data-i]').forEach(sel => {
      sel.onchange = () => {
        const it = st.items[+sel.dataset.i], v = +sel.value;
        for (const o of st.items) if (o !== it && o.index === v && v >= 0) { o.index = -1; o.conflict = true; }
        it.index = v; it.manual = true; it.conflict = false;
        render();
      };
    });
    const ok = st.items.filter(i => i.asset && i.index >= 0 && (over || !(colId && String(rows[i.index]?.cells[colId] ?? '').trim())));
    const withPhoto = new Set(st.items.filter(i => i.index >= 0).map(i => i.index));
    const left = rows.length - withPhoto.size;
    dlg.querySelector('[data-sum]').textContent = st.items.length
      ? `Совпало ${st.items.filter(i => i.index >= 0).length} из ${st.items.length}` + (left > 0 && rows.length ? ` · без фото останется записей: ${left}` : '')
      : 'Файлы пока не выбраны.';
    const go = dlg.querySelector('[data-go]');
    go.disabled = !ok.length; go.textContent = ok.length ? 'Разложить: ' + ok.length : 'Разложить';
  }

  function apply() {
    let colId = dlg.querySelector('[data-col]').value;
    const over = dlg.querySelector('[data-over]').checked;
    let n = 0;
    UI.edit(d => {
      if (!colId) {
        const c = XS.Model.addColumn(d, XS.Model.columnByName(d, 'Фото') ? 'Фото ' + (d.data.columns.length + 1) : 'Фото', 'image');
        c.type = 'image'; colId = c.id;
      }
      for (const it of st.items) {
        if (!it.asset || it.index < 0) continue;
        const row = d.data.rows[it.index]; if (!row) continue;
        if (!over && String(row.cells[colId] ?? '').trim()) continue;
        row.cells[colId] = 'asset:' + XS.Model.addAsset(d, it.asset).id; n++;
      }
    });
    dlg.close();
    if ($('tableDialog').open) UI.Sheet.render();
    const linked = S.doc.sides.some(s => s.elements.some(e => e.type === 'image' && XS.key(e.src) === XS.key('{' + (S.doc.data.columns.find(c => c.id === colId)?.name || '') + '}')));
    UI.toast('Разложено фото: ' + n + '.' + (linked ? '' : ' В макете: картинка → «Источник: из столбца» → этот столбец.') + ' Отменить — Ctrl+Z.');
  }

  function open(files) {
    if (S.readOnly) return UI.edit(() => {});
    if (!S.doc.data.rows.length) throw new Error('Сначала добавьте записи (список людей): фото раскладываются по ним.');
    if (!dlg) build();
    st = {items: [], skipped: []};
    options();
    render();
    if (!dlg.open) dlg.showModal();
    if (files?.length) return add(files);
  }

  /* Перетаскивание файлов прямо на окно «Данные» (таблицу): картинки и ZIP → окно фото, таблицы → импорт. */
  function bindDrop(target) {
    if (!target) return;
    target.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); target.classList.add('drop-over'); } });
    target.addEventListener('dragleave', e => { if (!target.contains(e.relatedTarget)) target.classList.remove('drop-over'); });
    target.addEventListener('drop', UI.safe(async e => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault(); target.classList.remove('drop-over');
      const files = [...e.dataTransfer.files];
      const table = files.find(f => /\.(xlsx|ods|csv|tsv|txt)$/i.test(f.name));
      if (table && files.length === 1) return UI.Data.importFile(table);
      await open(files);
    }));
  }

  function init() {
    bindDrop($('tableDialog'));
    bindDrop($('tabData'));
    if (XS.Api?.onChange) XS.Api.onChange(() => { failed.clear(); schedule(); }); // вошли в аккаунт — сервер может скачать то, что не дал браузер
  }

  UI.Photos = {init, open, sync, schedule, urlStatus, fromUrl};
})(typeof window !== 'undefined' ? window : globalThis);
