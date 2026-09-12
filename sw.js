'use strict';
/* FitChecker service worker.
   Strategy: NETWORK-FIRST — always serve the freshest files when
   online, fall back to the cache only when offline. This prevents
   stale layouts/JS from being served after an update. */

const CACHE = 'fitcheck-v70';
const ASSETS = [
  '.',
  'index.html',
  'css/styles.css?v=65',
  'js/i18n.js?v=65',
  'js/storage.js?v=65',
  'js/auth.js?v=65',
  'js/fit-engine.js?v=65',
  'js/fit-feedback.js?v=65',
  'js/resale.js?v=65',
  'js/camera.js?v=65',
  'js/body-scan.js?v=65',
  'js/wardrobe.js?v=65',
  'js/cloud.js?v=65',
  'js/recs.js?v=65',
  'js/style-ai.js?v=65',
  'js/colour-ai.js?v=65',
  'js/monetize.js?v=65',
  'js/affiliate.js?v=65',
  'js/backup.js?v=65',
  'js/family.js?v=65',
  'js/ads.js?v=65',
  'js/app-config.js?v=65',
  'js/account.js?v=65',
  'js/capture.js?v=65',
  'js/remind.js?v=65',
  'js/brands.js?v=65',
  'js/returns.js?v=65',
  'js/sizecharts.js?v=65',
  'css/money.css?v=65',
  'js/analytics.js?v=65',
  'js/app.js?v=65',
  'manifest.json',
  'img/wardrobe.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'privacy.html',
  'terms.html',
  'delete-account.html'
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
