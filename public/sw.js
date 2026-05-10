// This service worker immediately unregisters itself.
// The MJA CRM main app does not use a service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister();
  caches.keys().then(names => names.forEach(n => caches.delete(n)));
  self.clients.claim();
});
