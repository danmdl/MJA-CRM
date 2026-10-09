// Unregisters any leftover service worker and clears its caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
  if (window.caches) {
    caches.keys().then(function (names) {
      names.forEach(function (n) { caches.delete(n); });
    });
  }
}
