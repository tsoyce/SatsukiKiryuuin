/* XSatsu Студия · окно выгрузки: что, в каком виде, как назвать файлы. Настройки сохраняются в проекте. */
(function (global) {
  'use strict';
  const XS = global.XS, UI = XS.UI, S = UI.S, $ = UI.$;
  let o, cancel = false, running = false;

  const radio = (name, value, label, hint = '', extra = '') => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${o[name] === value ? 'checked' : ''} ${extra}><span>${label}${hint ? '<small>' + hint + '</small>' : ''}</span></label>`;

  function body() {
    const doc = S.doc, n = doc.data.rows.length, sel = S.selectedRows.size, twoSided = doc.sides.length > 1;
    const tokens = ['№', ...doc.data.columns.filter(c => c.type !== 'image').map(c => c.name), 'Проект', 'Дата'];
    let plan = '';
    try { const p = XS.Impose.plan({w: doc.page.width, h: doc.page.height}, o); plan = 'Раскладка: ' + p.label + (p.rotated ? ', макеты повёрнуты' : '') + '.'; } catch (e) { plan = '⚠ ' + e.message; }
    const issues = UI.Prefs.get('autoCheck') && XS.Check ? XS.Check.data(doc).length : 0;
    return `${issues ? `<p class="note warn-note">${XS.Icons.icon('warn', 15)} В списке замечаний: ${issues} (повторы, пустые поля, опечатки). <button type="button" class="link" data-run-check>Посмотреть</button></p>` : ''}<div class="ex-grid">
      <div class="ex-block"><b>Что выгрузить</b><div class="choices">
        ${radio('scope', 'all', 'Все записи' + (n ? ' (' + n + ')' : ''))}
        ${radio('scope', 'current', 'Только текущую', n ? '№ ' + (S.row + 1) : '')}
        ${radio('scope', 'selected', 'Отмеченные галочками' + (sel ? ' (' + sel + ')' : ''), sel ? '' : 'отметьте записи во вкладке «Данные»', sel ? '' : 'disabled')}
        ${radio('scope', 'range', 'Диапазон номеров', '')}
        <input type="text" name="range" value="${XS.esc(o.range)}" placeholder="например: 1-10, 15, 20-25" ${o.scope === 'range' ? '' : 'hidden'}>
      </div>
      ${twoSided ? `<b>Стороны</b><div class="choices">${radio('sides', 'all', 'Обе стороны')}${radio('sides', 'front', 'Только лицевая')}${radio('sides', 'back', 'Только оборот')}</div>` : ''}
      </div>

      <div class="ex-block"><b>Как упаковать</b><div class="choices">
        ${radio('packaging', 'zip', 'Отдельный файл на каждую запись → ZIP', 'Например, чтобы разослать дипломы по почте')}
        ${radio('packaging', 'single', 'Один PDF — все записи подряд', 'Страница на каждую запись' + (twoSided ? ' и сторону' : ''))}
        ${radio('packaging', 'sheets', 'Листы для печати (PDF)', 'Несколько макетов на листе, метки реза, двусторонняя печать')}
      </div>
      ${o.packaging === 'zip' ? `<div class="f"><span>Формат файла</span><div class="row"><select name="format"><option value="pdf">PDF — вектор, для печати</option><option value="png">PNG — картинка</option><option value="jpeg">JPEG — картинка, легче</option></select>${o.format !== 'pdf' ? '<select name="dpi"><option value="150">150 dpi</option><option value="200">200 dpi</option><option value="300">300 dpi</option><option value="600">600 dpi</option></select>' : ''}</div></div>` : ''}
      </div>

      ${o.packaging === 'sheets' ? `<div class="ex-block full"><b>Печатный лист</b>
        <div class="ex-grid">
          <div class="ex-block">
            <div class="f"><span>Бумага</span><select name="paper"><option value="a4">А4</option><option value="a3">А3</option><option value="sra3">SRA3 (320×450)</option><option value="card">По размеру макета (1 на лист)</option></select></div>
            <div class="f"><span>Ориентация</span><select name="paperOrientation"><option value="auto">Как больше влезет</option><option value="portrait">Книжная</option><option value="landscape">Альбомная</option></select></div>
            <div class="f"><span>Поля / зазор</span><div class="row"><input type="number" name="margin" min="0" max="50" step="1" value="${o.margin}"> <input type="number" name="gap" min="0" max="50" step="1" value="${o.gap}"> <span class="muted small">мм</span></div></div>
            <p class="note">${XS.esc(plan)}</p>
          </div>
          <div class="ex-block">
            <label class="check"><input type="checkbox" name="cutMarks" ${o.cutMarks ? 'checked' : ''}> Метки реза</label>
            <label class="check"><input type="checkbox" name="useCopies" ${o.useCopies ? 'checked' : ''}> Учитывать «Экземпляров» у записей</label>
            ${twoSided ? `<div class="f"><span>Оборот</span><select name="duplex"><option value="long">переворот по длинному краю</option><option value="short">по короткому краю</option><option value="none">без зеркалирования</option></select></div>` : ''}
            <div class="f"><span>Сдвиг лица</span><div class="row"><input type="number" name="offsetX" step="0.1" value="${o.offsetX}" title="X, мм"> <input type="number" name="offsetY" step="0.1" value="${o.offsetY}" title="Y, мм"></div></div>
            ${twoSided ? `<div class="f"><span>Сдвиг оборота</span><div class="row"><input type="number" name="backOffsetX" step="0.1" value="${o.backOffsetX}"> <input type="number" name="backOffsetY" step="0.1" value="${o.backOffsetY}"></div></div>` : ''}
          </div>
        </div></div>` : ''}

      <div class="ex-block"><b>Слой печати</b><div class="choices">
        ${radio('layer', 'all', 'Всё вместе')}
        ${radio('layer', 'color', 'Только цвет и фон', 'Первый проход — струйный принтер')}
        ${radio('layer', 'text', 'Только текст и линии', 'Второй проход — лазерный принтер')}
      </div>${o.layer === 'text' ? `<label class="check"><input type="checkbox" name="laserBlack" ${o.laserBlack ? 'checked' : ''}> Печатать текст чёрным</label>` : ''}</div>

      <div class="ex-block"><b>Имена файлов</b>
        <div class="f wide"><span>Шаблон имени ${o.packaging === 'zip' ? 'каждого файла' : ''}</span><input type="text" name="naming" value="${XS.esc(o.naming)}" ${o.packaging === 'zip' ? '' : 'disabled'}></div>
        <div class="chips">${tokens.map(t => `<button type="button" class="chip" data-token="${XS.esc(t)}">{${XS.esc(t)}}</button>`).join('')}</div>
        <div class="f wide"><span>Имя ${o.packaging === 'zip' ? 'архива' : 'файла'}</span><input type="text" name="archive" value="${XS.esc(o.archive)}"></div>
        <div class="names" id="namePreview"></div>
      </div>
    </div>`;
  }

  function preview() {
    const box = $('namePreview'); if (!box) return;
    try {
      const recs = XS.Scene.records(S.doc, {...o, current: S.row, selected: S.selectedRows, useCopies: o.packaging === 'sheets' && o.useCopies});
      const lines = [];
      const archive = XS.Export.archiveName(S.doc, o);
      if (o.packaging === 'zip') {
        const names = XS.Export.previewNames(S.doc, {...o, current: S.row, selected: S.selectedRows});
        lines.push((recs.length > 1 ? archive + '.zip' : '') + (recs.length > 1 ? '\n' : '') + names.map(x => (recs.length > 1 ? '  ' : '') + x).join('\n') + (recs.length > names.length ? '\n  … ещё ' + (recs.length - names.length) : ''));
      } else lines.push(archive + (o.packaging === 'sheets' ? ' — печать.pdf' : '.pdf') + '\n  ' + (o.packaging === 'sheets' ? 'макетов: ' + recs.length : 'страниц: ' + recs.length * (o.sides === 'all' ? S.doc.sides.length : 1)));
      box.textContent = lines.join('\n');
    } catch (e) { box.textContent = '⚠ ' + e.message; }
  }

  function draw() {
    const b = $('exportBody');
    b.innerHTML = body();
    for (const s of b.querySelectorAll('select[name]')) s.value = String(o[s.name]);
    preview();
  }
  function onChange(e) {
    const t = e.target; if (!t.name) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') v = XS.num(t.value, 0, -100, 100);
    if (t.name === 'dpi') v = Number(v);
    o[t.name] = v;
    if (t.type === 'radio' || t.tagName === 'SELECT' || t.type === 'checkbox') { if (t.name === 'format' && v !== 'pdf' && !o.dpi) o.dpi = 300; draw(); }
    else { preview(); if (['margin', 'gap'].includes(t.name)) { const note = $('exportBody').querySelector('.note'); try { const p = XS.Impose.plan({w: S.doc.page.width, h: S.doc.page.height}, o); if (note) note.textContent = 'Раскладка: ' + p.label + '.'; } catch (err) { if (note) note.textContent = '⚠ ' + err.message; } } }
    persist();
  }
  function persist() { const {scope, range, ...keep} = o; S.doc.output = {...S.doc.output, ...keep, scope, range}; UI.changed({skip: ['stage', 'layers', 'data', 'inspector']}); }

  function progress(done, total, label) {
    const p = $('exportProgress'); p.hidden = false;
    p.querySelector('.bar').style.setProperty('--p', Math.round(done / Math.max(1, total) * 100) + '%');
    p.querySelector('.label').textContent = label || '';
  }

  async function go({print = false, win = null} = {}) {
    if (running) return;
    running = true; cancel = false;
    $('exportGo').disabled = true; $('exportCancel').hidden = false;
    try {
      const opts = {...o, current: S.row, selected: S.selectedRows};
      const result = await XS.Export.run(S.doc, opts, {progress, cancelled: () => cancel});
      if (print) openForPrint(result.blob, result.name, win); else XS.download(result.blob, result.name);
      const warn = result.warnings.length ? ' Предупреждений: ' + result.warnings.length + ' — см. «Проект → Проверить все записи».' : '';
      UI.toast((print ? 'Листы для печати открыты в новой вкладке.' : 'Готово: ' + result.name + (result.files > 1 ? ' (' + result.files + ' файлов)' : '')) + warn, !!warn);
      if (!print) $('exportDialog').close();
    } finally {
      running = false;
      $('exportGo').disabled = false; $('exportCancel').hidden = true; $('exportProgress').hidden = true;
    }
  }
  function openForPrint(blob, name, w) {
    const url = URL.createObjectURL(blob);
    if (w && !w.closed) w.location.href = url; else w = global.open(url, '_blank');
    if (!w) { XS.download(blob, name); UI.toast('Браузер заблокировал новую вкладку — PDF скачан. Откройте его и напечатайте.', true); }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  }

  function open() {
    o = {...XS.Model.defaultOutput(S.doc.kind), ...S.doc.output};
    if (o.scope === 'selected' && !S.selectedRows.size) o.scope = 'all';
    if (S.doc.sides.length < 2) o.sides = 'all';
    draw();
    $('exportProgress').hidden = true;
    $('exportDialog').showModal();
  }
  /* «Печать»: те же настройки листов, без окна. */
  async function quickPrint() {
    o = {...XS.Model.defaultOutput(S.doc.kind), ...S.doc.output, packaging: 'sheets'};
    if (o.scope === 'selected' && !S.selectedRows.size) o.scope = 'all';
    // Вкладку открываем сразу по клику, иначе браузер посчитает её всплывающим окном.
    const win = global.open('', '_blank');
    if (win) win.document.write('<p style="font:16px sans-serif;padding:24px">Готовим листы для печати…</p>');
    try { await UI.busy('Готовим листы для печати…', () => go({print: true, win})); }
    catch (e) { if (win) win.close(); throw e; }
  }

  function init() {
    const b = $('exportBody');
    b.addEventListener('change', onChange);
    b.addEventListener('input', e => { if (e.target.type === 'text' || e.target.type === 'number') onChange(e); });
    b.addEventListener('click', e => {
      if (e.target.closest('[data-run-check]')) { $('exportDialog').close(); UI.runCheck(); return; }
      const t = e.target.dataset.token; if (!t) return;
      const input = b.querySelector('input[name=naming]:not([disabled])') || b.querySelector('input[name=archive]');
      const s = input.selectionStart ?? input.value.length;
      input.setRangeText('{' + t + '}', s, input.selectionEnd ?? s, 'end'); input.focus();
      onChange({target: input});
    });
    $('exportGo').onclick = UI.safe(() => go());
    $('exportCancel').onclick = () => { cancel = true; };
    $('exportBtn').onclick = open;
    $('printBtn').onclick = UI.safe(quickPrint);
  }

  UI.ExportDialog = {init, open};
})(typeof window !== 'undefined' ? window : globalThis);
