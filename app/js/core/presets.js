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

  /* ---------- шаблоны v4 ---------- */
  const INDIGO = '#023bb9', INK = '#11172c', SOFT = '#ebf0fd', MUTED = '#5b6474';
  const R = props => M().element('rect', {stroke: '', strokeWidth: 0, ...props});

  /* Бейдж 70×100: фото из столбца (или буквы имени), фамилия крупно, роль, организация, QR. */
  async function badge() {
    const doc = M().blankDoc('badge', 'Бейджи участников', {width: 70, height: 100});
    const F = {font: 'Montserrat', color: INK};
    doc.sides[0].elements = [
      R({name: 'Шапка', x: 0, y: 0, w: 70, h: 26, fill: INDIGO, locked: true}),
      T({...F, name: 'Мероприятие', text: 'Форум молодых социологов · 2026', x: 5, y: 3, w: 60, h: 9, size: 8.5, bold: true, color: '#ffffff', minSize: 6}),
      R({name: 'Кольцо фото', shape: 'ellipse', x: 19, y: 13, w: 32, h: 32, fill: '#ffffff'}),
      M().element('image', {name: 'Фото', src: '{Фото}', fit: 'cover', shape: 'ellipse', x: 20, y: 14, w: 30, h: 30, showIf: {field: 'Фото', op: 'filled', value: ''}}),
      R({name: 'Без фото', shape: 'ellipse', x: 20, y: 14, w: 30, h: 30, fill: SOFT, showIf: {field: 'Фото', op: 'empty', value: ''}}),
      T({...F, name: 'Буквы', text: '{ФИО:буквы}', x: 20, y: 14, w: 30, h: 30, size: 26, bold: true, color: INDIGO, showIf: {field: 'Фото', op: 'empty', value: ''}}),
      T({...F, name: 'Фамилия', text: '{ФИО:фамилия:верх}', x: 4, y: 48, w: 62, h: 10, size: 16, bold: true, minSize: 9, letterSpacing: 0.6}),
      T({...F, name: 'Имя и отчество', text: '{ФИО:имя отчество}', x: 4, y: 58, w: 62, h: 8, size: 11, minSize: 7}),
      R({name: 'Плашка роли', x: 10, y: 69, w: 50, h: 9, radius: 4.5, fill: SOFT}),
      T({...F, name: 'Роль', text: '{Роль|Участник}', x: 10, y: 69, w: 50, h: 9, size: 9.5, bold: true, color: INDIGO, minSize: 6, uppercase: true, letterSpacing: 0.8}),
      M().element('qr', {name: 'QR-код', data: '{Ссылка}', x: 4, y: 82, w: 14, h: 14, quiet: 0, showIf: {field: 'Ссылка', op: 'filled', value: ''}}),
      T({...F, name: 'Организация', text: '{Организация}', x: 20, y: 82, w: 46, h: 14, size: 8, color: MUTED, align: 'left', minSize: 6, empty: {mode: 'hide'}})
    ];
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-role', name: 'Роль'}, {id: 'c-org', name: 'Организация'}, {id: 'c-link', name: 'Ссылка'}, {id: 'c-photo', name: 'Фото', type: 'image'}];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович', 'Роль': 'Спикер', 'Организация': 'Тюменский государственный университет', 'Ссылка': 'https://o.utmns.ru'});
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Роль': '', 'Организация': 'Уральский федеральный университет', 'Ссылка': ''});
    M().addRow(doc, {'ФИО': 'Сидоров Пётр Алексеевич', 'Роль': 'Организатор', 'Организация': 'Кафедра общей и экономической социологии', 'Ссылка': 'https://o.utmns.ru'});
    doc.output.packaging = 'sheets'; doc.output.cutMarks = true; doc.output.gap = 2;
    return doc;
  }

  /* Сертификат участника, А4 альбомный: номер, слово по полу, повернутая надпись на полосе, QR для проверки. */
  async function certificate() {
    const doc = M().blankDoc('certificate', 'Сертификаты участников', {width: 297, height: 210});
    const F = {font: 'Montserrat', color: INK, x: 40, w: 240};
    doc.sides[0].elements = [
      R({name: 'Полоса', x: 0, y: 0, w: 24, h: 210, fill: INDIGO, locked: true}),
      T({name: 'Надпись на полосе', text: 'СОЦИОЛОГИЯ БУДУЩЕГО · 2026', font: 'Montserrat', bold: true, size: 11, color: '#ffffff', letterSpacing: 3, x: -93, y: 99, w: 210, h: 12, rotate: -90}),
      M().element('rect', {name: 'Рамка', x: 32, y: 10, w: 255, h: 190, fill: '', stroke: '#c9ccff', strokeWidth: 0.5, locked: true}),
      T({...F, name: 'Заголовок', text: 'СЕРТИФИКАТ', y: 26, h: 20, size: 40, bold: true, letterSpacing: 5, color: INDIGO}),
      T({...F, name: 'Номер', text: '№ {№:0000}', y: 47, h: 7, size: 10, color: MUTED, letterSpacing: 1}),
      T({...F, name: 'Подтверждает', text: 'подтверждает, что', y: 62, h: 9, size: 13, font: 'PT Serif', italic: true, color: MUTED}),
      T({...F, name: 'Получатель', text: '{ФИО}', y: 73, h: 22, size: 30, bold: true, font: 'PT Serif', minSize: 16, empty: {mode: 'lines', lines: 1, color: '#9aa1ad', width: 0.3}}),
      T({...F, name: 'Участие', text: '{ФИО:принял/приняла} участие в научно-практической конференции\n«Социология будущего»', y: 100, h: 20, size: 14, lineHeight: 1.35}),
      T({...F, name: 'Статус', text: '{Статус}', y: 122, h: 9, size: 12, bold: true, color: INDIGO, empty: {mode: 'hide'}}),
      M().element('line', {name: 'Линия подписи', x: 160, y: 172, w: 70, h: 0, stroke: INK, strokeWidth: 0.3}),
      T({name: 'Подписант', text: 'Председатель оргкомитета\nИ. О. Фамилия', font: 'Montserrat', size: 9, color: MUTED, x: 160, y: 174, w: 70, h: 12}),
      T({name: 'Дата', text: 'г. Тюмень, {Дата:длинная}', font: 'Montserrat', size: 9.5, color: MUTED, align: 'left', x: 44, y: 176, w: 100, h: 8}),
      M().element('qr', {name: 'QR проверки', data: '{Ссылка}', x: 251, y: 160, w: 26, h: 26, quiet: 0, showIf: {field: 'Ссылка', op: 'filled', value: ''}})
    ];
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-status', name: 'Статус'}, {id: 'c-link', name: 'Ссылка'}];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович', 'Статус': 'в качестве докладчика', 'Ссылка': 'https://o.utmns.ru/?cert=0001'});
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Статус': '', 'Ссылка': 'https://o.utmns.ru/?cert=0002'});
    M().addRow(doc, {'ФИО': 'Ким Александра Викторовна', 'Статус': 'в качестве слушателя', 'Ссылка': ''});
    return doc;
  }

  /* Благодарственное письмо А4: «Уважаемый/ая», имя-отчество, дательный падеж, дата прописью. */
  async function thanks() {
    const doc = M().blankDoc('letter', 'Благодарственные письма', {width: 210, height: 297});
    const F = {font: 'PT Serif', color: INK, x: 25, w: 160};
    doc.sides[0].elements = [
      R({name: 'Верхняя полоса', x: 0, y: 0, w: 210, h: 8, fill: INDIGO, locked: true}),
      R({name: 'Нижняя полоса', x: 0, y: 289, w: 210, h: 8, fill: INDIGO, locked: true}),
      T({...F, name: 'Организация', text: 'Тюменский государственный университет\nКафедра общей и экономической социологии', y: 22, h: 14, size: 10.5, font: 'Montserrat', color: MUTED, lineHeight: 1.35}),
      T({...F, name: 'Заголовок', text: 'БЛАГОДАРНОСТЬ', y: 52, h: 20, size: 36, font: 'Montserrat', bold: true, letterSpacing: 3, color: INDIGO}),
      M().element('line', {name: 'Разделитель', x: 90, y: 78, w: 30, h: 0, stroke: INDIGO, strokeWidth: 0.6}),
      T({...F, name: 'Обращение', text: 'Уважаем{ФИО:ый/ая} {ФИО:имя отчество}!', y: 92, h: 14, size: 20, bold: true, minSize: 12}),
      T({...F, name: 'Текст', text: 'Кафедра выражает искреннюю благодарность {ФИО:дат} за {За что|активное участие в жизни кафедры}.\n\nЖелаем дальнейших успехов, вдохновения и новых открытий!', y: 114, h: 80, size: 15, lineHeight: 1.45, valign: 'top', minSize: 10, accent: {enabled: true, fields: 'ФИО', font: '', size: 0, bold: true, italic: false, color: ''}}),
      T({name: 'Должность', text: 'Заведующий кафедрой', font: 'Montserrat', size: 10.5, color: INK, align: 'left', x: 25, y: 238, w: 70, h: 8}),
      M().element('line', {name: 'Линия подписи', x: 100, y: 244, w: 40, h: 0, stroke: INK, strokeWidth: 0.3}),
      T({name: 'Подписант', text: 'И. О. Фамилия', font: 'Montserrat', size: 10.5, color: INK, align: 'right', x: 145, y: 238, w: 40, h: 8}),
      T({name: 'Город и дата', text: 'г. Тюмень · {Дата:длинная}', font: 'Montserrat', size: 9.5, color: MUTED, x: 25, y: 270, w: 160, h: 7})
    ];
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-sex', name: 'Пол'}, {id: 'c-for', name: 'За что'}];
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Пол': '', 'За что': 'помощь в организации Дня социолога'});
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович', 'Пол': '', 'За что': ''});
    return doc;
  }

  /* Карточка рассадки (тейбл-тент) 210×99: складывается пополам, верхняя половина повёрнута на 180°. */
  async function tent() {
    const doc = M().blankDoc('tent', 'Карточки рассадки', {width: 210, height: 99});
    const F = {font: 'Montserrat', color: INK, x: 15, w: 180};
    const half = (suffix, flip) => {
      const y = v => (flip ? +(99 - v).toFixed(2) : v), r = flip ? {rotate: 180} : {};
      return [
        R({name: 'Полоса' + suffix, x: 0, y: flip ? 0 : 93, w: 210, h: 6, fill: INDIGO, ...r}),
        T({...F, name: 'Имя' + suffix, text: '{ФИО:иф}', y: y(82) - (flip ? 0 : 24), h: 24, size: 32, bold: true, minSize: 14, ...r}),
        T({...F, name: 'Организация' + suffix, text: '{Организация}', y: flip ? y(92) : 82, h: 10, size: 13, color: MUTED, empty: {mode: 'hide'}, ...r})
      ];
    };
    doc.sides[0].elements = [
      ...half(' (лицо)', false),
      ...half(' (с обратной стороны)', true),
      M().element('line', {name: 'Линия сгиба', x: 0, y: 49.5, w: 210, h: 0, stroke: '#c9ccff', strokeWidth: 0.25, dash: 1.5, locked: true})
    ];
    doc.data.columns = [{id: 'c-fio', name: 'ФИО'}, {id: 'c-org', name: 'Организация'}];
    M().addRow(doc, {'ФИО': 'Иванов Иван Иванович', 'Организация': 'ТюмГУ'});
    M().addRow(doc, {'ФИО': 'Петрова Анна Сергеевна', 'Организация': 'УрФУ'});
    doc.output.packaging = 'sheets'; doc.output.cutMarks = true;
    return doc;
  }

  /* Билет 180×65 с корешком: ряд и место из таблицы, сквозной номер, повёрнутый штрихкод на корешке. */
  async function ticket() {
    const doc = M().blankDoc('ticket', 'Билеты', {width: 180, height: 65});
    const W = '#ffffff', PALE = '#c9ccff', L = {font: 'Montserrat', align: 'left', x: 10, w: 124};
    doc.sides[0].elements = [
      R({name: 'Фон', x: 0, y: 0, w: 180, h: 65, fill: INK, locked: true}),
      R({name: 'Акцент', x: 0, y: 0, w: 4, h: 65, fill: INDIGO, locked: true}),
      T({...L, name: 'Событие', text: 'Вечер социолога', y: 7, h: 13, size: 22, bold: true, color: W, minSize: 12}),
      T({...L, name: 'Когда и где', text: '12 ноября 2026, 18:00 · Актовый зал ТюмГУ, ул. Ленина, 16', y: 21, h: 7, size: 9, color: PALE, minSize: 6}),
      T({...L, name: 'Ряд и место', text: 'Ряд {Ряд|—} · Место {Место|—}', y: 33, h: 11, size: 16, bold: true, color: W}),
      T({...L, name: 'Гость', text: '{ФИО}', y: 45, h: 7, size: 10, color: PALE, empty: {mode: 'hide'}}),
      T({...L, name: 'Номер', text: '№ {№:0000}', y: 54, h: 6, size: 8, color: '#8a90a6', letterSpacing: 1}),
      M().element('line', {name: 'Линия отрыва', x: 140, y: 3, w: 0, h: 59, stroke: '#8a90a6', strokeWidth: 0.3, dash: 1.2, locked: true}),
      R({name: 'Поле штрихкода', x: 145, y: 3, w: 32, h: 59, fill: W, radius: 2}),
      M().element('barcode', {name: 'Штрихкод', data: '{№:000000}', x: 133.5, y: 23.5, w: 55, h: 18, rotate: 90, background: '', textSize: 7})
    ];
    doc.data.columns = [{id: 'c-row', name: 'Ряд'}, {id: 'c-seat', name: 'Место'}, {id: 'c-fio', name: 'ФИО'}];
    for (let i = 0; i < 8; i++) M().addRow(doc, {'Ряд': String(1 + Math.floor(i / 4)), 'Место': String(1 + i % 4), 'ФИО': i === 0 ? 'Иванов Иван Иванович' : ''});
    doc.output.packaging = 'sheets'; doc.output.cutMarks = true; doc.output.margin = 8;
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
    {id: 'badge', kind: 'badge', title: 'Бейджи участников', hint: '70×100 · фото или буквы имени · роль · QR', make: badge, isNew: true},
    {id: 'certificate', kind: 'certificate', title: 'Сертификат участника', hint: 'А4 альбомный · номер · «принял/приняла» · QR проверки', make: certificate, isNew: true},
    {id: 'thanks', kind: 'letter', title: 'Благодарственное письмо', hint: 'А4 · «Уважаемый/ая» · дательный падеж · дата словами', make: thanks, isNew: true},
    {id: 'tent', kind: 'tent', title: 'Карточки рассадки', hint: 'Тейбл-тент 210×99 · читается с двух сторон', make: tent, isNew: true},
    {id: 'ticket', kind: 'ticket', title: 'Билеты с корешком', hint: '180×65 · ряд и место · номер · штрихкод', make: ticket, isNew: true},
    {id: 'card', kind: 'card', title: 'Открытка', hint: 'А6 · пустой макет', make: blankCard}
  ];
  XS.Presets = {LIST, fromPdf, invitation, diplomaClassic, diplomaFrost, bookmarks, blankCard, badge, certificate, thanks, tent, ticket};
})(typeof window !== 'undefined' ? window : globalThis);
