// Shared Google Maps loader. Previously this function was copy-pasted
// in 4 different files (ContactMapDialog, AddressAutocomplete, MapaPage,
// TerritoriosPage). Centralizing it here:
//   1. Single source of truth — fix bugs once, not four times
//   2. Caches the promise so concurrent callers wait on the same load
//   3. Adds error handling that the originals lacked
//
// Returns the google.maps namespace (whatever's currently on
// window.google.maps after the script loads).

import { showError } from '@/utils/toast';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// Cache the loading promise so multiple components calling this
// simultaneously don't each kick off their own script tag.
let loadPromise: Promise<any> | null = null;

// Flag flipped by Google's `gm_authFailure` global callback. The JS
// bundle itself downloads fine (so script.onerror never fires), but
// Google then rejects the key at runtime for things like billing off,
// referrer not whitelisted, APIs not enabled, or quota exceeded. Without
// hooking this, the user sees nothing — just a broken map with Google's
// own 'This page can't load Google Maps correctly' modal buried inside
// the map div. We surface it as a toast so Dan knows WHERE to go fix it.
let authFailed = false;
export function hasGoogleMapsAuthFailed(): boolean { return authFailed; }

if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    authFailed = true;
    showError(
      'Google Maps rechazó la clave (revisá billing, dominios habilitados y APIs activas en Google Cloud Console).',
    );
  };
}

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
        if (authFailed) {
          clearInterval(interval);
          loadPromise = null;
          reject(new Error('Google Maps rechazó la clave.'));
          return;
        }
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
    script.onload = () => {
      // gm_authFailure usually fires AFTER onload — so wait a tick
      // before resolving, otherwise we'd hand back a maps namespace
      // that's about to be marked invalid.
      setTimeout(() => {
        if (authFailed) {
          loadPromise = null;
          reject(new Error('Google Maps rechazó la clave.'));
        } else {
          resolve((window as any).google.maps);
        }
      }, 150);
    };
    script.onerror = () => {
      loadPromise = null; // allow retry on next call
      reject(new Error('No se pudo cargar Google Maps.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
