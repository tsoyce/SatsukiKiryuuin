/* XSatsu Студия · данные: записи (люди, команды, цитаты…), столбцы, импорт из Excel/CSV, обращение по полу. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const LIST_LIMIT = 1500;

  function labelColumn() { return S.doc.data.columns.find(c => c.type !== 'image'); }
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
      const wrap = document.createElement('label');
      wrap.className = 'f wide';
      wrap.innerHTML = `<span>${XS.esc(col.name)}</span>`;
      if (col.type === 'image') {
        const v = row.cells[col.id] || '';
        const asset = /^asset:/.test(v) ? S.doc.assets[v.slice(6)] : null;
        const card = document.createElement('div');
        card.className = 'asset-card';
        card.innerHTML = (asset && !XS.Assets.isPdf(asset) ? `<img src="${asset.data}" alt="">` : '<div class="pdf">' + (asset ? 'PDF' : '—') + '</div>') +
          `<div class="meta"><b>${asset ? XS.esc(asset.name) : 'нет картинки'}</b></div><button class="btn small" type="button">Выбрать…</button>`;
        card.querySelector('button').onclick = () => pickImage(row, col);
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
      const a = await XS.Assets.fromFile(f);
      UI.edit(d => { row.cells[col.id] = 'asset:' + XS.Model.addAsset(d, a).id; });
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

  /* ---------- таблица целиком: как в Excel ----------
   * Выделение мышью (протянуть), Shift+клик / Shift+стрелки — диапазон, клик по № — вся запись, по заголовку — весь столбец.
   * Ctrl+C / Ctrl+X / Ctrl+V — через буфер обмена в формате Excel (TSV), Delete — очистить, ввод с клавиатуры, F2 или
   * двойной клик — править ячейку, Enter / Tab — дальше. Ctrl+Z / Ctrl+Y — отмена и повтор. Логика диапазонов — XS.DataTools. */
  const G = {a: {r: 0, c: 0}, f: {r: 0, c: 0}, editing: null, dragging: false};
  const T = () => XS.DataTools;
  const range = () => ({r1: G.a.r, c1: G.a.c, r2: G.f.r, c2: G.f.c});
  const rect = () => { const g = range(); return {r1: Math.min(g.r1, g.r2), r2: Math.max(g.r1, g.r2), c1: Math.min(g.c1, g.c2), c2: Math.max(g.c1, g.c2)}; };
  const limits = () => ({R: Math.max(0, S.doc.data.rows.length - 1), C: Math.max(0, S.doc.data.columns.length - 1)});
  const cellEl = (r, c) => $('dataTable').querySelector(`td.cell[data-r="${r}"][data-c="${c}"]`);

  function renderTable() {
    const t = $('dataTable'), doc = S.doc, cols = doc.data.columns;
    const {R, C} = limits();
    for (const p of [G.a, G.f]) { p.r = Math.min(p.r, R); p.c = Math.min(p.c, C); }
    const head = `<thead><tr><th class="n chk"><input type="checkbox" data-all title="Отметить все для выгрузки"></th><th class="n corner" data-corner title="Выделить всё (Ctrl+A)">№</th>${cols.map((c, j) => `<th data-colhead="${j}"><div class="th-row"><input type="text" data-col="${c.id}" value="${XS.esc(c.name)}" title="Название столбца = имя поля {…}"><select data-type="${c.id}" title="Тип"><option value="text">текст</option><option value="image" ${c.type === 'image' ? 'selected' : ''}>картинка</option></select><button class="col-del" data-del="${c.id}" title="Удалить столбец">✕</button></div></th>`).join('')}<th class="n">Экз.</th></tr></thead>`;
    const body = doc.data.rows.map((r, i) => `<tr data-row="${r.id}"><td class="n chk"><input type="checkbox" data-sel ${S.selectedRows.has(r.id) ? 'checked' : ''} title="Отметить для выгрузки"></td><td class="n rowhead" data-rowhead="${i}">${i + 1}</td>${cols.map((c, j) => {
      const v = String(r.cells[c.id] ?? '');
      if (c.type === 'image') { const a = /^asset:/.test(v) ? doc.assets[v.slice(6)] : null; return `<td class="cell img" data-r="${i}" data-c="${j}">${a && !XS.Assets.isPdf(a) ? `<img src="${a.data}" alt="">` : XS.esc(a ? a.name : v)}</td>`; }
      return `<td class="cell" data-r="${i}" data-c="${j}">${XS.esc(v)}</td>`;
    }).join('')}<td class="copies"><input type="number" min="0" max="999" data-copies value="${r.copies}"></td></tr>`).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
    if (!doc.data.rows.length) t.insertAdjacentHTML('beforeend', `<tbody><tr><td colspan="${cols.length + 3}" class="grid-empty">Записей нет. Нажмите «＋ Запись» или вставьте таблицу из Excel: выделите ячейки там, Ctrl+C, затем щёлкните сюда и Ctrl+V.</td></tr></tbody>`);
    paintSel();
  }
  function paintSel(scroll = false) {
    const t = $('dataTable'), {r1, r2, c1, c2} = rect();
    t.querySelectorAll('td.cell.sel, td.cell.cur').forEach(td => td.classList.remove('sel', 'cur'));
    t.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    if (!S.doc.data.rows.length) return;
    for (let r = r1; r <= r2; r++) {
      t.querySelector(`[data-rowhead="${r}"]`)?.classList.add('hl');
      for (let c = c1; c <= c2; c++) cellEl(r, c)?.classList.add('sel');
    }
    for (let c = c1; c <= c2; c++) t.querySelector(`[data-colhead="${c}"]`)?.classList.add('hl');
    const cur = cellEl(G.f.r, G.f.c);
    cur?.classList.add('cur');
    if (scroll) cur?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const n = (r2 - r1 + 1) * (c2 - c1 + 1);
    $('gridInfo').textContent = n > 1 ? 'Выделено ячеек: ' + n + ' · Ctrl+C, Ctrl+V, Delete' : 'Ctrl+V — вставить из Excel · протяните мышью, чтобы выделить';
  }
  function select(r, c, extend = false) {
    const {R, C} = limits();
    G.f = {r: XS.clamp(r, 0, R), c: XS.clamp(c, 0, C)};
    if (!extend) G.a = {...G.f};
    paintSel(true);
  }
  function grid() { return $('dataTable').closest('.table-wrap'); }
  /* Клавиатура и буфер обмена идут через невидимое поле ввода внутри таблицы: так Ctrl+C / Ctrl+V
   * надёжно работают во всех браузерах (события copy/paste приходят только в редактируемые элементы). */
  function sink() {
    let t = $('gridSink');
    if (!t) { t = document.createElement('textarea'); t.id = 'gridSink'; t.className = 'grid-sink'; t.setAttribute('aria-label', 'Таблица'); grid().prepend(t); }
    return t;
  }
  function focusGrid() {
    const t = sink();
    t.value = '\u200b'; // непустое и выделенное — иначе браузер не делает «копировать»
    t.focus({preventScroll: true}); t.select();
  }

  /* --- правка ячейки --- */
  function startEdit(initial) {
    const {r, c} = G.f, col = S.doc.data.columns[c], row = S.doc.data.rows[r];
    if (!col || !row || S.readOnly) return;
    if (col.type === 'image') { pickImage(row, col); return; }
    const td = cellEl(r, c); if (!td) return;
    const input = document.createElement('textarea');
    input.className = 'cell-edit'; input.rows = 1;
    input.value = initial ?? String(row.cells[col.id] ?? '');
    td.replaceChildren(input); td.classList.add('editing');
    G.editing = {r, c, input};
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.onblur = () => commit();
    input.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); G.editing = null; renderTable(); focusGrid(); }
      else if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); commit(); select(G.f.r + (e.shiftKey ? -1 : 1), G.f.c); focusGrid(); }
      else if (e.key === 'Enter' && e.altKey) { input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end'); e.preventDefault(); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(); select(G.f.r, G.f.c + (e.shiftKey ? -1 : 1)); focusGrid(); }
    };
  }
  function commit() {
    const ed = G.editing; if (!ed) return;
    G.editing = null;
    const col = S.doc.data.columns[ed.c], row = S.doc.data.rows[ed.r];
    if (col && row && String(row.cells[col.id] ?? '') !== ed.input.value) UI.edit(() => { row.cells[col.id] = ed.input.value; }, '', {skip: ['inspector']});
    renderTable();
  }

  /* --- буфер обмена и удаление --- */
  const typing = e => e.target.id !== 'gridSink' && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  let clipDone = false; // пришло ли настоящее событие copy/cut/paste после Ctrl+C/X/V
  function doCopy(e, cut = false) {
    if (typing(e) || G.editing || !S.doc.data.rows.length) return;
    clipDone = true;
    const tsv = T().toTsv(T().copyRange(S.doc, range()));
    e.clipboardData.setData('text/plain', tsv);
    e.preventDefault();
    if (cut && !S.readOnly) { UI.edit(d => { T().clearRange(d, range()); }, '', {skip: ['inspector']}); renderTable(); }
    UI.toast(cut ? 'Вырезано.' : 'Скопировано — можно вставить в Excel или сюда.');
  }
  function doPaste(e) {
    if (typing(e) || G.editing || S.readOnly) return;
    clipDone = true;
    pasteText(e.clipboardData.getData('text/plain'), e);
  }
  function pasteText(text, e) {
    if (!text) return;
    e?.preventDefault();
    const m = T().parseClip(text);
    let res;
    UI.edit(d => { res = T().pasteRange(d, S.doc.data.rows.length ? range() : {r1: 0, c1: 0, r2: 0, c2: 0}, m); }, '', {skip: ['inspector']});
    G.a = {r: res.r1, c: res.c1}; G.f = {r: res.r2, c: res.c2};
    renderTable();
    UI.toast('Вставлено ячеек: ' + m.reduce((a, r) => a + r.length, 0) + '.');
  }

  function onKey(e) {
    if (G.editing || typing(e) || e.target.closest('thead') || e.target.closest('td.copies, td.chk')) return;
    const mod = e.ctrlKey || e.metaKey, {R, C} = limits();
    const move = (dr, dc) => { e.preventDefault(); select(G.f.r + dr, G.f.c + dc, e.shiftKey); };
    const jump = (r, c) => { e.preventDefault(); select(r, c, e.shiftKey); };
    switch (e.key) {
      case 'ArrowUp': return mod ? jump(0, G.f.c) : move(-1, 0);
      case 'ArrowDown': return mod ? jump(R, G.f.c) : move(1, 0);
      case 'ArrowLeft': return mod ? jump(G.f.r, 0) : move(0, -1);
      case 'ArrowRight': return mod ? jump(G.f.r, C) : move(0, 1);
      case 'Home': return jump(mod ? 0 : G.f.r, 0);
      case 'End': return jump(mod ? R : G.f.r, C);
      case 'PageDown': return move(15, 0);
      case 'PageUp': return move(-15, 0);
      case 'Tab': e.preventDefault(); return select(G.f.r, G.f.c + (e.shiftKey ? -1 : 1));
      case 'Enter': e.preventDefault(); return e.shiftKey ? select(G.f.r - 1, G.f.c) : startEdit();
      case 'F2': e.preventDefault(); return startEdit();
      case 'Delete': case 'Backspace':
        e.preventDefault();
        if (S.readOnly || !S.doc.data.rows.length) return;
        UI.edit(d => { T().clearRange(d, range()); }, '', {skip: ['inspector']});
        return renderTable();
    }
    // Запасной путь, если браузер не прислал copy/paste (например, при автоматизации): Clipboard API.
    if (mod && /^Key[CXV]$/.test(e.code) && !e.shiftKey) {
      clipDone = false;
      const code = e.code;
      setTimeout(() => {
        if (clipDone || !navigator.clipboard) return;
        if (code === 'KeyV') navigator.clipboard.readText().then(t => pasteText(t)).catch(() => UI.toast('Браузер не дал прочитать буфер: вставьте через Ctrl+V ещё раз или разрешите доступ.', true));
        else if (S.doc.data.rows.length) navigator.clipboard.writeText(T().toTsv(T().copyRange(S.doc, range()))).then(() => {
          if (code === 'KeyX' && !S.readOnly) { UI.edit(d => { T().clearRange(d, range()); }, '', {skip: ['inspector']}); renderTable(); }
          UI.toast(code === 'KeyX' ? 'Вырезано.' : 'Скопировано — можно вставить в Excel или сюда.');
        }).catch(() => {});
      }, 60);
      return;
    }
    if (mod && e.code === 'KeyA') { e.preventDefault(); G.a = {r: 0, c: 0}; G.f = {r: R, c: C}; return paintSel(); }
    if (mod && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); (e.code === 'KeyY' || e.shiftKey) ? UI.redo() : UI.undo(); return renderTable(); }
    if (!mod && !e.altKey && e.key.length === 1 && S.doc.data.rows.length) { e.preventDefault(); startEdit(e.key); }
  }

  function tableEvents() {
    const t = $('dataTable'), wrap = grid();
    wrap.tabIndex = -1;
    wrap.addEventListener('focus', () => focusGrid());
    t.addEventListener('change', UI.safe(e => {
      const el = e.target, tr = el.closest('tr'), row = tr && S.doc.data.rows.find(r => r.id === tr.dataset.row);
      if (el.dataset.col) { const col = S.doc.data.columns.find(c => c.id === el.dataset.col); try { renameColumn(col, el.value); } catch (err) { el.value = col.name; throw err; } }
      else if (el.dataset.type) UI.edit(() => { S.doc.data.columns.find(c => c.id === el.dataset.type).type = el.value; }, '', {skip: []});
      else if ('copies' in el.dataset && row) UI.edit(() => { row.copies = Math.round(XS.num(el.value, 1, 0, 999)); }, '', {skip: ['inspector']});
      else if ('sel' in el.dataset && row) { el.checked ? S.selectedRows.add(row.id) : S.selectedRows.delete(row.id); renderList(); }
      else if ('all' in el.dataset) { for (const r of S.doc.data.rows) el.checked ? S.selectedRows.add(r.id) : S.selectedRows.delete(r.id); renderTable(); renderList(); }
      if (el.dataset.type) renderTable();
    }));
    t.addEventListener('click', e => {
      const id = e.target.dataset.del;
      if (!id) return;
      const col = S.doc.data.columns.find(c => c.id === id);
      if (!confirm('Удалить столбец «' + col.name + '» вместе с данными?')) return;
      UI.edit(d => { d.data.columns = d.data.columns.filter(c => c.id !== id); for (const r of d.data.rows) delete r.cells[id]; });
      renderTable();
    });
    // Выделение мышью: ячейка, протянуть, Shift — до ячейки; № записи — строка; заголовок столбца (не поле ввода) — столбец.
    t.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const td = e.target.closest('td.cell'), rh = e.target.closest('[data-rowhead]'), ch = e.target.closest('[data-colhead]'), corner = e.target.closest('[data-corner]');
      const {R, C} = limits();
      if (td && !td.classList.contains('editing')) {
        e.preventDefault(); commit(); focusGrid();
        select(+td.dataset.r, +td.dataset.c, e.shiftKey); G.dragging = 'cell';
      } else if (rh) {
        e.preventDefault(); commit(); focusGrid();
        const r = +rh.dataset.rowhead;
        if (e.shiftKey) G.f = {r, c: C}; else { G.a = {r, c: 0}; G.f = {r, c: C}; }
        paintSel(); G.dragging = 'row';
      } else if (ch && !/^(INPUT|SELECT|BUTTON)$/.test(e.target.tagName) && S.doc.data.rows.length) {
        e.preventDefault(); commit(); focusGrid();
        const c = +ch.dataset.colhead;
        if (e.shiftKey) G.f = {r: R, c}; else { G.a = {r: 0, c}; G.f = {r: R, c}; }
        paintSel(); G.dragging = 'col';
      } else if (corner) { e.preventDefault(); focusGrid(); G.a = {r: 0, c: 0}; G.f = {r: R, c: C}; paintSel(); }
    });
    t.addEventListener('mouseover', e => {
      if (!G.dragging || !(e.buttons & 1)) { G.dragging = false; return; }
      const td = e.target.closest('td.cell'), rh = e.target.closest('[data-rowhead]'), ch = e.target.closest('[data-colhead]');
      if (G.dragging === 'cell' && td) { G.f = {r: +td.dataset.r, c: +td.dataset.c}; paintSel(); }
      else if (G.dragging === 'row' && (rh || td)) { G.f = {r: +(rh ? rh.dataset.rowhead : td.dataset.r), c: limits().C}; paintSel(); }
      else if (G.dragging === 'col' && (ch || td)) { G.f = {r: limits().R, c: +(ch ? ch.dataset.colhead : td.dataset.c)}; paintSel(); }
    });
    document.addEventListener('mouseup', () => { G.dragging = false; });
    t.addEventListener('dblclick', e => { const td = e.target.closest('td.cell'); if (td) { select(+td.dataset.r, +td.dataset.c); startEdit(); } });
    wrap.addEventListener('keydown', onKey);
    wrap.addEventListener('copy', e => doCopy(e));
    wrap.addEventListener('cut', e => doCopy(e, true));
    wrap.addEventListener('paste', e => doPaste(e));
    // Esc при правке ячейки не закрывает окно.
    $('tableDialog').addEventListener('cancel', e => { if (G.editing) e.preventDefault(); });
  }

  async function importFile(file) {
    const table = XS.Import.readTableFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!table.rows.length) throw new Error('В файле нет строк с данными.');
    UI.edit(d => XS.Import.applyTable(d, table));
    UI.toast('Добавлено записей: ' + table.rows.length + '.');
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
    // вставка из Excel
    $('pasteBtn').onclick = () => { $('pasteArea').value = ''; $('pastePreview').textContent = ''; $('pasteDialog').showModal(); $('pasteArea').focus(); };
    $('pasteClose').onclick = () => $('pasteDialog').close();
    $('pasteArea').oninput = () => {
      const t = XS.Import.parseTable($('pasteArea').value);
      $('pastePreview').textContent = t.rows.length ? 'Записей: ' + t.rows.length + ' · столбцы: ' + t.headers.join(', ') : '';
    };
    $('pasteGo').onclick = UI.safe(() => {
      const t = XS.Import.parseTable($('pasteArea').value);
      if (!t.rows.length) throw new Error('Нет строк. Первая строка — заголовки столбцов, дальше — данные.');
      UI.edit(d => XS.Import.applyTable(d, t, {replace: $('pasteReplace').checked}));
      $('pasteDialog').close();
      UI.toast('Добавлено записей: ' + t.rows.length + '. Используйте поля ' + t.headers.map(h => '{' + h + '}').join(', ') + ' в текстах.');
    });
    // таблица
    $('tableBtn').onclick = () => { renderTable(); $('tableDialog').showModal(); };
    $('tableClose').onclick = () => $('tableDialog').close();
    $('tAddRow').onclick = () => { UI.edit(d => { d.data.rows.push({id: XS.uid('r'), cells: {}, copies: 1}); }); renderTable(); };
    $('tAddCol').onclick = UI.safe(() => {
      const name = prompt('Название столбца (будет полем {Название}):', 'Новый столбец');
      if (!name) return;
      if (XS.Model.columnByName(S.doc, name)) throw new Error('Такой столбец уже есть.');
      UI.edit(d => XS.Model.addColumn(d, name.trim()));
      renderTable();
    });
    $('tDelRows').onclick = () => {
      if (!S.selectedRows.size) return UI.toast('Отметьте записи галочками.', true);
      if (!confirm('Удалить выбранные записи: ' + S.selectedRows.size + '?')) return;
      UI.edit(d => { d.data.rows = d.data.rows.filter(r => !S.selectedRows.has(r.id)); S.selectedRows.clear(); });
      renderTable();
    };
    tableEvents();
  }

  UI.Data = {init, render, renderList, renameColumn, importFile};
})(typeof window !== 'undefined' ? window : globalThis);
