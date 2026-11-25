/* XSatsu Студия · отрисовка сцены в векторный PDF (pdf-lib).
 * Текст остаётся текстом со встроенным шрифтом, PDF-фон встраивается как вектор. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const K = 72 / 25.4; // pt в 1 мм
  const L = () => global.PDFLib;

  function color(hex) { const c = XS.hexToRgb(hex); return L().rgb(c.r, c.g, c.b); }

  /* Кэш встроенных ресурсов на один PDF-документ. */
  function createCache(pdf) { return {pdf, fonts: new Map(), images: new Map(), pages: new Map()}; }
  async function font(cache, face) {
    if (!cache.fonts.has(face.key)) cache.fonts.set(face.key, cache.pdf.embedFont(face.bytes, {subset: true, features: XS.Layout.FEATURES}));
    return cache.fonts.get(face.key);
  }
  async function picture(cache, asset, page) {
    if (XS.Assets.isPdf(asset)) {
      const k = asset.id + '#' + page;
      if (!cache.pages.has(k)) cache.pages.set(k, cache.pdf.embedPdf(XS.dataUrlToBytes(asset.data).bytes, [Math.max(0, page - 1)]).then(r => r[0]));
      return {kind: 'pdf', obj: await cache.pages.get(k)};
    }
    if (!cache.images.has(asset.id)) cache.images.set(asset.id, XS.Assets.pdfImageBytes(asset).then(({mime, bytes}) => mime === 'image/jpeg' ? cache.pdf.embedJpg(bytes) : cache.pdf.embedPng(bytes)));
    return {kind: 'image', obj: await cache.images.get(asset.id)};
  }

  function ellipseOps(x, y, w, h) {
    const P = L(), kx = w / 2 * 0.5522847, ky = h / 2 * 0.5522847, cx = x + w / 2, cy = y + h / 2;
    return [P.moveTo(cx + w / 2, cy), P.appendBezierCurve(cx + w / 2, cy + ky, cx + kx, cy + h / 2, cx, cy + h / 2),
      P.appendBezierCurve(cx - kx, cy + h / 2, cx - w / 2, cy + ky, cx - w / 2, cy), P.appendBezierCurve(cx - w / 2, cy - ky, cx - kx, cy - h / 2, cx, cy - h / 2),
      P.appendBezierCurve(cx + kx, cy - h / 2, cx + w / 2, cy - ky, cx + w / 2, cy), P.closePath()];
  }
  function roundRectPath(w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
  }

  /* Поворот на deg по часовой стрелке (как на экране) вокруг точки (px, py) в системе PDF (ось Y вверх). */
  function rotation(deg, px, py) {
    const t = -deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py];
  }

  /* Рисует сцену на странице. matrix — преобразование из системы карточки (pt, начало внизу слева). */
  async function draw(page, scene, cache, matrix = [1, 0, 0, 1, 0, 0]) {
    const P = L(), H = scene.height;
    const X = x => x * K, Y = y => (H - y) * K;
    page.pushOperators(P.pushGraphicsState(), P.concatTransformationMatrix(...matrix));
    // Обрезаем всё по границе карточки, чтобы фон под обрез не залез на соседнюю.
    page.pushOperators(P.rectangle(0, 0, scene.width * K, H * K), P.clip(), P.endPath());
    for (const op of scene.ops) {
      const opacity = op.opacity ?? 1;
      if (op.rot) page.pushOperators(P.pushGraphicsState(), P.concatTransformationMatrix(...rotation(op.rot, X(op.cx), Y(op.cy))));
      if (op.op === 'bg' || op.op === 'image') {
        const pic = await picture(cache, op.asset, op.page || 1);
        const src = pic.kind === 'pdf' ? {w: pic.obj.width, h: pic.obj.height} : {w: pic.obj.width, h: pic.obj.height};
        const r = XS.Assets.fitRect(src.w, src.h, op, op.fit || 'stretch');
        page.pushOperators(P.pushGraphicsState());
        if (op.shape === 'ellipse') page.pushOperators(...ellipseOps(X(op.x), Y(op.y + op.h), op.w * K, op.h * K), P.clip(), P.endPath());
        else page.pushOperators(P.rectangle(X(op.x), Y(op.y + op.h), op.w * K, op.h * K), P.clip(), P.endPath());
        const box = {x: X(r.x), y: Y(r.y + r.h), width: r.w * K, height: r.h * K, opacity};
        if (pic.kind === 'pdf') page.drawPage(pic.obj, box); else page.drawImage(pic.obj, box);
        page.pushOperators(P.popGraphicsState());
      } else if (op.op === 'rect') {
        const fill = op.fill ? color(op.fill) : undefined, stroke = op.stroke && op.sw > 0 ? color(op.stroke) : undefined;
        if (op.shape === 'ellipse') page.drawEllipse({x: X(op.x + op.w / 2), y: Y(op.y + op.h / 2), xScale: op.w / 2 * K, yScale: op.h / 2 * K, color: fill, borderColor: stroke, borderWidth: stroke ? op.sw * K : 0, opacity, borderOpacity: opacity});
        else if (op.radius > 0) page.drawSvgPath(roundRectPath(op.w, op.h, op.radius), {x: X(op.x), y: Y(op.y), scale: K, color: fill, borderColor: stroke, borderWidth: stroke ? op.sw : 0, opacity, borderOpacity: opacity});
        else page.drawRectangle({x: X(op.x), y: Y(op.y + op.h), width: op.w * K, height: op.h * K, color: fill, borderColor: stroke, borderWidth: stroke ? op.sw * K : 0, opacity, borderOpacity: opacity});
      } else if (op.op === 'line') {
        page.drawLine({start: {x: X(op.x1), y: Y(op.y1)}, end: {x: X(op.x2), y: Y(op.y2)}, thickness: Math.max(op.sw, 0.05) * K, color: color(op.stroke), opacity, dashArray: op.dash > 0 ? [op.dash * K, op.dash * K] : undefined});
      } else if (op.op === 'path') {
        page.drawSvgPath(op.d, {x: X(op.x), y: Y(op.y), scale: K, color: op.fill ? color(op.fill) : undefined, borderColor: op.stroke && op.sw > 0 ? color(op.stroke) : undefined, borderWidth: op.stroke ? op.sw : 0, opacity, borderOpacity: opacity});
      } else if (op.op === 'text') {
        const ls = op.letterSpacing || 0;
        if (ls) page.pushOperators(P.setCharacterSpacing(ls));
        for (const line of op.lines) for (const p of line.pieces) {
          page.drawText(p.text, {x: X(p.x), y: Y(line.baseline), size: p.size, font: await font(cache, p.face), color: color(p.color), opacity});
        }
        if (ls) page.pushOperators(P.setCharacterSpacing(0));
      }
      if (op.rot) page.pushOperators(P.popGraphicsState());
    }
    page.pushOperators(P.popGraphicsState());
  }

  XS.PdfRender = {K, createCache, draw, rotation};
})(typeof window !== 'undefined' ? window : globalThis);
