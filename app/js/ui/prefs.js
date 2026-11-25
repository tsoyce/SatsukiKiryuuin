/* XSatsu Студия · личные настройки (тема, шаг сдвига, привязка, имя файлов по умолчанию).
 * Хранятся в браузере; после входа в аккаунт — ещё и на сервере (UI.Account синхронизирует). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI;
  const KEY = 'xsatsu-prefs';
  /* Описание каждого ключа: из него строится и проверка, и форма в окне «Настройки». */
  const SCHEMA = [
    {key: 'theme', label: 'Тема', type: 'choice', options: [['auto', 'как в системе'], ['light', 'светлая'], ['dark', 'тёмная']], def: 'auto'},
    {key: 'nudge', label: 'Сдвиг стрелками, мм', type: 'number', min: 0.1, max: 10, step: 0.1, def: 0.5},
    {key: 'nudgeBig', label: 'Сдвиг с Shift, мм', type: 'number', min: 1, max: 50, step: 1, def: 5},
    {key: 'snap', label: 'Привязка к направляющим', type: 'bool', def: true},
    {key: 'snapPx', label: 'Сила привязки, px экрана', type: 'number', min: 2, max: 20, step: 1, def: 6},
    {key: 'autoCheck', label: 'Проверять список перед выгрузкой', type: 'bool', def: true},
    {key: 'confirmDelete', label: 'Спрашивать перед удалением проекта', type: 'bool', def: true}
  ];
  let values = {};
  const listeners = new Set();

  function sanitize(input) {
    const out = {};
    for (const s of SCHEMA) {
      let v = input && s.key in input ? input[s.key] : s.def;
      if (s.type === 'number') v = XS.num(v, s.def, s.min, s.max);
      if (s.type === 'bool') v = typeof v === 'boolean' ? v : s.def;
      if (s.type === 'choice' && !s.options.some(o => o[0] === v)) v = s.def;
      out[s.key] = v;
    }
    return out;
  }
  function load() { try { values = sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { values = sanitize({}); } applyTheme(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* приватный режим */ } }
  const get = k => values[k];
  function set(patch, {silent = false} = {}) {
    values = sanitize({...values, ...patch});
    save(); applyTheme();
    if (!silent) for (const fn of listeners) fn(values);
  }
  function applyTheme() {
    const t = values.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  }
  const onChange = fn => listeners.add(fn);

  load();
  UI.Prefs = {SCHEMA, get, set, all: () => ({...values}), onChange, sanitize};
})(typeof window !== 'undefined' ? window : globalThis);
