// App-shell service worker. Two strategies:
//   - Navigations (the HTML shell) are network-first: a new deploy — and the
//     fresh content-hashed asset URLs its index.html points at — is always
//     picked up when online, with the cached shell as the offline fallback.
//   - Every other same-origin GET (Vite's /assets/* bundles, icons, manifest)
//     is cache-first: those URLs change whenever their content does, so a
//     cached copy is never stale.
// A cache-first shell (the previous version) froze the installed PWA on its
// first-cached build forever — the static cache name meant `activate` never
// evicted it. Bump CACHE whenever this logic changes to purge old entries.
const CACHE = 'swu-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-180.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations: always try the network so new builds load,
  // and keep the cached shell fresh for offline use.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(async () => (await caches.match('/', { ignoreSearch: true })) ?? Response.error()),
    );
    return;
  }

  // Cache-first for content-hashed assets, icons and the manifest.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => Response.error());
    }),
  );
});
