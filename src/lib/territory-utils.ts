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

/**
 * Best point to place a polygon's label: the "pole of inaccessibility",
 * the interior point farthest from every edge (Mapbox polylabel).
 * Unlike the average of the vertices, it always lands inside the shape
 * and isn't dragged toward edges that happen to have many vertices.
 * rings[0] is the outer ring; the rest are holes. Works in a local
 * equirectangular projection, accurate at city scale.
 */
export function polygonLabelPoint(
  rings: { lat: number; lng: number }[][],
  precisionMeters = 15,
): { lat: number; lng: number } | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const lat0 = outer.reduce((s, p) => s + p.lat, 0) / outer.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const toXY = (p: { lat: number; lng: number }): [number, number] => [p.lng * kx, p.lat];
  const polys = rings.map(r => r.map(toXY));
  const precision = precisionMeters / 111_320;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polys[0]) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  const back = ([x, y]: [number, number]) => ({ lat: y, lng: x / kx });
  if (cellSize === 0) return back(polys[0][0]);

  // Signed distance from (x, y) to the polygon outline: > 0 inside.
  const signedDist = (x: number, y: number): number => {
    let inside = false;
    let minSq = Infinity;
    for (const ring of polys) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[j];
        if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
        let px = bx, py = by;
        let dx = ax - bx, dy = ay - by;
        if (dx !== 0 || dy !== 0) {
          const t = ((x - bx) * dx + (y - by) * dy) / (dx * dx + dy * dy);
          if (t > 1) { px = ax; py = ay; } else if (t > 0) { px += dx * t; py += dy * t; }
        }
        dx = x - px; dy = y - py;
        const d = dx * dx + dy * dy;
        if (d < minSq) minSq = d;
      }
    }
    return (inside ? 1 : -1) * Math.sqrt(minSq);
  };

  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = signedDist(x, y);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  // Seed with the area centroid and the bbox center, keep the better one.
  let area = 0, cx = 0, cy = 0;
  const ring0 = polys[0];
  for (let i = 0, j = ring0.length - 1; i < ring0.length; j = i++) {
    const [ax, ay] = ring0[i];
    const [bx, by] = ring0[j];
    const f = ax * by - bx * ay;
    cx += (ax + bx) * f; cy += (ay + by) * f; area += f * 3;
  }
  const centroid = area === 0 ? cell(ring0[0][0], ring0[0][1], 0) : cell(cx / area, cy / area, 0);
  let best = centroid;
  const bboxCell = cell(minX + width / 2, minY + height / 2, 0);
  if (bboxCell.d > best.d) best = bboxCell;

  const queue: Cell[] = [];
  const h = cellSize / 2;
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) queue.push(cell(x + h, y + h, h));
  }
  // Small polygons and few cells: a linear scan for the best candidate
  // is plenty fast and keeps this dependency-free.
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    const c = queue.splice(bi, 1)[0];
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const ch = c.h / 2;
    queue.push(cell(c.x - ch, c.y - ch, ch), cell(c.x + ch, c.y - ch, ch), cell(c.x - ch, c.y + ch, ch), cell(c.x + ch, c.y + ch, ch));
  }
  // Long thin zones have many near-equal poles along their spine; the
  // centre of mass reads as "the middle" there, so prefer it whenever it
  // is inside and comfortably away from the edges.
  if (centroid.d >= best.d * 0.5) return back([centroid.x, centroid.y]);
  return back([best.x, best.y]);
}
