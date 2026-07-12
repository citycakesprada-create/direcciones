const CACHE_NAME = 'bogozonas-cache-v1';
const ASSETS_TO_CACHE = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache new successful requests dynamically
        if (event.request.url.startsWith('http') && response.status === 200) {
          const urlObj = new URL(event.request.url);
          // Only cache specific safe domains to avoid clogging cache
          if (urlObj.host.includes('unpkg.com') || urlObj.host.includes('jsdelivr.net') || urlObj.host.includes('googleapis.com') || urlObj.host.includes('gstatic.com')) {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
              return response;
            });
          }
        }
        return response;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('index.html');
      }
    })
  );
});
