/**
 * Cuerda territory utilities. PostGIS stores polygons as
 * geography(Polygon, 4326). The DB returns them as GeoJSON
 * via ST_AsGeoJSON in our queries; this module converts that
 * GeoJSON into google.maps.LatLng[] for rendering and runs
 * point-in-polygon for in/out classification.
 *
 * Why client-side classification? The semillero page has hundreds
 * of contacts and dozens of cells; recomputing in/out on every
 * filter change should be instant. With the polygons + cells
 * already in memory, a containsLocation call per cell is O(n)
 * with no network. Server-side ST_Within would be faster per
 * call but slower across the board with the round-trip.
 */

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][]; // [ring][point][lng, lat]
};

/**
 * Convert a GeoJSON Polygon (the format ST_AsGeoJSON returns)
 * into the google.maps Polygon paths format. GeoJSON uses
 * [lng, lat] order; google.maps expects {lat, lng} objects.
 *
 * Returns null on malformed input so callers can skip cleanly.
 */
export function geoJsonToGooglePaths(
  geojson: GeoJsonPolygon | string | null | undefined,
): { lat: number; lng: number }[][] | null {
  if (!geojson) return null;
  let parsed: GeoJsonPolygon;
  try {
    parsed = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
  } catch {
    return null;
  }
  if (!parsed || parsed.type !== 'Polygon' || !Array.isArray(parsed.coordinates)) return null;
  const paths: { lat: number; lng: number }[][] = [];
  for (const ring of parsed.coordinates) {
    if (!Array.isArray(ring)) continue;
    const path: { lat: number; lng: number }[] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const [lng, lat] = pt;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      path.push({ lat, lng });
    }
    if (path.length > 0) paths.push(path);
  }
  return paths.length > 0 ? paths : null;
}

/**
 * Convert google.maps Polygon paths back to GeoJSON Polygon for
 * sending to the database. GeoJSON requires the outer ring to be
 * closed (first point == last point). We add the closing point if
 * the user's drawing doesn't include it.
 */
export function googlePathsToGeoJson(
  paths: { lat: number; lng: number }[][],
): GeoJsonPolygon | null {
  if (!paths || paths.length === 0) return null;
  const rings: [number, number][][] = [];
  for (const path of paths) {
    if (path.length < 3) continue; // a polygon ring needs at least 3 distinct points
    const ring: [number, number][] = path.map(p => [p.lng, p.lat] as [number, number]);
    // Close the ring if not already closed
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
    rings.push(ring);
  }
  if (rings.length === 0) return null;
  return { type: 'Polygon', coordinates: rings };
}

/**
 * Point-in-polygon check using google.maps.geometry. Returns true
 * if the lat/lng falls inside the polygon (or any of its rings —
 * holes are not currently supported in the schema, single ring
 * polygons only).
 *
 * Caller must ensure google.maps and the geometry library are
 * loaded before calling. Returns false on missing/invalid inputs.
 */
export function isPointInTerritory(
  lat: number | null | undefined,
  lng: number | null | undefined,
  paths: { lat: number; lng: number }[][] | null,
): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!paths || paths.length === 0) return false;
  const g = (window as any).google;
  if (g?.maps?.geometry?.poly) {
    const polygon = new g.maps.Polygon({ paths });
    return g.maps.geometry.poly.containsLocation(new g.maps.LatLng(lat, lng), polygon);
  }
  // Fallback: pure-JS ray casting. Used when Google Maps isn't loaded
  // (e.g. Semillero, where we just need the in/out classification but
  // don't render a map). Standard algorithm; works fine for the
  // sub-city scale polygons we deal with (no antimeridian issues, no
  // very-near-pole edge cases).
  return paths.some(ring => pointInRing(lat, lng, ring));
}

/**
 * Ray-casting point-in-polygon. Returns true if (lat, lng) is inside
 * the closed ring. Treats the ring as if its first/last point are
 * the same (the typical GeoJSON convention).
 */
function pointInRing(
  lat: number,
  lng: number,
  ring: { lat: number; lng: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Classification result for a cell relative to a cuerda's territory.
 *
 *   'in'         — inside the polygon
 *   'out'        — outside the polygon
 *   'no-coords'  — the cell has no lat/lng yet (can't classify)
 *   'no-territory' — the cuerda hasn't drawn a territory; caller
 *                    should fall back to distance-based labelling
 */
export type TerritoryClassification = 'in' | 'out' | 'no-coords' | 'no-territory';

export function classifyAgainstTerritory(
  lat: number | null | undefined,
  lng: number | null | undefined,
  territoryPaths: { lat: number; lng: number }[][] | null,
): TerritoryClassification {
  if (!territoryPaths) return 'no-territory';
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'no-coords';
  return isPointInTerritory(lat, lng, territoryPaths) ? 'in' : 'out';
}
