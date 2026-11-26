/* XSatsu Студия · картинки по ссылке.
 * Ссылка в ячейке («https://…/photo.jpg») или в источнике картинки остаётся как есть, а сама картинка один раз скачивается
 * и хранится в проекте как обычный файл (asset.urls = [ссылка]). Рисуется всегда сохранённая копия, поэтому холст
 * не «загрязняется» чужой картинкой, PNG/PDF выгружаются, а проект открывается без интернета.
 * Скачивает сервер Студии (v1/images/fetch, с защитой от SSRF); без входа в аккаунт — браузер напрямую, если сайт разрешает (CORS). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const isUrl = v => /^https?:\/\/\S+$/i.test(String(v ?? '').trim());

  /* Ссылки «поделиться» → прямые ссылки на файл. */
  function directUrl(url) {
    const s = String(url || '').trim();
    let m = /^https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/.exec(s);
    if (m) return 'https://drive.google.com/uc?export=download&id=' + m[1];
    m = /^https?:\/\/(?:www\.)?dropbox\.com\/(.+?)(?:[?&]dl=0)?$/.exec(s);
    if (m && /[?&]dl=0/.test(s)) return s.replace(/([?&])dl=0/, '$1raw=1');
    return s;
  }

  function find(doc, url) {
    url = String(url || '').trim();
    if (!url) return null;
    for (const a of Object.values(doc.assets)) if (a.urls && a.urls.includes(url)) return a;
    return null;
  }

  /* Какие ссылки нужны для отрисовки: источники картинок макета (прямые и «из столбца») по записям rows;
   * withColumns — ещё и все ссылки в столбцах-картинках (для таблицы и формы). */
  function needed(doc, rows = doc.data.rows, {withColumns = false} = {}) {
    const out = new Set(), fields = new Set();
    for (const s of doc.sides) for (const el of s.elements) {
      if (el.type !== 'image') continue;
      const src = String(el.src || '').trim();
      if (isUrl(src)) out.add(src);
      const m = /^\{([^{}:|]+)/.exec(src);
      if (m) fields.add(XS.key(m[1]));
    }
    const cols = doc.data.columns.filter(c => fields.has(XS.key(c.name)) || (withColumns && c.type === 'image'));
    for (const r of rows) if (r) for (const c of cols) { const v = String(r.cells[c.id] ?? '').trim(); if (isUrl(v)) out.add(v); }
    return [...out];
  }
  const missing = (doc, rows, opts) => needed(doc, rows, opts).filter(u => !find(doc, u));

  function nameFrom(url, mime) {
    let n = '';
    try { n = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch (e) { /* нет имени */ }
    if (!n || !/\.[a-z0-9]{2,5}$/i.test(n)) n = (n || 'картинка') + '.' + ({'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg'}[mime] || 'jpg');
    return n.slice(0, 120);
  }

  /* Скачать одну картинку → объект для doc.assets (с urls). */
  async function download(url, {maxPx = 2400} = {}) {
    const src = directUrl(url);
    let bytes, mime = '';
    if (XS.Api?.available && XS.Api.user?.()) {
      const r = await XS.Api.call('GET', 'v1/images/fetch', undefined, {query: {url: src}, timeout: 60000});
      bytes = r.bytes; mime = r.mime;
    } else {
      let r;
      try { r = await fetch(src, {mode: 'cors', credentials: 'omit'}); }
      catch (e) { throw new Error('сайт не даёт взять картинку напрямую. Войдите в аккаунт Студии — тогда её скачает сервер, — или загрузите файл.'); }
      if (!r.ok) throw new Error('сайт ответил ' + r.status + '.');
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    mime = XS.Assets.sniff(bytes) || mime;
    if (!/^image\//.test(mime)) throw new Error(/<html|<!doctype/i.test(new TextDecoder().decode(bytes.slice(0, 300))) ? 'по ссылке — страница, а не картинка. Откройте картинку и скопируйте «адрес изображения».' : 'по ссылке не картинка.');
    const file = new File([bytes], nameFrom(src, mime), {type: mime});
    const asset = await XS.Assets.fromFile(file, {maxPx});
    return {...asset, urls: [String(url).trim()]};
  }

  /* Скачать недостающие (по 3 одновременно). → {added, failed: [{url, message}]} */
  async function localize(doc, urls, {onProgress = () => {}, concurrency = 3} = {}) {
    const queue = [...new Set(urls)].filter(u => !find(doc, u));
    const failed = []; let added = 0, done = 0;
    const worker = async () => {
      while (queue.length) {
        const url = queue.shift();
        try { XS.Model.addAsset(doc, await download(url)); added++; }
        catch (e) { failed.push({url, message: (e.message || String(e)).replace(/^«[^»]*»:\s*/, '')}); }
        onProgress(++done, done + queue.length, url);
      }
    };
    await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
    return {added, failed};
  }

  XS.RemoteImages = {isUrl, directUrl, find, needed, missing, download, localize};
})(typeof window !== 'undefined' ? window : globalThis);
