/* XSatsu Студия · инструменты для списка (v4): сортировка, удаление повторов, найти и заменить,
 * фото по именам файлов, ссылка на Google Таблицу → адрес CSV. Без интерфейса — проверяются в node. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const collator = new Intl.Collator('ru', {numeric: true, sensitivity: 'base'});

  /* Сортировка записей по столбцу: числа и «I место / II место» — по смыслу, текст — по алфавиту, пустые — в конец. */
  function sortRows(doc, columnId, dir = 'asc') {
    const sign = dir === 'desc' ? -1 : 1;
    const value = r => String(r.cells[columnId] ?? '').trim();
    const numeric = v => { const n = XS.Formats?.parseNumber(v); return n !== null && n !== undefined ? n : XS.Formats?.fromRoman(v) ?? null; };
    const currentId = doc.data.rows[doc.data.current]?.id;
    doc.data.rows = doc.data.rows.map((r, i) => ({r, i})).sort((a, b) => {
      const va = value(a.r), vb = value(b.r);
      if (!va !== !vb) return va ? -1 : 1;
      const na = numeric(va), nb = numeric(vb);
      const c = na !== null && nb !== null ? na - nb : collator.compare(va, vb);
      return c ? c * sign : a.i - b.i;
    }).map(x => x.r);
    if (currentId) doc.data.current = Math.max(0, doc.data.rows.findIndex(r => r.id === currentId));
    return doc.data.rows.length;
  }

  /* Повторы: одинаковые значения в выбранных столбцах (без учёта регистра, ё/е и лишних пробелов). Пустые записи не трогаем. */
  function duplicates(doc, columnIds) {
    const cols = columnIds && columnIds.length ? columnIds : doc.data.columns.filter(c => c.type !== 'image').map(c => c.id);
    const seen = new Map(), dups = [];
    doc.data.rows.forEach((r, i) => {
      const key = cols.map(id => XS.key(r.cells[id]).replace(/\s+/g, ' ')).join('\u0001');
      if (!key.replace(/\u0001/g, '')) return;
      if (seen.has(key)) dups.push({index: i, of: seen.get(key), id: r.id}); else seen.set(key, i);
    });
    return dups;
  }
  function dedupe(doc, columnIds) {
    const ids = new Set(duplicates(doc, columnIds).map(d => d.id));
    doc.data.rows = doc.data.rows.filter(r => !ids.has(r.id));
    doc.data.current = Math.min(doc.data.current, Math.max(0, doc.data.rows.length - 1));
    return ids.size;
  }

  /* Найти и заменить. where: 'data' — значения таблицы, 'layout' — тексты макета, 'all'. → число замен. */
  function makeMatcher(find, {matchCase = false, wholeWord = false} = {}) {
    if (!find) throw new Error('Введите, что искать.');
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const W = '[0-9A-Za-zА-Яа-яЁё_]';
    return new RegExp(wholeWord ? '(?<!' + W + ')' + escaped + '(?!' + W + ')' : escaped, matchCase ? 'g' : 'gi');
  }
  function count(doc, find, opts = {}) {
    const re = makeMatcher(find, opts), where = opts.where || 'all';
    let n = 0;
    const scan = s => { const m = String(s ?? '').match(re); if (m) n += m.length; };
    if (where !== 'layout') for (const r of doc.data.rows) for (const c of doc.data.columns) if (c.type !== 'image') scan(r.cells[c.id]);
    if (where !== 'data') for (const s of doc.sides) for (const el of s.elements) { if (el.type === 'text') scan(el.text); if (el.type === 'qr' || el.type === 'barcode') scan(el.data); }
    return n;
  }
  function replace(doc, find, replacement, opts = {}) {
    const re = makeMatcher(find, opts), where = opts.where || 'all';
    let n = 0;
    const sub = s => String(s ?? '').replace(re, () => { n++; return replacement; });
    if (where !== 'layout') for (const r of doc.data.rows) for (const c of doc.data.columns) if (c.type !== 'image' && r.cells[c.id] != null) r.cells[c.id] = sub(r.cells[c.id]);
    if (where !== 'data') for (const s of doc.sides) for (const el of s.elements) {
      if (el.type === 'text') el.text = sub(el.text);
      if (el.type === 'qr' || el.type === 'barcode') el.data = sub(el.data);
    }
    return n;
  }

  /* Фото по именам файлов: «Иванов Иван.jpg», «ivanov.png», «003.jpg» (номер записи) → запись.
   * files: [{name, asset}] (asset — результат XS.Assets.fromFile). Совпадение ищется по столбцу keyColumnId:
   * точное имя → фамилия+имя → фамилия (если она одна такая) → номер записи. */
  const LAT = {a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', y: 'ы', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'ц'};
  function translit(s) {
    return s.replace(/shch|sch|zh|kh|ts|ch|sh|yu|ya|yo|[a-z]/g, m => ({shch: 'щ', sch: 'щ', zh: 'ж', kh: 'х', ts: 'ц', ch: 'ч', sh: 'ш', yu: 'ю', ya: 'я', yo: 'е'}[m] || LAT[m] || m))
      .replace(/([аеиоуыэюя])ы/g, '$1и'); // «aleksey» → «алексеи»
  }
  function norm(s) {
    let t = XS.key(String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '')).replace(/[_\-.,()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[a-z]/.test(t) && !/[а-я]/.test(t)) t = translit(t).replace(/й/g, 'и');
    return t.replace(/й/g, 'и').replace(/ъ|ь/g, '');
  }
  function matchPhotos(doc, files, keyColumnId, {imageColumnId = ''} = {}) {
    const rows = doc.data.rows, keyOf = r => norm(r.cells[keyColumnId]);
    const byFull = new Map(), byTwo = new Map(), byLast = new Map(), byInit = new Map(), byFile = new Map();
    const once = (map, k, i) => map.set(k, map.has(k) && map.get(k) !== i ? -1 : i);
    rows.forEach((r, i) => {
      // в столбце фото уже записано имя файла (пришло из Excel: «ivanov.jpg») — самое точное совпадение
      const fileCell = imageColumnId ? String(r.cells[imageColumnId] ?? '').trim() : '';
      if (fileCell && !/^asset:|^https?:/i.test(fileCell)) once(byFile, XS.key(fileCell.split(/[\\/]/).pop()), i);
      const k = keyOf(r); if (!k) return;
      const w = k.split(' ');
      once(byFull, k, i);
      if (w.length >= 2) once(byTwo, w[0] + ' ' + w[1], i);
      if (w.length >= 2) once(byInit, w[0] + ' ' + w.slice(1, 3).map(x => x[0]).join(''), i); // «Долгих Е.С.»
      once(byLast, w[0], i);
    });
    const ok = v => v !== undefined && v >= 0 ? v : undefined;
    const matched = [], unmatched = [];
    for (const f of files) {
      const k = norm(f.name), w = k.split(' ');
      let i = ok(byFile.get(XS.key(f.name)));
      let how = i !== undefined ? 'file' : '';
      const tryKey = (v, h) => { if (i === undefined && ok(v) !== undefined) { i = v; how = h; } };
      tryKey(byFull.get(k), 'name');
      if (w.length >= 2) tryKey(byTwo.get(w[0] + ' ' + w[1]), 'name');
      if (w.length >= 2) tryKey(byTwo.get(w[1] + ' ' + w[0]), 'name'); // «Иван Иванов»
      if (w.length >= 2 && w.slice(1).every(x => x.length <= 2)) tryKey(byInit.get(w[0] + ' ' + w.slice(1).join('').slice(0, 2)), 'initials');
      if (w.length === 1 && /^\d+$/.test(w[0])) { const n = +w[0] - 1; if (i === undefined && n >= 0 && n < rows.length) { i = n; how = 'number'; } }
      tryKey(byLast.get(w[0]), 'surname');
      if (i === undefined) unmatched.push(f.name); else matched.push({file: f, index: i, how});
    }
    return {matched, unmatched};
  }
  /* Применить найденные фото: файлы добавляются в проект, в столбец-картинку пишется asset:<id>. */
  function applyPhotos(doc, matched, imageColumnId) {
    for (const {file, index} of matched) {
      const a = XS.Model.addAsset(doc, file.asset);
      doc.data.rows[index].cells[imageColumnId] = 'asset:' + a.id;
    }
    return matched.length;
  }

  /* Ссылка на Google Таблицу (или «Опубликовать в интернете») → адрес выгрузки CSV. null — не похоже на Google Таблицу. */
  function sheetCsvUrl(url) {
    const s = String(url || '').trim();
    let m = /docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/.exec(s);
    if (m) { const gid = /[?&#]gid=(\d+)/.exec(s); return 'https://docs.google.com/spreadsheets/d/e/' + m[1] + '/pub?output=csv' + (gid ? '&gid=' + gid[1] : ''); }
    m = /docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/.exec(s);
    if (m) { const gid = /[?&#]gid=(\d+)/.exec(s); return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv' + (gid ? '&gid=' + gid[1] : ''); }
    return null;
  }

  XS.DataTools = {sortRows, duplicates, dedupe, count, replace, matchPhotos, applyPhotos, norm, sheetCsvUrl};
})(typeof window !== 'undefined' ? window : globalThis);
