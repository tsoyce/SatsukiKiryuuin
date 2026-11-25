/* XSatsu Студия · шрифты.
 * Одни и те же байты шрифта используются для расчёта переносов (fontkit), экрана (FontFace)
 * и PDF (pdf-lib), поэтому строки в предпросмотре и в файле совпадают. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const BUILTIN = [
    {family: 'PT Sans', category: 'Без засечек', variants: {regular: 'fonts/PT_Sans-Web-Regular.ttf', bold: 'fonts/PT_Sans-Web-Bold.ttf', italic: 'fonts/PT_Sans-Web-Italic.ttf', bolditalic: 'fonts/PT_Sans-Web-BoldItalic.ttf'}},
    {family: 'PT Serif', category: 'С засечками', variants: {regular: 'fonts/PT_Serif-Web-Regular.ttf', bold: 'fonts/PT_Serif-Web-Bold.ttf', italic: 'fonts/PT_Serif-Web-Italic.ttf', bolditalic: 'fonts/PT_Serif-Web-BoldItalic.ttf'}},
    {family: 'Montserrat', category: 'Без засечек', variants: {regular: 'fonts/Montserrat-Regular.ttf', bold: 'fonts/Montserrat-SemiBold.ttf'}},
    {family: 'PT Sans Narrow', category: 'Узкий', variants: {regular: 'fonts/PTSansNarrow-Regular.ttf', bold: 'fonts/PTSansNarrow-Bold.ttf'}},
    {family: 'Marck Script', category: 'Рукописный', variants: {regular: 'fonts/MarckScript-Regular.ttf'}},
    {family: 'Bad Script', category: 'Рукописный', variants: {regular: 'fonts/BadScript-Regular.ttf'}},
    {family: 'Lobster', category: 'Акцидентный', variants: {regular: 'fonts/Lobster-Regular.ttf'}}
  ];
  const faces = new Map();     // key → {key, css, fk, bytes}
  const loading = new Map();   // key → Promise
  let counter = 0;

  function variantName(bold, italic) { return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular'; }
  const FALLBACK = {bolditalic: ['bolditalic', 'bold', 'italic', 'regular'], bold: ['bold', 'regular'], italic: ['italic', 'regular'], regular: ['regular', 'bold', 'italic', 'bolditalic']};

  function families(doc) {
    const list = BUILTIN.map(f => ({family: f.family, category: f.category, source: 'builtin'}));
    for (const f of doc?.fonts || []) if (!list.some(x => x.family === f.family)) list.push({family: f.family, category: 'Загруженный', source: 'user'});
    return list;
  }

  /* Какой файл будет использован для семейства и начертания. */
  function pick(doc, family, bold, italic) {
    const wanted = variantName(bold, italic);
    const user = (doc?.fonts || []).filter(f => f.family === family);
    if (user.length) {
      for (const v of FALLBACK[wanted]) { const f = user.find(x => x.variant === v); if (f) return {key: 'u:' + f.id, source: f.data, variant: v, exact: v === wanted}; }
    }
    const b = BUILTIN.find(f => f.family === family) || BUILTIN[0];
    for (const v of FALLBACK[wanted]) if (b.variants[v]) return {key: 'b:' + b.family + ':' + v, source: b.variants[v], variant: v, exact: v === wanted && b.family === family};
  }

  async function load(choice) {
    if (faces.has(choice.key)) return faces.get(choice.key);
    if (loading.has(choice.key)) return loading.get(choice.key);
    const task = (async () => {
      if (!global.fontkit) throw new Error('Не загружена библиотека шрифтов (vendor/fontkit.umd.min.js).');
      const bytes = /^data:/.test(choice.source) ? XS.dataUrlToBytes(choice.source).bytes : await XS.fetchBytes(choice.source);
      const fk = global.fontkit.create(bytes);
      const css = 'xs-font-' + (++counter);
      if (global.FontFace && global.document) {
        const face = new FontFace(css, bytes.slice().buffer);
        await face.load();
        document.fonts.add(face);
      }
      const entry = {key: choice.key, css, fk, bytes};
      faces.set(choice.key, entry);
      return entry;
    })();
    loading.set(choice.key, task);
    try { return await task; } finally { loading.delete(choice.key); }
  }

  function get(doc, family, bold, italic) { const c = pick(doc, family, bold, italic); return c && faces.get(c.key); }
  function ensure(doc, family, bold, italic) { return load(pick(doc, family, bold, italic)); }

  /* Загружает все начертания, которые нужны тексту документа. */
  async function ensureForDoc(doc) {
    const jobs = [];
    for (const s of doc.sides) for (const el of s.elements) if (el.type === 'text') {
      jobs.push(ensure(doc, el.font, el.bold, el.italic));
      if (el.accent?.enabled) jobs.push(ensure(doc, el.accent.font || el.font, el.accent.bold, el.accent.italic));
    }
    for (const s of doc.sides) for (const el of s.elements) if (el.type === 'barcode' && el.showText) jobs.push(ensure(doc, el.font || 'PT Sans', false, false));
    await Promise.all(jobs);
  }

  /* Проверка загружаемого файла шрифта: семейство и начертание. */
  function inspect(bytes) {
    const fk = global.fontkit.create(bytes);
    const sub = String(fk.subfamilyName || '').toLowerCase();
    const bold = /bold|semibold|black|heavy|полужир|жирн/.test(sub);
    const italic = /italic|oblique|курсив/.test(sub);
    return {family: fk.familyName || 'Шрифт', variant: variantName(bold, italic), cyrillic: fk.hasGlyphForCodePoint(0x0416)};
  }

  XS.Fonts = {BUILTIN, families, pick, get, ensure, ensureForDoc, inspect, variantName};
})(typeof window !== 'undefined' ? window : globalThis);
