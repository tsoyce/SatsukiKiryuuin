/* XSatsu Студия · сцена: документ + запись + сторона → список операций рисования (в мм).
 * Один и тот же список рисуют XS.CanvasRender (экран, PNG/JPEG) и XS.PdfRender (векторный PDF). */
(function (global) {
  'use strict';
  const XS = global.XS;

  function elementLayer(el) {
    if (el.layer === 'color' || el.layer === 'text') return el.layer;
    return el.type === 'text' || el.type === 'line' || el.type === 'qr' || el.type === 'barcode' ? 'text' : 'color';
  }
  /* «Показывать, если»: без записи (макет-бланк) элемент виден всегда. */
  function visibleFor(el, ctx) {
    const c = el.showIf;
    if (!c || !c.field || !ctx.row) return true;
    const v = XS.key(XS.Fields.lookup(ctx, c.field) ?? ''), want = XS.key(c.value);
    switch (c.op) {
      case 'empty': return !v;
      case 'eq': return v === want;
      case 'neq': return v !== want;
      case 'contains': return !!want && v.includes(want);
      default: return !!v;
    }
  }
  function passes(layer, wanted) { return wanted === 'all' || !wanted || layer === wanted; }

  function resolveImage(doc, src, ctx) {
    let value = String(src || '').trim();
    if (!value) return null;
    if (/^\{[^{}]+\}$/.test(value)) value = String(XS.Fields.lookup(ctx, value.slice(1, -1)) || '').trim();
    if (/^asset:/.test(value)) return doc.assets[value.slice(6)] || null;
    if (/^(data:image\/|https?:|presets\/)/.test(value)) return {id: value, data: value, mime: /^data:([^;,]+)/.exec(value)?.[1] || 'image/*', external: true};
    return null;
  }

  function build(doc, sideIndex, row, index, opts = {}) {
    const layer = opts.layer || 'all';
    const black = layer === 'text' && opts.laserBlack !== false;
    const color = c => (black && c ? '#000000' : c);
    const side = doc.sides[sideIndex] || doc.sides[0];
    const ctx = XS.Fields.context(doc, row, index, {'сторона': side.name});
    const ops = [], warnings = [];
    const warn = (el, msg) => warnings.push({el: el?.id || '', name: el?.name || 'Фон', msg});

    if (side.background && passes('color', layer)) {
      const asset = doc.assets[side.background.asset];
      if (asset) ops.push({op: 'bg', asset, page: side.background.page || 1, fit: side.background.fit, opacity: side.background.opacity ?? 1, x: 0, y: 0, w: doc.page.width, h: doc.page.height});
      else warn(null, 'Файл фона не найден в проекте.');
    }
    for (const el of side.elements) {
      if (!el.visible || !visibleFor(el, ctx)) continue;
      const elLayer = elementLayer(el);
      if (!passes(elLayer, layer)) continue;
      // Поворот — вокруг центра рамки (по часовой стрелке, градусы); линии задаются концами и не поворачиваются.
      const rot = el.type !== 'line' && el.rotate ? el.rotate : 0;
      const base = {id: el.id, opacity: el.opacity ?? 1, ...(rot ? {rot, cx: el.x + el.w / 2, cy: el.y + el.h / 2} : {})};
      if (el.type === 'text') {
        const r = XS.Fields.runs(el.text, ctx);
        if (r.missing.length && row) warn(el, 'Нет столбца ' + r.missing.map(m => '{' + m + '}').join(', ') + '.');
        const empty = row ? r.fieldsEmpty : false;
        if (empty && el.empty.mode === 'hide') continue;
        if (empty && el.empty.mode === 'lines') {
          // Пустые поля → линии для заполнения от руки.
          const n = Math.max(1, Math.round(el.empty.lines || 1)), step = el.h / n;
          for (let i = 0; i < n; i++) {
            const y = el.y + step * (i + 1) - Math.min(step * 0.18, 2);
            ops.push({...base, op: 'line', x1: el.x, y1: y, x2: el.x + el.w, y2: y, stroke: color(el.empty.color || '#555555'), sw: el.empty.width || 0.3, dash: 0});
          }
          continue;
        }
        const t = XS.Layout.layoutText(doc, el, r.runs);
        if (t.overflow) warn(el, el.autoFit ? 'Текст не помещается даже при минимальном размере ' + el.minSize + ' pt.' : 'Текст не помещается в рамку.');
        if (t.missing.length) warn(el, 'В шрифте нет символов: ' + t.missing.join(' '));
        if (black) for (const line of t.lines) for (const p of line.pieces) p.color = '#000000';
        ops.push({...base, op: 'text', lines: t.lines, letterSpacing: t.letterSpacing, overflow: t.overflow});
      } else if (el.type === 'image') {
        const asset = resolveImage(doc, el.src, ctx);
        if (!asset) { if (el.src && row) warn(el, 'Изображение не найдено.'); continue; }
        ops.push({...base, op: 'image', asset, page: 1, fit: el.fit, shape: el.shape, radius: el.radius, x: el.x, y: el.y, w: el.w, h: el.h});
      } else if (el.type === 'rect') {
        ops.push({...base, op: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, fill: color(el.fill), stroke: color(el.stroke), sw: el.strokeWidth, radius: el.radius, shape: el.shape});
      } else if (el.type === 'line') {
        ops.push({...base, op: 'line', x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h, stroke: color(el.stroke), sw: el.strokeWidth, dash: el.dash});
      } else if (el.type === 'qr') {
        const text = XS.Fields.fill(el.data, ctx, {keepUnknown: false}).trim();
        if (!text) { if (row) warn(el, 'Нет данных для QR-кода.'); continue; }
        const side = Math.min(el.w, el.h), x = el.x + (el.w - side) / 2, y = el.y + (el.h - side) / 2;
        let q;
        try { q = XS.QR.path(text, side, {level: el.level, quiet: el.quiet}); } catch (e) { warn(el, 'QR-код: ' + e.message); continue; }
        if (q.module < 0.25) warn(el, 'QR-код слишком мелкий для печати (модуль ' + q.module.toFixed(2) + ' мм): увеличьте его или сократите текст.');
        if (el.background) ops.push({...base, op: 'rect', x, y, w: side, h: side, fill: black ? '#ffffff' : el.background, stroke: '', sw: 0, radius: 0, shape: 'rect'});
        ops.push({...base, op: 'path', d: q.d, x, y, fill: color(el.color), stroke: '', sw: 0});
      } else if (el.type === 'barcode') {
        const text = XS.Fields.fill(el.data, ctx, {keepUnknown: false}).trim();
        if (!text) { if (row) warn(el, 'Нет данных для штрихкода.'); continue; }
        const textH = el.showText ? Math.min(el.h * 0.4, el.textSize * XS.MM_PER_PT * 1.35) : 0, barH = el.h - textH;
        let b;
        try { b = XS.Barcode.path(text, el.w, barH, {type: el.symbology}); } catch (e) { warn(el, 'Штрихкод: ' + e.message + '.'); continue; }
        if (b.module < 0.19) warn(el, 'Штрихкод слишком узкий для печати (модуль ' + b.module.toFixed(2) + ' мм): растяните его или сократите данные.');
        if (el.background) ops.push({...base, op: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, fill: black ? '#ffffff' : el.background, stroke: '', sw: 0, radius: 0, shape: 'rect'});
        ops.push({...base, op: 'path', d: b.d, x: el.x, y: el.y, fill: color(el.color), stroke: '', sw: 0});
        if (textH > 0) {
          const label = XS.Model.element('text', {text: b.label, x: el.x, y: el.y + barH, w: el.w, h: textH, size: el.textSize, font: el.font, color: color(el.color), align: 'center', valign: 'middle', autoFit: true, minSize: 3, letterSpacing: 0.5});
          const t = XS.Layout.layoutText(doc, label, [{text: b.label, field: null}]);
          ops.push({...base, op: 'text', lines: t.lines, letterSpacing: t.letterSpacing, overflow: t.overflow});
        }
      } else if (el.type === 'path' && el.d) {
        ops.push({...base, op: 'path', d: el.d, x: el.x, y: el.y, fill: color(el.fill), stroke: color(el.stroke), sw: el.strokeWidth});
      }
    }
    return {ops, warnings, width: doc.page.width, height: doc.page.height, ctx};
  }

  /* Какие записи и в каком порядке выводить (с учётом диапазона и тиража). */
  function records(doc, {scope = 'all', range = '', current = 0, selected = null, useCopies = false} = {}) {
    const rows = doc.data.rows;
    let idx;
    if (!rows.length) idx = [-1];                         // нет данных — один экземпляр макета
    else if (scope === 'current') idx = [Math.min(current, rows.length - 1)];
    else if (scope === 'range') idx = XS.parseRange(range, rows.length);
    else if (scope === 'selected' && selected) idx = rows.map((r, i) => (selected.has(r.id) ? i : -2)).filter(i => i >= 0);
    else idx = rows.map((_, i) => i);
    const out = [];
    for (const i of idx) {
      const row = i >= 0 ? rows[i] : null;
      const copies = useCopies && row ? Math.max(0, row.copies ?? 1) : 1;
      for (let c = 0; c < copies; c++) out.push({row, index: Math.max(i, 0), copy: c});
    }
    return out;
  }

  XS.Scene = {build, records, elementLayer, resolveImage, visibleFor};
})(typeof window !== 'undefined' ? window : globalThis);
