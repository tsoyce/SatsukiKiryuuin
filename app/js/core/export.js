/* XSatsu Студия · выгрузка: файлы по записям (ZIP), один общий PDF, печатные листы.
 * Все режимы используют одну сцену (XS.Scene), поэтому результат одинаков для любого типа проекта. */
(function (global) {
  'use strict';
  const XS = global.XS;

  function newPdf(title) {
    const P = global.PDFLib;
    if (!P) throw new Error('Не загружена библиотека PDF (vendor/pdf-lib.min.js).');
    return P.PDFDocument.create().then(pdf => {
      pdf.registerFontkit(global.fontkit);
      pdf.setTitle(title || 'XSatsu');
      pdf.setProducer('XSatsu Студия'); pdf.setCreator('XSatsu Студия');
      return pdf;
    });
  }
  function sideIndexes(doc, which) {
    const all = doc.sides.map((_, i) => i);
    if (which === 'front') return [0];
    if (which === 'back') return all.slice(1).length ? all.slice(1) : [];
    return all;
  }
  async function addCardPage(pdf, cache, scene) {
    const page = pdf.addPage([scene.width * XS.PdfRender.K, scene.height * XS.PdfRender.K]);
    await XS.PdfRender.draw(page, scene, cache);
    return page;
  }
  const sceneOpts = o => ({layer: o.layer || 'all', laserBlack: o.laserBlack !== false});

  /* Предпросмотр имён файлов для диалога выгрузки. */
  function previewNames(doc, o, limit = 4) {
    const recs = XS.Scene.records(doc, o).slice(0, limit);
    const ext = o.packaging === 'zip' ? (o.format === 'pdf' ? '.pdf' : o.format === 'png' ? '.png' : '.jpg') : '.pdf';
    const used = new Set();
    return recs.map(r => XS.Zip.uniqueFilename(XS.Fields.fileName(o.naming, XS.Fields.context(doc, r.row, r.index)) + ext, used));
  }
  function archiveName(doc, o, suffix = '') {
    const ctx = XS.Fields.context(doc, null, 0);
    return XS.Zip.sanitizeFilename((XS.Fields.fileName(o.archive || '{Проект}', ctx) || doc.title) + suffix);
  }

  /* Главная функция. o = doc.output + {scope, range, current, selected}. Возвращает {blob, name, files, warnings}. */
  async function run(doc, o, {progress = () => {}, cancelled = () => false} = {}) {
    await XS.Fonts.ensureForDoc(doc);
    const sides = sideIndexes(doc, o.sides);
    if (!sides.length) throw new Error('В проекте нет оборотной стороны.');
    const recs = XS.Scene.records(doc, {...o, useCopies: o.packaging === 'sheets' && o.useCopies});
    if (!recs.length) throw new Error('Нет записей для выгрузки. Проверьте диапазон.');
    const warnings = [];
    const scene = (si, r) => { const s = XS.Scene.build(doc, si, r.row, r.index, sceneOpts(o)); for (const w of s.warnings) warnings.push({...w, record: r.index + 1}); return s; };
    const check = () => { if (cancelled()) throw new Error('Выгрузка отменена.'); };

    if (o.packaging === 'zip') {
      const files = [];
      for (let i = 0; i < recs.length; i++) {
        check();
        const r = recs[i], ctx = XS.Fields.context(doc, r.row, r.index);
        const base = XS.Fields.fileName(o.naming, ctx);
        progress(i, recs.length, base);
        if (o.format === 'pdf') {
          const pdf = await newPdf(base), cache = XS.PdfRender.createCache(pdf);
          for (const si of sides) await addCardPage(pdf, cache, scene(si, r));
          files.push({name: base + '.pdf', blob: new Blob([await pdf.save()], {type: 'application/pdf'})});
        } else {
          for (const si of sides) {
            const canvas = await XS.CanvasRender.toCanvas(scene(si, r), o.dpi || 300, {background: o.format === 'png' && o.transparent ? '' : '#ffffff'});
            const mime = o.format === 'png' ? 'image/png' : 'image/jpeg';
            const blob = await new Promise(res => canvas.toBlob(res, mime, o.jpegQuality || 0.92));
            const suffix = sides.length > 1 ? ' — ' + doc.sides[si].name.toLowerCase() : '';
            files.push({name: base + suffix + (o.format === 'png' ? '.png' : '.jpg'), blob});
            canvas.width = canvas.height = 1;
          }
        }
        await XS.pause();
      }
      if (files.length === 1 && !o.forceZip) return {blob: files[0].blob, name: XS.Zip.sanitizeFilename(files[0].name), files: 1, warnings};
      progress(recs.length, recs.length, 'Упаковываем ZIP…');
      return {blob: await XS.Zip.zip(files), name: archiveName(doc, o, '.zip'), files: files.length, warnings};
    }

    const pdf = await newPdf(doc.title), cache = XS.PdfRender.createCache(pdf);
    if (o.packaging === 'single') {
      for (let i = 0; i < recs.length; i++) {
        check(); progress(i, recs.length, 'Страница ' + (i + 1));
        for (const si of sides) await addCardPage(pdf, cache, scene(si, recs[i]));
        if (i % 5 === 4) await XS.pause();
      }
      return {blob: new Blob([await pdf.save()], {type: 'application/pdf'}), name: archiveName(doc, o, '.pdf'), files: 1, pages: pdf.getPageCount(), warnings};
    }

    // Печатные листы.
    const card = {w: doc.page.width, h: doc.page.height};
    const p = XS.Impose.plan(card, o);
    const per = p.slots.length, sheets = Math.ceil(recs.length / per);
    const K = XS.PdfRender.K;
    const front = {x: XS.num(o.offsetX, 0), y: XS.num(o.offsetY, 0)}, back = {x: XS.num(o.backOffsetX, 0), y: XS.num(o.backOffsetY, 0)};
    for (let s = 0; s < sheets; s++) {
      for (const si of sides) {
        check(); progress(s, sheets, 'Лист ' + (s + 1) + ' из ' + sheets);
        const page = pdf.addPage([p.sheetW * K, p.sheetH * K]);
        const isBack = si > 0 && sides.length > 1;
        const offset = isBack ? back : front;
        for (let k = 0; k < per; k++) {
          const r = recs[s * per + k];
          if (!r) break;
          const slot = isBack ? XS.Impose.backSlot(p, p.slots[k], o.duplex || 'long') : p.slots[k];
          await XS.PdfRender.draw(page, scene(si, r), cache, XS.Impose.matrix(p, slot, card, offset));
        }
        if (o.cutMarks && !(isBack && o.duplex !== 'none')) XS.Impose.cutMarks(page, p, offset);
        await XS.pause();
      }
    }
    return {blob: new Blob([await pdf.save()], {type: 'application/pdf'}), name: archiveName(doc, o, ' — печать.pdf'), files: 1, pages: pdf.getPageCount(), plan: p, warnings};
  }

  /* Проверка всех записей без выгрузки: переполнения, нет символов, нет столбцов. */
  async function check(doc, {progress = () => {}} = {}) {
    await XS.Fonts.ensureForDoc(doc);
    const recs = XS.Scene.records(doc, {scope: 'all'}), problems = XS.Check ? XS.Check.data(doc) : [];
    for (let i = 0; i < recs.length; i++) {
      for (let si = 0; si < doc.sides.length; si++) for (const w of XS.Scene.build(doc, si, recs[i].row, recs[i].index).warnings) problems.push({...w, record: recs[i].index + 1, side: doc.sides[si].name});
      if (i % 20 === 19) { progress(i, recs.length); await XS.pause(); }
    }
    return problems.sort((a, b) => a.record - b.record);
  }

  XS.Export = {run, check, previewNames, archiveName};
})(typeof window !== 'undefined' ? window : globalThis);
