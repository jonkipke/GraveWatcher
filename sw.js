'use strict';

// Bei jeder inhaltlichen Änderung an einer der unten gecachten Dateien
// muss diese Versionsnummer hochgezählt werden, sonst liefert der Cache
// weiterhin die alte Version aus.
const CACHE_VERSION = 'gravewatcher-v25';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/ui/plus.png',
  './icons/ui/minus.png',
  './icons/ui/menu.png',
  './icons/ui/close.png',
  './icons/ui/reset.png',
  './icons/ui/lock.png',
  './icons/ui/hex-frame.svg',
  './icons/types/creatures.png',
  './icons/types/artifacts.png',
  './icons/types/instants.png',
  './icons/types/sorcery.png',
  './icons/types/enchantment.png',
  './icons/types/land.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Cache-first: aus dem Cache bedienen, nur bei Fehlschlag ans Netz gehen.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    }),
  );
});
