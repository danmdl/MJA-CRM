/**
 * Normalize a string for accent-insensitive, case-insensitive comparison.
 * Strips accents (á→a, ñ→n, ü→u, etc.), lowercases, and trims.
 * Use this for ALL search/filter operations in the app.
 */
export const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/**
 * Normalize a person's name (or any free-text identifier) for storage.
 * Strips accents, collapses whitespace, and Title-Cases each word.
 * Mirrors the SQL normalize_conector() function so client-side and DB-side
 * outputs agree — what you see in the input after blur is what ends up in
 * the table after the trigger runs.
 *
 * "guillermina" → "Guillermina"
 * "GUILLERMINA" → "Guillermina"
 * "Camila Próspero" → "Camila Prospero"
 * "  pamela  rodríguez  " → "Pamela Rodriguez"
 * "" → ""
 */
export const normalizeName = (s: string | null | undefined): string => {
  if (!s) return '';
  const stripped = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .map(w => w.length === 0 ? '' : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};
