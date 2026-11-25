/* XSatsu Студия · главная: создать проект из шаблона или PDF, открыть файл, список проектов. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, $ = UI.$;
  let projects = [];

  function presetCard({id, kind, title, hint, special, isNew, make}, onclick) {
    const b = document.createElement('button');
    b.className = 'preset' + (special ? ' special' : '') + (make ? ' has-thumb' : ''); b.type = 'button';
    b.innerHTML = (make ? '<span class="pthumb">' + XS.Icons.icon('file', 26) + '</span>' : '') +
      `<span class="kind">${XS.esc(XS.Model.KINDS[kind]?.label || kind)}${isNew ? ' <em class="new">новое</em>' : ''}</span><b>${XS.esc(title)}</b><span class="muted small">${XS.esc(hint)}</span>`;
    b.onclick = UI.safe(onclick);
    if (make) thumbs.queue(b.querySelector('.pthumb'), id, make);
    return b;
  }

  /* Превью шаблонов: рисуются по очереди, когда карточка видна; хранятся в localStorage. */
  const thumbs = (() => {
    const VERSION = 'v4.0', jobs = [];
    let running = false;
    const keyOf = id => 'xs-thumb:' + VERSION + ':' + id;
    const show = (el, url) => { el.innerHTML = '<img alt="" src="' + url + '">'; };
    async function run() {
      if (running) return;
      running = true;
      while (jobs.length) {
        const {el, id, make} = jobs.shift();
        try {
          const doc = await make();
          await XS.Fonts.ensureForDoc(doc);
          const scene = XS.Scene.build(doc, 0, doc.data.rows[0] || null, 0);
          const dpi = 25.4 * 150 / Math.max(doc.page.width, doc.page.height);
          const c = await XS.CanvasRender.toCanvas(scene, dpi);
          const url = c.toDataURL('image/jpeg', 0.82);
          try { localStorage.setItem(keyOf(id), url); } catch (e) { /* место кончилось — просто не кэшируем */ }
          show(el, url);
        } catch (e) { console.warn('Превью шаблона', id, e); }
        await XS.pause();
      }
      running = false;
    }
    const io = global.IntersectionObserver ? new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); jobs.push(en.target._job); run(); }
    }, {rootMargin: '200px'}) : null;
    function queue(el, id, make) {
      const cached = (() => { try { return localStorage.getItem(keyOf(id)); } catch (e) { return null; } })();
      if (cached) return show(el, cached);
      el._job = {el, id, make};
      if (io) io.observe(el); else { jobs.push(el._job); run(); }
    }
    return {queue};
  })();
  function renderPresets() {
    const grid = $('presetGrid');
    grid.replaceChildren(
      presetCard({kind: 'custom', title: 'Из PDF-шаблона', hint: 'Загрузите готовый макет (PDF) — размер и оборот возьмутся из файла', special: true}, () => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,application/pdf';
        i.onchange = UI.safe(async () => { if (i.files[0]) await UI.create(await UI.busy('Открываем PDF…', () => XS.Presets.fromPdf(i.files[0]))); });
        i.click();
      }),
      ...XS.Presets.LIST.map(p => presetCard(p, async () => UI.create(await UI.busy('Создаём «' + p.title + '»…', p.make)))),
      presetCard({kind: 'custom', title: 'Пустой макет', hint: 'А4, без фона — всё с нуля', special: true}, async () => {
        const doc = XS.Model.blankDoc('custom', 'Новый проект', {width: 210, height: 297});
        await UI.create(doc);
      })
    );
  }

  /* Списки: «На сервере» (mine), «Доступные мне» (shared), «В этом браузере» (local), «Корзина» (trash). */
  let scope = 'local';
  const SCOPES = [['mine', 'Мои проекты', 'cloud'], ['shared', 'Доступные мне', 'users'], ['local', 'В этом браузере', 'file'], ['trash', 'Корзина', 'trash']];
  function renderScopes() {
    const box = $('projectScopes'), user = XS.Api?.user();
    box.hidden = !user;
    if (!user) { scope = 'local'; return; }
    box.replaceChildren(...SCOPES.map(([id, label, icon]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'scope' + (id === scope ? ' active' : '');
      b.innerHTML = XS.Icons.icon(icon, 15) + label; b.onclick = UI.safe(async () => { scope = id; await render(); });
      return b;
    }));
  }
  async function render() {
    renderPresets();
    const user = XS.Api?.user();
    if (user && !render.started) { render.started = true; scope = 'mine'; }
    if (!user) scope = 'local';
    renderScopes();
    try { projects = scope === 'local' ? await XS.Store.local.list() : await XS.Store.remote.list(scope); }
    catch (e) { UI.toast(e.message, true); projects = []; }
    renderProjects();
  }
  const ACTS = {
    mine: [['open', 'Открыть'], ['copy', 'copy', 'Копия'], ['file', 'download', 'Скачать файл проекта'], ['share', 'share', 'Доступ'], ['del', 'trash', 'В корзину']],
    shared: [['open', 'Открыть'], ['copy', 'copy', 'Копия себе'], ['file', 'download', 'Скачать файл проекта'], ['del', 'close', 'Убрать из списка']],
    local: [['open', 'Открыть'], ['copy', 'copy', 'Копия'], ['file', 'download', 'Скачать файл проекта'], ['upload', 'cloud', 'Перенести в аккаунт'], ['del', 'trash', 'Удалить']],
    trash: [['restore', 'Восстановить'], ['purge', 'trash', 'Удалить навсегда']]
  };
  function renderProjects() {
    const q = XS.key($('projectSearch').value), grid = $('projectGrid');
    const list = projects.filter(p => !q || XS.key(p.title).includes(q) || XS.key(p.owner?.name || '').includes(q));
    const user = XS.Api?.user();
    $('projectCount').textContent = projects.length ? '· ' + projects.length : '';
    $('migrateAll').hidden = !(user && scope === 'local' && projects.length);
    $('storageHint').textContent = scope === 'local'
      ? (user ? 'Эти проекты лежат только в этом браузере. Перенесите их в аккаунт — тогда они откроются на любом компьютере, появятся версии и совместная работа.' : 'Проекты хранятся в этом браузере. Для переноса на другой компьютер — «Проект → Сохранить файл проекта» или войдите в аккаунт.')
      : scope === 'trash' ? 'Проекты из корзины удаляются навсегда через ' + (XS.Api.state?.system?.trashDays || 30) + ' дн.' : scope === 'shared' ? 'Проекты коллег, к которым вам открыли доступ.' : 'Проекты в вашем аккаунте на сервере: открываются с любого компьютера, у каждого есть версии.';
    const acts = ACTS[scope] || ACTS.local;
    grid.replaceChildren(...list.map(p => {
      const card = document.createElement('div');
      card.className = 'project';
      const date = new Date(scope === 'trash' ? p.deletedAt : p.updatedAt);
      const badge = scope === 'shared' ? `<span class="tag">${XS.esc(p.owner?.name || p.owner?.login || '')} · ${p.permission === 'edit' ? 'редактирование' : 'просмотр'}</span>` : p.shared ? `<span class="tag">${XS.Icons.icon('users', 12)} общий</span>` : '';
      card.innerHTML = `<div class="thumb" data-open>${p.thumb ? `<img src="${p.thumb}" alt="">` : '<span class="muted">нет превью</span>'}${badge}</div>
        <div class="info"><b data-open title="${XS.esc(p.title)}">${XS.esc(p.title)}</b>
        <span class="muted small">${XS.esc(XS.Model.KINDS[p.kind]?.label || '')} · записей: ${p.rows} · ${Math.round(p.page?.width || 0)}×${Math.round(p.page?.height || 0)} мм</span>
        <span class="muted small">${scope === 'trash' ? 'удалён' : 'изменён'} ${isNaN(date) ? '' : date.toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'})}</span></div>
        <div class="acts">${acts.map(([act, icon, title], i) => title ? `${i === acts.length - 1 ? '<span class="spacer"></span>' : ''}<button class="btn small${['del', 'purge'].includes(act) ? ' danger' : ''}" data-act="${act}" title="${title}">${XS.Icons.icon(icon, 15)}</button>` : `<button class="btn small" data-act="${act}">${icon}</button>`).join('')}</div>`;
      card.addEventListener('click', UI.safe(async e => {
        const act = e.target.closest('[data-act]')?.dataset.act || (e.target.closest('[data-open]') && scope !== 'trash' ? 'open' : '');
        if (!act) return;
        if (act === 'open') return openId(p.id, scope);
        if (act === 'restore') { await XS.Store.remote.restore(p.id); UI.toast('Проект восстановлен.'); return render(); }
        if (act === 'purge') { if (confirm('Удалить «' + p.title + '» навсегда? Это нельзя отменить.')) { await XS.Store.remote.remove(p.id, true); await render(); } return; }
        if (act === 'del') {
          if (scope === 'local') { if (UI.Prefs.get('confirmDelete') && !confirm('Удалить проект «' + p.title + '»? Это нельзя отменить. Можно сначала скачать файл проекта.')) return; await XS.Store.local.remove(p.id); }
          else { await XS.Store.remote.remove(p.id); UI.toast(scope === 'shared' ? 'Проект убран из списка.' : 'Проект в корзине. Восстановить — «Корзина».'); }
          return render();
        }
        const doc = scope === 'local' ? await XS.Store.local.get(p.id) : await UI.busy('Загружаем проект…', () => XS.Store.remote.get(p.id));
        if (!doc) throw new Error('Проект не найден.');
        if (act === 'copy') { doc.id = XS.uid('doc'); doc.title += ' (копия)'; await UI.busy('Копируем…', () => scope === 'local' ? XS.Store.local.save(doc, p.thumb) : XS.Store.remote.create(doc, p.thumb)); if (scope === 'shared') { scope = 'mine'; } await render(); }
        if (act === 'file') XS.download(XS.Store.toFile(doc), XS.Zip.sanitizeFilename(doc.title) + '.xsatsu.json');
        if (act === 'upload') { await migrate([p]); }
        if (act === 'share') { await UI.open(doc); await UI.Account.share(); }
      }));
      return card;
    }));
    if (!list.length) grid.innerHTML = '<p class="muted">' + (projects.length ? 'Ничего не найдено.' : scope === 'trash' ? 'Корзина пуста.' : scope === 'shared' ? 'Вам пока не открывали доступ к проектам.' : 'Пока нет проектов. Создайте первый из шаблона выше.') + '</p>';
  }
  /* Перенос проектов из браузера в аккаунт: копия на сервер, из браузера — удаляется после успешной загрузки. */
  async function migrate(items) {
    let n = 0;
    await UI.busy('Переносим проекты в аккаунт…', async () => {
      for (const p of items) {
        const doc = await XS.Store.local.get(p.id);
        if (!doc) continue;
        $('busyText').textContent = 'Переносим «' + doc.title + '» (' + (n + 1) + ' из ' + items.length + ')…';
        await XS.Store.remote.create(doc, p.thumb);
        await XS.Store.local.remove(p.id);
        n++;
      }
    });
    UI.toast('Перенесено в аккаунт: ' + n + '.');
    scope = 'mine';
    await render();
  }
  async function openId(id, from) {
    let doc = null;
    if (from === 'mine' || from === 'shared') doc = await UI.busy('Загружаем проект…', () => XS.Store.remote.get(id));
    else doc = await XS.Store.get(id).catch(e => { UI.toast(e.message, true); return null; });
    if (!doc) { UI.toast('Проект не найден.', true); return UI.goHome(); }
    await UI.open(doc);
  }

  function init() {
    $('projectSearch').oninput = renderProjects;
    $('migrateAll').onclick = UI.safe(async () => { if (confirm('Перенести все проекты из этого браузера (' + projects.length + ') в аккаунт? После загрузки они удалятся из браузера.')) await migrate(projects); });
    $('openProjectFile').onchange = UI.safe(async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const doc = await UI.busy('Открываем ' + f.name + '…', async () => XS.Import.projectFromJson(await f.text()));
      await UI.create(doc);
      UI.toast(XS.Store.where(doc.id) === 'remote' ? 'Проект открыт и сохранён в аккаунте.' : 'Проект открыт и сохранён в браузере.');
    });
  }

  UI.Home = {init, render, openId};
})(typeof window !== 'undefined' ? window : globalThis);
