/* XSatsu Студия · палитра команд (v4): Ctrl+K — найти любое действие, шаблон, запись или слой по названию.
 * Команды собираются на лету: горячие клавиши (UI.Keys.MAP), меню «Проект», инструменты, шаблоны, записи, слои. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  let items = [], shown = [], active = 0;

  function commands() {
    const out = [], inEditor = !!S.doc && !$('editor').hidden;
    const add = (group, label, run, extra = {}) => out.push({group, label, run, ...extra});
    if (inEditor) {
      for (const k of UI.Keys.MAP) {
        if (!k.run || (k.need === 'sel' && !S.selection.length)) continue;
        add(k.group, k.label, () => k.run({shiftKey: false, code: k.keys[0]?.split('+').pop() || ''}), {keys: k.show, icon: 'command'});
      }
      add('Проект', 'Выгрузить…', () => UI.ExportDialog.open(), {keys: 'Ctrl+E', icon: 'download'});
      add('Проект', 'Шрифты: Google Fonts, с компьютера, из файла', () => UI.FontPicker.open({tab: 'google'}), {icon: 'font'});
      add('Проект', 'Проверить все записи', () => UI.runCheck(), {icon: 'check'});
      add('Проект', 'Мастер печати', () => UI.PrintMaster.open(), {keys: 'Ctrl+Shift+P', icon: 'printer'});
      add('Проект', 'Сохранить файл проекта (.json)', () => UI.saveFile(), {icon: 'download'});
      add('Проект', 'Скачать таблицу (CSV)', () => document.querySelector('[data-act=exportCsv]').click(), {icon: 'table'});
      add('Проект', 'Сделать копию проекта', () => document.querySelector('[data-act=duplicate]').click(), {icon: 'copy'});
      if (XS.Api?.user()) {
        add('Проект', 'Версии…', () => UI.Account.versions(), {icon: 'history'});
        add('Проект', 'Доступ и ссылка…', () => UI.Account.share(), {icon: 'share'});
        if (UI.Forms) add('Проект', 'Анкета регистрации: ответы гостей → записи', () => UI.Forms.open(), {icon: 'form'});
      }
      add('Данные', 'Найти и заменить', () => UI.Tools.open('replace'), {keys: 'Ctrl+H', icon: 'replace'});
      add('Данные', 'Сортировать записи', () => UI.Tools.open('sort'), {icon: 'sort'});
      add('Данные', 'Удалить повторы', () => UI.Tools.open('sort'), {icon: 'trash'});
      add('Данные', 'Фото по именам файлов', () => UI.Tools.open('photos'), {icon: 'camera'});
      add('Данные', 'Загрузить из Google Таблицы', () => UI.Tools.open('sheet'), {icon: 'table'});
      add('Данные', 'Вставить из Excel', () => $('pasteBtn').click(), {icon: 'paste'});
      add('Данные', 'Открыть таблицу целиком', () => $('tableBtn').click(), {icon: 'table'});
      add('Данные', 'Добавить запись', () => $('addRowBtn').click(), {icon: 'plus'});
      add('Вид', 'Добавить оборотную сторону', () => UI.edit(d => { if (d.sides.length < 8) { d.sides.push(XS.Model.side(XS.uid('side'), 'Оборот')); S.side = d.sides.length - 1; S.selection = []; } }), {icon: 'plus'});
      S.doc.sides.forEach((s, i) => add('Стороны', 'Перейти: ' + s.name, () => UI.setSide(i), {icon: 'file'}));
      // Слои текущей стороны
      for (const el of UI.side().elements) add('Слои', el.name, () => UI.select([el.id]), {icon: {text: 'text', image: 'image', rect: 'rect', line: 'line', path: 'path', qr: 'qr', barcode: 'barcode'}[el.type] || 'layers', hint: el.type === 'text' ? el.text.replace(/\s+/g, ' ').slice(0, 50) : ''});
      // Записи (первые 2000)
      const label = S.doc.data.columns.find(c => c.type !== 'image');
      S.doc.data.rows.slice(0, 2000).forEach((r, i) => {
        const text = Object.values(r.cells).filter(v => v && !/^asset:/.test(v)).join(' · ');
        add('Записи', (i + 1) + '. ' + (String(r.cells[label?.id] ?? '').trim() || 'бланк'), () => UI.setRow(i), {icon: 'user', hint: text.slice(0, 80), weak: true});
      });
      add('Навигация', 'На главную', () => UI.goHome(), {icon: 'chevronLeft'});
    }
    for (const p of XS.Presets.LIST) add('Создать', 'Новый проект: ' + p.title, async () => UI.create(await UI.busy('Создаём «' + p.title + '»…', p.make)), {icon: 'plus', hint: p.hint});
    add('Создать', 'Новый проект из PDF-шаблона', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf'; i.onchange = UI.safe(async () => { if (i.files[0]) await UI.create(await UI.busy('Открываем PDF…', () => XS.Presets.fromPdf(i.files[0]))); }); i.click(); }, {icon: 'pdf'});
    add('Настройки', 'Настройки', () => document.querySelector('[data-open-settings]').click(), {icon: 'settings'});
    for (const [v, l] of [['light', 'светлая'], ['dark', 'тёмная'], ['auto', 'как в системе']]) add('Настройки', 'Тема: ' + l, () => UI.Prefs.set({theme: v}), {icon: v === 'dark' ? 'moon' : 'sun'});
    add('Справка', 'Что нового в версии 4', () => UI.WhatsNew?.open(true), {icon: 'sparkle'});
    if (inEditor) add('Справка', 'Горячие клавиши', () => UI.Keys.help(), {keys: '? · F1', icon: 'keyboard'});
    return out;
  }

  /* Нечёткий поиск: все слова запроса должны встретиться; выше — совпадение в начале слова и подряд. */
  function score(item, words) {
    const hay = XS.key(item.label + ' ' + item.group + ' ' + (item.hint || ''));
    const label = XS.key(item.label);
    let s = 0;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i < 0) return -1;
      s += (label.startsWith(w) ? 30 : 0) + (label.includes(' ' + w) ? 12 : 0) + (label.includes(w) ? 10 : 2) - Math.min(i, 40) * 0.05;
    }
    return s - (item.weak ? 15 : 0);
  }

  function render() {
    const q = XS.key($('paletteInput').value).split(/\s+/).filter(Boolean);
    shown = q.length ? items.map(it => ({it, s: score(it, q)})).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 60).map(x => x.it)
      : items.filter(it => !it.weak && it.group !== 'Слои').slice(0, 60);
    active = Math.min(active, Math.max(0, shown.length - 1));
    const kbd = s => s ? '<span class="pal-keys">' + s.split(' · ')[0].split('+').map(k => '<kbd>' + XS.esc(mac ? k.replace('Ctrl', '⌘') : k) + '</kbd>').join('') + '</span>' : '';
    $('paletteList').innerHTML = shown.length ? shown.map((it, i) => `<li class="${i === active ? 'active' : ''}" data-i="${i}">${XS.Icons.icon(it.icon || 'command', 16)}<span class="pal-main"><b>${XS.esc(it.label)}</b>${it.hint ? '<span class="muted small">' + XS.esc(it.hint) + '</span>' : ''}</span><span class="pal-group">${XS.esc(it.group)}</span>${kbd(it.keys)}</li>`).join('')
      : '<li class="empty muted">Ничего не нашлось. Попробуйте «выгрузить», «фото», «бейдж», «повернуть»…</li>';
    $('paletteList').querySelector('.active')?.scrollIntoView({block: 'nearest'});
  }
  function run(i) {
    const it = shown[i]; if (!it) return;
    $('paletteDialog').close();
    Promise.resolve().then(() => it.run()).catch(e => UI.toast(e.message, true));
  }

  function open() {
    if ($('paletteDialog').open) return;
    items = commands(); active = 0;
    $('paletteInput').value = '';
    render();
    $('paletteDialog').showModal();
    $('paletteInput').focus();
  }

  function init() {
    $('paletteInput').oninput = () => { active = 0; render(); };
    $('paletteInput').onkeydown = e => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(active); e.preventDefault(); }
    };
    $('paletteList').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
    $('paletteList').addEventListener('mousemove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== active) { active = +li.dataset.i; $('paletteList').querySelectorAll('li').forEach((x, i) => x.classList.toggle('active', i === active)); } });
    $('paletteDialog').addEventListener('click', e => { if (e.target === $('paletteDialog')) $('paletteDialog').close(); });
    // Ctrl+K (и Ctrl+Shift+K) — везде, в том числе на главной и в полях ввода; Ctrl+H — найти и заменить в редакторе.
    document.addEventListener('keydown', e => {
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && e.code === 'KeyK') { e.preventDefault(); if (document.querySelector('dialog[open]:not(#paletteDialog)')) return; open(); }
      else if (mod && e.code === 'KeyH' && S.doc && !$('editor').hidden && !document.querySelector('dialog[open]')) { e.preventDefault(); UI.Tools.open('replace'); }
    });
    document.querySelectorAll('[data-open-palette]').forEach(b => { b.onclick = open; });
  }
  UI.Palette = {init, open, commands};
})(typeof window !== 'undefined' ? window : globalThis);
