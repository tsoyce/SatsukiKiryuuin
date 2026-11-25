/* XSatsu Студия · файлы проекта: картинки и PDF-шаблоны.
 * PDF на экране рисуется через pdf.js, а в PDF-файл встраивается как вектор (pdf-lib). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const images = new Map(), pdfDocs = new Map(), pdfRasters = new Map();
  let workerReady = false;

  const isPdf = asset => asset && (asset.mime === 'application/pdf' || /^data:application\/pdf/.test(asset.data));

  function image(asset) {
    const k = asset.id;
    if (!images.has(k)) {
      images.set(k, new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => { images.delete(k); reject(new Error('Не удалось открыть изображение «' + (asset.name || '') + '».')); };
        img.src = asset.data;
      }));
    }
    return images.get(k);
  }

  function pdfjs() {
    const lib = global.pdfjsLib;
    if (!lib) throw new Error('Не загружен pdf.js (vendor/pdf.min.js).');
    if (!workerReady) {
      lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      workerReady = true;
    }
    return lib;
  }
  function pdfDoc(asset) {
    if (!pdfDocs.has(asset.id)) {
      const task = pdfjs().getDocument({data: XS.dataUrlToBytes(asset.data).bytes, isEvalSupported: false}).promise;
      task.catch(() => pdfDocs.delete(asset.id));
      pdfDocs.set(asset.id, task);
    }
    return pdfDocs.get(asset.id);
  }
  /* Растр страницы PDF нужного размера в пикселях (кэшируется с шагом, чтобы не перерисовывать при каждом движении). */
  async function pdfRaster(asset, pageNumber, pxWidth) {
    const bucket = Math.min(8000, Math.max(64, Math.ceil(pxWidth / 128) * 128));
    const k = asset.id + '#' + pageNumber + '@' + bucket;
    if (!pdfRasters.has(k)) {
      pdfRasters.set(k, (async () => {
        const doc = await pdfDoc(asset);
        const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
        const base = page.getViewport({scale: 1});
        const viewport = page.getViewport({scale: bucket / base.width});
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({canvasContext: ctx, viewport}).promise;
        return canvas;
      })());
      if (pdfRasters.size > 24) pdfRasters.delete(pdfRasters.keys().next().value);
    }
    return pdfRasters.get(k);
  }
  /* Источник для drawImage: картинка или растр страницы PDF. */
  async function drawable(asset, page, pxWidth) {
    return isPdf(asset) ? pdfRaster(asset, page, pxWidth) : image(asset);
  }
  /* Размеры страниц PDF в мм (через pdf-lib, без рендера). */
  async function pdfInfo(dataUrl) {
    const pdf = await global.PDFLib.PDFDocument.load(XS.dataUrlToBytes(dataUrl).bytes, {ignoreEncryption: true, updateMetadata: false});
    return pdf.getPages().map(p => { const {width, height} = p.getSize(); return {width: width * XS.MM_PER_PT, height: height * XS.MM_PER_PT}; });
  }
  /* Загрузка файла пользователя → объект для doc.assets. */
  async function fromFile(file) {
    const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdfFile && !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Поддерживаются PDF, PNG, JPEG, WebP и SVG.');
    let data = await XS.readFileAsDataUrl(file);
    if (isPdfFile) {
      data = data.replace(/^data:[^;]*;/, 'data:application/pdf;');
      const pages = await pdfInfo(data);
      return {name: file.name, mime: 'application/pdf', data, width: pages[0].width, height: pages[0].height, pages};
    }
    const img = await image({id: 'probe-' + Math.random(), data});
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') data = await toPng(img); // pdf-lib понимает только PNG/JPEG
    return {name: file.name, mime: /^data:([^;]+)/.exec(data)[1], data, width: img.naturalWidth, height: img.naturalHeight};
  }
  async function toPng(img, w = img.naturalWidth || 1000, h = img.naturalHeight || 1000) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  }
  /* Байты для pdf-lib: JPEG/PNG как есть, остальное перекодируется. */
  async function pdfImageBytes(asset) {
    const {mime, bytes} = XS.dataUrlToBytes(asset.data);
    if (mime === 'image/jpeg' || mime === 'image/png') return {mime, bytes};
    const img = await image(asset);
    return XS.dataUrlToBytes(await toPng(img));
  }
  function forget(id) { images.delete(id); pdfDocs.delete(id); for (const k of [...pdfRasters.keys()]) if (k.startsWith(id + '#')) pdfRasters.delete(k); }

  /* Прямоугольник вписывания картинки srcW×srcH в рамку box. */
  function fitRect(srcW, srcH, box, fit) {
    if (fit === 'stretch' || !srcW || !srcH) return {x: box.x, y: box.y, w: box.w, h: box.h};
    const s = fit === 'cover' ? Math.max(box.w / srcW, box.h / srcH) : Math.min(box.w / srcW, box.h / srcH);
    const w = srcW * s, h = srcH * s;
    return {x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h};
  }

  XS.Assets = {isPdf, image, pdfDoc, pdfRaster, drawable, pdfInfo, fromFile, pdfImageBytes, forget, fitRect};
})(typeof window !== 'undefined' ? window : globalThis);
