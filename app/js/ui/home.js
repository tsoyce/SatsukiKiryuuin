/* XSatsu Студия · главная: создать проект из шаблона или PDF, открыть файл, список проектов. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, $ = UI.$;
  let projects = [];

  function presetCard({kind, title, hint, special}, onclick) {
    const b = document.createElement('button');
    b.className = 'preset' + (special ? ' special' : ''); b.type = 'button';
    b.innerHTML = `<span class="kind">${XS.esc(XS.Model.KINDS[kind]?.label || kind)}</span><b>${XS.esc(title)}</b><span class="muted small">${XS.esc(hint)}</span>`;
    b.onclick = UI.safe(onclick);
    return b;
  }
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

  async function render() {
    renderPresets();
    projects = await XS.Store.list().catch(e => { UI.toast(e.message, true); return []; });
    renderProjects();
  }
  function renderProjects() {
    const q = XS.key($('projectSearch').value), grid = $('projectGrid');
    const list = projects.filter(p => !q || XS.key(p.title).includes(q));
    $('projectCount').textContent = projects.length ? '· ' + projects.length : '';
    grid.replaceChildren(...list.map(p => {
      const card = document.createElement('div');
      card.className = 'project';
      const date = new Date(p.updatedAt);
      card.innerHTML = `<div class="thumb" data-open>${p.thumb ? `<img src="${p.thumb}" alt="">` : '<span class="muted">нет превью</span>'}</div>
        <div class="info"><b data-open title="${XS.esc(p.title)}">${XS.esc(p.title)}</b>
        <span class="muted small">${XS.esc(XS.Model.KINDS[p.kind]?.label || '')} · записей: ${p.rows} · ${Math.round(p.page?.width || 0)}×${Math.round(p.page?.height || 0)} мм</span>
        <span class="muted small">изменён ${isNaN(date) ? '' : date.toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'})}</span></div>
        <div class="acts"><button class="btn small" data-act="open">Открыть</button><button class="btn small" data-act="copy" title="Копия">${XS.Icons.icon('copy', 15)}</button><button class="btn small" data-act="file" title="Скачать файл проекта">${XS.Icons.icon('download', 15)}</button><span class="spacer"></span><button class="btn small danger" data-act="del" title="Удалить">${XS.Icons.icon('trash', 15)}</button></div>`;
      card.addEventListener('click', UI.safe(async e => {
        const act = e.target.closest('[data-act]')?.dataset.act || (e.target.closest('[data-open]') ? 'open' : '');
        if (!act) return;
        if (act === 'open') return openId(p.id);
        const doc = await XS.Store.get(p.id);
        if (!doc) throw new Error('Проект не найден.');
        if (act === 'copy') { doc.id = XS.uid('doc'); doc.title += ' (копия)'; await XS.Store.save(doc, p.thumb); await render(); }
        if (act === 'file') XS.download(XS.Store.toFile(doc), XS.Zip.sanitizeFilename(doc.title) + '.xsatsu.json');
        if (act === 'del' && confirm('Удалить проект «' + p.title + '»? Это нельзя отменить. Можно сначала скачать файл проекта.')) { await XS.Store.remove(p.id); await render(); }
      }));
      return card;
    }));
    if (!list.length) grid.innerHTML = '<p class="muted">' + (projects.length ? 'Ничего не найдено.' : 'Пока нет проектов. Создайте первый из шаблона выше.') + '</p>';
  }
  async function openId(id) {
    const doc = await XS.Store.get(id);
    if (!doc) { UI.toast('Проект не найден в этом браузере.', true); return UI.goHome(); }
    await UI.open(doc);
  }

  function init() {
    $('projectSearch').oninput = renderProjects;
    $('openProjectFile').onchange = UI.safe(async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const doc = await UI.busy('Открываем ' + f.name + '…', async () => XS.Import.projectFromJson(await f.text()));
      await UI.create(doc);
      UI.toast('Проект открыт и сохранён в браузере.');
    });
  }

  UI.Home = {init, render, openId};
})(typeof window !== 'undefined' ? window : globalThis);
