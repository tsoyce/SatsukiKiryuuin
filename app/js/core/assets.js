/* XSatsu Студия · файлы проекта: картинки и PDF-шаблоны.
 * PDF на экране рисуется через pdf.js, а в PDF-файл встраивается как вектор (pdf-lib). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const images = new Map(), pdfDocs = new Map(), pdfRasters = new Map();
  let workerReady = false;

  const isPdf = asset => asset && (asset.mime === 'application/pdf' || /^data:application\/pdf/.test(asset.data));

  function image(asset) {
    if (!asset.data) return Promise.reject(new Error('Файл «' + (asset.name || '') + '» не загрузился с сервера.'));
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
    if (!asset.data) return Promise.reject(new Error('Файл «' + (asset.name || '') + '» не загрузился с сервера.'));
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
  /* Тип картинки по первым байтам: файлы с телефона и из архивов часто приходят без типа или с чужим расширением. */
  function sniff(bytes) {
    const b = bytes || [];
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/heic'; // ftyp… — HEIC/HEIF с iPhone
    const head = new TextDecoder().decode(b.slice ? b.slice(0, 256) : []).trim();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml';
    return '';
  }
  /* Поворот из EXIF JPEG (1 — как есть). Телефон пишет снимок «боком» и ставит метку: браузер её учитывает, а PDF — нет,
   * поэтому такие фото перекодируются через canvas — и на экране, и в PDF они стоят одинаково. */
  function exifOrientation(bytes) {
    const b = bytes;
    if (!(b[0] === 0xFF && b[1] === 0xD8)) return 1;
    let i = 2;
    while (i + 4 < b.length && i < 131072) {
      if (b[i] !== 0xFF) return 1;
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        const t = i + 10, le = b[t] === 0x49;
        const u16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
        const u32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8) || 1; }
        return 1;
      }
      if (marker === 0xDA) return 1;
      i += 2 + len;
    }
    return 1;
  }

  /* Загрузка файла пользователя → объект для doc.assets.
   * opts.maxPx — длинная сторона картинки не больше (фото с телефона 4000–8000 px весят мегабайты, а на бейдже нужны сотни px):
   * крупнее — уменьшается и сохраняется JPEG (PNG с прозрачностью остаётся PNG). Фото с меткой поворота выпрямляется. */
  async function fromFile(file, {maxPx = 4000} = {}) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes) || file.type;
    const label = '«' + file.name + '»: ';
    if (type === 'image/heic' || /\.(heic|heif)$/i.test(file.name)) throw new Error(label + 'формат HEIC (iPhone) браузер не открывает. Сохраните фото как JPEG (на iPhone: Настройки → Камера → Форматы → «Наиболее совместимые»).');
    const isPdfFile = type === 'application/pdf';
    if (!isPdfFile && !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(type)) throw new Error(label + 'поддерживаются PDF, PNG, JPEG, WebP и SVG.');
    let data = XS.bytesToDataUrl(bytes, type);
    if (isPdfFile) {
      const pages = await pdfInfo(data);
      return {name: file.name, mime: 'application/pdf', data, width: pages[0].width, height: pages[0].height, pages};
    }
    const img = await image({id: 'probe-' + Math.random(), data}).catch(() => { throw new Error(label + 'файл повреждён или это не картинка.'); });
    const w = img.naturalWidth, h = img.naturalHeight, big = Math.max(w, h) > maxPx;
    const rotated = type === 'image/jpeg' && exifOrientation(bytes) > 1;
    if (big || rotated || type === 'image/webp' && bytes.length > 2e6) {
      const k = big ? maxPx / Math.max(w, h) : 1;
      data = await reencode(img, Math.round(w * k), Math.round(h * k), type === 'image/png' || type === 'image/gif' || type === 'image/svg+xml' ? 'png' : 'jpeg');
    } else if (type === 'image/svg+xml' || type === 'image/gif') data = await toPng(img); // pdf-lib понимает только PNG/JPEG
    const out = await image({id: 'probe-' + Math.random(), data});
    return {name: file.name, mime: /^data:([^;]+)/.exec(data)[1], data, width: out.naturalWidth, height: out.naturalHeight};
  }
  /* Перекодировать: PNG остаётся PNG, если в нём есть прозрачность; иначе JPEG 0.9. */
  async function reencode(img, w, h, prefer) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (prefer === 'png') {
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let alpha = false;
      for (let i = 3; i < px.length; i += 16) if (px[i] < 250) { alpha = true; break; }
      if (alpha) return c.toDataURL('image/png');
    }
    const flat = document.createElement('canvas'); flat.width = c.width; flat.height = c.height;
    const f = flat.getContext('2d'); f.fillStyle = '#ffffff'; f.fillRect(0, 0, c.width, c.height); f.drawImage(c, 0, 0);
    return flat.toDataURL('image/jpeg', 0.9);
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

  XS.Assets = {isPdf, sniff, exifOrientation, image, pdfDoc, pdfRaster, drawable, pdfInfo, fromFile, pdfImageBytes, forget, fitRect};
})(typeof window !== 'undefined' ? window : globalThis);
