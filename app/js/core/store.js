/* XSatsu Студия · хранение проектов.
 *   Store.local  — IndexedDB этого браузера (как раньше) + файл .xsatsu.json;
 *   Store.remote — сервер (XS.Api): документ без файлов, файлы — отдельно по SHA-256, версия ревизии против конфликтов;
 *   Store.*      — общий фасад: проект сохраняется туда, откуда открыт; новые — на сервер, если вы вошли. */
(function (global) {
  'use strict';
  const XS = global.XS;
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('xsatsu-studio', 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', {keyPath: 'id'});
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', {keyPath: 'id'});
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', {keyPath: 'sha'}); // кэш файлов с сервера
      };
      req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); dbPromise = null; }; resolve(d); };
      req.onblocked = () => { dbPromise = null; reject(new Error('Студия открыта в другой вкладке со старой версией — закройте её и обновите страницу.')); };
      req.onerror = () => reject(new Error('Браузер не даёт сохранить проекты (IndexedDB). Проверьте режим «инкогнито».'));
    });
    return dbPromise;
  }
  function tx(stores, mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      let result;
      Promise.resolve(fn(t)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('Ошибка сохранения.'));
      t.onabort = () => reject(t.error || new Error('Сохранение прервано (возможно, мало места).'));
    }));
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /* ---------- в браузере ---------- */
  function meta(doc, thumb) {
    return {id: doc.id, title: doc.title, kind: doc.kind, updatedAt: doc.updatedAt, rows: doc.data.rows.length, sides: doc.sides.length, page: doc.page, thumb: thumb || ''};
  }
  const local = {
    async list() {
      const items = await tx(['meta'], 'readonly', t => req(t.objectStore('meta').getAll()));
      return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(m => ({...m, where: 'local', permission: 'owner'}));
    },
    async get(id) {
      const doc = await tx(['docs'], 'readonly', t => req(t.objectStore('docs').get(id)));
      return doc ? XS.Model.normalizeDoc(doc) : null;
    },
    async save(doc, thumb) {
      doc.updatedAt = new Date().toISOString();
      const old = thumb ? null : await tx(['meta'], 'readonly', t => req(t.objectStore('meta').get(doc.id)));
      return tx(['docs', 'meta'], 'readwrite', t => {
        t.objectStore('docs').put(doc);
        t.objectStore('meta').put(meta(doc, thumb || old?.thumb));
      });
    },
    async remove(id) { return tx(['docs', 'meta'], 'readwrite', t => { t.objectStore('docs').delete(id); t.objectStore('meta').delete(id); }); },
    async has(id) { return !!(await tx(['meta'], 'readonly', t => req(t.objectStore('meta').get(id)))); }
  };

  /* ---------- на сервере ---------- */
  const remoteMeta = new Map(); // id → {revision, permission}
  const shaCache = new Map();   // asset/font id + длина данных → sha256
  /* Кэш файлов в браузере необязателен: если IndexedDB не ответила за 3 с — идём на сервер. */
  const soon = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  async function blobGet(sha) { try { return (await soon(tx(['blobs'], 'readonly', t => req(t.objectStore('blobs').get(sha))), 3000))?.data || null; } catch (e) { return null; } }
  async function blobPut(sha, data) { try { await tx(['blobs'], 'readwrite', t => { t.objectStore('blobs').put({sha, data, at: Date.now()}); }); } catch (e) { /* кэш не обязателен */ } }

  async function shaOf(item) {
    const k = item.id + ':' + item.data.length;
    if (!shaCache.has(k)) {
      const sha = await XS.Api.sha256(XS.dataUrlToBytes(item.data).bytes);
      shaCache.set(k, sha);
      blobPut(sha, item.data);
    }
    return shaCache.get(k);
  }
  /* Документ для сервера: вместо data:URL — sha256; недостающие файлы закачиваются. */
  async function dehydrate(doc) {
    const out = {...doc, assets: {}, fonts: []};
    const files = new Map();
    for (const a of Object.values(doc.assets)) {
      if (!a.data) { if (a.sha256) out.assets[a.id] = {...a, data: ''}; continue; }
      const sha = await shaOf(a);
      files.set(sha, a.data);
      out.assets[a.id] = {id: a.id, name: a.name, mime: a.mime, width: a.width, height: a.height, pages: a.pages, sha256: sha, data: ''};
    }
    for (const f of doc.fonts) {
      if (!f.data) { if (f.sha256) out.fonts.push({...f, data: ''}); continue; }
      const sha = await shaOf(f);
      files.set(sha, f.data);
      out.fonts.push({id: f.id, family: f.family, variant: f.variant, name: f.name, ...(f.source ? {source: f.source} : {}), ...(f.category ? {category: f.category} : {}), sha256: sha, data: ''});
    }
    if (files.size) {
      const {missing} = await XS.Api.call('POST', 'v1/assets/missing', {hashes: [...files.keys()]});
      for (const sha of missing) await XS.Api.call('PUT', 'v1/assets/' + sha, undefined, {raw: XS.dataUrlToBytes(files.get(sha)).bytes});
    }
    return out;
  }
  /* Документ с сервера: файлы — из кэша браузера или с сервера. */
  async function hydrate(doc, {link, progress} = {}) {
    const items = [...Object.values(doc.assets || {}), ...(doc.fonts || [])].filter(i => !i.data && i.sha256);
    let done = 0;
    const missing = [];
    const tell = () => progress?.(items.length > 1 ? `Загружаем файлы проекта: ${done} из ${items.length}…` : 'Загружаем файлы проекта…');
    const load = async item => {
      try {
        let data = await blobGet(item.sha256);
        if (!data) {
          const r = await XS.Api.call('GET', 'v1/assets/' + item.sha256, undefined, {query: link ? {link} : undefined});
          data = XS.bytesToDataUrl(r.bytes, item.mime || r.mime || (item.family ? 'font/ttf' : 'application/octet-stream'));
          blobPut(item.sha256, data);
        }
        item.data = data;
        shaCache.set(item.id + ':' + data.length, item.sha256);
      } catch (e) {
        if (e.status === 401 || e.status === 403) throw e;
        missing.push({name: item.name || item.family || item.id, error: e.message});
      } finally { done++; tell(); }
    };
    if (items.length) tell();
    // по 3 файла одновременно — не забиваем канал и показываем ход загрузки
    const queue = items.slice();
    await Promise.all(Array.from({length: Math.min(3, queue.length)}, async () => { while (queue.length) await load(queue.shift()); }));
    if (missing.length) Object.defineProperty(doc, '_missingFiles', {value: missing, enumerable: false, configurable: true});
    return doc;
  }

  /* normalizeDoc может вернуть новый объект — переносим список недогруженных файлов. */
  function keepMissing(doc, src) {
    if (src && src._missingFiles && doc !== src) Object.defineProperty(doc, '_missingFiles', {value: src._missingFiles, enumerable: false, configurable: true});
    return doc;
  }
  const remote = {
    meta: remoteMeta,
    async list(scope = 'mine') {
      const r = await XS.Api.call('GET', 'v1/projects', undefined, {query: {scope}});
      for (const p of r.projects) if (scope !== 'trash') remoteMeta.set(p.id, {...remoteMeta.get(p.id), permission: p.permission});
      return r.projects.map(p => ({...p, where: 'remote', scope}));
    },
    async get(id, {progress} = {}) {
      const r = await XS.Api.call('GET', 'v1/projects/' + encodeURIComponent(id));
      remoteMeta.set(id, {revision: r.revision, permission: r.permission});
      return keepMissing(XS.Model.normalizeDoc(await hydrate(r.doc, {progress})), r.doc);
    },
    async create(doc, thumb, note) {
      const r = await XS.Api.call('POST', 'v1/projects', {doc: await dehydrate(doc), thumb, note});
      doc.id = r.id; // сервер мог выдать новый номер
      remoteMeta.set(r.id, {revision: r.revision, permission: 'owner'});
      return r;
    },
    async save(doc, thumb, {force = false, note} = {}) {
      const m = remoteMeta.get(doc.id);
      if (!m) throw new Error('Проект не открыт с сервера.');
      doc.updatedAt = new Date().toISOString();
      const body = {doc: await dehydrate(doc), revision: m.revision, thumb: thumb || undefined, note};
      try {
        const r = await XS.Api.call('PUT', 'v1/projects/' + encodeURIComponent(doc.id), body);
        m.revision = r.revision;
        return r;
      } catch (e) {
        if (e.status === 409 && force) { m.revision = e.data.revision; return remote.save(doc, thumb, {note}); }
        throw e;
      }
    },
    remove: (id, purge = false) => XS.Api.call('DELETE', 'v1/projects/' + encodeURIComponent(id), undefined, {query: purge ? {purge: 1} : undefined}),
    restore: id => XS.Api.call('POST', 'v1/projects/' + encodeURIComponent(id) + '/restore'),
    revisions: id => XS.Api.call('GET', 'v1/projects/' + encodeURIComponent(id) + '/revisions').then(r => r.revisions),
    async revision(id, rev) { const r = await XS.Api.call('GET', 'v1/projects/' + encodeURIComponent(id) + '/revisions/' + rev); return XS.Model.normalizeDoc(await hydrate(r.doc)); },
    saveVersion: (id, note) => XS.Api.call('POST', 'v1/projects/' + encodeURIComponent(id) + '/revisions', {note}),
    shares: id => XS.Api.call('GET', 'v1/projects/' + encodeURIComponent(id) + '/shares'),
    share: (id, body) => XS.Api.call('POST', 'v1/projects/' + encodeURIComponent(id) + '/shares', body),
    unshare: (id, shareId) => XS.Api.call('DELETE', 'v1/projects/' + encodeURIComponent(id) + '/shares/' + shareId),
    async byLink(token) {
      const r = await XS.Api.call('GET', 'v1/links/' + encodeURIComponent(token));
      return keepMissing(XS.Model.normalizeDoc(await hydrate(r.doc, {link: token})), r.doc);
    }
  };

  /* ---------- фасад ---------- */
  const where = id => (remoteMeta.has(id) ? 'remote' : 'local');
  const canUseServer = () => !!(XS.Api && XS.Api.user());
  async function create(doc, thumb) {
    if (canUseServer()) return remote.create(doc, thumb);
    return local.save(doc, thumb);
  }
  async function save(doc, thumb, opts) { return where(doc.id) === 'remote' ? remote.save(doc, thumb, opts) : local.save(doc, thumb); }
  async function get(id) {
    if (remoteMeta.has(id) && canUseServer()) return remote.get(id);
    const doc = await local.get(id);
    if (doc) return doc;
    if (canUseServer()) return remote.get(id);
    return null;
  }

  function toFile(doc) {
    const copy = XS.clone(doc);
    XS.Model.pruneAssets(copy);
    for (const a of Object.values(copy.assets)) delete a.sha256;
    for (const f of copy.fonts) delete f.sha256;
    return new Blob([JSON.stringify(copy)], {type: 'application/json'});
  }

  XS.Store = {local, remote, where, create, save, get, list: local.list, remove: local.remove, toFile, dehydrate, hydrate};
})(typeof window !== 'undefined' ? window : globalThis);
