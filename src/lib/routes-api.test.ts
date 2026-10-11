import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeRoute, decodePolyline } from './routes-api';

afterEach(() => vi.unstubAllGlobals());

describe('decodePolyline', () => {
  it('decodes the reference example from Google docs', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
  it('handles an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('computeRoute', () => {
  const okResponse = (route: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ routes: [route] }) });

  it('sends an optimized DRIVE request and maps the response', async () => {
    const fetchMock = okResponse({
      optimizedIntermediateWaypointIndex: [1, 0],
      distanceMeters: 4200,
      duration: '660s',
      polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
      legs: [{ distanceMeters: 1000, duration: '120s' }, { distanceMeters: 3200, duration: '540s' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await computeRoute({
      apiKey: 'k',
      origin: { lat: -34.57, lng: -58.53 },
      destination: { lat: -34.6, lng: -58.5 },
      intermediates: [{ lat: -34.58, lng: -58.54 }, { lat: -34.59, lng: -58.55 }],
      optimizeOrder: true,
    });
    expect(r.order).toEqual([1, 0]);
    expect(r.totalMeters).toBe(4200);
    expect(r.totalSeconds).toBe(660);
    expect(r.legs).toEqual([{ distanceMeters: 1000, durationSeconds: 120 }, { distanceMeters: 3200, durationSeconds: 540 }]);
    expect(r.path).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.headers['X-Goog-Api-Key']).toBe('k');
    expect(init.headers['X-Goog-FieldMask']).toContain('routes.optimizedIntermediateWaypointIndex');
    const body = JSON.parse(init.body);
    expect(body.travelMode).toBe('DRIVE');
    expect(body.optimizeWaypointOrder).toBe(true);
    expect(body.intermediates[0]).toEqual({ location: { latLng: { latitude: -34.58, longitude: -58.54 } } });
  });

  it('keeps the given order when not optimizing', async () => {
    vi.stubGlobal('fetch', okResponse({ legs: [], polyline: {} }));
    const r = await computeRoute({
      apiKey: 'k', origin: { lat: 0, lng: 0 }, destination: { lat: 1, lng: 1 },
      intermediates: [{ lat: 0.1, lng: 0.1 }, { lat: 0.2, lng: 0.2 }, { lat: 0.3, lng: 0.3 }],
    });
    expect(r.order).toEqual([0, 1, 2]);
  });

  it('surfaces the API error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: { message: 'Routes API has not been used in project 123' } }),
    }));
    await expect(computeRoute({ apiKey: 'k', origin: { lat: 0, lng: 0 }, destination: { lat: 1, lng: 1 } }))
      .rejects.toThrow('Routes API has not been used in project 123');
  });
});
