/* Собирает каталог Google Fonts для Студии: app/fonts/google-catalog.json.
 * Источник — пакет google-font-metadata (npm, данные Google Fonts API; лицензия MIT).
 *   npm pack google-font-metadata && tar xzf google-font-metadata-*.tgz
 *   node tools/build-font-catalog.cjs package/data/google-fonts-v2.json
 * Каталог — только названия и свойства семейств; сами файлы шрифтов Студия берёт через сервер
 * (server/src/Fonts.php) в момент добавления шрифта в проект. */
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Укажите путь к google-fonts-v2.json'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
// Часто используемые для русского текста: показываются первыми.
const POPULAR = ['Roboto', 'Open Sans', 'Montserrat', 'Inter', 'Noto Sans', 'Noto Serif', 'PT Sans', 'PT Serif', 'Rubik', 'Lora', 'Playfair Display',
  'Raleway', 'Oswald', 'Merriweather', 'Ubuntu', 'Nunito', 'Fira Sans', 'EB Garamond', 'Cormorant Garamond', 'Cormorant', 'Comfortaa', 'Caveat',
  'Pacifico', 'Amatic SC', 'Philosopher', 'Russo One', 'Yeseva One', 'Prata', 'Forum', 'Old Standard TT', 'Alice', 'Kurale', 'Great Vibes',
  'Neucha', 'Unbounded', 'Manrope', 'Golos Text', 'Onest', 'Tenor Sans', 'Spectral', 'Literata', 'Jost', 'Exo 2', 'IBM Plex Sans', 'IBM Plex Serif',
  'Source Serif 4', 'Roboto Slab', 'Roboto Condensed', 'Arimo', 'Tinos', 'Lobster', 'Marck Script', 'Bad Script', 'Bitter', 'Vollkorn',
  'Play', 'Didact Gothic', 'Ruslan Display', 'Stalinist One', 'Press Start 2P', 'Poiret One', 'Seymour One', 'Underdog', 'Kelly Slab',
  'Oranienbaum', 'Ledger', 'Playfair', 'Sofia Sans', 'Geologica', 'Mulish', 'Podkova', 'Scada', 'Cuprum', 'Istok Web', 'Lobster Two',
  'Bellota', 'Pangolin', 'Shantell Sans', 'Sono', 'Wix Madefor Display', 'Wix Madefor Text', 'Gabriela', 'Ysabeau', 'Brygada 1918', 'Piazzolla'];
const CAT = {'sans-serif': 's', serif: 'r', display: 'd', handwriting: 'h', monospace: 'm'};
const fonts = Object.values(data).map(f => {
  const cyr = f.subsets.includes('cyrillic') ? 1 : 0;
  const weights = [...new Set(f.weights)].filter(w => w % 100 === 0).sort((a, b) => a - b).map(w => w / 100);
  const pop = POPULAR.indexOf(f.family);
  return {row: [f.family, CAT[f.category] || 's', weights.join(''), f.styles.includes('italic') ? 1 : 0, cyr], pop: pop < 0 ? 9999 : pop};
}).filter(f => f.row[2])
  .sort((a, b) => a.pop - b.pop || a.row[0].localeCompare(b.row[0]))
  .map(f => (f.pop < 9999 ? [...f.row, 1] : f.row));
const out = {v: 1, built: new Date().toISOString().slice(0, 10), license: 'Семейства Google Fonts распространяются по свободным лицензиям (в основном SIL OFL 1.1, а также Apache 2.0 и UFL).',
  columns: 'семейство, категория (s без засечек, r с засечками, d акцидентный, h рукописный, m моноширинный), начертания (цифры = вес/100), есть курсив, есть кириллица, популярный',
  fonts};
const dst = path.join(__dirname, '../app/fonts/google-catalog.json');
fs.writeFileSync(dst, JSON.stringify(out));
console.log('Семейств:', fonts.length, 'с кириллицей:', fonts.filter(f => f[4]).length, '→', dst, fs.statSync(dst).size, 'байт');
