/* XSatsu Студия · админка: «Проекты» (все проекты сайта: поиск, владелец, корзина, передача другому, открыть),
 * «Ссылки и доступ» (гостевые ссылки, доступ коллегам, анкеты: отзыв, продление, закрытие), «Хранилище» (кто сколько занимает, квоты,
 * крупные проекты и файлы). Каркас и помощники — admin.js, сервер — AdminProjects.php. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, Api = XS.Api;
  const A = UI.Admin, H = A.H, esc = H.esc, I = H.I;
  const KIND = k => XS.Model?.KINDS?.[k]?.label || k;

  /* ---------- проекты ---------- */
  let pf = {q: '', scope: 'active', sort: 'updated', owner: ''};
  async function projects(ctx) {
    const qs = '&limit=100&q=' + encodeURIComponent(pf.q) + '&scope=' + pf.scope + '&sort=' + pf.sort + (pf.owner ? '&owner=' + pf.owner : '');
    const [data, {users}] = await Promise.all([H.api('GET', 'v1/admin/projects' + qs), H.api('GET', 'v1/admin/users')]);
    if (!ctx.alive()) return;
    if (pf.scope === 'trash' && data.total) ctx.actions.innerHTML = `<button class="btn danger" data-empty>${I('trash', 15)}Очистить корзину</button>`;
    ctx.actions.querySelector('[data-empty]')?.addEventListener('click', UI.safe(async () => {
      if (!await H.confirm(`Удалить навсегда все проекты из корзины (${data.total})? Это нельзя отменить.`, {ok: 'Удалить навсегда', danger: true})) return;
      const r = await H.api('POST', 'v1/admin/trash/empty'); UI.toast('Удалено проектов: ' + r.removed + '.'); ctx.reload();
    }));
    ctx.body.innerHTML = `<form class="adm-toolbar" data-f>
        <label class="search-wrap"><i data-icon="search"></i><input class="search" type="search" name="q" placeholder="Название, владелец, номер" value="${esc(pf.q)}"></label>
        <div class="seg">${[['active', 'Рабочие'], ['trash', 'Корзина'], ['all', 'Все']].map(([v, t]) => `<button type="button" data-scope="${v}" class="${pf.scope === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <select name="owner"><option value="">Все владельцы</option>${users.map(u => `<option value="${u.id}" ${String(u.id) === String(pf.owner) ? 'selected' : ''}>${esc(u.name || u.login)} (${u.projects})</option>`).join('')}</select>
        <select name="sort">${[['updated', 'Недавно изменённые'], ['created', 'Недавно созданные'], ['size', 'Самые большие'], ['rows', 'Больше записей'], ['title', 'По названию']].map(([v, t]) => `<option value="${v}" ${pf.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <span class="spacer"></span><span class="muted small">Найдено: ${H.num(data.total)}${data.total > data.projects.length ? ', показаны первые ' + data.projects.length : ''}</span>
      </form>
      ${data.projects.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Проект</th><th>Владелец</th><th class="num">Записей</th><th>Размер</th><th>Доступ</th><th>Изменён</th><th></th></tr></thead><tbody>${data.projects.map(p => `<tr data-id="${esc(p.id)}" class="${p.deletedAt ? 'is-off' : ''}">
        <td><b>${esc(p.title)}</b>${p.deletedAt ? ' ' + H.chip('в корзине', 'warn') : ''}<small class="muted">${esc(KIND(p.kind))} · ${Math.round(p.page.width)}×${Math.round(p.page.height)} мм${p.sides > 1 ? ' · сторон: ' + p.sides : ''} · версия ${p.revision}</small></td>
        <td><a href="#/admin/users/${p.owner.id}">${esc(p.owner.name || p.owner.login)}</a>${p.owner.blocked ? ' ' + H.chip('заблокирован', 'bad') : ''}<small class="muted">${esc(p.owner.login)}</small></td>
        <td class="num">${H.num(p.rows)}</td><td><span title="документ ${esc(H.bytes(p.size))}, файлы ${esc(H.bytes(p.files))}">${H.bytes(p.size + p.files)}</span></td>
        <td>${[p.people ? H.chip('людей: ' + p.people) : '', p.links ? H.chip('ссылок: ' + p.links, 'gold') : '', p.forms ? H.chip('анкет: ' + p.forms) : ''].join(' ') || '<span class="muted">—</span>'}</td>
        <td><span title="${esc(H.date(p.updatedAt))}">${esc(H.ago(p.deletedAt || p.updatedAt))}</span>${p.updatedBy ? `<small class="muted">${p.updatedByGuest ? 'гость ' : ''}${esc(p.updatedBy)}</small>` : ''}</td>
        <td class="nowrap"><button class="btn small ghost" data-menu title="Действия">${I('more', 16)}</button></td></tr>`).join('')}</tbody></table></div>`
        : H.empty(pf.scope === 'trash' ? 'Корзина пуста.' : 'Проектов не нашли.')}
      ${pf.scope === 'trash' ? `<p class="muted small">Проекты из корзины удаляются навсегда через ${data.trashDays} ${H.plural(data.trashDays, 'день', 'дня', 'дней')} (настройка сайта).</p>` : ''}`;
    const form = ctx.body.querySelector('[data-f]');
    const apply = () => { const v = H.form(form); pf = {...pf, q: v.q, owner: v.owner, sort: v.sort}; ctx.reload(); };
    form.onsubmit = e => { e.preventDefault(); apply(); };
    form.q.oninput = XS.debounce ? XS.debounce(apply, 400) : null;
    form.owner.onchange = apply; form.sort.onchange = apply;
    form.querySelectorAll('[data-scope]').forEach(b => { b.onclick = () => { pf.scope = b.dataset.scope; ctx.reload(); }; });
    ctx.body.querySelectorAll('[data-menu]').forEach(b => { b.onclick = e => { e.stopPropagation(); menu(ctx, b, data.projects.find(p => p.id === b.closest('tr').dataset.id), users); }; });
    if (pf.q) { const q = form.q; q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  /* Меню действий у проекта (то же меню, что у аккаунта: #accountMenu-подобное, рисуем своё). */
  function menu(ctx, anchor, p, users) {
    document.querySelector('.adm-pop')?.remove();
    const m = document.createElement('div');
    m.className = 'menu adm-pop';
    m.innerHTML = (p.deletedAt
      ? `<button data-a="restore">${I('restore')}Восстановить</button><button data-a="purge" class="danger">${I('trash')}Удалить навсегда</button>`
      : `<a href="#/doc/${encodeURIComponent(p.id)}" data-a="open">${I('folderOpen')}Открыть</a><button data-a="transfer">${I('users')}Передать другому…</button><button data-a="links">${I('link')}Ссылки и доступ</button><hr><button data-a="trash" class="danger">${I('trash')}В корзину</button>`);
    document.body.append(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px'; m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off, true); } };
    setTimeout(() => document.addEventListener('click', off, true));
    m.onclick = UI.safe(async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      m.remove(); document.removeEventListener('click', off, true);
      if (a === 'open') return;
      if (a === 'links') { lf = {...lf, kind: 'link', state: 'all', q: p.title}; ctx.go('links'); return; }
      if (a === 'trash') { if (!await H.confirm(`Переместить «${esc(p.title)}» в корзину? Владелец сможет восстановить его в течение срока корзины.`, {ok: 'В корзину', danger: true})) return; await H.api('DELETE', 'v1/projects/' + encodeURIComponent(p.id)); UI.toast('Проект в корзине.'); }
      if (a === 'restore') { await H.api('POST', 'v1/projects/' + encodeURIComponent(p.id) + '/restore'); UI.toast('Проект восстановлен.'); }
      if (a === 'purge') { if (!await H.confirm(`Удалить «${esc(p.title)}» навсегда вместе с версиями, ссылками и анкетами?`, {ok: 'Удалить навсегда', danger: true})) return; await H.api('DELETE', 'v1/projects/' + encodeURIComponent(p.id) + '&purge=1'); UI.toast('Проект удалён.'); }
      if (a === 'transfer') { transfer(ctx, p, users); return; }
      ctx.reload();
    });
  }
  function transfer(ctx, p, users) {
    const m = H.modal('Передать проект', `<form class="adm-form"><p>«<b>${esc(p.title)}</b>» сейчас у ${esc(p.owner.name || p.owner.login)}. Версии, ссылки и анкеты переходят вместе с проектом.</p>
      <label class="adm-f"><span>Новый владелец</span><select name="to">${users.filter(u => u.id !== p.owner.id).map(u => `<option value="${u.id}">${esc(u.name || u.login)} (${esc(u.login)})</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="keepAccess" checked> Оставить ${esc(p.owner.login)} доступ на правку</label>
      <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Передать</button></div></form>`);
    m.body.querySelector('form').onsubmit = UI.safe(async e => {
      e.preventDefault(); const v = H.form(e.target);
      await H.api('POST', 'v1/admin/projects/' + encodeURIComponent(p.id) + '/transfer', {to: +v.to, keepAccess: v.keepAccess});
      m.close(); UI.toast('Проект передан.'); ctx.reload();
    });
  }

  /* ---------- ссылки и доступ ---------- */
  let lf = {kind: 'link', state: 'active', q: ''};
  async function links(ctx) {
    const data = await H.api('GET', 'v1/admin/links&kind=' + lf.kind + '&state=' + lf.state + '&q=' + encodeURIComponent(lf.q));
    if (!ctx.alive()) return;
    ctx.actions.innerHTML = `<button class="btn" data-purge>${I('trash', 15)}Убрать все истёкшие</button>`;
    ctx.actions.querySelector('[data-purge]').onclick = UI.safe(async () => {
      if (!await H.confirm('Удалить все ссылки и доступы с истёкшим сроком? Они уже не работают; cron и так убирает их через 30 дней.', {ok: 'Убрать'})) return;
      const r = await H.api('POST', 'v1/admin/links/purge-expired'); UI.toast('Убрано: ' + r.removed + '.'); ctx.reload();
    });
    const perm = x => x.permission === 'edit' ? H.chip('правка', 'gold') : H.chip('просмотр');
    const expiry = x => x.expired ? H.chip('истекла', 'off') : x.expiresAt ? `<span title="${esc(H.date(x.expiresAt))}">до ${esc(H.day(x.expiresAt))}</span>` : '<span class="muted">бессрочно</span>';
    const proj = x => `<b>${esc(x.project.title)}</b>${x.project.trashed ? ' ' + H.chip('в корзине', 'warn') : ''}<small class="muted">владелец ${esc(x.owner)}${x.ownerBlocked ? ' (заблокирован — ссылка не работает)' : ''}</small>`;
    let table = '';
    if (lf.kind === 'link') table = `<thead><tr><th>Проект</th><th>Для кого</th><th>Права</th><th>Срок</th><th>Использование</th><th></th></tr></thead><tbody>${data.items.map(x => `<tr data-id="${x.id}" class="${x.expired ? 'is-off' : ''}">
      <td>${proj(x)}</td><td>${esc(x.label || '—')}<small class="muted">создал ${esc(x.createdBy || '—')}, ${esc(H.day(x.createdAt))}</small></td><td>${perm(x)}</td><td>${expiry(x)}</td>
      <td>${x.opens ? `открыта ${x.opens} раз${x.edits ? ', правок ' + x.edits : ''}<small class="muted">последний раз ${esc(H.ago(x.lastUsedAt))}</small>` : '<span class="muted">не открывали</span>'}</td>
      <td class="nowrap"><button class="btn small ghost" data-extend>Срок…</button><button class="btn small ghost danger" data-revoke>Отозвать</button></td></tr>`).join('')}</tbody>`;
    if (lf.kind === 'user') table = `<thead><tr><th>Проект</th><th>Кому</th><th>Права</th><th>Срок</th><th></th></tr></thead><tbody>${data.items.map(x => `<tr data-id="${x.id}" class="${x.expired ? 'is-off' : ''}">
      <td>${proj(x)}</td><td>${esc(x.user.name || x.user.login)}<small class="muted">${esc(x.user.login)}</small></td><td>${perm(x)}</td><td>${expiry(x)}</td>
      <td class="nowrap"><button class="btn small ghost" data-perm>${x.permission === 'edit' ? 'Только просмотр' : 'Разрешить правку'}</button><button class="btn small ghost danger" data-revoke>Отозвать</button></td></tr>`).join('')}</tbody>`;
    if (lf.kind === 'form') table = `<thead><tr><th>Анкета</th><th>Проект</th><th class="num">Ответов</th><th>Состояние</th><th></th></tr></thead><tbody>${data.items.map(x => `<tr data-id="${x.id}" class="${x.open ? '' : 'is-off'}">
      <td><b>${esc(x.title || 'Анкета')}</b><small class="muted">создана ${esc(H.day(x.createdAt))}</small></td><td>${esc(x.project.title)}<small class="muted">владелец ${esc(x.owner)}</small></td>
      <td class="num">${x.responses}${x.maxResponses ? ' / ' + x.maxResponses : ''}${x.lastUsedAt ? `<small class="muted">${esc(H.ago(x.lastUsedAt))}</small>` : ''}</td>
      <td>${x.open ? H.chip('принимает ответы', 'good') + (x.closesAt ? `<small class="muted">до ${esc(H.day(x.closesAt))}</small>` : '') : H.chip('закрыта', 'off')}</td>
      <td class="nowrap"><button class="btn small ghost ${x.open ? 'danger' : ''}" data-form="${x.open ? 0 : 1}">${x.open ? 'Закрыть' : 'Открыть снова'}</button></td></tr>`).join('')}</tbody>`;
    ctx.body.innerHTML = `<form class="adm-toolbar" data-f>
        <div class="seg">${[['link', 'Гостевые ссылки'], ['user', 'Доступ коллегам'], ['form', 'Анкеты']].map(([v, t]) => `<button type="button" data-kind="${v}" class="${lf.kind === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <select name="state">${[['active', 'Действующие'], ['expired', lf.kind === 'form' ? 'Закрытые' : 'Истёкшие'], ['all', 'Все']].map(([v, t]) => `<option value="${v}" ${lf.state === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="search-wrap"><i data-icon="search"></i><input class="search" type="search" name="q" placeholder="Проект, для кого, логин" value="${esc(lf.q)}"></label>
        <span class="spacer"></span><span class="muted small">${H.num(data.items.length)}</span></form>
      ${data.items.length ? `<div class="adm-table-wrap"><table class="adm-table">${table}</table></div>` : H.empty(lf.kind === 'form' ? 'Анкет не нашли.' : 'Ничего не нашли. Ссылки создают владельцы проектов в «Проект → Доступ и ссылка».')}
      ${lf.kind === 'link' ? '<p class="muted small">Сам адрес ссылки сервер не хранит (только отпечаток), поэтому показать или скопировать его нельзя — только отозвать, продлить или поменять права. Новую ссылку создаёт владелец проекта.</p>' : ''}`;
    const form = ctx.body.querySelector('[data-f]');
    const apply = () => { lf = {...lf, state: form.state.value, q: form.q.value}; ctx.reload(); };
    form.onsubmit = e => { e.preventDefault(); apply(); };
    form.state.onchange = apply;
    form.q.oninput = XS.debounce ? XS.debounce(apply, 400) : null;
    if (lf.q) { form.q.focus(); form.q.setSelectionRange(lf.q.length, lf.q.length); }
    form.querySelectorAll('[data-kind]').forEach(b => { b.onclick = () => { lf = {kind: b.dataset.kind, state: 'active', q: lf.q}; ctx.reload(); }; });
    ctx.body.querySelectorAll('tr[data-id]').forEach(tr => {
      const x = data.items.find(i => String(i.id) === tr.dataset.id);
      tr.querySelector('[data-revoke]')?.addEventListener('click', UI.safe(async () => {
        if (!await H.confirm(lf.kind === 'link' ? `Отозвать ссылку${x.label ? ' «' + esc(x.label) + '»' : ''} к «${esc(x.project.title)}»? Кто её открывал, больше не войдёт.` : `Отозвать доступ ${esc(x.user.login)} к «${esc(x.project.title)}»?`, {ok: 'Отозвать', danger: true})) return;
        await H.api('DELETE', 'v1/admin/links/' + x.id); UI.toast('Отозвано.'); ctx.reload();
      }));
      tr.querySelector('[data-perm]')?.addEventListener('click', UI.safe(async () => { await H.api('PATCH', 'v1/admin/links/' + x.id, {permission: x.permission === 'edit' ? 'view' : 'edit'}); UI.toast('Права изменены.'); ctx.reload(); }));
      tr.querySelector('[data-form]')?.addEventListener('click', UI.safe(async e => { await H.api('PATCH', 'v1/admin/forms/' + x.id, {open: e.currentTarget.dataset.form === '1'}); UI.toast('Готово.'); ctx.reload(); }));
      tr.querySelector('[data-extend]')?.addEventListener('click', () => {
        const m = H.modal('Срок ссылки', `<form class="adm-form"><p>«${esc(x.project.title)}»${x.label ? ' · ' + esc(x.label) : ''}. Сейчас: ${x.expiresAt ? (x.expired ? 'истекла ' : 'до ') + esc(H.date(x.expiresAt)) : 'бессрочно'}.</p>
          <label class="adm-f"><span>Действует с этого момента</span><select name="days"><option value="1">1 день</option><option value="7">неделю</option><option value="30" selected>месяц</option><option value="90">3 месяца</option><option value="365">год</option><option value="0">бессрочно</option></select></label>
          <label class="adm-f"><span>Права</span><select name="permission"><option value="view">просмотр</option><option value="edit" ${x.permission === 'edit' ? 'selected' : ''}>правка</option></select></label>
          <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
        m.body.querySelector('form').onsubmit = UI.safe(async e => { e.preventDefault(); const v = H.form(e.target); await H.api('PATCH', 'v1/admin/links/' + x.id, {days: +v.days, permission: v.permission}); m.close(); UI.toast('Сохранено.'); ctx.reload(); });
      });
    });
  }

  /* ---------- хранилище ---------- */
  async function storage(ctx) {
    const s = await H.api('GET', 'v1/admin/storage');
    if (!ctx.alive()) return;
    const t = s.totals, total = t.docs + t.files + t.revisions;
    const TYPE = {image: 'Картинки', pdf: 'PDF', font: 'Шрифты', other: 'Другое'};
    const seg = [['Файлы', t.files, 'var(--accent)'], ['Документы', t.docs, 'var(--gold)'], ['Версии', t.revisions, 'var(--steel)']];
    ctx.body.innerHTML = `<div class="adm-grid3">
        <section class="adm-card"><h3>${I('cloud', 16)}Всего</h3><div class="adm-big">${H.bytes(total)}</div>
          <div class="adm-stack">${seg.map(([n, v, c]) => `<i style="flex:${v || 0.0001};background:${c}" title="${n}: ${H.bytes(v)}"></i>`).join('')}</div>
          <dl class="adm-kv">${seg.map(([n, v, c]) => `<dt><i class="adm-dot" style="background:${c}"></i>${n}</dt><dd>${H.bytes(v)}${n === 'Файлы' ? ' · ' + H.num(t.filesCount) + ' шт.' : n === 'Версии' ? ' · ' + H.num(t.revisionsCount) : ''}</dd>`).join('')}</dl></section>
        <section class="adm-card"><h3>${I('image', 16)}Файлы по типам</h3><dl class="adm-kv">${s.types.map(x => `<dt>${TYPE[x.type] || x.type}</dt><dd>${H.bytes(x.bytes)} · ${H.num(x.count)} шт.</dd>`).join('') || '<dt>—</dt><dd></dd>'}</dl></section>
        <section class="adm-card"><h3>${I('trash', 16)}Можно освободить</h3><dl class="adm-kv">
          <dt>Корзина</dt><dd>${H.bytes(t.trash)} · ${H.num(t.trashCount)} ${H.plural(t.trashCount, 'проект', 'проекта', 'проектов')}</dd>
          <dt>Ненужные файлы</dt><dd>${H.bytes(t.orphans)} · ${H.num(t.orphansCount)} шт.</dd></dl>
          <div class="adm-inline">${t.trashCount ? `<a class="btn small" href="#/admin/projects" data-trash>Корзина</a>` : ''}<a class="btn small" href="#/admin/server">Обслуживание…</a></div></section>
      </div>
      <section class="adm-card"><h3>${I('users', 16)}Кто сколько занимает <span class="muted small" style="margin-left:auto;font-weight:400">квота по умолчанию: ${s.defaultQuotaMb ? s.defaultQuotaMb + ' МБ' : 'без ограничения'} · <a href="#/admin/settings">изменить</a></span></h3>
        <div class="adm-table-wrap flat"><table class="adm-table"><thead><tr><th>Пользователь</th><th class="num">Проекты</th><th>Занято</th><th>Квота</th><th></th></tr></thead><tbody>${s.users.map(u => `<tr data-id="${u.id}">
          <td><div class="adm-user">${H.avatar(u)}<div><b>${esc(u.name || u.login)}</b><small class="muted">${esc(u.login)}</small></div></div></td>
          <td class="num">${u.projects}${u.trash ? `<small class="muted">в корзине ${u.trash}</small>` : ''}</td>
          <td class="adm-usage">${u.limit ? H.bar(u.total, u.limit) : ''}<small>${H.bytes(u.total)}${u.limit ? ' из ' + H.bytes(u.limit) : ''}</small><small class="muted">документы ${H.bytes(u.docs)} · файлы ${H.bytes(u.files)}</small></td>
          <td><input type="number" min="0" class="adm-q" value="${u.quotaMb ?? ''}" placeholder="${s.defaultQuotaMb ? s.defaultQuotaMb + ' (общая)' : 'общая'}" title="МБ; пусто — общая квота, 0 — без ограничения"> <span class="muted small">МБ</span></td>
          <td class="nowrap"><a class="btn small ghost" href="#/admin/projects" data-owner="${u.id}">Проекты</a></td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Занято = документы проектов (и в корзине) + файлы этих проектов; общий файл в нескольких проектах считается один раз. Версии не считаются. Когда квота заполнена, проекты этого человека перестают расти, но уменьшать и удалять их можно.</p></section>
      <div class="adm-grid2">
        <section class="adm-card"><h3>${I('file', 16)}Самые большие проекты</h3><ul class="adm-list">${s.bigProjects.map(p => `<li><div><b>${esc(p.title)}</b>${p.trashed ? ' ' + H.chip('в корзине', 'warn') : ''}<small class="muted">${esc(p.owner)} · документ ${H.bytes(p.size)} · файлы ${H.bytes(p.files)}</small></div><span class="adm-size">${H.bytes(p.size + p.files)}</span></li>`).join('') || '<li class="muted">Нет проектов.</li>'}</ul></section>
        <section class="adm-card"><h3>${I('image', 16)}Самые большие файлы</h3><ul class="adm-list">${s.bigFiles.map(f => `<li><div><b>${esc(f.project || 'не используется')}</b><small class="muted">${esc(f.mime)} · <code>${esc(f.sha)}</code>${f.uses > 1 ? ' · в ' + f.uses + ' проектах' : ''}</small></div><span class="adm-size">${H.bytes(f.bytes)}</span></li>`).join('') || '<li class="muted">Файлов нет.</li>'}</ul></section>
      </div>`;
    ctx.body.querySelector('[data-trash]')?.addEventListener('click', () => { pf = {...pf, scope: 'trash', owner: ''}; });
    ctx.body.querySelectorAll('[data-owner]').forEach(a => { a.onclick = () => { pf = {...pf, owner: a.dataset.owner, scope: 'active', q: ''}; }; });
    ctx.body.querySelectorAll('.adm-q').forEach(inp => {
      inp.onchange = UI.safe(async () => {
        const id = inp.closest('tr').dataset.id;
        await H.api('PATCH', 'v1/admin/users/' + id, {quotaMb: inp.value === '' ? null : +inp.value});
        UI.toast('Квота сохранена.'); ctx.reload();
      });
    });
  }

  A.section({id: 'projects', title: 'Проекты', icon: 'file', order: 30, sub: 'Все проекты сайта: поиск, корзина, передача другому', render: projects});
  A.section({id: 'links', title: 'Ссылки и доступ', icon: 'link', order: 40, sub: 'Гостевые ссылки, доступ коллегам и анкеты — отозвать, продлить, закрыть', render: links});
  A.section({id: 'storage', title: 'Хранилище', icon: 'cloud', order: 50, sub: 'Кто сколько занимает, квоты, крупные проекты и файлы', render: storage});
})(typeof window !== 'undefined' ? window : globalThis);
