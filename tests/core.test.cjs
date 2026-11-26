// Проверка ядра без браузера: node tests/core.test.cjs
// Собирает документы из шаблонов, выгружает PDF (одним файлом, ZIP, листы) и проверяет имена файлов.
const fs = require('fs'), path = require('path'), assert = require('assert');
const app = path.join(__dirname, '..', 'app');
global.window = global;
global.PDFLib = require(path.join(app, 'vendor/pdf-lib.min.js'));
global.fontkit = require(path.join(app, 'vendor/fontkit.umd.min.js'));
global.fflate = require(path.join(app, 'vendor/fflate.min.js'));
global.petrovich = require(path.join(app, 'vendor/petrovich.min.js'));
global.qrcode = require(path.join(app, 'vendor/qrcode.js'));
for (const f of ['util', 'guest-data', 'model', 'formats', 'names', 'fields', 'fonts', 'layout', 'qr', 'barcode', 'scene', 'assets', 'render-canvas', 'render-pdf', 'zip', 'impose', 'check', 'export', 'print-plan', 'presets', 'importers', 'data-tools', 'import-map', 'remote-images']) require(path.join(app, 'js/core', f + '.js'));
const XS = global.XS;
XS.fetchBytes = async url => new Uint8Array(fs.readFileSync(path.join(app, url)));
XS.fetchDataUrl = async url => XS.bytesToDataUrl(new Uint8Array(fs.readFileSync(path.join(app, url))), {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf'}[url.split('.').pop()]);
XS.Assets.image = async asset => ({naturalWidth: 1000, naturalHeight: 1000}); // в node картинки не декодируем
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, {recursive: true});

(async () => {
  // 1. Поля и имена файлов
  const doc = await XS.Presets.diplomaClassic();
  const ctx = XS.Fields.context(doc, doc.data.rows[0], 0);
  assert.strictEqual(XS.Fields.fill('{ФИО} — {место}', ctx), 'Команда «Социологические мысли» — I место');
  assert.strictEqual(XS.Fields.fileName('{№} Диплом {ФИО}', ctx), '1 Диплом Команда «Социологические мысли»');
  assert.deepStrictEqual(XS.parseRange('1-3, 7', 5), [0, 1, 2]);
  // 2. Обращение по полу
  const inv = XS.Model.blankDoc('invitation');
  XS.Model.addRow(inv, {'ФИО': 'Петрова Анна Сергеевна'}); XS.Model.addRow(inv, {'ФИО': 'Иванов Иван Иванович'});
  assert.strictEqual(XS.Fields.fill('{Обращение}', XS.Fields.context(inv, inv.data.rows[0], 0)), 'Уважаемая');
  assert.strictEqual(XS.Fields.fill('{обращение}', XS.Fields.context(inv, inv.data.rows[1], 1)), 'Уважаемый');
  // 3. Таблица из Excel
  const t = XS.Import.parseTable('ФИО\tМесто\nИванов\tI место\n"Сидоров; ""мл."""\t\n');
  assert.deepStrictEqual(t.headers, ['ФИО', 'Место']);
  assert.strictEqual(t.rows[1][0], 'Сидоров; "мл."');
  // 4. Раскладка
  const plan = XS.Impose.plan({w: 65, h: 140}, {paper: 'a4', margin: 5, gap: 0});
  assert.strictEqual(plan.slots.length, 6, plan.label);
  const planA6 = XS.Impose.plan({w: 105, h: 148}, {paper: 'a4', margin: 0});
  assert.strictEqual(planA6.slots.length, 4);
  const planA4 = XS.Impose.plan({w: 210, h: 297}, {paper: 'a4', margin: 5});
  assert.strictEqual(planA4.slots.length, 1); // А4 на А4 — без полей, а не ошибка
  // 5. Выгрузка
  const base = {...doc.output};
  let r = await XS.Export.run(doc, {...base, packaging: 'single', format: 'pdf'});
  fs.writeFileSync(path.join(out, 'diploma-single.pdf'), Buffer.from(await r.blob.arrayBuffer()));
  assert.strictEqual(r.pages, 3);
  r = await XS.Export.run(doc, {...base, packaging: 'zip', format: 'pdf'});
  assert.strictEqual(r.files, 3); assert.ok(r.name.endsWith('.zip'), r.name);
  fs.writeFileSync(path.join(out, r.name), Buffer.from(await r.blob.arrayBuffer()));
  const bm = await XS.Presets.bookmarks();
  r = await XS.Export.run(bm, {...bm.output, packaging: 'sheets', format: 'pdf', scope: 'range', range: '1-8', cutMarks: true});
  fs.writeFileSync(path.join(out, 'bookmarks-sheets.pdf'), Buffer.from(await r.blob.arrayBuffer()));
  assert.strictEqual(r.pages, 4); // 8 закладок по 6 на лист = 2 листа × 2 стороны
  const invd = await XS.Presets.invitation();
  r = await XS.Export.run(invd, {...invd.output, packaging: 'single', format: 'pdf'});
  fs.writeFileSync(path.join(out, 'invitation.pdf'), Buffer.from(await r.blob.arrayBuffer()));
  // 6. PDF как шаблон
  const pdfFile = fs.readFileSync(path.join(out, 'diploma-single.pdf'));
  const asset = {id: 'pdf1', name: 't.pdf', mime: 'application/pdf', data: XS.bytesToDataUrl(new Uint8Array(pdfFile), 'application/pdf')};
  asset.pages = await XS.Assets.pdfInfo(asset.data);
  assert.ok(Math.abs(asset.pages[0].width - 210) < 0.5);
  const fromPdf = XS.Model.blankDoc('diploma', 'Из PDF', {width: 210, height: 297});
  fromPdf.assets[asset.id] = asset; fromPdf.sides[0].background = {asset: 'pdf1', page: 3, fit: 'stretch', opacity: 1};
  fromPdf.sides[0].elements.push(XS.Model.element('text', {text: '{ФИО}', x: 20, y: 120, w: 170, h: 20, size: 24, color: '#c00000'}));
  XS.Model.addRow(fromPdf, {'ФИО': 'Наложено поверх PDF-шаблона'});
  r = await XS.Export.run(fromPdf, {...fromPdf.output, packaging: 'single'});
  fs.writeFileSync(path.join(out, 'pdf-template.pdf'), Buffer.from(await r.blob.arrayBuffer()));
  // 7. Группы слоёв: члены группы собираются подряд, пустые и «сироты» удаляются
  const gd = XS.Model.blankDoc('custom', 'Группы', {width: 100, height: 100});
  const gs = gd.sides[0];
  const mk = (n, g = '') => XS.Model.element('text', {name: n, text: n, group: g});
  gs.elements = [mk('a', 'g1'), mk('b'), mk('c', 'g1'), mk('d', 'ghost')];
  gs.groups = [{id: 'g1', name: 'Группа 1'}, {id: 'empty', name: 'Пусто'}];
  const norm = XS.Model.normalizeDoc(JSON.parse(JSON.stringify(gd))).sides[0];
  assert.deepStrictEqual(norm.elements.map(e => e.name + ':' + e.group), ['b:', 'a:g1', 'c:g1', 'd:']);
  assert.deepStrictEqual(norm.groups.map(g => g.id), ['g1']);
  // 8. Склонение и формы имени
  const nd = XS.Model.blankDoc('diploma');
  XS.Model.addRow(nd, {'ФИО': 'Петрова Анна Сергеевна', 'Место': 'I место'});
  XS.Model.addRow(nd, {'ФИО': 'Иванов Иван Иванович'});
  XS.Model.addRow(nd, {'ФИО': 'Команда «Социологические мысли»'});
  const c0 = XS.Fields.context(nd, nd.data.rows[0], 0), c1 = XS.Fields.context(nd, nd.data.rows[1], 1), c2 = XS.Fields.context(nd, nd.data.rows[2], 2);
  assert.strictEqual(XS.Fields.fill('{ФИО:дат}', c0), 'Петровой Анне Сергеевне');
  assert.strictEqual(XS.Fields.fill('{ФИО:род}', c1), 'Иванова Ивана Ивановича');
  assert.strictEqual(XS.Fields.fill('{ФИО:твор}', c1), 'Ивановым Иваном Ивановичем');
  assert.strictEqual(XS.Fields.fill('{ФИО:инициалы}', c0), 'Петрова А. С.');
  assert.strictEqual(XS.Fields.fill('{ФИО:ио}', c1), 'И. И. Иванов');
  assert.strictEqual(XS.Fields.fill('{ФИО:дат:имя отчество}', c0), 'Анне Сергеевне');
  assert.strictEqual(XS.Fields.fill('{ФИО:дат}', c2), 'Команда «Социологические мысли»'); // не ФИО — без изменений
  assert.strictEqual(XS.Fields.fill('{Место:верх}', c0), 'I МЕСТО');
  assert.deepStrictEqual(XS.Fields.fieldsIn('{ФИО:дат} {Место}'), ['ФИО', 'Место']);
  // 9. QR-код и «показывать, если»
  const qd = XS.Model.blankDoc('custom', 'QR', {width: 100, height: 100});
  qd.sides[0].elements.push(XS.Model.element('qr', {data: 'https://o.utmns.ru/v/{№}', x: 10, y: 10, w: 30, h: 30}));
  qd.sides[0].elements.push(XS.Model.element('text', {text: 'Победитель', showIf: {field: 'Место', op: 'eq', value: '1'}}));
  XS.Model.addRow(qd, {'ФИО': 'А', 'Место': '1'}); XS.Model.addRow(qd, {'ФИО': 'Б', 'Место': '2'});
  const s0 = XS.Scene.build(qd, 0, qd.data.rows[0], 0), s1 = XS.Scene.build(qd, 0, qd.data.rows[1], 1);
  assert.ok(s0.ops.some(o => o.op === 'path' && o.d.length > 100), 'QR-контур');
  assert.ok(s0.ops.some(o => o.op === 'text') && !s1.ops.some(o => o.op === 'text'), 'условие показа');
  assert.strictEqual(XS.QR.matrix('https://o.utmns.ru/v/1').size, 25);
  r = await XS.Export.run(qd, {...qd.output, packaging: 'single'});
  fs.writeFileSync(path.join(out, 'qr.pdf'), Buffer.from(await r.blob.arrayBuffer()));
  assert.strictEqual(r.pages, 2);
  // 10. XLSX и ODS без сторонних парсеров
  const enc = t => new TextEncoder().encode(t);
  const xlsx = fflate.zipSync({
    'xl/workbook.xml': enc('<workbook><sheets><sheet name="Список" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': enc('<sst><si><t>ФИО</t></si><si><t>Дата</t></si><si><r><t>Иванов </t></r><r><t>Иван</t></r></si><si><t>A&amp;B</t></si></sst>'),
    'xl/styles.xml': enc('<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': enc('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Балл</t></is></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46000</v></c><c r="C2"><v>0.30000000000000004</v></c></row><row r="4"><c r="A4" t="s"><v>3</v></c></row></sheetData></worksheet>')
  });
  const xt = XS.Import.readTableFile(xlsx, 'список.xlsx');
  assert.deepStrictEqual(xt.headers, ['ФИО', 'Дата', 'Балл']);
  assert.deepStrictEqual(xt.rows, [['Иванов Иван', '09.12.2025', '0.3'], ['A&B', '', '']]);
  const ods = fflate.zipSync({'content.xml': enc('<office:document-content><table:table table:name="Л1"><table:table-row><table:table-cell office:value-type="string"><text:p>ФИО</text:p></table:table-cell><table:table-cell><text:p>Место</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Петрова<text:s/>Анна</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="1"><text:p>1</text:p></table:table-cell></table:table-row><table:table-row table:number-rows-repeated="1000"><table:table-cell table:number-columns-repeated="1000"/></table:table-row></table:table></office:document-content>')});
  const ot = XS.Import.readTableFile(ods, 'a.ods');
  assert.deepStrictEqual(ot, {headers: ['ФИО', 'Место'], first: ['ФИО', 'Место'], rows: [['Петрова Анна', '1']]});
  const cp = new Uint8Array([0xd4, 0xc8, 0xce, 0x0a, 0xc8, 0xe2, 0xe0, 0xed, 0xee, 0xe2]); // «ФИО\nИванов» в cp1251
  assert.deepStrictEqual(XS.Import.readTableFile(cp, 'a.csv'), {headers: ['ФИО'], first: ['ФИО'], rows: [['Иванов']]});
  // 11. Проверка списка
  const ck = XS.Model.blankDoc('diploma');
  ck.sides[0].elements.push(XS.Model.element('text', {text: 'Награждается {ФИО:твор} {Место}'}));
  XS.Model.addRow(ck, {'ФИО': 'Ивaнов Иван', 'Место': ''}); // латинская «a»
  XS.Model.addRow(ck, {'ФИО': 'Ивaнов Иван ', 'Место': '2'});
  const issues = XS.Check.data(ck);
  assert.ok(issues.some(p => /Латинские/.test(p.msg)), 'латиница');
  assert.ok(issues.some(p => /Повтор/.test(p.msg)), 'повтор');
  assert.ok(issues.some(p => /Пустое поле \{Место\}/.test(p.msg)), 'пустое поле');
  assert.ok(issues.some(p => /пробелы/.test(p.msg)), 'пробелы');
  assert.strictEqual(XS.Check.fix(ck, 'latin'), 2);
  assert.strictEqual(ck.data.rows[0].cells[ck.data.columns[0].id], 'Иванов Иван');
  // 12. Сжатый ZIP читается обратно
  const zb = new Uint8Array(await (await XS.Zip.zip([{name: 'Диплом 1.pdf', blob: new Blob([enc('%PDF '.repeat(500))])}, {name: 'фото.jpg', blob: new Blob([enc('jpg')])}])).arrayBuffer());
  const back = XS.Zip.unzip(zb);
  assert.deepStrictEqual(Object.keys(back), ['Диплом 1.pdf', 'фото.jpg']);
  assert.ok(zb.length < 600, 'PDF сжат: ' + zb.length);
  // 13. Мастер печати: проходы, пакеты, повтор набора, лист совмещения
  const pm = XS.Model.blankDoc('bookmark', 'Закладки', {width: 50, height: 150});
  pm.sides.push(XS.Model.side('back', 'Оборот'));
  pm.sides[0].elements.push(XS.Model.element('text', {text: '{ФИО}'}));
  pm.sides[1].elements.push(XS.Model.element('rect', {fill: '#ff0000'}));
  for (let i = 0; i < 35; i++) XS.Model.addRow(pm, {'ФИО': 'Автор ' + (i + 1)});
  pm.output = {...pm.output, paper: 'a4', margin: 5, gap: 0};
  const prof = XS.PrintPlan.profile({name: 'Epson', role: 'inkjet', offsetX: 1, backOffsetY: -0.5, reverseBacks: true});
  let job = XS.PrintPlan.build(pm, {mode: 'two', repeat: 3, batch: 10, profiles: {inkjet: prof}});
  const per = job.perSheet, sh = Math.ceil(35 / per);
  assert.strictEqual(job.sheets, sh);
  assert.strictEqual(job.physical, sh * 3);
  const steps = new Set(job.passes.map(x => x.step));
  assert.strictEqual(steps.size, 4, 'струйный лицо/оборот, лазерный лицо/оборот');
  assert.strictEqual(job.passes.length, 4 * Math.ceil(sh * 3 / 10));
  assert.ok(job.passes.every(x => x.sheets <= 10));
  const p2 = job.passes.find(x => x.step === 2);
  assert.ok(p2.pages[0].back && p2.pages[0].mirror && p2.pages[0].offset.y === -0.5, 'оборот с поправкой профиля');
  assert.ok(p2.pages[0].sheet >= p2.pages[p2.pages.length - 1].sheet, 'обратный порядок оборотов');
  assert.strictEqual(job.passes[0].layer, 'color');
  assert.strictEqual(job.passes.find(x => x.step === 3).layer, 'text');
  job = XS.PrintPlan.build(pm, {mode: 'duplex', sheetRange: '2-3'});
  assert.strictEqual(job.passes.length, 1);
  assert.deepStrictEqual(job.passes[0].pages.map(x => x.sheet + ':' + x.side), ['1:0', '1:1', '2:0', '2:1']);
  const pass = job.passes[0];
  r = await XS.Export.run(pm, {...pm.output, packaging: 'sheets', layer: pass.layer, pageList: pass.pages});
  assert.strictEqual(r.pages, 4);
  job = XS.PrintPlan.build(pm, {mode: 'manual'});
  assert.strictEqual(job.passes.length, 2);
  assert.ok(/Переверните/.test(job.passes[1].hint));
  assert.throws(() => XS.PrintPlan.build(pm, {sheetRange: '99'}), /нет листов/);
  r = await XS.PrintPlan.calibration(prof, {paper: 'a4'});
  assert.strictEqual(r.pages, 2);
  fs.writeFileSync(path.join(out, 'calibration.pdf'), new Uint8Array(await r.blob.arrayBuffer()));
  // 14. v4: форматы значений, замена по умолчанию, слово по полу
  const fd = XS.Model.blankDoc('certificate');
  XS.Model.addRow(fd, {'ФИО': 'Петрова Анна Сергеевна', 'Дата': '26.11.2026', 'Сумма': '1250', 'Место': 'III место', 'Роль': ''});
  XS.Model.addRow(fd, {'ФИО': 'Иванов Иван Иванович', 'Дата': '2026-03-08', 'Сумма': '21', 'Место': '2', 'Роль': 'Спикер'});
  const f0 = XS.Fields.context(fd, fd.data.rows[0], 6), f1 = XS.Fields.context(fd, fd.data.rows[1], 1);
  const eq = (t, c, v) => assert.strictEqual(XS.Fields.fill(t, c), v, t);
  eq('{Дата:длинная}', f0, '26 ноября 2026 г.'); eq('{Дата:дм}', f1, '8 марта'); eq('{Дата:ДД.ММ.ГГ}', f1, '08.03.26'); eq('{Дата:день недели}', f0, 'четверг');
  eq('{Сумма:прописью}', f1, 'двадцать один'); eq('{Сумма:число}', f0, '1\u00a0250'); eq('{Сумма:римское}', f1, 'XXI');
  eq('{Место:порядковое} место', f0, 'третье место'); eq('{Место:порядковый}', f1, 'второй'); eq('{№:000}', f0, '007');
  eq('{Роль|Участник}', f0, 'Участник'); eq('{Роль|Участник}', f1, 'Спикер'); eq('{Нет такого|—}', f0, '—');
  eq('{ФИО:принял/приняла} участие', f0, 'приняла участие'); eq('Уважаем{ФИО:ый/ая}', f1, 'Уважаемый');
  eq('{ФИО:буквы}', f0, 'АП'); eq('{ФИО:дат:верх}', f1, 'ИВАНОВУ ИВАНУ ИВАНОВИЧУ');
  assert.strictEqual(XS.Formats.words(1001), 'одна тысяча один');
  assert.strictEqual(XS.Formats.ordinal(43, 'f'), 'сорок третья');
  assert.deepStrictEqual(XS.Fields.fieldsIn('{Роль|Участник} {ФИО:дат}'), ['Роль', 'ФИО']);
  // 15. Штрихкод: таблица Code 128 (сумма модулей и чётность полос), контрольная сумма, EAN-13
  XS.Barcode.PATTERNS.forEach((p, i) => { const w = p.split('').map(Number); assert.strictEqual(w.reduce((a, b) => a + b), i === 106 ? 13 : 11); assert.strictEqual(w.filter((_, j) => j % 2 === 0).reduce((a, b) => a + b) % 2, 0); });
  assert.deepStrictEqual(XS.Barcode.code128('123456'), [105, 12, 34, 56, 44, 106]);
  assert.strictEqual(XS.Barcode.eanCheck('400638133393'), 1);
  assert.throws(() => XS.Barcode.path('Привет', 40, 10), /латиница/);
  assert.throws(() => XS.Barcode.path('4006381333932', 40, 10, {type: 'ean13'}), /контрольная/);
  assert.strictEqual(XS.Barcode.ean13Bits('400638133393').bits.length, 95);
  // 16. Поворот: в сцене и в PDF
  const rd = XS.Model.blankDoc('custom', 'Поворот', {width: 100, height: 60});
  rd.sides[0].elements.push(XS.Model.element('text', {text: 'Наклон', x: 20, y: 20, w: 60, h: 20, rotate: 30}), XS.Model.element('line', {x: 0, y: 0, w: 10, h: 0, rotate: 45}));
  const rn = XS.Model.normalizeDoc(JSON.parse(JSON.stringify(rd)));
  assert.strictEqual(rn.sides[0].elements[0].rotate, 30); assert.strictEqual(rn.sides[0].elements[1].rotate, 0, 'линия не поворачивается');
  const rs = XS.Scene.build(rn, 0, null, 0);
  assert.ok(rs.ops[0].rot === 30 && rs.ops[0].cx === 50 && rs.ops[0].cy === 30);
  const m = XS.PdfRender.rotation(90, 10, 10);
  assert.ok(Math.abs(m[0]) < 1e-9 && Math.abs(m[1] + 1) < 1e-9, 'по часовой на экране = −90° в PDF');
  // 17. Новые шаблоны v4 выгружаются без замечаний о шрифтах и переполнении
  for (const id of ['badge', 'certificate', 'thanks', 'tent', 'ticket']) {
    const pd = await XS.Presets.LIST.find(p => p.id === id).make();
    await XS.Fonts.ensureForDoc(pd);
    for (let i = 0; i < pd.data.rows.length; i++) {
      const sc = XS.Scene.build(pd, 0, pd.data.rows[i], i);
      const bad = sc.warnings.filter(w => !/Изображение не найдено/.test(w.msg));
      assert.deepStrictEqual(bad, [], id + ' #' + (i + 1) + ': ' + JSON.stringify(bad));
    }
    r = await XS.Export.run(pd, {...pd.output, packaging: id === 'certificate' ? 'single' : pd.output.packaging});
    fs.writeFileSync(path.join(out, 'v4-' + id + '.pdf'), Buffer.from(await r.blob.arrayBuffer()));
    assert.ok(r.pages >= 1 || r.files >= 1, id + ': ' + JSON.stringify({pages: r.pages, files: r.files, name: r.name}));
  }
  const tk = await XS.Presets.ticket();
  const tks = XS.Scene.build(tk, 0, tk.data.rows[0], 0);
  assert.ok(tks.ops.some(o => o.op === 'path' && o.rot === 90), 'штрихкод на корешке повёрнут');
  assert.ok(tks.ops.some(o => o.op === 'text' && o.lines.some(l => l.pieces.some(p => p.text.includes('000001')))), 'подпись штрихкода');
  // 18. Инструменты списка: сортировка, повторы, замена, фото по именам, ссылка на Google Таблицу
  const dt = XS.Model.blankDoc('diploma');
  for (const [f, p] of [['Сидоров Пётр', 'III место'], ['Ёлкина Анна', 'I место'], ['', ''], ['Петрова Анна', 'II место'], ['ёлкина  анна', 'I место']]) XS.Model.addRow(dt, {'ФИО': f, 'Место': p});
  const placeCol = XS.Model.columnByName(dt, 'Место').id, fioCol = XS.Model.columnByName(dt, 'ФИО').id;
  XS.DataTools.sortRows(dt, placeCol);
  assert.deepStrictEqual(dt.data.rows.map(r => r.cells[placeCol]), ['I место', 'I место', 'II место', 'III место', ''], 'римские места по смыслу, пустые в конце');
  XS.DataTools.sortRows(dt, fioCol, 'desc');
  assert.strictEqual(dt.data.rows[0].cells[fioCol], 'Сидоров Пётр');
  assert.strictEqual(XS.DataTools.duplicates(dt).length, 1, 'ё/е, регистр и двойной пробел — повтор');
  assert.strictEqual(XS.DataTools.dedupe(dt), 1); assert.strictEqual(dt.data.rows.length, 4);
  dt.sides[0].elements.push(XS.Model.element('text', {text: 'Анна и Аннушка: {ФИО}'}));
  assert.strictEqual(XS.DataTools.count(dt, 'анна', {wholeWord: true}), 3);
  assert.strictEqual(XS.DataTools.replace(dt, 'Анна', 'Анастасия', {where: 'data', matchCase: true}), 2);
  assert.ok(dt.sides[0].elements[0].text.startsWith('Анна'), 'макет не тронут');
  assert.strictEqual(XS.DataTools.replace(dt, '{ФИО}', '{ФИО:дат}', {where: 'layout'}), 1);
  const ph = XS.Model.blankDoc('badge');
  for (const f of ['Иванов Иван Иванович', 'Петрова Анна Сергеевна', 'Ким Алексей']) XS.Model.addRow(ph, {'ФИО': f});
  const fake = name => ({name, asset: {name, mime: 'image/png', data: 'data:image/png;base64,' + Buffer.from(name).toString('base64'), width: 1, height: 1}});
  const pm2 = XS.DataTools.matchPhotos(ph, ['Иванов Иван.jpg', 'petrova_anna.png', 'aleksey kim.jpg', '002.jpg', 'Незнакомец.jpg'].map(fake), XS.Model.columnByName(ph, 'ФИО').id);
  assert.deepStrictEqual(pm2.matched.map(m => m.file.name + '→' + m.index), ['Иванов Иван.jpg→0', 'petrova_anna.png→1', 'aleksey kim.jpg→2', '002.jpg→1']);
  assert.deepStrictEqual(pm2.unmatched, ['Незнакомец.jpg']);
  const photoCol = XS.Model.addColumn(ph, 'Фото', 'image');
  assert.strictEqual(XS.DataTools.applyPhotos(ph, pm2.matched, photoCol.id), 4);
  assert.ok(/^asset:/.test(ph.data.rows[0].cells[photoCol.id]));
  assert.strictEqual(XS.DataTools.sheetCsvUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42'), 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42');
  assert.strictEqual(XS.DataTools.sheetCsvUrl('https://example.com/table'), null);
  // 19. Шрифты: каталог Google Fonts, план начертаний, шрифт проекта → вёрстка и PDF
  const cat = await XS.Fonts.catalog();
  assert.ok(cat.length > 1000, 'каталог Google Fonts загружен');
  const mont = cat.find(f => f.family === 'Montserrat');
  assert.ok(mont && mont.cyrillic && mont.italic && mont.popular && mont.weights.includes(100) && mont.weights.includes(900));
  assert.ok(cat.filter(f => f.cyrillic).length > 250, 'семейств с кириллицей');
  let fntPlan = XS.Fonts.plan(mont, 400);
  assert.deepStrictEqual([fntPlan.family, fntPlan.regular, fntPlan.bold, fntPlan.files.length], ['Montserrat', 400, 700, 4]);
  fntPlan = XS.Fonts.plan(mont, 300);
  assert.deepStrictEqual([fntPlan.family, fntPlan.regular, fntPlan.bold], ['Montserrat Light', 300, 700]);
  fntPlan = XS.Fonts.plan(mont, 800);
  assert.deepStrictEqual([fntPlan.family, fntPlan.regular, fntPlan.bold], ['Montserrat ExtraBold', 800, null], 'тяжелее некуда — жирного нет');
  fntPlan = XS.Fonts.plan(cat.find(f => f.family === 'Lobster'), 400);
  assert.deepStrictEqual([fntPlan.family, fntPlan.bold, fntPlan.files.length], ['Lobster', null, 1], 'одно начертание');
  const fntDoc = XS.Model.blankDoc('card');
  const lob = XS.bytesToDataUrl(new Uint8Array(fs.readFileSync(path.join(app, 'fonts/Lobster-Regular.ttf'))), 'font/ttf');
  fntDoc.fonts.push({id: 'font_t', family: 'Тестовый Google', variant: 'regular', source: 'google', category: 'd', name: 'Lobster 400', data: lob});
  const fntN = XS.Model.normalizeDoc(JSON.parse(JSON.stringify(fntDoc)));
  assert.deepStrictEqual([fntN.fonts[0].source, fntN.fonts[0].category], ['google', 'd'], 'источник и категория шрифта сохраняются');
  const famT = XS.Fonts.families(fntN).find(f => f.family === 'Тестовый Google');
  assert.deepStrictEqual([famT.category, famT.source, famT.variants], ['Акцидентный', 'google', ['regular']]);
  const insp = XS.Fonts.inspect(XS.dataUrlToBytes(lob).bytes);
  assert.deepStrictEqual([insp.family, insp.variant, insp.cyrillic], ['Lobster', 'regular', true]);
  fntN.sides[0].elements = [XS.Model.element('text', {text: 'Привет, шрифт', font: 'Тестовый Google', bold: true})];
  assert.strictEqual(XS.Fonts.usage(fntN, 'Тестовый Google'), 1);
  assert.strictEqual(XS.Fonts.pick(fntN, 'Тестовый Google', true, false).key, 'u:font_t', 'жирного нет — берётся обычный файл проекта');
  await XS.Fonts.ensureForDoc(fntN);
  XS.Model.addRow(fntN, {});
  const fpdf = await XS.Export.run(fntN, {...fntN.output, packaging: 'single', format: 'pdf'});
  const fdoc = await PDFLib.PDFDocument.load(new Uint8Array(await fpdf.blob.arrayBuffer()));
  const fontNames = [];
  fdoc.context.enumerateIndirectObjects().forEach(([, o]) => { const bf = o?.dict?.get?.(PDFLib.PDFName.of('BaseFont')) || o?.get?.(PDFLib.PDFName.of('BaseFont')); if (bf) fontNames.push(String(bf)); });
  assert.ok(fontNames.some(n => /Lobster/.test(n)), 'шрифт проекта встроен в PDF: ' + fontNames.join(', '));
  // 20. Times New Roman: встроенный метрический аналог Tinos (все 4 начертания), старые названия → он же
  assert.ok(/Tinos-BoldItalic/.test(XS.Fonts.pick(fntN, 'Times New Roman (Tinos)', true, true).source));
  assert.ok(/Tinos-BoldItalic/.test(XS.Fonts.pick(fntN, 'Times New Roman', true, true).source), 'название из Word');
  const tnr = XS.Model.blankDoc('diploma');
  tnr.sides[0].elements = [XS.Model.element('text', {text: 'ИВАНОВА МАРИЯ ПЕТРОВНА', font: 'Times New Roman (Tinos)', bold: true, italic: true, color: '#315BA7', x: 10, y: 95, w: 128, h: 20, size: 20})];
  XS.Model.addRow(tnr, {});
  await XS.Fonts.ensureForDoc(tnr);
  const tnrFace = XS.Fonts.get(tnr, 'Times New Roman (Tinos)', true, true);
  assert.ok(tnrFace && tnrFace.fk.hasGlyphForCodePoint(0x0416) && /Bold Italic/.test(tnrFace.fk.subfamilyName), 'жирный курсив с кириллицей');
  const tnrPdf = await XS.Export.run(tnr, {...tnr.output, packaging: 'single', format: 'pdf'});
  fs.writeFileSync(path.join(out, 'times-bold-italic.pdf'), Buffer.from(await tnrPdf.blob.arrayBuffer()));

  // 21. Импорт с сопоставлением: список ФИО без заголовка ложится в существующий «ФИО», а не в новый столбец
  const im = XS.Model.blankDoc('custom');
  im.data.columns.push({id: 'c-role', name: 'Роль'}, {id: 'c-ph', name: 'Фото', type: 'image'});
  XS.Model.addRow(im, {'ФИО': 'Долгих Елизавета Сергеевна', 'Роль': 'Участник'});
  XS.Model.addRow(im, {'ФИО': 'Кривцова Валерия Вячеславовна', 'Роль': 'Участник'});
  let it = XS.Import.parseTable('Петров Сергей Александрович\nПуртова Мария Владимировна\nДолгих Елизавета Сергеевна');
  let mp = XS.ImportMap.guess(im, it);
  assert.strictEqual(mp.hasHeader, false, 'первая строка — тоже ФИО, не заголовок');
  assert.strictEqual(mp.columns[0].target, 'c-name', 'ФИО → существующий столбец ФИО');
  assert.strictEqual(mp.mode, 'update', 'одна фамилия уже есть — обновляем по ключу, без повторов');
  let mres = XS.ImportMap.apply(im, it, mp);
  assert.deepStrictEqual([mres.added, mres.updated, mres.created], [2, 1, 0]);
  assert.strictEqual(im.data.columns.length, 3, 'новых столбцов нет');
  assert.strictEqual(im.data.rows.length, 4);
  // с заголовками-синонимами: «Ф.И.О.» → ФИО, «E-mail» и «пол» — новые; Экз. → экземпляры
  it = XS.Import.parseTable('Ф.И.О.\tE-mail\tпол\tЭкз.\nДолгих Елизавета Сергеевна\ta@b.ru\tж\t2\nИванов Иван Иванович\tx@y.ru\tм\t1');
  mp = XS.ImportMap.guess(im, it);
  assert.ok(mp.hasHeader);
  assert.deepStrictEqual(mp.columns.map(c => c.target), ['c-name', 'new', 'new', XS.ImportMap.COPIES]);
  mres = XS.ImportMap.apply(im, it, mp);
  assert.deepStrictEqual([mres.added, mres.updated], [1, 1]);
  const dolg = im.data.rows.find(r => r.cells['c-name'] === 'Долгих Елизавета Сергеевна');
  assert.strictEqual(dolg.copies, 2);
  assert.strictEqual(dolg.cells[XS.Model.columnByName(im, 'E-mail').id], 'a@b.ru');
  assert.strictEqual(im.greeting.genderField, 'Пол', 'столбец «пол» подхвачен для {Обращение} (без учёта регистра)');
  // «вписать по порядку»: бланки без ФИО
  const blank = XS.Model.blankDoc('custom');
  for (let i = 0; i < 3; i++) XS.Model.addRow(blank, {});
  it = XS.Import.parseTable('Иванов Иван\nПетров Пётр');
  mp = XS.ImportMap.guess(blank, it);
  assert.strictEqual(mp.mode, 'fill');
  mres = XS.ImportMap.apply(blank, it, mp);
  assert.strictEqual(blank.data.rows.length, 3); assert.strictEqual(blank.data.rows[1].cells['c-name'], 'Петров Пётр');
  // повторы в «добавить»
  it = XS.Import.parseTable('ФИО\nИванов Иван\nИванов  иван\nНовиков Олег');
  mp = XS.ImportMap.guess(XS.Model.blankDoc('custom'), it);
  const fresh = XS.Model.blankDoc('custom');
  mres = XS.ImportMap.apply(fresh, it, {...mp, mode: 'append'});
  assert.deepStrictEqual([mres.added, mres.skipped], [2, 1], 'повтор внутри файла пропущен');

  // 22. Картинка по ссылке: рисуется только сохранённая копия, без копии — заглушка (холст не «загрязняется»)
  const ri = XS.Model.blankDoc('custom');
  ri.data.columns.push({id: 'c-ph', name: 'Фото', type: 'image'});
  ri.sides[0].elements = [XS.Model.element('image', {src: '{Фото}', x: 0, y: 0, w: 30, h: 40})];
  XS.Model.addRow(ri, {'ФИО': 'Иванов', 'Фото': 'https://example.com/a.jpg'});
  assert.deepStrictEqual(XS.RemoteImages.needed(ri), ['https://example.com/a.jpg']);
  let sc = XS.Scene.build(ri, 0, ri.data.rows[0], 0);
  const op = sc.ops.find(o => o.op === 'image');
  assert.ok(op.asset.pending && !op.asset.data, 'без копии — заглушка');
  assert.ok(sc.warnings.some(w => /ещё не скачана/.test(w.msg)));
  const png = fs.readFileSync(path.join(app, 'img/favicon-32.png'));
  XS.Model.addAsset(ri, {name: 'a.jpg', mime: 'image/png', data: XS.bytesToDataUrl(new Uint8Array(png), 'image/png'), width: 32, height: 32, urls: ['https://example.com/a.jpg']});
  sc = XS.Scene.build(ri, 0, ri.data.rows[0], 0);
  assert.ok(/^data:image\/png/.test(sc.ops.find(o => o.op === 'image').asset.data), 'рисуется копия из проекта');
  XS.Model.pruneAssets(ri);
  assert.strictEqual(Object.keys(ri.assets).length, 1, 'копия по ссылке не считается мусором');
  assert.deepStrictEqual(XS.Model.normalizeDoc(JSON.parse(JSON.stringify(ri))).assets[Object.keys(ri.assets)[0]].urls, ['https://example.com/a.jpg'], 'ссылка сохраняется в файле проекта');
  r = await XS.Export.run(ri, {...ri.output, packaging: 'single', format: 'pdf'});
  assert.strictEqual(r.pages, 1);
  // без копии выгрузка честно скачивает или объясняет, а не падает на toDataURL
  ri.data.rows[0].cells['c-ph'] = 'https://example.com/b.jpg';
  XS.RemoteImages.download = async () => { throw new Error('сайт ответил 404.'); };
  await assert.rejects(() => XS.Export.run(ri, {...ri.output, packaging: 'single', format: 'pdf'}), /Не скачались картинки по ссылкам: 1/);
  XS.Model.pruneAssets(ri);
  assert.strictEqual(Object.keys(ri.assets).length, 0, 'ссылки больше нет — копия удаляется');
  assert.strictEqual(XS.RemoteImages.directUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn');
  // EXIF-поворот и тип по сигнатуре
  assert.strictEqual(XS.Assets.sniff(new Uint8Array(png)), 'image/png');
  const exif = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, 0x06, 0, 0, 0, 0, 0, 0, 0xFF, 0xDA]);
  assert.strictEqual(XS.Assets.exifOrientation(exif), 6);

  // 23. Фото пачкой: ФИО, фамилия+инициалы, транслит, номер, имя файла из таблицы
  const pd = XS.Model.blankDoc('custom');
  for (const n of ['Долгих Елизавета Сергеевна', 'Кривцова Валерия Вячеславовна', 'Петров Сергей Александрович', 'Петров Иван Ильич']) XS.Model.addRow(pd, {'ФИО': n});
  pd.data.rows[3].cells.ph = 'IMG_0042.JPG';
  const phm = XS.DataTools.matchPhotos(pd, ['Долгих Е.С.jpg', 'kriVtsova_valeriya.png', 'img_0042.jpg', '003.jpg', 'Петров.jpg'].map(name => ({name})), 'c-name', {imageColumnId: 'ph'});
  assert.deepStrictEqual(phm.matched.map(m => [m.file.name, m.index, m.how]), [['Долгих Е.С.jpg', 0, 'initials'], ['kriVtsova_valeriya.png', 1, 'name'], ['img_0042.jpg', 3, 'file'], ['003.jpg', 2, 'number']]);
  assert.deepStrictEqual(phm.unmatched, ['Петров.jpg'], 'двое Петровых — по одной фамилии не угадываем');
  console.log('Все проверки ядра пройдены. Файлы:', fs.readdirSync(out).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
