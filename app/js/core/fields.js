/* XSatsu Студия · подстановка полей {Поле} в тексты и имена файлов. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const TOKEN = /\{([^{}\n]{1,80})\}/g;

  function today() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  function greetingFor(doc, values) {
    const g = doc.greeting;
    const gender = values[g.genderField] ?? '';
    const name = values[g.nameField] ?? '';
    const kind = global.GuestData ? global.GuestData.normalizeGender(gender, name) : 'neutral';
    return kind === 'male' ? g.male : kind === 'female' ? g.female : g.neutral;
  }

  /* Контекст записи: все значения, по которым ищется {Поле} (без учёта регистра). */
  function context(doc, row, index = 0, extra = {}) {
    const values = XS.Model.rowValues(doc, row);
    const map = new Map();
    for (const [k, v] of Object.entries(values)) map.set(XS.key(k), String(v ?? ''));
    const total = doc.data.rows.length;
    const builtins = {
      '№': String(index + 1),
      'номер': String(index + 1),
      'проект': doc.title,
      'мероприятие': doc.title,
      'дата': today(),
      'год': String(new Date().getFullYear()),
      'всего': String(total)
    };
    if (doc.greeting?.enabled || !map.has('обращение')) builtins['обращение'] = row ? greetingFor(doc, values) : doc.greeting.neutral;
    for (const [k, v] of Object.entries({...builtins, ...extra})) if (!map.has(XS.key(k))) map.set(XS.key(k), String(v));
    const gender = doc.greeting?.genderField ? String(values[doc.greeting.genderField] ?? '') : '';
    return {map, row, index, total, gender, blank: !row || Object.values(values).every(v => !String(v ?? '').trim())};
  }

  /* {Поле} или {Поле:модификаторы} — склонение и формы имени, см. names.js. */
  function lookup(ctx, name) {
    // {Поле|по умолчанию}: если значение пустое — подставляется текст после «|».
    const bar = name.indexOf('|');
    if (bar >= 0) {
      const value = lookup(ctx, name.slice(0, bar));
      return value === undefined || !value.trim() ? name.slice(bar + 1) : value;
    }
    const k = XS.key(name);
    if (ctx.map.has(k)) return ctx.map.get(k);
    if (name.includes(':') && XS.Names) {
      const {base, mods} = XS.Names.split(name), kb = XS.key(base);
      if (!ctx.map.has(kb)) return undefined;
      return XS.Names.apply(ctx.map.get(kb), mods, ctx.gender || '');
    }
    return undefined;
  }

  /* Текст → [{text, field}] — поле помечено, чтобы его можно было выделить другим стилем. */
  function runs(template, ctx, {keepUnknown = true} = {}) {
    const out = [], missing = [];
    let last = 0, m, hasField = false, allEmpty = true;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(template))) {
      if (m.index > last) out.push({text: template.slice(last, m.index), field: null});
      const value = lookup(ctx, m[1]);
      hasField = true;
      if (value === undefined) { missing.push(m[1]); if (keepUnknown) out.push({text: m[0], field: null}); }
      else { if (value.trim()) allEmpty = false; out.push({text: value, field: m[1].split(/[:|]/)[0].trim()}); }
      last = TOKEN.lastIndex;
    }
    if (last < template.length) out.push({text: template.slice(last), field: null});
    return {runs: out, missing, hasField, fieldsEmpty: hasField && allEmpty};
  }

  function fill(template, ctx, opts) { return runs(template, ctx, opts).runs.map(r => r.text).join(''); }

  function fieldsIn(template) {
    const out = [];
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(template || ''))) out.push(m[1].split(/[:|]/)[0].trim());
    return out;
  }

  /* Имя файла по шаблону; {№} дополняется нулями, чтобы файлы сортировались по порядку. */
  function fileName(pattern, ctx, extra = {}) {
    const width = String(Math.max(ctx.total, 1)).length;
    const padded = {'№': String(ctx.index + 1).padStart(width, '0'), 'номер': String(ctx.index + 1).padStart(width, '0'), ...extra};
    const local = {...ctx, map: new Map(ctx.map)};
    for (const [k, v] of Object.entries(padded)) local.map.set(XS.key(k), String(v));
    const name = fill(pattern || '{№}', local, {keepUnknown: false}).replace(/\s+/g, ' ').trim();
    return name || String(ctx.index + 1).padStart(width, '0');
  }

  XS.Fields = {TOKEN, context, runs, fill, fieldsIn, fileName, lookup, greetingFor};
})(typeof window !== 'undefined' ? window : globalThis);
