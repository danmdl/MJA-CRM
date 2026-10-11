// Driving routes via the Routes API (computeRoutes). Replaces the Maps
// JavaScript DirectionsService, which calls the legacy Directions API:
// Google no longer lets new projects enable it, and the current Maps key
// lives in a new project.

export interface LatLng { lat: number; lng: number }

export interface ComputedRoute {
  /** Visit order of `intermediates` (indexes into the array passed in). */
  order: number[];
  /** Full road path, ready for a google.maps.Polyline. */
  path: LatLng[];
  totalMeters: number;
  totalSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.optimizedIntermediateWaypointIndex',
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.distanceMeters',
  'routes.legs.duration',
].join(',');

/** Decodes Google's encoded polyline format (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// Durations come back as protobuf strings like "1234s" or "12.5s".
const parseSeconds = (d: string | undefined): number => (d ? Math.round(parseFloat(d)) : 0);

const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export async function computeRoute(opts: {
  apiKey: string;
  origin: LatLng;
  destination: LatLng;
  intermediates?: LatLng[];
  optimizeOrder?: boolean;
  signal?: AbortSignal;
}): Promise<ComputedRoute> {
  const intermediates = opts.intermediates ?? [];
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': opts.apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: waypoint(opts.origin),
      destination: waypoint(opts.destination),
      intermediates: intermediates.map(waypoint),
      travelMode: 'DRIVE',
      optimizeWaypointOrder: !!opts.optimizeOrder && intermediates.length > 1,
      regionCode: 'AR',
      languageCode: 'es-419',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  const route = body?.routes?.[0];
  if (!route) throw new Error('No se encontró una ruta para esas paradas.');

  const identity = intermediates.map((_, i) => i);
  const optimized: number[] | undefined = route.optimizedIntermediateWaypointIndex;
  const order = optimized && optimized.length === intermediates.length && optimized.every(i => i >= 0)
    ? optimized
    : identity;

  const legs = (route.legs || []).map((l: any) => ({
    distanceMeters: l.distanceMeters || 0,
    durationSeconds: parseSeconds(l.duration),
  }));
  return {
    order,
    path: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
    totalMeters: route.distanceMeters ?? legs.reduce((s: number, l: { distanceMeters: number }) => s + l.distanceMeters, 0),
    totalSeconds: route.duration ? parseSeconds(route.duration) : legs.reduce((s: number, l: { durationSeconds: number }) => s + l.durationSeconds, 0),
    legs,
  };
}
