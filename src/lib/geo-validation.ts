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
  CLOSE: 2,      // < 2 km = green
  FAR: 5,        // 2-5 km = orange
  TOO_FAR: 5,    // > 5 km = red
};

/**
 * Get a color class based on distance
 */
export const getDistanceColor = (distKm: number): string => {
  if (distKm < DISTANCE_THRESHOLDS.CLOSE) return 'text-green-500';
  if (distKm < DISTANCE_THRESHOLDS.FAR) return 'text-orange-500';
  return 'text-red-500';
};

/**
 * Get badge color class based on distance (for the cell name badge + zona)
 */
export const getDistanceBadgeClass = (distKm: number): string => {
  if (distKm < DISTANCE_THRESHOLDS.CLOSE) return 'bg-green-500/15 text-green-500 hover:bg-green-500/15';
  if (distKm < DISTANCE_THRESHOLDS.FAR) return 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15';
  return 'bg-red-500/15 text-red-500 hover:bg-red-500/15';
};

/**
 * Get a warning message if distance is suspicious
 */
export const getDistanceWarning = (distKm: number): string | null => {
  if (distKm >= DISTANCE_THRESHOLDS.TOO_FAR) return '⚠️ Muy lejos — verificar dirección';
  return null;
};
