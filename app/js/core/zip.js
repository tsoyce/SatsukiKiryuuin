/* XSatsu Студия · ZIP-архив (метод STORE, имена в UTF-8) и безопасные имена файлов.
 * Перенесено из v25 (export.js) без изменений логики. */
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
    if (!result) result = 'Файл';
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
        throw new Error('Архив превышает 4 ГБ. Выберите меньше записей.');
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
    if (offset + centralSize + 22 > MAX_UINT32) throw new Error('Архив превышает 4 ГБ. Выберите меньше записей.');
    const end = littleEndian(22);
    end.view.setUint32(0, 0x06054b50, true);
    end.view.setUint16(8, files.length, true);
    end.view.setUint16(10, files.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.bytes], {type: 'application/zip'});
  }


  /* Сжатый архив через fflate (vendor/fflate.min.js): PDF и тексты сжимаются, JPEG/PNG — как есть.
   * Архив собирается по частям (поток fflate.Zip), без лишней копии всего архива в памяти. */
  const STORED = /\.(jpe?g|png|webp|gif|zip|gz|woff2?|mp4)$/i;
  async function zipDeflate(files, onProgress) {
    const F = global.fflate;
    if (!F || !F.Zip) return zip(files, onProgress);
    if (files.length > 65535) throw new Error('В одном архиве может быть не более 65535 файлов.');
    const chunks = [];
    let failure = null;
    const archive = new F.Zip((err, chunk) => { if (err) failure = err; else chunks.push(chunk); });
    const used = new Set();
    for (let i = 0; i < files.length; i++) {
      const name = uniqueFilename(files[i].name, used);
      const bytes = await toBytes(files[i].blob);
      const entry = STORED.test(name) ? new F.ZipPassThrough(name) : new F.ZipDeflate(name, {level: 6});
      entry.mtime = new Date();
      archive.add(entry);
      entry.push(bytes, true);
      if (failure) throw failure;
      if (typeof onProgress === 'function') onProgress(i + 1, files.length, files[i].name);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    archive.end();
    if (failure) throw failure;
    return new Blob(chunks, {type: 'application/zip'});
  }
  /* Чтение ZIP (XLSX, ODS, .xsatsu): {имя: Uint8Array}. */
  function unzip(bytes, filter) {
    const F = global.fflate;
    if (!F) throw new Error('Не загружена библиотека fflate (vendor/fflate.min.js).');
    return F.unzipSync(bytes, filter ? {filter: f => filter(f.name)} : undefined);
  }

  global.XS.Zip = {sanitizeFilename, uniqueFilename, zip: zipDeflate, zipStore: zip, unzip, crc32};
})(typeof window !== 'undefined' ? window : globalThis);
