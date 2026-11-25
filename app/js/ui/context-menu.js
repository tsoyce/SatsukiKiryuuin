/* XSatsu Студия · контекстное меню (правая кнопка) на макете и в списке слоёв. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S;
  let menu = null;

  function items(kind) {
    const Sel = UI.Sel, sel = UI.selected(), n = sel.length;
    const grouped = sel.some(e => e.group), locked = n && sel.every(e => e.locked), hidden = n && sel.every(e => !e.visible);
    if (kind === 'empty') return [
      ['paste', 'Вставить', 'Ctrl+V', () => Sel.paste(), !Sel.hasClipboard()],
      ['check', 'Выделить всё', 'Ctrl+A', () => Sel.selectAll()],
      '-',
      ['text', 'Добавить текст', 'T', () => UI.Layers.add('text')],
      ['field', 'Добавить поле', 'F', () => UI.Layers.add('field')],
      ['image', 'Добавить картинку', 'I', () => UI.Layers.add('image')]
    ];
    return [
      ['copy', 'Копировать', 'Ctrl+C', () => Sel.copy()],
      ['cut', 'Вырезать', 'Ctrl+X', () => Sel.cut()],
      ['paste', 'Вставить', 'Ctrl+V', () => Sel.paste(), !Sel.hasClipboard()],
      ['copy', 'Дублировать', 'Ctrl+D', () => Sel.duplicate()],
      '-',
      ['group', 'Сгруппировать', 'Ctrl+G', () => Sel.group(), n < 2],
      ['ungroup', 'Разгруппировать', 'Ctrl+Shift+G', () => Sel.ungroup(), !grouped],
      '-',
      ['front', 'На передний план', 'Ctrl+Shift+]', () => Sel.order('front')],
      ['up', 'Выше', 'Ctrl+]', () => Sel.order('up')],
      ['down', 'Ниже', 'Ctrl+[', () => Sel.order('down')],
      ['back', 'На задний план', 'Ctrl+Shift+[', () => Sel.order('back')],
      '-',
      [locked ? 'unlock' : 'lock', locked ? 'Открепить' : 'Закрепить', 'Ctrl+Shift+L', () => Sel.toggle('locked')],
      [hidden ? 'eye' : 'eyeOff', hidden ? 'Показать' : 'Скрыть', 'Ctrl+Shift+H', () => Sel.toggle('visible')],
      '-',
      ['trash', 'Удалить', 'Delete', () => Sel.remove(), false, 'danger']
    ];
  }

  function open(x, y, kind) {
    close();
    menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    for (const it of items(kind)) {
      if (it === '-') { menu.append(document.createElement('hr')); continue; }
      const [icon, label, keys, run, disabled, cls] = it;
      const b = document.createElement('button');
      b.type = 'button'; b.disabled = !!disabled; b.className = cls || '';
      b.innerHTML = XS.Icons.icon(icon, 15) + `<span>${XS.esc(label)}</span><kbd>${XS.esc(keys)}</kbd>`;
      b.onclick = () => { close(); Promise.resolve(run()).catch(e => UI.toast(e.message, true)); };
      menu.append(b);
    }
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function close() { if (menu) { menu.remove(); menu = null; } }
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) close(); }, true);
  global.addEventListener('blur', close);
  global.addEventListener('resize', close);

  UI.Menu = {open, close, isOpen: () => !!menu};
})(typeof window !== 'undefined' ? window : globalThis);
