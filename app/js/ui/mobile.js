/* XSatsu Студия · редактор на телефоне: нижняя панель «Слои / Данные / Свойства / Выгрузить»,
 * панели выезжают снизу листами (смахните вниз или нажмите на макет, чтобы закрыть). Стили — css/mobile.css. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const mq = global.matchMedia('(max-width: 820px)');
  const body = document.body;
  const isMobile = () => mq.matches;

  function current() { return body.dataset.sheet || ''; }
  function open(which) {
    if (!isMobile()) return;
    if (which === 'layers' || which === 'data') document.querySelector(`.panel.left .tab[data-tab="${which}"]`)?.click();
    body.dataset.sheet = which;
    paint();
  }
  function close() { delete body.dataset.sheet; paint(); }
  function toggle(which) { if (current() === which) close(); else open(which); }

  function paint() {
    const nav = $('mobileNav'); if (!nav) return;
    const cur = current();
    for (const b of nav.querySelectorAll('[data-sheet]')) b.classList.toggle('on', b.dataset.sheet === cur);
    const dot = nav.querySelector('.dot');
    if (dot) dot.hidden = !(S.doc && S.selection.length && cur !== 'props');
  }

  /* Смахивание листа вниз за «ручку». */
  function grip(el) {
    let y0 = 0, dy = 0, id = null;
    const panel = el.closest('.panel');
    el.addEventListener('pointerdown', e => { id = e.pointerId; y0 = e.clientY; dy = 0; el.setPointerCapture(id); body.classList.add('sheet-dragging'); });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.setProperty('--drag', dy + 'px');
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; body.classList.remove('sheet-dragging');
      panel.style.removeProperty('--drag');
      if (dy > 70) close();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', () => { if (dy < 4) close(); });
  }

  function init() {
    const nav = $('mobileNav'); if (!nav) return;
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sheet) toggle(b.dataset.sheet);
      if (b.dataset.mobileExport !== undefined) { close(); UI.ExportDialog.open(); }
    });
    $('sheetScrim')?.addEventListener('click', close);
    document.querySelectorAll('[data-sheet-grip]').forEach(grip);
    // Переключение вкладок внутри листа «Слои/Данные» меняет и подсветку внизу.
    document.querySelectorAll('.panel.left .tab').forEach(t => t.addEventListener('click', () => { if (current() === 'layers' || current() === 'data') { body.dataset.sheet = t.dataset.tab; paint(); } }));
    mq.addEventListener?.('change', () => { close(); if (S.doc) requestAnimationFrame(() => UI.Stage.fit()); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && current() && !document.querySelector('dialog[open]')) close(); });
    // После каждой перерисовки обновляем точку «есть выделение» на «Свойствах».
    const refresh = UI.refresh;
    UI.refresh = (...a) => { const r = refresh(...a); paint(); return r; };
    paint();
  }

  UI.Mobile = {init, open, close, toggle, isMobile};
})(typeof window !== 'undefined' ? window : globalThis);
