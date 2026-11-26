/* XSatsu Студия · мастер печати (окно): тираж → проходы → пакеты, профили принтеров, лист совмещения.
 * Логика — в XS.PrintPlan, PDF — в XS.Export.run (тот же путь, что у обычной выгрузки). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const esc = XS.esc, I = (n, s = 16) => XS.Icons.icon(n, s);
  const LS = 'xsatsu-printers', DONE = 'xsatsu-print-done:';
  let tab = 'job', job = null, editing = null, running = false, cancel = false;

  /* ---------- профили принтеров: в аккаунте или в браузере ---------- */
  function store() { try { return localStorage; } catch (e) { return null; } }
  function profiles() {
    const fromAccount = UI.Account?.user() && Array.isArray(UI.Account.userSettings?.printers) ? UI.Account.userSettings.printers : null;
    let list = fromAccount;
    if (!list) { try { list = JSON.parse(store()?.getItem(LS) || '[]'); } catch (e) { list = []; } }
    return (Array.isArray(list) ? list : []).map(XS.PrintPlan.profile);
  }
  async function saveProfiles(list) {
    list = list.map(XS.PrintPlan.profile);
    try { store()?.setItem(LS, JSON.stringify(list)); } catch (e) { /* без хранилища — только на сеанс */ }
    if (UI.Account?.user()) await UI.Account.saveUserSetting('printers', list);
  }
  const byId = id => profiles().find(p => p.id === id) || null;

  /* ---------- настройки задания: в проекте ---------- */
  function opts() {
    const twoSided = S.doc.sides.length > 1;
    const d = {mode: twoSided ? 'duplex' : 'single', sheetRange: '', repeat: 1, batch: 100, main: '', inkjet: '', laser: ''};
    return {...d, ...(S.doc.output.print || {})};
  }
  function setOpt(patch) {
    const next = {...opts(), ...patch};
    if (S.readOnly) { S.doc.output.print = next; return; }
    S.doc.output = {...S.doc.output, print: next};
    UI.changed({skip: ['stage', 'layers', 'data', 'inspector']});
  }
  function buildJob() {
    const o = opts();
    return XS.PrintPlan.build(S.doc, {...o, scope: 'all', profiles: {main: byId(o.main), inkjet: byId(o.inkjet), laser: byId(o.laser)}});
  }
  const doneKey = () => DONE + (job?.signature || '');
  function done() { try { return new Set(JSON.parse(store()?.getItem(doneKey()) || '[]')); } catch (e) { return new Set(); } }
  function setDone(id, on) { const s = done(); if (on) s.add(id); else s.delete(id); try { store()?.setItem(doneKey(), JSON.stringify([...s])); } catch (e) { /* ничего */ } }

  /* ---------- окно ---------- */
  function dialog() {
    let d = $('printMaster');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'printMaster'; d.className = 'dialog wide';
      d.innerHTML = `<header class="dialog-head"><h2>Мастер печати</h2><div class="tabs inline-tabs pm-tabs"></div><span class="spacer"></span><button class="btn icon" data-close aria-label="Закрыть">${I('close')}</button></header>
        <div class="dialog-body pm-body"></div>
        <footer class="dialog-foot"><div class="progress" hidden><div class="bar"></div><span class="label"></span></div><span class="spacer"></span><button type="button" class="btn" data-stop hidden>Остановить</button></footer>`;
      d.querySelector('[data-close]').onclick = () => d.close();
      d.querySelector('[data-stop]').onclick = () => { cancel = true; };
      d.addEventListener('change', UI.safe(onChange));
      d.addEventListener('click', UI.safe(onClick));
      document.body.append(d);
    }
    return d;
  }
  function draw() {
    const d = dialog();
    d.querySelector('.pm-tabs').innerHTML = [['job', 'Тираж и проходы'], ['printers', 'Принтеры']].map(([id, t]) => `<button type="button" class="tab${tab === id ? ' active' : ''}" data-tab="${id}">${t}</button>`).join('');
    const body = d.querySelector('.pm-body');
    body.innerHTML = tab === 'job' ? jobView() : printersView();
    const sides = body.querySelector('select[name=sides]'); if (sides) sides.value = S.doc.output.sides || 'all';
  }

  const radio = (name, value, cur, label, hint = '', dis = false) => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${cur === value ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${label}${hint ? '<small>' + hint + '</small>' : ''}</span></label>`;
  function printerSelect(name, value, role) {
    const list = profiles();
    const opt = p => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.name)}${p.role !== 'any' ? ' — ' + XS.PrintPlan.ROLES[p.role].toLowerCase() : ''}</option>`;
    const sorted = [...list.filter(p => p.role === role), ...list.filter(p => p.role !== role)];
    return `<select name="${name}"><option value="">без поправок</option>${sorted.map(opt).join('')}</select>`;
  }

  function jobView() {
    const o = opts(), twoSided = S.doc.sides.length > 1;
    let err = '';
    try { job = buildJob(); } catch (e) { job = null; err = e.message; }
    const doneSet = done();
    const modes = XS.PrintPlan.MODES.map(([v, t, h]) => radio('mode', v, job?.mode || o.mode, t, h, !twoSided && (v === 'duplex' || v === 'manual'))).join('');
    const printers = (job?.mode || o.mode) === 'two'
      ? `<div class="f"><span>Струйный (цвет)</span>${printerSelect('inkjet', o.inkjet, 'inkjet')}</div><div class="f"><span>Лазерный (текст)</span>${printerSelect('laser', o.laser, 'laser')}</div>`
      : `<div class="f"><span>Принтер</span>${printerSelect('main', o.main, 'any')}</div>`;
    const summary = job ? `${job.records} ${plural(job.records, 'макет', 'макета', 'макетов')} → ${job.sheets} ${plural(job.sheets, 'лист', 'листа', 'листов')} (${esc(job.plan.label)}).
      Печатаем ${job.chosen}${job.repeat > 1 ? ' × ' + job.repeat + ' = ' + job.physical : ''} ${plural(job.physical, 'лист', 'листа', 'листов')}, ${job.passes.length} ${plural(job.passes.length, 'проход', 'прохода', 'проходов')}.` : '⚠ ' + esc(err);
    const next = job?.passes.find(p => !doneSet.has(p.id));
    const passes = job ? job.passes.map(p => {
      const isDone = doneSet.has(p.id), isNext = p === next;
      return `<li class="pm-pass${isDone ? ' done' : ''}${isNext ? ' next' : ''}">
        <div class="pm-pass-head"><span class="pm-num">${isDone ? I('check', 14) : p.step}</span>
          <div><b>${esc(p.label)}</b>${p.batchCount > 1 ? ` <span class="badge">пакет ${p.batch} из ${p.batchCount}</span>` : ''}
          <div class="muted small">${esc(p.printer)} · ${p.batchCount > 1 || job.repeat > 1 ? 'листы тиража ' + p.from + '–' + p.to + ' из ' + p.total : p.sheets + ' ' + plural(p.sheets, 'лист', 'листа', 'листов')} · ${p.pages.length} стр. PDF</div></div></div>
        ${p.hint ? `<p class="pm-hint">${esc(p.hint)}</p>` : ''}
        <div class="row pm-actions">
          <button type="button" class="btn${isNext ? ' primary' : ''}" data-print="${p.id}">${I('printer', 15)}Печатать</button>
          <button type="button" class="btn" data-pdf="${p.id}">${I('download', 15)}PDF</button>
          <span class="spacer"></span>
          <button type="button" class="btn${isDone ? '' : ' ghost'}" data-done="${p.id}">${isDone ? 'Отменить отметку' : I('check', 15) + 'Проход напечатан'}</button>
        </div></li>`;
    }).join('') : '';
    const left = job ? job.passes.filter(p => !doneSet.has(p.id)).length : 0;
    return `<div class="ex-grid pm-grid">
      <div class="ex-block"><b>Как печатать</b><div class="choices">${modes}</div>${printers}
        <p class="muted small">Поправки берутся из профиля принтера (вкладка «Принтеры») и складываются со сдвигами в окне выгрузки.</p></div>
      <div class="ex-block"><b>Тираж</b>
        <div class="f"><span>Листы</span><input type="text" name="sheetRange" value="${esc(o.sheetRange)}" placeholder="все${job ? ' (1–' + job.sheets + ')' : ''}"></div>
        <div class="f"><span>Повторить набор</span><div class="row"><input type="number" name="repeat" min="1" max="100" value="${o.repeat}"> <span class="muted small">раз</span></div></div>
        <div class="f"><span>Пакет</span><div class="row"><input type="number" name="batch" min="1" max="1000" value="${o.batch}"> <span class="muted small">листов в одном PDF</span></div></div>
        ${twoSided ? `<div class="f"><span>Стороны</span><select name="sides"><option value="all">обе</option><option value="front">только лицевая</option><option value="back">только оборот</option></select></div>` : ''}
        <p class="note">${summary}</p>
        <p class="muted small">Бумага, поля и раскладка — в окне «Выгрузка → Листы для печати». В окне печати браузера выберите масштаб 100% и ${job?.mode === 'duplex' ? 'двустороннюю печать' : 'одностороннюю печать'}, 1 экземпляр: весь тираж уже в PDF.</p>
      </div></div>
      ${job ? `<div class="pm-passes-head"><b>Проходы</b><span class="muted small">${left ? 'осталось ' + left : 'всё напечатано'}</span><span class="spacer"></span>${doneSet.size ? '<button type="button" class="btn ghost small" data-reset>Сбросить отметки</button>' : ''}</div><ol class="pm-passes">${passes}</ol>` : ''}`;
  }

  function printersView() {
    const list = profiles();
    const where = UI.Account?.user() ? 'Профили хранятся в вашем аккаунте.' : 'Профили хранятся в этом браузере. Войдите, чтобы они были на любом компьютере.';
    const rows = list.map(p => `<li class="pm-printer${editing === p.id ? ' open' : ''}">
      <div class="pm-pass-head"><span class="pm-num">${I('printer', 14)}</span><div><b>${esc(p.name)}</b> <span class="muted small">${XS.PrintPlan.ROLES[p.role]}</span>
        <div class="muted small">лицо ${fmtOff(p.offsetX, p.offsetY)} · оборот ${fmtOff(p.backOffsetX, p.backOffsetY)} · переворот по ${p.edge === 'short' ? 'короткому' : 'длинному'} краю${p.checkedAt ? ' · проверен ' + new Date(p.checkedAt).toLocaleDateString('ru-RU') : ''}</div></div>
        <span class="spacer"></span><button type="button" class="btn" data-cal="${p.id}">${I('target', 15)}Лист совмещения</button><button type="button" class="btn ghost" data-edit="${p.id}">${editing === p.id ? 'Свернуть' : 'Изменить'}</button></div>
      ${editing === p.id ? profileForm(p) : ''}</li>`).join('');
    return `<p class="note">Профиль — поправки конкретного принтера и лотка. Напечатайте лист совмещения, посмотрите на просвет, измерьте сдвиг крестов линейкой и впишите его сюда. ${where}</p>
      <ul class="pm-passes">${rows || '<li class="muted">Профилей пока нет.</li>'}</ul>
      <div class="row"><button type="button" class="btn primary" data-add>${I('plus', 15)}Добавить принтер</button><span class="spacer"></span><button type="button" class="btn" data-cal="">${I('target', 15)}Лист совмещения без поправок</button></div>`;
  }
  const fmtOff = (x, y) => (x || y) ? `${x > 0 ? '+' : ''}${x} / ${y > 0 ? '+' : ''}${y} мм` : 'без сдвига';
  function profileForm(p) {
    const n = (name, label) => `<label class="f"><span>${label}</span><input type="number" step="0.1" min="-20" max="20" name="${name}" value="${p[name]}"></label>`;
    return `<form class="pm-form" data-profile="${esc(p.id)}">
      <label class="f wide"><span>Название</span><input type="text" name="name" value="${esc(p.name)}"></label>
      <label class="f"><span>Назначение</span><select name="role">${Object.entries(XS.PrintPlan.ROLES).map(([v, t]) => `<option value="${v}" ${p.role === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f"><span>Переворот</span><select name="edge"><option value="long" ${p.edge === 'long' ? 'selected' : ''}>по длинному краю</option><option value="short" ${p.edge === 'short' ? 'selected' : ''}>по короткому краю</option></select></label>
      ${n('offsetX', 'Лицо X, мм')}${n('offsetY', 'Лицо Y, мм')}${n('backOffsetX', 'Оборот X, мм')}${n('backOffsetY', 'Оборот Y, мм')}
      <label class="check wide"><input type="checkbox" name="reverseBacks" ${p.reverseBacks ? 'checked' : ''}> Обороты в обратном порядке (стопка выходит лицом вверх)</label>
      <label class="f wide"><span>Как класть бумагу</span><input type="text" name="feed" value="${esc(p.feed)}" placeholder="например: лицом вниз, верхом к принтеру"></label>
      <label class="f wide"><span>Заметка</span><input type="text" name="note" value="${esc(p.note)}"></label>
      <div class="row wide"><button type="button" class="btn danger ghost" data-del="${esc(p.id)}">Удалить</button><span class="spacer"></span><button type="button" class="btn" data-checked="${esc(p.id)}">Совмещение проверено</button></div>
      <p class="muted small wide">Плюс — вправо и вниз (если смотреть на лицевую сторону). Поправка исправляет только равномерный сдвиг; масштаб и поля — в окне печати (100%, без подгонки).</p>
    </form>`;
  }

  /* ---------- события ---------- */
  async function onChange(e) {
    const t = e.target;
    const form = t.closest('form[data-profile]');
    if (form) {
      const id = form.dataset.profile;
      const list = profiles().map(p => p.id !== id ? p : XS.PrintPlan.profile({...p, [t.name]: t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value}));
      await saveProfiles(list);
      if (t.name === 'name' || t.name === 'role' || t.name === 'edge' || t.type === 'number') { const keep = document.activeElement?.name; draw(); if (keep && t.type !== 'number') dialog().querySelector(`[name="${keep}"]`)?.focus(); }
      return;
    }
    if (!t.name) return;
    let v = t.type === 'number' ? Number(t.value) : t.value;
    if (t.name === 'sides') { S.doc.output = {...S.doc.output, sides: v}; setOpt({}); draw(); return; }
    setOpt({[t.name]: v});
    draw();
  }
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || running) return;
    const ds = b.dataset;
    if (ds.tab) { tab = ds.tab; draw(); return; }
    if (ds.done !== undefined) { setDone(ds.done, !done().has(ds.done)); draw(); return; }
    if (ds.reset !== undefined) { try { store()?.removeItem(doneKey()); } catch (err) { /* ничего */ } draw(); return; }
    if (ds.print) return runPass(ds.print, true);
    if (ds.pdf) return runPass(ds.pdf, false);
    if (ds.add !== undefined) {
      const p = XS.PrintPlan.profile({name: 'Принтер ' + (profiles().length + 1)});
      await saveProfiles([...profiles(), p]); editing = p.id; draw(); return;
    }
    if (ds.edit) { editing = editing === ds.edit ? null : ds.edit; draw(); return; }
    if (ds.del) {
      if (!confirm('Удалить профиль принтера?')) return;
      await saveProfiles(profiles().filter(p => p.id !== ds.del)); editing = null; draw(); return;
    }
    if (ds.checked) { await saveProfiles(profiles().map(p => p.id === ds.checked ? {...p, checkedAt: new Date().toISOString()} : p)); draw(); UI.toast('Отмечено: совмещение проверено.'); return; }
    if (ds.cal !== undefined) {
      const p = ds.cal ? byId(ds.cal) : null;
      const win = global.open('', '_blank'); waitPage(win, 'Готовим лист совмещения…');
      try {
        const r = await XS.PrintPlan.calibration(p, {paper: S.doc.output.paper === 'card' ? 'a4' : S.doc.output.paper});
        show(r.blob, 'Лист совмещения' + (p ? ' — ' + p.name : '') + '.pdf', win);
        UI.toast('Лист совмещения: напечатайте обе стороны на одном листе в масштабе 100%.');
      } catch (err) { if (win) win.close(); throw err; }
    }
  }
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };

  function waitPage(win, text) { if (win) win.document.write('<p style="font:16px sans-serif;padding:24px">' + esc(text) + '</p>'); }
  function show(blob, name, win) {
    if (!win) { XS.download(blob, name); return; }
    const url = URL.createObjectURL(blob);
    if (!win.closed) win.location.href = url; else if (!global.open(url, '_blank')) XS.download(blob, name);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  }
  function progress(done, total, label) {
    const p = dialog().querySelector('.progress'); p.hidden = false;
    p.querySelector('.bar').style.setProperty('--p', Math.round(done / Math.max(1, total) * 100) + '%');
    p.querySelector('.label').textContent = label || '';
  }
  async function runPass(id, print) {
    const pass = job?.passes.find(p => p.id === id); if (!pass) return;
    // Вкладку открываем сразу по клику — иначе браузер сочтёт её всплывающим окном.
    const win = print ? global.open('', '_blank') : null;
    if (print) waitPage(win, 'Готовим «' + pass.label + '»…');
    running = true; cancel = false;
    const d = dialog(); d.querySelector('[data-stop]').hidden = false;
    try {
      const o = {...XS.Model.defaultOutput(S.doc.kind), ...S.doc.output, scope: 'all', packaging: 'sheets', layer: pass.layer, laserBlack: pass.laserBlack, pageList: pass.pages};
      const r = await XS.Export.run(S.doc, o, {progress, cancelled: () => cancel});
      if (r.localized && !S.readOnly) UI.changed({skip: ['layers', 'inspector']});
      const name = XS.Export.archiveName(S.doc, o, ' — проход ' + pass.step + (pass.batchCount > 1 ? ' пакет ' + pass.batch : '') + '.pdf');
      show(r.blob, name, win);
      UI.toast(print ? 'PDF открыт в новой вкладке. Печать: 100%, 1 экземпляр. После печати отметьте «Проход напечатан».' : 'Скачан ' + name, !!r.warnings.length);
    } catch (e) { if (win) win.close(); throw e; }
    finally { running = false; d.querySelector('[data-stop]').hidden = true; d.querySelector('.progress').hidden = true; }
  }

  async function open() {
    if (!S.doc) return;
    await XS.Fonts.ensureForDoc(S.doc);
    tab = 'job'; editing = null;
    draw();
    const d = dialog(); if (!d.open) d.showModal();
  }
  function init() {
    // Вкладка «Принтеры» доступна и из общих настроек.
    UI.Settings?.addTab({id: 'printers', title: 'Принтеры', render: body => {
      const p = document.createElement('p'); p.className = 'note';
      p.textContent = 'Профили принтеров: поправки сдвига, край переворота, порядок стопки. ' + (profiles().length ? 'Сейчас профилей: ' + profiles().length + '.' : 'Профилей пока нет.');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = S.doc ? 'Открыть мастер печати' : 'Откройте проект, чтобы настроить печать';
      b.disabled = !S.doc; b.onclick = () => { $('settingsDialog').close(); tab = 'printers'; open().then(() => { tab = 'printers'; draw(); }); };
      body.append(p, b);
    }});
  }
  UI.PrintMaster = {init, open, profiles, saveProfiles};
})(typeof window !== 'undefined' ? window : globalThis);
