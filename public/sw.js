// ─────────────────────────────────────────────
// SERVICE WORKER — offline app shell
//
// Goal: once a writer has opened Barsmith on a device at least once, the
// core writing-gym loop (word flashing, timer/BPM, Bar Pad, Vault, History)
// keeps working with zero connectivity. Dictionary/rhyme lookups still need
// a network and already degrade gracefully in the app code when offline —
// this worker deliberately does not touch those requests.
//
// Strategy, on purpose kept simple rather than pulling in a build-time
// precache plugin (Workbox etc.) for a small app with two dependencies:
//   - Navigations (the HTML shell): network-first, falling back to the
//     cached shell when offline. This means a writer online always gets
//     the latest deployed version; only an offline visit uses the cache.
//   - Same-origin static assets (hashed JS/CSS under /assets/, icons,
//     manifest): cache-first, refreshed in the background on every hit
//     (stale-while-revalidate). Vite's content-hashed filenames mean a
//     cached asset is either exactly right or superseded outright, so
//     serving the cached copy first is always safe.
//   - Everything cross-origin (dictionaryapi.dev, api.datamuse.com) or any
//     other-origin request: left completely alone, network only.
//
// Bump CACHE_VERSION on any release where you want to force old cached
// assets to be dropped (e.g. if a stale asset would actually break
// something rather than just be a version behind).
// ─────────────────────────────────────────────

const CACHE_VERSION = 'barsmith-shell-v1';
const SHELL_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept dictionary/rhyme API calls

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
