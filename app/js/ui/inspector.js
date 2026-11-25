/* XSatsu Студия · правая панель: свойства выделенного элемента или макета (размер, фон, шрифты). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  let box; // текущий контейнер, куда добавляются поля

  /* ---------- конструктор полей ---------- */
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function section(title) { box.append(h('h3', '', XS.esc(title))); }
  function row(label, ...controls) { const l = h('label', 'f'); l.append(h('span', '', XS.esc(label))); const r = h('div', 'row'); r.append(...controls); l.append(r); box.append(l); return l; }
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
  function assetCard(asset, extra = '') {
    const c = h('div', 'asset-card');
    c.innerHTML = (asset && !XS.Assets.isPdf(asset) ? `<img src="${asset.data}" alt="">` : `<div class="pdf">${asset ? 'PDF' : '—'}</div>`) +
      `<div class="meta"><b>${asset ? XS.esc(asset.name) : 'не выбран'}</b>${XS.esc(extra)}</div>`;
    return c;
  }

  /* ---------- элемент ---------- */
  function renderElement(el) {
    const key = p => el.id + ':' + p;
    const title = h('div', 'insp-title');
    title.append(textInput(el.name, v => { el.name = v; }, key('name')));
    box.append(title);

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
      section('Шрифт');
      row('Гарнитура', select(fontOptions(), el.font, v => { el.font = v; }, key('font')));
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
        row('Гарнитура', select([['', 'как основной'], ...fontOptions()], a.font, v => { a.font = v; }, key('accfont')));
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

    section('Положение, мм');
    const g = h('div', 'grid4');
    for (const [p, label] of [['x', 'X'], ['y', 'Y'], ['w', 'Ширина'], ['h', 'Высота']]) {
      const l = h('label', '', label);
      const i = numInput(el[p], v => { el[p] = v; }, key('geo'), {step: 0.5, min: p === 'w' || p === 'h' ? 0 : -2000, max: 2000});
      i.dataset.geo = p; l.append(i); g.append(l);
    }
    box.append(g);
    const align = h('div', 'insp-actions');
    align.append(button('⇔ По центру', () => UI.edit(() => { el.x = +((S.doc.page.width - el.w) / 2).toFixed(2); })), button('⇕ По центру', () => UI.edit(() => { el.y = +((S.doc.page.height - el.h) / 2).toFixed(2); })));
    box.append(align);

    section('Печать');
    row('Слой', select([['auto', 'авто (' + (XS.Scene.elementLayer({...el, layer: 'auto'}) === 'text' ? 'текст' : 'цвет') + ')'], ['color', 'цвет / фон (струйный)'], ['text', 'текст / линии (лазер)']], el.layer, v => { el.layer = v; }, key('layer'))).title = 'Для печати в два прохода: фон на струйном, текст на лазерном.';
    row('Непрозрачность', numInput(Math.round(el.opacity * 100), v => { el.opacity = v / 100; }, key('op'), {step: 5, min: 0, max: 100}), h('span', 'muted small', '%'));
    row('', check('видим', el.visible, v => { el.visible = v; }, key('vis')), check('закреплён', el.locked, v => { el.locked = v; }, key('lock')));

    const acts = h('div', 'insp-actions');
    acts.append(button('⧉ Копия', () => UI.Layers.duplicate(el.id)), button('↑ Выше', () => UI.Layers.move(el.id, 1)), button('↓ Ниже', () => UI.Layers.move(el.id, -1)), button('Удалить', () => UI.Layers.remove(el.id), 'btn small danger'));
    box.append(acts);
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
    g.append(rot); box.append(g);
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
    if (doc.sides.length > 1) box.append(button('Удалить сторону «' + side.name + '»', () => { if (confirm('Удалить сторону «' + side.name + '» со всеми элементами?')) UI.edit(d => { d.sides.splice(S.side, 1); S.side = 0; S.sel = null; }); }, 'btn small danger'));

    section('Шрифты');
    const user = doc.fonts.map(f => f.family + ' (' + ({regular: 'обычный', bold: 'жирный', italic: 'курсив', bolditalic: 'жирный курсив'}[f.variant]) + ')');
    box.append(h('p', 'note', 'Встроенные: ' + XS.Fonts.BUILTIN.map(f => f.family).join(', ') + '.' + (user.length ? '<br>Загружены в проект: ' + XS.esc(user.join(', ')) + '.' : '')));
    box.append(button('Загрузить шрифт (TTF/OTF)…', () => filePicker('.ttf,.otf,font/ttf,font/otf', f => UI.addFont(f))));

    section('Подсказки');
    box.append(h('p', 'note', 'Выделите элемент мышью, чтобы изменить его. Стрелки — сдвиг на 0,5 мм (с Shift — 5 мм), Alt при перетаскивании — без привязки, Ctrl+D — копия, Delete — удалить, PageUp/PageDown — соседняя запись, Ctrl+колёсико — масштаб.'));
  }

  function render() {
    box = $('inspector');
    if (box.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON' && S.lastInspected === (S.sel || 'doc')) return;
    S.lastInspected = S.sel || 'doc';
    box.replaceChildren();
    const el = UI.element();
    if (el) renderElement(el); else renderDocument();
  }
  function updateGeometry() {
    const el = UI.element(); if (!el) return;
    $('inspector').querySelectorAll('[data-geo]').forEach(i => { if (document.activeElement !== i) i.value = +(+el[i.dataset.geo]).toFixed(2); });
  }
  function focusText() { const t = $('inspText'); if (t) { t.focus(); t.select(); } }

  UI.Inspector = {render, updateGeometry, focusText};
})(typeof window !== 'undefined' ? window : globalThis);
