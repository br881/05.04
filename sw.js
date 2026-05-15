// sw.js — network-first with offline fallback
// Fixes 404 in Safari PWA standalone mode caused by cache-key mismatch on start_url
const CACHE = 'habits-v2';

// We only pre-cache the shell — relative paths so they match regardless of origin
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // addAll with relative paths — avoids absolute-path cache-key mismatch
      return Promise.allSettled(SHELL.map(url => c.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first strategy:
  // 1. Try the network
  // 2. On failure (offline / 404 / error) → serve from cache
  // 3. If cache also misses for navigation requests → serve index.html (SPA fallback)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // SPA fallback: for navigation requests serve index.html
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
