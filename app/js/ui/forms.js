/* XSatsu Студия 4 · анкеты регистрации.
 * Владелец: «Проект → Анкета регистрации…» — выбрать столбцы, получить ссылку и QR, забрать ответы в записи.
 * Гость: страница #/form/<код> — анкета без входа и без редактора. Сервер — server/src/Forms.php. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const Api = () => XS.Api;
  const esc = XS.esc, I = (n, s = 15) => XS.Icons.icon(n, s);
  const TYPES = [['text', 'строка'], ['textarea', 'абзац'], ['email', 'почта'], ['tel', 'телефон'], ['choice', 'выбор'], ['date', 'дата']];
  const formUrl = token => location.origin + location.pathname + '#/form/' + token;
  const route = (...p) => 'v1/projects/' + encodeURIComponent(S.doc.id) + '/forms' + (p.length ? '/' + p.join('/') : '');

  function guessType(name) {
    const k = XS.key(name);
    if (/mail|почт/.test(k)) return 'email';
    if (/тел|phone/.test(k)) return 'tel';
    if (/дата|рожд/.test(k)) return 'date';
    if (/пол$/.test(k)) return 'choice';
    if (/комментар|отзыв|тема доклада|аннотац/.test(k)) return 'textarea';
    return 'text';
  }
  function qrSvg(text, size = 132) {
    try {
      const q = XS.QR.path(text, size, {level: 'M', quiet: 2});
      return `<svg class="form-qr" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${q.d}" fill="#000"/></svg>`;
    } catch (e) { return ''; }
  }

  /* ---------- окно владельца ---------- */
  function ensureDialog() {
    let d = $('formsDialog');
    if (d) return d;
    d = document.createElement('dialog');
    d.id = 'formsDialog'; d.className = 'dialog wide';
    d.innerHTML = `<header class="dialog-head"><h2>Анкета регистрации</h2><span class="spacer"></span><button class="btn icon" data-close aria-label="Закрыть">${I('close')}</button></header><div class="dialog-body forms-body"></div>`;
    d.querySelector('[data-close]').onclick = () => d.close();
    document.body.append(d);
    return d;
  }

  async function open() {
    if (!S.doc) return;
    if (!Api().user()) throw new Error('Анкеты работают в аккаунте: войдите на сайте Студии.');
    if (XS.Store.where(S.doc.id) !== 'remote') throw new Error('Анкета нужна проекту на сервере. Перенесите проект в аккаунт: главная → «В этом браузере» → «Перенести в аккаунт».');
    const d = ensureDialog();
    await draw();
    if (!d.open) d.showModal();
  }

  async function draw(newToken = '') {
    const body = $('formsDialog').querySelector('.dialog-body');
    const {forms} = await Api().call('GET', route());
    const list = forms.map(f => `<li class="form-card${f.open ? '' : ' closed'}" data-id="${f.id}">
        <div class="form-card-main">
          <b>${esc(f.title)}</b><span class="muted small">${f.fields.map(x => esc(x.label)).join(' · ')}</span>
          <span class="small">${f.open ? '<span class="dot ok"></span>принимает ответы' : '<span class="dot"></span>закрыта'} · ответов: <b>${f.responses}</b>${f.pending ? ' · <b class="accent">новых: ' + f.pending + '</b>' : ''}</span>
          <div class="row-form-inline"><input type="text" class="copy-input" readonly value="${esc(formUrl(f.token))}"><button type="button" class="btn small" data-copy>${I('copy')}Копировать</button><a class="btn small" target="_blank" rel="noopener" href="${esc(formUrl(f.token))}">${I('link')}Открыть</a></div>
          <div class="insp-actions">
            <button type="button" class="btn small primary" data-pull ${f.pending ? '' : 'disabled'}>${I('download')}Забрать ответы${f.pending ? ' (' + f.pending + ')' : ''}</button>
            <button type="button" class="btn small" data-toggle>${f.isOpen ? 'Закрыть приём' : 'Открыть приём'}</button>
            <button type="button" class="btn small danger" data-del>${I('trash')}Удалить</button>
          </div>
        </div>
        <div class="form-card-qr" title="QR-код анкеты — распечатайте на афише">${qrSvg(formUrl(f.token))}</div>
      </li>`).join('');
    const cols = S.doc.data.columns.filter(c => c.type !== 'image');
    body.innerHTML = `<p class="note">Гости открывают ссылку (или QR-код на афише) и заполняют анкету без регистрации. Каждый ответ становится записью проекта — с бейджем, пригласительным или сертификатом. Поля анкеты — это столбцы таблицы.</p>
      ${newToken ? `<p class="ok-line">${I('check', 16)} Анкета создана — ссылку можно отправлять.</p>` : ''}
      ${forms.length ? '<ul class="plain-list forms-list">' + list + '</ul>' : ''}
      <details class="form-new" ${forms.length ? '' : 'open'}><summary><b>${I('plus')} Новая анкета</b></summary>
        <label class="f wide"><span>Заголовок</span><input type="text" id="fnTitle" value="${esc('Регистрация: ' + S.doc.title)}"></label>
        <label class="f wide"><span>Пояснение для гостей</span><textarea id="fnIntro" rows="2" placeholder="Дата, место, что будет. Например: «12 ноября, 13:30, ауд. L300. После регистрации вы получите именной бейдж»."></textarea></label>
        <table class="form-fields"><thead><tr><th></th><th>Столбец → вопрос</th><th>Тип</th><th>Обяз.</th><th>Варианты (для выбора, через запятую)</th></tr></thead><tbody>
          ${cols.map((c, i) => { const t = guessType(c.name); return `<tr data-col="${esc(c.name)}"><td><input type="checkbox" data-on ${i < 4 ? 'checked' : ''}></td><td><input type="text" data-label value="${esc(c.name)}"></td><td><select data-type>${TYPES.map(([v, l]) => `<option value="${v}" ${v === t ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><input type="checkbox" data-req ${i === 0 ? 'checked' : ''}></td><td><input type="text" data-opts value="${t === 'choice' && /пол$/.test(XS.key(c.name)) ? 'М, Ж' : ''}"></td></tr>`; }).join('')}
        </tbody></table>
        <div class="row-form-inline"><label class="f"><span>Новый столбец</span><input type="text" id="fnNewCol" placeholder="например, Организация"></label><button type="button" class="btn small" id="fnAddCol">${I('plus')}Добавить</button></div>
        <div class="row-form-inline"><label class="f"><span>Не больше ответов</span><input type="number" id="fnMax" min="0" placeholder="без ограничения"></label><label class="f"><span>Закрыть приём</span><input type="datetime-local" id="fnClose"></label></div>
        <div class="insp-actions"><button type="button" class="btn primary" id="fnCreate">${I('form')}Создать анкету</button></div>
      </details>`;
    body.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => { const i = b.parentElement.querySelector('input'); i.select(); navigator.clipboard?.writeText(i.value); UI.toast('Ссылка скопирована.'); }; });
    body.querySelectorAll('.form-card').forEach(card => {
      const id = card.dataset.id, f = forms.find(x => String(x.id) === id);
      card.querySelector('[data-pull]').onclick = UI.safe(() => pull(f));
      card.querySelector('[data-toggle]').onclick = UI.safe(async () => { await Api().call('PATCH', route(id), {isOpen: !f.isOpen}); await draw(); });
      card.querySelector('[data-del]').onclick = UI.safe(async () => { if (!confirm('Удалить анкету «' + f.title + '»? Ссылка перестанет работать; уже перенесённые записи останутся в проекте.')) return; await Api().call('DELETE', route(id)); await draw(); });
    });
    $('fnAddCol').onclick = UI.safe(async () => {
      const name = $('fnNewCol').value.trim();
      if (!name) return;
      if (XS.Model.columnByName(S.doc, name)) throw new Error('Такой столбец уже есть.');
      UI.edit(d => XS.Model.addColumn(d, name));
      await draw();
      $('formsDialog').querySelector('.form-new').open = true;
    });
    $('fnCreate').onclick = UI.safe(async () => {
      const fields = [...body.querySelectorAll('.form-fields tr[data-col]')].filter(tr => tr.querySelector('[data-on]').checked).map(tr => ({
        column: tr.dataset.col, label: tr.querySelector('[data-label]').value, type: tr.querySelector('[data-type]').value,
        required: tr.querySelector('[data-req]').checked, options: tr.querySelector('[data-opts]').value.split(',').map(s => s.trim()).filter(Boolean)
      }));
      if (!fields.length) throw new Error('Отметьте хотя бы один столбец.');
      await UI.flush(); // столбцы, добавленные сейчас, должны быть сохранены в проекте
      const close = $('fnClose').value;
      const r = await Api().call('POST', route(), {title: $('fnTitle').value, intro: $('fnIntro').value, fields, maxResponses: +$('fnMax').value || 0, closesAt: close ? new Date(close).toISOString() : ''});
      await draw(r.token);
    });
  }

  /* Забрать новые ответы: добавить записями, сохранить проект, отметить на сервере перенесёнными. */
  async function pull(f) {
    if (S.readOnly) throw new Error('Проект открыт только для просмотра.');
    const {responses} = await Api().call('GET', route(f.id, 'responses'), undefined, {query: {pending: '1'}});
    if (!responses.length) { UI.toast('Новых ответов нет.'); return draw(); }
    UI.edit(d => { for (const r of responses) XS.Model.addRow(d, r.answers); S.row = d.data.rows.length - 1; });
    await UI.busy('Сохраняем записи…', () => UI.saveNow());
    await Api().call('POST', route(f.id, 'ack'), {ids: responses.map(r => r.id)});
    UI.toast('Добавлено записей из анкеты: ' + responses.length + '.');
    await draw();
  }

  /* При открытии проекта — тихо проверить, есть ли новые ответы. */
  async function notifyPending() {
    if (!S.doc || !Api().user() || XS.Store.where(S.doc.id) !== 'remote' || S.readOnly || S.link) return;
    try {
      const {forms} = await Api().call('GET', route());
      const n = forms.reduce((a, f) => a + f.pending, 0);
      if (n) UI.toast('Новых ответов в анкете: ' + n + '. Ctrl+K → «Анкета», чтобы добавить их в записи.');
    } catch (e) { /* анкет нет или сервер старый — молчим */ }
  }

  /* ---------- страница гостя ---------- */
  async function openPublic(token) {
    $('home').hidden = true; $('editor').hidden = true;
    let page = $('formPage');
    if (!page) { page = document.createElement('section'); page.id = 'formPage'; page.className = 'form-page'; document.body.append(page); }
    page.hidden = false;
    page.innerHTML = `<div class="form-shell"><div class="form-brand"><span data-logo="28"></span>XSatsu <b>Студия</b></div><div class="form-box"><p class="muted">Загружаем анкету…</p></div></div>`;
    XS.Icons.hydrate(page);
    const box = page.querySelector('.form-box');
    let f;
    try { f = await Api().call('GET', 'v1/f/' + encodeURIComponent(token)); }
    catch (e) { box.innerHTML = `<h1>Анкета недоступна</h1><p class="muted">${esc(e.message)}</p>`; return; }
    document.title = f.title + ' — регистрация';
    const input = fl => {
      const name = 'a-' + btoa(unescape(encodeURIComponent(fl.column))).replace(/=/g, '');
      const req = fl.required ? 'required' : '';
      if (fl.type === 'textarea') return `<textarea name="${name}" rows="4" ${req} maxlength="2000"></textarea>`;
      if (fl.type === 'choice') return fl.options.length <= 4
        ? `<div class="choice">${fl.options.map(o => `<label class="check"><input type="radio" name="${name}" value="${esc(o)}" ${req}> ${esc(o)}</label>`).join('')}</div>`
        : `<select name="${name}" ${req}><option value="">— выберите —</option>${fl.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
      const type = {email: 'email', tel: 'tel', date: 'date'}[fl.type] || 'text';
      return `<input type="${type}" name="${name}" ${req} maxlength="300" ${fl.type === 'text' && /фио|имя/i.test(fl.column) ? 'autocomplete="name"' : ''} ${type === 'email' ? 'autocomplete="email"' : ''} ${type === 'tel' ? 'autocomplete="tel"' : ''}>`;
    };
    const render = () => {
      box.innerHTML = `<h1>${esc(f.title)}</h1>${f.intro ? `<p class="form-intro">${esc(f.intro).replace(/\n/g, '<br>')}</p>` : ''}
        ${f.open ? `<form class="guest-form" novalidate>
          ${f.fields.map(fl => `<label class="f wide" data-col="${esc(fl.column)}"><span>${esc(fl.label)}${fl.required ? ' <b class="req">*</b>' : ''}</span>${input(fl)}${fl.hint ? `<small class="muted">${esc(fl.hint)}</small>` : ''}</label>`).join('')}
          <label class="hp" aria-hidden="true">Сайт <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
          <p class="form-error" hidden></p>
          <button class="btn primary big" type="submit">Отправить</button>
          <p class="muted small">Ответ увидят только организаторы.</p>
        </form>` : '<p class="form-closed">Регистрация закрыта. Спасибо за интерес!</p>'}`;
      const form = box.querySelector('form');
      if (!form) return;
      form.onsubmit = async e => {
        e.preventDefault();
        const err = form.querySelector('.form-error'); err.hidden = true;
        form.querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
        const answers = {};
        for (const fl of f.fields) {
          const name = 'a-' + btoa(unescape(encodeURIComponent(fl.column))).replace(/=/g, '');
          const el = form.querySelector(`[name="${name}"]:checked`) || form.querySelector(`[name="${name}"]:not([type=radio])`);
          answers[fl.column] = el ? el.value.trim() : '';
          if (fl.required && !answers[fl.column]) { form.querySelector(`[data-col="${CSS.escape(fl.column)}"]`)?.classList.add('invalid'); err.textContent = 'Заполните поле «' + fl.label + '».'; err.hidden = false; return; }
        }
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Отправляем…';
        try {
          await Api().call('POST', 'v1/f/' + encodeURIComponent(token), {answers, website: form.website.value});
          box.innerHTML = `<div class="form-done">${I('check', 40)}<h1>Спасибо, вы зарегистрированы!</h1><p class="muted">Организаторы получили ваш ответ.</p><button class="btn" type="button" data-again>Заполнить ещё одну анкету</button></div>`;
          box.querySelector('[data-again]').onclick = render;
        } catch (ex) {
          btn.disabled = false; btn.textContent = 'Отправить';
          if (ex.data?.field) form.querySelector(`[data-col="${CSS.escape(ex.data.field)}"]`)?.classList.add('invalid');
          err.textContent = ex.message; err.hidden = false;
        }
      };
    };
    render();
  }
  function closePublic() { const p = $('formPage'); if (p) p.hidden = true; }

  function init() {
    const openDoc = UI.open;
    UI.open = async (...args) => { const r = await openDoc(...args); notifyPending(); return r; };
    // Пункт меню «Проект» (виден с сервером).
    const menu = $('projectMenu'), anchor = menu?.querySelector('[data-act=share]');
    if (anchor && !menu.querySelector('[data-act=forms]')) {
      const b = document.createElement('button');
      b.dataset.act = 'forms'; b.dataset.serverOnly = ''; b.hidden = anchor.hidden;
      b.innerHTML = '<i data-icon="form"></i>Анкета регистрации…';
      anchor.after(b);
      XS.Icons.hydrate(b);
      b.addEventListener('click', UI.safe(open));
      new MutationObserver(() => { b.hidden = anchor.hidden; }).observe(anchor, {attributes: true, attributeFilter: ['hidden']});
    }
  }
  UI.Forms = {init, open, openPublic, closePublic, notifyPending};
})(typeof window !== 'undefined' ? window : globalThis);
