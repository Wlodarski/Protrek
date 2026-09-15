const CACHE_NAME = 'protrek-v1';
const STATIC_FILES = [
  './index.html',
  './manifest.json',
  './Scripts/main.js',
  './Scripts/app.js',
  './Scripts/calculation.js',
  './Scripts/api_key_storage.js',
  './Scripts/weather_client.js',
  './Scripts/protrek_forecast.json',
  './icons/protrek-192.svg',
  './icons/protrek-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      STATIC_FILES.map((file) => new URL(file, self.registration.scope).href)
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        const responseCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return networkResponse;
      });
    })
  );
});
