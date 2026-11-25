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
  Api.call = async function (method, route, body, {query, raw, signal} = {}) {
    const headers = {};
    if (Api.csrf && method !== 'GET') headers['X-XS-CSRF'] = Api.csrf;
    let payload;
    if (raw) { payload = raw; headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let r;
    try { r = await fetch(Api.url(route, query), {method, headers, body: payload, credentials: 'same-origin', signal}); }
    catch (e) { const err = new ApiError(0, {error: 'Нет связи с сервером.'}); err.offline = true; throw err; }
    const type = r.headers.get('content-type') || '';
    if (!type.includes('json')) {
      if (!r.ok) throw new ApiError(r.status, {error: r.status === 404 ? 'Сервер Студии не установлен.' : 'Ошибка сервера (' + r.status + ').'});
      return {bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('x-xs-mime') || 'application/octet-stream'};
    }
    const data = await r.json();
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
