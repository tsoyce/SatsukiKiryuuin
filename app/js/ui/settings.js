/* XSatsu Студия · окно «Настройки»: личные настройки (UI.Prefs), а после входа — аккаунт и сайт (UI.Account). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, $ = UI.$;
  const tabs = [];   // [{id, title, render(body)}] — другие модули добавляют вкладки через UI.Settings.addTab

  function prefsTab(body) {
    const grid = document.createElement('div');
    grid.className = 'settings-grid';
    for (const s of UI.Prefs.SCHEMA) {
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = s.label;
      let input;
      if (s.type === 'choice') { input = document.createElement('select'); for (const [v, t] of s.options) input.add(new Option(t, v)); input.value = UI.Prefs.get(s.key); input.onchange = () => UI.Prefs.set({[s.key]: input.value}); }
      else if (s.type === 'bool') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = UI.Prefs.get(s.key); input.onchange = () => UI.Prefs.set({[s.key]: input.checked}); }
      else { input = document.createElement('input'); input.type = 'number'; input.min = s.min; input.max = s.max; input.step = s.step; input.value = UI.Prefs.get(s.key); input.onchange = () => { UI.Prefs.set({[s.key]: +input.value}); input.value = UI.Prefs.get(s.key); }; }
      input.dataset.pref = s.key;
      grid.append(lbl, input);
    }
    body.append(grid);
    const note = document.createElement('p'); note.className = 'note';
    note.textContent = UI.Account?.user() ? 'Настройки сохраняются в вашем аккаунте и действуют на любом компьютере.' : 'Настройки хранятся в этом браузере. Войдите в аккаунт, чтобы они были на любом компьютере.';
    body.append(note);
  }

  let current = 'prefs';
  function draw() {
    const all = [{id: 'prefs', title: 'Личные', render: prefsTab}, ...tabs.filter(t => !t.visible || t.visible())];
    if (!all.some(t => t.id === current)) current = 'prefs';
    const head = $('settingsTabs'), body = $('settingsBody');
    head.replaceChildren(...all.map(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (t.id === current ? ' active' : ''); b.textContent = t.title; b.onclick = () => { current = t.id; draw(); }; return b; }));
    body.replaceChildren();
    Promise.resolve(all.find(t => t.id === current).render(body)).catch(e => UI.toast(e.message, true));
  }
  function open(tab) { if (tab) current = tab; draw(); if (!$('settingsDialog').open) $('settingsDialog').showModal(); }
  function addTab(tab) { tabs.push(tab); }
  function init() {
    $('settingsClose').onclick = () => $('settingsDialog').close();
    document.querySelectorAll('[data-open-settings]').forEach(b => { b.onclick = () => open(b.dataset.openSettings || undefined); });
    const themeBtn = $('themeBtn');
    const paint = () => { const dark = UI.Prefs.get('theme') === 'dark' || (UI.Prefs.get('theme') === 'auto' && global.matchMedia?.('(prefers-color-scheme: dark)').matches); themeBtn.innerHTML = XS.Icons.icon(dark ? 'sun' : 'moon', 17); themeBtn.title = dark ? 'Светлая тема' : 'Тёмная тема'; };
    if (themeBtn) { themeBtn.onclick = () => { const dark = themeBtn.title === 'Светлая тема'; UI.Prefs.set({theme: dark ? 'light' : 'dark'}); }; paint(); UI.Prefs.onChange(paint); }
  }
  UI.Settings = {init, open, addTab, redraw: draw};
})(typeof window !== 'undefined' ? window : globalThis);
