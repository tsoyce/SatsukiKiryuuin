/* XSatsu Студия · админка: «Шаблоны и шрифты» — библиотека сайта.
 * Шаблон сайта — снимок проекта (без строк таблицы, если не попросить), виден всем на главной в «Создать».
 * Шрифт сайта — файл TTF/OTF/WOFF, который любой может добавить в проект из окна «Шрифты» (вкладка «Шрифты сайта»).
 * Сервер — SiteLibrary.php. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, Api = XS.Api;
  const A = UI.Admin, H = A.H, esc = H.esc, I = H.I;
  const VAR = {regular: 'обычный', bold: 'жирный', italic: 'курсив', bolditalic: 'жирный курсив'};

  async function library(ctx) {
    const [{templates}, {fonts}] = await Promise.all([H.api('GET', 'v1/admin/templates'), H.api('GET', 'v1/fonts/site')]);
    if (!ctx.alive()) return;
    ctx.actions.innerHTML = `<button class="btn" data-font>${I('font', 15)}Добавить шрифт</button><button class="btn primary" data-tpl>${I('plus', 15)}Шаблон из проекта</button>`;
    ctx.actions.querySelector('[data-tpl]').onclick = UI.safe(() => publishDialog(ctx));
    ctx.actions.querySelector('[data-font]').onclick = () => chooseFonts(ctx);
    ctx.body.innerHTML = `<section class="adm-card"><h3>${I('file', 16)}Шаблоны сайта <span class="muted small" style="font-weight:400">видны всем на главной в «Создать»</span></h3>
        ${templates.length ? `<div class="adm-tpls">${templates.map((t, i) => `<article class="adm-tpl ${t.published ? '' : 'is-off'}" data-id="${t.id}">
          <div class="adm-tpl-thumb">${t.thumb ? `<img alt="" src="${esc(t.thumb)}">` : I('file', 28)}</div>
          <div class="adm-tpl-info"><b>${esc(t.title)}</b>${t.published ? '' : ' ' + H.chip('скрыт', 'off')}
            <small class="muted">${esc(t.description || 'без описания')}</small>
            <small class="muted">${Math.round(t.page.width)}×${Math.round(t.page.height)} мм · создано по нему: ${t.uses} · обновлён ${esc(H.ago(t.updatedAt))}${t.sourceTitle ? ' · из «' + esc(t.sourceTitle) + '»' : ''}</small></div>
          <div class="adm-tpl-acts">
            <button class="btn small icon ghost" data-up title="Выше" ${i ? '' : 'disabled'}>${I('up', 15)}</button><button class="btn small icon ghost" data-down title="Ниже" ${i < templates.length - 1 ? '' : 'disabled'}>${I('down', 15)}</button>
            <button class="btn small ghost" data-edit>Изменить</button>
            ${t.sourceProject ? `<button class="btn small ghost" data-refresh title="Взять свежую версию из проекта-источника">Обновить</button>` : ''}
            <button class="btn small ghost" data-pub>${t.published ? 'Скрыть' : 'Показать'}</button>
            <button class="btn small ghost danger" data-del>${I('trash', 14)}</button></div></article>`).join('')}</div>`
          : H.empty('Шаблонов сайта пока нет. Сделайте красивый проект (бланк диплома кафедры, приглашение) и опубликуйте его — он появится у всех на главной.')}
      </section>
      <section class="adm-card"><h3>${I('font', 16)}Шрифты сайта <span class="muted small" style="font-weight:400">окно «Шрифты» → «Шрифты сайта»</span></h3>
        ${fonts.length ? `<ul class="adm-list">${fonts.map(f => `<li><div><b class="adm-font-name" data-family="${esc(f.family)}">${esc(f.family)}</b>
          <small class="muted">${f.variants.map(v => `<span class="adm-variant">${esc(VAR[v.variant])} · ${H.bytes(v.bytes)} <button class="link danger" data-del-font="${v.id}" title="Удалить начертание">×</button></span>`).join(' ')}</small></div></li>`).join('')}</ul>`
          : H.empty('Шрифтов сайта нет. Добавьте фирменный шрифт организации (TTF, OTF, WOFF) — он станет доступен в любом проекте.')}
        <p class="muted small">Проверьте, что лицензия шрифта разрешает встраивание в PDF. Обычный, жирный и курсив одного семейства объединяются сами.</p>
      </section>`;
    // превью шрифтов их собственным начертанием
    for (const el of ctx.body.querySelectorAll('.adm-font-name')) {
      const f = fonts.find(x => x.family === el.dataset.family), v = f.variants.find(x => x.variant === 'regular') || f.variants[0];
      H.api('GET', 'v1/assets/' + v.sha256).then(r => { const face = new FontFace('adm-' + v.id, r.bytes.slice().buffer); return face.load().then(ff => { document.fonts.add(ff); el.style.fontFamily = '"adm-' + v.id + '"'; el.style.fontSize = '18px'; }); }).catch(() => {});
    }
    const ids = templates.map(t => t.id);
    ctx.body.querySelectorAll('.adm-tpl').forEach(card => {
      const t = templates.find(x => String(x.id) === card.dataset.id);
      const move = async d => { const i = ids.indexOf(t.id); const j = i + d; [ids[i], ids[j]] = [ids[j], ids[i]]; await H.api('POST', 'v1/admin/templates/order', {ids}); UI.siteTemplatesReset?.(); ctx.reload(); };
      card.querySelector('[data-up]').onclick = UI.safe(() => move(-1));
      card.querySelector('[data-down]').onclick = UI.safe(() => move(1));
      card.querySelector('[data-pub]').onclick = UI.safe(async () => { await H.api('PATCH', 'v1/admin/templates/' + t.id, {published: !t.published}); UI.siteTemplatesReset?.(); UI.toast(t.published ? 'Шаблон скрыт с главной.' : 'Шаблон снова на главной.'); ctx.reload(); });
      card.querySelector('[data-refresh]')?.addEventListener('click', UI.safe(async () => {
        if (!await H.confirm(`Заменить шаблон «${esc(t.title)}» текущей версией проекта «${esc(t.sourceTitle || '')}»? Строки таблицы не переносятся.`, {ok: 'Обновить'})) return;
        await H.api('PATCH', 'v1/admin/templates/' + t.id, {refresh: true}); UI.siteTemplatesReset?.(); UI.toast('Шаблон обновлён.', false, {seal: true}); ctx.reload();
      }));
      card.querySelector('[data-del]').onclick = UI.safe(async () => {
        if (!await H.confirm(`Удалить шаблон «${esc(t.title)}»? Проекты, уже созданные по нему, останутся.`, {ok: 'Удалить', danger: true})) return;
        await H.api('DELETE', 'v1/admin/templates/' + t.id); UI.siteTemplatesReset?.(); UI.toast('Шаблон удалён.'); ctx.reload();
      });
      card.querySelector('[data-edit]').onclick = () => {
        const m = H.modal('Шаблон сайта', `<form class="adm-form">${H.field('Название', 'title', 'text', t.title, 'required maxlength="200"')}
          <label class="adm-f"><span>Описание на карточке</span><textarea name="description" rows="2" maxlength="500">${esc(t.description)}</textarea></label>
          <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
        m.body.querySelector('form').onsubmit = UI.safe(async e => { e.preventDefault(); await H.api('PATCH', 'v1/admin/templates/' + t.id, H.form(e.target)); m.close(); UI.siteTemplatesReset?.(); ctx.reload(); });
      };
    });
    ctx.body.querySelectorAll('[data-del-font]').forEach(b => { b.onclick = UI.safe(async () => {
      if (!await H.confirm('Удалить это начертание из шрифтов сайта? В проектах, куда шрифт уже добавлен, он останется.', {ok: 'Удалить', danger: true})) return;
      await H.api('DELETE', 'v1/admin/fonts/' + b.dataset.delFont); ctx.reload();
    }); });
  }

  async function publishDialog(ctx) {
    const {projects} = await H.api('GET', 'v1/admin/projects&limit=500&sort=updated');
    if (!projects.length) { UI.toast('Сначала сделайте проект — шаблон публикуется из проекта.', true); return; }
    const m = H.modal('Шаблон из проекта', `<form class="adm-form">
      <label class="adm-f"><span>Проект</span><select name="projectId" required>${projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)} — ${esc(p.owner.login)}, ${esc(H.ago(p.updatedAt))}</option>`).join('')}</select></label>
      ${H.field('Название на главной', 'title', 'text', projects[0].title, 'maxlength="200" required')}
      <label class="adm-f"><span>Описание на карточке</span><textarea name="description" rows="2" maxlength="500" placeholder="Например: официальный бланк диплома кафедры, А4"></textarea></label>
      <label class="check"><input type="checkbox" name="keepRows"> Оставить строки таблицы как образец (обычно не нужно: в шаблон попадают только столбцы)</label>
      <label class="check"><input type="checkbox" name="draft"> Пока не показывать на главной</label>
      <p class="note">В шаблон копируется текущая версия проекта. Дальнейшие правки проекта шаблон не меняют — для этого есть кнопка «Обновить».</p>
      <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Опубликовать</button></div></form>`);
    const form = m.body.querySelector('form');
    form.projectId.onchange = () => { form.title.value = projects.find(p => p.id === form.projectId.value)?.title || ''; };
    form.onsubmit = UI.safe(async e => {
      e.preventDefault();
      await H.api('POST', 'v1/admin/templates', H.form(form));
      m.close(); UI.siteTemplatesReset?.(); UI.toast('Шаблон опубликован.', false, {seal: true}); ctx.reload();
    });
  }

  function chooseFonts(ctx) {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    i.onchange = UI.safe(async () => {
      const files = [...i.files]; if (!files.length) return;
      const added = [];
      await UI.busy('Загружаем шрифты…', async () => {
        for (const file of files) {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const info = XS.Fonts.inspect(bytes);
            if (!info.cyrillic) UI.toast('В «' + info.family + '» нет кириллицы — русский текст будет пропадать.', true);
            if (info.restricted) UI.toast('Автор «' + info.family + '» запретил встраивание в документы — проверьте лицензию.', true);
            const sha = await Api.sha256(bytes);
            const {missing} = await H.api('POST', 'v1/assets/missing', {hashes: [sha]});
            if (missing.length) await H.api('PUT', 'v1/assets/' + sha, undefined, {raw: bytes});
            await H.api('POST', 'v1/admin/fonts', {sha256: sha, family: info.family, variant: info.variant, name: file.name});
            added.push(info.family + ' (' + VAR[info.variant] + ')');
          } catch (e) { UI.toast(file.name + ': ' + e.message, true); }
        }
      });
      if (added.length) UI.toast('Добавлено: ' + added.join(', ') + '.', false, {seal: true});
      ctx.reload();
    });
    i.click();
  }

  A.section({id: 'library', title: 'Шаблоны и шрифты', icon: 'font', order: 60, sub: 'Библиотека сайта: шаблоны на главной и шрифты для всех проектов', render: library});
})(typeof window !== 'undefined' ? window : globalThis);
