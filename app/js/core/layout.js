/* XSatsu Студия · вёрстка текста: переносы, автоуменьшение, выравнивание, выделение полей.
 * Результат — строки с координатами в мм; рисуют его и экран, и PDF. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const PT = XS.MM_PER_PT;
  const FEATURES = {kern: false, liga: false, clig: false, calt: false, rlig: false};
  const widthCache = new Map();
  const segmenter = global.Intl?.Segmenter ? new Intl.Segmenter('ru', {granularity: 'grapheme'}) : null;
  const graphemes = s => segmenter ? [...segmenter.segment(s)].map(x => x.segment) : Array.from(s);

  function unitsWidth(face, text) {
    const k = face.key + '\u0000' + text;
    let w = widthCache.get(k);
    if (w === undefined) {
      w = 0;
      for (const g of face.fk.layout(text, FEATURES).glyphs) w += g.advanceWidth;
      w /= face.fk.unitsPerEm;
      if (widthCache.size > 50000) widthCache.clear();
      widthCache.set(k, w);
    }
    return w;
  }
  /* Ширина в мм. letterSpacing — в pt, добавляется после каждого символа. */
  function measure(face, text, sizePt, letterSpacing = 0) {
    if (!text) return 0;
    return (unitsWidth(face, text) * sizePt + letterSpacing * graphemes(text).length) * PT;
  }
  function vmetrics(face, sizePt) {
    const s = sizePt * PT / face.fk.unitsPerEm;
    return {ascent: face.fk.ascent * s, descent: -face.fk.descent * s};
  }

  function accentApplies(el, field) {
    if (!el.accent?.enabled || !field) return false;
    const list = String(el.accent.fields || '').split(/[,;]/).map(XS.key).filter(Boolean);
    return !list.length || list.includes(XS.key(field));
  }

  /* Стили кусочков текста при заданном масштабе (scale = текущий размер / исходный). */
  function styledRuns(doc, el, runs, scale) {
    return runs.map(r => {
      const accent = accentApplies(el, r.field);
      const a = el.accent;
      const family = accent && a.font ? a.font : el.font;
      const bold = accent ? !!a.bold : el.bold, italic = accent ? !!a.italic : el.italic;
      const face = XS.Fonts.get(doc, family, bold, italic);
      if (!face) throw new Error('Шрифт «' + family + '» ещё не загружен.');
      const size = (accent && a.size > 0 ? a.size : el.size) * scale;
      const text = el.uppercase ? r.text.toLocaleUpperCase('ru-RU') : r.text;
      return {text, face, size, color: accent && a.color ? a.color : el.color, field: r.field};
    });
  }

  function wrap(pieces, width, ls) {
    // pieces: [{text, face, size, color}] — разбиваем на слова и пробелы, сохраняя стиль.
    const lines = [];
    let line = [], lineW = 0;
    const push = () => { lines.push(trimLine(line, ls)); line = []; lineW = 0; };
    for (const p of pieces) {
      const parts = p.text.replace(/\r\n?/g, '\n').split(/(\n|[ \t ]+)/);
      for (const part of parts) {
        if (!part) continue;
        if (part === '\n') { push(); continue; }
        const w = measure(p.face, part, p.size, ls);
        const isSpace = /^[ \t ]+$/.test(part);
        if (lineW + w <= width + 0.01 || (isSpace && line.length)) { line.push({...p, text: part, w}); lineW += w; continue; }
        if (isSpace) continue;
        if (line.length) push();
        if (w <= width + 0.01) { line.push({...p, text: part, w}); lineW = w; continue; }
        // Слово длиннее строки — разрываем по буквам.
        let chunk = '';
        for (const ch of graphemes(part)) {
          if (chunk && measure(p.face, chunk + ch, p.size, ls) > width + 0.01) { line.push({...p, text: chunk, w: measure(p.face, chunk, p.size, ls)}); push(); chunk = ''; }
          chunk += ch;
        }
        if (chunk) { const cw = measure(p.face, chunk, p.size, ls); line.push({...p, text: chunk, w: cw}); lineW = cw; }
      }
    }
    if (line.length || !lines.length) push();
    return lines;
  }
  function trimLine(line, ls) {
    const out = line.slice();
    while (out.length && /^[ \t ]+$/.test(out[out.length - 1].text)) out.pop();
    while (out.length && /^[ \t ]+$/.test(out[0].text)) out.shift();
    // Склеиваем соседние куски одного стиля — меньше операций рисования.
    const merged = [];
    for (const p of out) {
      const prev = merged[merged.length - 1];
      if (prev && prev.face === p.face && prev.size === p.size && prev.color === p.color) { prev.text += p.text; prev.w += p.w; }
      else merged.push({...p});
    }
    return {pieces: merged, width: merged.reduce((s, p) => s + p.w, 0)};
  }

  function block(doc, el, runs, scale) {
    const pieces = styledRuns(doc, el, runs, scale);
    const ls = el.letterSpacing * scale;
    const lines = wrap(pieces, el.w, ls);
    let height = 0;
    for (const line of lines) {
      const ref = line.pieces.length ? line.pieces : [pieces[0] || {face: XS.Fonts.get(doc, el.font, el.bold, el.italic), size: el.size * scale}];
      const maxSize = Math.max(...ref.map(p => p.size));
      const m = ref.reduce((acc, p) => { const v = vmetrics(p.face, p.size); return {ascent: Math.max(acc.ascent, v.ascent), descent: Math.max(acc.descent, v.descent)}; }, {ascent: 0, descent: 0});
      line.box = maxSize * PT * el.lineHeight;
      line.ascent = m.ascent; line.descent = m.descent;
      height += line.box;
    }
    const tooWide = lines.some(l => l.width > el.w + 0.05);
    return {lines, height, scale, overflow: height > el.h + 0.05 || tooWide};
  }

  /* Главная функция: вёрстка текстового элемента. */
  function layoutText(doc, el, runs) {
    let result = block(doc, el, runs, 1);
    if (result.overflow && el.autoFit) {
      const min = Math.min(1, el.minSize / el.size);
      let lo = min, hi = 1, best = null;
      const atMin = block(doc, el, runs, min);
      if (atMin.overflow) result = atMin;
      else {
        for (let i = 0; i < 12; i++) { // двоичный поиск наибольшего подходящего размера
          const mid = (lo + hi) / 2, r = block(doc, el, runs, mid);
          if (r.overflow) hi = mid; else { lo = mid; best = r; }
        }
        result = best || atMin;
      }
    }
    // Координаты строк.
    let y = el.y + (el.valign === 'middle' ? (el.h - result.height) / 2 : el.valign === 'bottom' ? el.h - result.height : 0);
    for (const line of result.lines) {
      line.baseline = y + (line.box - (line.ascent + line.descent)) / 2 + line.ascent;
      line.x = el.x + (el.align === 'center' ? (el.w - line.width) / 2 : el.align === 'right' ? el.w - line.width : 0);
      let x = line.x;
      for (const p of line.pieces) { p.x = x; x += p.w; }
      y += line.box;
    }
    const missing = new Set();
    for (const line of result.lines) for (const p of line.pieces) for (const ch of p.text) {
      const cp = ch.codePointAt(0);
      if (cp > 32 && !p.face.fk.hasGlyphForCodePoint(cp)) missing.add(ch);
    }
    return {lines: result.lines, overflow: result.overflow, scale: result.scale, size: el.size * result.scale, letterSpacing: el.letterSpacing * result.scale, missing: [...missing]};
  }

  XS.Layout = {layoutText, measure, vmetrics, FEATURES};
})(typeof window !== 'undefined' ? window : globalThis);
