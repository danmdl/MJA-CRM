/**
 * Normalize a string for accent-insensitive, case-insensitive comparison.
 * Strips accents (á→a, ñ→n, ü→u, etc.), lowercases, and trims.
 * Use this for ALL search/filter operations in the app.
 */
export const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
