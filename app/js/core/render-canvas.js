/* XSatsu Студия · отрисовка сцены на canvas (экран, PNG, JPEG). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const PT = XS.MM_PER_PT;

  function shapePath(ctx, op, k) {
    ctx.beginPath();
    if (op.shape === 'ellipse') ctx.ellipse((op.x + op.w / 2) * k, (op.y + op.h / 2) * k, op.w / 2 * k, op.h / 2 * k, 0, 0, Math.PI * 2);
    else if (op.radius > 0 && ctx.roundRect) ctx.roundRect(op.x * k, op.y * k, op.w * k, op.h * k, Math.min(op.radius, op.w / 2, op.h / 2) * k);
    else ctx.rect(op.x * k, op.y * k, op.w * k, op.h * k);
  }

  async function drawPicture(ctx, op, k) {
    // Файл не пришёл с сервера — рисуем заметную заглушку, остальной макет (текст, поля) остаётся виден.
    if (!op.asset.data) {
      ctx.save(); shapePath(ctx, op, k); ctx.clip();
      ctx.fillStyle = 'rgba(148, 163, 184, .16)'; ctx.fillRect(op.x * k, op.y * k, op.w * k, op.h * k);
      ctx.strokeStyle = 'rgba(148, 163, 184, .55)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeRect(op.x * k + 1, op.y * k + 1, op.w * k - 2, op.h * k - 2);
      ctx.fillStyle = '#64748b'; ctx.font = Math.max(10, Math.min(16, op.w * k / 22)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('«' + (op.asset.name || 'файл') + '» не загрузился', (op.x + op.w / 2) * k, op.y * k + Math.min(op.h * k / 2, 22));
      ctx.restore(); return;
    }
    const isPdf = XS.Assets.isPdf(op.asset);
    let srcW = op.asset.width, srcH = op.asset.height;
    if (isPdf) { const p = op.asset.pages?.[(op.page || 1) - 1] || op.asset.pages?.[0]; if (p) { srcW = p.width; srcH = p.height; } }
    const r = XS.Assets.fitRect(srcW, srcH, op, op.fit || 'stretch');
    const source = await XS.Assets.drawable(op.asset, op.page || 1, r.w * k);
    if (!isPdf && (!srcW || !srcH)) { const fr = XS.Assets.fitRect(source.naturalWidth, source.naturalHeight, op, op.fit); Object.assign(r, fr); }
    ctx.save();
    shapePath(ctx, op, k);
    ctx.clip();
    ctx.globalAlpha = op.opacity ?? 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, r.x * k, r.y * k, r.w * k, r.h * k);
    ctx.restore();
  }

  /* ctx уже очищен; k — пикселей на мм. */
  async function draw(ctx, scene, k) {
    for (const op of scene.ops) {
      ctx.save();
      if (op.rot) { ctx.translate(op.cx * k, op.cy * k); ctx.rotate(op.rot * Math.PI / 180); ctx.translate(-op.cx * k, -op.cy * k); }
      ctx.globalAlpha = op.opacity ?? 1;
      if (op.op === 'bg' || op.op === 'image') { await drawPicture(ctx, op, k); ctx.restore(); continue; }
      if (op.op === 'rect') {
        shapePath(ctx, op, k);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        if (op.stroke && op.sw > 0) { ctx.lineWidth = op.sw * k; ctx.strokeStyle = op.stroke; ctx.stroke(); }
      } else if (op.op === 'line') {
        ctx.beginPath(); ctx.moveTo(op.x1 * k, op.y1 * k); ctx.lineTo(op.x2 * k, op.y2 * k);
        ctx.lineWidth = Math.max(op.sw, 0.05) * k; ctx.strokeStyle = op.stroke;
        if (op.dash > 0) ctx.setLineDash([op.dash * k, op.dash * k]);
        ctx.stroke();
      } else if (op.op === 'path') {
        ctx.translate(op.x * k, op.y * k); ctx.scale(k, k);
        const p = new Path2D(op.d);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(p); }
        if (op.stroke && op.sw > 0) { ctx.lineWidth = op.sw; ctx.strokeStyle = op.stroke; ctx.stroke(p); }
      } else if (op.op === 'text') {
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        if ('fontKerning' in ctx) ctx.fontKerning = 'none';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (op.letterSpacing * PT * k) + 'px';
        for (const line of op.lines) for (const p of line.pieces) {
          ctx.font = (p.size * PT * k) + 'px "' + p.face.css + '"';
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x * k, line.baseline * k);
        }
      }
      ctx.restore();
    }
  }

  /* Сцена → новый canvas с разрешением dpi. */
  async function toCanvas(scene, dpi, {background = '#ffffff', canvas = document.createElement('canvas')} = {}) {
    const k = dpi / 25.4;
    canvas.width = Math.max(1, Math.round(scene.width * k));
    canvas.height = Math.max(1, Math.round(scene.height * k));
    const ctx = canvas.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    await draw(ctx, scene, k);
    return canvas;
  }

  XS.CanvasRender = {draw, toCanvas};
})(typeof window !== 'undefined' ? window : globalThis);
