/* XSatsu Студия · данные: записи (люди, команды, цитаты…), столбцы, импорт из Excel/CSV, обращение по полу. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const LIST_LIMIT = 1500;

  function labelColumn() { return XS.Model.labelColumn(S.doc); }
  function rowLabel(row) { const c = labelColumn(); return c ? String(row.cells[c.id] ?? '').trim() : ''; }

  function render(opts = {}) {
    $('rowCount').textContent = S.doc.data.rows.length || '';
    renderList();
    if (!(opts.skip || []).includes('rowform')) renderForm();
    renderGreeting();
  }

  function renderList() {
    const q = XS.key($('rowSearch').value);
    const rows = S.doc.data.rows, items = [];
    let shown = 0;
    for (let i = 0; i < rows.length && shown < LIST_LIMIT; i++) {
      const r = rows[i];
      if (q && !Object.values(r.cells).some(v => XS.key(v).includes(q))) continue;
      shown++;
      const li = document.createElement('li');
      li.className = 'row-item' + (i === S.row ? ' active' : '');
      li.dataset.i = i;
      const label = rowLabel(r);
      li.innerHTML = `<input type="checkbox" ${S.selectedRows.has(r.id) ? 'checked' : ''} title="Выбрать для выгрузки"><span class="n">${i + 1}</span><span class="t${label ? '' : ' empty'}">${XS.esc(label || 'бланк (пусто)')}</span>${r.copies !== 1 ? '<span class="badge" title="Экземпляров при печати">×' + r.copies + '</span>' : ''}`;
      items.push(li);
    }
    $('rowList').replaceChildren(...items);
    if (!rows.length) $('rowList').innerHTML = '<li class="muted small" style="padding:8px">Записей нет. Добавьте вручную или вставьте таблицу из Excel — каждая строка станет отдельным пригласительным, дипломом или закладкой.</li>';
    $('selCount').textContent = S.selectedRows.size ? 'выбрано: ' + S.selectedRows.size : '';
    const active = $('rowList').querySelector('.active');
    if (active && !isVisible(active, $('rowList'))) active.scrollIntoView({block: 'nearest'});
  }
  const isVisible = (el, parent) => el.offsetTop >= parent.scrollTop && el.offsetTop + el.offsetHeight <= parent.scrollTop + parent.clientHeight;

  function renderForm() {
    const form = $('rowForm'), row = UI.row();
    form.replaceChildren();
    if (!row) return;
    const h = document.createElement('h4');
    h.innerHTML = `<span>Запись ${S.row + 1}</span><span><button class="btn small" data-act="dup" title="Копия записи">⧉</button> <button class="btn small danger" data-act="del" title="Удалить запись">Удалить</button></span>`;
    h.querySelector('[data-act=dup]').onclick = () => UI.edit(d => { const copy = {...XS.clone(row), id: XS.uid('r')}; d.data.rows.splice(S.row + 1, 0, copy); S.row++; });
    h.querySelector('[data-act=del]').onclick = () => UI.edit(d => { d.data.rows.splice(S.row, 1); S.selectedRows.delete(row.id); });
    form.append(h);
    for (const col of S.doc.data.columns) {
      const wrap = document.createElement(col.type === 'image' ? 'div' : 'label'); // в label клик по подписи «нажимал» бы первую кнопку
      wrap.className = 'f wide';
      wrap.innerHTML = `<span>${XS.esc(col.name)}</span>`;
      if (col.type === 'image') {
        const v = String(row.cells[col.id] || '').trim();
        const isUrl = XS.RemoteImages?.isUrl(v);
        const st = isUrl ? UI.Photos.urlStatus(v) : {};
        const asset = /^asset:/.test(v) ? S.doc.assets[v.slice(6)] : st.asset || null;
        const card = document.createElement('div');
        card.className = 'asset-card';
        const title = asset ? XS.esc(asset.name) : isUrl ? (st.error ? 'ссылка не скачалась' : 'скачиваем по ссылке…') : v ? XS.esc(v) + ' (нет файла)' : 'нет картинки';
        const sub = isUrl ? `<span class="muted small" title="${XS.esc(v)}">${st.error ? XS.esc(st.error) : 'по ссылке · копия хранится в проекте'}</span>` : '';
        card.innerHTML = (asset && asset.data && !XS.Assets.isPdf(asset) ? `<img src="${asset.data}" alt="">` : '<div class="pdf">' + (asset ? 'PDF' : '—') + '</div>') +
          `<div class="meta"><b>${title}</b>${sub}</div><span class="asset-acts"><button class="btn small" type="button" data-pick>Файл…</button><button class="btn small" type="button" data-url title="Скачать картинку по ссылке и сохранить в проекте">Ссылка…</button>${v ? `<button class="btn small" type="button" data-clear title="Убрать картинку из записи">${XS.Icons.icon('close', 12)}</button>` : ''}</span>`;
        card.querySelector('[data-pick]').onclick = () => pickImage(row, col);
        card.querySelector('[data-url]').onclick = UI.safe(() => UI.Photos.fromUrl(row, col));
        const clr = card.querySelector('[data-clear]'); if (clr) clr.onclick = () => UI.edit(() => { delete row.cells[col.id]; });
        wrap.append(card);
      } else {
        const v = String(row.cells[col.id] ?? '');
        const input = document.createElement(v.length > 40 || v.includes('\n') ? 'textarea' : 'input');
        if (input.tagName === 'TEXTAREA') input.rows = Math.min(6, Math.max(2, Math.ceil(v.length / 34)));
        else input.type = 'text';
        input.value = v;
        input.oninput = () => {
          UI.edit(() => { row.cells[col.id] = input.value; }, 'cell:' + row.id + ':' + col.id, {skip: ['data', 'inspector', 'layers']});
          renderList();
        };
        wrap.append(input);
      }
      form.append(wrap);
    }
    const copies = document.createElement('label');
    copies.className = 'f';
    copies.innerHTML = '<span>Экземпляров</span>';
    const ci = document.createElement('input');
    ci.type = 'number'; ci.min = 0; ci.max = 999; ci.value = row.copies; ci.title = 'Сколько копий печатать на листах (режим «Листы для печати»)';
    ci.oninput = () => UI.edit(() => { row.copies = Math.round(XS.num(ci.value, 1, 0, 999)); }, 'copies:' + row.id, {skip: ['inspector', 'layers', 'stage'], ...{}});
    copies.append(ci);
    form.append(copies);
  }

  function pickImage(row, col) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,.pdf';
    input.onchange = UI.safe(async () => {
      const f = input.files[0]; if (!f) return;
      const a = await UI.busy('Загружаем ' + f.name + '…', () => XS.Assets.fromFile(f, {maxPx: 2400}));
      UI.edit(d => { row.cells[col.id] = 'asset:' + XS.Model.addAsset(d, a).id; });
      if ($('tableDialog').open) UI.Sheet.render();
    });
    input.click();
  }

  function renderGreeting() {
    const g = S.doc.greeting, box = $('greetingForm');
    if (box.contains(document.activeElement)) return;
    const cols = S.doc.data.columns.filter(c => c.type !== 'image').map(c => c.name);
    const opt = (list, v) => ['', ...list].map(n => `<option value="${XS.esc(n)}" ${n === v ? 'selected' : ''}>${n ? XS.esc(n) : '— нет —'}</option>`).join('');
    box.innerHTML = `<p class="note">Поле <b>{Обращение}</b> подставляет нужное слово. Пол берётся из столбца (М/Ж); если он пустой — угадывается по ФИО (отчество, имя, фамилия).</p>
      <label class="f"><span>ФИО</span><select data-g="nameField">${opt(cols, g.nameField)}</select></label>
      <label class="f"><span>Пол</span><select data-g="genderField">${opt(cols, g.genderField)}</select></label>
      <label class="f"><span>Мужское</span><input type="text" data-g="male" value="${XS.esc(g.male)}"></label>
      <label class="f"><span>Женское</span><input type="text" data-g="female" value="${XS.esc(g.female)}"></label>
      <label class="f"><span>Не ясно</span><input type="text" data-g="neutral" value="${XS.esc(g.neutral)}"></label>`;
    box.querySelectorAll('[data-g]').forEach(el => { el.oninput = () => UI.edit(d => { d.greeting[el.dataset.g] = el.value; }, 'greet:' + el.dataset.g, {skip: ['data', 'inspector', 'layers']}); });
  }

  /* ---------- столбцы ---------- */
  function renameColumn(col, name) {
    name = name.trim();
    if (!name || name === col.name) return;
    if (XS.Model.columnByName(S.doc, name)) throw new Error('Столбец «' + name + '» уже есть.');
    const old = col.name, re = new RegExp('\\{' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'gi');
    UI.edit(d => {
      col.name = name;
      // Поле переименовывается везде: в текстах, картинках, именах файлов и обращении.
      for (const s of d.sides) for (const el of s.elements) { if (el.type === 'text') el.text = el.text.replace(re, '{' + name + '}'); if (el.type === 'image') el.src = el.src.replace(re, '{' + name + '}'); }
      d.output.naming = d.output.naming.replace(re, '{' + name + '}'); d.output.archive = d.output.archive.replace(re, '{' + name + '}');
      if (d.greeting.nameField === old) d.greeting.nameField = name;
      if (d.greeting.genderField === old) d.greeting.genderField = name;
    }, '', {skip: ['data']});
  }

  /* ---------- таблица целиком — ui/sheet.js (UI.Sheet) ---------- */
  const renderTable = () => UI.Sheet.render();

  async function importFile(file) {
    const table = XS.Import.readTableFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!table.rows.length && !(table.first || []).some(Boolean)) throw new Error('В файле нет строк с данными.');
    // Столбцы файла сопоставляются со столбцами проекта в окне импорта (а не добавляются рядом новыми).
    return UI.ImportDialog.open(table, {source: 'файл «' + file.name + '»'});
  }

  function init() {
    $('rowSearch').oninput = renderList;
    $('rowList').addEventListener('click', e => {
      const li = e.target.closest('.row-item'); if (!li) return;
      const i = Number(li.dataset.i), row = S.doc.data.rows[i];
      if (e.target.type === 'checkbox') { e.target.checked ? S.selectedRows.add(row.id) : S.selectedRows.delete(row.id); $('selCount').textContent = S.selectedRows.size ? 'выбрано: ' + S.selectedRows.size : ''; return; }
      UI.setRow(i);
    });
    $('selectAllRows').onchange = e => { const q = XS.key($('rowSearch').value); for (const r of S.doc.data.rows) if (!q || Object.values(r.cells).some(v => XS.key(v).includes(q))) e.target.checked ? S.selectedRows.add(r.id) : S.selectedRows.delete(r.id); renderList(); };
    $('addRowBtn').onclick = () => UI.edit(d => { d.data.rows.push({id: XS.uid('r'), cells: {}, copies: 1}); S.row = d.data.rows.length - 1; });
    $('importTableFile').onchange = UI.safe(async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });
    $('tImportFile').onchange = UI.safe(async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });
    $('photosBtn').onclick = UI.safe(() => UI.Photos.open());
    $('tPhotos').onclick = UI.safe(() => UI.Photos.open());
    // вставка из Excel
    $('pasteBtn').onclick = () => { $('pasteArea').value = ''; $('pastePreview').textContent = ''; $('pasteDialog').showModal(); $('pasteArea').focus(); };
    $('pasteClose').onclick = () => $('pasteDialog').close();
    $('pasteArea').oninput = () => {
      const t = XS.Import.parseTable($('pasteArea').value);
      const n = t.rows.length + ((t.first || []).some(Boolean) ? 1 : 0);
      $('pastePreview').textContent = n ? 'Строк: ' + n + ' · столбцов: ' + t.headers.length + '. Дальше — выбрать, куда их положить.' : '';
    };
    $('pasteGo').onclick = UI.safe(() => {
      const t = XS.Import.parseTable($('pasteArea').value);
      if (!t.rows.length && !(t.first || []).some(Boolean)) throw new Error('Нет строк: вставьте ячейки из Excel или просто список (по строке на запись).');
      const replace = $('pasteReplace').checked;
      $('pasteDialog').close();
      UI.ImportDialog.open(t, {source: 'вставка', replace});
    });
    // таблица
    $('tableBtn').onclick = () => { $('tableDialog').showModal(); UI.Sheet.open(); };
    $('tableClose').onclick = () => $('tableDialog').close();
    $('tAddRow').onclick = () => { UI.edit(d => { d.data.rows.push({id: XS.uid('r'), cells: {}, copies: 1}); }); renderTable(); UI.Sheet.select(S.doc.data.rows.length - 1, 0); };
    $('tAddCol').onclick = UI.safe(() => {
      const name = prompt('Название столбца (будет полем {Название}):', 'Новый столбец');
      if (!name) return;
      if (XS.Model.columnByName(S.doc, name)) throw new Error('Такой столбец уже есть.');
      UI.edit(d => XS.Model.addColumn(d, name.trim()));
      renderTable();
    });
    $('tDelRows').onclick = () => {
      const ids = new Set(UI.Sheet.selectedRowIds());
      if (!ids.size) return UI.toast('Выделите строки (клик по номеру) или отметьте галочками.', true);
      if (!confirm('Удалить записи: ' + ids.size + '?')) return;
      UI.edit(d => { d.data.rows = d.data.rows.filter(r => !ids.has(r.id)); S.selectedRows.clear(); });
      renderTable();
    };
    UI.Sheet.init();
  }

  UI.Data = {init, render, renderList, renameColumn, importFile, pickImage};
})(typeof window !== 'undefined' ? window : globalThis);
