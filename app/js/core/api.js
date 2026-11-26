/* XSatsu Студия · клиент API сервера (server/public/index.php → сайт/api/index.php?r=v1/...).
 * Без сервера Студия работает как раньше — только в браузере (XS.Api.available = false). */
(function (global) {
  'use strict';
  const XS = global.XS;
  const BASE = 'api/index.php?r=';
  const Api = {available: false, state: null, csrf: '', listeners: new Set()};

  class ApiError extends Error {
    constructor(status, data) { super((data && data.error) || ('Ошибка сервера (' + status + ').')); this.status = status; this.data = data || {}; }
  }
  Api.Error = ApiError;

  /* route: 'v1/projects/abc', query: {scope: 'shared'} */
  Api.url = (route, query) => BASE + route + (query ? '&' + new URLSearchParams(query).toString() : '');
  /* Сколько ждать ответа сервера: обычные запросы — 45 с, файлы — 3 мин. Без этого обрыв связи
   * (или прокси, который не закрывает ответ) оставлял Студию висеть на «Загружаем…» навсегда. */
  Api.TIMEOUT = 45000; Api.FILE_TIMEOUT = 180000;
  Api.call = async function (method, route, body, {query, raw, signal, timeout} = {}) {
    const headers = {};
    if (Api.csrf && method !== 'GET') headers['X-XS-CSRF'] = Api.csrf;
    let payload;
    if (raw) { payload = raw; headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let r;
    const ctl = new AbortController();
    const ms = timeout || (raw || /^v1\/assets\/[0-9a-f]{64}$/.test(route) ? Api.FILE_TIMEOUT : Api.TIMEOUT);
    const timer = setTimeout(() => ctl.abort('timeout'), ms);
    if (signal) signal.aborted ? ctl.abort(signal.reason) : signal.addEventListener('abort', () => ctl.abort(signal.reason), {once: true});
    const fail = e => {
      if (ctl.signal.aborted && ctl.signal.reason === 'timeout') { const err = new ApiError(0, {error: 'Сервер не ответил за ' + Math.round(ms / 1000) + ' с. Проверьте интернет и попробуйте ещё раз.'}); err.offline = true; err.timeout = true; return err; }
      if (signal?.aborted) return e;
      const err = new ApiError(0, {error: 'Нет связи с сервером.'}); err.offline = true; return err;
    };
    let data;
    try {
      try { r = await fetch(Api.url(route, query), {method, headers, body: payload, credentials: 'same-origin', signal: ctl.signal}); }
      catch (e) { throw fail(e); }
      const type = r.headers.get('content-type') || '';
      if (!type.includes('json')) {
        if (!r.ok) throw new ApiError(r.status, {error: r.status === 404 ? 'Сервер Студии не установлен.' : 'Ошибка сервера (' + r.status + ').'});
        let buf;
        try { buf = await r.arrayBuffer(); } catch (e) { throw fail(e); }
        return {bytes: new Uint8Array(buf), mime: r.headers.get('x-xs-mime') || 'application/octet-stream'};
      }
      try { data = await r.json(); }
      catch (e) { if (ctl.signal.aborted) throw fail(e); throw new ApiError(r.status, {error: 'Сервер прислал повреждённый ответ (' + r.status + ').'}); }
    } finally { clearTimeout(timer); }
    if (!r.ok) throw new ApiError(r.status, data);
    if (data && typeof data === 'object' && 'csrf' in data && 'user' in data) setState(data);
    return data;
  };
  function setState(state) {
    Api.state = state; Api.csrf = state.csrf || ''; Api.available = true;
    for (const fn of Api.listeners) try { fn(state); } catch (e) { console.error(e); }
  }
  Api.user = () => Api.state?.user || null;
  Api.onChange = fn => Api.listeners.add(fn);
  /* Первый запрос: есть ли сервер и кто вошёл. */
  Api.init = async () => {
    if (location.protocol === 'file:') return null;
    try { return await Api.call('GET', 'v1/auth/state'); }
    catch (e) { Api.available = false; return null; }
  };
  Api.logout = async () => { await Api.call('POST', 'v1/auth/logout'); setState({...Api.state, user: null, csrf: null}); };

  /* SHA-256 файла (hex). */
  Api.sha256 = async bytes => {
    const buf = await global.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };

  XS.Api = Api;
})(typeof window !== 'undefined' ? window : globalThis);
