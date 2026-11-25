/* XSatsu Студия · общие утилиты. Все модули ядра живут в window.XS. */
(function (global) {
  'use strict';
  const XS = global.XS = global.XS || {};
  const MM_PER_PT = 25.4 / 72;

  function uid(prefix = 'id') {
    const random = global.crypto?.randomUUID ? global.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    return prefix + '-' + Date.now().toString(36) + '-' + random;
  }
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const num = (v, fallback, min = -Infinity, max = Infinity) => Number.isFinite(Number(v)) && v !== '' && v !== null ? clamp(Number(v), min, max) : fallback;
  const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const pause = () => new Promise(r => setTimeout(r, 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const key = v => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е');

  function dataUrlToBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(5, comma);
    const body = dataUrl.slice(comma + 1);
    if (!/;base64$/.test(meta)) return {mime: meta, bytes: new TextEncoder().encode(decodeURIComponent(body))};
    const bin = atob(body), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return {mime: meta.replace(/;base64$/, ''), bytes};
  }
  function bytesToDataUrl(bytes, mime) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:' + mime + ';base64,' + btoa(bin);
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл «' + file.name + '».'));
      reader.readAsDataURL(file);
    });
  }
  /* Загрузка встроенных файлов (шрифты, шаблоны). В автономной сборке файлы лежат в window.XS_EMBED. */
  async function fetchBytes(url) {
    const embedded = global.XS_EMBED?.[url];
    if (embedded) return dataUrlToBytes(embedded).bytes;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Не удалось загрузить ' + url + ' (' + response.status + ').');
    return new Uint8Array(await response.arrayBuffer());
  }
  async function fetchDataUrl(url) {
    const embedded = global.XS_EMBED?.[url];
    if (embedded) return embedded;
    const bytes = await XS.fetchBytes(url);
    const ext = url.split('.').pop().toLowerCase();
    const mime = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf'}[ext] || 'application/octet-stream';
    return bytesToDataUrl(bytes, mime);
  }
  async function fetchJson(url) {
    return JSON.parse(new TextDecoder().decode(await XS.fetchBytes(url)));
  }
  function download(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? {r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255} : {r: 0, g: 0, b: 0};
  }
  function debounce(fn, ms) {
    let t;
    const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    wrapped.flush = (...args) => { clearTimeout(t); return fn(...args); };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  }
  /* «1-3, 7, 10-12» → [0,1,2,6,9,10,11] (индексы с нуля), не больше max. */
  function parseRange(text, max) {
    const out = new Set();
    for (const part of String(text || '').split(/[,;\s]+/).filter(Boolean)) {
      const m = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(part);
      if (!m) throw new Error('Не понял диапазон «' + part + '». Пример: 1-5, 8, 10-12');
      let a = Number(m[1]), b = Number(m[2] || m[1]);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= Math.min(b, max); i++) if (i >= 1) out.add(i - 1);
    }
    return [...out].sort((x, y) => x - y);
  }

  Object.assign(XS, {MM_PER_PT, uid, clamp, num, clone, pause, esc, key, dataUrlToBytes, bytesToDataUrl, readFileAsDataUrl, fetchBytes, fetchDataUrl, fetchJson, download, hexToRgb, debounce, parseRange});
})(typeof window !== 'undefined' ? window : globalThis);
