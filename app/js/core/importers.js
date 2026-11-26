/* XSatsu Студия · импорт: таблицы (CSV/TSV/вставка из Excel) и проекты старой версии v25. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const M = () => XS.Model;

  /* Разбор CSV/TSV с кавычками. Разделитель определяется автоматически. */
  function parseTable(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!text.trim()) return {headers: [], rows: []};
    const first = text.split('\n')[0];
    const counts = ['\t', ';', ','].map(d => [d, first.split(d).length - 1]);
    const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : '\t';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    const width = Math.max(...rows.map(r => r.length));
    const firstRaw = rows.shift().map(h => h.trim());
    const headers = firstRaw.map((h, i) => h || 'Столбец ' + (i + 1));
    while (headers.length < width) headers.push('Столбец ' + (headers.length + 1));
    return {headers, first: headers.map((_, i) => firstRaw[i] ?? ''), rows: rows.filter(r => r.some(c => c.trim())).map(r => headers.map((_, i) => (r[i] ?? '').trim()))};
  }

  /* ---- XLSX / ODS без сторонних парсеров: распаковка fflate + разбор XML ---- */
  const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
  const unxml = t => String(t).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
  const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? unxml(m[1]) : null; };
  const textOf = bytes => new TextDecoder('utf-8').decode(bytes);
  function colIndex(ref) { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  function serialDate(v) {
    const ms = Math.round((v - 25569) * 86400000), d = new Date(ms);
    if (isNaN(d)) return String(v);
    const p = n => String(n).padStart(2, '0');
    const date = p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
    return v % 1 ? date + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) : date;
  }
  const cleanNumber = v => { const n = Number(v); return Number.isFinite(n) ? String(+n.toPrecision(12)) : String(v); };

  function grid(cells) {
    // cells: массив строк (массивов) → {headers, rows} как у parseTable
    const rows = cells.map(r => r.map(c => String(c ?? '').trim()));
    while (rows.length && !rows[0].some(Boolean)) rows.shift();
    if (!rows.length) return {headers: [], rows: []};
    let width = 0;
    for (const r of rows) for (let i = r.length - 1; i >= 0; i--) if (r[i]) { width = Math.max(width, i + 1); break; }
    const headers = Array.from({length: width}, (_, i) => rows[0][i] || 'Столбец ' + (i + 1));
    // first — первая строка как есть: если заголовков в файле нет (просто список ФИО), она тоже данные (см. XS.ImportMap)
    return {headers, first: headers.map((_, i) => rows[0][i] ?? ''), rows: rows.slice(1).filter(r => r.some(Boolean)).map(r => headers.map((_, i) => r[i] ?? ''))};
  }

  function readXlsx(bytes) {
    const files = XS.Zip.unzip(bytes, n => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(n));
    const wb = files['xl/workbook.xml'] ? textOf(files['xl/workbook.xml']) : '';
    const rels = files['xl/_rels/workbook.xml.rels'] ? textOf(files['xl/_rels/workbook.xml.rels']) : '';
    const firstSheet = /<sheet\b[^>]*>/.exec(wb);
    let path = 'xl/worksheets/sheet1.xml';
    if (firstSheet) {
      const rid = attr(firstSheet[0], 'r:id');
      const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'Id') === rid);
      if (rel) { const target = attr(rel, 'Target').replace(/^\/?xl\//, '').replace(/^\//, ''); path = 'xl/' + target; }
    }
    const sheet = files[path] || Object.entries(files).find(([n]) => /^xl\/worksheets\//.test(n))?.[1];
    if (!sheet) throw new Error('В книге Excel не найден лист.');
    const shared = [];
    if (files['xl/sharedStrings.xml']) for (const m of textOf(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(unxml([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    }
    // Форматы дат: встроенные 14–22, 45–47 и свои с d/m/y.
    const dateStyles = new Set();
    if (files['xl/styles.xml']) {
      const st = textOf(files['xl/styles.xml']), custom = new Map();
      for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) custom.set(attr(m[0], 'numFmtId'), attr(m[0], 'formatCode') || '');
      const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st);
      if (xfs) [...xfs[1].matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
        const id = +attr(m[0], 'numFmtId');
        const code = (custom.get(String(id)) || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
        if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom.has(String(id)) && /[dy]/i.test(code))) dateStyles.add(i);
      });
    }
    const out = [];
    for (const rm of textOf(sheet).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = +(attr(rm[1], 'r') || out.length + 1) - 1;
      if (r > 20000) break;
      const row = out[r] = out[r] || [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[1], 'r'), t = attr(cm[1], 't'), s = +(attr(cm[1], 's') || 0), inner = cm[2] || '';
        const c = ref ? colIndex(ref) : row.length;
        if (c > 500) continue;
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = '';
        if (t === 's') value = shared[+v] ?? '';
        else if (t === 'inlineStr') value = unxml([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (t === 'b') value = v === '1' ? 'да' : 'нет';
        else if (t === 'str' || t === 'e') value = unxml(v ?? '');
        else if (v != null) value = dateStyles.has(s) ? serialDate(+v) : cleanNumber(v);
        row[c] = value;
      }
    }
    return grid(Array.from(out, r => r || []));
  }

  function readOds(bytes) {
    const files = XS.Zip.unzip(bytes, n => n === 'content.xml');
    if (!files['content.xml']) throw new Error('Это не таблица OpenDocument (.ods).');
    const xml = textOf(files['content.xml']);
    const table = /<table:table\b[^>]*>([\s\S]*?)<\/table:table>/.exec(xml);
    if (!table) throw new Error('В файле нет листа.');
    const out = [];
    for (const rm of table[1].matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const row = [];
      for (const cm of (rm[2] || '').matchAll(/<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:\1>)/g)) {
        const rep = Math.min(+(attr(cm[2], 'table:number-columns-repeated') || 1), 500 - row.length);
        const type = attr(cm[2], 'office:value-type');
        let value = [...(cm[3] || '').matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map(p => unxml(p[1].replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<text:line-break\/>/g, '\n').replace(/<[^>]+>/g, ''))).join('\n');
        if (type === 'float' || type === 'percentage') value = cleanNumber(attr(cm[2], 'office:value') ?? value) || value;
        if (type === 'date' && attr(cm[2], 'office:date-value')) { const d = attr(cm[2], 'office:date-value').split('T')[0].split('-'); value = d[2] + '.' + d[1] + '.' + d[0]; }
        for (let i = 0; i < rep; i++) row.push(value);
      }
      const rep = Math.min(+(attr(rm[1], 'table:number-rows-repeated') || 1), 20000 - out.length);
      if (!row.some(Boolean) && rep > 1) { for (let i = 0; i < Math.min(rep, 3); i++) out.push([]); continue; }
      for (let i = 0; i < rep; i++) out.push(row);
      if (out.length >= 20000) break;
    }
    return grid(out);
  }

  /* Текст CSV: UTF-8, а если не читается — Windows-1251 (старый Excel). */
  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1251').decode(bytes); }
  }
  /* Любой табличный файл → {headers, rows}. */
  function readTableFile(bytes, name = '') {
    const ext = String(name).toLowerCase().split('.').pop();
    const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (ext === 'xls' && !zipped) throw new Error('Старый формат .xls не поддерживается: сохраните файл в Excel как .xlsx или CSV.');
    if (zipped && ext === 'ods') return readOds(bytes);
    if (zipped) return readXlsx(bytes);
    return parseTable(decodeText(bytes));
  }

  /* Добавляет/заменяет записи в документе. Столбцы сопоставляются по названию. */
  function applyTable(doc, table, {replace = false} = {}) {
    if (replace) doc.data.rows = [];
    const cols = table.headers.map(h => M().addColumn(doc, h));
    for (const r of table.rows) {
      const row = {id: XS.uid('r'), cells: {}, copies: 1};
      cols.forEach((c, i) => { row.cells[c.id] = r[i]; });
      doc.data.rows.push(row);
    }
    return table.rows.length;
  }
  function toCsv(doc) {
    const q = v => /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const lines = [doc.data.columns.map(c => q(c.name)).join(';')];
    for (const r of doc.data.rows) lines.push(doc.data.columns.map(c => q(r.cells[c.id] ?? '')).join(';'));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /* ---- проекты v25 ---- */
  async function fromInvitation(p) {
    const s = p.settings || {};
    const doc = M().blankDoc('invitation', s.eventName || 'Пригласительные', {width: XS.num(s.cardWidth, 148), height: XS.num(s.cardHeight, 210)});
    if (s.cardOrientation === 'landscape' && doc.page.width < doc.page.height) [doc.page.width, doc.page.height] = [doc.page.height, doc.page.width];
    const W = doc.page.width, H = doc.page.height;
    let template = typeof p.template === 'string' && p.template.startsWith('data:image') ? p.template : '';
    if (!template && p.isSample !== false) template = await XS.fetchDataUrl('presets/assets/invitation-sociology.jpg');
    if (template) {
      const img = await XS.Assets.image({id: 'probe-inv', data: template});
      const a = M().addAsset(doc, {name: p.templateName || 'Макет', mime: /^data:([^;]+)/.exec(template)[1], data: template, width: img.naturalWidth, height: img.naturalHeight});
      doc.sides[0].background = {asset: a.id, page: 1, fit: s.backgroundFit || 'stretch', opacity: 1};
    }
    const fontName = id => {
      const custom = (p.fonts || []).find(f => f.id === id);
      if (custom) return custom.name;
      return {Arial: 'PT Sans', Verdana: 'PT Sans', 'Trebuchet MS': 'PT Sans', Georgia: 'PT Serif', 'Times New Roman': 'Times New Roman (Tinos)', 'Courier New': 'PT Sans'}[id] || 'PT Sans';
    };
    for (const f of p.fonts || []) if (typeof f.data === 'string') doc.fonts.push({id: XS.uid('font'), family: f.name || 'Шрифт', variant: 'regular', name: f.name || 'Шрифт', data: f.data});
    const blocks = Array.isArray(p.blocks) && p.blocks.length ? p.blocks : [s];
    doc.sides[0].elements = blocks.map((b, i) => M().element('text', {
      name: b.label || 'Текст ' + (i + 1), text: String(b.textTemplate || '').replace(/\{мероприятие\}/gi, s.eventName || '{Проект}'),
      x: XS.num(b.boxX, 5) / 100 * W, y: XS.num(b.boxY, 30) / 100 * H, w: XS.num(b.boxW, 90) / 100 * W, h: XS.num(b.boxH, 20) / 100 * H,
      font: fontName(b.fontFamily), size: XS.num(b.fontSize, 14), bold: !!b.fontBold, italic: !!b.fontItalic, color: b.textColor || '#222222',
      align: b.textAlign || 'left', valign: b.verticalAlign || 'top', lineHeight: XS.num(b.lineHeight, 1.2), uppercase: b.textCase === 'upper', autoFit: b.autoFit !== false,
      visible: b.blockVisible !== false,
      accent: {enabled: !!b.nameAccentEnabled, fields: 'ФИО', font: fontName(b.nameFontFamily), size: XS.num(b.nameFontSize, 0), bold: !!b.nameFontBold, italic: !!b.nameFontItalic, color: b.nameTextColor || ''}
    }));
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-sex', name: 'Пол'}, {id: 'c-mail', name: 'Email'}];
    for (const g of p.guests || []) M().addRow(doc, {'ФИО': g.name || '', 'Пол': g.genderMode === 'auto' ? '' : g.gender === 'male' ? 'М' : g.gender === 'female' ? 'Ж' : '', 'Email': g.email || ''});
    doc.greeting = {...doc.greeting, enabled: true, male: s.greetingMale || 'Уважаемый', female: s.greetingFemale || 'Уважаемая', neutral: s.greetingNeutral || 'Здравствуйте'};
    doc.output.naming = '{№} {ФИО}';
    return doc;
  }

  async function fromDiploma(p) {
    const s = p.settings || {};
    const doc = s.theme === 'frost' ? await XS.Presets.diplomaFrost() : await XS.Presets.diplomaClassic();
    doc.title = p.title || doc.title;
    doc.data.rows = [];
    const set = (name, text, visible = true) => { const el = doc.sides[0].elements.find(e => e.name === name); if (el) { if (text !== undefined) el.text = text; el.visible = visible && !!String(el.text).trim(); } };
    set('Заголовок', s.heading || 'ДИПЛОМ');
    set('Мероприятие', s.eventName || '', s.showEvent !== false);
    set('Подзаголовок', s.eventSubtitle || '', s.showEventSubtitle !== false);
    set('Награждается', s.recipientLabel || 'Награждается');
    set('Основание', '{Основание}', s.showReason !== false);
    set('Город и дата', [s.showCity !== false ? s.city : '', s.showDate !== false ? s.date : ''].filter(Boolean).join(' · '));
    set('Должность', s.signatureMode === 'committee' ? s.committeeRole : s.departmentRole);
    set('Подписант', (s.signatureMode === 'committee' ? s.committeeName : s.departmentName) || '');
    const place = v => ({1: 'I место', 2: 'II место', 3: 'III место'}[v] || '');
    for (const e of p.entries || []) {
      const row = M().addRow(doc, {'ФИО': e.handRecipient ? '' : e.recipient || '', 'Место': place(e.place), 'Основание': e.handReason ? '' : e.reason || ''});
      row.copies = Math.max(1, Math.round(XS.num(e.copies, 1)));
    }
    return doc;
  }

  async function fromBookmarks(p) {
    const doc = await XS.Presets.bookmarks();
    doc.title = p.title || doc.title;
    doc.data.rows = [];
    const images = new Map((p.images || []).map(i => [i.id, i]));
    for (const c of p.cards || []) {
      const img = images.get(c.photoId);
      let src = '';
      if (img?.dataUrl) {
        const probe = await XS.Assets.image({id: 'probe-' + img.id, data: img.dataUrl}).catch(() => null);
        src = 'asset:' + M().addAsset(doc, {name: img.name || c.name, mime: /^data:([^;]+)/.exec(img.dataUrl)[1], data: img.dataUrl, width: probe?.naturalWidth, height: probe?.naturalHeight}).id;
      }
      const row = M().addRow(doc, {'Автор': c.name || '', 'Цитата': c.quote || '', 'Фото': src});
      row.copies = Math.max(1, Math.round(XS.num(c.copies, 1)));
    }
    M().pruneAssets(doc);
    return doc;
  }

  /* Любой JSON-файл проекта: новый формат или v25. */
  async function projectFromJson(json) {
    const p = typeof json === 'string' ? JSON.parse(json) : json;
    const data = p && p.project && p.project.format ? p.project : p; // ответы сервера v25 оборачивают проект
    if (data?.format === 'xsatsu-doc') { const doc = M().normalizeDoc(data); doc.id = XS.uid('doc'); return doc; }
    if (data?.format === 'invite-studio') return fromInvitation(data);
    if (data?.format === 'diploma-studio') return fromDiploma(data);
    if (data?.format === 'bookmark-studio') return fromBookmarks(data);
    throw new Error('Не узнаю формат файла. Поддерживаются проекты Студии и проекты v25 (пригласительные, дипломы, закладки).');
  }

  XS.Import = {readTableFile, readXlsx, readOds, decodeText, parseTable, applyTable, toCsv, projectFromJson, fromInvitation, fromDiploma, fromBookmarks};
})(typeof window !== 'undefined' ? window : globalThis);
