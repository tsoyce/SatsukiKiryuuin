/* XSatsu Студия · инструменты списка (v4): найти и заменить, сортировка, повторы, фото по именам файлов,
 * импорт из Google Таблицы по ссылке. Логика — в core/data-tools.js, здесь — одно окно с вкладками. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  const T = () => XS.DataTools;
  const TABS = [['replace', 'replace', 'Найти и заменить'], ['sort', 'sort', 'Порядок и повторы'], ['photos', 'camera', 'Фото'], ['sheet', 'table', 'Google Таблица']];
  let tab = 'replace';

  const textCols = () => S.doc.data.columns.filter(c => c.type !== 'image');
  const colOptions = (cols, sel) => cols.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${XS.esc(c.name)}</option>`).join('');

  function open(which) {
    if (!S.doc) return;
    if (which) tab = which;
    render();
    if (!$('toolsDialog').open) $('toolsDialog').showModal();
  }
  function render() {
    $('toolsTabs').replaceChildren(...TABS.map(([id, icon, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (id === tab ? ' active' : '');
      b.innerHTML = XS.Icons.icon(icon, 15) + label; b.onclick = () => { tab = id; render(); };
      return b;
    }));
    const body = $('toolsBody');
    ({replace: renderReplace, sort: renderSort, photos: renderPhotos, sheet: renderSheet})[tab](body);
  }

  /* ---------- найти и заменить ---------- */
  function renderReplace(body) {
    body.innerHTML = `<p class="note">Заменяет текст в таблице записей и/или в текстах макета (включая поля в фигурных скобках, QR и штрихкоды). Отменяется Ctrl+Z.</p>
      <label class="f wide"><span>Найти</span><input type="text" id="trFind" placeholder="например, ТюмГУ"></label>
      <label class="f wide"><span>Заменить на</span><input type="text" id="trRepl" placeholder="Тюменский государственный университет"></label>
      <div class="row-form-inline">
        <select id="trWhere"><option value="all">в таблице и макете</option><option value="data">только в таблице</option><option value="layout">только в макете</option></select>
        <label class="check"><input type="checkbox" id="trCase"> с учётом регистра</label>
        <label class="check"><input type="checkbox" id="trWord"> слово целиком</label>
      </div>
      <p id="trInfo" class="muted small"></p>
      <div class="insp-actions"><button class="btn primary" id="trGo" type="button">${XS.Icons.icon('replace', 15)}Заменить все</button></div>`;
    const opts = () => ({where: $('trWhere').value, matchCase: $('trCase').checked, wholeWord: $('trWord').checked});
    const info = () => { const f = $('trFind').value; $('trInfo').textContent = f ? 'Найдено: ' + T().count(S.doc, f, opts()) : ''; };
    for (const id of ['trFind', 'trWhere', 'trCase', 'trWord']) $(id).oninput = info;
    $('trGo').onclick = UI.safe(() => {
      let n = 0;
      UI.edit(d => { n = T().replace(d, $('trFind').value, $('trRepl').value, opts()); });
      UI.toast(n ? 'Заменено: ' + n + '.' : 'Ничего не найдено.');
      info();
    });
    setTimeout(() => $('trFind')?.focus(), 30);
  }

  /* ---------- сортировка и повторы ---------- */
  function renderSort(body) {
    const cols = textCols();
    const dups = T().duplicates(S.doc);
    body.innerHTML = `<h3 class="sub-h">Сортировка</h3>
      <div class="row-form-inline"><select id="tsCol">${colOptions(cols, cols[0]?.id)}</select>
        <select id="tsDir"><option value="asc">по возрастанию (А→Я, 1→9)</option><option value="desc">по убыванию</option></select>
        <button class="btn" id="tsGo" type="button">${XS.Icons.icon('sort', 15)}Отсортировать</button></div>
      <p class="note">Числа и римские места («I место», «II место») сортируются по смыслу, пустые — в конце. Номер {№} пересчитается по новому порядку.</p>
      <h3 class="sub-h">Повторы</h3>
      <p>${dups.length ? 'Найдено повторов: <b>' + dups.length + '</b> (одинаковые значения во всех текстовых столбцах).' : 'Полных повторов нет.'}</p>
      <div class="row-form-inline"><span class="muted small">Сравнивать только по:</span><select id="tdCol"><option value="">всем столбцам</option>${colOptions(cols, '')}</select>
        <button class="btn" id="tdGo" type="button">${XS.Icons.icon('trash', 15)}Удалить повторы</button></div>
      ${dups.length ? '<ol class="check-list">' + dups.slice(0, 50).map(d => `<li>Запись ${d.index + 1} повторяет запись ${d.of + 1}</li>`).join('') + '</ol>' : ''}`;
    $('tsGo').onclick = UI.safe(() => { UI.edit(d => { T().sortRows(d, $('tsCol').value, $('tsDir').value); S.row = d.data.current; }); UI.toast('Записи отсортированы.'); });
    $('tdGo').onclick = UI.safe(() => {
      const col = $('tdCol').value, list = T().duplicates(S.doc, col ? [col] : null);
      if (!list.length) return UI.toast('Повторов нет.');
      if (!confirm('Удалить повторяющиеся записи: ' + list.length + '? Первая из каждой пары останется.')) return;
      let n = 0; UI.edit(d => { n = T().dedupe(d, col ? [col] : null); S.row = Math.min(S.row, Math.max(0, d.data.rows.length - 1)); });
      UI.toast('Удалено повторов: ' + n + '.'); render();
    });
  }

  /* ---------- фото по именам файлов: всё делает окно «Фото для записей» (ui/photos.js) ---------- */
  function renderPhotos(body) {
    body.innerHTML = `<p class="note">Фото для всех записей сразу: выберите много файлов или ZIP-архив — «Иванов Иван.jpg», «Долгих Е.С.png», «ivanov_ivan.jpg», «003.jpg» (номер записи) или имя файла, записанное в таблице. Перед применением видно, какое фото к какой записи, — можно поправить.</p>
      <button class="btn primary" id="tpOpen" type="button" style="margin-top:10px">${XS.Icons.icon('camera', 15)}Фото для записей…</button>`;
    $('tpOpen').onclick = UI.safe(() => { $('toolsDialog').close(); return UI.Photos.open(); });
  }

  /* ---------- Google Таблица по ссылке ---------- */
  function renderSheet(body) {
    const last = S.doc.output.sheetUrl || '';
    body.innerHTML = `<p class="note">Вставьте ссылку на Google Таблицу. Доступ — «Все, у кого есть ссылка, могут просматривать» (или «Файл → Поделиться → Опубликовать в интернете»). Первая строка — названия столбцов. Ссылка запоминается в проекте: обновить список можно одной кнопкой.</p>
      <label class="f wide"><span>Ссылка</span><input type="text" id="tgUrl" value="${XS.esc(last)}" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"></label>
      <label class="check"><input type="checkbox" id="tgReplace" checked> заменить текущие записи</label>
      <div class="insp-actions"><button class="btn primary" id="tgGo" type="button">${XS.Icons.icon('download', 15)}Загрузить</button></div>
      <p id="tgInfo" class="muted small"></p>`;
    $('tgGo').onclick = UI.safe(async () => {
      const url = $('tgUrl').value.trim(), csv = T().sheetCsvUrl(url);
      if (!csv) throw new Error('Это не похоже на ссылку Google Таблиц (docs.google.com/spreadsheets/…).');
      const text = await UI.busy('Загружаем таблицу…', async () => {
        let r;
        try { r = await fetch(csv, {credentials: 'omit'}); } catch (e) { throw new Error('Не удалось открыть таблицу: проверьте интернет и что доступ открыт по ссылке.'); }
        if (!r.ok) throw new Error('Google ответил ' + r.status + ': откройте доступ «Все, у кого есть ссылка».');
        const t = await r.text();
        if (/^\s*<!doctype html|<html/i.test(t)) throw new Error('Таблица закрыта: откройте доступ «Все, у кого есть ссылка».');
        return t;
      });
      const table = XS.Import.parseTable(text);
      if (!table.rows.length) throw new Error('В таблице нет строк с данными.');
      const res = await UI.ImportDialog.open(table, {source: 'Google Таблица', replace: $('tgReplace').checked, onApply: d => { d.output.sheetUrl = url; }});
      if (res && $('tgInfo')) $('tgInfo').textContent = 'Загружено строк: ' + table.rows.length + ' · столбцы: ' + table.headers.join(', ');
    });
  }

  function init() {
    $('toolsClose').onclick = () => $('toolsDialog').close();
    $('toolsBtn').onclick = () => open();
  }
  UI.Tools = {init, open};
})(typeof window !== 'undefined' ? window : globalThis);
