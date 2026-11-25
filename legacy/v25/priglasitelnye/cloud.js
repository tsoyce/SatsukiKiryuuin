(function (global) {
  'use strict';
  const DEFAULT_MAX_BYTES = 32 * 1024 * 1024, REQUEST_TIMEOUT_MS = 30000;
  let maxBytes = DEFAULT_MAX_BYTES, currentActor = '';
  const ACTIVITY_ACTIONS = ['export_image','export_zip','export_pdf','export_foil','export_blank_pdf','export_blank_png','guest_import','guest_export','gender_update','project_import','project_download','login','font_add','font_remove','template_upload','print_browser'];

  class CloudError extends Error {
    constructor(message, options = {}) {
      super(message); this.name = 'CloudError'; this.status = options.status || 0; this.code = options.code || 'unknown';
      if (Number.isInteger(options.revision)) this.revision = options.revision;
      if (typeof options.updatedAt === 'string') this.updatedAt = options.updatedAt;
    }
  }
  function available() { return /^https?:$/.test(global.location.protocol) && typeof global.fetch === 'function' && typeof global.AbortController === 'function'; }
  function normalizeCode(code, allowEmpty = false) {
    const value = String(code == null ? '' : code).trim(), length = Array.from(value).length;
    if ((!allowEmpty && length < 1) || length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw new CloudError('Введите код проекта: до 128 символов без переводов строк.', {code:'invalid_code'});
    return value;
  }
  function normalizeActor(actor) {
    const value = String(actor == null ? '' : actor).trim(), length = Array.from(value).length;
    if (length < 1 || length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new CloudError('Укажите имя или login: от 1 до 80 символов.', {code:'actor_required'});
    return value;
  }
  function setActor(actor) { currentActor = actor === '' ? '' : normalizeActor(actor); return currentActor; }
  function getActor() { return currentActor; }
  function projectId(id) {
    if (typeof id !== 'string' || !/^p_[a-f0-9]{32}$/.test(id)) throw new CloudError('Выберите проект из списка.', {code:'invalid_project_id'});
    return id;
  }
  function token(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value) || value.length > 2048) throw new CloudError('Откройте проект ещё раз, чтобы продолжить сеанс.', {code:'session_expired',status:401});
    return value;
  }
  function revision(value) {
    if (!Number.isInteger(value) || value < 1) throw new CloudError('Неизвестна версия проекта. Откройте его с сервера.', {code:'invalid_revision'});
    return value;
  }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function body(values) {
    let encoded;
    try { encoded = JSON.stringify({...values, actor:normalizeActor(currentActor)}); }
    catch (error) { if (error instanceof CloudError) throw error; throw new CloudError('В проекте есть данные, которые невозможно сохранить.', {code:'invalid_project'}); }
    if (new global.Blob([encoded]).size > maxBytes) throw new CloudError('Проект слишком большой для сервера. Уменьшите размер макета или удалите лишние шрифты.', {code:'too_large'});
    return encoded;
  }
  async function request(action, method = 'POST', values) {
    if (!available()) throw new CloudError('Серверное сохранение работает после загрузки сайта на хостинг с PHP.', {code:'unavailable'});
    const endpoint = new URL('api.php', global.location.href); endpoint.search = ''; endpoint.hash = ''; endpoint.searchParams.set('action',action);
    const encoded = method === 'POST' ? body(values || {}) : undefined;
    const controller = new global.AbortController(); let timedOut = false;
    const timer = global.setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const response = await global.fetch(endpoint.href, {method, headers:method === 'POST' ? {Accept:'application/json','Content-Type':'application/json'} : {Accept:'application/json'}, body:encoded,
        // no-referrer + same-origin-mode POST can produce Origin:null (Safari).
        cache:'no-store',credentials:'omit',mode:'same-origin',referrerPolicy:'same-origin',signal:controller.signal});
      const contentType = response.headers.get('content-type') || '';
      if (!/^application\/(?:[a-z0-9.-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)) throw new CloudError('Сервер не вернул ответ PHP. Проверьте api.php и поддержку PHP на хостинге.', {status:response.status,code:'invalid_response'});
      let result; try { result = await response.json(); } catch (_) { throw new CloudError('Сервер вернул некорректный ответ. Проверьте настройки PHP.', {status:response.status,code:'invalid_response'}); }
      if (!isObject(result)) throw new CloudError('Сервер вернул некорректный ответ.', {status:response.status,code:'invalid_response'});
      if (!response.ok || result.ok !== true) throw new CloudError(typeof result.error === 'string' && result.error.trim() ? result.error.slice(0,1000) : 'Не удалось выполнить запрос к серверу.',
        {status:response.status,code:typeof result.errorCode === 'string' ? result.errorCode : 'server_error',revision:result.revision,updatedAt:result.updatedAt});
      return result;
    } catch (error) {
      if (timedOut) throw new CloudError('Сервер не ответил за 30 секунд. Проверьте соединение и повторите попытку.', {code:'timeout'});
      if (error instanceof CloudError) throw error;
      throw new CloudError('Нет связи с сервером. Проверьте интернет и повторите попытку.', {code:'network'});
    } finally { global.clearTimeout(timer); }
  }
  function metadata(result, requireToken = true) {
    if (!isObject(result) || typeof result.id !== 'string' || !/^p_[a-f0-9]{32}$/.test(result.id) || typeof result.title !== 'string' || typeof result.protected !== 'boolean'
        || !Number.isInteger(result.revision) || result.revision < 1 || typeof result.updatedAt !== 'string' || !Number.isFinite(Date.parse(result.updatedAt))) throw new CloudError('Сервер вернул некорректные данные проекта.', {code:'invalid_response'});
    if (requireToken) { try { token(result.sessionToken); } catch (_) { throw new CloudError('Сервер вернул некорректный сеанс доступа.', {code:'invalid_response'}); } }
    return {id:result.id,projectId:result.id,title:result.title,protected:result.protected,revision:result.revision,updatedAt:result.updatedAt,...(requireToken ? {sessionToken:result.sessionToken} : {})};
  }
  async function probe() {
    if (!available()) return {available:false,reason:'local_file'};
    try {
      const result = await request('status','GET');
      if (result.available !== true || !Number.isInteger(result.maxBytes) || result.maxBytes < 1) throw new CloudError('Серверное сохранение недоступно.', {code:'invalid_response'});
      if (result.protocol !== 2 || result.auth !== 'project-session') throw new CloudError('Обновите api.php вместе с редактором: сервер использует предыдущую версию хранения проектов.', {code:'server_version'});
      maxBytes = Math.min(DEFAULT_MAX_BYTES,result.maxBytes); return {...result,available:true,maxBytes};
    } catch (error) { return {available:false,reason:error.code || 'unavailable',message:error.message,status:error.status || 0}; }
  }
  async function catalog() {
    const result = await request('catalog');
    if (!Array.isArray(result.projects) || result.projects.length > 10000) throw new CloudError('Сервер вернул некорректный список проектов.', {code:'invalid_response'});
    return {projects:result.projects.map(entry => metadata(entry,false))};
  }
  async function create(project, code = '') {
    if (!isObject(project)) throw new CloudError('Не удалось подготовить проект для сохранения.', {code:'invalid_project'});
    const chosen = normalizeCode(code,true), result = await request('create','POST',{project,code:chosen});
    if (result.code !== chosen) throw new CloudError('Некорректный ответ при создании проекта.', {code:'invalid_response'});
    return {...metadata(result),code:chosen};
  }
  async function load(id, code = '', sessionToken = '') {
    const result = await request('load','POST',{projectId:projectId(id),code:normalizeCode(code,true),...(sessionToken ? {sessionToken:token(sessionToken)} : {})});
    if (!isObject(result.project)) throw new CloudError('Сервер вернул некорректный проект.', {code:'invalid_response'});
    return {...metadata(result),project:result.project};
  }
  async function loadByCode(code) {
    const result = await request('load','POST',{code:normalizeCode(code)});
    if (!isObject(result.project)) throw new CloudError('Сервер вернул некорректный проект.', {code:'invalid_response'});
    return {...metadata(result),project:result.project};
  }
  async function save(id, project, expectedRevision, sessionToken) {
    if (!isObject(project)) throw new CloudError('Не удалось подготовить проект для сохранения.', {code:'invalid_project'});
    return metadata(await request('save','POST',{projectId:projectId(id),project,expectedRevision:revision(expectedRevision),sessionToken:token(sessionToken)}));
  }
  async function renameCode(id, newCode, expectedRevision, sessionToken) {
    const chosen = normalizeCode(newCode,true), result = await request('rename_code','POST',{projectId:projectId(id),newCode:chosen,expectedRevision:revision(expectedRevision),sessionToken:token(sessionToken)});
    if (result.code !== chosen) throw new CloudError('Некорректный ответ при смене кода.', {code:'invalid_response'});
    return {...metadata(result),code:chosen};
  }
  function events(result) {
    if (!Array.isArray(result.events) || result.events.length > 1000 || result.events.some(event => !isObject(event) || typeof event.id !== 'string' || typeof event.at !== 'string' || typeof event.actor !== 'string' || typeof event.action !== 'string' || typeof event.detail !== 'string')) throw new CloudError('Сервер вернул некорректный журнал действий.', {code:'invalid_response'});
    return {events:result.events};
  }
  async function history(id, sessionToken) { return events(await request('history','POST',{projectId:projectId(id),sessionToken:token(sessionToken)})); }
  async function siteHistory() { return events(await request('history','POST',{scope:'site'})); }
  async function activity(id, sessionToken, action, detail = '') {
    if (!ACTIVITY_ACTIONS.includes(action)) throw new CloudError('Неизвестный тип действия для журнала.', {code:'activity_action'});
    detail = Array.from(String(detail).replace(/[\u0000-\u001f\u007f]/g,' ')).slice(0,320).join('');
    const result = await request('activity','POST',{projectId:projectId(id),sessionToken:token(sessionToken),action,detail});
    return {event:result.event};
  }
  global.InviteCloud = Object.freeze({available,probe,setActor,getActor,normalizeActor,normalizeCode,catalog,create,load,loadByCode,save,renameCode,history,siteHistory,activity,CloudError});
})(window);
