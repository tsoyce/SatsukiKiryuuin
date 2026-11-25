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
    const headers = rows.shift().map((h, i) => h.trim() || 'Столбец ' + (i + 1));
    while (headers.length < width) headers.push('Столбец ' + (headers.length + 1));
    return {headers, rows: rows.filter(r => r.some(c => c.trim())).map(r => headers.map((_, i) => (r[i] ?? '').trim()))};
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
      return {Arial: 'PT Sans', Verdana: 'PT Sans', 'Trebuchet MS': 'PT Sans', Georgia: 'PT Serif', 'Times New Roman': 'PT Serif', 'Courier New': 'PT Sans'}[id] || 'PT Sans';
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

  XS.Import = {parseTable, applyTable, toCsv, projectFromJson, fromInvitation, fromDiploma, fromBookmarks};
})(typeof window !== 'undefined' ? window : globalThis);
