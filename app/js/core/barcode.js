/* XSatsu Студия · штрихкод Code 128 и EAN-13 как векторный контур в мм (v4).
 * Как и QR, рисуется одинаково на экране (Path2D) и в PDF (drawSvgPath) и остаётся вектором.
 * Code 128: латиница, цифры и знаки ASCII; только цифры чётной длины — компактный набор C. */
(function (global) {
  'use strict';
  const XS = global.XS;

  /* Ширины полос и промежутков для значений 0…106 (106 — стоп, 13 модулей). */
  const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
    '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 ' +
    '111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
    '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 ' +
    '141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 ' +
    '124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 ' +
    '311141 411131 211412 211214 211232 2331112').split(' ');
  const START_B = 104, START_C = 105, STOP = 106, CODE_B = 100, CODE_C = 99;

  /* Текст → значения символов Code 128 (со стартом, контрольной суммой и стопом). */
  function code128(text) {
    const s = String(text);
    if (!s) throw new Error('пустые данные');
    for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error('Code 128 — только латиница, цифры и знаки (символ «' + ch + '» не подходит)'); }
    const values = [];
    let i = 0, set;
    const digitsAt = (pos, n) => /^\d+$/.test(s.slice(pos, pos + n)) && s.length >= pos + n;
    if (/^\d+$/.test(s) && s.length % 2 === 0) { values.push(START_C); set = 'C'; }
    else { values.push(START_B); set = 'B'; }
    while (i < s.length) {
      // Длинные серии цифр (от 6) печатаем набором C — короче.
      if (set === 'B' && digitsAt(i, 6)) {
        let n = 0; while (i + n < s.length && /\d/.test(s[i + n])) n++;
        if (n % 2) { values.push(s.charCodeAt(i) - 32); i++; n--; }
        values.push(CODE_C); set = 'C';
      }
      if (set === 'C') {
        if (digitsAt(i, 2)) { values.push(+s.slice(i, i + 2)); i += 2; continue; }
        values.push(CODE_B); set = 'B';
      }
      values.push(s.charCodeAt(i) - 32); i++;
    }
    let sum = values[0];
    for (let k = 1; k < values.length; k++) sum += values[k] * k;
    values.push(sum % 103, STOP);
    return values;
  }

  /* Значения → последовательность ширин [полоса, промежуток, полоса, …] в модулях. */
  function widths128(text) { return code128(text).map(v => P[v]).join('').split('').map(Number); }

  /* EAN-13: 12 или 13 цифр (13-я — контрольная, проверяется). */
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanCheck(d12) { let s = 0; for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1); return (10 - s % 10) % 10; }
  function ean13Bits(text) {
    const s = String(text).replace(/\s/g, '');
    if (!/^\d{12,13}$/.test(s)) throw new Error('EAN-13 — 12 или 13 цифр');
    const check = eanCheck(s);
    if (s.length === 13 && +s[12] !== check) throw new Error('EAN-13: неверная контрольная цифра (должна быть ' + check + ')');
    const d = s.slice(0, 12) + check, par = EAN_PARITY[+d[0]];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]];
    return {bits: bits + '101', digits: d};
  }
  function bitsToWidths(bits) {
    const out = [];
    let run = 1;
    for (let i = 1; i <= bits.length; i++) { if (bits[i] === bits[i - 1]) run++; else { out.push(run); run = 1; } }
    return out; // начинается с полосы (первый бит EAN — 1)
  }

  /* Контур штрихкода в рамке w×h мм (координаты от (0,0)); quiet — поле в модулях с каждой стороны. */
  function path(text, w, h, {type = 'code128', quiet = 10} = {}) {
    let widths, label = String(text);
    if (type === 'ean13') { const e = ean13Bits(text); widths = bitsToWidths(e.bits); label = e.digits; }
    else widths = widths128(text);
    const modules = widths.reduce((a, b) => a + b, 0), m = w / (modules + quiet * 2);
    const f = v => +v.toFixed(3);
    let x = quiet * m, d = '';
    widths.forEach((n, i) => {
      if (i % 2 === 0) d += `M${f(x)} 0h${f(n * m)}v${f(h)}h${f(-n * m)}z`;
      x += n * m;
    });
    return {d, modules, module: m, label};
  }

  XS.Barcode = {TYPES: [['code128', 'Code 128'], ['ean13', 'EAN-13']], code128, widths128, ean13Bits, eanCheck, path, PATTERNS: P};
})(typeof window !== 'undefined' ? window : globalThis);
