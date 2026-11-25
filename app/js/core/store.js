/* XSatsu Студия · хранение проектов в браузере (IndexedDB) и в файлах .xsatsu.json. */
(function (global) {
  'use strict';
  const XS = global.XS;
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('xsatsu-studio', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', {keyPath: 'id'});
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', {keyPath: 'id'});
      };
      req.onsuccess = () => resolve(req.result);
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

  function meta(doc, thumb) {
    return {id: doc.id, title: doc.title, kind: doc.kind, updatedAt: doc.updatedAt, rows: doc.data.rows.length, sides: doc.sides.length, page: doc.page, thumb: thumb || ''};
  }
  async function list() {
    const items = await tx(['meta'], 'readonly', t => req(t.objectStore('meta').getAll()));
    return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async function get(id) {
    const doc = await tx(['docs'], 'readonly', t => req(t.objectStore('docs').get(id)));
    return doc ? XS.Model.normalizeDoc(doc) : null;
  }
  async function save(doc, thumb) {
    doc.updatedAt = new Date().toISOString();
    const old = thumb ? null : await tx(['meta'], 'readonly', t => req(t.objectStore('meta').get(doc.id)));
    return tx(['docs', 'meta'], 'readwrite', t => {
      t.objectStore('docs').put(doc);
      t.objectStore('meta').put(meta(doc, thumb || old?.thumb));
    });
  }
  async function remove(id) { return tx(['docs', 'meta'], 'readwrite', t => { t.objectStore('docs').delete(id); t.objectStore('meta').delete(id); }); }

  function toFile(doc) {
    const copy = XS.clone(doc);
    XS.Model.pruneAssets(copy);
    return new Blob([JSON.stringify(copy)], {type: 'application/json'});
  }

  XS.Store = {list, get, save, remove, toFile};
})(typeof window !== 'undefined' ? window : globalThis);
