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

  /* ---------- таблица целиком ---------- */
  function renderTable() {
    const t = $('dataTable'), doc = S.doc, cols = doc.data.columns;
    const head = `<thead><tr><th class="n"><input type="checkbox" data-all></th><th class="n">№</th>${cols.map(c => `<th><div style="display:flex"><input type="text" data-col="${c.id}" value="${XS.esc(c.name)}" title="Название столбца = имя поля {…}"><select data-type="${c.id}" title="Тип"><option value="text">текст</option><option value="image" ${c.type === 'image' ? 'selected' : ''}>картинка</option></select><button class="col-del" data-del="${c.id}" title="Удалить столбец">✕</button></div></th>`).join('')}<th class="n">Экз.</th></tr></thead>`;
    const body = doc.data.rows.map((r, i) => `<tr data-r="${r.id}"><td class="n"><input type="checkbox" data-sel ${S.selectedRows.has(r.id) ? 'checked' : ''}></td><td class="n">${i + 1}</td>${cols.map(c => {
      const v = String(r.cells[c.id] ?? '');
      if (c.type === 'image') { const a = /^asset:/.test(v) ? doc.assets[v.slice(6)] : null; return `<td>${a && !XS.Assets.isPdf(a) ? `<img src="${a.data}" alt="">` : XS.esc(a ? a.name : v)}</td>`; }
      return `<td><input type="text" data-cell="${c.id}" value="${XS.esc(v)}"></td>`;
    }).join('')}<td class="copies"><input type="number" min="0" max="999" data-copies value="${r.copies}"></td></tr>`).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
  }
  function tableEvents() {
    const t = $('dataTable');
    t.addEventListener('change', UI.safe(e => {
      const el = e.target, tr = el.closest('tr'), row = tr && S.doc.data.rows.find(r => r.id === tr.dataset.r);
      if (el.dataset.col) { const col = S.doc.data.columns.find(c => c.id === el.dataset.col); try { renameColumn(col, el.value); } catch (err) { el.value = col.name; throw err; } }
      else if (el.dataset.type) UI.edit(() => { S.doc.data.columns.find(c => c.id === el.dataset.type).type = el.value; }, '', {skip: []});
      else if (el.dataset.cell && row) UI.edit(() => { row.cells[el.dataset.cell] = el.value; }, '', {skip: ['inspector']});
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
  }

  async function importFile(file) {
    const text = await file.text();
    const table = XS.Import.parseTable(text);
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
