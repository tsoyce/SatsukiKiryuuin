// Извлекает картинки и данные из legacy/v25 (base64 внутри .js) в обычные файлы app/presets/.
// Запуск: node tools/extract-legacy-presets.cjs
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), legacy = path.join(root, 'legacy/v25/priglasitelnye'), out = path.join(root, 'app/presets/assets');
fs.mkdirSync(out, {recursive: true});
global.window = global;
for (const f of ['template.js', 'diploma-theme-assets.js', 'bookmark-seed.js', 'bookmark-raster-portraits.js']) require(path.join(legacy, f));
const ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
function save(dataUrl, name) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  const file = name + '.' + ext[m[1]];
  fs.writeFileSync(path.join(out, file), Buffer.from(m[2], 'base64'));
  return 'presets/assets/' + file;
}
save(window.DEFAULT_TEMPLATE, 'invitation-sociology');
save(window.DiplomaThemeAssets.background, 'frost-background');
const photos = new Map();
for (const img of window.BOOKMARK_SEED.images) photos.set(img.id, img.dataUrl);
for (const img of window.BookmarkRasterPortraits) photos.set(img.id, img.dataUrl);
fs.mkdirSync(path.join(out, 'portraits'), {recursive: true});
const rows = window.BOOKMARK_SEED.cards.map((card, i) => ({
  'Автор': card.name,
  'Цитата': card.quote,
  'Фото': save(photos.get(card.photoId), 'portraits/' + String(i + 1).padStart(2, '0'))
}));
fs.writeFileSync(path.join(out, 'bookmark-quotes.json'), JSON.stringify(rows, null, 1));
for (const f of ['university.png', 'department.png', 'pair.png']) fs.copyFileSync(path.join(legacy, 'brand', f), path.join(out, 'logo-' + f));
console.log('ok', rows.length, 'закладок');
