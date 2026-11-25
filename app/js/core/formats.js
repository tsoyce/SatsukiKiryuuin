/* XSatsu Студия · форматы значений полей (v4).
 *   {Дата:длинная} → 26 ноября 2026 г.    {Дата:ДД месяца ГГГГ} → 26 ноября 2026    {Дата:ДД.ММ.ГГ} → 26.11.26
 *   {Сумма:прописью} → двадцать пять       {Сумма:число} → 12 500    {Место:римское} → III
 *   {Место:порядковое} → третье (…ый/…ая) {№:000} → 007
 * Значение по умолчанию — через «|»: {Должность|участник} (обрабатывается в fields.js).
 * apply() забирает свои модификаторы и возвращает остальные — их обрабатывает names.js (падежи, верх/низ). */
(function (global) {
  'use strict';
  const XS = global.XS;

  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  /* «26.11.2026», «26/11/26», «2026-11-26», «26 ноября 2026» → {d, m, y} или null. */
  function parseDate(value) {
    const s = String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return mk(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\D|$)/.exec(s))) return mk(+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]);
    if ((m = /^(\d{1,2})\s+([а-я]+)\s+(\d{4})/.exec(s))) {
      const i = MONTHS_GEN.findIndex(x => m[2].startsWith(x.slice(0, 3)));
      if (i >= 0) return mk(+m[1], i + 1, +m[3]);
    }
    return null;
  }
  function mk(d, m, y) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCDate() === d ? {d, m, y, wd: date.getUTCDay()} : null;
  }

  const DATE_TOKEN = /ГГГГ|ГГ|месяца|месяц|МММ|ММ|ДД|Д|день недели/g;
  function formatDate(dt, pattern) {
    const p2 = n => String(n).padStart(2, '0');
    return pattern.replace(DATE_TOKEN, t => ({
      'ГГГГ': String(dt.y), 'ГГ': p2(dt.y % 100), 'месяца': MONTHS_GEN[dt.m - 1], 'месяц': MONTHS_NOM[dt.m - 1], 'МММ': MONTHS_GEN[dt.m - 1],
      'ММ': p2(dt.m), 'ДД': p2(dt.d), 'Д': String(dt.d), 'день недели': WEEKDAYS[dt.wd]
    }[t]));
  }
  const DATE_NAMED = {
    'длинная': 'Д месяца ГГГГ г.', 'полная': 'Д месяца ГГГГ г.', 'дм': 'Д месяца', 'день месяц': 'Д месяца',
    'короткая': 'ДД.ММ.ГГ', 'дата': 'ДД.ММ.ГГГГ', 'год': 'ГГГГ', 'месяц': 'месяц', 'месяца': 'месяца', 'день недели': 'день недели'
  };

  /* --- числа --- */
  function parseNumber(value) {
    const s = String(value ?? '').trim().replace(/\s| /g, '').replace(',', '.');
    const m = /^-?\d+(?:\.\d+)?/.exec(s);
    return m ? Number(m[0]) : null;
  }
  const ONES = {m: ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    f: ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']};
  const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const SCALES = [null, {f: true, forms: ['тысяча', 'тысячи', 'тысяч']}, {forms: ['миллион', 'миллиона', 'миллионов']}, {forms: ['миллиард', 'миллиарда', 'миллиардов']}];
  function plural(n, forms) {
    const a = n % 100, b = n % 10;
    return a >= 11 && a <= 19 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
  }
  function triad(n, fem) {
    const out = [HUNDREDS[Math.floor(n / 100)]], t = n % 100;
    if (t >= 10 && t < 20) out.push(TEENS[t - 10]);
    else out.push(TENS[Math.floor(t / 10)], ONES[fem ? 'f' : 'm'][t % 10]);
    return out.filter(Boolean);
  }
  function words(n, fem = false) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'ноль';
    if (n >= 1e12) return String(n);
    const parts = [];
    for (let i = 3; i >= 0; i--) {
      const t = Math.floor(n / 10 ** (i * 3)) % 1000;
      if (!t) continue;
      const scale = SCALES[i];
      parts.push(...triad(t, i === 0 ? fem : !!scale.f));
      if (scale) parts.push(plural(t, scale.forms));
    }
    return parts.join(' ');
  }
  /* Порядковые: первое / первый / первая. */
  const ORD_ONES = ['', 'перв', 'втор', 'трет', 'четвёрт', 'пят', 'шест', 'седьм', 'восьм', 'девят'];
  const ORD_TEENS = ['десят', 'одиннадцат', 'двенадцат', 'тринадцат', 'четырнадцат', 'пятнадцат', 'шестнадцат', 'семнадцат', 'восемнадцат', 'девятнадцат'];
  const ORD_TENS = ['', '', 'двадцат', 'тридцат', 'сороков', 'пятидесят', 'шестидесят', 'семидесят', 'восьмидесят', 'девяност'];
  const ORD_HUNDREDS = ['', 'сот', 'двухсот', 'трёхсот', 'четырёхсот', 'пятисот', 'шестисот', 'семисот', 'восьмисот', 'девятисот'];
  function ordinal(n, gender) {
    n = Math.floor(Math.abs(n));
    if (n < 1 || n > 999) return String(n);
    const end = (stem, kind) => {
      // kind: обычное (-ый/-ое/-ая), «трет» (-ий/-ье/-ья), ударное (-ой/-ое/-ая: второй, шестой, седьмой, восьмой, сороковой)
      if (kind === 'soft') return stem + {m: 'ий', n: 'ье', f: 'ья'}[gender];
      if (kind === 'stress') return stem + {m: 'ой', n: 'ое', f: 'ая'}[gender];
      return stem + {m: 'ый', n: 'ое', f: 'ая'}[gender];
    };
    const kindOf = stem => stem === 'трет' ? 'soft' : ['втор', 'шест', 'седьм', 'восьм', 'сороков'].includes(stem) ? 'stress' : 'plain';
    const h = Math.floor(n / 100), t = n % 100;
    const lead = [];
    if (t === 0) return end(ORD_HUNDREDS[h], 'plain');
    if (h) lead.push(HUNDREDS[h]);
    if (t >= 10 && t < 20) return [...lead, end(ORD_TEENS[t - 10], 'plain')].join(' ');
    const tens = Math.floor(t / 10), ones = t % 10;
    if (!ones) return [...lead, end(ORD_TENS[tens], kindOf(ORD_TENS[tens]))].join(' ');
    if (tens) lead.push(TENS[tens]);
    return [...lead, end(ORD_ONES[ones], kindOf(ORD_ONES[ones]))].join(' ');
  }
  function roman(n) {
    n = Math.floor(n);
    if (n < 1 || n > 3999) return String(n);
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out;
  }
  /* Римская цифра в начале значения («III место») тоже понимается как число для «порядковое». */
  function fromRoman(s) {
    const m = /^([IVXLCDM]+)\b/.exec(String(s || '').trim().toUpperCase());
    if (!m) return null;
    const v = {I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000};
    let total = 0;
    for (let i = 0; i < m[1].length; i++) { const a = v[m[1][i]], b = v[m[1][i + 1]] || 0; total += a < b ? -a : a; }
    return total || null;
  }
  function group(n) {
    const [int, frac] = String(n).split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? ',' + frac : '');
  }

  /* Подсказки для интерфейса: [модификатор, пример]. */
  const HINTS = [
    ['длинная', 'дата: 26 ноября 2026 г.'], ['дм', 'дата: 26 ноября'], ['ДД.ММ.ГГГГ', 'дата по шаблону'], ['день недели', 'четверг'],
    ['прописью', 'число словами: двадцать пять'], ['число', '12 500'], ['римское', 'III'],
    ['порядковое', 'третье (место)'], ['порядковый', 'третий'], ['порядковая', 'третья'], ['000', '№ с нулями: 007']
  ];

  /* value — значение поля; mods — модификаторы. → {text, rest} */
  function apply(value, mods) {
    let text = String(value ?? '');
    const rest = [];
    for (const raw of mods) {
      const k = XS.key(raw).replace(/\s+/g, ' ');
      if (/^0+$/.test(raw)) { const n = parseNumber(text); text = n === null ? text : String(Math.round(n)).padStart(raw.length, '0'); continue; }
      if (DATE_NAMED[k] || /ГГ|ММ|ДД/.test(raw)) {
        const dt = parseDate(text);
        if (dt) text = formatDate(dt, DATE_NAMED[k] || raw);
        continue;
      }
      if (k === 'прописью' || k === 'прописью ж') {
        const n = parseNumber(text); if (n !== null) text = words(n, k.endsWith('ж')); continue;
      }
      if (k === 'число') { const n = parseNumber(text); if (n !== null) text = group(n); continue; }
      if (k === 'римское' || k === 'римск') { const n = parseNumber(text); if (n !== null) text = roman(n); continue; }
      if (/^порядков(ое|ый|ая)$/.test(k)) {
        const n = parseNumber(text) ?? fromRoman(text);
        if (n !== null) text = ordinal(n, {'ое': 'n', 'ый': 'm', 'ая': 'f'}[k.slice(-2)]);
        continue;
      }
      rest.push(raw);
    }
    return {text, rest};
  }

  XS.Formats = {HINTS, MONTHS_GEN, parseDate, formatDate, parseNumber, words, ordinal, roman, fromRoman, apply};
})(typeof window !== 'undefined' ? window : globalThis);
