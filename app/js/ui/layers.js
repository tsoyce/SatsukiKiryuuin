/* XSatsu Студия · панель слоёв: список элементов стороны, добавление, порядок, видимость. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const ICON = {text: 'T', image: '▣', rect: '□', line: '─', path: '✎'};

  function render() {
    const list = $('layerList'), els = UI.side().elements;
    const warn = new Set(S.warnings.map(w => w.el));
    const items = [];
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      const li = document.createElement('li');
      li.className = 'layer' + (el.id === S.sel ? ' active' : '') + (el.visible ? '' : ' hidden-el');
      li.draggable = true; li.dataset.id = el.id;
      const preview = el.type === 'text' ? el.text.replace(/\s+/g, ' ').slice(0, 40) : el.type === 'image' && /^\{/.test(el.src) ? el.src : '';
      li.innerHTML = `<span class="type">${ICON[el.type] || '?'}</span><span class="name">${XS.esc(el.name)}${preview && preview !== el.name ? '<small>' + XS.esc(preview) + '</small>' : ''}</span>` +
        (warn.has(el.id) ? '<span class="warn-dot" title="Есть предупреждения">⚠</span>' : '') +
        `<button data-act="lock" title="${el.locked ? 'Открепить' : 'Закрепить (не двигается мышью)'}">${el.locked ? '🔒' : '🔓'}</button>` +
        `<button data-act="eye" title="${el.visible ? 'Скрыть' : 'Показать'}">${el.visible ? '👁' : '◌'}</button>`;
      items.push(li);
    }
    list.replaceChildren(...items);
    if (!items.length) list.innerHTML = '<li class="muted small">На этой стороне пока нет элементов. Добавьте текст или поле кнопками выше.</li>';
  }

  function center(w, h) { return {x: +((S.doc.page.width - w) / 2).toFixed(2), y: +((S.doc.page.height - h) / 2).toFixed(2), w, h}; }
  function insert(el) {
    UI.edit(() => { UI.side().elements.push(el); S.sel = el.id; });
    return el;
  }
  function add(type) {
    const W = S.doc.page.width, H = S.doc.page.height, M = XS.Model;
    if (type === 'text') return insert(M.element('text', {...center(W * 0.7, H * 0.08), text: 'Новый текст', size: Math.max(10, Math.round(W / 12))}));
    if (type === 'field') {
      const col = S.doc.data.columns.find(c => c.type !== 'image');
      return insert(M.element('text', {...center(W * 0.8, H * 0.1), name: col ? col.name : 'Поле', text: '{' + (col ? col.name : 'ФИО') + '}', bold: true, size: Math.max(12, Math.round(W / 9))}));
    }
    if (type === 'rect') return insert(M.element('rect', {...center(W * 0.4, H * 0.2), fill: '#eef0ff', stroke: '#4f46e5'}));
    if (type === 'line') return insert(M.element('line', {...center(W * 0.5, 0)}));
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
      UI.side().elements.push(el); S.sel = el.id;
    });
    return el;
  }
  function remove(id) {
    UI.edit(() => { const s = UI.side(); s.elements = s.elements.filter(e => e.id !== id); if (S.sel === id) S.sel = null; });
  }
  function duplicate(id) {
    const el = UI.element(id);
    if (!el) return;
    const copy = XS.Model.normalizeElement({...XS.clone(el), id: undefined, x: el.x + 3, y: el.y + 3, name: el.name + ' (копия)'});
    UI.edit(() => { const s = UI.side(); s.elements.splice(s.elements.indexOf(el) + 1, 0, copy); S.sel = copy.id; });
  }
  function move(id, delta) {
    UI.edit(() => {
      const arr = UI.side().elements, i = arr.findIndex(e => e.id === id), j = Math.max(0, Math.min(arr.length - 1, i + delta));
      if (i < 0 || i === j) return;
      const [el] = arr.splice(i, 1); arr.splice(j, 0, el);
    });
  }

  function init() {
    document.querySelectorAll('[data-add]').forEach(b => { b.onclick = UI.safe(() => add(b.dataset.add)); });
    const list = $('layerList');
    list.addEventListener('click', e => {
      const li = e.target.closest('.layer'); if (!li) return;
      const el = UI.element(li.dataset.id); if (!el) return;
      const act = e.target.dataset.act;
      if (act === 'eye') UI.edit(() => { el.visible = !el.visible; });
      else if (act === 'lock') UI.edit(() => { el.locked = !el.locked; });
      else UI.select(el.id);
    });
    let dragId = null;
    list.addEventListener('dragstart', e => { dragId = e.target.closest('.layer')?.dataset.id; e.dataTransfer.effectAllowed = 'move'; });
    list.addEventListener('dragover', e => { const li = e.target.closest('.layer'); if (!li || !dragId) return; e.preventDefault(); list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); li.classList.add('drag-over'); });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const li = e.target.closest('.layer'); if (!li || !dragId || li.dataset.id === dragId) return;
      UI.edit(() => {
        const arr = UI.side().elements, from = arr.findIndex(x => x.id === dragId);
        const [el] = arr.splice(from, 1);
        const to = arr.findIndex(x => x.id === li.dataset.id);
        arr.splice(to + 1, 0, el); // в списке сверху = ближе к зрителю → вставляем над целью
      });
      dragId = null;
    });
    list.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
  }

  UI.Layers = {init, render, add, addImage, remove, duplicate, move};
})(typeof window !== 'undefined' ? window : globalThis);
