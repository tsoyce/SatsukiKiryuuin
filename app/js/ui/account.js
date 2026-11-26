/* XSatsu Студия · аккаунт: вход и регистрация, первый администратор, вкладки настроек (аккаунт, сайт, пользователи, журнал),
 * конфликт сохранения, версии проекта, доступ (люди и ссылка). Работает, только если на сайте установлен сервер (XS.Api.available). */
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

  const newPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map(x => a[x % a.length]).join(''); };

  /* ---------- вход / регистрация / установка ---------- */
  function authDialog(mode = 'login', {locked = false} = {}) {
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
      html = `${reg === 'invite' ? field('Код приглашения', 'invite', 'text', '', 'autocomplete="off" required') : ''}${field('Логин', 'login', 'text', '', 'autocomplete="username" required')}${field('Имя и фамилия', 'name')}${field('Почта (необязательно)', 'email', 'email')}${field('Пароль (от 8 символов)', 'password', 'password', '', 'autocomplete="new-password" required')}`;
    } else {
      html = `${field('Логин', 'login', 'text', '', 'autocomplete="username" required')}${field('Пароль', 'password', 'password', '', 'autocomplete="current-password" required')}`;
    }
    body.innerHTML = `<form class="auth-form">${html}<p class="auth-error error-text" hidden></p>
      <div class="dialog-actions">${mode === 'login' && reg !== 'closed' ? '<button type="button" class="link" data-mode="register">Регистрация' + (reg === 'invite' ? ' по приглашению' : '') + '</button>' : ''}${mode === 'register' ? '<button type="button" class="link" data-mode="login">У меня есть аккаунт</button>' : ''}
      <span class="spacer"></span>${locked ? '' : '<button type="button" class="btn" data-cancel>Работать без входа</button>'}${mode !== 'setup' || st.setupAllowed ? `<button class="btn primary">${mode === 'setup' ? 'Создать администратора' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}</button>` : ''}</div>
      ${mode === 'login' ? '<p class="muted small">Без входа проекты хранятся только в этом браузере. В аккаунте они доступны с любого компьютера, есть версии, корзина и совместная работа.</p>' : ''}</form>`;
    const form = body.querySelector('form');
    form.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => authDialog(b.dataset.mode, {locked}); });
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
    setTimeout(() => form.querySelector('input')?.focus(), 30);
  }

  async function afterLogin() {
    await loadSettings();
    if (!S.doc) await UI.Home.render();
    paint();
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
    UI.Settings?.redraw && $('settingsDialog')?.open && UI.Settings.redraw();
  }
  function paintNotice() {
    const n = $('siteNotice'); if (!n) return;
    const text = Api.state?.system?.notice || '';
    n.hidden = !text; n.textContent = text;
  }
  function accountClick(e) {
    if (!Api.user()) return authDialog('login');
    const menu = $('accountMenu');
    const r = e.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px'; menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
    const u = Api.user();
    menu.innerHTML = `<div class="menu-head"><b>${esc(u.name || u.login)}</b><span class="muted small">${esc(u.login)}${u.role === 'admin' ? ' · администратор' : ''}</span></div>
      <button data-a="account">${I('settings')}Аккаунт и настройки</button>${u.role === 'admin' ? `<button data-a="users">${I('users')}Пользователи</button><button data-a="site">${I('shield')}Настройки сайта</button>` : ''}<hr><button data-a="logout">${I('logout')}Выйти</button>`;
    menu.hidden = false;
    menu.onclick = UI.safe(async ev => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
      menu.hidden = true;
      if (a === 'logout') await logout(); else UI.Settings.open(a);
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
  async function siteTab(body) {
    const sys = (await Api.call('GET', 'v1/settings')).system;
    const stats = await Api.call('GET', 'v1/admin/stats');
    const mb = n => (n / 1048576).toFixed(1) + ' МБ';
    body.innerHTML = `<form class="stack">
      <label class="f wide"><span>Регистрация</span><select name="registration"><option value="invite">по приглашению</option><option value="open">открытая</option><option value="closed">закрыта (учётные записи создаёт админ)</option></select></label>
      <label class="check"><input type="checkbox" name="localMode" ${sys.localMode ? 'checked' : ''}> Можно работать без входа (проекты в браузере)</label>
      ${field('Срок хранения корзины, дней', 'trashDays', 'number', sys.trashDays, 'min="1" max="365"')}
      ${field('Название сайта', 'siteName', 'text', sys.siteName)}
      <label class="f wide"><span>Объявление на главной</span><textarea name="notice" rows="2" maxlength="500">${esc(sys.notice)}</textarea></label>
      <div class="dialog-actions"><span class="spacer"></span><button class="btn primary">Сохранить</button></div></form>
      <h3>Сервер</h3><div class="stats">${[['Пользователей', stats.users], ['Проектов', stats.projects], ['В корзине', stats.trash], ['Версий', stats.revisions], ['Файлов', stats.assets + ' · ' + mb(stats.assetBytes)], ['Документы', mb(stats.docBytes)], ['Версия', stats.version], ['PHP', stats.php], ['База', stats.db], ['Схема', stats.schema]].map(([k, v]) => `<div><span class="muted small">${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    const form = body.querySelector('form');
    form.registration.value = sys.registration;
    form.onsubmit = UI.safe(async e => {
      e.preventDefault();
      const v = formData(form); v.trashDays = Math.round(+v.trashDays);
      const r = await Api.call('PUT', 'v1/settings/system', v);
      Api.state.system = r.system; Api.state.registration = r.system.registration; paintNotice();
      UI.toast('Настройки сайта сохранены.');
    });
  }
  async function usersTab(body) {
    const [{users}, {invites}] = await Promise.all([Api.call('GET', 'v1/admin/users'), Api.call('GET', 'v1/admin/invites')]);
    const me = Api.user();
    body.innerHTML = `<table class="data-table users-table"><thead><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Проекты</th><th>Последний вход</th><th></th></tr></thead><tbody>${users.map(u => `<tr data-id="${u.id}" class="${u.status === 'blocked' ? 'muted' : ''}">
      <td>${esc(u.login)}</td><td>${esc(u.name)}</td><td><select data-role ${u.id === me.id ? 'disabled' : ''}><option value="user">пользователь</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>администратор</option></select></td>
      <td>${u.projects}</td><td>${u.lastLoginAt ? fmt(u.lastLoginAt) : '—'}</td>
      <td class="nowrap"><button class="btn small" data-pass title="Задать новый пароль">Пароль…</button> ${u.id === me.id ? '' : `<button class="btn small ${u.status === 'blocked' ? '' : 'danger'}" data-block>${u.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}</button>`}</td></tr>`).join('')}</tbody></table>
      <h3>Добавить пользователя</h3><form class="row-form-inline" data-new>${field('Логин', 'login', 'text', '', 'required')}${field('Имя', 'name')}${field('Пароль', 'password', 'text', newPassword(), 'required')}<button class="btn primary">Добавить</button></form>
      <h3>Приглашения</h3><div class="row-form-inline"><input type="text" placeholder="Для кого (заметка)" data-note><button class="btn" data-invite>${I('plus', 14)}Создать код</button></div><div data-code></div>
      <ul class="plain-list">${invites.map(i => `<li>${esc(i.note || 'без заметки')} · ${i.usedBy ? 'использовано: ' + esc(i.usedBy) : i.expiresAt && new Date(i.expiresAt) < new Date() ? 'истекло' : 'действует до ' + fmt(i.expiresAt)}${!i.usedBy ? ` <button class="link" data-del-invite="${i.id}">отозвать</button>` : ''}</li>`).join('') || '<li class="muted">Пока нет.</li>'}</ul>`;
    body.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id, u = users.find(x => String(x.id) === id);
      tr.querySelector('[data-role]').onchange = UI.safe(async e => { await Api.call('PATCH', 'v1/admin/users/' + id, {role: e.target.value}); UI.toast('Роль изменена.'); });
      tr.querySelector('[data-pass]').onclick = UI.safe(async () => { const p = prompt('Новый пароль для ' + u.login + ' (от 8 символов):'); if (!p) return; await Api.call('PATCH', 'v1/admin/users/' + id, {password: p}); UI.toast('Пароль изменён. Передайте его пользователю.'); });
      tr.querySelector('[data-block]')?.addEventListener('click', UI.safe(async () => { await Api.call('PATCH', 'v1/admin/users/' + id, {status: u.status === 'blocked' ? 'active' : 'blocked'}); await usersTab(body); }));
    });
    body.querySelector('[data-new]').onsubmit = UI.safe(async e => { e.preventDefault(); const v = formData(e.target); await Api.call('POST', 'v1/admin/users', v); UI.toast('Пользователь ' + v.login + ' добавлен. Пароль: ' + v.password); await usersTab(body); });
    body.querySelector('[data-invite]').onclick = UI.safe(async () => {
      const r = await Api.call('POST', 'v1/admin/invites', {note: body.querySelector('[data-note]').value});
      await usersTab(body);
      body.querySelector('[data-code]').innerHTML = `<p class="note">Код приглашения: <b class="code">${esc(r.code)}</b> — действует 14 дней, один раз. Человек вводит его в «Войти → Регистрация».</p>`;
    });
    body.querySelectorAll('[data-del-invite]').forEach(b => { b.onclick = UI.safe(async () => { await Api.call('DELETE', 'v1/admin/invites/' + b.dataset.delInvite); await usersTab(body); }); });
  }
  const ACTIONS = {'login': 'вход', 'setup': 'установка', 'register': 'регистрация', 'password': 'смена пароля', 'settings': 'настройки сайта', 'project.create': 'создан проект', 'project.trash': 'в корзину', 'project.restore': 'восстановлен', 'project.purge': 'удалён навсегда', 'project.share': 'доступ', 'project.unshare': 'доступ отозван', 'project.link': 'ссылка', 'project.version': 'версия', 'user.create': 'новый пользователь', 'user.update': 'изменён пользователь', 'invite.create': 'приглашение'};
  async function auditTab(body) {
    const {events} = await Api.call('GET', 'v1/admin/audit', undefined, {query: {limit: 300}});
    body.innerHTML = `<table class="data-table"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>IP</th></tr></thead><tbody>${events.map(e => `<tr><td class="nowrap">${fmt(e.at)}</td><td>${esc(e.actor || '—')}</td><td>${esc(ACTIONS[e.action] || e.action)}</td><td>${esc(e.target)}${e.detail ? ' <span class="muted small">' + esc(JSON.stringify(e.detail)) + '</span>' : ''}</td><td class="muted small">${esc(e.ip)}</td></tr>`).join('')}</tbody></table>`;
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
      if (c === 'theirs') { const fresh = await XS.Store.remote.get(S.doc.id); await UI.open(fresh); }
      if (c === 'copy') { const copy = XS.clone(S.doc); copy.id = XS.uid('doc'); copy.title += ' (мои изменения)'; await UI.create(copy); UI.toast('Ваши изменения сохранены копией.'); }
    });
    show();
  }

  /* ---------- версии ---------- */
  async function versions() {
    if (XS.Store.where(S.doc.id) !== 'remote') throw new Error('Версии есть у проектов в аккаунте. Перенесите проект: на главной «В этом браузере → В аккаунт».');
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
  async function share() {
    if (XS.Store.where(S.doc.id) !== 'remote') throw new Error('Делиться можно проектами в аккаунте. Перенесите проект на главной: «В этом браузере → В аккаунт».');
    if (XS.Store.remote.meta.get(S.doc.id)?.permission !== 'owner') throw new Error('Доступ настраивает владелец проекта.');
    const {body, show} = dialog('shareDialog', 'Доступ к проекту');
    const linkUrl = t => location.origin + location.pathname + '#/link/' + t;
    const draw = (r, token) => {
      body.innerHTML = `<form class="row-form-inline" data-add><input type="text" name="login" placeholder="Логин коллеги" required><select name="permission"><option value="edit">может редактировать</option><option value="view">только просмотр</option></select><button class="btn primary">Открыть доступ</button></form>
        <ul class="plain-list shares">${r.shares.map(s => `<li>${s.link ? I('link', 15) + ' Ссылка для просмотра' + (s.expiresAt ? ' до ' + fmt(s.expiresAt) : '') : I('user', 15) + ' ' + esc(s.name || s.login) + ' <span class="muted small">' + esc(s.login) + '</span> · ' + (s.permission === 'edit' ? 'редактирует' : 'смотрит')}<span class="spacer"></span><button class="link" data-del="${s.id}">убрать</button></li>`).join('') || '<li class="muted">Проект видите только вы.</li>'}</ul>
        ${token ? `<p class="note">Ссылка создана — скопируйте её сейчас, второй раз она не показывается:<br><input type="text" class="copy-input" readonly value="${esc(linkUrl(token))}"> <button type="button" class="btn small" data-copylink>Копировать</button></p>` : ''}
        <div class="dialog-actions"><button type="button" class="btn" data-link>${I('link', 15)}Создать ссылку только для просмотра</button></div>
        <p class="muted small">По ссылке проект можно открыть без входа, посмотреть и выгрузить PDF/ZIP, но не изменить. Убрать ссылку — «убрать» в списке.</p>`;
      body.querySelector('[data-add]').onsubmit = UI.safe(async e => { e.preventDefault(); draw(await XS.Store.remote.share(S.doc.id, formData(e.target))); UI.toast('Доступ открыт.'); });
      body.querySelector('[data-link]').onclick = UI.safe(async () => { const r2 = await XS.Store.remote.share(S.doc.id, {link: true}); draw(r2, r2.token); });
      body.querySelector('[data-copylink]')?.addEventListener('click', () => { const i = body.querySelector('.copy-input'); i.select(); navigator.clipboard?.writeText(i.value); UI.toast('Ссылка скопирована.'); });
      body.querySelectorAll('[data-del]').forEach(b => { b.onclick = UI.safe(async () => draw(await XS.Store.remote.unshare(S.doc.id, b.dataset.del))); });
    };
    draw(await XS.Store.remote.shares(S.doc.id));
    show();
  }

  /* ---------- открыть по ссылке ---------- */
  async function openLink(token) {
    const doc = await UI.busy('Открываем проект по ссылке…', () => XS.Store.remote.byLink(token));
    await UI.open(doc, {readOnly: true, link: token});
    UI.toast('Проект открыт только для просмотра. Выгрузка и печать работают; чтобы менять — «Проект → Сделать копию».');
    UI.warnMissingFiles(doc);
  }

  async function init() {
    document.querySelectorAll('[data-account]').forEach(b => { b.onclick = UI.safe(accountClick); });
    document.addEventListener('click', e => { const m = $('accountMenu'); if (m && !m.contains(e.target)) m.hidden = true; });
    UI.Prefs.onChange(() => { if (!applying) pushPrefs(); });
    UI.Settings.addTab({id: 'account', title: 'Аккаунт', visible: () => !!Api.user(), render: accountTab});
    UI.Settings.addTab({id: 'site', title: 'Сайт', visible: () => Api.user()?.role === 'admin', render: siteTab});
    UI.Settings.addTab({id: 'users', title: 'Пользователи', visible: () => Api.user()?.role === 'admin', render: usersTab});
    UI.Settings.addTab({id: 'audit', title: 'Журнал', visible: () => Api.user()?.role === 'admin', render: auditTab});
    const st = await Api.init();
    paint();
    if (!st) return;
    await loadSettings();
    paint();
    if (st.setupNeeded && st.setupAllowed) authDialog('setup');
    else if (!st.user && Api.state.system?.localMode === false && !/^#\/(link|form)\//.test(location.hash)) authDialog('login', {locked: true});
  }

  const Account = UI.Account = {init, authDialog, conflict, versions, share, openLink, paint, saveUserSetting, userSettings: {}, user: () => Api.user()};
})(typeof window !== 'undefined' ? window : globalThis);
