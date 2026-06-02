const CACHE_NAME = 'habit-tracker-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.svg',
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
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).catch(() => {
        // Fallback for API calls or non-cached pages when offline
        return new Response(JSON.stringify({ error: "Offline" }), {
          headers: { 'Content-Type': 'application/json' }
        });
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
      icon: '/logo.svg',
      badge: '/logo.svg',
      vibrate: [200, 100, 200],
      tag: 'habit-reminder',
      renotify: true
    });
  }
});
