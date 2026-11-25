/* XSatsu Студия · раскладка карточек на печатные листы (спуск полос), метки реза, двусторонняя печать. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const K = 72 / 25.4;

  function grid(SW, SH, cw, ch, margin, gap) {
    const cols = Math.floor((SW - 2 * margin + gap + 0.001) / (cw + gap));
    const rows = Math.floor((SH - 2 * margin + gap + 0.001) / (ch + gap));
    return {cols: Math.max(0, cols), rows: Math.max(0, rows)};
  }

  /* Лучшая раскладка: перебираем ориентацию листа и поворот карточки. */
  function plan(card, opt = {}) {
    const margin = XS.num(opt.margin, 5, 0, 50), gap = XS.num(opt.gap, 0, 0, 50);
    if (opt.paper === 'card') return {sheetW: card.w, sheetH: card.h, slots: [{x: 0, y: 0, w: card.w, h: card.h, rot: 0}], cols: 1, rows: 1, margin: 0, gap: 0, label: 'по размеру макета'};
    const [pw, ph] = XS.Model.PAPER[opt.paper] || XS.Model.PAPER.a4;
    const orientations = opt.paperOrientation === 'portrait' ? [[pw, ph]] : opt.paperOrientation === 'landscape' ? [[ph, pw]] : [[pw, ph], [ph, pw]];
    let best = null;
    for (const [SW, SH] of orientations) for (const rotated of [false, true]) {
      const cw = rotated ? card.h : card.w, ch = rotated ? card.w : card.h;
      const g = grid(SW, SH, cw, ch, margin, gap), count = g.cols * g.rows;
      if (!count) continue;
      if (!best || count > best.count) best = {SW, SH, cw, ch, rotated, count, ...g};
    }
    if (!best) {
      // Макет размером с лист (А4 на А4): кладём один на лист без полей.
      for (const [SW, SH] of orientations) for (const rotated of [false, true]) {
        const cw = rotated ? card.h : card.w, ch = rotated ? card.w : card.h;
        if (cw <= SW + 0.5 && ch <= SH + 0.5) return {sheetW: SW, sheetH: SH, slots: [{x: (SW - cw) / 2, y: (SH - ch) / 2, w: cw, h: ch, rot: rotated ? 90 : 0, col: 0, row: 0}], cols: 1, rows: 1, margin: 0, gap, rotated, label: '1 на листе ' + Math.round(SW) + '×' + Math.round(SH) + ' мм, без полей'};
      }
    }
    if (!best) throw new Error('Макет ' + Math.round(card.w) + '×' + Math.round(card.h) + ' мм не помещается на лист ' + (opt.paper || 'a4').toUpperCase() + ' с полями ' + margin + ' мм. Выберите лист больше или «по размеру макета».');
    const gridW = best.cols * best.cw + (best.cols - 1) * gap, gridH = best.rows * best.ch + (best.rows - 1) * gap;
    const x0 = (best.SW - gridW) / 2, y0 = (best.SH - gridH) / 2, slots = [];
    for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) slots.push({x: x0 + c * (best.cw + gap), y: y0 + r * (best.ch + gap), w: best.cw, h: best.ch, rot: best.rotated ? 90 : 0, col: c, row: r});
    return {sheetW: best.SW, sheetH: best.SH, slots, cols: best.cols, rows: best.rows, margin, gap, rotated: best.rotated,
      label: best.cols + '×' + best.rows + ' на листе ' + Math.round(best.SW) + '×' + Math.round(best.SH) + ' мм'};
  }

  /* Положение оборота для слота при двусторонней печати. */
  function backSlot(p, slot, duplex) {
    if (duplex === 'none') return slot;
    const portrait = p.sheetH >= p.sheetW;
    const mirrorX = (duplex === 'long') === portrait; // переворот вокруг вертикальной оси
    if (mirrorX) return {...slot, x: p.sheetW - slot.x - slot.w, rot: {0: 0, 90: 270, 180: 180, 270: 90}[slot.rot]};
    return {...slot, y: p.sheetH - slot.y - slot.h, rot: {0: 180, 90: 90, 180: 0, 270: 270}[slot.rot]};
  }

  /* Матрица PDF: система карточки (pt, начало внизу слева) → лист. */
  function matrix(p, slot, card, offset = {x: 0, y: 0}) {
    const x = slot.x + offset.x, y = slot.y + offset.y, top = p.sheetH - y;
    switch (slot.rot) {
      case 90: return [0, 1, -1, 0, (x + slot.w) * K, (top - slot.h) * K];
      case 180: return [-1, 0, 0, -1, (x + slot.w) * K, top * K];
      case 270: return [0, -1, 1, 0, x * K, top * K];
      default: return [1, 0, 0, 1, x * K, (top - slot.h) * K];
    }
  }

  /* Метки реза по краям сетки (в полях листа). */
  function cutMarks(page, p, offset = {x: 0, y: 0}) {
    const P = global.PDFLib, len = 4, pad = 1;
    const xs = new Set(), ys = new Set();
    for (const s of p.slots) { xs.add(+(s.x).toFixed(3)); xs.add(+(s.x + s.w).toFixed(3)); ys.add(+(s.y).toFixed(3)); ys.add(+(s.y + s.h).toFixed(3)); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const line = (x1, y1, x2, y2) => page.drawLine({start: {x: (x1 + offset.x) * K, y: (p.sheetH - y1 - offset.y) * K}, end: {x: (x2 + offset.x) * K, y: (p.sheetH - y2 - offset.y) * K}, thickness: 0.25, color: P.rgb(0, 0, 0)});
    for (const x of xs) { if (minY - pad > 0.5) line(x, Math.max(0, minY - pad - len), x, minY - pad); if (p.sheetH - maxY - pad > 0.5) line(x, maxY + pad, x, Math.min(p.sheetH, maxY + pad + len)); }
    for (const y of ys) { if (minX - pad > 0.5) line(Math.max(0, minX - pad - len), y, minX - pad, y); if (p.sheetW - maxX - pad > 0.5) line(maxX + pad, y, Math.min(p.sheetW, maxX + pad + len), y); }
  }

  XS.Impose = {plan, backSlot, matrix, cutMarks};
})(typeof window !== 'undefined' ? window : globalThis);
