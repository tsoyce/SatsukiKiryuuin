/* XSatsu Студия · окно «Импорт списка»: какой столбец файла — в какой столбец проекта.
 * Открывается для файла (Excel/ODS/CSV), вставки из Excel и Google Таблицы. Логика — XS.ImportMap (ядро). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S;
  const IM = () => XS.ImportMap;
  let dlg = null, state = null;

  const REASON = {name: 'по названию', data: 'по данным', values: 'те же значения', 'new': 'новый столбец', empty: 'пустой', memory: 'как в прошлый раз'};
  const KIND = {fio: 'ФИО', email: 'почта', gender: 'пол', image: 'фото', url: 'ссылки', number: 'числа', date: 'даты', text: 'текст'};
  const MODES = [
    ['append', 'Добавить новыми записями', 'Строки файла станут новыми записями в конце списка.'],
    ['update', 'Обновить совпадающие, новых добавить', 'Записи узнаются по столбцу-ключу: у найденных дописываются значения, остальные добавляются.'],
    ['fill', 'Вписать по порядку в текущие записи', 'Первая строка файла — в запись 1, вторая — в запись 2… Лишние строки — новыми записями.'],
    ['replace', 'Заменить все записи', 'Текущие записи удаляются, список берётся из файла.']
  ];

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'dialog wide import-dialog';
    dlg.innerHTML = `<header class="dialog-head"><h2>Импорт списка</h2><span class="muted small" data-src></span><button class="btn icon" data-close aria-label="Закрыть">${XS.Icons.icon('close')}</button></header>
      <div class="dialog-body">
        <label class="check"><input type="checkbox" data-header> Первая строка — названия столбцов</label>
        <h4 class="im-h">Куда класть столбцы</h4>
        <div class="im-map" data-map></div>
        <h4 class="im-h">Как добавить</h4>
        <div class="im-modes" data-modes></div>
        <p class="im-summary" data-summary></p>
        <details class="im-prev"><summary>Предпросмотр первых строк</summary><div class="table-wrap"><table class="data-table im-table" data-prev></table></div></details>
      </div>
      <footer class="dialog-foot"><span class="muted small">Отменить импорт потом — Ctrl+Z.</span><span class="spacer"></span><button class="btn" data-close>Отмена</button><button class="btn primary" data-go>Загрузить</button></footer>`;
    document.body.append(dlg);
    dlg.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => dlg.close(); });
    dlg.querySelector('[data-header]').onchange = e => { state.plan = guess(e.target.checked); render(); };
    dlg.querySelector('[data-go]').onclick = UI.safe(go);
    dlg.addEventListener('close', () => { if (state?.resolve) state.resolve(null); state = null; });
  }

  /* Угадать и поверх — запомненные в проекте выборы для тех же названий столбцов. */
  function guess(hasHeader) {
    const plan = IM().guess(S.doc, state.table, hasHeader === undefined ? {} : {hasHeader});
    const memory = S.doc.output.importMemory || {};
    if (plan.hasHeader) for (const c of plan.columns) {
      const m = memory[XS.key(c.header)];
      if (!m || c.reason === 'empty') continue;
      if (m === '-') { c.target = 'skip'; c.reason = 'memory'; continue; }
      if (m === IM().COPIES) { c.target = m; c.reason = 'memory'; continue; }
      const col = XS.Model.columnByName(S.doc, m);
      if (col && !plan.columns.some(o => o !== c && o.target === col.id)) { c.target = col.id; c.reason = 'memory'; }
    }
    if (state.mode) plan.mode = state.mode;
    return plan;
  }

  function targetOptions(c) {
    const cols = S.doc.data.columns;
    const taken = new Set(state.plan.columns.filter(o => o !== c).map(o => o.target));
    return cols.map(col => `<option value="${col.id}" ${c.target === col.id ? 'selected' : ''}>${XS.esc(col.name)}${col.type === 'image' ? ' (картинка)' : ''}${taken.has(col.id) ? ' · уже занят' : ''}</option>`).join('')
      + `<option value="new" ${c.target === 'new' ? 'selected' : ''}>＋ новый столбец</option>`
      + `<option value="${IM().COPIES}" ${c.target === IM().COPIES ? 'selected' : ''}>Экз. (сколько печатать)</option>`
      + `<option value="skip" ${c.target === 'skip' ? 'selected' : ''}>— не загружать —</option>`;
  }

  function render() {
    const p = state.plan;
    dlg.querySelector('[data-header]').checked = p.hasHeader;
    const map = dlg.querySelector('[data-map]');
    map.innerHTML = p.columns.map((c, i) => `<div class="im-row${c.target === 'skip' ? ' off' : ''}">
        <div class="im-src"><b>${XS.esc(p.hasHeader ? c.header : 'Столбец ' + (i + 1))}</b>${c.kind && c.kind !== 'text' ? `<span class="im-kind">${KIND[c.kind] || ''}</span>` : ''}
          <span class="muted small">${c.sample.map(v => XS.esc(String(v).slice(0, 40))).join(' · ') || 'пусто'}</span></div>
        <span class="im-arrow">${XS.Icons.icon('chevronRight', 16)}</span>
        <div class="im-dst"><select data-t="${i}">${targetOptions(c)}</select>
          ${c.target === 'new' ? `<input type="text" data-n="${i}" value="${XS.esc(c.newName)}" placeholder="Название столбца">` : ''}
          <span class="im-why muted small">${REASON[c.reason] && c.target !== 'skip' ? REASON[c.reason] : ''}</span></div>
      </div>`).join('');
    map.querySelectorAll('[data-t]').forEach(sel => {
      sel.onchange = () => {
        const c = p.columns[+sel.dataset.t], v = sel.value;
        // столбец проекта может принять только один столбец файла: прежний владелец уходит в «новый»
        if (v !== 'new' && v !== 'skip' && v !== IM().COPIES) for (const o of p.columns) if (o !== c && o.target === v) { o.target = 'new'; o.newName = o.newName || (p.hasHeader ? o.header : 'Столбец'); o.reason = 'new'; }
        c.target = v; c.reason = '';
        if (v === 'new' && !c.newName) c.newName = p.hasHeader ? c.header : 'Столбец ' + (c.index + 1);
        if (p.key && !p.columns.some(o => o.target === p.key)) p.key = '';
        if (!p.key) p.key = keyFallback();
        render();
      };
    });
    map.querySelectorAll('[data-n]').forEach(inp => { inp.oninput = () => { p.columns[+inp.dataset.n].newName = inp.value; summary(); }; });

    const keyCols = p.columns.filter(c => c.target !== 'skip' && c.target !== 'new' && c.target !== IM().COPIES).map(c => S.doc.data.columns.find(x => x.id === c.target)).filter(c => c && c.type !== 'image');
    const keySel = `<select data-key>${keyCols.map(c => `<option value="${c.id}" ${c.id === p.key ? 'selected' : ''}>${XS.esc(c.name)}</option>`).join('') || '<option value="">нет общих столбцов</option>'}</select>`;
    const modes = dlg.querySelector('[data-modes]');
    modes.innerHTML = MODES.map(([id, label, hint]) => {
      const disabled = (id === 'update' && !keyCols.length) || ((id === 'update' || id === 'fill') && !S.doc.data.rows.length);
      return `<label class="im-mode${p.mode === id ? ' on' : ''}${disabled ? ' disabled' : ''}"><input type="radio" name="imMode" value="${id}" ${p.mode === id ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span><b>${label}</b>${id === 'update' ? ' · ключ ' + keySel : ''}<br><span class="muted small">${hint}</span></span></label>`;
    }).join('') + (p.mode === 'append' || p.mode === 'replace'
      ? `<label class="check small"><input type="checkbox" data-dup ${p.skipDuplicates !== false ? 'checked' : ''}> пропускать повторы${keyCols.length ? ' (по столбцу «' + XS.esc(S.doc.data.columns.find(c => c.id === p.key)?.name || keyCols[0].name) + '»)' : ''}</label>` : '');
    modes.querySelectorAll('input[name=imMode]').forEach(r => { r.onchange = () => { p.mode = state.mode = r.value; render(); }; });
    const ks = modes.querySelector('[data-key]'); if (ks) { ks.onchange = () => { p.key = ks.value; summary(); }; ks.onclick = e => e.stopPropagation(); }
    const dup = modes.querySelector('[data-dup]'); if (dup) dup.onchange = () => { p.skipDuplicates = dup.checked; summary(); };
    summary();
    preview();
  }
  function keyFallback() {
    const c = state.plan.columns.find(o => o.target !== 'skip' && o.target !== 'new' && o.target !== IM().COPIES && S.doc.data.columns.find(x => x.id === o.target)?.type !== 'image');
    return c ? c.target : '';
  }

  function summary() {
    const p = state.plan, el = dlg.querySelector('[data-summary]');
    if (!p.columns.some(c => c.target !== 'skip')) { el.textContent = 'Выберите хотя бы один столбец.'; dlg.querySelector('[data-go]').disabled = true; return; }
    dlg.querySelector('[data-go]').disabled = false;
    const r = IM().preview(S.doc, state.table, p);
    const parts = [];
    if (p.mode === 'replace') parts.push('записей станет: ' + r.added);
    else { if (r.added) parts.push('добавится записей: ' + r.added); if (r.updated) parts.push('обновится: ' + r.updated); }
    if (r.skipped) parts.push('повторов пропущено: ' + r.skipped);
    if (r.created) parts.push('новых столбцов: ' + r.created);
    el.innerHTML = XS.Icons.icon('check', 15) + ' ' + XS.esc(parts.join(' · ') || 'ничего не изменится');
  }
  function preview() {
    const p = state.plan, rows = IM().dataRows(state.table, p.hasHeader).slice(0, 6);
    const name = c => c.target === 'skip' ? '' : c.target === 'new' ? c.newName + ' (новый)' : c.target === IM().COPIES ? 'Экз.' : S.doc.data.columns.find(x => x.id === c.target)?.name || '';
    const cols = p.columns.filter(c => c.target !== 'skip');
    dlg.querySelector('[data-prev]').innerHTML = '<thead><tr>' + cols.map(c => `<th>${XS.esc(name(c))}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + cols.map(c => `<td>${XS.esc(String(r[c.index] ?? '').slice(0, 60))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  }

  function go() {
    const p = state.plan;
    for (const c of p.columns) if (c.target === 'new' && !String(c.newName || '').trim()) throw new Error('Укажите название нового столбца.');
    let result;
    UI.edit(d => {
      result = IM().apply(d, state.table, p);
      // запоминаем выбор для тех же названий: в следующий раз тот же файл ляжет так же
      if (p.hasHeader) {
        const mem = {...(d.output.importMemory || {})};
        for (const c of p.columns) {
          const col = c.target === 'new' ? XS.Model.columnByName(d, c.newName) : d.data.columns.find(x => x.id === c.target);
          mem[XS.key(c.header)] = c.target === 'skip' ? '-' : c.target === IM().COPIES ? IM().COPIES : col ? col.name : undefined;
        }
        d.output.importMemory = Object.fromEntries(Object.entries(mem).slice(-80));
      }
      if (state.onApply) state.onApply(d);
    });
    const resolve = state.resolve; state.resolve = null;
    dlg.close();
    if (UI.S.doc && document.getElementById('tableDialog')?.open) UI.Sheet.render();
    const parts = [];
    if (result.added) parts.push('добавлено записей: ' + result.added);
    if (result.updated) parts.push('обновлено: ' + result.updated);
    if (result.skipped) parts.push('повторов пропущено: ' + result.skipped);
    UI.toast((parts.join(', ') || 'Ничего не изменилось') + '. Отменить — Ctrl+Z.');
    resolve(result);
  }

  /* table — {headers, first, rows}; opts: {source: 'файл «…»', replace: bool, onApply(doc)} → Promise результата (или null — отмена). */
  function open(table, opts = {}) {
    if (S.readOnly) return UI.edit(() => {});
    if (!table || (!table.rows.length && !(table.first || table.headers).some(Boolean))) throw new Error('В таблице нет данных.');
    if (!dlg) build();
    if (dlg.open) dlg.close();
    return new Promise(resolve => {
      state = {table, resolve, onApply: opts.onApply, mode: ''};
      state.plan = guess();
      if (opts.replace) state.plan.mode = state.mode = 'replace';
      dlg.querySelector('[data-src]').textContent = opts.source || '';
      render();
      dlg.showModal();
    });
  }

  UI.ImportDialog = {open};
})(typeof window !== 'undefined' ? window : globalThis);
