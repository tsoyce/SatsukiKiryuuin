/* XSatsu Студия · таблица записей «как в Excel» (окно «Данные»).
 * Выделение мышью (протяжка, Shift+клик, клик по номеру строки / заголовку столбца, Ctrl+A), стрелки, Tab, Enter;
 * печать сразу заменяет значение ячейки, F2 / двойной клик — правка; Ctrl+C / Ctrl+X / Ctrl+V — через буфер обмена
 * (табуляция между столбцами — как в Excel и Google Таблицах), Delete — очистить выделение, Ctrl+Z — отменить.
 * Последний столбец «Экз.» — сколько экземпляров печатать. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const COPIES = '__copies';
  let sel = {r0: 0, c0: 0, r1: 0, c1: 0}; // якорь (r0,c0) и активная ячейка (r1,c1)
  let editing = null; // {r, c, input, original}
  let dragging = false, dragMode = '';
  const coarse = global.matchMedia ? global.matchMedia('(pointer: coarse)') : {matches: false};

  const cols = () => [...S.doc.data.columns, {id: COPIES, name: 'Экз.', type: 'copies'}];
  const rows = () => S.doc.data.rows;
  // Последняя строка — пустая «новая запись»: в неё можно перейти стрелкой, напечатать или вставить — запись появится.
  const lastRow = () => rows().length;
  const clampSel = () => {
    const R = lastRow(), C = cols().length - 1;
    for (const k of ['r0', 'r1']) sel[k] = Math.min(Math.max(0, sel[k]), R);
    for (const k of ['c0', 'c1']) sel[k] = Math.min(Math.max(0, sel[k]), C);
  };
  const box = () => ({top: Math.min(sel.r0, sel.r1), bottom: Math.max(sel.r0, sel.r1), left: Math.min(sel.c0, sel.c1), right: Math.max(sel.c0, sel.c1)});
  function getValue(row, col) { if (!row) return ''; return col.id === COPIES ? String(row.copies ?? 1) : String(row.cells[col.id] ?? ''); }
  function setValue(row, col, v) {
    if (col.id === COPIES) { row.copies = Math.round(XS.num(v, 1, 0, 999)); return; }
    v = String(v ?? '');
    if (v === '') delete row.cells[col.id]; else row.cells[col.id] = v;
  }
  function display(row, col) {
    const v = getValue(row, col);
    if (col.type === 'image' && /^asset:/.test(v)) {
      const a = S.doc.assets[v.slice(6)];
      if (a && a.data && !XS.Assets.isPdf(a)) return `<img src="${a.data}" alt="">`;
      return XS.esc(a ? a.name : v);
    }
    if (col.type === 'image' && XS.RemoteImages?.isUrl(v)) {
      // ссылка остаётся в ячейке, а рисуется копия из проекта
      const st = UI.Photos.urlStatus(v);
      if (st.asset?.data) return `<img src="${st.asset.data}" alt="" title="${XS.esc(v)}">`;
      return `<span class="${st.error ? 'cell-bad' : 'muted'}" title="${XS.esc(st.error || v)}">${st.error ? '⚠ ' : '… '}${XS.esc(v.replace(/^https?:\/\//, '').slice(0, 30))}</span>`;
    }
    return XS.esc(v);
  }

  /* ---------- отрисовка ---------- */
  function render() {
    const t = $('dataTable'); if (!t || !S.doc) return;
    clampSel();
    const cs = cols(), rs = rows();
    const allChecked = rs.length && rs.every(r => S.selectedRows.has(r.id));
    const head = `<thead><tr><th class="corner" data-corner title="Выделить всё (Ctrl+A)"><input type="checkbox" class="row-check" data-all ${allChecked ? 'checked' : ''} title="Отметить все записи"></th>`
      + cs.map((c, ci) => c.id === COPIES
        ? `<th class="colh copies" data-ch="${ci}" title="Сколько экземпляров печатать">Экз.</th>`
        : `<th class="colh" data-ch="${ci}"><div class="colh-in"><span class="col-grip" data-grip="${ci}" title="Перетащите, чтобы переставить столбец">${XS.Icons.icon('grip', 14)}</span><input type="text" class="col-name" data-col="${c.id}" value="${XS.esc(c.name)}" title="Название столбца = имя поля {…}" spellcheck="false">`
          + `<select data-type="${c.id}" title="Тип столбца"><option value="text">текст</option><option value="image" ${c.type === 'image' ? 'selected' : ''}>картинка</option></select>`
          + `<button type="button" class="col-del" data-del="${c.id}" title="Удалить столбец">${XS.Icons.icon('close', 13)}</button></div></th>`).join('') + '</tr></thead>';
    const body = rs.map((r, ri) => `<tr data-ri="${ri}"><th class="rowh" data-rh="${ri}"><input type="checkbox" class="row-check" data-sel="${r.id}" ${S.selectedRows.has(r.id) ? 'checked' : ''}><span>${ri + 1}</span></th>`
      + cs.map((c, ci) => `<td data-c="${ci}" class="${c.type === 'image' ? 'img' : c.id === COPIES ? 'num' : ''}">${display(r, c)}</td>`).join('') + '</tr>').join('');
    const ghost = `<tr data-ri="${rs.length}" class="ghost"><th class="rowh" data-rh="${rs.length}" title="Новая запись: начните печатать или вставьте (Ctrl+V)">${XS.Icons.icon('plus', 12)}</th>${cs.map((c, ci) => `<td data-c="${ci}" class="${c.id === COPIES ? 'num' : ''}">${ci === 0 && !rs.length ? '<span class="muted">Записей нет — начните печатать или вставьте таблицу из Excel (Ctrl+V)</span>' : ''}</td>`).join('')}</tr>`;
    t.innerHTML = head + '<tbody>' + body + ghost + '</tbody>';
    paint();
  }
  function cell(r, c) { return $('dataTable').querySelector(`tbody tr[data-ri="${r}"] td[data-c="${c}"]`); }
  function paint() {
    const t = $('dataTable'); if (!t) return;
    const b = box(), has = true;
    t.querySelectorAll('.in-sel, .active').forEach(el => el.classList.remove('in-sel', 'active', 'sel-top', 'sel-bottom', 'sel-left', 'sel-right'));
    t.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
    if (has) {
      for (let r = b.top; r <= b.bottom; r++) {
        const tr = t.querySelector(`tbody tr[data-ri="${r}"]`); if (!tr) continue;
        tr.querySelector('.rowh')?.classList.add('hl');
        for (let c = b.left; c <= b.right; c++) {
          const td = tr.children[c + 1]; if (!td) continue;
          td.classList.add('in-sel');
          if (r === b.top) td.classList.add('sel-top');
          if (r === b.bottom) td.classList.add('sel-bottom');
          if (c === b.left) td.classList.add('sel-left');
          if (c === b.right) td.classList.add('sel-right');
        }
      }
      for (let c = b.left; c <= b.right; c++) t.querySelector(`thead th[data-ch="${c}"]`)?.classList.add('hl');
      cell(sel.r1, sel.c1)?.classList.add('active');
    }
    status();
  }
  function status() {
    const el = $('sheetStatus'); if (!el) return;
    const b = box(), n = (b.bottom - b.top + 1) * (b.right - b.left + 1);
    const col = cols()[sel.c1];
    el.textContent = (n > 1 ? `Выделено ячеек: ${n} (${b.bottom - b.top + 1} × ${b.right - b.left + 1})` : `${sel.r1 >= rows().length ? 'Новая запись' : 'Запись ' + (sel.r1 + 1)} · ${col ? (col.id === COPIES ? 'Экз.' : '{' + col.name + '}') : ''}`)
      + (S.selectedRows.size ? ` · отмечено записей: ${S.selectedRows.size}` : '');
  }
  function scrollTo(r, c) {
    const td = cell(r, c), wrap = $('dataTable').parentElement; if (!td || !wrap) return;
    const head = $('dataTable').querySelector('thead')?.offsetHeight || 0, rowh = $('dataTable').querySelector('.rowh')?.offsetWidth || 0;
    const tr = td.offsetTop, tl = td.offsetLeft;
    if (tr - head < wrap.scrollTop) wrap.scrollTop = tr - head;
    else if (tr + td.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = tr + td.offsetHeight - wrap.clientHeight;
    if (tl - rowh < wrap.scrollLeft) wrap.scrollLeft = tl - rowh;
    else if (tl + td.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = tl + td.offsetWidth - wrap.clientWidth;
  }
  function select(r, c, extend = false) {
    sel.r1 = r; sel.c1 = c;
    if (!extend) { sel.r0 = r; sel.c0 = c; }
    clampSel(); paint(); scrollTo(sel.r1, sel.c1);
  }

  /* ---------- изменения ---------- */
  function change(fn) {
    if (S.readOnly) return UI.edit(() => {});
    UI.edit(fn, '', {skip: ['inspector']});
    render();
  }
  function clearSelection() {
    const b = box(), cs = cols();
    change(d => { for (let r = b.top; r <= b.bottom; r++) for (let c = b.left; c <= b.right; c++) { const row = d.data.rows[r]; if (row) setValue(row, cs[c], cs[c].id === COPIES ? 1 : ''); } });
  }
  function toTsv() {
    const b = box(), cs = cols(), out = [];
    for (let r = b.top; r <= Math.min(b.bottom, rows().length - 1); r++) {
      const line = [];
      for (let c = b.left; c <= b.right; c++) {
        let v = getValue(rows()[r], cs[c]);
        if (cs[c].type === 'image' && /^asset:/.test(v)) v = S.doc.assets[v.slice(6)]?.name || '';
        line.push(/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
      }
      out.push(line.join('\t'));
    }
    return out.join('\r\n');
  }
  /* TSV из Excel: кавычки, переносы внутри ячеек. */
  function parseTsv(text) {
    const res = [[]]; let cur = '', q = false;
    text = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"' && cur === '') { q = true; continue; }
      if (ch === '\t') { res[res.length - 1].push(cur); cur = ''; continue; }
      if (ch === '\n') { res[res.length - 1].push(cur); res.push([]); cur = ''; continue; }
      cur += ch;
    }
    res[res.length - 1].push(cur);
    return res;
  }
  function paste(text) {
    if (!text) return;
    const data = parseTsv(text);
    if (!data.length || (data.length === 1 && data[0].length === 1 && data[0][0] === '' )) return;
    const b = box();
    const single = data.length === 1 && data[0].length === 1;
    // Вставили таблицу вместе со строкой заголовков («ФИО, Email…») — это импорт: показываем, куда что ляжет,
    // иначе заголовки стали бы записью, а столбцы легли бы по позиции, а не по смыслу.
    if (!single && data.length > 1 && XS.ImportMap) {
      const head = data[0].map(h => String(h).trim());
      // один столбец («Участник / Спикер / …») — только если первая строка в точности название столбца проекта и ниже не повторяется
      const width0 = head.filter(Boolean).length;
      const repeats = h => data.slice(1).some(l => l.some(c => XS.key(c) === XS.key(h)));
      const named = head.filter(h => h && !repeats(h) && (XS.Model.columnByName(S.doc, h) || (width0 > 1 && XS.ImportMap.group(h)))).length;
      if (named && named >= Math.ceil(width0 / 2)) {
        const width = Math.max(...data.map(l => l.length));
        const headers = Array.from({length: width}, (_, i) => head[i] || 'Столбец ' + (i + 1));
        const table = {headers, first: headers.map((_, i) => head[i] || ''), rows: data.slice(1).filter(l => l.some(c => String(c).trim())).map(l => headers.map((_, i) => String(l[i] ?? '').trim()))};
        UI.ImportDialog.open(table, {source: 'вставка с заголовками'});
        return;
      }
    }
    let added = 0, newCols = 0;
    change(d => {
      // одно значение в выделенный диапазон — заполнить весь диапазон (как Excel)
      if (single && (b.bottom > b.top || b.right > b.left)) {
        const cs = cols();
        for (let r = b.top; r <= Math.min(b.bottom, d.data.rows.length - 1); r++) for (let c = b.left; c <= b.right; c++) setValue(d.data.rows[r], cs[c], data[0][0]);
        return;
      }
      const width = Math.max(...data.map(l => l.length));
      // не хватает столбцов — добавляем новые (столбец «Экз.» всегда последний и данными не затирается)
      const D = d.data.columns.length;
      if (b.left < D) for (let need = b.left + width - D; need > 0; need--) {
        let n = d.data.columns.length + 1, name = 'Столбец ' + n;
        while (XS.Model.columnByName(d, name)) name = 'Столбец ' + (++n);
        XS.Model.addColumn(d, name); newCols++;
      }
      const cs = cols();
      data.forEach((line, i) => {
        const r = b.top + i;
        while (d.data.rows.length <= r) { d.data.rows.push({id: XS.uid('r'), cells: {}, copies: 1}); added++; }
        line.forEach((v, j) => { const col = cs[b.left + j]; if (col) setValue(d.data.rows[r], col, v); });
      });
      sel = {r0: b.top, c0: b.left, r1: b.top + data.length - 1, c1: Math.min(cs.length - 1, b.left + width - 1)};
    });
    UI.toast('Вставлено: ' + data.length + ' × ' + Math.max(...data.map(l => l.length)) + (added ? ', новых записей: ' + added : '') + (newCols ? ', новых столбцов: ' + newCols : '') + '. Отменить — Ctrl+Z.');
  }

  /* ---------- правка ячейки ---------- */
  function startEdit(initial) {
    if (S.readOnly) return;
    const col = cols()[sel.c1], row = rows()[sel.r1], td = cell(sel.r1, sel.c1);
    if (!td) return;
    if (col.type === 'image' && initial === undefined && row) { UI.Data.pickImage?.(row, col); return; }
    commit();
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'cell-edit'; input.spellcheck = false;
    input.value = initial !== undefined ? initial : getValue(row, col);
    td.classList.add('editing'); td.textContent = ''; td.append(input);
    editing = {r: sel.r1, c: sel.c1, input, original: getValue(row, col)};
    input.focus();
    if (initial === undefined) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('blur', () => commit());
  }
  function commit(cancel = false) {
    if (!editing) return false;
    const e = editing; editing = null;
    const v = e.input.value;
    if (!cancel && v !== e.original) {
      const col = cols()[e.c];
      if (col) { change(d => { while (d.data.rows.length <= e.r) d.data.rows.push({id: XS.uid('r'), cells: {}, copies: 1}); setValue(d.data.rows[e.r], col, v); }); return true; }
    }
    render();
    return true;
  }

  /* ---------- клавиши ---------- */
  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(true); focusGrid(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(); move(e.shiftKey ? -1 : 1, 0); focusGrid(); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(); move(0, e.shiftKey ? -1 : 1); focusGrid(); }
      else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) { e.preventDefault(); commit(); move(e.key === 'ArrowUp' ? -1 : 1, 0); focusGrid(); }
      return;
    }
    if (e.target.closest('thead')) return; // названия столбцов — обычные поля ввода
    const R = lastRow(), C = cols().length - 1;
    const step = (dr, dc) => { e.preventDefault(); if (e.shiftKey) select(sel.r1 + dr, sel.c1 + dc, true); else move(dr, dc); };
    if (mod && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); return moveColumn(e.key === 'ArrowLeft' ? -1 : 1); }
    switch (e.key) {
      case 'ArrowUp': return mod ? (e.preventDefault(), select(0, sel.c1, e.shiftKey)) : step(-1, 0);
      case 'ArrowDown': return mod ? (e.preventDefault(), select(Math.max(0, R - 1), sel.c1, e.shiftKey)) : step(1, 0);
      case 'ArrowLeft': return mod ? (e.preventDefault(), select(sel.r1, 0, e.shiftKey)) : step(0, -1);
      case 'ArrowRight': return mod ? (e.preventDefault(), select(sel.r1, C, e.shiftKey)) : step(0, 1);
      case 'Home': e.preventDefault(); return select(mod ? 0 : sel.r1, 0, e.shiftKey);
      case 'End': e.preventDefault(); return select(mod ? R : sel.r1, C, e.shiftKey);
      case 'PageDown': e.preventDefault(); return select(sel.r1 + 15, sel.c1, e.shiftKey);
      case 'PageUp': e.preventDefault(); return select(sel.r1 - 15, sel.c1, e.shiftKey);
      case 'Tab': e.preventDefault(); return move(0, e.shiftKey ? -1 : 1);
      case 'Enter': e.preventDefault(); return e.shiftKey ? move(-1, 0) : startEdit();
      case 'F2': e.preventDefault(); return startEdit();
      case 'Delete': case 'Backspace': e.preventDefault(); return clearSelection();
    }
    if (mod && e.code === 'KeyA') { e.preventDefault(); sel = {r0: 0, c0: 0, r1: Math.max(0, R - 1), c1: C}; return paint(); }
    if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? UI.redo() : UI.undo(); return render(); }
    if (mod && e.code === 'KeyY') { e.preventDefault(); UI.redo(); return render(); }
    if (!mod && !e.altKey && e.key.length === 1 && !e.isComposing) { e.preventDefault(); startEdit(e.key); }
  }
  function move(dr, dc) {
    let r = sel.r1 + dr, c = sel.c1 + dc;
    const C = cols().length - 1;
    if (c > C) { c = 0; r++; } else if (c < 0) { c = C; r--; }
    select(r, c);
  }
  /* Фокус — на невидимом поле внутри таблицы: так работают буфер обмена, раскладки и ввод с телефона. */
  function focusGrid() { const k = $('sheetKeys'); (k || $('dataTable').parentElement).focus({preventScroll: true}); }

  /* ---------- мышь ---------- */
  function cellFromEvent(e) {
    const td = e.target.closest('td[data-c]'), tr = td?.parentElement;
    return td && tr?.dataset.ri !== undefined ? {r: +tr.dataset.ri, c: +td.dataset.c} : null;
  }
  function onDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('input.row-check, select, .col-del, input.col-name, input.cell-edit, .col-grip')) return;
    const at = cellFromEvent(e);
    const rh = e.target.closest('th[data-rh]'), ch = e.target.closest('th[data-ch]'), corner = e.target.closest('th[data-corner]');
    if (!at && !rh && !ch && !corner) return;
    e.preventDefault();
    commit();
    // На сенсорном экране не открываем клавиатуру на каждое касание: второе касание активной ячейки — правка.
    if (coarse.matches) {
      if (at && !e.shiftKey && at.r === sel.r1 && at.c === sel.c1 && sel.r0 === sel.r1 && sel.c0 === sel.c1) { startEdit(); return; }
    } else focusGrid();
    const R = Math.max(0, rows().length - 1), C = cols().length - 1;
    if (corner) { sel = {r0: 0, c0: 0, r1: R, c1: C}; return paint(); }
    if (rh) { const r = +rh.dataset.rh; if (e.shiftKey) { sel.r1 = r; sel.c0 = 0; sel.c1 = C; } else sel = {r0: r, c0: 0, r1: r, c1: C}; dragMode = 'row'; }
    else if (ch) { const c = +ch.dataset.ch; if (e.shiftKey) { sel.c1 = c; sel.r0 = 0; sel.r1 = R; } else sel = {r0: 0, c0: c, r1: R, c1: c}; dragMode = 'col'; }
    else { if (e.shiftKey) { sel.r1 = at.r; sel.c1 = at.c; } else sel = {r0: at.r, c0: at.c, r1: at.r, c1: at.c}; dragMode = 'cell'; }
    dragging = true; clampSel(); paint();
  }
  function onMove(e) {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !$('dataTable').contains(el)) return;
    if (dragMode === 'row') { const th = el.closest('th[data-rh]') || el.closest('tr[data-ri]'); const r = th ? +(th.dataset.rh ?? th.dataset.ri) : null; if (r !== null && !isNaN(r)) { sel.r1 = r; paint(); } return; }
    if (dragMode === 'col') { const th = el.closest('th[data-ch]') || el.closest('td[data-c]'); const c = th ? +(th.dataset.ch ?? th.dataset.c) : null; if (c !== null && !isNaN(c)) { sel.c1 = c; paint(); } return; }
    const at = cellFromEvent({target: el});
    if (at && (at.r !== sel.r1 || at.c !== sel.c1)) { sel.r1 = at.r; sel.c1 = at.c; paint(); }
  }

  function init() {
    const t = $('dataTable'), wrap = t.parentElement;
    wrap.classList.add('sheet');
    const keys = document.createElement('textarea');
    keys.id = 'sheetKeys'; keys.className = 'sheet-keys-input'; keys.setAttribute('aria-label', 'Таблица записей'); keys.spellcheck = false; keys.autocomplete = 'off';
    wrap.prepend(keys);
    // ввод, который приходит без keydown (телефон, IME, вставка символа) — начинает правку ячейки
    keys.addEventListener('input', () => { const v = keys.value; keys.value = ''; if (v && !editing) startEdit(v); });
    wrap.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', onDown);
    t.addEventListener('pointerdown', colDragStart);
    document.addEventListener('pointermove', colDragMove);
    document.addEventListener('pointerup', colDragEnd);
    document.addEventListener('pointercancel', colDragEnd);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => { dragging = false; });
    wrap.addEventListener('dblclick', e => { const at = cellFromEvent(e); if (at) { select(at.r, at.c); startEdit(); } });
    // буфер обмена — системный: работает между Студией, Excel, Google Таблицами
    wrap.addEventListener('copy', e => { if (editing || e.target.closest('thead input') || !rows().length) return; e.preventDefault(); e.clipboardData.setData('text/plain', toTsv()); UI.toast('Скопировано ячеек: ' + countSel() + '.'); });
    wrap.addEventListener('cut', e => { if (editing || e.target.closest('thead input') || !rows().length) return; e.preventDefault(); e.clipboardData.setData('text/plain', toTsv()); clearSelection(); });
    wrap.addEventListener('paste', e => { if (editing || e.target.closest('thead input')) return; e.preventDefault(); paste(e.clipboardData.getData('text/plain')); });
    // галочки записей, названия и типы столбцов
    t.addEventListener('change', UI.safe(e => {
      const el = e.target;
      if (el.dataset.col) { const col = S.doc.data.columns.find(c => c.id === el.dataset.col); try { UI.Data.renameColumn(col, el.value); } catch (err) { el.value = col.name; throw err; } render(); }
      else if (el.dataset.type) { UI.edit(() => { S.doc.data.columns.find(c => c.id === el.dataset.type).type = el.value; }, '', {skip: []}); render(); }
      else if (el.dataset.sel) { el.checked ? S.selectedRows.add(el.dataset.sel) : S.selectedRows.delete(el.dataset.sel); UI.Data.renderList(); status(); }
      else if ('all' in el.dataset) { for (const r of rows()) el.checked ? S.selectedRows.add(r.id) : S.selectedRows.delete(r.id); render(); UI.Data.renderList(); }
    }));
    t.addEventListener('keydown', e => { if (e.target.classList.contains('col-name') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); focusGrid(); } });
    t.addEventListener('click', e => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const id = b.dataset.del, col = S.doc.data.columns.find(c => c.id === id);
      if (!confirm('Удалить столбец «' + col.name + '» вместе с данными?')) return;
      UI.edit(d => { d.data.columns = d.data.columns.filter(c => c.id !== id); for (const r of d.data.rows) delete r.cells[id]; });
      render();
    });
  }
  /* ---------- перестановка столбцов перетаскиванием (за «ручку» в заголовке, как в Excel) ---------- */
  let colDrag = null;
  function colDragStart(e) {
    const grip = e.target.closest('.col-grip'); if (!grip || S.readOnly) return;
    e.preventDefault(); e.stopPropagation();
    commit();
    colDrag = {from: +grip.dataset.grip, to: +grip.dataset.grip, id: e.pointerId};
    grip.setPointerCapture?.(e.pointerId);
    $('dataTable').classList.add('col-dragging');
    $('dataTable').querySelector(`thead th[data-ch="${colDrag.from}"]`)?.classList.add('col-moving');
  }
  function colDragMove(e) {
    if (!colDrag) return;
    const ths = [...$('dataTable').querySelectorAll('thead th.colh:not(.copies)')];
    let to = ths.length;
    for (let i = 0; i < ths.length; i++) { const r = ths[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { to = i; break; } }
    colDrag.to = to;
    ths.forEach((th, i) => { th.classList.toggle('drop-before', i === to && to !== colDrag.from && to !== colDrag.from + 1); th.classList.toggle('drop-after', i === ths.length - 1 && to === ths.length && colDrag.from !== ths.length - 1); });
    // край окна — прокрутка таблицы
    const wrap = $('dataTable').parentElement, wr = wrap.getBoundingClientRect();
    if (e.clientX > wr.right - 40) wrap.scrollLeft += 18; else if (e.clientX < wr.left + 60) wrap.scrollLeft -= 18;
  }
  function colDragEnd() {
    if (!colDrag) return;
    const {from, to} = colDrag; colDrag = null;
    $('dataTable').classList.remove('col-dragging');
    let target = to > from ? to - 1 : to;
    if (target === from) return render();
    const activeId = cols()[sel.c1]?.id;
    change(d => { const [c] = d.data.columns.splice(from, 1); d.data.columns.splice(target, 0, c); });
    // выделение едет вместе со столбцом
    const ci = cols().findIndex(c => c.id === activeId);
    if (ci >= 0) select(sel.r1, ci);
    UI.Data.renderList();
  }
  /* Ctrl+Shift+← / → — сдвинуть столбец с активной ячейкой. */
  function moveColumn(dir) {
    const C = S.doc.data.columns.length, from = sel.c1, to = from + dir;
    if (from >= C || to < 0 || to >= C) return;
    change(d => { const [c] = d.data.columns.splice(from, 1); d.data.columns.splice(to, 0, c); });
    select(sel.r1, to);
  }

  const countSel = () => { const b = box(); return (b.bottom - b.top + 1) * (b.right - b.left + 1); };
  /* Записи, которых касается выделение (для «Удалить строки»). */
  function selectedRowIds() {
    if (S.selectedRows.size) return [...S.selectedRows];
    if (!rows().length) return [];
    const b = box(); return rows().slice(b.top, b.bottom + 1).map(r => r.id);
  }
  function open() { sel = {r0: S.row || 0, c0: 0, r1: S.row || 0, c1: 0}; render(); requestAnimationFrame(() => { if (!coarse.matches) focusGrid(); scrollTo(sel.r1, 0); }); }

  UI.Sheet = {init, render, open, paste, parseTsv, selectedRowIds, select, get selection() { return box(); }};
})(typeof window !== 'undefined' ? window : globalThis);
