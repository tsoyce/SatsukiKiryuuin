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
for (const f of ['util', 'guest-data', 'model', 'formats', 'names', 'fields', 'fonts', 'layout', 'qr', 'barcode', 'scene', 'assets', 'render-canvas', 'render-pdf', 'zip', 'impose', 'check', 'export', 'print-plan', 'presets', 'importers']) require(path.join(app, 'js/core', f + '.js'));
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
  assert.deepStrictEqual(ot, {headers: ['ФИО', 'Место'], rows: [['Петрова Анна', '1']]});
  const cp = new Uint8Array([0xd4, 0xc8, 0xce, 0x0a, 0xc8, 0xe2, 0xe0, 0xed, 0xee, 0xe2]); // «ФИО\nИванов» в cp1251
  assert.deepStrictEqual(XS.Import.readTableFile(cp, 'a.csv'), {headers: ['ФИО'], rows: [['Иванов']]});
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
  console.log('Все проверки ядра пройдены. Файлы:', fs.readdirSync(out).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
