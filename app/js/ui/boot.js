/* XSatsu Студия · запуск: связывает панели, верхнюю строку и адрес страницы (#/doc/<id>). */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;

  function initTopbar() {
    $('backHome').onclick = UI.safe(UI.goHome);
    $('docTitle').oninput = () => UI.edit(d => { d.title = $('docTitle').value; document.title = d.title + ' — XSatsu Студия'; }, 'title', {skip: ['stage', 'layers', 'data', 'inspector']});
    const kind = $('docKind');
    for (const [k, v] of Object.entries(XS.Model.KINDS)) kind.add(new Option(v.label, k));
    kind.onchange = () => UI.edit(d => {
      // Тип влияет только на имя файлов по умолчанию (если пользователь его не менял).
      const oldDefault = XS.Model.KINDS[d.kind]?.naming;
      d.kind = kind.value;
      if (d.output.naming === oldDefault) d.output.naming = XS.Model.KINDS[d.kind].naming;
    }, '', {skip: ['stage', 'layers', 'data']});
    $('undoBtn').onclick = UI.undo; $('redoBtn').onclick = UI.redo;
    const menu = $('projectMenu');
    $('projectMenuBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', UI.safe(async e => {
      const act = e.target.dataset.act; if (!act) return;
      menu.hidden = true;
      if (act === 'saveFile') UI.saveFile();
      if (act === 'duplicate') { const copy = XS.clone(S.doc); copy.id = XS.uid('doc'); copy.title += ' (копия)'; await UI.flush(); await UI.create(copy); UI.toast('Открыта копия проекта.'); }
      if (act === 'exportCsv') XS.download(new Blob([XS.Import.toCsv(S.doc)], {type: 'text/csv;charset=utf-8'}), XS.Zip.sanitizeFilename(S.doc.title) + '.csv');
      if (act === 'check') await runCheck();
    }));
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
        $('tabLayers').hidden = t.dataset.tab !== 'layers'; $('tabData').hidden = t.dataset.tab !== 'data';
      };
    });
    $('checkClose').onclick = () => $('checkDialog').close();
  }

  async function runCheck() {
    const problems = await UI.busy('Проверяем все записи…', () => XS.Export.check(S.doc));
    const body = $('checkBody');
    if (!problems.length) body.innerHTML = '<p class="ok-line">' + XS.Icons.icon('check', 18) + ' Всё в порядке: тексты помещаются, поля найдены, символы есть в шрифтах.</p>';
    else {
      body.innerHTML = `<p>Найдено замечаний: ${problems.length}. Нажмите, чтобы открыть запись.</p><ol class="check-list">${problems.slice(0, 300).map(p => `<li><a data-r="${p.record - 1}">Запись ${p.record}</a>${S.doc.sides.length > 1 ? ' · ' + XS.esc(p.side) : ''} · ${XS.esc(p.name)}: ${XS.esc(p.msg)}</li>`).join('')}</ol>`;
      body.querySelectorAll('a[data-r]').forEach(a => { a.onclick = () => { $('checkDialog').close(); UI.setRow(+a.dataset.r); }; });
    }
    $('checkDialog').showModal();
  }

  async function route() {
    const m = /^#\/doc\/(.+)$/.exec(location.hash);
    if (m && (!S.doc || S.doc.id !== m[1])) await UI.Home.openId(decodeURIComponent(m[1]));
    else if (!m && S.doc) await UI.goHome();
    else if (!m) { $('editor').hidden = true; $('home').hidden = false; await UI.Home.render(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!global.PDFLib || !global.fontkit) { document.body.innerHTML = '<p style="padding:24px;font:16px sans-serif">Не загрузились библиотеки из папки vendor/. Проверьте, что скопирована вся папка приложения.</p>'; return; }
    XS.Icons.hydrate();
    initTopbar();
    UI.Stage.init(); UI.Layers.init(); UI.Data.init(); UI.ExportDialog.init(); UI.Home.init(); UI.Keys.init();
    global.addEventListener('hashchange', UI.safe(route));
    UI.safe(route)();
  });
})(typeof window !== 'undefined' ? window : globalThis);
