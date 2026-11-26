/* XSatsu Студия · админка (#/admin/<раздел>[/<id>]): отдельный экран с боковым меню в айдентике «Мундир».
 * Здесь — каркас, общие помощники и разделы «Обзор», «Настройки сайта», «Сервер».
 * Остальные разделы добавляются через UI.Admin.section({...}): admin-users.js (пользователи, приглашения, журнал),
 * admin-projects.js (проекты, ссылки и анкеты, хранилище). Сервер — server/src/Admin*.php, ServerStatus.php. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, $ = UI.$, Api = XS.Api;
  const esc = XS.esc, I = (n, s = 16) => XS.Icons.icon(n, s);

  /* ---------- помощники (общие для всех разделов) ---------- */
  const H = {};
  H.esc = esc; H.I = I;
  H.date = iso => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'}) : '—'; };
  H.day = iso => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'}) : '—'; };
  H.plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  H.ago = iso => {
    if (!iso) return '—';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (isNaN(s)) return '—';
    if (s < 0) { const d = Math.ceil(-s / 86400); return d <= 1 ? 'сегодня' : 'через ' + d + ' ' + H.plural(d, 'день', 'дня', 'дней'); }
    if (s < 60) return 'только что';
    if (s < 3600) { const m = Math.floor(s / 60); return m + ' мин назад'; }
    if (s < 86400) { const h = Math.floor(s / 3600); return h + ' ' + H.plural(h, 'час', 'часа', 'часов') + ' назад'; }
    const d = Math.floor(s / 86400);
    if (d === 1) return 'вчера';
    if (d < 30) return d + ' ' + H.plural(d, 'день', 'дня', 'дней') + ' назад';
    return H.day(iso);
  };
  H.bytes = n => {
    n = +n || 0;
    if (n < 1024) return n + ' Б';
    const u = ['КБ', 'МБ', 'ГБ', 'ТБ']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toLocaleString('ru-RU', {maximumFractionDigits: n < 10 ? 1 : 0}) + ' ' + u[i];
  };
  H.num = n => (+n || 0).toLocaleString('ru-RU');
  H.chip = (text, kind = '') => `<span class="adm-chip ${kind}">${esc(text)}</span>`;
  H.bar = (value, max, {warnAt = .8} = {}) => {
    if (!max) return '';
    const p = Math.min(1, value / max);
    return `<span class="adm-bar ${p >= 1 ? 'over' : p >= warnAt ? 'warn' : ''}" title="${Math.round(p * 100)}%"><i style="width:${(p * 100).toFixed(1)}%"></i></span>`;
  };
  H.empty = (text, icon = 'sparkle') => `<div class="adm-empty">${XS.Icons.emblem ? XS.Icons.emblem(40) : I(icon, 32)}<p>${esc(text)}</p></div>`;
  H.copy = async (text, what = 'Скопировано') => {
    try { await navigator.clipboard.writeText(text); UI.toast(what + '.'); }
    catch (e) { prompt('Скопируйте вручную:', text); }
  };
  H.initials = u => { const s = (u.name || u.login || '?').trim().split(/\s+/); return ((s[0] || '?')[0] + (s[1] ? s[1][0] : '')).toUpperCase(); };
  /* Аватар — инициалы на цвете из палитры мундира (кобальт, сталь, золото, кант, чернила), цвет постоянный для логина. */
  H.avatar = u => { let h = 0; for (const c of String(u.login || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `<span class="adm-ava c${h % 5}">${esc(H.initials(u))}</span>`; };
  H.form = form => Object.fromEntries([...form.querySelectorAll('[name]')].map(i => [i.name, i.type === 'checkbox' ? i.checked : i.value]));
  H.field = (label, name, type = 'text', value = '', extra = '', hint = '') => `<label class="adm-f"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value ?? '')}" ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
  H.origin = () => location.origin + location.pathname.replace(/index\.html$/, '');

  /* Окно поверх админки: H.modal(title, html, {wide}) → {d, body, close}. Кнопки с data-close закрывают. */
  H.modal = (title, html, {wide = false} = {}) => {
    const d = document.createElement('dialog');
    d.className = 'dialog adm-modal' + (wide ? ' wide' : '');
    d.innerHTML = `<header class="dialog-head"><h2>${esc(title)}</h2><button class="btn icon" data-close aria-label="Закрыть">${I('close')}</button></header><div class="dialog-body">${html}</div>`;
    document.body.append(d);
    const close = () => { d.close(); d.remove(); };
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    d.showModal();
    setTimeout(() => d.querySelector('input:not([type=hidden]):not([readonly]), select, textarea')?.focus(), 30);
    return {d, body: d.querySelector('.dialog-body'), close};
  };
  /* Подтверждение без системного confirm(): await H.confirm('Текст', {ok: 'Удалить', danger: true}) → true/false. */
  H.confirm = (text, {ok = 'Да', danger = false, title = 'Подтвердите'} = {}) => new Promise(resolve => {
    const m = H.modal(title, `<p>${text}</p><div class="dialog-actions"><span class="spacer"></span><button class="btn" data-no>Отмена</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-yes>${esc(ok)}</button></div>`);
    let done = false;
    const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
    m.body.querySelector('[data-yes]').onclick = () => finish(true);
    m.body.querySelector('[data-no]').onclick = () => finish(false);
    m.d.addEventListener('close', () => finish(false));
    setTimeout(() => m.body.querySelector('[data-yes]').focus(), 40);
  });
  /* Секрет показывается один раз: пароль, код приглашения, ссылка. */
  H.secret = (title, rows, note = '') => {
    const m = H.modal(title, `${rows.map(([k, v]) => `<div class="adm-secret"><span>${esc(k)}</span><code>${esc(v)}</code><button class="btn small" data-copy="${esc(v)}">${I('copy', 14)}Копировать</button></div>`).join('')}
      ${note ? `<p class="note">${note}</p>` : ''}<div class="dialog-actions"><button class="btn" data-copy-all>${I('copy', 14)}Копировать всё</button><span class="spacer"></span><button class="btn primary" data-close>Готово</button></div>`);
    m.body.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => H.copy(b.dataset.copy); });
    m.body.querySelector('[data-copy-all]').onclick = () => H.copy(rows.map(([k, v]) => k + ': ' + v).join('\n'), 'Скопировано всё');
    return m;
  };
  H.api = (method, route, body, opts) => Api.call(method, route, body, opts);

  /* ---------- каркас ---------- */
  const sections = [];
  let current = null, built = false, badges = {};
  function section(def) { sections.push(def); sections.sort((a, b) => (a.order || 50) - (b.order || 50)); if (built) buildNav(); }

  function build() {
    const root = $('admin');
    root.innerHTML = `<aside class="adm-side">
        <a class="adm-brand" href="#/" title="К проектам"><span data-logo="32"></span><span class="adm-brand-t">XSatsu <b>Студия</b><small>${XS.Icons.emblem ? XS.Icons.emblem(11) : ''}Админка</small></span></a>
        <nav class="adm-nav" aria-label="Разделы админки"></nav>
        <div class="adm-side-foot"><a class="adm-back" href="#/">${I('chevronLeft', 15)}К проектам</a><span class="adm-me"></span></div>
      </aside>
      <main class="adm-main"><header class="adm-head"><div class="adm-head-t"><h1></h1><p class="adm-sub muted"></p></div><div class="adm-head-actions"></div></header><div class="adm-body" tabindex="-1"></div></main>`;
    XS.Icons.hydrate?.(root);
    built = true;
    buildNav();
  }
  function buildNav() {
    const nav = $('admin').querySelector('.adm-nav');
    nav.innerHTML = sections.map(s => `<a href="#/admin/${s.id}" data-sec="${s.id}" class="${current === s.id ? 'on' : ''}">${I(s.icon, 17)}<span>${esc(s.title)}</span>${badges[s.id] ? `<b class="adm-badge ${badges[s.id].kind || ''}">${esc(badges[s.id].text)}</b>` : ''}</a>`).join('');
  }
  function badge(id, text, kind = '') { if (text) badges[id] = {text: String(text), kind}; else delete badges[id]; if (built) buildNav(); }

  let token = 0;
  async function open(sec = 'overview', arg = '') {
    const u = Api.user();
    if (!Api.available) { UI.toast('Админка работает, когда на сайте установлен сервер.', true); location.hash = '#/'; return; }
    if (!u) { location.hash = '#/'; UI.Account.authDialog('login'); return; }
    if (u.role !== 'admin') { UI.toast('Админка доступна только администраторам сайта.', true); location.hash = '#/'; return; }
    if (!built) build();
    const def = sections.find(s => s.id === sec) || sections[0];
    const root = $('admin');
    const first = root.hidden;
    $('home').hidden = true; $('editor').hidden = true; root.hidden = false;
    document.body.classList.add('in-admin');
    if (first) UI.Motion?.screen(root);
    if (current !== def.id) root.querySelector('.adm-drawer')?.remove();
    document.querySelectorAll('dialog.adm-modal').forEach(d => d.close()); // окна прошлого раздела
    current = def.id; buildNav();
    root.querySelector('.adm-me').innerHTML = H.avatar(u) + '<span>' + esc(u.name || u.login) + '</span>';
    root.querySelector('h1').textContent = def.title;
    root.querySelector('.adm-sub').textContent = def.sub || '';
    document.title = def.title + ' — админка XSatsu';
    const actions = root.querySelector('.adm-head-actions'); actions.replaceChildren();
    const body = root.querySelector('.adm-body');
    const my = ++token;
    body.innerHTML = '<div class="adm-loading">' + (XS.Icons.emblem ? XS.Icons.emblem(28, 'spin') : '') + '<span>Загружаем…</span></div>';
    const ctx = {body, actions, arg, H, alive: () => my === token, reload: () => open(def.id, arg), go: (s, a = '') => { location.hash = '#/admin/' + s + (a ? '/' + encodeURIComponent(a) : ''); }};
    try {
      await def.render(ctx);
      if (my === token) XS.Icons.hydrate?.(body);
    } catch (e) {
      if (my !== token) return;
      body.innerHTML = `<div class="adm-error">${I('warn', 20)}<div><b>Не получилось загрузить раздел.</b><p>${esc(e.message || String(e))}</p><button class="btn small" data-retry>Повторить</button></div></div>`;
      body.querySelector('[data-retry]').onclick = () => open(def.id, arg);
    }
  }
  function close() {
    const root = $('admin');
    if (!root || root.hidden) return;
    root.hidden = true; token++;
    root.querySelector('.adm-drawer')?.remove();
    document.querySelectorAll('dialog.adm-modal').forEach(d => d.close());
    document.body.classList.remove('in-admin');
    document.title = 'XSatsu Студия';
  }
  /* Разбор адреса: #/admin/<раздел>/<id>. Возвращает true, если адрес — админка. */
  async function route(hash) {
    const m = /^#\/admin(?:\/([a-z-]+))?(?:\/(.+))?$/.exec(hash);
    if (!m) { close(); return false; }
    await open(m[1] || 'overview', m[2] ? decodeURIComponent(m[2]) : '');
    return true;
  }

  /* ---------- журнал: подписи действий (общие для обзора, журнала и карточки пользователя) ---------- */
  const ACTIONS = {
    'login': 'Вход', 'setup': 'Установка сайта', 'register': 'Регистрация', 'password': 'Смена пароля', 'settings': 'Настройки сайта',
    'project.create': 'Создан проект', 'project.trash': 'Проект в корзину', 'project.restore': 'Проект восстановлен', 'project.purge': 'Проект удалён навсегда',
    'project.share': 'Открыт доступ', 'project.share.update': 'Изменён доступ', 'project.unshare': 'Доступ отозван', 'project.link': 'Гостевая ссылка', 'project.version': 'Сохранена версия',
    'project.transfer': 'Проект передан', 'form.create': 'Анкета создана', 'form.delete': 'Анкета удалена', 'form.close': 'Анкета закрыта', 'form.open': 'Анкета открыта',
    'user.create': 'Новый пользователь', 'user.update': 'Изменён пользователь', 'user.reset': 'Временный пароль', 'user.sessions': 'Завершены сеансы', 'user.delete': 'Удалён пользователь',
    'invite.create': 'Приглашение', 'invite.revoke': 'Приглашение отозвано', 'audit.export': 'Выгрузка журнала', 'maintenance.cleanup': 'Обслуживание',
    'link.revoke': 'Ссылка отозвана', 'link.update': 'Ссылка изменена', 'template.publish': 'Шаблон сайта', 'template.update': 'Шаблон изменён', 'template.delete': 'Шаблон удалён',
    'font.add': 'Шрифт сайта', 'font.delete': 'Шрифт сайта удалён',
  };
  const KEYS = {registration: 'регистрация', localMode: 'работа без входа', siteName: 'название', notice: 'объявление', trashDays: 'корзина', auditDays: 'журнал', defaultQuotaMb: 'квота по умолчанию', maintenance: 'режим обслуживания', maintenanceText: 'текст о работах',
    files: 'файлов', trash: 'корзина', sessions: 'сеансов', attempts: 'попыток входа', rate: 'отметок', links: 'ссылок', audit: 'журнал', note: 'заметка',
    role: 'роль', status: 'статус', name: 'имя', email: 'почта', quotaMb: 'квота', password: 'пароль', reason: 'причина', login: 'логин', title: 'название', permission: 'права', label: 'для кого', to: 'кому', projects: 'проектов', from: 'от', expired: 'истёкших', ended: 'сеансов', uses: 'мест', days: 'дней', rows: 'строк', by: 'гость'};
  const VALUES = {admin: 'администратор', user: 'пользователь', blocked: 'заблокирован', active: 'активен', view: 'просмотр', edit: 'правка'};
  H.action = a => ACTIONS[a] || a;
  H.detail = d => {
    if (!d) return '';
    if (Array.isArray(d)) return d.map(k => KEYS[k] || k).join(', ');
    if (typeof d !== 'object') return String(d);
    return Object.entries(d).filter(([k]) => !['invite', 'share'].includes(k)).map(([k, v]) => v === true ? (KEYS[k] || k) : (KEYS[k] || k) + ': ' + (VALUES[v] || (v === null ? 'по умолчанию' : typeof v === 'object' ? JSON.stringify(v) : v))).join(' · ');
  };
  H.eventLine = e => `<li class="adm-ev"><span class="adm-ev-dot a-${esc(e.action.split('.')[0])}"></span><div><b>${esc(H.action(e.action))}</b>${e.detail ? ' <span class="muted">' + esc(H.detail(e.detail)) + '</span>' : ''}
    <small class="muted">${esc(e.actor || 'гость/система')} · ${esc(H.ago(e.at))}${e.ip ? ' · ' + esc(e.ip) : ''}</small></div></li>`;

  /* ---------- раздел «Обзор» ---------- */
  function chart(days) {
    const max = Math.max(1, ...days.map(d => Math.max(d.edits, d.logins)));
    const w = 100 / days.length;
    return `<div class="adm-chart" role="img" aria-label="Сохранения и входы за 14 дней">${days.map(d => `<div class="adm-col" style="width:${w}%" title="${esc(H.day(d.day + 'T12:00:00Z'))}: сохранений ${d.edits}, входов ${d.logins}">
      <span class="b e" style="height:${(d.edits / max * 100).toFixed(1)}%"></span><span class="b l" style="height:${(d.logins / max * 100).toFixed(1)}%"></span><small>${new Date(d.day + 'T12:00:00Z').getDate()}</small></div>`).join('')}</div>
      <div class="adm-legend"><span><i class="e"></i>версии проектов</span><span><i class="l"></i>входы</span></div>`;
  }
  H.warnings = (list, ctx) => list.length ? `<ul class="adm-warns">${list.map(w => `<li class="${esc(w.level)}">${I(w.level === 'info' ? 'sparkle' : 'warn', 16)}<span>${esc(w.text)}</span>${w.section ? `<a href="#/admin/${esc(w.section)}">Открыть</a>` : ''}</li>`).join('')}</ul>` : '';
  async function overview(ctx) {
    const o = await H.api('GET', 'v1/admin/overview');
    if (!ctx.alive()) return;
    const c = o.counts;
    badge('server', o.warnings.filter(w => w.level !== 'info').length || '', o.warnings.some(w => w.level === 'error') ? 'error' : 'warn');
    const tile = (label, value, sub, href, icon) => `<a class="adm-tile" href="${href}">${I(icon, 18)}<span class="muted">${label}</span><b>${value}</b><small class="muted">${sub}</small></a>`;
    ctx.actions.innerHTML = `<button class="btn" data-new-invite>${I('link', 15)}Приглашение</button><button class="btn primary" data-new-user>${I('plus', 15)}Пользователь</button>`;
    ctx.actions.querySelector('[data-new-user]').onclick = () => { ctx.go('users', 'new'); };
    ctx.actions.querySelector('[data-new-invite]').onclick = () => { ctx.go('invites', 'new'); };
    ctx.body.innerHTML = `${H.warnings(o.warnings)}
      <div class="adm-tiles">
        ${tile('Пользователи', H.num(c.users), `активны за неделю: ${c.activeUsers}${c.newUsers ? ' · новых: ' + c.newUsers : ''}`, '#/admin/users', 'users')}
        ${tile('Проекты', H.num(c.projects), `изменено за сутки: ${c.changedToday}${c.trash ? ' · в корзине: ' + c.trash : ''}`, '#/admin/projects', 'file')}
        ${tile('Гостевые ссылки', H.num(c.links), `анкет открыто: ${c.forms} · ответов за неделю: ${c.responses}`, '#/admin/links', 'link')}
        ${tile('Хранилище', H.bytes(c.assetBytes + c.docBytes), `файлов: ${H.num(c.assets)} · документы: ${H.bytes(c.docBytes)}`, '#/admin/storage', 'cloud')}
        ${tile('Сеансы', H.num(c.sessions), `администраторов: ${c.admins}${c.blocked ? ' · заблокировано: ' + c.blocked : ''}`, '#/admin/users', 'shield')}
        ${tile('Неудачные входы', H.num(c.failedLogins), 'за сутки · приглашений действует: ' + c.invites, '#/admin/server', 'lock')}
      </div>
      <div class="adm-grid2">
        <section class="adm-card"><h3>Активность за 14 дней</h3>${chart(o.activity)}</section>
        <section class="adm-card"><h3>Последние действия <a class="adm-more" href="#/admin/audit">весь журнал</a></h3><ul class="adm-evs">${o.events.map(H.eventLine).join('') || '<li class="muted">Пока пусто.</li>'}</ul></section>
      </div>
      <p class="muted small adm-ver">XSatsu Студия ${esc(o.version)}</p>`;
  }

  /* ---------- раздел «Настройки сайта» ---------- */
  async function settings(ctx) {
    const sys = (await H.api('GET', 'v1/settings')).system;
    if (!ctx.alive()) return;
    const check = (name, label, hint = '') => `<label class="adm-switch"><input type="checkbox" name="${name}" ${sys[name] ? 'checked' : ''}><span class="sw"></span><span><b>${label}</b>${hint ? `<small class="muted">${hint}</small>` : ''}</span></label>`;
    ctx.body.innerHTML = `<form class="adm-settings">
      <section class="adm-card"><h3>Регистрация и вход</h3>
        <div class="adm-radios">${[['invite', 'По приглашению', 'Человек вводит код, который вы выдали в «Приглашениях».'], ['open', 'Открытая', 'Зарегистрироваться может любой посетитель сайта.'], ['closed', 'Закрыта', 'Учётные записи создаёт только администратор.']]
          .map(([v, t, h]) => `<label class="adm-radio"><input type="radio" name="registration" value="${v}" ${sys.registration === v ? 'checked' : ''}><span><b>${t}</b><small class="muted">${h}</small></span></label>`).join('')}</div>
        ${check('localMode', 'Можно работать без входа', 'Проекты хранятся в браузере посетителя. Выключите, чтобы Студией пользовались только после входа.')}
      </section>
      <section class="adm-card"><h3>Главная страница</h3>
        ${H.field('Название сайта', 'siteName', 'text', sys.siteName, 'maxlength="100"')}
        <label class="adm-f"><span>Объявление над списком проектов</span><textarea name="notice" rows="2" maxlength="500" placeholder="Например: 1 декабря с 10 до 12 — профилактика.">${esc(sys.notice)}</textarea><small>Пусто — объявления нет.</small></label>
      </section>
      <section class="adm-card"><h3>Хранение</h3>
        <div class="adm-row3">
          ${H.field('Корзина, дней', 'trashDays', 'number', sys.trashDays, 'min="1" max="365" required', 'Потом проект удаляется навсегда.')}
          ${H.field('Журнал, дней', 'auditDays', 'number', sys.auditDays, 'min="0" max="3650" required', '0 — хранить всегда.')}
          ${H.field('Место на пользователя, МБ', 'defaultQuotaMb', 'number', sys.defaultQuotaMb, 'min="0" max="1000000" required', '0 — без ограничения. Можно задать каждому отдельно.')}
        </div>
      </section>
      <section class="adm-card ${sys.maintenance ? 'is-alert' : ''}"><h3>Технические работы</h3>
        ${check('maintenance', 'Режим обслуживания', 'Пользователи могут открывать проекты, но не сохранять изменения. Администраторы работают как обычно.')}
        ${H.field('Сообщение для пользователей', 'maintenanceText', 'text', sys.maintenanceText, 'maxlength="300" placeholder="На сайте идут технические работы…"')}
      </section>
      <div class="adm-sticky-actions"><span class="muted small" data-dirty></span><span class="spacer"></span><button class="btn primary">${I('check', 15)}Сохранить</button></div>
    </form>`;
    const form = ctx.body.querySelector('form');
    form.oninput = () => { form.querySelector('[data-dirty]').textContent = 'Есть несохранённые изменения'; };
    form.onsubmit = UI.safe(async e => {
      e.preventDefault();
      const v = H.form(form);
      v.registration = form.querySelector('[name=registration]:checked')?.value || sys.registration;
      for (const k of ['trashDays', 'auditDays', 'defaultQuotaMb']) v[k] = Math.max(0, Math.round(+v[k] || 0));
      if (v.trashDays < 1) v.trashDays = 1;
      const r = await H.api('PUT', 'v1/settings/system', v);
      if (Api.state) { Api.state.system = r.system; Api.state.registration = r.system.registration; }
      UI.Account.paintNotice?.();
      UI.toast('Настройки сайта сохранены.', false, {seal: true});
      ctx.reload();
    });
  }

  /* ---------- раздел «Сервер» ---------- */
  async function server(ctx) {
    const s = await H.api('GET', 'v1/admin/server');
    if (!ctx.alive()) return;
    badge('server', s.warnings.filter(w => w.level !== 'info').length || '', s.warnings.some(w => w.level === 'error') ? 'error' : 'warn');
    const kv = rows => `<dl class="adm-kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const disk = s.disk.total ? s.disk.total - s.disk.free : 0;
    const mem = s.system.memory;
    const job = j => `<li class="adm-job ${j.ok === false ? 'bad' : j.ok ? 'good' : ''}">${I(j.ok === false ? 'warn' : j.ok ? 'check' : 'history', 16)}<div><b>${esc(j.title)}</b>
      <small class="muted">${j.finishedAt ? 'последний раз ' + esc(H.ago(j.finishedAt)) + ' (' + esc(H.date(j.finishedAt)) + ')' : 'ещё не запускалось'}</small>${j.message ? `<small>${esc(j.message)}</small>` : ''}</div></li>`;
    const sec = s.security;
    ctx.actions.innerHTML = `<button class="btn" data-refresh>${I('restore', 15)}Обновить</button><button class="btn primary" data-cleanup>${I('sparkle', 15)}Обслуживание сейчас</button>`;
    ctx.actions.querySelector('[data-refresh]').onclick = () => ctx.reload();
    ctx.actions.querySelector('[data-cleanup]').onclick = UI.safe(async () => {
      if (!await H.confirm('Очистить корзину старше срока, просроченные сеансы, ненужные файлы и старые записи журнала? Обычно это делает cron раз в сутки.', {ok: 'Запустить'})) return;
      const r = await UI.busy('Обслуживание…', () => H.api('POST', 'v1/admin/maintenance/cleanup'));
      UI.toast(r.text, false, {seal: true}); ctx.reload();
    });
    ctx.body.innerHTML = `${H.warnings(s.warnings) || `<div class="adm-allgood">${XS.Icons.emblem ? XS.Icons.emblem(22) : ''}<span>Всё в порядке: замечаний нет.</span></div>`}
      <div class="adm-grid3">
        <section class="adm-card"><h3>${I('monitor', 16)}Диск</h3>
          ${s.disk.total ? `<div class="adm-big">${H.bytes(s.disk.free)} <small class="muted">свободно из ${H.bytes(s.disk.total)}</small></div>${H.bar(disk, s.disk.total, {warnAt: .88})}` : '<p class="muted">Нет данных.</p>'}
          ${kv([['Хранилище', `<code>${esc(s.disk.path)}</code>`], ['Файлы проектов', H.bytes(s.storage.assets.bytes) + ' · ' + H.num(s.storage.assets.files) + ' шт.' + (s.storage.assets.partial ? ' (не всё посчитано)' : '')],
            ['Кэш шрифтов', H.bytes(s.storage.fontCache.bytes)], ['Резервные копии', H.bytes(s.storage.backups.bytes)], ['Ненужные файлы', s.storage.orphans ? H.num(s.storage.orphans) + ' — удалит обслуживание' : 'нет']])}
        </section>
        <section class="adm-card"><h3>${I('table', 16)}База данных</h3>
          <div class="adm-big">${H.bytes(s.database.bytes)} <small class="muted">${esc(s.database.version)}</small></div>
          ${kv([['Схема', esc(s.database.schema || '—') + (s.database.pending.length ? ' · ' + H.chip('не применено: ' + s.database.pending.length, 'bad') : ' ' + H.chip('актуальна', 'good'))]])}
          <details class="adm-details"><summary>Таблицы (${s.database.tables.length})</summary><table class="adm-table compact"><tbody>${s.database.tables.map(t => `<tr><td><code>${esc(t.name)}</code></td><td class="num">${H.num(t.rows)}</td><td class="num">${H.bytes(t.bytes)}</td></tr>`).join('')}</tbody></table></details>
        </section>
        <section class="adm-card"><h3>${I('cloud', 16)}Резервные копии</h3>
          ${s.backups.length ? `<div class="adm-big">${esc(H.ago(s.backups[0].at))} <small class="muted">последняя · ${H.bytes(s.backups[0].bytes)}</small></div>
            <details class="adm-details"><summary>Все копии (${s.backups.length})</summary><ul class="adm-list">${s.backups.map(b => `<li><code>${esc(b.name)}</code><span class="muted">${H.bytes(b.bytes)} · ${esc(H.date(b.at))}</span></li>`).join('')}</ul></details>`
            : '<p class="muted">Копий пока нет. Ночная копия включается при установке: <code>server-install.sh … --with-cron</code>.</p>'}
          <p class="muted small">Копии лежат на этом же сервере (storage/backups, 14 дней). Для надёжности их стоит забирать на другой компьютер.</p>
        </section>
      </div>
      <div class="adm-grid2">
        <section class="adm-card"><h3>${I('history', 16)}Фоновые задачи (cron)</h3><ul class="adm-jobs">${s.jobs.map(job).join('')}</ul>
          ${s.cronLog.length ? `<details class="adm-details"><summary>Журнал cron (последние строки)</summary><pre class="adm-pre">${esc(s.cronLog.join('\n'))}</pre></details>` : ''}</section>
        <section class="adm-card"><h3>${I('lock', 16)}Безопасность</h3>
          ${kv([['Неудачных входов за сутки', H.num(sec.failed24h)], ['Активных сеансов', H.num(sec.sessions)], ['Cookie только по HTTPS', sec.cookieSecure ? H.chip('да', 'good') : H.chip('нет', 'bad')],
            ['Код установки в config.php', sec.setupTokenSet ? H.chip('остался', 'warn') : H.chip('убран', 'good')], sec.publicOrigin ? ['Адрес сайта', `<code>${esc(sec.publicOrigin)}</code>`] : null])}
          ${sec.topIps.length ? `<h4>Откуда пытались войти</h4><table class="adm-table compact"><tbody>${sec.topIps.map(r => `<tr><td><code>${esc(r.ip)}</code></td><td class="num">${r.n}</td><td class="muted">${esc(H.ago(r.last.replace(' ', 'T') + 'Z'))}</td></tr>`).join('')}</tbody></table>
            <p class="muted small">Логины: ${sec.topLogins.map(r => esc(r.login) + ' (' + r.n + ')').join(', ')}</p>` : ''}
        </section>
      </div>
      <div class="adm-grid2">
        <section class="adm-card"><h3>${I('settings', 16)}PHP</h3>
          ${kv([['Версия', esc(s.php.version) + ' · ' + esc(s.php.sapi)], ['Память', esc(s.php.memoryLimit)], ['Загрузка файла / запроса', esc(s.php.uploadMax) + ' / ' + esc(s.php.postMax)], ['Время на запрос', s.php.maxExecution ? s.php.maxExecution + ' с' : 'без предела'],
            ['OPcache', s.php.opcache ? H.chip('включён', 'good') : H.chip('выключен', 'warn')], ['Резервная копия из админки', s.php.execAllowed ? 'возможна' : 'нет (exec отключён)']])}
          <div class="adm-chips">${Object.entries(s.php.extensions).map(([k, v]) => H.chip(k, v ? 'good' : 'off')).join('')}</div>
        </section>
        <section class="adm-card"><h3>${I('monitor', 16)}Система и пределы</h3>
          ${kv([s.system.load ? ['Нагрузка (1/5/15 мин)', s.system.load.map(x => x.toFixed(2)).join(' · ')] : null,
            mem ? ['Память', H.bytes(mem.total - mem.available) + ' занято из ' + H.bytes(mem.total)] : null,
            mem && mem.swapTotal ? ['Подкачка (swap)', H.bytes(mem.swapTotal - mem.swapFree) + ' из ' + H.bytes(mem.swapTotal) + ' ' + H.bar(mem.swapTotal - mem.swapFree, mem.swapTotal)] : null,
            ['Файл в проекте, до', s.limits.maxAssetMb + ' МБ'], ['Проект, до', s.limits.maxDocMb + ' МБ'], ['Версий на проект', s.limits.revisionsKeep + ', автоверсия раз в ' + s.limits.revisionEveryMinutes + ' мин'], ['Сеанс входа', s.limits.sessionDays + ' дн.'],
            ['Версия Студии', esc(s.version) + (s.env === 'dev' ? ' ' + H.chip('dev', 'warn') : '')]])}
          <p class="muted small">Пределы задаются в config.php на сервере (вне сайта).</p>
        </section>
      </div>`;
  }

  section({id: 'overview', title: 'Обзор', icon: 'monitor', order: 10, sub: 'Что происходит на сайте', render: overview});
  section({id: 'settings', title: 'Настройки сайта', icon: 'settings', order: 80, sub: 'Регистрация, главная, хранение, технические работы', render: settings});
  section({id: 'server', title: 'Сервер', icon: 'shield', order: 90, sub: 'Диск, база, резервные копии, cron, безопасность', render: server});

  UI.Admin = {open, close, route, section, badge, H, isOpen: () => !!$('admin') && !$('admin').hidden};
})(typeof window !== 'undefined' ? window : globalThis);
