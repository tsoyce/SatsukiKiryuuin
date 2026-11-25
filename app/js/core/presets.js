/* XSatsu Студия · стартовые шаблоны. Это обычные документы ядра — отличаются только содержимым.
 * Картинки лежат в presets/assets (извлечены из v25 скриптом tools/extract-legacy-presets.cjs). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const M = () => XS.Model;
  const pt = v => v * XS.MM_PER_PT; // толщина линий из pt в мм

  async function asset(doc, url, name) {
    const data = await XS.fetchDataUrl(url);
    const img = await XS.Assets.image({id: 'probe:' + url, data});
    return M().addAsset(doc, {name: name || url.split('/').pop(), mime: /^data:([^;]+)/.exec(data)[1], data, width: img.naturalWidth, height: img.naturalHeight});
  }
  const T = (props) => M().element('text', props);

  async function invitation() {
    const doc = M().blankDoc('invitation', 'Пригласительные', {width: 148, height: 210});
    const bg = await asset(doc, 'presets/assets/invitation-sociology.jpg', 'День социолога — макет.jpg');
    doc.sides[0].background = {asset: bg.id, page: 1, fit: 'stretch', opacity: 1};
    const base = {font: 'PT Sans', italic: true, size: 14, color: '#24232b', align: 'left', valign: 'top', x: 5.9, w: 136.2};
    doc.sides[0].elements = [
      T({...base, name: 'Обращение и ФИО', text: '{Обращение},\n{ФИО}!', y: 58.8, h: 17.9, accent: {enabled: true, fields: 'ФИО', font: 'PT Serif', size: 18, bold: true, italic: false, color: '#694983'}}),
      T({...base, name: 'Текст приглашения', text: 'Кафедра общей и экономической социологии ТюмГУ\nприглашает Вас на День социолога!', y: 79.8, h: 16.8}),
      T({...base, name: 'Дата и адрес', text: '12 ноября 2026 года в 13:30\nг. Тюмень, ул. Ленина, д. 16, аудитория L300', y: 98.7, h: 14.7})
    ];
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-sex', name: 'Пол'}, {id: 'c-mail', name: 'Email'}];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович', 'Пол': '', 'Email': ''});
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Пол': '', 'Email': ''});
    doc.greeting.enabled = true;
    doc.output.naming = '{№} Приглашение {ФИО}';
    return doc;
  }

  /* Диплом А4: общая часть для «Классического» и «Первого инея». */
  function diplomaTexts(INK) {
    const F = {font: 'Montserrat', color: INK, align: 'center', valign: 'middle'};
    return [
      T({...F, name: 'Заголовок', text: 'ДИПЛОМ', x: 25, y: 45, w: 160, h: 23, size: 42, bold: true, minSize: 20, letterSpacing: 2}),
      T({...F, name: 'Мероприятие', text: 'День социолога 2026', x: 29, y: 73, w: 152, h: 15, size: 15.5, bold: true, minSize: 10.5}),
      T({...F, name: 'Подзаголовок', text: 'Интеллектуальная игра', x: 31, y: 89, w: 148, h: 9, size: 11.5, minSize: 9.5}),
      T({...F, name: 'Награждается', text: 'Награждается', x: 28, y: 102, w: 154, h: 9, size: 12.5, minSize: 10}),
      T({...F, name: 'Получатель', text: '{ФИО}', x: 25, y: 115, w: 160, h: 37, size: 28, bold: true, minSize: 16, empty: {mode: 'lines', lines: 2, color: '#53677a', width: pt(0.55)}}),
      T({...F, name: 'Место', text: '{Место}', x: 32, y: 160, w: 146, h: 19, size: 26, bold: true, minSize: 18, empty: {mode: 'hide'}}),
      T({...F, name: 'Основание', text: '{Основание}', x: 30, y: 183, w: 150, h: 42, size: 16, minSize: 11, empty: {mode: 'lines', lines: 3, color: '#53677a', width: pt(0.55)}}),
      M().element('line', {name: 'Разделитель', x: 86, y: 235, w: 38, h: 0, stroke: '#92a9bd', strokeWidth: pt(0.5)}),
      T({...F, name: 'Должность', text: 'Руководитель кафедры', x: 53, y: 242, w: 104, h: 13, size: 11, minSize: 9}),
      M().element('line', {name: 'Линия подписи', x: 53, y: 263, w: 104, h: 0, stroke: '#53677a', strokeWidth: pt(0.55)}),
      T({...F, name: 'Подписант', text: 'И. О. Фамилия', x: 53, y: 266, w: 104, h: 12, size: 11.5, minSize: 9.5}),
      T({...F, name: 'Город и дата', text: 'г. Тюмень · 12 ноября 2026', x: 28, y: 278.5, w: 154, h: 7, size: 10.5, minSize: 9})
    ];
  }
  function diplomaData(doc) {
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-place', name: 'Место'}, {id: 'c-reason', name: 'Основание'}];
    M().addRow(doc, {'ФИО': 'Команда «Социологические мысли»', 'Место': 'I место', 'Основание': 'за победу в интеллектуальной игре, посвящённой Дню социолога'});
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Место': '', 'Основание': 'за активное участие в подготовке праздника'});
    M().addRow(doc, {'ФИО': '', 'Место': '', 'Основание': ''});
    doc.output.naming = '{№} Диплом {ФИО}';
  }
  async function diplomaClassic() {
    const INK = '#263f58', PALE = '#92a9bd';
    const doc = M().blankDoc('diploma', 'Дипломы', {width: 210, height: 297});
    const deco = [
      M().element('rect', {name: 'Рамка', x: 10, y: 10, w: 190, h: 277, fill: '', stroke: INK, strokeWidth: pt(0.75), locked: true}),
      M().element('rect', {name: 'Внутренняя рамка', x: 12.4, y: 12.4, w: 185.2, h: 272.2, fill: '', stroke: PALE, strokeWidth: pt(0.3), locked: true})
    ];
    for (const [x, y, a, b] of [[10, 10, 1, 1], [200, 10, -1, 1], [10, 287, 1, -1], [200, 287, -1, -1]]) {
      const ox = Math.min(x, x + a * 11), oy = Math.min(y, y + b * 11), r = (v, o) => +(v - o).toFixed(2);
      const px = v => r(x + a * v, ox), py = v => r(y + b * v, oy);
      deco.push(M().element('path', {name: 'Уголок', x: ox, y: oy, w: 11, h: 11, locked: true, stroke: INK, strokeWidth: pt(0.85), fill: '',
        d: `M${px(2.4)} ${py(11)}L${px(2.4)} ${py(2.4)}L${px(11)} ${py(2.4)} M${px(4.4)} ${py(7.2)}L${px(7.2)} ${py(4.4)}L${px(10)} ${py(7.2)}L${px(7.2)} ${py(10)}Z`}));
    }
    deco.push(M().element('line', {name: 'Орнамент слева', x: 77, y: 29, w: 21, h: 0, stroke: PALE, strokeWidth: pt(0.45)}));
    deco.push(M().element('line', {name: 'Орнамент справа', x: 112, y: 29, w: 21, h: 0, stroke: PALE, strokeWidth: pt(0.45)}));
    deco.push(M().element('path', {name: 'Ромб', x: 102.8, y: 26.8, w: 4.4, h: 4.4, d: 'M2.2 0L4.4 2.2L2.2 4.4L0 2.2Z', stroke: INK, strokeWidth: pt(0.6), fill: ''}));
    doc.sides[0].elements = [...deco, ...diplomaTexts(INK)];
    diplomaData(doc);
    doc.title = 'Дипломы · классический';
    return doc;
  }
  async function diplomaFrost() {
    const INK = '#263f58';
    const doc = M().blankDoc('diploma', 'Дипломы · первый иней', {width: 210, height: 297});
    const bg = await asset(doc, 'presets/assets/frost-background.jpg', 'Первый иней.jpg');
    const dep = await asset(doc, 'presets/assets/logo-department.png', 'Логотип кафедры.png');
    const uni = await asset(doc, 'presets/assets/logo-university.png', 'Логотип ТюмГУ.png');
    doc.sides[0].elements = [
      M().element('image', {name: 'Иней', src: 'asset:' + bg.id, fit: 'stretch', x: 10, y: 10, w: 190, h: 277, opacity: 0.42, locked: true}),
      M().element('rect', {name: 'Белое поле', x: 18, y: 17, w: 174, h: 262, fill: '#ffffff', stroke: '', strokeWidth: 0, locked: true}),
      M().element('image', {name: 'Логотип кафедры', src: 'asset:' + dep.id, fit: 'contain', x: 26, y: 20, w: 48, h: 19.5}),
      M().element('image', {name: 'Логотип ТюмГУ', src: 'asset:' + uni.id, fit: 'contain', x: 147, y: 20, w: 35, h: 20}),
      ...diplomaTexts(INK)
    ];
    diplomaData(doc);
    return doc;
  }

  async function bookmarks() {
    const doc = M().blankDoc('bookmark', 'Закладки с цитатами', {width: 65, height: 140});
    doc.sides.push(M().side('back', 'Оборот'));
    const rows = await XS.fetchJson('presets/assets/bookmark-quotes.json');
    doc.data.columns = [{id: 'c-author', name: 'Автор'}, {id: 'c-quote', name: 'Цитата'}, {id: 'c-photo', name: 'Фото', type: 'image'}];
    for (const r of rows) {
      const a = await asset(doc, r['Фото'], r['Автор'] + '.jpg');
      M().addRow(doc, {'Автор': r['Автор'], 'Цитата': r['Цитата'], 'Фото': 'asset:' + a.id});
    }
    const INK = '#1f2b3a';
    doc.sides[0].elements = [
      M().element('rect', {name: 'Рамка', x: 3, y: 3, w: 59, h: 134, fill: '', stroke: INK, strokeWidth: 0.25, radius: 2}),
      M().element('image', {name: 'Портрет', src: '{Фото}', fit: 'cover', shape: 'ellipse', x: 17.5, y: 9, w: 30, h: 30}),
      T({name: 'Автор', text: '{Автор}', font: 'Montserrat', bold: true, size: 11, minSize: 7, color: INK, x: 6, y: 42, w: 53, h: 12}),
      M().element('line', {name: 'Линия', x: 27.5, y: 56, w: 10, h: 0, stroke: '#8aa0b6', strokeWidth: 0.3}),
      T({name: 'Цитата', text: '{Цитата}', font: 'PT Serif', italic: true, size: 11, minSize: 7, lineHeight: 1.25, color: INK, align: 'left', valign: 'top', x: 7, y: 60, w: 51, h: 66}),
      T({name: 'Подпись', text: 'День социолога · ТюмГУ', font: 'PT Sans', size: 7, color: '#5b6b7c', x: 6, y: 129, w: 53, h: 5})
    ];
    const bg = await asset(doc, 'presets/assets/frost-background.jpg', 'Первый иней.jpg');
    const pair = await asset(doc, 'presets/assets/logo-pair.png', 'Логотипы.png');
    doc.sides[1].background = {asset: bg.id, page: 1, fit: 'cover', opacity: 1};
    doc.sides[1].elements = [
      M().element('rect', {name: 'Белое поле', x: 6, y: 30, w: 53, h: 80, fill: '#ffffff', stroke: '', strokeWidth: 0, radius: 3, opacity: 0.92}),
      T({name: 'Поздравление', text: 'С Днём\nсоциолога!', font: 'Lobster', size: 24, color: INK, x: 9, y: 40, w: 47, h: 36}),
      M().element('image', {name: 'Логотипы', src: 'asset:' + pair.id, fit: 'contain', x: 10, y: 84, w: 45, h: 12})
    ];
    doc.output.naming = '{№} {Автор}';
    doc.output.paper = 'a4';
    doc.output.gap = 0;
    return doc;
  }

  async function blankCard() {
    const doc = M().blankDoc('card', 'Открытки', {width: 105, height: 148});
    doc.sides[0].elements = [T({name: 'Имя', text: '{ФИО}', font: 'PT Serif', size: 20, bold: true, x: 10, y: 60, w: 85, h: 28})];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович'});
    return doc;
  }

  /* Новый проект из PDF-шаблона: размер страницы берётся из PDF, страницы 1 и 2 — лицо и оборот. */
  async function fromPdf(file, kind = 'custom') {
    const a = await XS.Assets.fromFile(file);
    const page = a.pages ? a.pages[0] : {width: 210, height: 297};
    const title = file.name.replace(/\.[^.]+$/, '');
    const doc = M().blankDoc(kind, title, {width: +page.width.toFixed(2), height: +page.height.toFixed(2)});
    const stored = M().addAsset(doc, a);
    doc.sides[0].background = {asset: stored.id, page: 1, fit: 'stretch', opacity: 1};
    if (a.pages && a.pages.length > 1) { const back = M().side('back', 'Оборот'); back.background = {asset: stored.id, page: 2, fit: 'stretch', opacity: 1}; doc.sides.push(back); }
    const w = page.width * 0.8;
    doc.sides[0].elements = [T({name: 'ФИО', text: '{ФИО}', font: 'PT Serif', bold: true, size: Math.max(14, Math.round(page.width / 8)), x: (page.width - w) / 2, y: page.height * 0.42, w, h: page.height * 0.12})];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович'});
    doc.output.naming = '{№} {ФИО}';
    return doc;
  }

  const LIST = [
    {id: 'invitation', kind: 'invitation', title: 'Пригласительные', hint: 'А5 · макет Дня социолога · обращение по полу', make: invitation},
    {id: 'diploma-classic', kind: 'diploma', title: 'Диплом · классический', hint: 'А4 · рамка · место и основание', make: diplomaClassic},
    {id: 'diploma-frost', kind: 'diploma', title: 'Диплом · первый иней', hint: 'А4 · фон и логотипы', make: diplomaFrost},
    {id: 'bookmarks', kind: 'bookmark', title: 'Закладки с цитатами', hint: '65×140 · 46 цитат с портретами · две стороны', make: bookmarks},
    {id: 'card', kind: 'card', title: 'Открытка', hint: 'А6 · пустой макет', make: blankCard}
  ];
  XS.Presets = {LIST, fromPdf, invitation, diplomaClassic, diplomaFrost, bookmarks, blankCard};
})(typeof window !== 'undefined' ? window : globalThis);
