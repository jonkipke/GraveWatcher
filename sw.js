'use strict';

const CACHE_NAME = 'gravewatcher';

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
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first: bei Internetverbindung immer die aktuelle Version vom Server
// holen und den Cache damit auffrischen. Nur wenn das Netz fehlschlägt
// (offline), wird der zuletzt erfolgreich geladene Stand aus dem Cache
// bedient. So sind Änderungen sofort sichtbar, ohne eine Versionsnummer
// hochzählen zu müssen – und die App bleibt trotzdem offline nutzbar.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
