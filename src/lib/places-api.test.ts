import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAddressSuggestions } from './places-api';

afterEach(() => vi.unstubAllGlobals());

describe('fetchAddressSuggestions', () => {
  it('posts an Argentina-scoped request with the church bias and maps predictions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          { placePrediction: { placeId: 'p1', text: { text: 'Av. San Martín 1500, San Martín' } } },
          { queryPrediction: { text: { text: 'san martin' } } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchAddressSuggestions({
      apiKey: 'k', input: 'Av San Martin 15', bias: { lat: -34.57, lng: -58.53, radiusMeters: 80000 }, sessionToken: 's1',
    });
    expect(res).toEqual([{ description: 'Av. San Martín 1500, San Martín', place_id: 'p1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.headers['X-Goog-Api-Key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.includedRegionCodes).toEqual(['ar']);
    expect(body.locationBias.circle).toEqual({ center: { latitude: -34.57, longitude: -58.53 }, radius: 50000 });
    expect(body.sessionToken).toBe('s1');
  });

  it('surfaces API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: { message: 'Places API (New) has not been used in project 1' } }),
    }));
    await expect(fetchAddressSuggestions({ apiKey: 'k', input: 'abc' })).rejects.toThrow('Places API (New) has not been used');
  });
});
