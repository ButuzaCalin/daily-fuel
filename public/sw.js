const CACHE_NAME = 'daily-fuel-v3';
const APP_SHELL = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/apple-touch-icon.png'];
const IS_DEVELOPMENT = ['localhost', '127.0.0.1'].includes(self.location.hostname);

// The first visit loads its JS/CSS before this worker controls the page, so fetch the bundle
// referenced by index.html up front; otherwise the app would only work offline from the second visit.
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch('/', { cache: 'no-cache' });
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  await cache.put('/', response);
  await cache.addAll([...APP_SHELL, ...assets]);
}

self.addEventListener('install', (event) => {
  if (IS_DEVELOPMENT) return;
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  if (IS_DEVELOPMENT) {
    event.waitUntil(Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.registration.unregister(),
    ]));
    return;
  }
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (IS_DEVELOPMENT) return;
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
      }
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  // Only cache real files: never an error, and never the HTML fallback served in place of a missing asset.
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const isHtml = (response.headers.get('content-type') || '').includes('text/html');
    if (response.ok && !isHtml) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
