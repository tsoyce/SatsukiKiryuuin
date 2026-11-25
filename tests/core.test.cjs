// Проверка ядра без браузера: node tests/core.test.cjs
// Собирает документы из шаблонов, выгружает PDF (одним файлом, ZIP, листы) и проверяет имена файлов.
const fs = require('fs'), path = require('path'), assert = require('assert');
const app = path.join(__dirname, '..', 'app');
global.window = global;
global.PDFLib = require(path.join(app, 'vendor/pdf-lib.min.js'));
global.fontkit = require(path.join(app, 'vendor/fontkit.umd.min.js'));
for (const f of ['util', 'guest-data', 'model', 'fields', 'fonts', 'layout', 'scene', 'assets', 'render-canvas', 'render-pdf', 'zip', 'impose', 'export', 'presets', 'importers']) require(path.join(app, 'js/core', f + '.js'));
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
  console.log('Все проверки ядра пройдены. Файлы:', fs.readdirSync(out).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
