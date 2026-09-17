const CACHE_NAME = 'protrek-v8';
const STATIC_FILES = [
  './index.html',
  './manifest.json',
  './script/main.js',
  './script/app.js',
  './script/calculation.js',
  './script/api_key_storage.js',
  './script/weather_client.js',
  './script/theme.js',
  './script/version.js',
  './icons/protrek-192.svg',
  './icons/protrek-512.svg'
];

const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(
        STATIC_FILES.map((file) => new URL(file, self.registration.scope).href)
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
            return networkResponse;
          }

          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match(INDEX_URL);
          });
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match(INDEX_URL);
          });
        })
    );
    return;
  }

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
      }).catch(() => {
        return Response.error();
      });
    })
  );
});