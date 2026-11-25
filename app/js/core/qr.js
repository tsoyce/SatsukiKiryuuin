/* XSatsu Студия · QR-код как векторный элемент макета.
 * Матрицу строит qrcode-generator (vendor/qrcode.js), здесь она превращается в SVG-контур в мм,
 * который одинаково рисуют экран (Path2D) и PDF (drawSvgPath) — в PDF QR остаётся вектором. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const LEVELS = ['L', 'M', 'Q', 'H'];
  const cache = new Map();

  function matrix(text, level = 'M') {
    const k = level + '\u0000' + text;
    if (cache.has(k)) return cache.get(k);
    const Q = global.qrcode;
    if (!Q) throw new Error('Не загружена библиотека QR (vendor/qrcode.js).');
    if (Q.stringToBytesFuncs && Q.stringToBytesFuncs['UTF-8']) Q.stringToBytes = Q.stringToBytesFuncs['UTF-8'];
    const q = Q(0, LEVELS.includes(level) ? level : 'M');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount(), rows = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); rows.push(row); }
    const m = {size: n, rows};
    if (cache.size > 500) cache.clear();
    cache.set(k, m);
    return m;
  }

  /* Контур QR в квадрате side×side мм; quiet — поле в модулях. Координаты относительно (0,0). */
  function path(text, side, {level = 'M', quiet = 0} = {}) {
    const m = matrix(text, level), cells = m.size + quiet * 2, s = side / cells;
    const f = v => +v.toFixed(3);
    let d = '';
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.rows[r][c]) { c++; continue; }
        const start = c;
        while (c < m.size && m.rows[r][c]) c++;
        const x = (start + quiet) * s, y = (r + quiet) * s, w = (c - start) * s;
        d += `M${f(x)} ${f(y)}h${f(w)}v${f(s)}h${f(-w)}z`;
      }
    }
    return {d, modules: m.size, module: s};
  }

  XS.QR = {LEVELS, matrix, path};
})(typeof window !== 'undefined' ? window : globalThis);
