// ═══════════════════════════════════
// Service Worker — Offline Support
// Cache-first for app shell
// ═══════════════════════════════════

const CACHE_NAME = 'learn-my-students-v3';

const PRECACHE_URLS = [
  '/app/',
  '/app/index.html',
  '/app/css/styles.css',
  '/app/js/app.js',
  '/app/js/db.js',
  '/app/js/fsrs.js',
  '/app/js/scheduler.js',
  '/app/js/quiz.js',
  '/app/js/import.js',
  '/app/js/matching.js',
  '/app/js/speech.js',
  '/app/js/stats.js',
  '/app/js/ui.js',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
];

// Install: precache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for same-origin, network-first for CDN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // CDN resources (Dexie, JSZip): network-first with cache fallback
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Same-origin: cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
  );
});
