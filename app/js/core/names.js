/* XSatsu Студия · формы имён для полей: {ФИО:дат}, {ФИО:инициалы}, {Место:верх}.
 * Склонение — библиотека petrovich (vendor/petrovich.min.js), пол — guest-data.js или столбец «Пол».
 * Склоняются только значения, похожие на ФИО (2–3 слова с заглавной кириллицей): «Команда „Мысли“» остаётся как есть. */
(function (global) {
  'use strict';
  const XS = global.XS;

  const CASES = {
    'им': 'nominative', 'род': 'genitive', 'дат': 'dative', 'вин': 'accusative', 'твор': 'instrumental', 'тв': 'instrumental', 'пред': 'prepositional', 'пр': 'prepositional'
  };
  /* Подсказки для интерфейса: [модификатор, что получится]. */
  const HINTS = [
    ['род', 'родительный: Иванова Ивана'], ['дат', 'дательный: Иванову Ивану'], ['вин', 'винительный: Иванова Ивана'],
    ['твор', 'творительный: Ивановым Иваном'], ['пред', 'предложный: об Иванове Иване'],
    ['фамилия', 'только фамилия'], ['имя', 'только имя'], ['отчество', 'только отчество'], ['имя отчество', 'Иван Иванович'],
    ['инициалы', 'Иванов И. И.'], ['ио', 'И. И. Иванов'], ['иф', 'Иван Иванов'],
    ['верх', 'ВСЕ ПРОПИСНЫЕ'], ['низ', 'все строчные'], ['заглав', 'С заглавной']
  ];
  const WORD = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;
  const PATRONYMIC = /(?:вич|вна|чна|ична|инична|оглы|кызы|улы)$/i;

  /* «Иванов Иван Иванович» → {last, first, middle}. null — не похоже на ФИО. */
  function parse(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4 || !words.every(w => WORD.test(w) || /^(оглы|кызы|улы)$/i.test(w))) return null;
    if (words.length === 4 && /^(оглы|кызы|улы)$/i.test(words[3])) words.splice(2, 2, words[2] + ' ' + words[3]);
    if (words.length === 4) return null;
    if (words.length === 3) {
      if (PATRONYMIC.test(words[2])) return {last: words[0], first: words[1], middle: words[2], order: 'lfm'};
      if (PATRONYMIC.test(words[1])) return {first: words[0], middle: words[1], last: words[2], order: 'fml'};
      return {last: words[0], first: words[1], middle: words[2], order: 'lfm'};
    }
    return {last: words[0], first: words[1], middle: '', order: 'lf'};
  }

  function genderOf(name, explicit) {
    const g = global.GuestData ? global.GuestData.normalizeGender(explicit || '', name) : 'neutral';
    return g === 'male' || g === 'female' ? g : 'androgynous';
  }

  function decline(person, gramCase, gender) {
    const P = global.petrovich;
    if (!P || gramCase === 'nominative') return person;
    const input = {gender, first: person.first, last: person.last};
    if (person.middle) input.middle = person.middle.split(' ')[0];
    let out;
    try { out = P(input, gramCase); } catch (e) { return person; }
    const middle = person.middle && person.middle.includes(' ') ? out.middle + person.middle.slice(person.middle.indexOf(' ')) : out.middle;
    return {...person, first: out.first || person.first, last: out.last || person.last, middle: person.middle ? middle : ''};
  }

  const initial = w => (w ? w.split('-').map(p => p[0] + '.').join('-') : '');
  function join(person, order) {
    const {last, first, middle} = person;
    if (order === 'fml') return [first, middle, last].filter(Boolean).join(' ');
    return [last, first, middle].filter(Boolean).join(' ');
  }

  /* value — подставленное значение; mods — ['дат', 'верх']; explicitGender — значение столбца «Пол». */
  function apply(value, mods, explicitGender = '') {
    let text = String(value ?? '');
    let person = null, form = '';
    let gramCase = '';
    const textMods = [];
    for (const raw of mods) {
      const m = XS.key(raw).replace(/\s+/g, ' ');
      if (CASES[m]) gramCase = CASES[m];
      else if (['фамилия', 'имя', 'отчество', 'имя отчество', 'инициалы', 'ио', 'иф', 'фи', 'фио'].includes(m)) form = m;
      else if (['верх', 'низ', 'заглав'].includes(m)) textMods.push(m);
    }
    if (gramCase || form) {
      person = parse(text);
      if (person) {
        const g = genderOf(text, explicitGender);
        if (gramCase) person = decline(person, gramCase, g);
        const order = person.order === 'fml' ? 'fml' : 'lfm';
        switch (form) {
          case 'фамилия': text = person.last; break;
          case 'имя': text = person.first; break;
          case 'отчество': text = person.middle; break;
          case 'имя отчество': text = [person.first, person.middle].filter(Boolean).join(' '); break;
          case 'инициалы': text = [person.last, [initial(person.first), initial(person.middle.split(' ')[0])].filter(Boolean).join(' ')].filter(Boolean).join(' '); break;
          case 'ио': text = [[initial(person.first), initial(person.middle.split(' ')[0])].filter(Boolean).join(' '), person.last].filter(Boolean).join(' '); break;
          case 'иф': text = [person.first, person.last].join(' '); break;
          case 'фи': text = [person.last, person.first].join(' '); break;
          default: text = join(person, order);
        }
      }
    }
    for (const m of textMods) {
      if (m === 'верх') text = text.toLocaleUpperCase('ru-RU');
      else if (m === 'низ') text = text.toLocaleLowerCase('ru-RU');
      else if (m === 'заглав') text = text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
    }
    return text;
  }

  /* «ФИО:дат:верх» → {base: 'ФИО', mods: ['дат', 'верх']} */
  function split(token) {
    const parts = String(token).split(':');
    return {base: parts[0].trim(), mods: parts.slice(1).map(s => s.trim()).filter(Boolean)};
  }

  XS.Names = {CASES, HINTS, parse, apply, split, genderOf};
})(typeof window !== 'undefined' ? window : globalThis);
