/* XSatsu Студия · мастер печати: тираж → проходы → пакеты.
 * Чистая логика без интерфейса: сколько листов, в каком порядке и с какими поправками печатать.
 *   Режимы: single — одна сторона (каждая сторона отдельным листом), duplex — автоматический дуплекс,
 *           manual — ручной переворот стопки, two — два принтера (струйный: цвет и фон, лазерный: текст).
 *   Профиль принтера хранит поправки X/Y лица и оборота, край переворота и порядок стопки. */
(function (global) {
  'use strict';
  const XS = global.XS;

  const MODES = [
    ['single', 'Один принтер, одна сторона', 'Каждая сторона — отдельный лист, без переворота'],
    ['duplex', 'Один принтер, автоматический дуплекс', 'Принтер сам печатает оборот'],
    ['manual', 'Один принтер, ручной переворот', 'Сначала все лица, затем вы переворачиваете стопку'],
    ['two', 'Два принтера: цвет + текст', 'Струйный печатает фон и цвет, лазерный — текст поверх']
  ];
  const ROLES = {any: 'Обычный', inkjet: 'Струйный (цвет)', laser: 'Лазерный (текст)'};

  function profile(p = {}) {
    return {
      id: String(p.id || XS.uid('prn')), name: String(p.name || 'Принтер').slice(0, 80),
      role: ROLES[p.role] ? p.role : 'any',
      offsetX: XS.num(p.offsetX, 0, -20, 20), offsetY: XS.num(p.offsetY, 0, -20, 20),
      backOffsetX: XS.num(p.backOffsetX, 0, -20, 20), backOffsetY: XS.num(p.backOffsetY, 0, -20, 20),
      edge: p.edge === 'short' ? 'short' : 'long',
      reverseBacks: !!p.reverseBacks,          // при ручном перевороте печатать обороты в обратном порядке
      feed: String(p.feed || '').slice(0, 200), // как класть бумагу, свободный текст
      note: String(p.note || '').slice(0, 500),
      checkedAt: p.checkedAt || ''
    };
  }
  const NONE = profile({id: 'none', name: 'Без поправок'});

  /* Сколько листов занимает проект с текущими настройками выгрузки. */
  function sheetsFor(doc, o) {
    const recs = XS.Scene.records(doc, {...o, useCopies: o.useCopies});
    const plan = XS.Impose.plan({w: doc.page.width, h: doc.page.height}, o);
    const per = plan.slots.length;
    return {recs, plan, per, sheets: Math.ceil(recs.length / per)};
  }

  function sidesOf(doc, which) {
    if (doc.sides.length < 2) return [0];
    if (which === 'front') return [0];
    if (which === 'back') return doc.sides.map((_, i) => i).slice(1);
    return doc.sides.map((_, i) => i);
  }

  /* Главная функция. opts: {mode, sheetRange, repeat, batch, sides, profiles: {main, inkjet, laser}} + doc.output.
   * Возвращает {sheets, sequence, physical, passes[]}; pass.pages — [{sheet, side, back, mirror, offset}] для XS.Export.run. */
  function build(doc, opts = {}) {
    const o = {...XS.Model.defaultOutput(doc.kind), ...doc.output, ...opts};
    const info = sheetsFor(doc, o);
    const chosen = String(o.sheetRange || '').trim() ? XS.parseRange(o.sheetRange, info.sheets) : [...Array(info.sheets).keys()];
    if (!chosen.length) throw new Error('В выбранном диапазоне нет листов. Всего листов: ' + info.sheets + '.');
    const repeat = Math.round(XS.num(o.repeat, 1, 1, 100));
    const sequence = [];
    for (let k = 0; k < repeat; k++) sequence.push(...chosen);
    const sides = sidesOf(doc, o.sides);
    const twoSided = sides.length > 1;
    const mode = MODES.some(m => m[0] === o.mode) ? o.mode : (twoSided ? 'duplex' : 'single');
    const pr = {main: profile(o.profiles?.main || NONE), inkjet: profile(o.profiles?.inkjet || o.profiles?.main || NONE), laser: profile(o.profiles?.laser || o.profiles?.main || NONE)};
    const base = {x: XS.num(o.offsetX, 0), y: XS.num(o.offsetY, 0)}, baseBack = {x: XS.num(o.backOffsetX, 0), y: XS.num(o.backOffsetY, 0)};
    const off = (p, back) => back ? {x: baseBack.x + p.backOffsetX, y: baseBack.y + p.backOffsetY} : {x: base.x + p.offsetX, y: base.y + p.offsetY};
    const page = (sheet, side, p, mirror) => { const back = side > 0 && twoSided; return {sheet, side, back, mirror: back && mirror, offset: off(p, back), duplex: p.edge}; };
    const batchSize = Math.round(XS.num(o.batch, 100, 1, 1000));
    const sideName = si => (doc.sides[si]?.name || (si ? 'Оборот' : 'Лицевая')).toLowerCase();

    // Описание проходов до разбиения на пакеты.
    const raw = [];
    if (mode === 'single' || !twoSided) {
      if (mode === 'two') {
        raw.push({role: 'inkjet', layer: 'color', side: sides[0], label: 'Струйный · цвет и фон'});
        raw.push({role: 'laser', layer: 'text', side: sides[0], label: 'Лазерный · текст', hint: 'Положите отпечатанные листы обратно в лоток лазерного принтера той же стороной и тем же краем вперёд, что и в струйном. Дайте чернилам высохнуть.'});
      } else for (const si of sides) raw.push({role: 'main', layer: o.layer || 'all', side: si, label: twoSided ? 'Сторона: ' + sideName(si) : 'Печать', mirror: false});
    } else if (mode === 'duplex') {
      raw.push({role: 'main', layer: o.layer || 'all', both: true, label: 'Обе стороны · автоматический дуплекс', hint: 'В окне печати включите двустороннюю печать: переворот по ' + (pr.main.edge === 'short' ? 'короткому' : 'длинному') + ' краю.'});
    } else if (mode === 'manual') {
      raw.push({role: 'main', layer: o.layer || 'all', side: sides[0], label: 'Лицевая сторона'});
      for (const si of sides.slice(1)) raw.push({role: 'main', layer: o.layer || 'all', side: si, label: 'Оборот: ' + sideName(si), reverse: pr.main.reverseBacks,
        hint: 'Переверните стопку по ' + (pr.main.edge === 'short' ? 'короткому' : 'длинному') + ' краю и положите обратно в лоток' + (pr.main.feed ? ' (' + pr.main.feed + ')' : '') + '. ' + (pr.main.reverseBacks ? 'Листы идут в обратном порядке — так стопку не нужно перекладывать.' : 'Первый лист стопки — лист 1.')});
    } else { // two: струйный — все стороны, затем лазерный — все стороны
      for (const [role, layer, name] of [['inkjet', 'color', 'Струйный · цвет и фон'], ['laser', 'text', 'Лазерный · текст']]) {
        sides.forEach((si, k) => raw.push({role, layer, side: si, label: name + ' · ' + sideName(si), reverse: k > 0 && pr[role].reverseBacks,
          hint: k > 0 ? 'Переверните стопку по ' + (pr[role].edge === 'short' ? 'короткому' : 'длинному') + ' краю и положите в лоток ' + (role === 'inkjet' ? 'струйного' : 'лазерного') + ' принтера.'
            : role === 'laser' ? 'Дайте чернилам высохнуть. Положите стопку в лазерный принтер лицевой стороной, тем же краем вперёд («ВЕРХ ЛИЦА» — как на листе совмещения).' : ''}));
      }
    }

    // Пакеты: не больше batchSize физических листов в одном PDF.
    const chunks = [];
    for (let i = 0; i < sequence.length; i += batchSize) chunks.push(sequence.slice(i, i + batchSize));
    const passes = [];
    raw.forEach((r, n) => {
      const p = pr[r.role];
      chunks.forEach((chunk, b) => {
        let pages;
        if (r.both) pages = chunk.flatMap(s => sides.map(si => page(s, si, p, true)));
        else pages = (r.reverse ? [...chunk].reverse() : chunk).map(s => page(s, r.side, p, mode !== 'single'));
        passes.push({id: 'p' + (n + 1) + (chunks.length > 1 ? '-' + (b + 1) : ''), step: n + 1, steps: raw.length, batch: b + 1, batchCount: chunks.length,
          role: r.role, printer: p.name, profileId: p.id, layer: r.layer, label: r.label, hint: r.hint || '', laserBlack: r.layer === 'text' ? o.laserBlack !== false : false,
          sheets: chunk.length, pages, firstSheet: chunk[0] + 1, lastSheet: chunk[chunk.length - 1] + 1, from: b * batchSize + 1, to: b * batchSize + chunk.length, total: sequence.length});
      });
    });
    return {mode, sheets: info.sheets, perSheet: info.per, records: info.recs.length, plan: info.plan, chosen: chosen.length, repeat, physical: sequence.length,
      passes, signature: signature(doc, o, mode, sequence)};
  }

  /* Отпечаток задания: отметки «проход напечатан» сбрасываются, если поменялись данные или тираж. */
  function signature(doc, o, mode, sequence) {
    const s = JSON.stringify([doc.id, doc.data.rows.length, doc.page, mode, sequence.length, sequence[0], sequence[sequence.length - 1], o.sides, o.paper, o.margin, o.gap]);
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* Лист совмещения: синтетический проект на весь лист. Печатается теми же функциями, что и тираж,
   * поэтому поправки профиля проверяются по-настоящему. Линейка 50 мм, кресты, «ВЕРХ ЛИЦА». */
  function calibrationDoc(paper = 'a4', name = '') {
    const [W, H] = XS.Model.PAPER[paper] || XS.Model.PAPER.a4;
    const doc = XS.Model.blankDoc('custom', 'Лист совмещения', {width: W, height: H});
    doc.data.rows = [];
    const E = XS.Model.element, els = [];
    const text = (t, x, y, w, h, size, extra = {}) => els.push(E('text', {text: t, x, y, w, h, size, color: '#000000', autoFit: false, layer: 'text', ...extra}));
    const cross = (cx, cy, r = 6) => { els.push(E('line', {x: cx - r, y: cy, w: 2 * r, h: 0, stroke: '#000000', strokeWidth: 0.2, layer: 'text'})); els.push(E('line', {x: cx, y: cy - r, w: 0, h: 2 * r, stroke: '#000000', strokeWidth: 0.2, layer: 'text'})); els.push(E('rect', {x: cx - 2, y: cy - 2, w: 4, h: 4, fill: '', stroke: '#000000', strokeWidth: 0.15, shape: 'ellipse', layer: 'text'})); };
    const ruler = (x, y) => {
      els.push(E('line', {x, y, w: 50, h: 0, stroke: '#000000', strokeWidth: 0.25, layer: 'text'}));
      for (let i = 0; i <= 50; i += 5) els.push(E('line', {x: x + i, y: y - (i % 10 ? 1.5 : 3), w: 0, h: i % 10 ? 1.5 : 3, stroke: '#000000', strokeWidth: 0.2, layer: 'text'}));
      text('50 мм — проверьте линейкой. Если короче или длиннее, в окне печати выбран не «100%».', x - 20, y + 2, 90, 10, 7);
    };
    // Кресты на равных расстояниях от краёв: при правильном перевороте лицо и оборот совпадут на просвет.
    const pts = [[15, 15], [W - 15, 15], [15, H - 15], [W - 15, H - 15], [W / 2, H / 2]];
    for (const [x, y] of pts) cross(x, y);
    // Цветная полоса — для струйного прохода: её край должен совпасть с рамкой лазерного.
    els.push(E('rect', {x: W / 2 - 30, y: H / 2 + 20, w: 60, h: 12, fill: '#29a3d6', stroke: '', strokeWidth: 0, layer: 'color'}));
    els.push(E('rect', {x: W / 2 - 30, y: H / 2 + 20, w: 60, h: 12, fill: '', stroke: '#000000', strokeWidth: 0.2, layer: 'text'}));
    text('голубая полоса — струйный, рамка — лазерный', W / 2 - 40, H / 2 + 33, 80, 6, 7);
    els.push(E('path', {d: 'M5 0L10 7L0 7Z', x: W / 2 - 5, y: 14, w: 10, h: 7, fill: '#000000', stroke: '', layer: 'text'}));
    text('ВЕРХ ЛИЦА', W / 2 - 40, 22, 80, 12, 16, {bold: true});
    text('Лицевая сторона' + (name ? ' · ' + name : ''), W / 2 - 60, 34, 120, 8, 10);
    ruler(W / 2 - 25, H / 2 - 30);
    text('Как пользоваться: напечатайте лист, проверьте линейку, посмотрите на просвет. Если кресты оборота сдвинуты, измерьте сдвиг в миллиметрах и впишите его в профиль принтера: вправо и вниз — плюс.', 20, H - 50, W - 40, 22, 8, {align: 'left'});
    doc.sides[0].elements = els;
    const back = [];
    const bcross = (cx, cy, r = 6) => { back.push(E('line', {x: cx - r, y: cy, w: 2 * r, h: 0, stroke: '#000000', strokeWidth: 0.2, layer: 'text'})); back.push(E('line', {x: cx, y: cy - r, w: 0, h: 2 * r, stroke: '#000000', strokeWidth: 0.2, layer: 'text'})); };
    for (const [x, y] of pts) bcross(x, y);
    back.push(E('text', {text: 'Оборот' + (name ? ' · ' + name : '') + ' — кресты должны совпасть с лицом на просвет', x: 20, y: 22, w: W - 40, h: 10, size: 10, color: '#000000', autoFit: false, layer: 'text'}));
    doc.sides.push(XS.Model.side('back', 'Оборот', {elements: back}));
    doc.output = {...doc.output, packaging: 'sheets', paper: 'card', cutMarks: false, useCopies: false, offsetX: 0, offsetY: 0, backOffsetX: 0, backOffsetY: 0};
    return doc;
  }

  /* PDF листа совмещения с поправками профиля. sides: 'all' | 'front'. */
  async function calibration(prof, {paper = 'a4', sides = 'all', mode = 'duplex'} = {}) {
    const p = profile(prof || NONE);
    const doc = calibrationDoc(paper, p.name);
    const s = sides === 'front' ? [0] : [0, 1];
    const pages = s.map(si => ({sheet: 0, side: si, back: si > 0, mirror: si > 0, duplex: p.edge, offset: si ? {x: p.backOffsetX, y: p.backOffsetY} : {x: p.offsetX, y: p.offsetY}}));
    return XS.Export.run(doc, {...doc.output, sides: 'all', layer: 'all', pageList: pages, duplex: p.edge, mode});
  }

  XS.PrintPlan = {MODES, ROLES, profile, NONE, build, sheetsFor, calibrationDoc, calibration};
})(typeof window !== 'undefined' ? window : globalThis);
