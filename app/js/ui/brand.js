/* XSatsu Студия · айдентика «Мундир» (стили — css/brand.css).
 * Эмблема — крест с фуражки на логотипе; повёрнутая на 45°, она становится «X» из XSatsu.
 * Здесь: SVG эмблемы, водяной знак в герое, золотая печать на «Готово» в уведомлениях и маленькая пасхалка. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI;
  const CROSS = 'M8.5 2.5h7l-2.4 8.4 8.4-2.4v7l-8.4-2.4 2.4 8.4h-7l2.4-8.4-8.4 2.4v-7l8.4 2.4z';

  function emblem(size = 16, cls = '') {
    return `<svg class="emblem ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="${CROSS}"/><path class="inner" d="${CROSS}" transform="translate(12 12) scale(.58) translate(-12 -12)"/></svg>`;
  }

  /* Уведомление с печатью: UI.toast(текст, ошибка, {seal: true}). */
  const plainToast = UI.toast;
  UI.toast = (text, error = false, opts = {}) => {
    plainToast(text, error);
    if (opts && opts.seal && !error) {
      const t = document.getElementById('toast');
      t.insertAdjacentHTML('afterbegin', `<span class="seal">${emblem(15)}</span>`);
    }
  };

  function decorate() {
    const hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.hero-emblem')) hero.insertAdjacentHTML('afterbegin', emblem(260, 'hero-emblem'));

    /* Пасхалка: пять щелчков по знаку на главной — Студия отдаёт честь. */
    const brand = document.querySelector('.home .brand');
    if (!brand || brand.dataset.salute) return;
    brand.dataset.salute = '1';
    let clicks = [];
    brand.addEventListener('click', () => {
      const now = Date.now();
      clicks = clicks.filter(t => now - t < 1600).concat(now);
      if (clicks.length < 5) return;
      clicks = [];
      brand.classList.remove('salute'); void brand.offsetWidth; brand.classList.add('salute');
      setTimeout(() => brand.classList.remove('salute'), 950);
      UI.toast('Так точно! Студия к работе готова.', false, {seal: true});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate); else decorate();
  XS.Icons = Object.assign(XS.Icons || {}, {emblem});
  UI.Brand = {emblem, decorate};
})(window);
