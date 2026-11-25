/* XSatsu Студия · рабочая область: предпросмотр страницы, выделение, перетаскивание, масштаб, привязка. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const BASE = 96 / 25.4; // px на мм при масштабе 100%
  let gen = 0, frame = 0, guidesEl = [];

  const k = () => (S.zoom || 1) * BASE;

  function fit() {
    if (!S.doc) return;
    const vp = $('viewport'), W = S.doc.page.width, H = S.doc.page.height;
    const kk = Math.max(0.2, Math.min((vp.clientWidth - 80) / W, (vp.clientHeight - 80) / H));
    S.zoom = kk / BASE;
    render();
  }
  function setZoom(z) { S.zoom = Math.max(0.1, Math.min(8, z)); render(); }

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
    renderWarnings();
    renderBoxes();
  }

  function renderChrome() {
    const doc = S.doc, kk = k();
    const page = $('page');
    page.style.width = doc.page.width * kk + 'px';
    page.style.height = doc.page.height * kk + 'px';
    $('zoomFit').textContent = Math.round((S.zoom || 1) * 100) + '%';
    // стороны
    const tabs = $('sideTabs');
    tabs.replaceChildren(...doc.sides.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'side' + (i === S.side ? ' active' : ''); b.textContent = s.name; b.type = 'button';
      b.onclick = () => UI.setSide(i);
      return b;
    }));
    if (doc.sides.length < 2) {
      const add = document.createElement('button');
      add.className = 'side'; add.textContent = '＋ Оборот'; add.title = 'Добавить оборотную сторону';
      add.onclick = () => UI.edit(d => { d.sides.push(XS.Model.side('back', 'Оборот')); S.side = d.sides.length - 1; S.sel = null; });
      tabs.append(add);
    }
    // запись
    const rows = doc.data.rows, row = UI.row();
    const first = doc.data.columns.find(c => c.type !== 'image');
    const label = row ? String(row.cells[first?.id] || '').trim() || '(пусто — бланк)' : '';
    $('rowLabel').textContent = rows.length ? (S.row + 1) + ' / ' + rows.length + ' · ' + label : 'Нет записей — показан макет';
    $('prevRow').disabled = S.row <= 0; $('nextRow').disabled = S.row >= rows.length - 1;
  }

  function renderWarnings() {
    const box = $('warnings'), w = S.warnings;
    box.hidden = !w.length;
    box.textContent = w.length ? '⚠ ' + w.map(x => x.name + ': ' + x.msg).join(' · ') : '';
  }

  /* Рамки элементов поверх картинки — для выделения и перетаскивания. */
  function renderBoxes() {
    const overlay = $('overlay'), kk = k();
    const warnIds = new Set(S.warnings.map(w => w.el));
    overlay.replaceChildren(...guidesEl);
    for (const el of UI.side().elements) {
      if (!el.visible) continue;
      const box = document.createElement('div');
      box.className = 'box' + (el.id === S.sel ? ' sel' : '') + (el.locked ? ' locked' : '') + (warnIds.has(el.id) ? ' warn' : '');
      box.dataset.id = el.id;
      const minPx = 6;
      let x = el.x * kk, y = el.y * kk, w = Math.abs(el.w) * kk, h = Math.abs(el.h) * kk;
      if (h < minPx) { y -= (minPx - h) / 2; h = minPx; }
      if (w < minPx) { x -= (minPx - w) / 2; w = minPx; }
      Object.assign(box.style, {left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px'});
      box.title = el.name + (el.locked ? ' (закреплён)' : '');
      if (el.id === S.sel && !el.locked) {
        const handles = el.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        for (const hname of handles) { const hd = document.createElement('div'); hd.className = 'h'; hd.dataset.h = hname; box.append(hd); }
      }
      overlay.append(box);
    }
  }

  /* ---------- перетаскивание и изменение размера ---------- */
  function snapTargets(exceptId) {
    const W = S.doc.page.width, H = S.doc.page.height, xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const e of UI.side().elements) if (e.id !== exceptId && e.visible) { xs.push(e.x, e.x + e.w / 2, e.x + e.w); ys.push(e.y, e.y + e.h / 2, e.y + e.h); }
    return {xs, ys};
  }
  function bestSnap(values, targets, threshold) {
    let best = null;
    for (const v of values) for (const t of targets) { const d = t - v; if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, t}; }
    return best;
  }
  function showGuides(gx, gy) {
    const kk = k();
    guidesEl = [];
    if (gx != null) { const g = document.createElement('div'); g.className = 'guide v'; g.style.left = gx * kk + 'px'; guidesEl.push(g); }
    if (gy != null) { const g = document.createElement('div'); g.className = 'guide hz'; g.style.top = gy * kk + 'px'; guidesEl.push(g); }
  }

  function onPointerDown(e) {
    const boxEl = e.target.closest('.box');
    if (!boxEl) { if (S.sel) UI.select(null); return; }
    const el = UI.element(boxEl.dataset.id) || null;
    if (!el) return;
    if (S.sel !== el.id) UI.select(el.id);
    if (el.locked || e.button !== 0) return;
    e.preventDefault();
    const handle = e.target.dataset.h || '';
    const start = {x: el.x, y: el.y, w: el.w, h: el.h, px: e.clientX, py: e.clientY};
    let moved = false;
    const targets = snapTargets(el.id);
    const move = ev => {
      const kk = k(), dx = (ev.clientX - start.px) / kk, dy = (ev.clientY - start.py) / kk;
      if (!moved && Math.hypot(ev.clientX - start.px, ev.clientY - start.py) < 3) return;
      if (!moved) { S.history.record(S.doc); moved = true; }
      const th = 6 / kk, free = ev.altKey;
      let gx = null, gy = null;
      if (!handle) {
        let x = start.x + dx, y = start.y + dy;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) y = start.y; else x = start.x; }
        if (!free) {
          const sx = bestSnap([x, x + el.w / 2, x + el.w], targets.xs, th); if (sx) { x += sx.d; gx = sx.t; }
          const sy = bestSnap([y, y + el.h / 2, y + el.h], targets.ys, th); if (sy) { y += sy.d; gy = sy.t; }
        }
        el.x = +x.toFixed(2); el.y = +y.toFixed(2);
      } else {
        let {x, y, w, h} = start;
        const minW = 2, minH = el.type === 'line' ? 0 : 2;
        if (handle.includes('e')) w = Math.max(minW, start.w + dx);
        if (handle.includes('s')) h = Math.max(minH, start.h + dy);
        if (handle.includes('w')) { w = Math.max(minW, start.w - dx); x = start.x + start.w - w; }
        if (handle.includes('n')) { h = Math.max(minH, start.h - dy); y = start.y + start.h - h; }
        if (!free) {
          if (handle.includes('e')) { const s = bestSnap([x + w], targets.xs, th); if (s) { w += s.d; gx = s.t; } }
          if (handle.includes('w')) { const s = bestSnap([x], targets.xs, th); if (s) { x += s.d; w -= s.d; gx = s.t; } }
          if (handle.includes('s')) { const s = bestSnap([y + h], targets.ys, th); if (s) { h += s.d; gy = s.t; } }
          if (handle.includes('n')) { const s = bestSnap([y], targets.ys, th); if (s) { y += s.d; h -= s.d; gy = s.t; } }
        }
        Object.assign(el, {x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2)});
      }
      showGuides(gx, gy);
      render();
      UI.Inspector.updateGeometry();
    };
    const up = () => {
      global.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      guidesEl = [];
      if (moved) UI.changed({skip: ['data']}); else render();
    };
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
  }

  /* ---------- клавиатура ---------- */
  function onKey(e) {
    if ($('editor').hidden || document.querySelector('dialog[open]')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && (key === 'z' || key === 'я') && !typing) { e.preventDefault(); e.shiftKey ? UI.redo() : UI.undo(); return; }
    if (mod && (key === 'y' || key === 'н') && !typing) { e.preventDefault(); UI.redo(); return; }
    if (mod && (key === 's' || key === 'ы')) { e.preventDefault(); UI.flush(); UI.toast('Проект сохранён в браузере. Файл проекта — в меню «Проект».'); return; }
    if (mod && key === '0') { e.preventDefault(); fit(); return; }
    if (typing) return;
    if (e.key === 'PageDown') { e.preventDefault(); UI.setRow(S.row + 1); return; }
    if (e.key === 'PageUp') { e.preventDefault(); UI.setRow(S.row - 1); return; }
    const el = UI.element();
    if (!el) return;
    if (e.key === 'Escape') { UI.select(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); UI.Layers.remove(el.id); return; }
    if (mod && (key === 'd' || key === 'в')) { e.preventDefault(); UI.Layers.duplicate(el.id); return; }
    const step = e.shiftKey ? 5 : 0.5, arrows = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
    if (arrows[e.key] && !el.locked) {
      e.preventDefault();
      UI.edit(() => { el.x = +(el.x + arrows[e.key][0]).toFixed(2); el.y = +(el.y + arrows[e.key][1]).toFixed(2); }, 'nudge:' + el.id, {skip: ['data']});
    }
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
    $('overlay').addEventListener('pointerdown', onPointerDown);
    $('viewport').addEventListener('pointerdown', e => { if (e.target === $('viewport') && S.sel) UI.select(null); });
    $('overlay').addEventListener('dblclick', e => { const b = e.target.closest('.box'); if (b) UI.Inspector.focusText(); });
    document.addEventListener('keydown', onKey);
    $('zoomIn').onclick = () => setZoom((S.zoom || 1) * 1.25);
    $('zoomOut').onclick = () => setZoom((S.zoom || 1) / 1.25);
    $('zoomFit').onclick = fit;
    $('prevRow').onclick = () => UI.setRow(S.row - 1);
    $('nextRow').onclick = () => UI.setRow(S.row + 1);
    $('viewport').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((S.zoom || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, {passive: false});
    const vp = $('viewport');
    vp.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('dropHint').hidden = false; } });
    vp.addEventListener('dragleave', e => { if (!vp.contains(e.relatedTarget)) $('dropHint').hidden = true; });
    vp.addEventListener('drop', UI.safe(onDrop));
    let resizeTimer;
    global.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.doc) render(); }, 150); });
  }

  UI.Stage = {init, render, fit, setZoom};
})(typeof window !== 'undefined' ? window : globalThis);
