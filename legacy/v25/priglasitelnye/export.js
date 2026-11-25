/*
 * Offline export helpers. No libraries, network requests or server are used.
 *
 * InviteExport.sanitizeFilename(name) -> safe single Windows filename (<=180 chars).
 * await InviteExport.zip([{name, blob}], onProgress?) -> application/zip Blob.
 *   onProgress(done, total, originalName) runs after each file. ZIP uses the STORE
 *   method and UTF-8 names; PNG/JPEG files are already compressed.
 * await InviteExport.pdf([{jpeg, width, height}], {landscape?, pageWidth?, pageHeight?, title?}) -> PDF Blob.
 *   jpeg is a Uint8Array, ArrayBuffer or Blob containing a complete JPEG image.
 *   Each image fills one page; optional pageWidth/pageHeight are millimetres.
 *   Default paper is A4; width/height describe the image pixel dimensions.
 * await InviteExport.pdfFromCanvases(canvases, {quality?, landscape?, title?})
 *   -> PDF Blob. Canvas JPEG quality defaults to 0.96.
 */
(function (global) {
  'use strict';

  const encoder = new TextEncoder();
  const MAX_UINT32 = 0xffffffff;
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[n] = value >>> 0;
  }

  function sanitizeFilename(name) {
    let result = String(name == null ? '' : name).normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
      .replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '');
    if (!result) result = 'Пригласительный';
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
    if (result.length > 180) {
      const dot = result.lastIndexOf('.');
      const extension = dot > 0 && result.length - dot <= 12 ? result.slice(dot) : '';
      let base = result.slice(0, 180 - extension.length);
      // Do not split a surrogate pair while shortening a Unicode filename.
      if (/[\uD800-\uDBFF]$/.test(base)) base = base.slice(0, -1);
      result = base.replace(/[ .]+$/g, '') + extension;
    }
    return result;
  }

  function uniqueFilename(name, used) {
    const safe = sanitizeFilename(name);
    let candidate = safe;
    let number = 2;
    const dot = safe.lastIndexOf('.');
    const extension = dot > 0 ? safe.slice(dot) : '';
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    while (used.has(candidate.toLocaleLowerCase())) {
      const suffix = ' (' + number++ + ')';
      candidate = sanitizeFilename(base.slice(0, 180 - extension.length - suffix.length) + suffix + extension);
    }
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  }

  function crc32(bytes) {
    let crc = MAX_UINT32;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ MAX_UINT32) >>> 0;
  }

  async function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value && typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
    throw new TypeError('Ожидался Blob, ArrayBuffer или Uint8Array.');
  }

  function littleEndian(size) {
    const bytes = new Uint8Array(size);
    return {bytes, view: new DataView(bytes.buffer)};
  }

  async function zip(files, onProgress) {
    if (!Array.isArray(files)) throw new TypeError('Передайте список файлов.');
    if (files.length > 65535) throw new Error('В одном архиве может быть не более 65535 файлов.');
    const parts = [];
    const central = [];
    const used = new Set();
    let offset = 0;
    const date = new Date();
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const bytes = await toBytes(file.blob);
      const filename = encoder.encode(uniqueFilename(file.name, used));
      if (bytes.byteLength > MAX_UINT32 || offset + 30 + filename.length + bytes.byteLength > MAX_UINT32) {
        throw new Error('Архив превышает 4 ГБ. Разделите список гостей на части.');
      }
      const crc = crc32(bytes);
      const local = littleEndian(30);
      local.view.setUint32(0, 0x04034b50, true);
      local.view.setUint16(4, 20, true);
      local.view.setUint16(6, 0x0800, true); // UTF-8 names; sizes are known.
      local.view.setUint16(8, 0, true); // STORE
      local.view.setUint16(10, dosTime, true);
      local.view.setUint16(12, dosDate, true);
      local.view.setUint32(14, crc, true);
      local.view.setUint32(18, bytes.byteLength, true);
      local.view.setUint32(22, bytes.byteLength, true);
      local.view.setUint16(26, filename.byteLength, true);
      parts.push(local.bytes, filename, bytes);

      const entry = littleEndian(46);
      entry.view.setUint32(0, 0x02014b50, true);
      entry.view.setUint16(4, 20, true);
      entry.view.setUint16(6, 20, true);
      entry.view.setUint16(8, 0x0800, true);
      entry.view.setUint16(10, 0, true);
      entry.view.setUint16(12, dosTime, true);
      entry.view.setUint16(14, dosDate, true);
      entry.view.setUint32(16, crc, true);
      entry.view.setUint32(20, bytes.byteLength, true);
      entry.view.setUint32(24, bytes.byteLength, true);
      entry.view.setUint16(28, filename.byteLength, true);
      entry.view.setUint32(42, offset, true);
      central.push(entry.bytes, filename);
      offset += 30 + filename.byteLength + bytes.byteLength;
      if (typeof onProgress === 'function') onProgress(i + 1, files.length, file.name);
      // Let the browser update its progress indicator between archive entries.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const centralSize = central.reduce((size, part) => size + part.byteLength, 0);
    if (offset + centralSize + 22 > MAX_UINT32) throw new Error('Архив превышает 4 ГБ. Разделите список гостей на части.');
    const end = littleEndian(22);
    end.view.setUint32(0, 0x06054b50, true);
    end.view.setUint16(8, files.length, true);
    end.view.setUint16(10, files.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.bytes], {type: 'application/zip'});
  }

  function jpegDetails(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Для PDF требуется изображение JPEG.');
    let position = 2;
    while (position + 3 < bytes.length) {
      if (bytes[position++] !== 0xff) continue;
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const length = (bytes[position] << 8) | bytes[position + 1];
      if (length < 2 || position + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        const height = (bytes[position + 3] << 8) | bytes[position + 4];
        const width = (bytes[position + 5] << 8) | bytes[position + 6];
        const components = bytes[position + 7];
        if (!width || !height || ![1, 3, 4].includes(components)) break;
        return {width, height, components, bits: bytes[position + 2]};
      }
      position += length;
    }
    throw new Error('Не удалось прочитать размеры JPEG.');
  }

  function pdfUnicode(text) {
    let hex = 'FEFF';
    const value = String(text);
    for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0');
    return '<' + hex + '>';
  }

  async function pdf(pages, options) {
    if (!Array.isArray(pages) || !pages.length) throw new Error('Нет страниц для PDF.');
    options = options || {};
    const customPaper = options.pageWidth != null || options.pageHeight != null;
    if (customPaper && (!Number.isFinite(Number(options.pageWidth)) || !Number.isFinite(Number(options.pageHeight)) || Number(options.pageWidth) < 10 || Number(options.pageHeight) < 10 || Number(options.pageWidth) > 2000 || Number(options.pageHeight) > 2000)) throw new Error('Укажите размеры страницы PDF в миллиметрах: от 10 до 2000.');
    const pageWidth = customPaper ? Number(options.pageWidth) * 72 / 25.4 : options.landscape ? 841.889764 : 595.275591;
    const pageHeight = customPaper ? Number(options.pageHeight) * 72 / 25.4 : options.landscape ? 595.275591 : 841.889764;
    const parts = [];
    const offsets = [0];
    let byteLength = 0;
    const append = part => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      parts.push(bytes);
      byteLength += bytes.byteLength;
    };
    const startObject = id => {
      offsets[id] = byteLength;
      append(id + ' 0 obj\n');
    };
    append(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    startObject(1);
    append('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    startObject(2);
    append('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (4 + i * 3) + ' 0 R').join(' ') + '] >>\nendobj\n');
    startObject(3);
    append('<< /Title ' + pdfUnicode(options.title || 'Пригласительные') + ' /Creator (Invitation Studio) >>\nendobj\n');

    for (let i = 0; i < pages.length; i++) {
      const monochrome = pages[i].mask != null;
      let data = await toBytes(monochrome ? pages[i].mask : pages[i].jpeg);
      const details = monochrome ? {width:pages[i].width,height:pages[i].height,components:1,bits:1} : jpegDetails(data);
      let filter = monochrome ? '' : ' /Filter /DCTDecode';
      if (monochrome) {
        if (!Number.isInteger(details.width) || !Number.isInteger(details.height) || details.width < 1 || details.height < 1 || data.length !== Math.ceil(details.width / 8) * details.height) throw new Error('Некорректная однобитная маска.');
        if (typeof CompressionStream !== 'undefined') {
          data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
          filter = ' /Filter /FlateDecode';
        }
      }
      const id = 4 + i * 3;
      startObject(id);
      append('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Resources << /XObject << /Im0 ' + (id + 1) + ' 0 R >> >> /Contents ' + (id + 2) + ' 0 R >>\nendobj\n');
      startObject(id + 1);
      const colorSpace = details.components === 1 ? '/DeviceGray' : details.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      append('<< /Type /XObject /Subtype /Image /Width ' + details.width + ' /Height ' + details.height + ' /ColorSpace ' + colorSpace + ' /BitsPerComponent ' + details.bits + (monochrome ? ' /Decode [1 0] /Interpolate false' : '') + filter + ' /Length ' + data.byteLength + ' >>\nstream\n');
      append(data);
      append('\nendstream\nendobj\n');
      const content = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Im0 Do\nQ\n';
      startObject(id + 2);
      append('<< /Length ' + encoder.encode(content).byteLength + ' >>\nstream\n' + content + 'endstream\nendobj\n');
    }

    const crossReferenceOffset = byteLength;
    const objectCount = 4 + pages.length * 3;
    append('xref\n0 ' + objectCount + '\n0000000000 65535 f \n');
    for (let id = 1; id < objectCount; id++) append(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    append('trailer\n<< /Size ' + objectCount + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + crossReferenceOffset + '\n%%EOF\n');
    return new Blob(parts, {type: 'application/pdf'});
  }

  async function pdfFromCanvases(canvases, options) {
    options = options || {};
    const pages = [];
    const quality = Number.isFinite(options.quality) ? Math.max(0, Math.min(1, options.quality)) : 0.96;
    for (const canvas of canvases) {
      const jpeg = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось преобразовать страницу в JPEG.')), 'image/jpeg', quality);
      });
      pages.push({jpeg, width: canvas.width, height: canvas.height});
    }
    return pdf(pages, options);
  }

  // MSB-first, padded to full bytes on every row: 1 = black, 0 = white.
  function maskFromCanvas(canvas, threshold = 160) {
    const width = canvas.width, height = canvas.height, stride = Math.ceil(width / 8), mask = new Uint8Array(stride * height);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    for (let top = 0; top < height; top += 32) {
      const rows = Math.min(32,height-top), pixels = context.getImageData(0,top,width,rows).data;
      for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
        const p = (y*width+x)*4, alpha = pixels[p+3]/255;
        const luminance = (.2126*pixels[p]+.7152*pixels[p+1]+.0722*pixels[p+2])*alpha+255*(1-alpha);
        if (luminance < threshold) mask[(top+y)*stride+(x>>3)] |= 128>>(x&7);
      }
    }
    return {mask,width,height};
  }
  global.InviteExport = Object.freeze({sanitizeFilename, zip, pdf, pdfFromCanvases, maskFromCanvas, monochromePDF:pdf});
})(typeof window === 'undefined' ? globalThis : window);
