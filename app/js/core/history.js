/* XSatsu Студия · отмена и повтор (снимки документа без файлов-ассетов, чтобы не расходовать память). */
(function (global) {
  'use strict';
  const XS = global.XS;
  function create(limit = 60) {
    let past = [], future = [], lastKey = '', lastTime = 0;
    const snap = doc => JSON.stringify({...doc, assets: undefined});
    return {
      record(doc, mergeKey = '') {
        const now = Date.now();
        if (mergeKey && mergeKey === lastKey && now - lastTime < 1200) { lastTime = now; return; }
        past.push(snap(doc)); if (past.length > limit) past.shift();
        future = []; lastKey = mergeKey; lastTime = now;
      },
      undo(doc) { if (!past.length) return null; future.push(snap(doc)); lastKey = ''; return {...JSON.parse(past.pop()), assets: doc.assets}; },
      redo(doc) { if (!future.length) return null; past.push(snap(doc)); lastKey = ''; return {...JSON.parse(future.pop()), assets: doc.assets}; },
      clear() { past = []; future = []; lastKey = ''; },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; }
    };
  }
  XS.History = {create};
})(typeof window !== 'undefined' ? window : globalThis);
