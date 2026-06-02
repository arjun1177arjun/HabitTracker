const CACHE_NAME = 'habit-tracker-v3';
const ASSETS = [
  './',
  new Request('./index.html', { cache: 'reload' }),
  './manifest.json?v=2',
  './logo.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only intercept HTTP/HTTPS GET requests (ignore chrome-extension, etc.)
  if (!e.request.url.startsWith(self.location.origin) || e.request.method !== 'GET') {
    return;
  }

  const url = new URL(e.request.url);

  // Network-First strategy for index.html or root paths to prevent stale asset hashes
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.toLowerCase().includes('/habittracker/')) {
    // Specifically intercept if it targets the HTML shell
    if (!url.pathname.includes('.') || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
      e.respondWith(
        fetch(e.request)
          .then((response) => {
            // Update the cache with the fresh network response
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
            }
            return response;
          })
          .catch(() => {
            // If network fails, return cached version
            return caches.match(e.request);
          })
      );
      return;
    }
  }

  // Cache-First strategy for other assets (CSS, JS, images)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Not in cache, fetch from network
      return fetch(e.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache static built assets dynamically so they work offline
        if (url.pathname.includes('/assets/')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }

        return response;
      });
    })
  );
});

// Listener for background local reminders sent from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body } = event.data;
    self.registration.showNotification(title, {
      body: body,
      icon: './logo.svg',
      badge: './logo.svg',
      vibrate: [200, 100, 200],
      tag: 'habit-reminder',
      renotify: true
    });
  }
});
