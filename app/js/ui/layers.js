/* XSatsu Студия · панель «Слои»: дерево элементов стороны (группы — папки), мультивыделение,
 * переименование, порядок перетаскиванием, видимость и закрепление. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const I = (n, s) => XS.Icons.icon(n, s);
  const TYPE_ICON = {text: 'text', image: 'image', rect: 'rect', line: 'line', path: 'path', qr: 'qr', barcode: 'barcode'};
  let anchor = null; // для Shift-клика диапазоном

  function typeIcon(el) { return el.type === 'rect' && el.shape === 'ellipse' ? 'ellipse' : el.type === 'text' && /\{[^}]+\}/.test(el.text) ? 'field' : TYPE_ICON[el.type]; }

  function render() {
    const list = $('layerList');
    if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // идёт переименование
    const warn = new Set(S.warnings.map(w => w.el)), sel = new Set(S.selection);
    const items = [];
    const units = UI.Sel.units().slice().reverse(); // сверху вниз
    for (const u of units) {
      if (u.group) {
        const g = UI.side().groups.find(x => x.id === u.group);
        const all = u.els.every(e => sel.has(e.id)), some = u.els.some(e => sel.has(e.id));
        const hidden = u.els.every(e => !e.visible), locked = u.els.every(e => e.locked);
        const li = document.createElement('li');
        li.className = 'layer group-row' + (all ? ' active' : some ? ' partial' : '');
        li.dataset.group = u.group; li.draggable = true;
        li.innerHTML = `<button class="twisty" data-act="collapse" title="Свернуть/развернуть">${I(g?.collapsed ? 'chevronRight' : 'chevronDown', 14)}</button><span class="type">${I('group', 15)}</span><span class="name">${XS.esc(g?.name || 'Группа')}<small>${u.els.length}</small></span>` +
          tools(locked, hidden);
        items.push(li);
        if (!g?.collapsed) for (const el of u.els.slice().reverse()) items.push(row(el, sel, warn, true));
      } else items.push(row(u.els[0], sel, warn, false));
    }
    list.replaceChildren(...items);
    if (!items.length) list.innerHTML = '<li class="empty-state">На этой стороне пока пусто.<br>Добавьте текст или поле кнопками выше — или перетащите на макет PDF, картинку, шрифт.</li>';
  }
  function tools(locked, hidden) {
    return `<span class="tools"><button data-act="lock" class="${locked ? 'on' : ''}" title="${locked ? 'Открепить' : 'Закрепить'} (Ctrl+Shift+L)">${I(locked ? 'lock' : 'unlock', 14)}</button>` +
      `<button data-act="eye" class="${hidden ? 'on' : ''}" title="${hidden ? 'Показать' : 'Скрыть'} (Ctrl+Shift+H)">${I(hidden ? 'eyeOff' : 'eye', 14)}</button></span>`;
  }
  function row(el, sel, warn, nested) {
    const li = document.createElement('li');
    li.className = 'layer' + (sel.has(el.id) ? ' active' : '') + (el.visible ? '' : ' hidden-el') + (nested ? ' nested' : '') + (el.locked ? ' is-locked' : '');
    li.draggable = true; li.dataset.id = el.id;
    const preview = el.type === 'text' ? el.text.replace(/\s+/g, ' ').slice(0, 40) : el.type === 'qr' || el.type === 'barcode' ? el.data.slice(0, 40) : el.type === 'image' && /^\{/.test(el.src) ? el.src : '';
    li.innerHTML = `<span class="type">${I(typeIcon(el), 15)}</span><span class="name">${XS.esc(el.name)}${preview && preview !== el.name ? '<small>' + XS.esc(preview) + '</small>' : ''}</span>` +
      (warn.has(el.id) ? `<span class="warn-dot" title="Есть предупреждения">${I('warn', 14)}</span>` : '') + tools(el.locked, !el.visible);
    return li;
  }

  /* ---------- добавление ---------- */
  function center(w, h) { return {x: +((S.doc.page.width - w) / 2).toFixed(2), y: +((S.doc.page.height - h) / 2).toFixed(2), w, h}; }
  function insert(el) { UI.edit(() => { UI.side().elements.push(el); S.selection = [el.id]; }); return el; }
  function add(type) {
    const W = S.doc.page.width, H = S.doc.page.height, M = XS.Model;
    if (type === 'text') return insert(M.element('text', {...center(W * 0.7, H * 0.08), text: 'Новый текст', size: Math.max(10, Math.round(W / 12))}));
    if (type === 'field') {
      const col = S.doc.data.columns.find(c => c.type !== 'image');
      return insert(M.element('text', {...center(W * 0.8, H * 0.1), name: col ? col.name : 'Поле', text: '{' + (col ? col.name : 'ФИО') + '}', bold: true, size: Math.max(12, Math.round(W / 9))}));
    }
    if (type === 'rect') return insert(M.element('rect', {...center(W * 0.4, H * 0.2), fill: '#eef0ff', stroke: '#4f46e5'}));
    if (type === 'line') return insert(M.element('line', {...center(W * 0.5, 0)}));
    if (type === 'qr') {
      const link = S.doc.data.columns.find(c => /ссылк|url|link|qr/i.test(c.name));
      const side = Math.max(15, Math.round(Math.min(W, S.doc.page.height) * 0.18));
      return insert(M.element('qr', {...center(side, side), name: 'QR-код', data: link ? '{' + link.name + '}' : 'https://o.utmns.ru'}));
    }
    if (type === 'barcode') {
      const code = S.doc.data.columns.find(c => /штрих|код|билет|номер|barcode/i.test(c.name));
      const w = Math.max(35, Math.round(W * 0.45));
      return insert(M.element('barcode', {...center(w, Math.max(12, Math.round(w * 0.3))), name: 'Штрихкод', data: code ? '{' + code.name + '}' : '{№:000000}'}));
    }
    if (type === 'image') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*,.pdf';
      input.onchange = UI.safe(() => input.files[0] && addImage(input.files[0]));
      input.click();
    }
  }
  async function addImage(file) {
    const a = await UI.busy('Загружаем ' + file.name + '…', () => XS.Assets.fromFile(file));
    const W = S.doc.page.width, w = W * 0.4, ratio = a.pages ? a.pages[0].height / a.pages[0].width : (a.height || 1) / (a.width || 1);
    let el;
    UI.edit(d => {
      const stored = XS.Model.addAsset(d, a);
      el = XS.Model.element('image', {...center(w, w * ratio), name: file.name.replace(/\.[^.]+$/, ''), src: 'asset:' + stored.id, fit: 'contain'});
      UI.side().elements.push(el); S.selection = [el.id];
    });
    return el;
  }

  /* ---------- переименование (F2 или двойной клик) ---------- */
  function rename(li) {
    li = li || $('layerList').querySelector('.layer.active');
    if (!li) return;
    const nameEl = li.querySelector('.name');
    const gid = li.dataset.group, el = gid ? null : UI.element(li.dataset.id);
    const current = gid ? UI.side().groups.find(g => g.id === gid)?.name : el?.name;
    const input = document.createElement('input');
    input.type = 'text'; input.value = current || ''; input.className = 'rename';
    nameEl.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const v = input.value.trim();
      input.blur();
      if (save && v && v !== current) { if (gid) UI.Sel.renameGroup(gid, v); else UI.edit(() => { el.name = v; }); }
      else render();
    };
    input.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); };
    input.onblur = () => finish(true);
  }

  function clickRow(e, li) {
    const additive = e.ctrlKey || e.metaKey;
    const ids = li.dataset.group ? UI.Sel.members(li.dataset.group).map(m => m.id) : [li.dataset.id];
    if (e.shiftKey && anchor) {
      // Диапазон по видимому порядку строк.
      const rows = [...$('layerList').querySelectorAll('.layer[data-id]')].map(r => r.dataset.id);
      const a = rows.indexOf(anchor), b = rows.indexOf(ids[0]);
      if (a >= 0 && b >= 0) { UI.select(rows.slice(Math.min(a, b), Math.max(a, b) + 1), 'add'); return; }
    }
    anchor = ids[0];
    UI.select(ids, additive ? 'toggle' : 'set');
  }

  function init() {
    document.querySelectorAll('[data-add]').forEach(b => { b.onclick = UI.safe(() => add(b.dataset.add)); });
    const list = $('layerList');
    list.addEventListener('click', e => {
      const li = e.target.closest('.layer'); if (!li) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      const els = li.dataset.group ? UI.Sel.members(li.dataset.group) : [UI.element(li.dataset.id)].filter(Boolean);
      if (!els.length) return;
      if (act === 'eye') { const v = !els.every(x => x.visible); UI.edit(() => els.forEach(x => { x.visible = v; })); }
      else if (act === 'lock') { const v = !els.every(x => x.locked); UI.edit(() => els.forEach(x => { x.locked = v; })); }
      else if (act === 'collapse') { const g = UI.side().groups.find(x => x.id === li.dataset.group); UI.edit(() => { g.collapsed = !g.collapsed; }, '', {skip: ['stage', 'inspector', 'data']}); }
      else if (e.target.tagName !== 'INPUT') clickRow(e, li);
    });
    list.addEventListener('dblclick', e => { const li = e.target.closest('.layer'); if (li && !e.target.closest('[data-act]')) rename(li); });
    list.addEventListener('contextmenu', e => {
      const li = e.target.closest('.layer'); if (!li) return;
      e.preventDefault();
      const ids = li.dataset.group ? UI.Sel.members(li.dataset.group).map(m => m.id) : [li.dataset.id];
      if (!ids.every(id => S.selection.includes(id))) UI.select(ids);
      UI.Menu.open(e.clientX, e.clientY, 'element');
    });
    // Перетаскивание строк: элемент или целая группа встаёт над целью.
    let drag = null;
    list.addEventListener('dragstart', e => { const li = e.target.closest('.layer'); if (!li) return; drag = li.dataset.group ? {group: li.dataset.group} : {id: li.dataset.id}; e.dataTransfer.effectAllowed = 'move'; });
    list.addEventListener('dragover', e => { const li = e.target.closest('.layer'); if (!li || !drag) return; e.preventDefault(); list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); li.classList.add('drag-over'); });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const li = e.target.closest('.layer'); if (!li || !drag) return;
      const s = UI.side();
      const moving = drag.group ? s.elements.filter(x => x.group === drag.group) : s.elements.filter(x => x.id === drag.id);
      const target = li.dataset.group ? s.elements.filter(x => x.group === li.dataset.group).pop() : s.elements.find(x => x.id === li.dataset.id);
      if (!target || moving.includes(target)) { drag = null; return; }
      UI.edit(() => {
        const rest = s.elements.filter(x => !moving.includes(x));
        const at = rest.indexOf(target) + 1;
        rest.splice(at, 0, ...moving);
        // Элемент, брошенный на элемент группы, входит в группу; брошенный на верх списка — выходит.
        if (!drag.group && moving.length === 1) moving[0].group = li.dataset.group ? '' : target.group || '';
        s.elements = rest;
        XS.Model.cleanGroups(s);
      });
      drag = null;
    });
    list.addEventListener('dragend', () => { drag = null; list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
  }

  UI.Layers = {init, render, add, addImage, rename,
    remove: id => { if (id) S.selection = [id]; UI.Sel.remove(); },
    duplicate: id => { if (id) S.selection = [id]; UI.Sel.duplicate(); },
    move: (id, delta) => { if (id) S.selection = [id]; UI.Sel.order(delta > 0 ? 'up' : 'down'); }};
})(typeof window !== 'undefined' ? window : globalThis);
