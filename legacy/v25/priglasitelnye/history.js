(function () {
  'use strict';

  // Callers own snapshot creation. Keep immutable snapshot references so image
  // and font strings can be shared across edits instead of copied each time.
  function create(options = {}) {
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(500, options.limit)) : 40;
    const mergeWindow = Number.isFinite(options.mergeWindow) ? Math.max(0, options.mergeWindow) : 700;
    let entries = [], cursor = -1, lastMergeKey = '', lastTime = -Infinity;

    function breakMerge() { lastMergeKey = ''; lastTime = -Infinity; }
    function reset(snapshot, {signature} = {}) {
      entries = [{snapshot, signature}]; cursor = 0; breakMerge();
      return snapshot;
    }
    function current() { return cursor < 0 ? null : entries[cursor].snapshot; }
    function record(snapshot, {mergeKey = '', signature, time = Date.now()} = {}) {
      if (cursor < 0) { reset(snapshot, {signature}); return true; }
      const currentEntry = entries[cursor];
      if (currentEntry.snapshot === snapshot || (signature !== undefined && currentEntry.signature === signature)) return false;
      const atEnd = cursor === entries.length - 1;
      const canMerge = atEnd && cursor > 0 && mergeKey && mergeKey === lastMergeKey && Number.isFinite(time) && time >= lastTime && time - lastTime <= mergeWindow;
      if (canMerge) entries[cursor] = {snapshot, signature};
      else {
        entries.length = cursor + 1;
        entries.push({snapshot, signature}); cursor += 1;
        if (entries.length > limit + 1) { entries.shift(); cursor -= 1; }
      }
      lastMergeKey = String(mergeKey || ''); lastTime = Number.isFinite(time) ? time : -Infinity;
      return true;
    }
    function undo() {
      if (cursor <= 0) return null;
      cursor -= 1; breakMerge(); return entries[cursor].snapshot;
    }
    function redo() {
      if (cursor >= entries.length - 1) return null;
      cursor += 1; breakMerge(); return entries[cursor].snapshot;
    }
    return Object.freeze({
      reset, record, current, undo, redo, breakMerge,
      get canUndo() { return cursor > 0; },
      get canRedo() { return cursor >= 0 && cursor < entries.length - 1; }
    });
  }

  window.InviteHistory = Object.freeze({create});
})();
