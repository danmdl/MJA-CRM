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
}

/**
 * Split an ordered list of (origin + stops) into Google Maps URLs.
 *
 * Input: the starting point + every contact stop in visit order.
 * Output: one URL per chunk. Chunks overlap by one point — the last
 * stop of chunk N is also the origin of chunk N+1 — so the user gets
 * a continuous route across the links.
 */
export function buildGoogleMapsChunks(allStops: Stop[]): string[] {
  if (allStops.length < 2) return [];
  const urls: string[] = [];
  let i = 0;
  while (i < allStops.length - 1) {
    const end = Math.min(i + MAX_STOPS_PER_LINK, allStops.length);
    const chunk = allStops.slice(i, end);
    const origin = `${chunk[0].lat},${chunk[0].lng}`;
    const last = chunk[chunk.length - 1];
    const destination = `${last.lat},${last.lng}`;
    const waypoints = chunk.slice(1, -1).map(s => `${s.lat},${s.lng}`).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    urls.push(url);
    // Next chunk starts where this one ended so the route is continuous.
    i = end - 1;
  }
  return urls;
}
