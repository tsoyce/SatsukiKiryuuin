/* XSatsu Студия · импорт списка с сопоставлением столбцов.
 * Таблица из файла, вставки или Google Таблицы → «какой столбец файла в какой столбец проекта».
 * Угадывает по названию (с синонимами: «Ф.И.О.», «Участник», «E-mail»…) и по данным (ФИО, почта, пол, ссылки, фото),
 * понимает, что заголовков нет (просто список ФИО), предлагает режим: добавить, обновить по ключу, вписать по порядку, заменить.
 * Без интерфейса — проверяется в node (tests/core.test.cjs). Окно — ui/import-dialog.js. */
(function (global) {
  'use strict';
  const XS = global.XS;
  const M = () => XS.Model;

  /* Синонимы названий столбцов → смысловая группа. */
  const GROUPS = {
    fio: ['фио', 'ф и о', 'фамилия имя отчество', 'полное имя', 'имя участника', 'участник', 'участники', 'фио участника', 'фио полностью', 'name', 'full name', 'fullname', 'получатель', 'награждается', 'награждаемый', 'гость', 'сотрудник', 'студент', 'ученик', 'человек', 'фио гостя', 'фио сотрудника', 'фио студента'],
    surname: ['фамилия', 'surname', 'last name', 'lastname'],
    firstname: ['имя', 'first name', 'firstname'],
    patronymic: ['отчество', 'middle name', 'patronymic'],
    gender: ['пол', 'gender', 'sex'],
    email: ['email', 'e mail', 'почта', 'эл почта', 'электронная почта', 'адрес электронной почты', 'mail'],
    phone: ['телефон', 'тел', 'phone', 'мобильный', 'номер телефона'],
    image: ['фото', 'фотография', 'портрет', 'photo', 'picture', 'изображение', 'картинка', 'аватар', 'image', 'фото участника'],
    org: ['организация', 'вуз', 'университет', 'учреждение', 'школа', 'место работы', 'место учебы', 'компания', 'company', 'organization', 'учебное заведение'],
    role: ['роль', 'статус', 'категория', 'должность', 'role', 'position'],
    url: ['ссылка', 'url', 'link', 'сайт', 'qr'],
    place: ['место', 'призовое место', 'результат', 'place', 'награда', 'степень'],
    team: ['команда', 'team', 'название команды'],
    copies: ['экз', 'экземпляров', 'копий', 'количество', 'copies']
  };
  const GROUP_KIND = {fio: 'fio', gender: 'gender', email: 'email', image: 'image', url: 'url'};
  const NEW_NAME = {fio: 'ФИО', email: 'Email', gender: 'Пол', image: 'Фото', url: 'Ссылка', phone: 'Телефон', date: 'Дата'};

  const COPIES = '__copies'; // столбец «Экз.» файла → число экземпляров записи
  const norm = s => XS.key(s).replace(/[.,:;_\-–—()"«»/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
  const groupIndex = new Map();
  for (const [g, list] of Object.entries(GROUPS)) for (const n of list) groupIndex.set(norm(n), g);
  function group(name) { return groupIndex.get(norm(name)) || null; }

  /* Что за значение: ФИО, почта, пол, ссылка на картинку, имя файла картинки, ссылка, число, дата, текст. */
  const W = '[А-ЯЁ][А-ЯЁа-яё]*(?:-[А-ЯЁ][А-ЯЁа-яё]*)?';
  const RE = {
    fio: new RegExp('^' + W + '(?:\\s+' + W + '){1,3}$'),
    fioInitials: new RegExp('^' + W + '\\s+[А-ЯЁ]\\.\\s?(?:[А-ЯЁ]\\.?)?$'),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    imageUrl: /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif|svg)(?:[?#]\S*)?$/i,
    imageFile: /^[^\\/:*?"<>|\n]+\.(?:jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i,
    url: /^(?:https?:\/\/|www\.)\S+$/i,
    gender: /^(?:м|ж|муж|жен|мужской|женский|мужчина|женщина|male|female|m|f)\.?$/i,
    number: /^[-+]?\d+(?:[.,]\d+)?$/,
    date: /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/
  };
  function valueKind(v) {
    v = String(v ?? '').trim();
    if (!v) return '';
    if (/^asset:/.test(v)) return 'image';
    if (RE.email.test(v)) return 'email';
    if (RE.imageUrl.test(v) || RE.imageFile.test(v)) return 'image';
    if (RE.url.test(v)) return 'url';
    if (RE.gender.test(v)) return 'gender';
    if (RE.date.test(v)) return 'date';
    if (RE.number.test(v)) return 'number';
    if (RE.fio.test(v) || RE.fioInitials.test(v)) return 'fio';
    return 'text';
  }
  /* Вид столбца по значениям: тот, что у ≥ 70 % непустых (ссылки на картинки считаются и ссылками). */
  function columnKind(values) {
    const counts = {}; let n = 0;
    for (const v of values) { const k = valueKind(v); if (!k) continue; n++; counts[k] = (counts[k] || 0) + 1; }
    if (!n) return '';
    if ((counts.image || 0) + (counts.url || 0) >= n * 0.7 && counts.image) return counts.image >= n * 0.5 ? 'image' : 'url';
    const [k, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return c >= n * 0.7 ? k : 'text';
  }
  /* Вид столбца проекта: по типу, по названию, по уже введённым значениям. */
  function docColumnKind(doc, col) {
    if (col.type === 'image') return 'image';
    const g = group(col.name);
    if (GROUP_KIND[g]) return GROUP_KIND[g];
    return columnKind(doc.data.rows.slice(0, 200).map(r => r.cells[col.id]));
  }

  /* Строки таблицы с учётом того, есть ли заголовок. */
  function dataRows(table, hasHeader) {
    if (hasHeader) return table.rows;
    const first = table.first || table.headers;
    return [table.headers.map((_, i) => String(first[i] ?? '').trim()), ...table.rows];
  }

  /* Похоже ли, что первой строки-заголовка нет: ни одно название не узнаётся, а значения той же природы, что и данные столбца. */
  function detectHeader(doc, table) {
    const first = table.first || table.headers;
    let named = 0, dataLike = 0, other = 0;
    table.headers.forEach((h, i) => {
      const raw = String(first[i] ?? '').trim();
      if (!raw) return;
      // то же значение ниже в столбце («Участник», «Участник», «Спикер») — это данные, а не заголовок
      if (table.rows.some(r => XS.key(r[i]) === XS.key(raw))) { dataLike++; return; }
      if (group(raw) || M().columnByName(doc, raw)) { named++; return; }
      const hk = valueKind(raw), ck = columnKind(table.rows.map(r => r[i]));
      if (hk !== 'text' && (hk === ck || (!ck && hk === 'fio'))) dataLike++;
      else if (hk === 'text' && ck && ck !== 'text') other++; // «Список» над ФИО — это заголовок
      else other++;
    });
    if (named) return true;
    return !(dataLike > 0 && dataLike >= other);
  }

  function uniqueName(doc, base, taken) {
    let name = base, n = 2;
    while (M().columnByName(doc, name) || taken.has(XS.key(name))) name = base + ' ' + n++;
    taken.add(XS.key(name));
    return name;
  }

  /* Главное: предложение сопоставления.
   * → {hasHeader, columns: [{index, header, sample, kind, target: id|'new'|'skip', newName, reason}], mode, key, stats} */
  function guess(doc, table, {hasHeader} = {}) {
    if (hasHeader === undefined) hasHeader = detectHeader(doc, table);
    const rows = dataRows(table, hasHeader);
    const docCols = doc.data.columns;
    const docKinds = new Map(docCols.map(c => [c.id, docColumnKind(doc, c)]));
    const docValues = new Map(docCols.map(c => [c.id, new Set(doc.data.rows.map(r => norm(r.cells[c.id])).filter(Boolean))]));
    const src = table.headers.map((h, i) => {
      const values = rows.map(r => r[i]).filter(v => String(v ?? '').trim());
      return {index: i, header: hasHeader ? h : 'Столбец ' + (i + 1), sample: values.slice(0, 3), kind: columnKind(values), values, empty: !values.length};
    });
    // оценки «источник → столбец проекта»
    const pairs = [];
    for (const s of src) {
      if (s.empty) continue;
      for (const c of docCols) {
        let score = 0, reason = '';
        if (hasHeader && XS.key(s.header) === XS.key(c.name)) { score = 100; reason = 'name'; }
        else if (hasHeader && group(s.header) && group(s.header) === group(c.name)) { score = 85; reason = 'name'; }
        else if (s.kind && !['text', 'number', 'date'].includes(s.kind) && s.kind === docKinds.get(c.id)) { score = 60 + (GROUP_KIND[group(c.name)] === s.kind ? 5 : 0); reason = 'data'; }
        if (!score || (hasHeader && reason === 'data' && group(s.header) && GROUP_KIND[group(s.header)] !== s.kind)) {
          // совпадают значения (например, те же организации или те же ФИО)
          const set = docValues.get(c.id);
          if (set.size && !score) {
            const hit = s.values.slice(0, 300).filter(v => set.has(norm(v))).length;
            if (hit >= Math.max(1, Math.min(s.values.length, 300) * 0.3)) { score = 50; reason = 'values'; }
          }
        }
        if (score) pairs.push({s, c, score, reason});
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const usedSrc = new Set(), usedCol = new Set(), chosen = new Map();
    for (const p of pairs) {
      if (usedSrc.has(p.s.index) || usedCol.has(p.c.id)) continue;
      usedSrc.add(p.s.index); usedCol.add(p.c.id); chosen.set(p.s.index, p);
    }
    const taken = new Set();
    const columns = src.map(s => {
      const p = chosen.get(s.index);
      const base = {index: s.index, header: s.header, sample: s.sample, kind: s.kind};
      if (s.empty) return {...base, target: 'skip', newName: '', reason: 'empty'};
      if (hasHeader && group(s.header) === 'copies' && s.kind === 'number') return {...base, target: COPIES, newName: '', reason: 'name'};
      if (p) return {...base, target: p.c.id, newName: '', reason: p.reason};
      const name = hasHeader ? s.header : NEW_NAME[s.kind] || 'Столбец';
      return {...base, target: 'new', newName: uniqueName(doc, name, taken), reason: 'new'};
    });
    const plan = {hasHeader, columns, rowsCount: rows.length};
    Object.assign(plan, suggestMode(doc, table, plan));
    return plan;
  }

  /* Какой режим предложить и по какому столбцу узнавать записи. */
  function suggestMode(doc, table, plan) {
    const rows = dataRows(table, plan.hasHeader);
    const mapped = plan.columns.filter(c => c.target !== 'skip' && c.target !== 'new' && c.target !== COPIES);
    if (!doc.data.rows.length || !mapped.length) return {mode: 'append', key: keyCandidate(doc, plan)};
    let best = null;
    for (const m of mapped) {
      const col = doc.data.columns.find(c => c.id === m.target);
      if (!col || col.type === 'image') continue;
      const set = new Set(doc.data.rows.map(r => norm(r.cells[col.id])).filter(Boolean));
      if (!set.size) continue;
      const vals = rows.map(r => norm(r[m.index])).filter(Boolean);
      const hit = vals.filter(v => set.has(v)).length;
      const ratio = vals.length ? hit / vals.length : 0;
      if (!best || ratio > best.ratio) best = {key: col.id, ratio, hit};
    }
    // Те же люди уже в списке — обновляем их (дописываем почту, фото, роль), новых добавляем.
    if (best && best.ratio >= 0.3) return {mode: 'update', key: best.key};
    // Столбцы, куда пойдут данные, в текущих записях почти пустые — вписываем по порядку (список ФИО в бланки).
    const emptyShare = mapped.every(m => doc.data.rows.filter(r => !String(r.cells[m.target] ?? '').trim()).length >= doc.data.rows.length * 0.8);
    if (emptyShare && plan.columns.every(c => c.target !== 'new' || c.reason === 'empty')) return {mode: 'fill', key: keyCandidate(doc, plan)};
    return {mode: 'append', key: keyCandidate(doc, plan)};
  }
  /* Столбец-ключ по умолчанию: ФИО (по виду или названию), иначе первый сопоставленный текстовый. */
  function keyCandidate(doc, plan) {
    const mapped = plan.columns.filter(c => c.target !== 'skip' && c.target !== 'new' && c.target !== COPIES);
    const fio = mapped.find(c => c.kind === 'fio') || mapped.find(c => { const col = doc.data.columns.find(x => x.id === c.target); return col && group(col.name) === 'fio'; });
    if (fio) return fio.target;
    const email = mapped.find(c => c.kind === 'email');
    if (email) return email.target;
    const text = mapped.find(c => doc.data.columns.find(x => x.id === c.target)?.type !== 'image');
    return text ? text.target : '';
  }

  /* Применить. plan — результат guess (возможно, поправленный в окне). → {added, updated, skipped, created} */
  function apply(doc, table, plan) {
    const rows = dataRows(table, plan.hasHeader);
    const mode = plan.mode || 'append';
    let created = 0;
    // столбцы проекта для каждого столбца файла (новые создаются здесь)
    const targets = plan.columns.map(c => {
      if (c.target === 'skip') return null;
      if (c.target === COPIES) return {id: COPIES, name: 'Экз.'};
      if (c.target === 'new') {
        const kind = c.kind === 'image' ? 'image' : 'text';
        const existing = M().columnByName(doc, c.newName);
        if (existing) return existing;
        created++;
        return M().addColumn(doc, c.newName || 'Столбец', kind);
      }
      return doc.data.columns.find(x => x.id === c.target) || null;
    });
    const write = (row, line, {onlyEmpty = false} = {}) => {
      targets.forEach((col, i) => {
        if (!col) return;
        const v = String(line[i] ?? '').trim();
        if (!v) return; // пустая ячейка файла не стирает то, что уже есть
        if (col.id === COPIES) { row.copies = Math.round(XS.num(v, 1, 0, 999)); return; }
        if (onlyEmpty && String(row.cells[col.id] ?? '').trim()) return;
        row.cells[col.id] = v;
      });
    };
    const keyCol = plan.key ? doc.data.columns.find(c => c.id === plan.key) : null;
    const keyIdx = keyCol ? targets.findIndex(t => t && t.id === keyCol.id) : -1;
    const keyOf = v => norm(v);
    let added = 0, updated = 0, skipped = 0;
    const newRow = () => { const r = {id: XS.uid('r'), cells: {}, copies: 1}; doc.data.rows.push(r); added++; return r; };

    if (mode === 'replace') doc.data.rows = [];
    if (mode === 'fill') {
      // по порядку: первая строка файла — в первую запись и т. д.; лишние строки — новыми записями
      rows.forEach((line, i) => { const r = doc.data.rows[i]; if (r) { write(r, line); updated++; } else write(newRow(), line); });
    } else if (mode === 'update' && keyIdx >= 0) {
      const index = new Map();
      doc.data.rows.forEach(r => { const k = keyOf(r.cells[keyCol.id]); if (k && !index.has(k)) index.set(k, r); });
      for (const line of rows) {
        const k = keyOf(line[keyIdx]);
        const r = k && index.get(k);
        if (r) { write(r, line); updated++; }
        else { const nr = newRow(); write(nr, line); if (k) index.set(k, nr); }
      }
    } else {
      // добавить (или заменить): повторы по ключу пропускаем — и с тем, что уже есть, и внутри файла
      const seen = new Set(plan.skipDuplicates !== false && keyIdx >= 0 ? doc.data.rows.map(r => keyOf(r.cells[keyCol.id])).filter(Boolean) : []);
      for (const line of rows) {
        if (plan.skipDuplicates !== false && keyIdx >= 0) {
          const k = keyOf(line[keyIdx]);
          if (k && seen.has(k)) { skipped++; continue; }
          if (k) seen.add(k);
        }
        write(newRow(), line);
      }
    }
    // обращение по полу: если в проекте ещё не указаны столбцы ФИО / Пол, берём сопоставленные
    const g = doc.greeting;
    const has = name => name && M().columnByName(doc, name);
    plan.columns.forEach((c, i) => {
      const col = targets[i]; if (!col || col.id === COPIES) return;
      if (c.kind === 'fio' && !has(g.nameField)) g.nameField = col.name;
      if (c.kind === 'gender' && !has(g.genderField)) g.genderField = col.name;
    });
    return {added, updated, skipped, created};
  }

  /* Короткое описание для окна: «Добавится 26 записей, 3 повтора пропущено». */
  function preview(doc, table, plan) {
    const copy = {data: XS.clone(doc.data), greeting: {...doc.greeting}, assets: {}};
    return apply(copy, table, XS.clone(plan));
  }

  XS.ImportMap = {COPIES, GROUPS, group, valueKind, columnKind, docColumnKind, detectHeader, dataRows, guess, apply, preview};
})(typeof window !== 'undefined' ? window : globalThis);
