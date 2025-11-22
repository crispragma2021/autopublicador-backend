const CACHE_NAME = 'social-ai-v4-custom-domain';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.map((name) => name !== CACHE_NAME ? caches.delete(name) : null)
  )));
});

self.addEventListener('fetch', (event) => {
  // IMPORTANTE: No cachear llamadas a tu propio backend en la nube
  if (event.request.url.includes('cloudfunctions.net') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('facebook.com')) {
      return;
  }
  event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});
