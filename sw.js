'use strict';
/* FitCheck service worker.
   Strategy: NETWORK-FIRST — always serve the freshest files when
   online, fall back to the cache only when offline. This prevents
   stale layouts/JS from being served after an update. */

const CACHE = 'fitcheck-v30';
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css?v=30',
  'js/i18n.js?v=30',
  'js/storage.js?v=30',
  'js/auth.js?v=30',
  'js/fit-engine.js?v=30',
  'js/camera.js?v=30',
  'js/recs.js?v=30',
  'js/style-ai.js?v=30',
  'js/colour-ai.js?v=30',
  'js/monetize.js?v=30',
  'js/analytics.js?v=30',
  'js/app.js?v=30',
  'manifest.json',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'privacy.html',
  'terms.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(
        // cache:'reload' bypasses the HTTP cache so we never seed
        // the new cache with stale copies
        ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // live API calls (size-guide reader) must never be cached or intercepted
  if (url.pathname.includes('/api/')) return;

  const sameOrigin = url.origin === location.origin;

  event.respondWith(
    // same-origin: force revalidation so updates land immediately
    fetch(sameOrigin ? new Request(event.request, { cache: 'no-cache' }) : event.request)
      .then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.mode === 'navigate' ? caches.match('index.html') : Promise.reject(new Error('offline')))
        )
      )
  );
});
