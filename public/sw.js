const CACHE_NAME = 'mja-crm-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = request.url;
  // NEVER intercept: navigations, auth, APIs
  if (
    request.mode === 'navigate' ||
    url.includes('supabase.co') ||
    url.includes('googleapis.com') ||
    url.includes('maps.google') ||
    url.includes('/login') ||
    url.includes('type=invite') ||
    url.includes('type=signup') ||
    url.includes('type=recovery') ||
    url.includes('access_token') ||
    url.includes('refresh_token')
  ) return;

  // Only cache images, fonts, icons — NEVER cache JS or CSS (they have hashed filenames that change per deploy)
  const isSafeAsset = url.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/);
  if (!isSafeAsset) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
