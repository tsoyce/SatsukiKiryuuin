/* XSatsu Студия · админка: «Пользователи» (список, карточка: профиль, безопасность, проекты, журнал; создание и удаление),
 * «Приглашения» (одно- и многоразовые коды и ссылки), «Журнал» (фильтры, страницы, CSV). Каркас и помощники — admin.js. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, Api = XS.Api;
  const A = UI.Admin, H = A.H, esc = H.esc, I = H.I;

  const ROLE = {admin: 'администратор', user: 'пользователь'};
  const usage = u => u.limit ? `${H.bar(u.used, u.limit)}<small class="muted">${H.bytes(u.used)} из ${H.bytes(u.limit)}</small>` : `<small class="muted">${H.bytes(u.used)}</small>`;
  const statusChip = u => u.status === 'blocked' ? H.chip('заблокирован', 'bad') : u.mustChangePassword ? H.chip('временный пароль', 'warn') : '';

  /* ---------- список ---------- */
  let filter = {q: '', role: '', status: ''};
  async function users(ctx) {
    const data = await H.api('GET', 'v1/admin/users');
    if (!ctx.alive()) return;
    const me = Api.user();
    ctx.actions.innerHTML = `<button class="btn primary" data-new>${I('plus', 15)}Добавить пользователя</button>`;
    ctx.actions.querySelector('[data-new]').onclick = () => createDialog(ctx);
    const counts = {all: data.users.length, admin: data.users.filter(u => u.role === 'admin').length, blocked: data.users.filter(u => u.status === 'blocked').length};
    ctx.body.innerHTML = `<div class="adm-toolbar">
        <label class="search-wrap"><i data-icon="search"></i><input class="search" type="search" placeholder="Логин, имя, почта, заметка" value="${esc(filter.q)}" data-q></label>
        <div class="seg" data-seg>${[['', 'Все', counts.all], ['admin', 'Администраторы', counts.admin], ['blocked', 'Заблокированные', counts.blocked]].map(([v, t, n]) => `<button type="button" data-f="${v}" class="${(filter.role || filter.status) === v || (!v && !filter.role && !filter.status) ? 'on' : ''}">${t} <span class="muted">${n}</span></button>`).join('')}</div>
        <span class="spacer"></span><span class="muted small">Место по умолчанию: ${data.defaultQuotaMb ? data.defaultQuotaMb + ' МБ' : 'без ограничения'}</span>
      </div>
      <div class="adm-table-wrap"><table class="adm-table hover"><thead><tr><th>Пользователь</th><th>Роль</th><th class="num">Проекты</th><th>Место</th><th>Последний вход</th><th></th></tr></thead><tbody data-rows></tbody></table></div>`;
    const tbody = ctx.body.querySelector('[data-rows]');
    const draw = () => {
      const q = filter.q.trim().toLowerCase();
      const list = data.users.filter(u => (!filter.role || u.role === filter.role) && (!filter.status || u.status === filter.status)
        && (!q || [u.login, u.name, u.email, u.note].some(x => (x || '').toLowerCase().includes(q))));
      tbody.innerHTML = list.map(u => `<tr data-id="${u.id}" class="${u.status === 'blocked' ? 'is-off' : ''}" tabindex="0">
        <td><div class="adm-user">${H.avatar(u)}<div><b>${esc(u.name || u.login)}</b>${u.id === me.id ? ' ' + H.chip('это вы') : ''} ${statusChip(u)}<small class="muted">${esc(u.login)}${u.email ? ' · ' + esc(u.email) : ''}${u.note ? ' · ' + esc(u.note) : ''}</small></div></div></td>
        <td>${u.role === 'admin' ? H.chip('администратор', 'gold') : '<span class="muted">пользователь</span>'}</td>
        <td class="num">${u.projects}</td><td class="adm-usage">${usage(u)}</td>
        <td><span title="${esc(H.date(u.lastLoginAt))}">${esc(H.ago(u.lastLoginAt))}</span>${u.sessions ? `<small class="muted">сеансов: ${u.sessions}</small>` : ''}</td>
        <td class="nowrap">${I('chevronRight', 16)}</td></tr>`).join('') || `<tr><td colspan="6">${H.empty('Никого не нашли.')}</td></tr>`;
    };
    draw();
    ctx.body.querySelector('[data-q]').oninput = e => { filter.q = e.target.value; draw(); };
    ctx.body.querySelectorAll('[data-seg] button').forEach(b => { b.onclick = () => {
      filter.role = b.dataset.f === 'admin' ? 'admin' : ''; filter.status = b.dataset.f === 'blocked' ? 'blocked' : '';
      ctx.body.querySelectorAll('[data-seg] button').forEach(x => x.classList.toggle('on', x === b)); draw();
    }; });
    const openRow = tr => tr && UI.safe(userCard)(ctx, +tr.dataset.id);
    tbody.onclick = e => openRow(e.target.closest('tr[data-id]'));
    tbody.onkeydown = e => { if (e.key === 'Enter') openRow(e.target.closest('tr[data-id]')); };
    if (ctx.arg === 'new') { history.replaceState(null, '', '#/admin/users'); createDialog(ctx); }
    else if (/^\d+$/.test(ctx.arg)) userCard(ctx, +ctx.arg).catch(e => { history.replaceState(null, '', '#/admin/users'); UI.toast(e.message, true); });
  }

  /* ---------- новый пользователь ---------- */
  function createDialog(ctx) {
    const m = H.modal('Новый пользователь', `<form class="adm-form">
      <div class="adm-row2">${H.field('Логин', 'login', 'text', '', 'required autocomplete="off"', 'Буквы, цифры, точка, дефис, @')}${H.field('Имя и фамилия', 'name')}</div>
      <div class="adm-row2">${H.field('Почта', 'email', 'email')}<label class="adm-f"><span>Роль</span><select name="role"><option value="user">пользователь</option><option value="admin">администратор</option></select></label></div>
      <div class="adm-row2">${H.field('Пароль', 'password', 'text', '', 'autocomplete="new-password" minlength="8" placeholder="пусто — придумает Студия"', 'Временный: при первом входе человек задаст свой.')}${H.field('Место, МБ', 'quotaMb', 'number', '', 'min="0" placeholder="как у всех"', '0 — без ограничения.')}</div>
      ${H.field('Заметка (видна только админам)', 'note', 'text', '', 'maxlength="500" placeholder="Например: кафедра истории, куратор"')}
      <label class="check"><input type="checkbox" name="mustChange" checked> Попросить сменить пароль при первом входе</label>
      <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">${I('plus', 15)}Создать</button></div></form>`);
    const form = m.body.querySelector('form');
    form.onsubmit = UI.safe(async e => {
      e.preventDefault();
      const v = H.form(form);
      const r = await H.api('POST', 'v1/admin/users', v);
      m.close();
      H.secret('Пользователь создан', [['Адрес', H.origin()], ['Логин', r.created.login], ['Пароль', r.created.password]],
        r.created.mustChange ? 'Передайте эти данные человеку. Пароль временный: при первом входе Студия попросит задать свой.' : 'Передайте эти данные человеку.');
      ctx.reload();
    });
  }

  /* ---------- карточка пользователя (панель справа) ---------- */
  let cardTab = 'profile';
  async function userCard(ctx, id) {
    const data = await H.api('GET', 'v1/admin/users/' + id);
    if (!ctx.alive()) return;
    history.replaceState(null, '', '#/admin/users/' + id);
    const u = data.user, me = Api.user(), self = u.id === me.id;
    let panel = document.querySelector('.adm-drawer');
    if (!panel) {
      panel = document.createElement('aside'); panel.className = 'adm-drawer'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false');
      document.getElementById('admin').append(panel);
      requestAnimationFrame(() => panel.classList.add('open'));
    }
    const closeCard = () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 200); history.replaceState(null, '', '#/admin/users'); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeCard(); };
    document.addEventListener('keydown', onKey);
    const tabs = [['profile', 'Профиль'], ['security', 'Безопасность'], ['projects', 'Проекты ' + (data.projects.length || '')], ['events', 'Журнал']];
    panel.innerHTML = `<header class="adm-drawer-head">${H.avatar(u)}<div><h2>${esc(u.name || u.login)}</h2><small class="muted">${esc(u.login)} · ${esc(ROLE[u.role])} · с ${esc(H.day(u.createdAt))}</small><div>${statusChip(u)}</div></div>
        <button class="btn icon" data-x aria-label="Закрыть">${I('close')}</button></header>
      <nav class="adm-tabs">${tabs.map(([k, t]) => `<button type="button" data-t="${k}" class="${cardTab === k ? 'on' : ''}">${esc(t)}</button>`).join('')}</nav>
      <div class="adm-drawer-body"></div>`;
    panel.querySelector('[data-x]').onclick = closeCard;
    panel.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { cardTab = b.dataset.t; userCard(ctx, id); }; });
    const body = panel.querySelector('.adm-drawer-body');
    const refresh = async () => { await userCard(ctx, id); };
    const patch = async (v, msg) => { await H.api('PATCH', 'v1/admin/users/' + id, v); UI.toast(msg); await A.open('users', String(id)); }; // список и карточка заново

    if (cardTab === 'profile') {
      body.innerHTML = `<form class="adm-form" data-profile>
        <div class="adm-row2">${H.field('Имя и фамилия', 'name', 'text', u.name)}${H.field('Почта', 'email', 'email', u.email || '')}</div>
        <label class="adm-f"><span>Роль</span><select name="role" ${self ? 'disabled' : ''}><option value="user">пользователь</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>администратор — видит всё, управляет сайтом</option></select></label>
        <label class="adm-f"><span>Заметка (видна только админам)</span><textarea name="note" rows="2" maxlength="500">${esc(u.note)}</textarea></label>
        <div class="adm-f"><span>Место</span><div class="adm-quota">${usage(u)}<small class="muted">документы ${H.bytes(u.usage.docs)} · файлы ${H.bytes(u.usage.files)}</small></div></div>
        ${H.field('Квота, МБ', 'quotaMb', 'number', u.quotaMb ?? '', 'min="0" placeholder="как у всех"', 'Пусто — общая квота сайта, 0 — без ограничения.')}
        <div class="dialog-actions"><span class="spacer"></span><button class="btn primary">${I('check', 15)}Сохранить</button></div></form>
        ${self ? '' : `<section class="adm-danger"><h4>Опасная зона</h4><p class="muted small">Удаление нельзя отменить. Проекты можно передать другому человеку.</p><button class="btn danger" data-del>${I('trash', 15)}Удалить пользователя…</button></section>`}`;
      const f = body.querySelector('[data-profile]');
      f.onsubmit = UI.safe(async e => {
        e.preventDefault();
        const v = H.form(f);
        if (self) delete v.role;
        v.quotaMb = v.quotaMb === '' ? null : +v.quotaMb;
        await patch(v, 'Сохранено.');
      });
      body.querySelector('[data-del]')?.addEventListener('click', UI.safe(() => deleteDialog(ctx, u, data, closeCard)));
    }

    if (cardTab === 'security') {
      body.innerHTML = `${self ? '<p class="note">Это ваша учётная запись: пароль меняется в «Аккаунт и настройки».</p>' : `
        <section class="adm-block"><h4>Пароль</h4><p class="muted small">Временный пароль заменит текущий, все сеансы завершатся. При входе человек задаст свой пароль.</p>
          <div class="adm-inline"><button class="btn" data-reset>${I('lock', 15)}Выдать временный пароль</button><button class="btn ghost" data-setpw>Задать вручную…</button></div></section>
        <section class="adm-block"><h4>Доступ</h4>${u.status === 'blocked'
          ? `<p>Заблокирован ${esc(H.ago(u.blockedAt))}${u.blockedReason ? ': «' + esc(u.blockedReason) + '»' : ''}. Войти не может, проекты и ссылки сохранены.</p><button class="btn primary" data-unblock>${I('unlock', 15)}Разблокировать</button>`
          : `<p class="muted small">Заблокированный не может войти; его проекты и гостевые ссылки продолжают работать.</p><div class="adm-inline"><input type="text" placeholder="Причина (увидит при входе)" maxlength="190" data-reason><button class="btn danger" data-block>${I('lock', 15)}Заблокировать</button></div>`}</section>`}
        <section class="adm-block"><h4>Сеансы <span class="muted">${data.sessions.length}</span></h4>
          ${data.sessions.length ? `<ul class="adm-list">${data.sessions.map(s => `<li><div><b>${esc(agent(s.agent))}</b>${s.current ? ' ' + H.chip('этот', 'good') : ''}<small class="muted">${esc(s.ip)} · вход ${esc(H.ago(s.createdAt))} · до ${esc(H.day(s.expiresAt))}</small></div>${s.current ? '' : `<button class="btn small ghost" data-end="${esc(s.id)}">Завершить</button>`}</li>`).join('')}</ul>
            ${data.sessions.some(s => !s.current) ? `<button class="btn" data-end-all>${I('logout', 15)}Завершить все сеансы</button>` : ''}` : '<p class="muted">Сейчас нигде не вошёл.</p>'}</section>`;
      body.querySelector('[data-reset]')?.addEventListener('click', UI.safe(async () => {
        if (!await H.confirm(`Выдать <b>${esc(u.login)}</b> временный пароль? Текущий перестанет работать.`, {ok: 'Выдать'})) return;
        const r = await H.api('POST', 'v1/admin/users/' + id + '/reset-password');
        H.secret('Временный пароль', [['Адрес', H.origin()], ['Логин', r.login], ['Пароль', r.password]], 'Передайте человеку. При входе Студия попросит задать свой пароль. Этот пароль больше нигде не показывается.');
        await refresh();
      }));
      body.querySelector('[data-setpw]')?.addEventListener('click', () => {
        const m = H.modal('Новый пароль для ' + u.login, `<form class="adm-form">${H.field('Пароль (от 8 символов)', 'password', 'text', '', 'minlength="8" required autocomplete="new-password"')}
          <label class="check"><input type="checkbox" name="mustChange" checked> Попросить сменить при входе</label>
          <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
        m.body.querySelector('form').onsubmit = UI.safe(async e => { e.preventDefault(); await H.api('PATCH', 'v1/admin/users/' + id, H.form(e.target)); m.close(); UI.toast('Пароль изменён, сеансы завершены.'); await refresh(); });
      });
      body.querySelector('[data-block]')?.addEventListener('click', UI.safe(async () => {
        if (!await H.confirm(`Заблокировать <b>${esc(u.login)}</b>? Все его сеансы завершатся.`, {ok: 'Заблокировать', danger: true})) return;
        await patch({status: 'blocked', reason: body.querySelector('[data-reason]').value}, 'Заблокирован.');
      }));
      body.querySelector('[data-unblock]')?.addEventListener('click', UI.safe(() => patch({status: 'active'}, 'Разблокирован.')));
      body.querySelectorAll('[data-end]').forEach(b => { b.onclick = UI.safe(async () => { await H.api('DELETE', 'v1/admin/users/' + id + '/sessions&session=' + b.dataset.end); UI.toast('Сеанс завершён.'); await refresh(); }); });
      body.querySelector('[data-end-all]')?.addEventListener('click', UI.safe(async () => { const r = await H.api('DELETE', 'v1/admin/users/' + id + '/sessions'); UI.toast('Завершено сеансов: ' + r.ended + '.'); await refresh(); }));
    }

    if (cardTab === 'projects') {
      body.innerHTML = (data.projects.length ? `<ul class="adm-list">${data.projects.map(p => `<li class="${p.deletedAt ? 'is-off' : ''}"><div><b>${esc(p.title)}</b>${p.deletedAt ? ' ' + H.chip('в корзине', 'warn') : ''}${p.shares ? ' ' + H.chip('доступ: ' + p.shares) : ''}
          <small class="muted">${p.rows} ${H.plural(p.rows, 'запись', 'записи', 'записей')} · ${H.bytes(p.size)} · изменён ${esc(H.ago(p.updatedAt))}</small></div>${p.deletedAt ? '' : `<a class="btn small ghost" href="#/doc/${encodeURIComponent(p.id)}">Открыть</a>`}</li>`).join('')}</ul>` : H.empty('Своих проектов нет.'))
        + (data.shared.length ? `<h4>Доступны ему</h4><ul class="adm-list">${data.shared.map(p => `<li><div><b>${esc(p.title)}</b><small class="muted">владелец ${esc(p.owner)} · ${p.permission === 'edit' ? 'правка' : 'просмотр'}</small></div></li>`).join('')}</ul>` : '');
    }

    if (cardTab === 'events') body.innerHTML = data.events.length ? `<ul class="adm-evs">${data.events.map(H.eventLine).join('')}</ul><a class="btn small ghost" href="#/admin/audit/${encodeURIComponent(u.login)}">Весь журнал пользователя</a>` : H.empty('Записей нет.');
    XS.Icons.hydrate?.(panel);
  }
  function agent(ua) {
    if (!ua) return 'Неизвестное устройство';
    const b = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браузер';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return b + (os ? ' · ' + os : '');
  }

  async function deleteDialog(ctx, u, data, closeCard) {
    const all = (await H.api('GET', 'v1/admin/users')).users.filter(x => x.id !== u.id);
    const n = data.projects.length;
    const m = H.modal('Удалить ' + (u.name || u.login), `<form class="adm-form">
      <p>Учётная запись <b>${esc(u.login)}</b> будет удалена без возможности восстановления. Сеансы и доступы к чужим проектам исчезнут.</p>
      ${n ? `<fieldset class="adm-radios"><legend>Проекты пользователя: ${n}</legend>
        <label class="adm-radio"><input type="radio" name="mode" value="transfer" checked><span><b>Передать</b><select name="to">${all.map(x => `<option value="${x.id}" ${x.id === Api.user().id ? 'selected' : ''}>${esc(x.name || x.login)} (${esc(x.login)})</option>`).join('')}</select></span></label>
        <label class="adm-radio"><input type="radio" name="mode" value="delete"><span><b>Удалить вместе с ним</b><small class="muted">Проекты, версии, ссылки и анкеты будут удалены.</small></span></label></fieldset>` : ''}
      ${H.field('Для подтверждения введите логин', 'confirm', 'text', '', 'required autocomplete="off"')}
      <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn danger-fill">${I('trash', 15)}Удалить навсегда</button></div></form>`);
    m.body.querySelector('form').onsubmit = UI.safe(async e => {
      e.preventDefault();
      const v = H.form(e.target);
      if (v.confirm.trim().toLowerCase() !== u.login) throw new Error('Логин введён неверно.');
      const mode = e.target.querySelector('[name=mode]:checked')?.value;
      await H.api('DELETE', 'v1/admin/users/' + u.id + (n ? '&projects=' + mode + (mode === 'transfer' ? '&to=' + v.to : '') : ''));
      m.close(); closeCard(); UI.toast('Пользователь удалён.'); ctx.reload();
    });
  }

  /* ---------- приглашения ---------- */
  async function invites(ctx) {
    const data = await H.api('GET', 'v1/admin/invites');
    if (!ctx.alive()) return;
    const reg = data.registration;
    ctx.actions.innerHTML = `<button class="btn primary" data-new>${I('plus', 15)}Новое приглашение</button>`;
    ctx.actions.querySelector('[data-new]').onclick = () => inviteDialog(ctx);
    const state = {active: ['действует', 'good'], used: ['использовано', ''], expired: ['истекло', 'off']};
    ctx.body.innerHTML = `${reg !== 'invite' ? `<p class="adm-hint">${I('warn', 16)}<span>Сейчас регистрация ${reg === 'open' ? 'открыта для всех — код не нужен' : 'закрыта — коды не работают'}. Включить «по приглашению» можно в <a href="#/admin/settings">настройках сайта</a>.</span></p>` : ''}
      ${data.invites.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Для кого</th><th>Роль</th><th>Использовано</th><th>Состояние</th><th>Создано</th><th></th></tr></thead><tbody>${data.invites.map(i => `<tr class="${i.state !== 'active' ? 'is-off' : ''}">
        <td><b>${esc(i.note || 'без заметки')}</b>${i.usedBy ? `<small class="muted">последний: ${esc(i.usedBy)}, ${esc(H.ago(i.usedAt))}</small>` : ''}</td>
        <td>${i.role === 'admin' ? H.chip('администратор', 'gold') : '<span class="muted">пользователь</span>'}</td>
        <td>${i.uses} из ${i.maxUses} ${i.maxUses > 1 ? H.bar(i.uses, i.maxUses, {warnAt: 2}) : ''}</td>
        <td>${H.chip(...state[i.state])}${i.state === 'active' && i.expiresAt ? `<small class="muted">до ${esc(H.day(i.expiresAt))}</small>` : ''}</td>
        <td><small class="muted">${esc(H.date(i.createdAt))}${i.createdBy ? '<br>' + esc(i.createdBy) : ''}</small></td>
        <td class="nowrap">${i.state === 'active' ? `<button class="btn small ghost danger" data-revoke="${esc(i.id)}">Отозвать</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : H.empty('Приглашений пока нет. Создайте код — человек введёт его при регистрации или откроет ссылку.')}`;
    ctx.body.querySelectorAll('[data-revoke]').forEach(b => { b.onclick = UI.safe(async () => {
      if (!await H.confirm('Отозвать приглашение? Кто уже зарегистрировался, останется.', {ok: 'Отозвать', danger: true})) return;
      await H.api('DELETE', 'v1/admin/invites/' + b.dataset.revoke); UI.toast('Приглашение отозвано.'); ctx.reload();
    }); });
    if (ctx.arg === 'new') { history.replaceState(null, '', '#/admin/invites'); inviteDialog(ctx); }
  }
  function inviteDialog(ctx) {
    const m = H.modal('Новое приглашение', `<form class="adm-form">
      ${H.field('Для кого', 'note', 'text', '', 'maxlength="190" placeholder="Например: Иванова, кафедра или группа 101"')}
      <div class="adm-row3"><label class="adm-f"><span>Сколько человек</span><select name="maxUses"><option value="1">1 — личное</option><option value="5">5</option><option value="10">10</option><option value="30">30 — группа</option><option value="100">100</option></select></label>
        <label class="adm-f"><span>Действует</span><select name="days"><option value="3">3 дня</option><option value="14" selected>2 недели</option><option value="30">месяц</option><option value="90">3 месяца</option><option value="365">год</option></select></label>
        <label class="adm-f"><span>Роль</span><select name="role"><option value="user">пользователь</option><option value="admin">администратор</option></select></label></div>
      <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Создать</button></div></form>`);
    m.body.querySelector('form').onsubmit = UI.safe(async e => {
      e.preventDefault();
      const v = H.form(e.target); v.maxUses = +v.maxUses; v.days = +v.days;
      const r = await H.api('POST', 'v1/admin/invites', v);
      m.close();
      H.secret('Приглашение готово', [['Ссылка', H.origin() + '#/invite/' + r.code], ['Код', r.code]],
        `Отправьте ссылку — по ней сразу откроется регистрация с кодом. ${r.maxUses > 1 ? 'Код подходит для ' + r.maxUses + ' человек' : 'Код одноразовый'}, действует ${r.days} ${H.plural(r.days, 'день', 'дня', 'дней')}. Код больше нигде не показывается.`);
      ctx.reload();
    });
  }

  /* ---------- журнал ---------- */
  let af = {action: '', actor: '', q: '', from: '', to: ''};
  async function audit(ctx) {
    if (ctx.arg) af = {action: '', actor: ctx.arg, q: '', from: '', to: ''};
    const query = Object.entries(af).filter(([, v]) => v).map(([k, v]) => '&' + k + '=' + encodeURIComponent(v)).join('');
    const data = await H.api('GET', 'v1/admin/audit&limit=100' + query);
    if (!ctx.alive()) return;
    const groups = {};
    for (const a of data.actions) (groups[a.split('.')[0]] ||= []).push(a);
    const GROUP = {project: 'Проекты', user: 'Пользователи', invite: 'Приглашения', form: 'Анкеты', link: 'Ссылки', template: 'Шаблоны', font: 'Шрифты'};
    ctx.actions.innerHTML = `<a class="btn" href="api/index.php?r=v1/admin/audit&format=csv${query}" download>${I('download', 15)}Скачать CSV</a>`;
    ctx.body.innerHTML = `<form class="adm-toolbar wrap" data-f>
        <select name="action"><option value="">Все действия</option>${Object.entries(groups).map(([g, list]) => list.length > 1 || GROUP[g]
          ? `<optgroup label="${esc(GROUP[g] || g)}"><option value="${esc(g)}.*">— все: ${esc((GROUP[g] || g).toLowerCase())}</option>${list.map(a => `<option value="${esc(a)}">${esc(H.action(a))}</option>`).join('')}</optgroup>`
          : list.map(a => `<option value="${esc(a)}">${esc(H.action(a))}</option>`).join('')).join('')}</select>
        <input type="text" name="actor" placeholder="Логин" value="${esc(af.actor)}" style="width:130px">
        <label class="search-wrap"><i data-icon="search"></i><input class="search" type="search" name="q" placeholder="IP, проект, подробности" value="${esc(af.q)}"></label>
        <label class="adm-dates">с <input type="date" name="from" value="${esc(af.from)}"> по <input type="date" name="to" value="${esc(af.to)}"></label>
        <button class="btn">Показать</button>${Object.values(af).some(Boolean) ? '<button type="button" class="btn ghost" data-reset>Сбросить</button>' : ''}
      </form>
      <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Подробности</th><th>IP</th></tr></thead><tbody data-rows></tbody></table></div>
      <div class="adm-more-row" data-more-row></div>`;
    const form = ctx.body.querySelector('[data-f]');
    form.action.value = af.action;
    form.onsubmit = e => { e.preventDefault(); af = H.form(form); if (ctx.arg) location.hash = '#/admin/audit'; else ctx.reload(); };
    form.querySelector('[data-reset]')?.addEventListener('click', () => { af = {action: '', actor: '', q: '', from: '', to: ''}; if (ctx.arg) location.hash = '#/admin/audit'; else ctx.reload(); });
    form.action.onchange = () => form.requestSubmit();
    const tbody = ctx.body.querySelector('[data-rows]'), moreRow = ctx.body.querySelector('[data-more-row]');
    const target = e => {
      if (e.targetType === 'user' && e.targetId && String(e.actorId) === e.targetId) return '';
      if (e.targetType === 'user' && e.targetId) return `<a href="#/admin/users/${esc(e.targetId)}">пользователь #${esc(e.targetId)}</a>`;
      if (e.targetType === 'project' && e.targetId) return `<a href="#/doc/${esc(encodeURIComponent(e.targetId))}" title="${esc(e.targetId)}">проект</a>`;
      return '';
    };
    const rows = list => list.map(e => `<tr><td class="nowrap" title="${esc(e.at)}">${esc(H.date(e.at))}</td><td>${e.actor ? `<a href="#/admin/audit/${esc(encodeURIComponent(e.actor))}">${esc(e.actor)}</a>` : '<span class="muted">гость/система</span>'}</td>
      <td><span class="adm-ev-dot a-${esc(e.action.split('.')[0])}"></span>${esc(H.action(e.action))}</td><td>${target(e)} <span class="muted">${esc(H.detail(e.detail))}</span></td><td class="muted small nowrap">${esc(e.ip)}</td></tr>`).join('');
    tbody.innerHTML = rows(data.events) || `<tr><td colspan="5">${H.empty('Ничего не нашли.')}</td></tr>`;
    let next = data.next;
    const paintMore = () => {
      moreRow.innerHTML = next ? `<button class="btn" data-more>Показать ещё</button>` : data.events.length ? '<span class="muted small">Это все записи.</span>' : '';
      moreRow.querySelector('[data-more]')?.addEventListener('click', UI.safe(async () => {
        const r = await H.api('GET', 'v1/admin/audit&limit=100&before=' + next + query);
        tbody.insertAdjacentHTML('beforeend', rows(r.events)); next = r.next; paintMore();
      }));
    };
    paintMore();
  }

  A.section({id: 'users', title: 'Пользователи', icon: 'users', order: 20, sub: 'Роли, блокировка, пароли, сеансы и место', render: users});
  A.section({id: 'invites', title: 'Приглашения', icon: 'plus', order: 25, sub: 'Коды и ссылки для регистрации', render: invites});
  A.section({id: 'audit', title: 'Журнал', icon: 'history', order: 70, sub: 'Кто, что и когда делал на сайте', render: audit});
})(typeof window !== 'undefined' ? window : globalThis);
