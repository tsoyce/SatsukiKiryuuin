/* XSatsu Студия · правая панель: свойства выделенного элемента или макета (размер, фон, шрифты). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  let box; // текущий контейнер, куда добавляются поля

  /* ---------- конструктор полей ---------- */
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function section(title) { box.append(h('h3', '', XS.esc(title))); }
  function row(label, ...controls) { const l = h('label', 'f'); if (controls.some(c => c?.classList?.contains('long'))) l.classList.add('f-stack'); l.append(h('span', '', XS.esc(label))); const r = h('div', 'row'); r.append(...controls); l.append(r); box.append(l); return l; }
  function apply(fn, key) { UI.edit(fn, key, {skip: ['inspector']}); }
  function numInput(value, set, key, {step = 0.5, min = -9999, max = 9999, width} = {}) {
    const i = h('input'); i.type = 'number'; i.step = step; i.min = min; i.max = max; i.value = +(+value).toFixed(2);
    if (width) i.style.width = width;
    i.oninput = () => { if (i.value === '' || !isFinite(+i.value)) return; apply(() => set(XS.clamp(+i.value, min, max)), key); };
    return i;
  }
  function textInput(value, set, key) { const i = h('input'); i.type = 'text'; i.value = value ?? ''; i.oninput = () => apply(() => set(i.value), key); return i; }
  function colorInput(value, set, key, optional = false) {
    const wrap = h('span', 'row');
    const c = h('input'); c.type = 'color'; c.value = value || '#000000';
    c.oninput = () => { apply(() => set(c.value), key); if (none) none.checked = false; };
    wrap.append(c);
    let none;
    if (optional) {
      const l = h('label', 'check small'); none = h('input'); none.type = 'checkbox'; none.checked = !value;
      none.onchange = () => apply(() => set(none.checked ? '' : c.value), key);
      l.append(none, document.createTextNode('нет')); wrap.append(l);
    }
    return wrap;
  }
  function select(options, value, set, key) {
    const s = h('select');
    for (const [v, label] of options) { const o = new Option(label, v); if (String(v) === String(value)) o.selected = true; s.add(o); }
    s.onchange = () => apply(() => set(s.value), key);
    return s;
  }
  function seg(options, value, set, key, {multi = false} = {}) {
    const s = h('div', 'seg');
    // Переключатель со словами («как есть / линии / скрыть») не влезает рядом с подписью — ставим его под неё на всю ширину.
    if (options.reduce((n, [, label]) => n + (/^</.test(String(label)) ? 2 : String(label).length + 2), 0) > 16) s.classList.add('long');
    for (const [v, label, title] of options) {
      const b = h('button', '', label); b.type = 'button'; if (title) b.title = title;
      const on = multi ? !!value[v] : value === v;
      b.classList.toggle('on', on);
      b.onclick = () => { apply(() => set(v, !b.classList.contains('on')), key); if (multi) b.classList.toggle('on'); else { s.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); } };
      s.append(b);
    }
    return s;
  }
  function check(label, value, set, key) { const l = h('label', 'check'); const c = h('input'); c.type = 'checkbox'; c.checked = !!value; c.onchange = () => apply(() => set(c.checked), key); l.append(c, document.createTextNode(label)); return l; }
  function button(label, onclick, cls = 'btn small') { const b = h('button', cls, label); b.type = 'button'; b.onclick = UI.safe(onclick); return b; }
  function filePicker(accept, onFile) { const i = h('input'); i.type = 'file'; i.accept = accept; i.onchange = UI.safe(async () => { if (i.files[0]) await onFile(i.files[0]); }); i.click(); }
  function fontOptions() { return XS.Fonts.families(S.doc).map(f => [f.family, f.family + ' · ' + f.category]); }
  /* Гарнитура — кнопка с названием, набранным самим шрифтом; открывает окно «Шрифты» (font-picker.js). */
  function fontPick(value, set, key, o = {}) { return UI.fontButton ? UI.fontButton(value, v => apply(() => set(v), key), o) : select([...(o.allowEmpty ? [['', o.allowEmpty]] : []), ...fontOptions()], value, set, key); }
  function assetCard(asset, extra = '') {
    const c = h('div', 'asset-card');
    c.innerHTML = (asset && !XS.Assets.isPdf(asset) ? `<img src="${asset.data}" alt="">` : `<div class="pdf">${asset ? 'PDF' : '—'}</div>`) +
      `<div class="meta"><b>${asset ? XS.esc(asset.name) : 'не выбран'}</b>${XS.esc(extra)}</div>`;
    return c;
  }

  /* Конструктор «поле + форма»: {ФИО:дат}, {ФИО:инициалы}, {Место:верх}. */
  function formBuilder(ta) {
    const wrap = h('div', 'form-builder');
    const cols = UI.fieldNames().filter(n => n !== 'Проект');
    const field = h('select'); for (const n of cols) field.add(new Option('{' + n + '}', n));
    const form = h('select'); for (const [m, label] of [...XS.Names.HINTS, ...(XS.Formats?.HINTS || [])]) form.add(new Option(label, m));
    const go = h('button', 'btn small', 'Вставить'); go.type = 'button';
    go.title = 'Склонение по падежам и формы имени работают для ФИО; пол берётся из столбца «Пол» или угадывается.';
    go.onclick = () => { const t = '{' + field.value + ':' + form.value + '}'; const st = ta.selectionStart ?? ta.value.length; ta.setRangeText(t, st, ta.selectionEnd ?? st, 'end'); ta.dispatchEvent(new Event('input')); ta.focus(); };
    wrap.append(h('span', 'muted small', 'Падеж, форма, формат:'), field, form, go);
    return wrap;
  }

  /* ---------- элемент ---------- */
  function renderElement(el) {
    const key = p => el.id + ':' + p;
    const title = h('div', 'insp-title');
    title.insertAdjacentHTML('beforeend', XS.Icons.icon({text: 'text', image: 'image', rect: el.shape === 'ellipse' ? 'ellipse' : 'rect', line: 'line', path: 'path', qr: 'qr', barcode: 'barcode'}[el.type], 18));
    const nameInput = textInput(el.name, v => { el.name = v; }, key('name'));
    nameInput.id = 'inspName'; nameInput.title = 'Название слоя (F2)';
    title.append(nameInput);
    box.append(title);
    const grp = UI.Sel.groupOf(el);
    if (grp) {
      const note = h('div', 'group-note', XS.Icons.icon('group', 14) + ' В группе «' + XS.esc(grp.name) + '»');
      note.append(button('Выделить группу', () => UI.select(UI.Sel.members(grp.id).map(m => m.id)), 'btn small ghost'));
      box.append(note);
    }

    if (el.type === 'text') {
      section('Текст');
      const ta = h('textarea'); ta.id = 'inspText'; ta.rows = Math.min(8, Math.max(3, el.text.split('\n').length + 1)); ta.value = el.text;
      ta.oninput = () => apply(() => { el.text = ta.value; }, key('text'));
      box.append(ta);
      const chips = h('div', 'chips');
      chips.append(h('span', 'muted small', 'Вставить поле:'));
      for (const name of UI.fieldNames()) {
        const c = h('button', 'chip', '{' + XS.esc(name) + '}'); c.type = 'button';
        c.title = 'Значение из таблицы для каждой записи';
        c.onclick = () => { const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s; ta.setRangeText('{' + name + '}', s, e, 'end'); ta.dispatchEvent(new Event('input')); ta.focus(); };
        chips.append(c);
      }
      box.append(chips);
      box.append(formBuilder(ta));
      section('Шрифт');
      row('Гарнитура', fontPick(el.font, v => { el.font = v; }, key('font')));
      row('Размер, pt', numInput(el.size, v => { el.size = v; el.minSize = Math.min(el.minSize, v); }, key('size'), {step: 0.5, min: 2, max: 400}),
        seg([['bold', 'Ж', 'Полужирный'], ['italic', 'К', 'Курсив'], ['uppercase', 'АА', 'Все прописные']], el, (p, on) => { el[p] = on; }, key('style'), {multi: true}));
      row('Цвет', colorInput(el.color, v => { el.color = v; }, key('color')));
      row('По горизонт.', seg([['left', '⟸', 'Влево'], ['center', '⟺', 'По центру'], ['right', '⟹', 'Вправо']], el.align, v => { el.align = v; }, key('align')));
      row('По вертикали', seg([['top', 'верх'], ['middle', 'центр'], ['bottom', 'низ']], el.valign, v => { el.valign = v; }, key('valign')));
      row('Интерлиньяж', numInput(el.lineHeight, v => { el.lineHeight = v; }, key('lh'), {step: 0.05, min: 0.6, max: 4}));
      row('Разрядка, pt', numInput(el.letterSpacing, v => { el.letterSpacing = v; }, key('ls'), {step: 0.1, min: -5, max: 50}));
      row('Не влезает', check('уменьшать до', el.autoFit, v => { el.autoFit = v; }, key('fit')), numInput(el.minSize, v => { el.minSize = v; }, key('min'), {step: 0.5, min: 2, max: el.size}), h('span', 'muted small', 'pt'));

      section('Выделение подставленных полей');
      const a = el.accent;
      box.append(check('Писать значения полей другим стилем', a.enabled, v => { a.enabled = v; UI.Inspector.render(); }, key('acc')));
      if (a.enabled) {
        const prev = box; box = h('div', 'sub'); prev.append(box);
        row('Какие поля', textInput(a.fields, v => { a.fields = v; }, key('accf'))).title = 'Через запятую. Пусто — все поля.';
        row('Гарнитура', fontPick(a.font, v => { a.font = v; }, key('accfont'), {allowEmpty: 'как основной'}));
        row('Размер, pt', numInput(a.size, v => { a.size = v; }, key('accsize'), {min: 0, max: 400}), seg([['bold', 'Ж'], ['italic', 'К']], a, (p, on) => { a[p] = on; }, key('accst'), {multi: true}));
        row('Цвет', colorInput(a.color, v => { a.color = v; }, key('acccol'), true));
        box = prev;
      }
      section('Если поля пустые');
      const em = el.empty;
      row('Показывать', seg([['keep', 'как есть'], ['lines', 'линии'], ['hide', 'скрыть']], em.mode, v => { em.mode = v; UI.Inspector.render(); }, key('empty')));
      if (em.mode === 'lines') row('Линий', numInput(em.lines, v => { em.lines = Math.round(v); }, key('emptyn'), {step: 1, min: 1, max: 20}), colorInput(em.color, v => { em.color = v; }, key('emptyc')));
      box.append(h('p', 'note', 'Пустая запись (без ФИО и т. п.) печатается как бланк: с линиями для заполнения от руки или без блока.'));
    }

    if (el.type === 'image') {
      section('Изображение');
      const fromColumn = /^\{.+\}$/.test(el.src);
      row('Источник', seg([['file', 'файл'], ['column', 'из столбца']], fromColumn ? 'column' : 'file', v => {
        if (v === 'column') { const c = S.doc.data.columns.find(x => x.type === 'image') || S.doc.data.columns[0]; el.src = '{' + (c ? c.name : 'Фото') + '}'; }
        else el.src = '';
        UI.Inspector.render();
      }, key('srcmode')));
      if (fromColumn) {
        row('Столбец', select(S.doc.data.columns.map(c => [c.name, c.name + (c.type === 'image' ? '' : ' (текст)')]), el.src.slice(1, -1), v => { el.src = '{' + v + '}'; }, key('srccol')));
        box.append(h('p', 'note', 'Своя картинка для каждой записи: тип столбца «картинка», файл выбирается в форме записи.'));
      } else {
        const asset = /^asset:/.test(el.src) ? S.doc.assets[el.src.slice(6)] : null;
        box.append(assetCard(asset));
        box.append(button('Заменить файл…', () => filePicker('image/*,.pdf', async f => { const a = await XS.Assets.fromFile(f); UI.edit(d => { el.src = 'asset:' + XS.Model.addAsset(d, a).id; }); })));
      }
      row('Вписать', seg([['contain', 'целиком'], ['cover', 'заполнить'], ['stretch', 'растянуть']], el.fit, v => { el.fit = v; }, key('fit')));
      row('Форма', seg([['rect', 'прямоуг.'], ['ellipse', 'овал']], el.shape, v => { el.shape = v; }, key('shape')));
    }
    if (el.type === 'rect') {
      section('Фигура');
      row('Форма', seg([['rect', 'прямоуг.'], ['ellipse', 'овал']], el.shape, v => { el.shape = v; }, key('shape')));
      row('Заливка', colorInput(el.fill, v => { el.fill = v; }, key('fill'), true));
      row('Обводка', colorInput(el.stroke, v => { el.stroke = v; }, key('stroke'), true));
      row('Толщина, мм', numInput(el.strokeWidth, v => { el.strokeWidth = v; }, key('sw'), {step: 0.05, min: 0, max: 20}));
      if (el.shape !== 'ellipse') row('Скругление, мм', numInput(el.radius, v => { el.radius = v; }, key('radius'), {step: 0.5, min: 0, max: 500}));
    }
    if (el.type === 'line') {
      section('Линия');
      row('Цвет', colorInput(el.stroke, v => { el.stroke = v; }, key('stroke')));
      row('Толщина, мм', numInput(el.strokeWidth, v => { el.strokeWidth = v; }, key('sw'), {step: 0.05, min: 0.05, max: 20}));
      row('Пунктир, мм', numInput(el.dash, v => { el.dash = v; }, key('dash'), {step: 0.5, min: 0, max: 50}));
    }
    if (el.type === 'path') {
      section('Контур (SVG, мм)');
      const ta = h('textarea'); ta.rows = 3; ta.value = el.d; ta.oninput = () => apply(() => { el.d = ta.value; }, key('d')); box.append(ta);
      row('Заливка', colorInput(el.fill, v => { el.fill = v; }, key('fill'), true));
      row('Обводка', colorInput(el.stroke, v => { el.stroke = v; }, key('stroke'), true));
      row('Толщина, мм', numInput(el.strokeWidth, v => { el.strokeWidth = v; }, key('sw'), {step: 0.05, min: 0, max: 20}));
    }

    if (el.type === 'qr') {
      section('QR-код');
      const ta = h('textarea'); ta.rows = 2; ta.value = el.data; ta.placeholder = 'https://… или {Ссылка}';
      ta.oninput = () => apply(() => { el.data = ta.value; }, key('qrdata'));
      box.append(ta);
      const chips = h('div', 'chips');
      chips.append(h('span', 'muted small', 'Поле:'));
      for (const name of UI.fieldNames()) { const c = h('button', 'chip', '{' + XS.esc(name) + '}'); c.type = 'button'; c.onclick = () => { const st = ta.selectionStart ?? ta.value.length; ta.setRangeText('{' + name + '}', st, ta.selectionEnd ?? st, 'end'); ta.dispatchEvent(new Event('input')); }; chips.append(c); }
      box.append(chips);
      row('Цвет', colorInput(el.color, v => { el.color = v; }, key('qrcol')));
      row('Подложка', colorInput(el.background, v => { el.background = v; }, key('qrbg'), true));
      row('Надёжность', seg([['L', 'L', '7% — самый плотный'], ['M', 'M', '15%'], ['Q', 'Q', '25%'], ['H', 'H', '30% — выдержит потёртости']], el.level, v => { el.level = v; }, key('qrlvl')));
      row('Поле, модулей', numInput(el.quiet, v => { el.quiet = Math.round(v); }, key('qrq'), {step: 1, min: 0, max: 8}));
      box.append(h('p', 'note', 'QR остаётся вектором в PDF. Для печати сторона — от 15 мм; ссылка для каждой записи берётся из поля, например {Ссылка}.'));
    }

    if (el.type === 'barcode') {
      section('Штрихкод');
      row('Вид', seg(XS.Barcode.TYPES, el.symbology, v => { el.symbology = v; UI.Inspector.render(); }, key('bctype')));
      const ta = h('textarea'); ta.rows = 2; ta.value = el.data; ta.placeholder = el.symbology === 'ean13' ? '12 цифр или {Код}' : '{№:000000} или {Номер билета}';
      ta.oninput = () => apply(() => { el.data = ta.value; }, key('bcdata'));
      box.append(ta);
      const chips = h('div', 'chips');
      chips.append(h('span', 'muted small', 'Поле:'));
      for (const name of UI.fieldNames()) { const c = h('button', 'chip', '{' + XS.esc(name) + '}'); c.type = 'button'; c.onclick = () => { const st = ta.selectionStart ?? ta.value.length; ta.setRangeText('{' + name + '}', st, ta.selectionEnd ?? st, 'end'); ta.dispatchEvent(new Event('input')); }; chips.append(c); }
      box.append(chips);
      row('Цвет', colorInput(el.color, v => { el.color = v; }, key('bccol')));
      row('Подложка', colorInput(el.background, v => { el.background = v; }, key('bcbg'), true));
      row('Подпись', check('цифры под кодом', el.showText, v => { el.showText = v; UI.Inspector.render(); }, key('bctext')), el.showText ? numInput(el.textSize, v => { el.textSize = v; }, key('bcts'), {step: 0.5, min: 3, max: 72, width: '64px'}) : h('span'), el.showText ? h('span', 'muted small', 'pt') : h('span'));
      box.append(h('p', 'note', 'Code 128 — латиница и цифры (номер билета, табельный номер); EAN-13 — 12–13 цифр товарного кода. {№:000000} даёт сквозной номер с нулями. Штрихкод остаётся вектором в PDF; ширина модуля — от 0,19 мм.'));
    }

    section('Показывать, если');
    const cond = el.showIf || (el.showIf = {field: '', op: 'filled', value: ''});
    const condRow = row('Поле', select([['', '— всегда —'], ...UI.fieldNames().map(n => [n, '{' + n + '}'])], cond.field, v => { cond.field = v; UI.Inspector.render(); }, key('cf')));
    condRow.title = 'Элемент печатается только для записей, где условие выполнено. Например, «Печать», если {Место} равно «1».';
    if (cond.field) {
      row('Условие', select(XS.Model.CONDITIONS, cond.op, v => { cond.op = v; UI.Inspector.render(); }, key('co')));
      if (['eq', 'neq', 'contains'].includes(cond.op)) row('Значение', textInput(cond.value, v => { cond.value = v; }, key('cv')));
    }

    section('Положение, мм');
    const g = h('div', 'grid4');
    for (const [p, label] of [['x', 'X'], ['y', 'Y'], ['w', 'Ширина'], ['h', 'Высота']]) {
      const l = h('label', '', label);
      const i = numInput(el[p], v => { el[p] = v; }, key('geo'), {step: 0.5, min: p === 'w' || p === 'h' ? 0 : -2000, max: 2000});
      i.dataset.geo = p; l.append(i); g.append(l);
    }
    box.append(g);
    if (el.type !== 'line') {
      const rot = numInput(el.rotate || 0, v => { el.rotate = v; }, key('rot'), {step: 1, min: -360, max: 360, width: '72px'});
      rot.dataset.geo = 'rotate';
      const turn = d => () => UI.edit(() => { let v = ((el.rotate || 0) + d) % 360; if (v > 180) v -= 360; if (v <= -180) v += 360; el.rotate = v; });
      row('Поворот, °', rot, button('⟲ 90°', turn(-90)), button('⟳ 90°', turn(90)), button('0°', () => UI.edit(() => { el.rotate = 0; })));
    }
    box.append(alignBar('Выровнять по странице'));

    section('Печать');
    row('Слой', select([['auto', 'авто (' + (XS.Scene.elementLayer({...el, layer: 'auto'}) === 'text' ? 'текст' : 'цвет') + ')'], ['color', 'цвет / фон (струйный)'], ['text', 'текст / линии (лазер)']], el.layer, v => { el.layer = v; }, key('layer'))).title = 'Для печати в два прохода: фон на струйном, текст на лазерном.';
    row('Непрозрачность', numInput(Math.round(el.opacity * 100), v => { el.opacity = v / 100; }, key('op'), {step: 5, min: 0, max: 100}), h('span', 'muted small', '%'));
    row('', check('видим', el.visible, v => { el.visible = v; }, key('vis')), check('закреплён', el.locked, v => { el.locked = v; }, key('lock')));

    box.append(actionBar());
  }

  /* ---------- макет и сторона ---------- */
  function renderDocument() {
    const doc = S.doc, side = UI.side();
    section('Размер макета');
    const presets = XS.Model.PAGE_PRESETS;
    const match = presets.find(p => (p.width === doc.page.width && p.height === doc.page.height) || (p.width === doc.page.height && p.height === doc.page.width));
    row('Формат', select([...presets.map(p => [p.id, p.label + ' · ' + p.width + '×' + p.height]), ['custom', 'Свой']], match ? match.id : 'custom', v => {
      const p = presets.find(x => x.id === v); if (!p) return;
      const landscape = doc.page.width > doc.page.height;
      doc.page.width = landscape ? p.height : p.width; doc.page.height = landscape ? p.width : p.height;
      UI.Inspector.render(); UI.Stage.fit();
    }, 'page'));
    const g = h('div', 'grid4');
    for (const [p, label] of [['width', 'Ширина'], ['height', 'Высота']]) { const l = h('label', '', label + ', мм'); l.append(numInput(doc.page[p], v => { doc.page[p] = v; }, 'page:' + p, {step: 1, min: 10, max: 2000})); g.append(l); }
    const rot = h('label', '', '&nbsp;'); rot.append(button('⟲ Повернуть', () => { UI.edit(() => { [doc.page.width, doc.page.height] = [doc.page.height, doc.page.width]; }); UI.Stage.fit(); }));
    rot.style.gridColumn = 'span 2'; g.append(rot); box.append(g);
    box.append(h('p', 'note', 'Элементы не сдвигаются при смене размера — поправьте их положение мышью.'));

    section('Сторона «' + side.name + '»');
    row('Название', textInput(side.name, v => { side.name = v; }, 'side:name'));
    const bg = side.background, asset = bg && doc.assets[bg.asset];
    const pages = asset?.pages?.length || 0;
    box.append(assetCard(asset, asset ? (pages ? ' · PDF, страниц: ' + pages : ' · ' + (asset.width || '?') + '×' + (asset.height || '?') + ' px') : ''));
    const acts = h('div', 'insp-actions');
    acts.append(button(asset ? 'Заменить фон…' : 'Загрузить фон (PDF или картинка)…', () => filePicker('.pdf,application/pdf,image/*', f => UI.setBackground(f)), 'btn small primary'));
    if (asset) acts.append(button('Убрать фон', () => UI.edit(() => { side.background = null; })));
    if (asset && pages) acts.append(button('Размер как у PDF', () => { const p = asset.pages[(bg.page || 1) - 1]; UI.edit(() => { doc.page.width = +p.width.toFixed(2); doc.page.height = +p.height.toFixed(2); }); UI.Stage.fit(); }));
    box.append(acts);
    if (asset) {
      if (pages > 1) row('Страница PDF', select(asset.pages.map((p, i) => [i + 1, (i + 1) + ' · ' + Math.round(p.width) + '×' + Math.round(p.height) + ' мм']), bg.page, v => { bg.page = +v; }, 'bg:page'));
      row('Вписать', seg([['stretch', 'растянуть'], ['cover', 'заполнить'], ['contain', 'целиком']], bg.fit, v => { bg.fit = v; }, 'bg:fit'));
      row('Непрозрачность', numInput(Math.round((bg.opacity ?? 1) * 100), v => { bg.opacity = v / 100; }, 'bg:op', {step: 5, min: 0, max: 100}), h('span', 'muted small', '%'));
    }
    box.append(h('p', 'note', 'PDF-шаблон остаётся векторным в выгрузке: текст и графика макета не превращаются в картинку. Файл можно просто перетащить на макет.'));
    if (doc.sides.length > 1) box.append(button('Удалить сторону «' + side.name + '»', () => { if (confirm('Удалить сторону «' + side.name + '» со всеми элементами?')) UI.edit(d => { d.sides.splice(S.side, 1); S.side = 0; S.selection = []; }); }, 'btn small danger'));

    section('Шрифты');
    const fams = XS.Fonts.families(doc).filter(f => f.source !== 'builtin');
    box.append(h('p', 'note', 'Встроенных: ' + XS.Fonts.BUILTIN.length + '.' + (fams.length ? '<br>Добавлены в проект: ' + XS.esc(fams.map(f => f.family).join(', ')) + '.' : ' Добавьте любой из ~300 шрифтов Google Fonts с кириллицей, шрифт с компьютера или свой файл.')));
    const facts = h('div', 'insp-actions');
    facts.append(button('Шрифты проекта…', () => UI.FontPicker.open({tab: 'project'}), 'btn small primary'), button('Google Fonts…', () => UI.FontPicker.open({tab: 'google'})), button('Загрузить файл…', () => filePicker('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', f => UI.addFont(f))));
    box.append(facts);

    section('Подсказки');
    box.append(h('p', 'note', 'Выделите элемент мышью, чтобы изменить его. Стрелки — сдвиг на 0,5 мм (с Shift — 5 мм), Alt при перетаскивании — без привязки, Ctrl+D — копия, Delete — удалить, PageUp/PageDown — соседняя запись, Ctrl+колёсико — масштаб.'));
  }

  /* ---------- общие панели ---------- */
  function alignBar(title) {
    const wrap = h('div', 'align-bar');
    wrap.title = title;
    const mk = (icon, label, run) => { const b = h('button', 'icon-btn', XS.Icons.icon(icon, 17)); b.type = 'button'; b.title = label; b.onclick = UI.safe(run); return b; };
    wrap.append(
      mk('alignLeft', 'По левому краю', () => UI.Sel.align('left')), mk('alignCenterH', 'По центру', () => UI.Sel.align('centerH')), mk('alignRight', 'По правому краю', () => UI.Sel.align('right')),
      h('span', 'sep'),
      mk('alignTop', 'По верху', () => UI.Sel.align('top')), mk('alignCenterV', 'По середине', () => UI.Sel.align('centerV')), mk('alignBottom', 'По низу', () => UI.Sel.align('bottom')));
    if (S.selection.length > 2 || UI.Sel.selectedUnits().length > 2) wrap.append(h('span', 'sep'), mk('distH', 'Распределить по горизонтали', () => UI.Sel.distribute('h')), mk('distV', 'Распределить по вертикали', () => UI.Sel.distribute('v')));
    const outer = h('div', 'f wide');
    outer.append(h('span', '', XS.esc(title)), wrap);
    return outer;
  }
  function actionBar() {
    const acts = h('div', 'insp-actions');
    const n = S.selection.length, grouped = UI.selected().some(e => e.group);
    const b = (icon, label, run, cls = 'btn small', title = '') => { const x = button('', run, cls); x.innerHTML = XS.Icons.icon(icon, 15) + XS.esc(label); if (title) x.title = title; return x; };
    acts.append(b('copy', 'Копия', () => UI.Sel.duplicate(), 'btn small', 'Ctrl+D'));
    if (n > 1) acts.append(b('group', 'Сгруппировать', () => UI.Sel.group(), 'btn small', 'Ctrl+G'));
    if (grouped) acts.append(b('ungroup', 'Разгруппировать', () => UI.Sel.ungroup(), 'btn small', 'Ctrl+Shift+G'));
    acts.append(b('up', 'Выше', () => UI.Sel.order('up'), 'btn small', 'Ctrl+]'), b('down', 'Ниже', () => UI.Sel.order('down'), 'btn small', 'Ctrl+['), b('trash', 'Удалить', () => UI.Sel.remove(), 'btn small danger', 'Delete'));
    return acts;
  }

  /* ---------- несколько элементов ---------- */
  function renderMulti(els) {
    const units = UI.Sel.selectedUnits();
    const head = h('div', 'insp-title');
    head.innerHTML = XS.Icons.icon('layers', 18) + '<b>Выделено: ' + els.length + '</b>' + (units.length !== els.length ? '<span class="muted small">(' + units.length + ' объекта)</span>' : '');
    box.append(head);
    section('Выравнивание');
    box.append(alignBar(units.length === 1 ? 'По странице' : 'Друг относительно друга'));
    const same = (prop) => els.every(e => e[prop] === els[0][prop]) ? els[0][prop] : '';
    const texts = els.filter(e => e.type === 'text');
    if (texts.length === els.length) {
      section('Текст — для всех');
      const set = (prop, v) => UI.edit(() => { for (const e of texts) e[prop] = v; }, 'multi:' + prop, {skip: ['inspector']});
      row('Гарнитура', fontPick(same('font'), v => { if (v) for (const e of texts) e.font = v; }, 'multi:font', {placeholder: '— разные —'}));
      const size = numInput(same('size') || texts[0].size, v => { for (const e of texts) { e.size = v; e.minSize = Math.min(e.minSize, v); } }, 'multi:size', {step: 0.5, min: 2, max: 400});
      const common = {bold: texts.every(e => e.bold), italic: texts.every(e => e.italic), uppercase: texts.every(e => e.uppercase)};
      row('Размер, pt', size, seg([['bold', 'Ж', 'Полужирный'], ['italic', 'К', 'Курсив'], ['uppercase', 'АА', 'Все прописные']], common, (p, on) => { for (const e of texts) e[p] = on; }, 'multi:style', {multi: true}));
      row('Цвет', colorInput(same('color') || texts[0].color, v => { for (const e of texts) e.color = v; }, 'multi:color'));
      row('По горизонт.', seg([['left', '⟸', 'Влево'], ['center', '⟺', 'По центру'], ['right', '⟹', 'Вправо']], same('align'), v => { for (const e of texts) e.align = v; }, 'multi:align'));
      void set;
    }
    section('Печать');
    row('Слой', select([['', '— разные —'], ['auto', 'авто'], ['color', 'цвет / фон (струйный)'], ['text', 'текст / линии (лазер)']], same('layer'), v => { if (v) for (const e of els) e.layer = v; }, 'multi:layer'));
    row('Непрозрачность', numInput(Math.round((same('opacity') === '' ? 1 : same('opacity')) * 100), v => { for (const e of els) e.opacity = v / 100; }, 'multi:op', {step: 5, min: 0, max: 100}), h('span', 'muted small', '%'));
    row('', check('видимы', els.every(e => e.visible), v => { for (const e of els) e.visible = v; }, 'multi:vis'), check('закреплены', els.every(e => e.locked), v => { for (const e of els) e.locked = v; }, 'multi:lock'));
    box.append(actionBar());
    box.append(h('p', 'note', 'Двигайте выделенное вместе мышью или стрелками. Ctrl+G — сгруппировать, чтобы дальше выделять одним кликом.'));
  }

  function render() {
    box = $('inspector');
    const key = S.selection.join(',') || 'doc';
    if (box.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON' && S.lastInspected === key) return;
    S.lastInspected = key;
    box.replaceChildren();
    const els = UI.selected();
    if (els.length > 1) renderMulti(els); else if (els.length === 1) renderElement(els[0]); else renderDocument();
  }
  function updateGeometry() {
    const el = UI.element(); if (!el) return;
    $('inspector').querySelectorAll('[data-geo]').forEach(i => { if (document.activeElement !== i) i.value = +(+(el[i.dataset.geo] || 0)).toFixed(2); });
  }
  function focusText() { const t = $('inspText'); if (t) { t.focus(); t.select(); } }

  UI.Inspector = {render, updateGeometry, focusText};
})(typeof window !== 'undefined' ? window : globalThis);
