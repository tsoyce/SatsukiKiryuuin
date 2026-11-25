/* XSatsu Студия · выделение и действия над ним: группы, порядок, выравнивание, буфер обмена.
 * Работает с одним или несколькими элементами текущей стороны. Группа = папка в списке слоёв:
 * её элементы идут подряд (XS.Model.cleanGroups) и по клику на макете выделяются вместе. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S;
  const CLIP_KEY = 'xsatsu-clipboard';
  let clipboard = null;

  const side = () => UI.side();
  const ids = () => new Set(S.selection);
  const groupOf = el => (el && el.group ? side().groups.find(g => g.id === el.group) : null);
  const members = gid => side().elements.filter(e => e.group === gid);

  /* Клик по элементу группы выделяет всю группу. */
  function expand(list) {
    const out = new Set();
    for (const id of list) {
      const el = side().elements.find(e => e.id === id);
      if (!el) continue;
      if (el.group) members(el.group).forEach(m => out.add(m.id)); else out.add(el.id);
    }
    return [...out];
  }

  /* «Единицы» стороны: целые группы и отдельные элементы в порядке снизу вверх. */
  function units() {
    const out = [];
    for (const el of side().elements) {
      const last = out[out.length - 1];
      if (el.group && last && last.group === el.group) last.els.push(el);
      else out.push({group: el.group || '', els: [el]});
    }
    return out;
  }
  function selectedUnits() {
    const sel = ids();
    return units().filter(u => u.els.some(e => sel.has(e.id)));
  }
  function bounds(els) {
    const xs = els.flatMap(e => [e.x, e.x + e.w]), ys = els.flatMap(e => [e.y, e.y + e.h]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y};
  }
  const r2 = v => +v.toFixed(2);

  function need(min = 1) {
    if (S.selection.length < min) { UI.toast(min > 1 ? 'Выделите хотя бы ' + min + ' элемента (Shift-клик или рамкой).' : 'Сначала выделите элемент.', true); return false; }
    return true;
  }

  /* ---------- удаление, копии, буфер ---------- */
  function remove() {
    if (!need()) return;
    const sel = ids();
    UI.edit(() => { const s = side(); s.elements = s.elements.filter(e => !sel.has(e.id)); XS.Model.cleanGroups(s); S.selection = []; });
  }
  /* Копии выделенных элементов с новыми id; целиком выделенные группы получают новую группу. */
  function cloneSelection(dx = 0, dy = 0) {
    const sel = ids(), s = side(), groupMap = new Map(), groups = [];
    const els = s.elements.filter(e => sel.has(e.id)).map(e => {
      const copy = XS.Model.normalizeElement({...XS.clone(e), id: undefined, x: r2(e.x + dx), y: r2(e.y + dy)});
      const whole = e.group && members(e.group).every(m => sel.has(m.id));
      if (whole) {
        if (!groupMap.has(e.group)) { const g = groupOf(e); const ng = {id: XS.uid('g'), name: g.name, collapsed: false}; groupMap.set(e.group, ng); groups.push(ng); }
        copy.group = groupMap.get(e.group).id;
      } else copy.group = '';
      return copy;
    });
    return {els, groups};
  }
  function duplicate() {
    if (!need()) return;
    const {els, groups} = cloneSelection(3, 3);
    UI.edit(() => { const s = side(); s.groups.push(...groups); s.elements.push(...els); XS.Model.cleanGroups(s); S.selection = els.map(e => e.id); });
  }
  function copy() {
    if (!need()) return false;
    const {els, groups} = cloneSelection();
    const assets = {};
    for (const e of els) if (e.type === 'image' && /^asset:/.test(e.src)) { const a = S.doc.assets[e.src.slice(6)]; if (a) assets[a.id] = a; }
    clipboard = {kind: 'xsatsu-elements', els, groups, assets, from: S.doc.id + ':' + S.side};
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(clipboard)); } catch (e) { /* большие картинки не влезли — останется буфер этой вкладки */ }
    UI.toast('Скопировано: ' + els.length + '. Вставка — Ctrl+V, можно в другую сторону или проект.');
    return true;
  }
  function cut() { if (copy()) { clipboard.cut = true; try { localStorage.setItem(CLIP_KEY, JSON.stringify(clipboard)); } catch (e) {} remove(); } }
  function readClipboard() {
    try { const v = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); if (v && v.kind === 'xsatsu-elements') return v; } catch (e) {}
    return clipboard;
  }
  function paste() {
    const clip = readClipboard();
    if (!clip || !clip.els?.length) return UI.toast('Буфер пуст: сначала скопируйте элементы (Ctrl+C).', true);
    const sameSide = clip.from === S.doc.id + ':' + S.side && !clip.cut;
    const off = sameSide ? 3 : 0;
    UI.edit(d => {
      const assetMap = new Map();
      for (const a of Object.values(clip.assets || {})) assetMap.set(a.id, XS.Model.addAsset(d, a).id);
      const gmap = new Map(clip.groups.map(g => [g.id, {...g, id: XS.uid('g')}]));
      const els = clip.els.map(e => {
        const c = XS.Model.normalizeElement({...XS.clone(e), id: undefined, x: r2(e.x + off), y: r2(e.y + off)});
        c.group = e.group && gmap.has(e.group) ? gmap.get(e.group).id : '';
        if (c.type === 'image' && /^asset:/.test(c.src) && assetMap.has(c.src.slice(6))) c.src = 'asset:' + assetMap.get(c.src.slice(6));
        return c;
      });
      const s = side();
      s.groups.push(...gmap.values()); s.elements.push(...els); XS.Model.cleanGroups(s);
      S.selection = els.map(e => e.id);
      // Следующая вставка — со сдвигом, чтобы копии не легли точно друг на друга.
      clip.els = clip.els.map(e => ({...e, x: e.x + off, y: e.y + off}));
      clip.cut = false;
    });
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch (e) {}
  }

  /* ---------- группы ---------- */
  function group() {
    if (!need(2)) return;
    const sel = ids(), s = side();
    const n = s.groups.length + 1;
    const g = {id: XS.uid('g'), name: 'Группа ' + n, collapsed: false};
    UI.edit(() => {
      for (const e of s.elements) if (sel.has(e.id)) e.group = g.id;
      s.groups.push(g);
      XS.Model.cleanGroups(s);
    });
    UI.toast('Сгруппировано. Клик по любому элементу выделяет всю группу, двойной клик — элемент внутри.');
  }
  function ungroup() {
    const sel = ids(), s = side();
    const gids = new Set(s.elements.filter(e => sel.has(e.id) && e.group).map(e => e.group));
    if (!gids.size) return UI.toast('В выделении нет групп.', true);
    UI.edit(() => { for (const e of s.elements) if (gids.has(e.group)) e.group = ''; XS.Model.cleanGroups(s); });
  }
  function renameGroup(gid, name) { const g = side().groups.find(x => x.id === gid); if (g && name.trim()) UI.edit(() => { g.name = name.trim(); }, 'gname:' + gid); }

  /* ---------- порядок ---------- */
  function order(dir) {
    if (!need()) return;
    const s = side(), sel = ids();
    const selEls = s.elements.filter(e => sel.has(e.id));
    const gid = selEls[0].group;
    const insideOneGroup = gid && selEls.every(e => e.group === gid) && members(gid).some(m => !sel.has(m.id));
    UI.edit(() => {
      if (insideOneGroup) {
        // Перестановка внутри группы.
        const list = members(gid), moved = reorder(list.map(e => ({els: [e]})), u => sel.has(u.els[0].id), dir).map(u => u.els[0]);
        const start = s.elements.indexOf(list[0]);
        s.elements.splice(start, list.length, ...moved);
      } else {
        const us = units();
        s.elements = reorder(us, u => u.els.some(e => sel.has(e.id)), dir).flatMap(u => u.els);
      }
      XS.Model.cleanGroups(s);
    });
  }
  function reorder(list, isSel, dir) {
    const arr = list.slice();
    if (dir === 'front') return [...arr.filter(u => !isSel(u)), ...arr.filter(isSel)];
    if (dir === 'back') return [...arr.filter(isSel), ...arr.filter(u => !isSel(u))];
    if (dir === 'up') { for (let i = arr.length - 2; i >= 0; i--) if (isSel(arr[i]) && !isSel(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
    if (dir === 'down') { for (let i = 1; i < arr.length; i++) if (isSel(arr[i]) && !isSel(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
    return arr;
  }

  /* ---------- выравнивание ---------- */
  function align(kind) {
    if (!need()) return;
    const us = selectedUnits(), all = us.flatMap(u => u.els);
    const ref = us.length === 1 ? {x: 0, y: 0, w: S.doc.page.width, h: S.doc.page.height} : bounds(all);
    UI.edit(() => {
      for (const u of us) {
        if (u.els.some(e => e.locked)) continue;
        const b = bounds(u.els);
        let dx = 0, dy = 0;
        if (kind === 'left') dx = ref.x - b.x;
        if (kind === 'centerH') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
        if (kind === 'right') dx = ref.x + ref.w - (b.x + b.w);
        if (kind === 'top') dy = ref.y - b.y;
        if (kind === 'centerV') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
        if (kind === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
        for (const e of u.els) { e.x = r2(e.x + dx); e.y = r2(e.y + dy); }
      }
    }, '', {skip: ['data']});
  }
  function distribute(axis) {
    const us = selectedUnits();
    if (us.length < 3) return UI.toast('Для распределения выделите хотя бы 3 элемента.', true);
    const P = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
    const items = us.map(u => ({u, b: bounds(u.els)})).sort((a, b) => a.b[P[0]] - b.b[P[0]]);
    const first = items[0].b, last = items[items.length - 1].b;
    const total = items.reduce((s, it) => s + it.b[P[1]], 0);
    const gap = (last[P[0]] + last[P[1]] - first[P[0]] - total) / (items.length - 1);
    UI.edit(() => {
      let pos = first[P[0]];
      for (const it of items) { const d = pos - it.b[P[0]]; for (const e of it.u.els) e[P[0]] = r2(e[P[0]] + d); pos += it.b[P[1]] + gap; }
    }, '', {skip: ['data']});
  }

  /* ---------- прочее ---------- */
  function nudge(dx, dy) {
    if (!S.selection.length) return;
    const sel = ids();
    UI.edit(() => { for (const e of side().elements) if (sel.has(e.id) && !e.locked) { e.x = r2(e.x + dx); e.y = r2(e.y + dy); } }, 'nudge', {skip: ['data']});
  }
  function toggle(prop) {
    if (!need()) return;
    const sel = ids(), els = side().elements.filter(e => sel.has(e.id));
    const value = prop === 'locked' ? !els.every(e => e.locked) : !els.every(e => e.visible);
    UI.edit(() => { for (const e of els) e[prop] = value; });
  }
  function selectAll() { UI.select(side().elements.filter(e => e.visible).map(e => e.id)); }
  function cycle(step) {
    const us = units().slice().reverse(); // сверху вниз, как в списке слоёв
    if (!us.length) return;
    const cur = us.findIndex(u => u.els.some(e => S.selection.includes(e.id)));
    const next = us[(cur + step + us.length) % us.length];
    UI.select(next.els.map(e => e.id));
  }
  function setProp(prop, value, key) {
    const sel = ids();
    UI.edit(() => { for (const e of side().elements) if (sel.has(e.id) && prop in e) e[prop] = value; }, key || 'multi:' + prop, {skip: ['inspector']});
  }

  UI.Sel = {expand, units, selectedUnits, bounds, groupOf, members, remove, duplicate, copy, cut, paste, group, ungroup, renameGroup, order, align, distribute, nudge, toggle, selectAll, cycle, setProp, hasClipboard: () => !!readClipboard()};
})(typeof window !== 'undefined' ? window : globalThis);
