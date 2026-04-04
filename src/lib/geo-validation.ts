// Greater Buenos Aires bounding box
// Covers: San Martín, Villa Lynch, Ballester, Billinghurst, Caseros, Loma Hermosa, etc.
const GBA_BOUNDS = {
  minLat: -34.85,
  maxLat: -34.35,
  minLng: -58.85,
  maxLng: -58.25,
};

/**
 * Check if coordinates are within the Greater Buenos Aires area.
 * Returns false for coordinates that are clearly wrong (e.g., geocoded to Peru).
 */
export const isWithinGBA = (lat: number | null | undefined, lng: number | null | undefined): boolean => {
  if (lat == null || lng == null) return false;
  return lat >= GBA_BOUNDS.minLat && lat <= GBA_BOUNDS.maxLat && lng >= GBA_BOUNDS.minLng && lng <= GBA_BOUNDS.maxLng;
};

/**
 * Validate and sanitize coordinates. Returns null if outside GBA.
 */
export const validateCoords = (lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null => {
  if (lat == null || lng == null) return null;
  if (!isWithinGBA(lat, lng)) return null;
  return { lat, lng };
};

/**
 * Distance thresholds for proximity warnings
 */
export const DISTANCE_THRESHOLDS = {
  CLOSE: 1,      // < 1 km = green, great match
  MEDIUM: 3,     // 1-3 km = yellow, acceptable
  FAR: 5,        // 3-5 km = orange, needs review
  TOO_FAR: 10,   // > 5 km = red, likely wrong
};

/**
 * Get a color class based on distance
 */
export const getDistanceColor = (distKm: number): string => {
  if (distKm < DISTANCE_THRESHOLDS.CLOSE) return 'text-green-500';
  if (distKm < DISTANCE_THRESHOLDS.MEDIUM) return 'text-yellow-500';
  if (distKm < DISTANCE_THRESHOLDS.FAR) return 'text-orange-500';
  return 'text-red-500';
};

/**
 * Get a warning message if distance is suspicious
 */
export const getDistanceWarning = (distKm: number): string | null => {
  if (distKm >= DISTANCE_THRESHOLDS.TOO_FAR) return '⚠️ Muy lejos — verificar dirección';
  if (distKm >= DISTANCE_THRESHOLDS.FAR) return 'Distancia considerable';
  return null;
};
