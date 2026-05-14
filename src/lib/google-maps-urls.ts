// Build Google Maps directions URLs for a multi-stop route.
//
// Google Maps' web "dir" URL accepts at most ~10 stops total (origin +
// destination + ~9 waypoints). Beyond that the page either drops
// waypoints silently or refuses to compute. For long routes we have to
// hand the user multiple links — each link covers a chunk, and the last
// point of one chunk becomes the first point of the next so following
// them in order traces the full route without gaps.
//
// MAX_STOPS_PER_LINK is the count of stops in a single link, INCLUDING
// the origin and destination of that link. 10 is conservative (Google's
// documented limit hovers between 9 and 10 depending on the path).

export const MAX_STOPS_PER_LINK = 10;

export interface Stop {
  lat: number;
  lng: number;
  /**
   * Optional human-readable address. When set, the Google Maps URL
   * uses the address text instead of `lat,lng` for origin / destination
   * / waypoints.
   *
   * Why this exists: passing only `lat,lng` makes the Google Maps app
   * on iOS render every input box as the literal text "Marcador"
   * instead of the address. Android resolves the coordinates to an
   * address in the UI, iOS doesn't. Passing the address string makes
   * iOS show the address the user expects. Google still geocodes the
   * address on its side — the addresses came from Google's
   * autocomplete in our app, so the geocode is reliable enough.
   */
  address?: string | null;
}

/**
 * Inclusive 1-indexed range of stops to render on the map.
 * Used by the route viewer's "show range" buttons so the user can focus
 * on a segment of a long route without earlier path overlap.
 */
export interface StopRange { from: number; to: number; }

/**
 * Build display ranges for a route with `total` stops, anchored at
 * multiples of 5 with a 1-stop overlap between consecutive ranges:
 *
 *   17 stops → [1-5], [5-10], [10-15], [15-17]
 *   12 stops → [1-5], [5-10], [10-12]
 *   20 stops → [1-5], [5-10], [10-15], [15-20]
 *
 * Returns an empty array when the route is short enough (≤ 5 stops)
 * that no segmentation is needed.
 */
export function makeStopRanges(total: number): StopRange[] {
  if (total <= 5) return [];
  const anchors: number[] = [1];
  let v = 5;
  while (v < total) {
    anchors.push(v);
    v += 5;
  }
  anchors.push(total);
  const ranges: StopRange[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    ranges.push({ from: anchors[i], to: anchors[i + 1] });
  }
  return ranges;
}

/**
 * Split an ordered list of (origin + stops) into Google Maps URLs.
 *
 * Input: the starting point + every contact stop in visit order.
 * Output: one URL per chunk. Chunks overlap by one point — the last
 * stop of chunk N is also the origin of chunk N+1 — so the user gets
 * a continuous route across the links.
 */
/**
 * Cheap iOS detection — iPhone / iPad / iPod identify themselves
 * explicitly, plus the iPad-on-iPadOS edge case where the UA reads
 * 'Macintosh' but the device has touch (maxTouchPoints > 0).
 *
 * Why we care: iOS Google Maps renders `lat,lng` waypoints as the
 * literal text 'Marcador' in its input boxes; Android resolves them
 * to addresses. Passing the address text fixes the iOS display BUT
 * breaks Android's route (Android's Maps app does its own geocoding
 * when launched with an address and lands on a different point). So
 * we use lat,lng on Android and address-text on iOS.
 */
const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
};

const stopParam = (s: Stop, preferAddress: boolean): string => {
  if (preferAddress && s.address && s.address.trim()) return s.address.trim();
  return `${s.lat},${s.lng}`;
};

export interface BuildOptions {
  /**
   * Force address-preferred mode. When omitted, the function auto-
   * detects iOS via the user-agent and uses addresses there only.
   * Exposed so tests can pin behavior without faking navigator.
   */
  preferAddress?: boolean;
}

export function buildGoogleMapsChunks(allStops: Stop[], opts: BuildOptions = {}): string[] {
  if (allStops.length < 2) return [];
  const preferAddress = opts.preferAddress ?? isIOS();
  const urls: string[] = [];
  let i = 0;
  while (i < allStops.length - 1) {
    const end = Math.min(i + MAX_STOPS_PER_LINK, allStops.length);
    const chunk = allStops.slice(i, end);
    const origin = stopParam(chunk[0], preferAddress);
    const last = chunk[chunk.length - 1];
    const destination = stopParam(last, preferAddress);
    const waypoints = chunk.slice(1, -1).map(s => stopParam(s, preferAddress)).join('|');
    let url = `https://www.google.com/maps/dir/?api=1`
      + `&origin=${encodeURIComponent(origin)}`
      + `&destination=${encodeURIComponent(destination)}`
      + `&travelmode=driving`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    urls.push(url);
    // Next chunk starts where this one ended so the route is continuous.
    i = end - 1;
  }
  return urls;
}
