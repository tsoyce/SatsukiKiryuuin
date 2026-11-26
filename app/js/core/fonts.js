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
    {family: 'Lobster', category: 'Акцидентный', variants: {regular: 'fonts/Lobster-Regular.ttf'}},
    // Tinos — свободный шрифт с теми же метриками, что у Times New Roman (сам Times New Roman распространять нельзя).
    {family: 'Times New Roman (Tinos)', category: 'С засечками', variants: {regular: 'fonts/Tinos-Regular.ttf', bold: 'fonts/Tinos-Bold.ttf', italic: 'fonts/Tinos-Italic.ttf', bolditalic: 'fonts/Tinos-BoldItalic.ttf'}}
  ];
  /* Названия из старых проектов и Word → встроенный аналог (если такого шрифта нет в самом проекте). */
  const ALIASES = {'times new roman': 'Times New Roman (Tinos)', 'times': 'Times New Roman (Tinos)', 'tinos': 'Times New Roman (Tinos)'};
  const faces = new Map();     // key → {key, css, fk, bytes}
  const loading = new Map();   // key → Promise
  let counter = 0;

  function variantName(bold, italic) { return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular'; }
  const FALLBACK = {bolditalic: ['bolditalic', 'bold', 'italic', 'regular'], bold: ['bold', 'regular'], italic: ['italic', 'regular'], regular: ['regular', 'bold', 'italic', 'bolditalic']};

  /* Категории: код из каталога → подпись. */
  const CATEGORY = {s: 'Без засечек', r: 'С засечками', d: 'Акцидентный', h: 'Рукописный', m: 'Моноширинный'};
  const SOURCE = {google: 'Google Fonts', local: 'С компьютера', upload: 'Загруженный', site: 'Шрифт сайта'};
  const WEIGHT_NAMES = {100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'};
  const WEIGHT_RU = {100: 'тонкий', 200: 'сверхсветлый', 300: 'светлый', 400: 'обычный', 500: 'средний', 600: 'полужирный', 700: 'жирный', 800: 'сверхжирный', 900: 'чёрный'};

  /* Все семейства, доступные документу: встроенные + добавленные в проект (Google Fonts, с компьютера, файлы). */
  function families(doc) {
    const list = BUILTIN.map(f => ({family: f.family, category: f.category, source: 'builtin', variants: Object.keys(f.variants)}));
    for (const f of doc?.fonts || []) {
      const have = list.find(x => x.family === f.family);
      if (have) { if (have.source !== 'builtin' && !have.variants.includes(f.variant)) have.variants.push(f.variant); continue; }
      list.push({family: f.family, category: CATEGORY[f.category] || SOURCE[f.source] || 'Загруженный', source: f.source || 'upload', variants: [f.variant]});
    }
    return list;
  }
  const isBuiltin = family => BUILTIN.some(f => f.family === family);
  /* Где в документе используется семейство (для предупреждения при удалении). */
  function usage(doc, family) {
    let n = 0;
    for (const s of doc.sides) for (const el of s.elements) {
      if (el.type === 'text' && (el.font === family || (el.accent?.enabled && el.accent.font === family))) n++;
      else if (el.type === 'barcode' && el.showText && el.font === family) n++;
    }
    return n;
  }

  /* ---------- каталог Google Fonts (fonts/google-catalog.json, собирается tools/build-font-catalog.cjs) ---------- */
  let catalogPromise = null;
  function catalog() {
    if (!catalogPromise) catalogPromise = XS.fetchJson('fonts/google-catalog.json').then(c => c.fonts.map(([family, cat, w, italic, cyr, pop]) => ({
      family, cat, category: CATEGORY[cat] || '', weights: [...String(w)].map(d => +d * 100), italic: !!italic, cyrillic: !!cyr, popular: !!pop
    }))).catch(e => { catalogPromise = null; throw e; });
    return catalogPromise;
  }
  const nearest = (list, w) => list.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, list[0]);
  /* Какие файлы взять для семейства каталога, если «обычным» назначен вес base:
   * обычный = base, жирный = 700 (или ближайший тяжелее base на 200+), курсивы — если они есть у семейства.
   * Для base ≠ 400 семейство в проекте называется «Montserrat Light» и т. п., чтобы не путать с обычным. */
  function plan(entry, base) {
    const ws = entry.weights.length ? entry.weights : [400];
    const regular = ws.includes(base) ? base : nearest(ws, base || 400);
    const heavier = ws.filter(w => w >= regular + 200);
    const bold = heavier.length ? (heavier.includes(700) && regular < 600 ? 700 : heavier[0]) : null;
    const name = regular === 400 || ws.length === 1 ? entry.family : entry.family + ' ' + WEIGHT_NAMES[regular];
    const files = [{variant: 'regular', weight: regular, italic: false}];
    if (bold) files.push({variant: 'bold', weight: bold, italic: false});
    if (entry.italic) { files.push({variant: 'italic', weight: regular, italic: true}); if (bold) files.push({variant: 'bolditalic', weight: bold, italic: true}); }
    return {family: name, regular, bold, files};
  }
  /* Один файл с сервера Студии (server/src/Fonts.php берёт целый TTF у Google). */
  async function fetchGoogle(family, weight, italic) {
    if (!XS.Api?.available) throw new Error('Шрифты Google Fonts скачиваются через сервер Студии, а он сейчас недоступен. Можно загрузить файл шрифта с компьютера.');
    const r = await XS.Api.call('GET', 'v1/fonts/google', undefined, {query: {family, weight, italic: italic ? 1 : 0}, timeout: 90000});
    if (!r?.bytes?.length) throw new Error('Сервер не прислал шрифт «' + family + '».');
    return {bytes: r.bytes, mime: r.mime || 'font/ttf'};
  }
  /* Ссылка на маленький CSS Google только для превью названия (text= — лишь нужные буквы, несколько КБ). */
  function previewCss(family, text, weight = 400) {
    return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + (weight !== 400 ? ':wght@' + weight : '') +
      '&text=' + encodeURIComponent([...new Set(text)].join('')) + '&display=swap';
  }

  /* Какой файл будет использован для семейства и начертания. */
  function pick(doc, family, bold, italic) {
    const wanted = variantName(bold, italic);
    const user = (doc?.fonts || []).filter(f => f.family === family && f.data);
    if (user.length) {
      for (const v of FALLBACK[wanted]) { const f = user.find(x => x.variant === v); if (f) return {key: 'u:' + f.id, source: f.data, variant: v, exact: v === wanted}; }
    }
    const b = BUILTIN.find(f => f.family === family) || BUILTIN.find(f => f.family === ALIASES[String(family || '').toLowerCase()]) || BUILTIN[0];
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
    let fk;
    try { fk = global.fontkit.create(bytes); } catch (e) { throw new Error('Файл не похож на шрифт (нужен TTF, OTF, WOFF или WOFF2).'); }
    if (fk.fonts && !fk.familyName) throw new Error('Это коллекция шрифтов (TTC) — в PDF её встроить нельзя. Возьмите отдельный файл TTF или OTF.');
    const sub = String(fk.subfamilyName || '').toLowerCase();
    const os2 = fk['OS/2'] || {};
    const bold = /bold|black|heavy|полужир|жирн/.test(sub) || (os2.usWeightClass >= 600 && !/regular|normal/.test(sub));
    const italic = /italic|oblique|курсив/.test(sub) || !!(os2.fsSelection && os2.fsSelection.italic);
    // fsType 0x0002 — автор запретил встраивать шрифт в документы.
    const fs = os2.fsType;
    const restricted = typeof fs === 'number' ? (fs & 0x000F) === 2 : !!fs?.noEmbedding;
    return {family: String(fk.familyName || 'Шрифт').trim(), variant: variantName(bold, italic), weight: os2.usWeightClass || (bold ? 700 : 400),
      cyrillic: fk.hasGlyphForCodePoint(0x0416), restricted, glyphs: fk.numGlyphs};
  }

  XS.Fonts = {BUILTIN, CATEGORY, SOURCE, WEIGHT_NAMES, WEIGHT_RU, families, isBuiltin, usage, pick, get, ensure, ensureForDoc, inspect, variantName,
    catalog, plan, fetchGoogle, previewCss};
})(typeof window !== 'undefined' ? window : globalThis);
