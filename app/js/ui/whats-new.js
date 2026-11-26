/* XSatsu Студия · «Что нового» (v4) и работа без сети: окно показывается один раз после обновления,
 * service worker (sw.js) кэширует Студию — после первого открытия она запускается и без интернета. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, $ = UI.$;
  const VERSION = '4.9', KEY = 'xs-seen-version';

  const ITEMS = [
    ['table', 'Импорт: сами решаете, куда класть столбцы', 'Файл, вставка из Excel или Google Таблица — сначала окно сопоставления: «Ф.И.О.» ляжет в «ФИО», список без заголовка тоже узнаётся. Можно добавить, обновить совпадающих, вписать по порядку или заменить; повторы пропускаются.'],
    ['camera', 'Фото пачкой и из ZIP', 'Данные → «Фото» или просто перетащите файлы на таблицу: Студия разложит фото по ФИО, фамилии с инициалами, номеру или имени файла из таблицы и покажет, что куда легло. Большие фото уменьшаются, повёрнутые с телефона — выпрямляются.'],
    ['link', 'Картинки по ссылке без ошибок печати', 'Ссылка на фото в ячейке остаётся, а сама картинка сохраняется в проекте — печать и PNG больше не падают («tainted canvas»).'],
    ['data', 'Столбцы переставляются', 'В таблице — за ручку ⋮ в заголовке или Ctrl+Shift+← / →.'],
    ['link', 'Ссылка для гостя — без регистрации', 'Проект → «Доступ и ссылка…»: коллега открывает ссылку, правит, печатает. Срок, «только просмотр» и отзыв — в том же окне; правки гостя подписаны в «Версиях».'],
    ['font', 'Шрифты: Google Fonts, с компьютера, свои', 'Нажмите на гарнитуру в свойствах текста: поиск по ~1900 семействам Google Fonts (почти 300 с кириллицей) с превью, шрифты, установленные на компьютере, и файлы TTF/OTF/WOFF/WOFF2. Шрифт сохраняется в проекте и встраивается в PDF.'],
    ['search', 'Палитра команд — Ctrl+K', 'Любое действие, шаблон, запись или слой — набором пары букв. Ctrl+H — найти и заменить.'],
    ['sparkle', 'Пять новых шаблонов', 'Бейджи с фото и QR, сертификаты с номером, благодарственные письма, карточки рассадки, билеты с корешком.'],
    ['rotate', 'Поворот элементов', 'Круглая ручка над рамкой (Shift — шаг 15°), Shift+R — на 90°. В PDF поворот остаётся вектором.'],
    ['barcode', 'Штрихкоды', 'Code 128 и EAN-13: сквозной номер {№:000000}, номер билета или табельный — клавиша B.'],
    ['field', 'Форматы полей', '{Дата:длинная} → 26 ноября 2026 г. · {Сумма:прописью} · {Место:порядковое} · {№:000} · {Роль|Участник} · {ФИО:принял/приняла}.'],
    ['table', 'Google Таблица по ссылке', 'Список подтягивается по ссылке и обновляется одной кнопкой. Ещё — сортировка и удаление повторов.'],
    ['form', 'Анкета регистрации', 'Ссылка-анкета для гостей: ответы сами становятся записями проекта (нужен вход в аккаунт).'],
    ['wifiOff', 'Работает без интернета', 'После первого открытия Студия запускается и без сети; проекты в браузере доступны всегда.']
  ];

  function open(force = false) {
    const box = $('whatsNewBody');
    box.innerHTML = '<ul class="wn-list">' + ITEMS.map(([icon, title, text]) => `<li><span class="wn-ico">${XS.Icons.icon(icon, 20)}</span><span><b>${XS.esc(title)}</b><span class="muted">${XS.esc(text)}</span></span></li>`).join('') + '</ul>';
    if (!$('whatsNewDialog').open) $('whatsNewDialog').showModal();
    try { localStorage.setItem(KEY, VERSION); } catch (e) { /* приватный режим */ }
    void force;
  }
  function maybeShow() {
    let seen = '';
    try { seen = localStorage.getItem(KEY) || ''; } catch (e) { return; }
    // гостю по ссылке или анкете «Что нового» ни к чему
    if (seen !== VERSION) setTimeout(() => { if (!document.querySelector('dialog[open]') && !/^#\/(link|form)\//.test(location.hash)) open(); }, 700);
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search)) return; // в разработке не мешаем свежему коду
    // updateViaCache: 'none' — новую версию Студии браузер ищет сразу, а не через сутки.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(r => r.update?.()).catch(e => console.warn('Service worker:', e));
    // Вышла новая версия, а страница открыта со старой: на главной — тихо перезагружаемся, в редакторе — подсказываем.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      if (!UI.S?.doc && !document.querySelector('dialog[open]')) { reloaded = true; location.reload(); }
      else UI.toast('Вышла новая версия Студии — обновите страницу, когда закончите (всё уже сохранено).');
    });
  }
  function offlineBadge() {
    const set = () => document.body.classList.toggle('is-offline', !navigator.onLine);
    global.addEventListener('online', () => { set(); UI.toast('Связь восстановлена.'); });
    global.addEventListener('offline', () => { set(); UI.toast('Нет сети: работаем с проектами в браузере, сохранение на сервер — когда связь вернётся.', true); });
    set();
  }

  function init() {
    $('whatsNewClose').onclick = () => $('whatsNewDialog').close();
    $('whatsNewGo').onclick = () => { $('whatsNewDialog').close(); UI.Palette?.open(); };
    document.querySelectorAll('[data-whats-new]').forEach(b => { b.onclick = () => open(true); });
    maybeShow();
    registerWorker();
    offlineBadge();
  }
  UI.WhatsNew = {init, open, VERSION};
})(typeof window !== 'undefined' ? window : globalThis);
