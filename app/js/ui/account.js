/* XSatsu Студия · аккаунт: вход и регистрация (и по ссылке-приглашению), первый администратор, смена временного пароля, вкладки настроек (аккаунт, вход в админку),
 * конфликт сохранения, версии проекта, доступ (люди и гостевые ссылки: просмотр или правка без входа). Работает, только если на сайте установлен сервер (XS.Api.available). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$, Api = XS.Api;
  const esc = XS.esc, I = (n, s = 16) => XS.Icons.icon(n, s);
  const fmt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'}); };

  /* Универсальное окно: html + обработчик кнопок data-act. */
  function dialog(id, title, {wide = false} = {}) {
    let d = $(id);
    if (!d) {
      d = document.createElement('dialog');
      d.id = id; d.className = 'dialog' + (wide ? ' wide' : '');
      d.innerHTML = `<header class="dialog-head"><h2></h2><span class="spacer"></span><button class="btn icon" data-close aria-label="Закрыть">${I('close')}</button></header><div class="dialog-body"></div>`;
      d.querySelector('[data-close]').onclick = () => { if (!d.dataset.locked) d.close(); };
      d.addEventListener('cancel', e => { if (d.dataset.locked) e.preventDefault(); });
      document.body.append(d);
    }
    d.querySelector('h2').textContent = title;
    return {d, body: d.querySelector('.dialog-body'), show: () => { if (!d.open) d.showModal(); }};
  }
  const field = (label, name, type = 'text', value = '', extra = '') => `<label class="f wide"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
  const formData = form => Object.fromEntries([...form.querySelectorAll('[name]')].map(i => [i.name, i.type === 'checkbox' ? i.checked : i.value]));


  /* ---------- вход / регистрация / установка ---------- */
  function authDialog(mode = 'login', {locked = false, invite = ''} = {}) {
    const st = Api.state || {};
    if (st.setupNeeded) mode = 'setup';
    const {d, body, show} = dialog('authDialog', mode === 'setup' ? 'Первый запуск: администратор' : mode === 'register' ? 'Регистрация' : 'Вход в XSatsu Студию');
    if (locked) d.dataset.locked = '1'; else delete d.dataset.locked;
    const reg = st.registration;
    let html = '';
    if (mode === 'setup') {
      html = st.setupAllowed
        ? `<p class="note">На сервере ещё нет пользователей. Введите код установки (он в config.php на сервере, ключ <code>setup_token</code>) и создайте учётную запись администратора.</p>
           ${field('Код установки', 'token', 'text', '', 'autocomplete="off" required')}${field('Логин', 'login', 'text', '', 'autocomplete="username" required')}${field('Имя', 'name')}${field('Пароль (от 8 символов)', 'password', 'password', '', 'autocomplete="new-password" required')}`
        : '<p class="note">На сервере ещё нет пользователей. Администратор сайта создаёт первую учётную запись командой <code>php bin/create-admin.php</code> или задаёт код установки в config.php.</p>';
    } else if (mode === 'register') {
      html = `${reg === 'invite' ? field('Код приглашения', 'invite', 'text', invite, 'autocomplete="off" required') : ''}${field('Логин', 'login', 'text', '', 'autocomplete="username" required')}${field('Имя и фамилия', 'name')}${field('Почта (необязательно)', 'email', 'email')}${field('Пароль (от 8 символов)', 'password', 'password', '', 'autocomplete="new-password" required')}`;
    } else {
      html = `${field('Логин', 'login', 'text', '', 'autocomplete="username" required')}${field('Пароль', 'password', 'password', '', 'autocomplete="current-password" required')}`;
    }
    body.innerHTML = `<form class="auth-form">${html}<p class="auth-error error-text" hidden></p>
      <div class="dialog-actions">${mode === 'login' && reg !== 'closed' ? '<button type="button" class="link" data-mode="register">Регистрация' + (reg === 'invite' ? ' по приглашению' : '') + '</button>' : ''}${mode === 'register' ? '<button type="button" class="link" data-mode="login">У меня есть аккаунт</button>' : ''}
      <span class="spacer"></span>${locked ? '' : '<button type="button" class="btn" data-cancel>Работать без входа</button>'}${mode !== 'setup' || st.setupAllowed ? `<button class="btn primary">${mode === 'setup' ? 'Создать администратора' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}</button>` : ''}</div>
      ${mode === 'login' ? '<p class="muted small">Без входа проекты хранятся только в этом браузере. В аккаунте они доступны с любого компьютера, есть версии, корзина и совместная работа.</p>' : ''}</form>`;
    const form = body.querySelector('form');
    form.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => authDialog(b.dataset.mode, {locked, invite}); });
    form.querySelector('[data-cancel]')?.addEventListener('click', () => d.close());
    form.onsubmit = async e => {
      e.preventDefault();
      const err = form.querySelector('.auth-error'); err.hidden = true;
      try {
        await Api.call('POST', mode === 'setup' ? 'v1/auth/setup' : mode === 'register' ? 'v1/auth/register' : 'v1/auth/login', formData(form));
        d.close(); delete d.dataset.locked;
        UI.toast('Здравствуйте, ' + (Api.user().name || Api.user().login) + '!');
        await afterLogin();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    show();
    setTimeout(() => (invite ? form.querySelector('[name=login]') : form.querySelector('input'))?.focus(), 30);
  }
  /* Ссылка-приглашение #/invite/<код>: сразу регистрация с кодом. */
  function openInvite(code) {
    history.replaceState(null, '', '#/');
    if (!Api.available) return;
    if (Api.user()) { UI.toast('Вы уже вошли как ' + Api.user().login + '. Чтобы зарегистрировать другого человека, сначала выйдите.'); return; }
    if (Api.state?.registration === 'closed') { UI.toast('Регистрация на сайте сейчас закрыта.', true); return; }
    authDialog('register', {invite: code});
  }

  async function afterLogin() {
    await loadSettings();
    if (!S.doc && !UI.Admin?.isOpen()) await UI.Home.render();
    paint();
    forcePassword();
  }
  async function logout() {
    await UI.flush?.();
    await Api.logout();
    XS.Store.remote.meta.clear();
    if (S.doc && XS.Store.where(S.doc.id) !== 'local') await UI.goHome(); else if (!S.doc) await UI.Home.render();
    paint();
    UI.toast('Вы вышли из аккаунта.');
    if (Api.state?.system?.localMode === false) authDialog('login', {locked: true});
  }

  /* ---------- настройки пользователя: синхронизация с UI.Prefs ---------- */
  let applying = false;
  async function loadSettings() {
    try {
      const r = await Api.call('GET', 'v1/settings');
      Api.state.system = r.system;
      if (r.user?.prefs) { applying = true; UI.Prefs.set(r.user.prefs); applying = false; }
      Account.userSettings = r.user || {};
      paintNotice();
    } catch (e) { console.warn(e); }
  }
  const pushPrefs = XS.debounce(() => { if (Api.user()) Api.call('PUT', 'v1/settings/user', {prefs: UI.Prefs.all()}).catch(e => console.warn(e)); }, 800);
  async function saveUserSetting(key, value) {
    Account.userSettings = {...Account.userSettings, [key]: value};
    if (Api.user()) await Api.call('PUT', 'v1/settings/user', {[key]: value});
  }

  /* ---------- кнопка аккаунта ---------- */
  function paint() {
    const u = Api.user();
    document.querySelectorAll('[data-account]').forEach(btn => {
      btn.hidden = !Api.available;
      btn.innerHTML = u ? I('user', 16) + '<span class="acc-name">' + esc(u.name || u.login) + '</span>' : I('user', 16) + '<span>Войти</span>';
      btn.title = u ? 'Аккаунт: ' + u.login + (u.role === 'admin' ? ' (администратор)' : '') : 'Войти: проекты на сервере, версии, совместная работа';
    });
    document.querySelectorAll('[data-server-only]').forEach(el => { el.hidden = !u; });
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = u?.role !== 'admin'; });
    UI.Settings?.redraw && $('settingsDialog')?.open && UI.Settings.redraw();
  }
  function paintNotice() {
    const n = $('siteNotice'); if (!n) return;
    const sys = Api.state?.system || {};
    const maint = sys.maintenance ? (sys.maintenanceText || 'На сайте идут технические работы: изменения временно не сохраняются.') : '';
    const text = [maint, sys.notice || ''].filter(Boolean).join(' · ');
    n.hidden = !text; n.textContent = text;
    n.classList.toggle('maintenance', !!maint);
  }
  function accountClick(e) {
    if (!Api.user()) return authDialog('login');
    const menu = $('accountMenu');
    const r = e.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px'; menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
    const u = Api.user();
    menu.innerHTML = `<div class="menu-head"><b>${esc(u.name || u.login)}</b><span class="muted small">${esc(u.login)}${u.role === 'admin' ? ' · администратор' : ''}</span></div>
      <button data-a="account">${I('settings')}Аккаунт и настройки</button>${u.role === 'admin' ? `<button data-a="admin">${I('shield')}Админка</button><button data-a="admin/users">${I('users')}Пользователи</button>` : ''}<hr><button data-a="logout">${I('logout')}Выйти</button>`;
    menu.hidden = false;
    menu.onclick = UI.safe(async ev => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
      menu.hidden = true;
      if (a === 'logout') await logout(); else if (a.startsWith('admin')) location.hash = '#/' + a; else UI.Settings.open(a);
    });
    e.stopPropagation();
  }

  /* ---------- вкладки настроек ---------- */
  function accountTab(body) {
    const u = Api.user();
    body.innerHTML = `<form class="stack"><div class="settings-grid2">${field('Логин', 'login', 'text', u.login, 'disabled')}${field('Имя', 'name', 'text', u.name)}${field('Почта', 'email', 'email', u.email || '')}</div>
      <h3>Сменить пароль</h3><div class="settings-grid2">${field('Текущий пароль', 'password', 'password', '', 'autocomplete="current-password"')}${field('Новый пароль', 'newPassword', 'password', '', 'autocomplete="new-password"')}</div>
      <p class="muted small">После смены пароля вход на других устройствах завершится.</p>
      <div class="dialog-actions"><button type="button" class="btn" data-logout>${I('logout')}Выйти</button><span class="spacer"></span><button class="btn primary">Сохранить</button></div></form>`;
    const form = body.querySelector('form');
    form.querySelector('[data-logout]').onclick = UI.safe(async () => { $('settingsDialog').close(); await logout(); });
    form.onsubmit = UI.safe(async e => { e.preventDefault(); const v = formData(form); delete v.login; await Api.call('PATCH', 'v1/auth/me', v); paint(); UI.toast('Сохранено.'); accountTab(body); });
  }
  /* Управление сайтом переехало на отдельный экран — здесь только вход в него. */
  function adminTab(body) {
    body.innerHTML = `<div class="adm-tab-teaser"><p>Пользователи и приглашения, все проекты и гостевые ссылки, журнал, квоты, настройки сайта и состояние сервера — в админке.</p>
      <button class="btn primary" type="button" data-go>${I('shield')}Открыть админку</button></div>`;
    body.querySelector('[data-go]').onclick = () => { $('settingsDialog').close(); location.hash = '#/admin'; };
  }

  /* Временный пароль от администратора: пока не задан свой, работать нельзя (сервер тоже не даст сохранять). */
  function forcePassword() {
    const u = Api.user();
    if (!u || !u.mustChangePassword) return false;
    const {d, body, show} = dialog('mustChangeDialog', 'Задайте свой пароль');
    d.dataset.locked = '1';
    body.innerHTML = `<form class="auth-form"><p class="note">Администратор выдал вам временный пароль. Придумайте свой — не короче 8 символов.</p>
      ${field('Временный пароль', 'password', 'password', '', 'autocomplete="current-password" required')}${field('Новый пароль', 'newPassword', 'password', '', 'autocomplete="new-password" minlength="8" required')}${field('Новый пароль ещё раз', 'again', 'password', '', 'autocomplete="new-password" minlength="8" required')}
      <p class="auth-error error-text" hidden></p><div class="dialog-actions"><button type="button" class="link" data-out>Выйти</button><span class="spacer"></span><button class="btn primary">Сохранить пароль</button></div></form>`;
    const form = body.querySelector('form');
    form.querySelector('[data-out]').onclick = UI.safe(async () => { delete d.dataset.locked; d.close(); await logout(); });
    form.onsubmit = async e => {
      e.preventDefault();
      const v = formData(form), err = form.querySelector('.auth-error'); err.hidden = true;
      try {
        if (v.newPassword !== v.again) throw new Error('Пароли не совпадают.');
        await Api.call('PATCH', 'v1/auth/me', {password: v.password, newPassword: v.newPassword});
        delete d.dataset.locked; d.close(); paint();
        UI.toast('Пароль сохранён. Добро пожаловать!', false, {seal: true});
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    show();
    return true;
  }

  /* ---------- конфликт сохранения ---------- */
  function conflict(e) {
    const {d, body, show} = dialog('conflictDialog', 'Проект изменён в другом месте');
    const who = e.data.updatedBy ? ' (' + esc(e.data.updatedBy) + ', ' + fmt(e.data.updatedAt) + ')' : '';
    body.innerHTML = `<p>Пока вы работали, проект сохранили в другом окне или это сделал другой человек${who}. Ваши изменения пока не сохранены.</p>
      <div class="choice-list">
        <button class="btn" data-c="copy">${I('copy')}Сохранить мои изменения как копию</button>
        <button class="btn" data-c="theirs">${I('restore')}Открыть сохранённую версию (мои изменения пропадут)</button>
        <button class="btn danger" data-c="force">${I('upload')}Перезаписать моей версией</button></div>
      <p class="muted small">Перезапись не теряет чужую работу навсегда: она останется в «Проект → Версии».</p>`;
    body.onclick = UI.safe(async ev => {
      const c = ev.target.closest('[data-c]')?.dataset.c; if (!c) return;
      d.close();
      if (c === 'force') { await XS.Store.remote.save(S.doc, null, {force: true, note: 'Перезапись при конфликте'}); UI.setSaveState('Сохранено'); UI.toast('Сохранено поверх. Прошлая версия — в «Версиях».'); }
      if (c === 'theirs') { if (S.link) { const t = S.link; S.link = ''; await openLink(t); } else await UI.open(await XS.Store.remote.get(S.doc.id)); }
      if (c === 'copy') { const copy = XS.clone(S.doc); copy.id = XS.uid('doc'); copy.title += ' (мои изменения)'; await UI.create(copy); UI.toast('Ваши изменения сохранены копией.'); }
    });
    show();
  }

  /* ---------- версии ---------- */
  async function versions() {
    if (XS.Store.where(S.doc.id) !== 'remote') throw new Error('Версии есть у проектов в аккаунте. Перенесите проект: на главной «В этом браузере → В аккаунт».');
    if (S.link) throw new Error('Проект открыт по ссылке: версии видит владелец. Ваши правки сохраняются в них с вашей подписью.');
    await UI.flush();
    const {body, show} = dialog('versionsDialog', 'Версии проекта', {wide: true});
    const draw = async () => {
      const list = await XS.Store.remote.revisions(S.doc.id);
      body.innerHTML = `<div class="row-form-inline"><input type="text" placeholder="Название версии, например «Перед печатью»" data-note>${S.readOnly ? '' : '<button class="btn primary" data-save>' + I('history', 15) + 'Сохранить версию</button>'}</div>
        <p class="muted small">Автосохранение делает версию не чаще раза в 10 минут. Вернуть версию можно в любой момент — текущее состояние тоже останется в списке.</p>
        <ol class="versions">${list.map(v => `<li><div><b>${v.note ? esc(v.note) : 'Автосохранение'}</b><span class="muted small">${fmt(v.at)} · ${esc(v.author || '')} · №${v.revision}</span></div><span class="spacer"></span><button class="btn small" data-copy="${v.revision}">Открыть копией</button>${S.readOnly ? '' : `<button class="btn small" data-restore="${v.revision}">Вернуть</button>`}</li>`).join('')}</ol>`;
      body.querySelector('[data-save]')?.addEventListener('click', UI.safe(async () => { await UI.flush(); await XS.Store.remote.saveVersion(S.doc.id, body.querySelector('[data-note]').value); UI.toast('Версия сохранена.'); await draw(); }));
      body.querySelectorAll('[data-restore]').forEach(b => { b.onclick = UI.safe(async () => {
        if (!confirm('Вернуть проект к версии №' + b.dataset.restore + '? Текущее состояние останется в списке версий.')) return;
        await UI.flush(); await XS.Store.remote.saveVersion(S.doc.id, 'До возврата к №' + b.dataset.restore);
        const old = await UI.busy('Загружаем версию…', () => XS.Store.remote.revision(S.doc.id, b.dataset.restore));
        S.history.record(S.doc); old.id = S.doc.id; S.doc = old; UI.changed(); UI.Stage.fit();
        $('versionsDialog').close(); UI.toast('Проект возвращён к версии №' + b.dataset.restore + '. Отменить — Ctrl+Z.');
      }); });
      body.querySelectorAll('[data-copy]').forEach(b => { b.onclick = UI.safe(async () => {
        const old = await UI.busy('Загружаем версию…', () => XS.Store.remote.revision(S.doc.id, b.dataset.copy));
        old.id = XS.uid('doc'); old.title += ' (версия ' + b.dataset.copy + ')';
        $('versionsDialog').close(); await UI.create(old); UI.toast('Открыта копия версии.');
      }); });
    };
    await draw(); show();
  }

  /* ---------- доступ ---------- */
  const DAYS = [[1, '1 день'], [7, '7 дней'], [30, '30 дней'], [365, 'год'], [0, 'без срока']];
  const linkUrl = t => location.origin + location.pathname + '#/link/' + t;
  function linkLine(s) {
    const until = s.expired ? '<span class="bad">срок истёк</span>' : s.expiresAt ? 'до ' + fmt(s.expiresAt) : 'без срока';
    const used = s.opens ? 'открывали ' + s.opens + ' раз' + (s.edits ? ' · сохранений правок: ' + s.edits : '') + ' · последний раз ' + fmt(s.lastUsedAt) : 'ещё не открывали';
    return `<li class="share-link${s.expired ? ' is-expired' : ''}">${I(s.permission === 'edit' ? 'text' : 'eye', 15)}<div class="share-main"><b>${esc(s.label || 'Гостевая ссылка')}</b>
      <span class="muted small">${until} · ${used}</span></div><span class="spacer"></span>
      <select data-perm="${s.id}" aria-label="Права по ссылке"><option value="edit"${s.permission === 'edit' ? ' selected' : ''}>правит и печатает</option><option value="view"${s.permission === 'view' ? ' selected' : ''}>смотрит и печатает</option></select>
      <select data-days="${s.id}" aria-label="Срок ссылки"><option value="">продлить…</option>${DAYS.map(([d, t]) => `<option value="${d}">${d ? 'на ' + t : t}</option>`).join('')}</select>
      <button class="link" data-del="${s.id}">отозвать</button></li>`;
  }
  async function share() {
    if (XS.Store.where(S.doc.id) !== 'remote') throw new Error('Делиться можно проектами в аккаунте. Перенесите проект на главной: «В этом браузере → В аккаунт».');
    if (XS.Store.remote.meta.get(S.doc.id)?.permission !== 'owner' || S.link) throw new Error('Доступ настраивает владелец проекта.');
    const {body, show} = dialog('shareDialog', 'Доступ к проекту', {wide: true});
    const draw = (r, token, perm) => {
      const people = r.shares.filter(s => !s.link), links = r.shares.filter(s => s.link);
      body.innerHTML = `<h3 class="share-h">${I('link', 16)} Ссылка для гостей — без регистрации</h3>
        <p class="muted small">Отправьте ссылку коллеге: он откроет проект в браузере без входа, сможет поправить, выгрузить PDF и распечатать. Правки сохраняются в этот проект, в «Версиях» они подписаны, и любую можно откатить.</p>
        <form class="share-form" data-link>
          <label class="f f-stack"><span>Что можно</span><select name="permission"><option value="edit">править и печатать</option><option value="view">только смотреть и печатать</option></select></label>
          <label class="f f-stack"><span>Срок</span><select name="days">${DAYS.map(([d, t]) => `<option value="${d}"${d === 7 ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="f f-stack"><span>Для кого (необязательно)</span><input type="text" name="label" maxlength="100" placeholder="например, Петрову — подписи"></label>
          <button class="btn primary">${I('link', 15)}Создать ссылку</button></form>
        ${token ? `<div class="note share-new"><b>Ссылка ${perm === 'edit' ? 'на правку' : 'на просмотр'} готова.</b> Скопируйте её сейчас — второй раз она не показывается (можно создать новую).
          <div class="row-form-inline"><input type="text" class="copy-input" readonly value="${esc(linkUrl(token))}"><button type="button" class="btn small" data-copylink>${I('copy', 14)}Копировать</button>${navigator.share ? `<button type="button" class="btn small" data-sendlink>${I('share', 14)}Отправить</button>` : ''}</div>
          ${perm === 'edit' ? '<span class="muted small">Любой, у кого есть эта ссылка, может менять проект. Отправляйте её лично, а когда работа сделана — отзовите.</span>' : ''}</div>` : ''}
        <ul class="plain-list shares">${links.map(linkLine).join('') || '<li class="muted">Ссылок пока нет.</li>'}</ul>
        <h3 class="share-h">${I('users', 16)} Коллеги с аккаунтом</h3>
        <form class="row-form-inline" data-add><input type="text" name="login" placeholder="Логин коллеги" required><select name="permission"><option value="edit">может редактировать</option><option value="view">только просмотр</option></select><button class="btn">Открыть доступ</button></form>
        <ul class="plain-list shares">${people.map(s => `<li>${I('user', 15)} ${esc(s.name || s.login)} <span class="muted small">${esc(s.login)}</span> · ${s.permission === 'edit' ? 'редактирует' : 'смотрит'}<span class="spacer"></span><button class="link" data-del="${s.id}">убрать</button></li>`).join('') || '<li class="muted">Проект видите только вы.</li>'}</ul>`;
      body.querySelector('[data-add]').onsubmit = UI.safe(async e => { e.preventDefault(); draw(await XS.Store.remote.share(S.doc.id, formData(e.target))); UI.toast('Доступ открыт.'); });
      body.querySelector('[data-link]').onsubmit = UI.safe(async e => {
        e.preventDefault();
        const f = formData(e.target);
        await UI.flush(); // гость должен увидеть последние правки
        const r2 = await XS.Store.remote.share(S.doc.id, {link: true, permission: f.permission, days: +f.days, label: f.label});
        draw(r2, r2.token, f.permission);
        body.querySelector('.copy-input')?.select();
      });
      const url = () => body.querySelector('.copy-input')?.value || '';
      body.querySelector('[data-copylink]')?.addEventListener('click', () => { body.querySelector('.copy-input').select(); navigator.clipboard?.writeText(url()); UI.toast('Ссылка скопирована.'); });
      body.querySelector('[data-sendlink]')?.addEventListener('click', () => navigator.share({title: S.doc.title, text: 'Проект «' + S.doc.title + '» в XSatsu Студии', url: url()}).catch(() => {}));
      body.querySelectorAll('[data-del]').forEach(b => { b.onclick = UI.safe(async () => draw(await XS.Store.remote.unshare(S.doc.id, b.dataset.del))); });
      body.querySelectorAll('[data-perm]').forEach(sel => { sel.onchange = UI.safe(async () => { draw(await XS.Store.remote.updateShare(S.doc.id, sel.dataset.perm, {permission: sel.value})); UI.toast(sel.value === 'edit' ? 'По ссылке снова можно править.' : 'По ссылке теперь только просмотр.'); }); });
      body.querySelectorAll('[data-days]').forEach(sel => { sel.onchange = UI.safe(async () => { if (sel.value === '') return; draw(await XS.Store.remote.updateShare(S.doc.id, sel.dataset.days, {days: +sel.value})); UI.toast('Срок ссылки изменён.'); }); });
    };
    draw(await XS.Store.remote.shares(S.doc.id));
    show();
  }

  /* ---------- открыть по ссылке ---------- */
  async function openLink(token) {
    const doc = await UI.busy('Открываем проект по ссылке…', () => XS.Store.remote.byLink(token, {progress: UI.busyText}));
    const m = XS.Store.remote.meta.get(doc.id) || {};
    const edit = m.permission === 'edit';
    await UI.open(doc, {readOnly: !edit, link: token});
    UI.warnMissingFiles(doc);
    if (!edit) { UI.toast('Проект открыт по ссылке для просмотра: выгрузка и печать работают. Чтобы менять — «Проект → Сделать копию».'); return; }
    if (!Api.user() && !XS.Store.remote.guestName()) guestDialog(doc, m);
    else UI.toast('Проект «' + doc.title + '» открыт по ссылке' + (m.owner ? ' от ' + m.owner : '') + ': правки сохраняются сами и попадают владельцу.');
  }
  /* Гость: как подписать правки (необязательно), коротко — что можно. */
  function guestDialog(doc, m) {
    const {d, body, show} = dialog('guestDialog', 'Вас пригласили поправить проект');
    body.innerHTML = `<p><b>${esc(doc.title)}</b>${m.owner ? ' · владелец — ' + esc(m.owner) : ''}${m.expiresAt ? '<br><span class="muted small">Ссылка действует до ' + fmt(m.expiresAt) + '.</span>' : ''}</p>
      <p class="muted small">Регистрироваться не нужно. Правки сохраняются сами и сразу попадают владельцу, в «Версиях» видно, кто что менял. Печать и PDF — кнопка «Печать» сверху.</p>
      <form class="auth-form" data-guest>${field('Как вас подписать в истории правок', 'name', 'text', '', 'maxlength="60" autocomplete="name" placeholder="Имя и фамилия"')}
      <div class="dialog-actions"><span class="spacer"></span><button type="submit" class="btn primary">Начать</button></div></form>`;
    body.querySelector('[data-guest]').onsubmit = e => { e.preventDefault(); XS.Store.remote.guestName(e.target.querySelector('[name=name]').value); d.close(); };
    show();
    body.querySelector('input')?.focus();
  }

  async function init() {
    document.querySelectorAll('[data-account]').forEach(b => { b.onclick = UI.safe(accountClick); });
    document.addEventListener('click', e => { const m = $('accountMenu'); if (m && !m.contains(e.target)) m.hidden = true; });
    UI.Prefs.onChange(() => { if (!applying) pushPrefs(); });
    UI.Settings.addTab({id: 'account', title: 'Аккаунт', visible: () => !!Api.user(), render: accountTab});
    UI.Settings.addTab({id: 'admin', title: 'Админка', visible: () => Api.user()?.role === 'admin', render: adminTab});
    const st = await Api.init();
    paint();
    if (!st) return;
    await loadSettings();
    paint();
    if (forcePassword()) return;
    if (st.setupNeeded && st.setupAllowed) authDialog('setup');
    else if (!st.user && Api.state.system?.localMode === false && !/^#\/(link|form|invite)\//.test(location.hash)) authDialog('login', {locked: true});
  }

  const Account = UI.Account = {init, authDialog, conflict, versions, share, openLink, openInvite, paint, paintNotice, saveUserSetting, userSettings: {}, user: () => Api.user()};
})(typeof window !== 'undefined' ? window : globalThis);
