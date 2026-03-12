/**
 * sw.js - Service Worker for 天達大班報到系統 PWA
 * Cache Strategy: Cache-first for static assets, network-only for API
 */

const CACHE_NAME = 'tianda-checkin-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/api.js',
  './js/state.js',
  './js/router.js',
  './js/app.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

// API URL - never cache
const API_DOMAINS = ['script.google.com', 'api.qrserver.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache API calls
  if (API_DOMAINS.some(d => url.includes(d))) {
    event.respondWith(fetch(event.request).catch(() => new Response('{"success":false,"error":"offline"}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // CDN resources (Tailwind, FontAwesome, Google Fonts) - stale-while-revalidate
  if (
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('tailwindcss.com') ||
    url.includes('unpkg.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // App HTML/JS/assets - cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
