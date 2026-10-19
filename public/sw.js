/* Silly Songs 1.0.0
   Network first (cache: no-store), then the cache for this version.
   The page reloads at most once when a new worker takes control. */

const VERSION = '1.0.0';
const CACHE = `silly-songs-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon.ico',
  './fonts/fredoka-latin-500.woff2',
  './fonts/fredoka-latin-600.woff2',
  './fonts/patrick-hand-latin-400.woff2',
  './fonts/fraunces-latin-600.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const response = await fetch(new URL(url, self.location).href, { cache: 'no-store' });
        if (response.ok) await cache.put(url, response);
      } catch (err) {
        /* A missing file must not trap the worker on install. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(request.url, { cache: 'no-store', credentials: 'same-origin' })
        .catch(() => caches.match('./version.json'))
    );
    return;
  }

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request.url, { cache: 'no-store', credentials: 'same-origin' });
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request.url, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(request) || await caches.match(request.url);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await caches.match('./index.html') || await caches.match('./');
        if (home) return home;
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
