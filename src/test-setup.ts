// Stub `window` so modules that probe for browser globals (e.g.
// territory-utils checking for window.google.maps) can run under node.
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {};
}
