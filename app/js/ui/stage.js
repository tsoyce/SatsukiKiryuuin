/* XSatsu Студия · рабочая область: предпросмотр страницы, выделение (клик, Shift/Ctrl-клик, рамкой),
 * перетаскивание и размер с привязкой, масштаб, сдвиг холста пробелом, строка состояния. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const BASE = 96 / 25.4; // px на мм при масштабе 100%
  let gen = 0, frame = 0, extras = [], spaceDown = false, lastView = '', autoFit = true;

  const k = () => (S.zoom || 1) * BASE;

  function fit() {
    if (!S.doc) return;
    const vp = $('viewport'), W = S.doc.page.width, H = S.doc.page.height;
    // Поля берём из CSS области (на телефоне они меньше) + небольшой запас, чтобы макет не прилипал к краям.
    const cs = getComputedStyle(vp), gap = vp.clientWidth < 600 ? 4 : 16;
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + gap, padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + gap;
    const kk = Math.max(0.2, Math.min((vp.clientWidth - padX) / W, (vp.clientHeight - padY) / H));
    S.zoom = kk / BASE; autoFit = true;
    render();
  }
  function setZoom(z, anchor) {
    const vp = $('viewport'), old = k();
    const rect = vp.getBoundingClientRect();
    const ax = anchor ? anchor.x - rect.left : vp.clientWidth / 2, ay = anchor ? anchor.y - rect.top : vp.clientHeight / 2;
    const mmX = (vp.scrollLeft + ax) / old, mmY = (vp.scrollTop + ay) / old;
    S.zoom = Math.max(0.1, Math.min(8, z)); autoFit = false;
    render();
    requestAnimationFrame(() => { vp.scrollLeft = mmX * k() - ax; vp.scrollTop = mmY * k() - ay; });
  }

  function render() {
    if (!S.doc) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw().catch(e => { console.error(e); UI.toast(e.message, true); }));
    renderChrome();
    renderBoxes();
  }

  async function draw() {
    const doc = S.doc, my = ++gen, kk = k(), dpr = global.devicePixelRatio || 1;
    await XS.Fonts.ensureForDoc(doc);
    if (my !== gen || doc !== S.doc) return;
    const scene = XS.Scene.build(doc, S.side, UI.row(), S.row);
    S.warnings = scene.warnings;
    const off = await XS.CanvasRender.toCanvas(scene, kk * dpr * 25.4);
    if (my !== gen || doc !== S.doc) return;
    const c = $('pageCanvas');
    c.width = off.width; c.height = off.height;
    c.getContext('2d').drawImage(off, 0, 0);
    off.width = off.height = 1;
    // Другая запись или сторона того же проекта — мягкая смена страницы.
    const view = doc.id + '|' + S.side + '|' + S.row;
    if (lastView && view !== lastView && lastView.split('|')[0] === doc.id) UI.Motion?.flip($('page'));
    lastView = view;
    renderWarnings();
    renderBoxes();
    UI.Layers.render();
  }

  function renderChrome() {
    const doc = S.doc, kk = k(), page = $('page');
    page.style.width = doc.page.width * kk + 'px';
    page.style.height = doc.page.height * kk + 'px';
    $('zoomFit').textContent = Math.round((S.zoom || 1) * 100) + '%';
    const tabs = $('sideTabs');
    tabs.replaceChildren(...doc.sides.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'side' + (i === S.side ? ' active' : ''); b.textContent = s.name; b.type = 'button';
      b.onclick = () => UI.setSide(i);
      return b;
    }));
    if (doc.sides.length < 2) {
      const add = document.createElement('button');
      add.className = 'side add'; add.type = 'button'; add.innerHTML = XS.Icons.icon('plus', 14) + 'Оборот'; add.title = 'Добавить оборотную сторону';
      add.onclick = () => UI.edit(d => { d.sides.push(XS.Model.side('back', 'Оборот')); S.side = d.sides.length - 1; S.selection = []; });
      tabs.append(add);
    }
    const rows = doc.data.rows, row = UI.row();
    const first = doc.data.columns.find(c => c.type !== 'image');
    const label = row ? String(row.cells[first?.id] || '').trim() || '(пусто — бланк)' : '';
    $('rowLabel').textContent = rows.length ? (S.row + 1) + ' / ' + rows.length + ' · ' + label : 'Нет записей — показан макет';
    $('prevRow').disabled = S.row <= 0; $('nextRow').disabled = S.row >= rows.length - 1;
    status();
  }

  function renderWarnings() {
    const box = $('warnings'), w = S.warnings;
    box.hidden = !w.length;
    box.innerHTML = w.length ? XS.Icons.icon('warn', 14) + ' ' + XS.esc(w.map(x => x.name + ': ' + x.msg).join(' · ')) : '';
  }

  /* Строка состояния: выделение, размер, курсор. */
  let cursor = null;
  function status() {
    const sel = UI.selected();
    let text = S.doc.page.width + '×' + S.doc.page.height + ' мм';
    if (sel.length) {
      const b = UI.Sel.bounds(sel);
      text = (sel.length === 1 ? XS.esc(sel[0].name) : 'Выделено: ' + sel.length) + ' · X ' + b.x.toFixed(1) + ' Y ' + b.y.toFixed(1) + ' · ' + b.w.toFixed(1) + '×' + b.h.toFixed(1) + ' мм';
    }
    $('statusSel').innerHTML = text;
    $('statusCursor').textContent = cursor ? 'курсор ' + cursor.x.toFixed(1) + ', ' + cursor.y.toFixed(1) + ' мм' : '';
  }

  /* Рамки элементов поверх картинки — для выделения и перетаскивания. */
  function renderBoxes() {
    const overlay = $('overlay'), kk = k();
    const warnIds = new Set(S.warnings.map(w => w.el)), sel = new Set(S.selection);
    const single = S.selection.length === 1 ? UI.element() : null;
    overlay.replaceChildren();
    for (const el of UI.side().elements) {
      if (!el.visible) continue;
      const box = document.createElement('div');
      box.className = 'box' + (sel.has(el.id) ? ' sel' : '') + (el.locked ? ' locked' : '') + (warnIds.has(el.id) ? ' warn' : '') + (el.group ? ' grouped' : '');
      box.dataset.id = el.id;
      place(box, el, kk);
      box.title = el.name + (el.group ? ' · ' + (UI.Sel.groupOf(el)?.name || 'группа') : '') + (el.locked ? ' (закреплён)' : '');
      if (single && single.id === el.id && !el.locked) {
        const handles = el.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
        for (const h of handles) { const hd = document.createElement('div'); hd.className = 'h'; hd.dataset.h = h; if (h === 'rot') hd.title = 'Повернуть (Shift — шаг 15°)'; box.append(hd); }
      }
      overlay.append(box);
    }
    // Общая рамка нескольких выделенных элементов.
    if (S.selection.length > 1) {
      const b = UI.Sel.bounds(UI.selected());
      const frameEl = document.createElement('div');
      frameEl.className = 'multi-frame';
      place(frameEl, b, kk);
      overlay.append(frameEl);
    }
    overlay.append(...extras);
    status();
  }
  function place(node, r, kk) {
    const minPx = 6;
    let x = r.x * kk, y = r.y * kk, w = Math.abs(r.w) * kk, h = Math.abs(r.h) * kk;
    if (h < minPx) { y -= (minPx - h) / 2; h = minPx; }
    if (w < minPx) { x -= (minPx - w) / 2; w = minPx; }
    Object.assign(node.style, {left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', transform: r.rotate ? 'rotate(' + r.rotate + 'deg)' : ''});
  }

  /* ---------- привязка ---------- */
  function snapTargets(exclude) {
    const W = S.doc.page.width, H = S.doc.page.height, xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const e of UI.side().elements) if (!exclude.has(e.id) && e.visible) { xs.push(e.x, e.x + e.w / 2, e.x + e.w); ys.push(e.y, e.y + e.h / 2, e.y + e.h); }
    return {xs, ys};
  }
  function bestSnap(values, targets, threshold) {
    let best = null;
    for (const v of values) for (const t of targets) { const d = t - v; if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, t}; }
    return best;
  }
  function guides(gx, gy) {
    const kk = k();
    extras = [];
    if (gx != null) { const g = document.createElement('div'); g.className = 'guide v'; g.style.left = gx * kk + 'px'; extras.push(g); }
    if (gy != null) { const g = document.createElement('div'); g.className = 'guide hz'; g.style.top = gy * kk + 'px'; extras.push(g); }
  }
  const toMm = ev => { const r = $('page').getBoundingClientRect(), kk = k(); return {x: (ev.clientX - r.left) / kk, y: (ev.clientY - r.top) / kk}; };

  /* ---------- мышь ---------- */
  function onPointerDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) return startPan(e);
    if (e.button !== 0) return;
    const boxEl = e.target.closest('.box');
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!boxEl) return startMarquee(e, additive);
    const el = UI.element(boxEl.dataset.id);
    if (!el) return;
    // Группа выделяется целиком, если не выбран уже элемент внутри неё.
    const insideGroup = el.group && S.selection.length === 1 && UI.Sel.members(el.group).some(m => m.id === S.selection[0]) && S.selection[0] === el.id;
    const target = el.group && !insideGroup ? UI.Sel.expand([el.id]) : [el.id];
    if (additive) { UI.select(target, 'toggle'); return; }
    if (!target.every(id => S.selection.includes(id))) UI.select(target);
    const moving = UI.selected().filter(x => !x.locked);
    if (!moving.length) return;
    e.preventDefault();
    const handle = S.selection.length === 1 ? e.target.dataset.h || '' : '';
    const start = new Map(moving.map(m => [m.id, {x: m.x, y: m.y, w: m.w, h: m.h}]));
    const b0 = UI.Sel.bounds(moving), px = e.clientX, py = e.clientY;
    const targets = snapTargets(new Set(moving.map(m => m.id)));
    let moved = false;
    if (handle === 'rot') return startRotate(e, moving[0]);
    const move = ev => {
      const kk = k();
      let dx = (ev.clientX - px) / kk, dy = (ev.clientY - py) / kk;
      const angle = handle ? (moving[0].rotate || 0) * Math.PI / 180 : 0;
      // Повёрнутый элемент: сдвиг мыши переводим в оси самого элемента.
      if (angle) [dx, dy] = [dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle)];
      if (!moved && Math.hypot(ev.clientX - px, ev.clientY - py) < 3) return;
      if (!moved) { S.history.record(S.doc); moved = true; }
      const th = UI.Prefs.get('snapPx') / kk, free = ev.altKey || !UI.Prefs.get('snap');
      let gx = null, gy = null;
      if (!handle) {
        let ddx = dx, ddy = dy;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) ddy = 0; else ddx = 0; }
        if (!free) {
          const x = b0.x + ddx, y = b0.y + ddy;
          const sx = bestSnap([x, x + b0.w / 2, x + b0.w], targets.xs, th); if (sx) { ddx += sx.d; gx = sx.t; }
          const sy = bestSnap([y, y + b0.h / 2, y + b0.h], targets.ys, th); if (sy) { ddy += sy.d; gy = sy.t; }
        }
        for (const m of moving) { const s0 = start.get(m.id); m.x = +(s0.x + ddx).toFixed(2); m.y = +(s0.y + ddy).toFixed(2); }
      } else {
        const m = moving[0], s0 = start.get(m.id);
        let {x, y, w, h} = s0;
        const minW = 2, minH = m.type === 'line' ? 0 : 2;
        if (handle.includes('e')) w = Math.max(minW, s0.w + dx);
        if (handle.includes('s')) h = Math.max(minH, s0.h + dy);
        if (handle.includes('w')) { w = Math.max(minW, s0.w - dx); x = s0.x + s0.w - w; }
        if (handle.includes('n')) { h = Math.max(minH, s0.h - dy); y = s0.y + s0.h - h; }
        if (ev.shiftKey && handle.length === 2 && s0.w && s0.h) { const r = Math.max(w / s0.w, h / s0.h); w = s0.w * r; h = s0.h * r; if (handle.includes('w')) x = s0.x + s0.w - w; if (handle.includes('n')) y = s0.y + s0.h - h; }
        if (angle) {
          // Противоположный угол/край остаётся на месте экрана.
          const c = Math.cos(angle), s = Math.sin(angle);
          const off = (W, H) => [handle.includes('e') ? -W / 2 : handle.includes('w') ? W / 2 : 0, handle.includes('s') ? -H / 2 : handle.includes('n') ? H / 2 : 0];
          const [ax, ay] = off(s0.w, s0.h), cx0 = s0.x + s0.w / 2, cy0 = s0.y + s0.h / 2;
          const Ax = cx0 + ax * c - ay * s, Ay = cy0 + ax * s + ay * c;
          const [bx, by] = off(w, h);
          x = Ax - (bx * c - by * s) - w / 2; y = Ay - (bx * s + by * c) - h / 2;
        } else if (!free) {
          if (handle.includes('e')) { const s = bestSnap([x + w], targets.xs, th); if (s) { w += s.d; gx = s.t; } }
          if (handle.includes('w')) { const s = bestSnap([x], targets.xs, th); if (s) { x += s.d; w -= s.d; gx = s.t; } }
          if (handle.includes('s')) { const s = bestSnap([y + h], targets.ys, th); if (s) { h += s.d; gy = s.t; } }
          if (handle.includes('n')) { const s = bestSnap([y], targets.ys, th); if (s) { y += s.d; h -= s.d; gy = s.t; } }
        }
        Object.assign(m, {x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2)});
      }
      guides(gx, gy);
      render();
      UI.Inspector.updateGeometry();
    };
    const up = () => {
      global.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      extras = [];
      if (moved) UI.changed({skip: ['data']}); else render();
    };
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
  }

  /* Поворот за круглую ручку над рамкой. Без Shift — прилипает к 0/90/180/270°, с Shift — шаг 15°. */
  function startRotate(e, el) {
    const r = $('page').getBoundingClientRect(), kk = k();
    const cx = r.left + (el.x + el.w / 2) * kk, cy = r.top + (el.y + el.h / 2) * kk;
    let moved = false;
    const move = ev => {
      if (!moved) { S.history.record(S.doc); moved = true; }
      let deg = Math.atan2(ev.clientX - cx, -(ev.clientY - cy)) * 180 / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else { const near = Math.round(deg / 90) * 90; if (Math.abs(deg - near) < 3) deg = near; }
      if (deg > 180) deg -= 360; if (deg <= -180) deg += 360;
      el.rotate = +deg.toFixed(1);
      $('statusSel').textContent = el.name + ' · поворот ' + el.rotate + '°';
      render();
      UI.Inspector.updateGeometry();
    };
    const up = () => {
      global.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      if (moved) UI.changed({skip: ['data']}); else render();
    };
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
  }

  /* Выделение рамкой по пустому месту. */
  function startMarquee(e, additive) {
    const p0 = toMm(e), before = additive ? S.selection.slice() : [];
    const rect = document.createElement('div');
    rect.className = 'marquee';
    let active = false;
    const move = ev => {
      const p = toMm(ev);
      if (!active && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      active = true;
      const r = {x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y)};
      place(rect, r, k());
      const hit = UI.side().elements.filter(el => el.visible && el.x < r.x + r.w && el.x + el.w > r.x && el.y < r.y + r.h && el.y + Math.max(el.h, 0.01) > r.y).map(el => el.id);
      S.selection = [...new Set([...before, ...UI.Sel.expand(hit)])];
      extras = [rect];
      renderBoxes();
    };
    const up = () => {
      global.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      extras = [];
      if (!active) { if (!additive && S.selection.length) UI.select([]); return; }
      UI.refresh({skip: ['data']});
    };
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
  }

  /* Сдвиг холста: пробел + мышь или средняя кнопка. */
  function startPan(e) {
    e.preventDefault();
    const vp = $('viewport'), sx = vp.scrollLeft, sy = vp.scrollTop, px = e.clientX, py = e.clientY;
    vp.classList.add('panning');
    const move = ev => { vp.scrollLeft = sx - (ev.clientX - px); vp.scrollTop = sy - (ev.clientY - py); };
    const up = () => { vp.classList.remove('panning'); global.removeEventListener('pointermove', move); global.removeEventListener('pointerup', up); };
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
  }

  function onDblClick(e) {
    const b = e.target.closest('.box'); if (!b) return;
    const el = UI.element(b.dataset.id); if (!el) return;
    // Двойной клик по группе — выделить элемент внутри; по тексту — к редактированию.
    if (el.group && S.selection.length > 1) { UI.select([el.id]); return; }
    if (el.type === 'text') UI.Inspector.focusText();
  }

  /* ---------- файлы, брошенные на рабочую область ---------- */
  async function onDrop(e) {
    e.preventDefault(); $('dropHint').hidden = true;
    for (const file of e.dataTransfer.files) {
      if (/\.(ttf|otf)$/i.test(file.name)) await UI.addFont(file);
      else if (/\.json$/i.test(file.name)) UI.toast('Файл проекта откройте на главной странице.', true);
      else if (/\.(csv|tsv|txt)$/i.test(file.name)) await UI.Data.importFile(file);
      else if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name) || !UI.side().background) await UI.setBackground(file);
      else await UI.Layers.addImage(file);
    }
  }

  function init() {
    const vp = $('viewport');
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('dblclick', onDblClick);
    vp.addEventListener('pointermove', e => { if (!S.doc) return; const p = toMm(e); cursor = p.x >= 0 && p.y >= 0 && p.x <= S.doc.page.width && p.y <= S.doc.page.height ? p : null; $('statusCursor').textContent = cursor ? 'курсор ' + cursor.x.toFixed(1) + ', ' + cursor.y.toFixed(1) + ' мм' : ''; });
    vp.addEventListener('contextmenu', e => {
      e.preventDefault();
      const b = e.target.closest('.box');
      if (b) { const el = UI.element(b.dataset.id); if (el && !S.selection.includes(el.id)) UI.select(el.group ? UI.Sel.expand([el.id]) : [el.id]); }
      UI.Menu.open(e.clientX, e.clientY, b ? 'element' : 'empty');
    });
    $('zoomIn').onclick = () => setZoom((S.zoom || 1) * 1.25);
    $('zoomOut').onclick = () => setZoom((S.zoom || 1) / 1.25);
    $('zoomFit').onclick = fit;
    $('prevRow').onclick = () => UI.setRow(S.row - 1);
    $('nextRow').onclick = () => UI.setRow(S.row + 1);
    vp.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((S.zoom || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), {x: e.clientX, y: e.clientY}); } }, {passive: false});
    vp.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('dropHint').hidden = false; } });
    vp.addEventListener('dragleave', e => { if (!vp.contains(e.relatedTarget)) $('dropHint').hidden = true; });
    vp.addEventListener('drop', UI.safe(onDrop));
    // Пробел для сдвига холста (если фокус не в поле ввода).
    document.addEventListener('keydown', e => { if (e.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && !$('editor').hidden) { if (!spaceDown) vp.classList.add('pan-ready'); spaceDown = true; e.preventDefault(); } });
    document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; vp.classList.remove('pan-ready'); } });
    let resizeTimer;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.doc) { if (autoFit) fit(); else render(); } }, 120); };
    global.addEventListener('resize', onResize);
    // Размер области макета меняется не только с окном: панели, листы на телефоне, полоса предупреждений.
    // Следим за самой областью — макет всегда вписан, пока пользователь не менял масштаб сам.
    if (global.ResizeObserver) { let last = ''; new ResizeObserver(() => { const vp = $('viewport'); const k = vp.clientWidth + 'x' + vp.clientHeight; if (k !== last && vp.clientWidth) { last = k; onResize(); } }).observe($('viewport')); }
  }

  UI.Stage = {init, render, fit, setZoom, zoom: () => S.zoom || 1};
})(typeof window !== 'undefined' ? window : globalThis);
