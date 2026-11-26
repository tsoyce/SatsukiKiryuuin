/* XSatsu Студия · service worker: Студия открывается без сети после первого визита.
 * Страница — «сначала сеть» (свежая версия, без сети — из кэша); скрипты, стили, шрифты, картинки шаблонов —
 * «из кэша, обновляя в фоне». API (/api/) не кэшируется никогда. Новая версия — новое имя кэша. */
const CACHE = 'xsatsu-v4.3';
const SHELL = ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('xsatsu-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    // cache: 'no-cache' — страницу всегда сверяем с сервером, даже если хостинг разрешил браузеру её кэшировать.
    e.respondWith(fetch(new Request(req, {cache: 'no-cache'})).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
