// Shared Google Maps loader. Previously this function was copy-pasted
// in 4 different files (ContactMapDialog, AddressAutocomplete, MapaPage,
// TerritoriosPage). Centralizing it here:
//   1. Single source of truth — fix bugs once, not four times
//   2. Caches the promise so concurrent callers wait on the same load
//   3. Adds error handling that the originals lacked
//
// Returns the google.maps namespace (whatever's currently on
// window.google.maps after the script loads).

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// Cache the loading promise so multiple components calling this
// simultaneously don't each kick off their own script tag.
let loadPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  // Already loaded — return immediately.
  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google.maps);
  }

  // Load already in progress — share the same promise.
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Another component may have started the load via its own legacy
    // copy of this function. Watch for the script tag and poll until
    // google.maps appears.
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      const interval = setInterval(() => {
        if ((window as any).google?.maps) {
          clearInterval(interval);
          resolve((window as any).google.maps);
        }
      }, 100);
      // Safety timeout — if we never see google.maps after 30 seconds,
      // reject so the caller can show an error instead of hanging.
      setTimeout(() => {
        clearInterval(interval);
        if (!(window as any).google?.maps) {
          loadPromise = null;
          reject(new Error('Google Maps tardó demasiado en cargar.'));
        }
      }, 30000);
      return;
    }

    if (!GOOGLE_KEY) {
      loadPromise = null;
      reject(new Error('VITE_GOOGLE_MAPS_KEY no está configurada.'));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places,drawing,geometry`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    script.onerror = () => {
      loadPromise = null; // allow retry on next call
      reject(new Error('No se pudo cargar Google Maps.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
