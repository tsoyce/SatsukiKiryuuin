/* XSatsu Студия · проверка списка перед выгрузкой: повторы, пустые поля, опечатки (латиница в кириллице),
 * лишние пробелы, пол и склонение. Ошибка в дипломе = перепечатка, поэтому проверяем до печати.
 * Результат — [{record, side: 'Данные', name, msg, fix?}]. */
(function (global) {
  'use strict';
  const XS = global.XS;
  // Латинские буквы, которые выглядят как кириллические.
  const LOOKALIKE = {a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У'};
  const MIXED = /[А-Яа-яЁё][A-Za-z]|[A-Za-z][А-Яа-яЁё]/;

  /* Какие поля и модификаторы используются в макете: {key → {name, mods:Set, elements:[el]}} */
  function usedFields(doc) {
    const out = new Map();
    const add = (token, el) => {
      const {base, mods} = XS.Names.split(token), k = XS.key(base);
      if (!out.has(k)) out.set(k, {name: base, mods: new Set(), elements: []});
      const f = out.get(k);
      for (const m of mods) f.mods.add(XS.key(m));
      if (el && !f.elements.includes(el)) f.elements.push(el);
    };
    for (const s of doc.sides) for (const el of s.elements) {
      if (!el.visible) continue;
      const src = el.type === 'text' ? el.text : el.type === 'qr' ? el.data : el.type === 'image' ? el.src : '';
      let m; XS.Fields.TOKEN.lastIndex = 0;
      while ((m = XS.Fields.TOKEN.exec(src || ''))) add(m[1], el);
    }
    return out;
  }

  function fixLatin(word) { return word.replace(/[A-Za-z]/g, ch => LOOKALIKE[ch] || ch); }
  /* Слова, где латиница смешана с кириллицей и все латинские буквы — «двойники». */
  function latinTypos(value) {
    return String(value).split(/\s+/).filter(w => MIXED.test(w) && /[А-Яа-яЁё]/.test(fixLatin(w)) && !/[A-Za-z]/.test(fixLatin(w)));
  }

  function data(doc) {
    const problems = [], cols = doc.data.columns.filter(c => c.type !== 'image');
    const used = usedFields(doc), rows = doc.data.rows;
    const label = cols[0];
    const seen = new Map();
    const caseMods = new Set(Object.keys(XS.Names.CASES));
    const usesGreeting = used.has('обращение') && !doc.data.columns.some(c => XS.key(c.name) === 'обращение');
    const nameCol = XS.Model.columnByName(doc, doc.greeting.nameField || 'ФИО');
    rows.forEach((row, i) => {
      const rec = i + 1, add = (name, msg, fix) => problems.push({record: rec, side: 'Данные', name, msg, fix, kind: 'data'});
      const values = XS.Model.rowValues(doc, row);
      if (!Object.values(values).some(v => String(v ?? '').trim())) return; // бланк — это нормально
      if (label) {
        const k = XS.key(values[label.name]).replace(/\s+/g, ' ');
        if (k) { if (seen.has(k)) add(label.name, 'Повтор: то же значение, что в записи ' + seen.get(k) + '.'); else seen.set(k, rec); }
      }
      for (const c of cols) {
        const v = String(row.cells[c.id] ?? '');
        if (v && (v !== v.trim() || / {2,}/.test(v))) add(c.name, 'Лишние пробелы: «' + v + '».', 'spaces');
        const typos = latinTypos(v);
        if (typos.length) add(c.name, 'Латинские буквы в русском слове: ' + typos.map(w => '«' + w + '»').join(', ') + '.', 'latin');
        const f = used.get(XS.key(c.name));
        if (f && !v.trim()) {
          const silent = f.elements.every(el => (el.type === 'text' && el.empty.mode !== 'keep') || (el.showIf?.field && XS.key(XS.Names.split(el.showIf.field).base) === XS.key(c.name)));
          if (!silent) add(c.name, 'Пустое поле {' + c.name + '} используется в макете.');
        }
        if (f && v.trim() && [...f.mods].some(m => caseMods.has(m) || ['инициалы', 'ио', 'иф', 'фи', 'фамилия', 'имя', 'отчество'].includes(m)) && !XS.Names.parse(v)) {
          add(c.name, 'Не похоже на ФИО («' + v + '») — склонение и сокращения не применены.');
        }
      }
      const needsGender = usesGreeting || [...used.values()].some(f => [...f.mods].some(m => caseMods.has(m) && m !== 'им'));
      if (needsGender && nameCol) {
        const name = String(row.cells[nameCol.id] ?? '');
        const gCol = XS.Model.columnByName(doc, doc.greeting.genderField || 'Пол');
        const g = global.GuestData ? global.GuestData.normalizeGender(gCol ? row.cells[gCol.id] : '', name) : 'neutral';
        if (name.trim() && XS.Names.parse(name) && g === 'neutral') add(nameCol.name, 'Не удалось определить пол «' + name + '» — укажите М/Ж в столбце «' + (doc.greeting.genderField || 'Пол') + '».');
      }
    });
    return problems;
  }

  /* Автоисправление: 'spaces' — лишние пробелы, 'latin' — латинские двойники в русских словах. Возвращает число правок. */
  function fix(doc, kind) {
    let n = 0;
    for (const row of doc.data.rows) for (const c of doc.data.columns) {
      if (c.type === 'image') continue;
      const v = String(row.cells[c.id] ?? '');
      let next = v;
      if (kind === 'spaces') next = v.replace(/[ \t]{2,}/g, ' ').trim();
      if (kind === 'latin') next = v.split(/(\s+)/).map(w => (latinTypos(w).length ? fixLatin(w) : w)).join('');
      if (next !== v) { row.cells[c.id] = next; n++; }
    }
    return n;
  }

  XS.Check = {data, fix, usedFields, latinTypos};
})(typeof window !== 'undefined' ? window : globalThis);
