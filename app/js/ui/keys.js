/* XSatsu Студия · горячие клавиши. Одна таблица — и для обработчика, и для окна-справки (? / F1).
 * Сочетания сравниваются по физической клавише (event.code), поэтому работают в любой раскладке. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const Sel = () => UI.Sel;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');

  /* keys: 'Mod+Shift+KeyZ' (Mod = Ctrl, на Mac ⌘). show — как подписать в справке. need: 'sel' — только при выделении.
   * input: true — срабатывает даже в поле ввода (Ctrl+S, Ctrl+E…). */
  const MAP = [
    {group: 'Правка', keys: ['Mod+KeyZ'], show: 'Ctrl+Z', label: 'Отменить', run: () => UI.undo()},
    {group: 'Правка', keys: ['Mod+Shift+KeyZ', 'Mod+KeyY'], show: 'Ctrl+Shift+Z · Ctrl+Y', label: 'Повторить', run: () => UI.redo()},
    {group: 'Правка', keys: ['Mod+KeyC'], show: 'Ctrl+C', label: 'Копировать', need: 'sel', run: () => Sel().copy()},
    {group: 'Правка', keys: ['Mod+KeyX'], show: 'Ctrl+X', label: 'Вырезать', need: 'sel', run: () => Sel().cut()},
    {group: 'Правка', keys: ['Mod+KeyV'], show: 'Ctrl+V', label: 'Вставить (в т. ч. в другую сторону или проект)', run: () => Sel().paste()},
    {group: 'Правка', keys: ['Mod+KeyD'], show: 'Ctrl+D', label: 'Дублировать', need: 'sel', run: () => Sel().duplicate()},
    {group: 'Правка', keys: ['Delete', 'Backspace'], show: 'Delete', label: 'Удалить', need: 'sel', run: () => Sel().remove()},
    {group: 'Выделение', keys: ['Mod+KeyA'], show: 'Ctrl+A', label: 'Выделить всё на стороне', run: () => Sel().selectAll()},
    {group: 'Выделение', keys: ['Escape'], show: 'Esc', label: 'Снять выделение', run: () => UI.select([])},
    {group: 'Выделение', keys: ['Tab', 'Shift+Tab'], show: 'Tab · Shift+Tab', label: 'Следующий / предыдущий элемент', run: e => Sel().cycle(e.shiftKey ? -1 : 1)},
    {group: 'Выделение', keys: [], show: 'Shift-клик · Ctrl-клик', label: 'Добавить к выделению или убрать'},
    {group: 'Выделение', keys: [], show: 'Тянуть по пустому месту', label: 'Выделить рамкой'},
    {group: 'Выделение', keys: [], show: 'Двойной клик', label: 'Элемент внутри группы · редактировать текст'},
    {group: 'Слои', keys: ['Mod+KeyG'], show: 'Ctrl+G', label: 'Сгруппировать', need: 'sel', run: () => Sel().group()},
    {group: 'Слои', keys: ['Mod+Shift+KeyG'], show: 'Ctrl+Shift+G', label: 'Разгруппировать', need: 'sel', run: () => Sel().ungroup()},
    {group: 'Слои', keys: ['Mod+BracketRight'], show: 'Ctrl+]', label: 'Выше', need: 'sel', run: () => Sel().order('up')},
    {group: 'Слои', keys: ['Mod+BracketLeft'], show: 'Ctrl+[', label: 'Ниже', need: 'sel', run: () => Sel().order('down')},
    {group: 'Слои', keys: ['Mod+Shift+BracketRight'], show: 'Ctrl+Shift+]', label: 'На передний план', need: 'sel', run: () => Sel().order('front')},
    {group: 'Слои', keys: ['Mod+Shift+BracketLeft'], show: 'Ctrl+Shift+[', label: 'На задний план', need: 'sel', run: () => Sel().order('back')},
    {group: 'Слои', keys: ['Mod+Shift+KeyL'], show: 'Ctrl+Shift+L', label: 'Закрепить / открепить', need: 'sel', run: () => Sel().toggle('locked')},
    {group: 'Слои', keys: ['Mod+Shift+KeyH'], show: 'Ctrl+Shift+H', label: 'Скрыть / показать', need: 'sel', run: () => Sel().toggle('visible')},
    {group: 'Слои', keys: ['F2'], show: 'F2', label: 'Переименовать слой', need: 'sel', run: () => { switchTab('layers'); UI.Layers.rename(); }},
    {group: 'Слои', keys: ['Enter', 'NumpadEnter'], show: 'Enter', label: 'Редактировать текст', need: 'sel', run: () => UI.Inspector.focusText()},
    {group: 'Положение', keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown'], show: 'Стрелки · Shift+стрелки', label: 'Сдвиг на 0,5 мм · на 5 мм', need: 'sel', run: e => {
      const st = e.shiftKey ? UI.Prefs.get('nudgeBig') : UI.Prefs.get('nudge'), d = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[e.code];
      Sel().nudge(d[0], d[1]);
    }},
    {group: 'Положение', keys: [], show: 'Shift при перетаскивании', label: 'Только по горизонтали или вертикали; за угол — с сохранением пропорций'},
    {group: 'Положение', keys: [], show: 'Alt при перетаскивании', label: 'Без привязки к направляющим'},
    {group: 'Добавить', keys: ['KeyT'], show: 'T', label: 'Текст', run: () => UI.Layers.add('text')},
    {group: 'Добавить', keys: ['KeyF'], show: 'F', label: 'Поле из таблицы', run: () => UI.Layers.add('field')},
    {group: 'Добавить', keys: ['KeyI'], show: 'I', label: 'Картинку', run: () => UI.Layers.add('image')},
    {group: 'Добавить', keys: ['KeyR'], show: 'R', label: 'Фигуру', run: () => UI.Layers.add('rect')},
    {group: 'Добавить', keys: ['KeyL'], show: 'L', label: 'Линию', run: () => UI.Layers.add('line')},
    {group: 'Добавить', keys: ['KeyQ'], show: 'Q', label: 'QR-код', run: () => UI.Layers.add('qr')},
    {group: 'Вид', keys: ['Mod+Digit0', 'Mod+Numpad0'], show: 'Ctrl+0', label: 'Вписать в окно', input: true, run: () => UI.Stage.fit()},
    {group: 'Вид', keys: ['Mod+Digit1', 'Mod+Numpad1'], show: 'Ctrl+1', label: 'Масштаб 100 %', input: true, run: () => UI.Stage.setZoom(1)},
    {group: 'Вид', keys: ['Mod+Equal', 'Mod+NumpadAdd', 'Mod+Shift+Equal'], show: 'Ctrl+=', label: 'Крупнее', input: true, run: () => UI.Stage.setZoom(UI.Stage.zoom() * 1.25)},
    {group: 'Вид', keys: ['Mod+Minus', 'Mod+NumpadSubtract'], show: 'Ctrl+−', label: 'Мельче', input: true, run: () => UI.Stage.setZoom(UI.Stage.zoom() / 1.25)},
    {group: 'Вид', keys: [], show: 'Ctrl+колёсико', label: 'Масштаб к курсору'},
    {group: 'Вид', keys: [], show: 'Пробел + мышь · средняя кнопка', label: 'Двигать холст'},
    {group: 'Записи', keys: ['PageDown'], show: 'PageDown', label: 'Следующая запись', run: () => UI.setRow(S.row + 1)},
    {group: 'Записи', keys: ['PageUp'], show: 'PageUp', label: 'Предыдущая запись', run: () => UI.setRow(S.row - 1)},
    {group: 'Проект', keys: ['Mod+KeyS'], show: 'Ctrl+S', label: 'Сохранить', input: true, run: async () => { await UI.flush(); UI.toast('Сохранено в браузере. Файл проекта — «Проект → Сохранить файл проекта».'); }},
    {group: 'Проект', keys: ['Mod+KeyE'], show: 'Ctrl+E', label: 'Выгрузить…', input: true, run: () => UI.ExportDialog.open()},
    {group: 'Проект', keys: ['Mod+KeyP'], show: 'Ctrl+P', label: 'Печать (листы в PDF)', input: true, run: () => $('printBtn').click()},
    {group: 'Проект', keys: ['F1', 'Shift+Slash'], show: '? · F1', label: 'Эта справка', run: () => help()}
  ];

  function combo(e) {
    const parts = [];
    if (mac ? e.metaKey : e.ctrlKey) parts.push('Mod');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.code);
    return parts.join('+');
  }
  const index = new Map();
  for (const item of MAP) for (const k of item.keys) index.set(k, item);

  function onKey(e) {
    if ($('editor').hidden || !S.doc) return;
    if (document.querySelector('dialog[open]')) return; // в окнах — их собственные клавиши
    if (UI.Menu.isOpen()) { if (e.code === 'Escape') { UI.Menu.close(); e.preventDefault(); } return; }
    const item = index.get(combo(e));
    if (!item || !item.run) return;
    const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if (typing && !item.input) return;          // в полях ввода — обычное поведение браузера
    if (item.need === 'sel' && !S.selection.length) return;
    if (/^(Tab|Enter|NumpadEnter)$/.test(e.code) && t.tagName === 'BUTTON') return; // Tab/Enter на кнопке — навигация
    e.preventDefault();
    Promise.resolve(item.run(e)).catch(err => UI.toast(err.message, true));
  }

  function switchTab(name) { document.querySelector('.tab[data-tab="' + name + '"]')?.click(); }

  function help() {
    const groups = [];
    for (const item of MAP) { let g = groups.find(x => x.name === item.group); if (!g) groups.push(g = {name: item.group, items: []}); g.items.push(item); }
    const fmt = s => s.split(' · ').map(part => part.split('+').map(k => `<kbd>${XS.esc(mac ? k.replace('Ctrl', '⌘') : k)}</kbd>`).join('+')).join(' <span class="muted">или</span> ');
    $('keysBody').innerHTML = groups.map(g => `<section><h3>${XS.esc(g.name)}</h3><dl>${g.items.map(i => `<dt>${fmt(i.show)}</dt><dd>${XS.esc(i.label)}</dd>`).join('')}</dl></section>`).join('');
    $('keysDialog').showModal();
  }

  function init() {
    document.addEventListener('keydown', onKey);
    $('keysClose').onclick = () => $('keysDialog').close();
    $('keysBtn').onclick = help;
  }
  UI.Keys = {init, help, MAP};
})(typeof window !== 'undefined' ? window : globalThis);
