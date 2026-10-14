/* one: service worker. Makes the installed app open offline.
   - the page itself (/one/): network first (so updates arrive), the last copy when offline
   - the site's shared scripts, fonts and the Firebase modules: served from the cache, refreshed in the background
   - everything else (the file server, the AI worker, sign-in) goes straight to the network */
const VERSION = 'one-v1';
const SHELL = VERSION + '-shell', RUNTIME = VERSION + '-runtime';
const CDNS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/one/', '/one/manifest.json', '/one/icons/icon-192.png', '/one/icons/icon-512.png'].map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = async (req, cacheName, key) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 5000))]);
    if (res && res.ok) cache.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key || req, { ignoreSearch:true });
    if (hit) return hit;
    throw err;
  }
};
const staleWhileRevalidate = async (req, cacheName) => {
  const cache = await caches.open(cacheName), hit = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || Response.error();
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' && url.pathname.startsWith('/one/')) return e.respondWith(networkFirst(req, SHELL, '/one/'));
    if (url.pathname.startsWith('/shared/') || url.pathname.startsWith('/one/icons/') || url.pathname === '/one/manifest.json') return e.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }
  if (CDNS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(req, RUNTIME));
});
