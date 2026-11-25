/* XSatsu Студия · движение: вход экранов, закрытие окон с анимацией, плавная смена темы, очередь карточек.
 * Стили — css/motion.css. Всё отключается системным «уменьшить движение» или «Настройки → Анимации». */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI;
  const root = document.documentElement;
  const mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function reduced() {
    const m = root.dataset.motion;
    return m === 'off' || (m !== 'on' && !!mq?.matches);
  }
  /* Перезапуск CSS-анимации: снять класс, дождаться кадра, поставить; снять после окончания. */
  function play(el, cls, ms = 700) {
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['_t_' + cls]);
    el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms);
  }
  const screen = el => play(el, 'screen-in', 900);
  const flip = el => play(el, 'flip', 300);

  /* Окна закрываются с анимацией: close() ждёт конца dlg-out, повторный showModal() её отменяет. */
  function patchDialogs() {
    const P = global.HTMLDialogElement?.prototype;
    if (!P || P._xsPatched) return;
    const nativeClose = P.close, nativeShowModal = P.showModal, nativeShow = P.show;
    P.close = function (value) {
      if (!this.open || reduced() || this.dataset.closing !== undefined) return nativeClose.call(this, value);
      this.dataset.closing = '';
      const done = e => {
        if (e && e.target !== this) return;
        if (this.dataset.closing === undefined) return;
        this.removeEventListener('animationend', done);
        delete this.dataset.closing;
        nativeClose.call(this, value);
      };
      this.addEventListener('animationend', done);
      setTimeout(done, 220);
    };
    P.showModal = function () {
      if (this.dataset.closing !== undefined) { delete this.dataset.closing; return; }
      return nativeShowModal.call(this);
    };
    P.show = function () {
      if (this.dataset.closing !== undefined) { delete this.dataset.closing; return; }
      return nativeShow.call(this);
    };
    P._xsPatched = true;
  }

  /* Порядковый номер карточек — для очереди появления (animation-delay в CSS). */
  function indexChildren(grid) {
    let i = 0;
    for (const el of grid.children) el.style.setProperty('--i', Math.min(i++, 16));
  }

  /* Смена темы — на полсекунды включаем плавный переход цветов. */
  function watchTheme() {
    let last = root.dataset.theme || '';
    new MutationObserver(() => {
      const now = root.dataset.theme || '';
      if (now === last) return;
      last = now;
      if (reduced()) return;
      root.classList.add('theme-anim');
      clearTimeout(watchTheme.t);
      watchTheme.t = setTimeout(() => root.classList.remove('theme-anim'), 450);
    }).observe(root, {attributes: true, attributeFilter: ['data-theme']});
  }

  /* Заглушки карточек, пока список проектов идёт с сервера. */
  function skeleton(grid, n = 4) {
    grid.innerHTML = Array.from({length: n}, () => '<div class="skeleton" aria-hidden="true"><div class="sk thumb"></div><div class="sk line"></div><div class="sk line short"></div></div>').join('');
    grid.dataset.loading = '1';
  }
  function revealCards(grid) {
    if (grid.dataset.loading) { delete grid.dataset.loading; indexChildren(grid); play(grid, 'cards-in', 900); }
  }

  function init() {
    watchTheme();
    for (const id of ['presetGrid', 'projectGrid']) {
      const g = document.getElementById(id);
      if (g) new MutationObserver(() => indexChildren(g)).observe(g, {childList: true});
    }
  }

  patchDialogs();
  UI.Motion = {init, reduced, play, screen, flip, skeleton, revealCards};
})(typeof window !== 'undefined' ? window : globalThis);
