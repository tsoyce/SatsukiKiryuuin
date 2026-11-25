/* XSatsu Студия · модель документа.
 * Один формат для пригласительных, дипломов, закладок и открыток:
 *   страница (мм) → стороны (лицевая/оборот) → фон (картинка или PDF) + элементы;
 *   данные (таблица записей) подставляются в элементы через {Поле};
 *   output — настройки выгрузки и печати. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const {uid, num, clone} = XS;

  const KINDS = {
    invitation: {label: 'Пригласительные', naming: '{№} {ФИО}'},
    diploma: {label: 'Дипломы', naming: '{№} Диплом {ФИО}'},
    bookmark: {label: 'Закладки', naming: '{№} {Автор}'},
    card: {label: 'Открытки', naming: '{№} {ФИО}'},
    custom: {label: 'Свой макет', naming: '{№} {Проект}'}
  };
  const PAGE_PRESETS = [
    {id: 'a4', label: 'А4', width: 210, height: 297},
    {id: 'a5', label: 'А5', width: 148, height: 210},
    {id: 'a6', label: 'А6', width: 105, height: 148},
    {id: 'a3', label: 'А3', width: 297, height: 420},
    {id: 'dl', label: 'Евро (DL)', width: 99, height: 210},
    {id: 'bookmark', label: 'Закладка 50×150', width: 50, height: 150},
    {id: 'card', label: 'Визитка 90×50', width: 90, height: 50}
  ];
  const PAPER = {a4: [210, 297], a3: [297, 420], a5: [148, 210], sra3: [320, 450]};

  const ELEMENT_DEFAULTS = {
    common: {name: '', x: 10, y: 10, w: 60, h: 20, visible: true, locked: false, layer: 'auto', opacity: 1, rotate: 0, group: '', showIf: {field: '', op: 'filled', value: ''}},
    text: {text: 'Текст', font: 'PT Sans', size: 14, bold: false, italic: false, color: '#222222', align: 'center', valign: 'middle',
      lineHeight: 1.2, letterSpacing: 0, uppercase: false, autoFit: true, minSize: 6,
      accent: {enabled: false, fields: 'ФИО', font: '', size: 0, bold: true, italic: false, color: ''},
      empty: {mode: 'keep', lines: 2, color: '#555555', width: 0.3}},
    image: {src: '', fit: 'cover', shape: 'rect', radius: 0},
    rect: {fill: '#ffffff', stroke: '#222222', strokeWidth: 0.3, radius: 0, shape: 'rect'},
    line: {stroke: '#222222', strokeWidth: 0.3, dash: 0},
    path: {d: '', fill: '', stroke: '#222222', strokeWidth: 0.3},
    qr: {data: '{Ссылка}', color: '#000000', background: '#ffffff', level: 'M', quiet: 1},
    barcode: {data: '{№:000000}', symbology: 'code128', color: '#000000', background: '#ffffff', showText: true, textSize: 8, font: 'PT Sans'}
  };
  const TYPE_LABELS = {text: 'Текст', image: 'Изображение', rect: 'Фигура', line: 'Линия', path: 'Контур', qr: 'QR-код', barcode: 'Штрихкод'};
  /* Условия показа элемента: «показывать, если {Поле} …». */
  const CONDITIONS = [['filled', 'заполнено'], ['empty', 'пустое'], ['eq', 'равно'], ['neq', 'не равно'], ['contains', 'содержит']];

  function element(type, props = {}) {
    const base = clone({...ELEMENT_DEFAULTS.common, ...ELEMENT_DEFAULTS[type]});
    const el = Object.assign(base, clone(props), {id: props.id || uid('el'), type});
    el.showIf = Object.assign({field: '', op: 'filled', value: ''}, props.showIf || {});
    if (type === 'text') {
      el.accent = Object.assign(clone(ELEMENT_DEFAULTS.text.accent), props.accent || {});
      el.empty = Object.assign(clone(ELEMENT_DEFAULTS.text.empty), props.empty || {});
    }
    if (!el.name) el.name = TYPE_LABELS[type] || type;
    return el;
  }

  function normalizeElement(input) {
    if (!input || !ELEMENT_DEFAULTS[input.type]) return null;
    const el = element(input.type, input);
    for (const k of ['x', 'y']) el[k] = num(el[k], 0, -1000, 2000);
    for (const k of ['w', 'h']) el[k] = num(el[k], 10, input.type === 'line' ? 0 : 1, 2000);
    el.opacity = num(el.opacity, 1, 0, 1);
    el.rotate = input.type === 'line' ? 0 : +num(el.rotate, 0, -360, 360).toFixed(2);
    const si = input.showIf && typeof input.showIf === 'object' ? input.showIf : {};
    el.showIf = {field: String(si.field || '').slice(0, 100), op: CONDITIONS.some(c => c[0] === si.op) ? si.op : 'filled', value: String(si.value ?? '').slice(0, 200)};
    if (el.type === 'qr') {
      el.data = String(el.data ?? ''); el.quiet = Math.round(num(el.quiet, 1, 0, 8));
      if (!['L', 'M', 'Q', 'H'].includes(el.level)) el.level = 'M';
    }
    if (el.type === 'barcode') {
      el.data = String(el.data ?? ''); el.textSize = num(el.textSize, 8, 3, 72);
      if (!['code128', 'ean13'].includes(el.symbology)) el.symbology = 'code128';
    }
    if (!['auto', 'color', 'text'].includes(el.layer)) el.layer = 'auto';
    if (el.type === 'text') {
      el.size = num(el.size, 14, 2, 400); el.minSize = num(el.minSize, 6, 2, el.size);
      el.lineHeight = num(el.lineHeight, 1.2, 0.6, 4); el.letterSpacing = num(el.letterSpacing, 0, -5, 50);
      if (!['left', 'center', 'right'].includes(el.align)) el.align = 'center';
      if (!['top', 'middle', 'bottom'].includes(el.valign)) el.valign = 'middle';
      if (!['keep', 'lines', 'hide'].includes(el.empty.mode)) el.empty.mode = 'keep';
      el.text = String(el.text ?? '');
    }
    return el;
  }

  function side(id, name, props = {}) {
    return {id: id || uid('side'), name: name || 'Лицевая', background: null, elements: [], groups: [], ...props};
  }

  function blankDoc(kind = 'custom', title = 'Новый проект', page = {width: 148, height: 210}) {
    return {
      format: 'xsatsu-doc', version: 1, id: uid('doc'), title, kind,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      page: {...page},
      sides: [side('front', 'Лицевая')],
      data: {columns: [{id: 'c-name', name: 'ФИО'}], rows: [], current: 0},
      greeting: {enabled: false, nameField: 'ФИО', genderField: 'Пол', male: 'Уважаемый', female: 'Уважаемая', neutral: 'Здравствуйте'},
      assets: {},
      fonts: [],
      output: defaultOutput(kind)
    };
  }
  function defaultOutput(kind) {
    return {naming: (KINDS[kind] || KINDS.custom).naming, archive: '{Проект}', format: 'pdf', packaging: 'zip', dpi: 300, jpegQuality: 0.92,
      scope: 'all', range: '', sides: 'all', layer: 'all', laserBlack: true,
      paper: 'a4', paperOrientation: 'auto', margin: 5, gap: 0, cutMarks: true, duplex: 'long', useCopies: true, offsetX: 0, offsetY: 0, backOffsetX: 0, backOffsetY: 0};
  }

  function normalizeDoc(input) {
    if (!input || input.format !== 'xsatsu-doc') throw new Error('Это не проект XSatsu Студии.');
    const doc = blankDoc(input.kind in KINDS ? input.kind : 'custom', String(input.title || 'Без названия').slice(0, 200));
    doc.id = typeof input.id === 'string' ? input.id : doc.id;
    doc.createdAt = input.createdAt || doc.createdAt; doc.updatedAt = input.updatedAt || doc.updatedAt;
    doc.page = {width: num(input.page?.width, 148, 10, 2000), height: num(input.page?.height, 210, 10, 2000)};
    doc.sides = (Array.isArray(input.sides) && input.sides.length ? input.sides : [side('front')]).slice(0, 8).map((s, i) => ({
      id: String(s.id || (i ? 'back' : 'front')), name: String(s.name || (i ? 'Оборот' : 'Лицевая')),
      background: s.background && s.background.asset ? {asset: s.background.asset, page: num(s.background.page, 1, 1, 10000), fit: ['stretch', 'cover', 'contain'].includes(s.background.fit) ? s.background.fit : 'stretch', opacity: num(s.background.opacity, 1, 0, 1)} : null,
      elements: (Array.isArray(s.elements) ? s.elements : []).map(normalizeElement).filter(Boolean),
      groups: (Array.isArray(s.groups) ? s.groups : []).filter(g => g && g.id).map(g => ({id: String(g.id), name: String(g.name || 'Группа'), collapsed: !!g.collapsed}))
    }));
    for (const s of doc.sides) cleanGroups(s);
    const columns = Array.isArray(input.data?.columns) ? input.data.columns.filter(c => c && c.name).map(c => ({id: String(c.id || uid('c')), name: String(c.name).slice(0, 100), type: c.type === 'image' ? 'image' : 'text'})) : [];
    doc.data = {
      columns: columns.length ? columns : doc.data.columns,
      rows: (Array.isArray(input.data?.rows) ? input.data.rows : []).slice(0, 20000).map(r => ({id: String(r.id || uid('r')), cells: {...(r.cells || {})}, copies: Math.round(num(r.copies, 1, 0, 999))})),
      current: Math.round(num(input.data?.current, 0, 0, 20000))
    };
    doc.greeting = {...doc.greeting, ...(input.greeting || {})};
    doc.assets = {};
    for (const [id, a] of Object.entries(input.assets || {})) if (a && typeof a.data === 'string') doc.assets[id] = {id, name: String(a.name || id), mime: String(a.mime || ''), data: a.data, width: a.width, height: a.height, pages: a.pages, ...(/^[0-9a-f]{64}$/.test(a.sha256 || '') ? {sha256: a.sha256} : {})};
    doc.fonts = (Array.isArray(input.fonts) ? input.fonts : []).filter(f => f && f.family && typeof f.data === 'string').map(f => ({id: String(f.id || uid('font')), family: String(f.family), variant: ['regular', 'bold', 'italic', 'bolditalic'].includes(f.variant) ? f.variant : 'regular', name: String(f.name || f.family), data: f.data, ...(/^[0-9a-f]{64}$/.test(f.sha256 || '') ? {sha256: f.sha256} : {})}));
    doc.output = {...defaultOutput(doc.kind), ...(input.output || {})};
    return doc;
  }

  /* Группы: элементы одной группы идут подряд; пустые группы удаляются. */
  function cleanGroups(s) {
    s.groups = s.groups || [];
    const ids = new Set(s.groups.map(g => g.id));
    for (const el of s.elements) if (el.group && !ids.has(el.group)) el.group = '';
    const used = new Set(s.elements.map(e => e.group).filter(Boolean));
    s.groups = s.groups.filter(g => used.has(g.id));
    // Собираем участников каждой группы к самому верхнему из них, сохраняя их порядок.
    for (const g of s.groups) {
      const members = s.elements.filter(e => e.group === g.id);
      const top = s.elements.lastIndexOf(members[members.length - 1]);
      const before = s.elements.slice(0, top + 1).filter(e => e.group !== g.id);
      const after = s.elements.slice(top + 1).filter(e => e.group !== g.id);
      s.elements = [...before, ...members, ...after];
    }
    return s;
  }

  /* --- работа с данными --- */
  function columnByName(doc, name) {
    const k = XS.key(name);
    return doc.data.columns.find(c => XS.key(c.name) === k);
  }
  function addColumn(doc, name, type = 'text') {
    const existing = columnByName(doc, name);
    if (existing) return existing;
    const col = {id: uid('c'), name, type};
    doc.data.columns.push(col);
    return col;
  }
  function addRow(doc, values = {}) {
    const row = {id: uid('r'), cells: {}, copies: 1};
    for (const [name, value] of Object.entries(values)) row.cells[addColumn(doc, name).id] = value;
    doc.data.rows.push(row);
    return row;
  }
  function rowValues(doc, row) {
    const out = {};
    if (!row) return out;
    for (const c of doc.data.columns) out[c.name] = row.cells[c.id] ?? '';
    return out;
  }
  function addAsset(doc, {name, mime, data, width, height, pages}) {
    // Одинаковые файлы не дублируются.
    for (const a of Object.values(doc.assets)) if (a.data.length === data.length && a.data === data) return a;
    const id = uid('asset');
    doc.assets[id] = {id, name, mime, data, width, height, pages};
    return doc.assets[id];
  }
  function usedAssets(doc) {
    const used = new Set();
    for (const s of doc.sides) {
      if (s.background?.asset) used.add(s.background.asset);
      for (const el of s.elements) if (el.type === 'image' && /^asset:/.test(el.src)) used.add(el.src.slice(6));
    }
    for (const c of doc.data.columns) if (c.type === 'image') for (const r of doc.data.rows) { const v = r.cells[c.id]; if (/^asset:/.test(v || '')) used.add(v.slice(6)); }
    return used;
  }
  function pruneAssets(doc) {
    const used = usedAssets(doc);
    for (const id of Object.keys(doc.assets)) if (!used.has(id)) delete doc.assets[id];
  }

  XS.Model = {KINDS, PAGE_PRESETS, PAPER, TYPE_LABELS, CONDITIONS, ELEMENT_DEFAULTS, element, normalizeElement, side, cleanGroups, blankDoc, defaultOutput, normalizeDoc, columnByName, addColumn, addRow, rowValues, addAsset, usedAssets, pruneAssets};
})(typeof window !== 'undefined' ? window : globalThis);
