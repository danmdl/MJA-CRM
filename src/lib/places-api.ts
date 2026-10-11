// Address suggestions via Places API (New) autocomplete. Replaces the
// Maps JavaScript AutocompleteService, which calls the legacy Places API
// that new Google Cloud projects can no longer enable.

export interface AddressSuggestion { description: string; place_id: string }

const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';

export async function fetchAddressSuggestions(opts: {
  apiKey: string;
  input: string;
  bias?: { lat: number; lng: number; radiusMeters: number } | null;
  sessionToken?: string;
  signal?: AbortSignal;
}): Promise<AddressSuggestion[]> {
  const body: Record<string, unknown> = {
    input: opts.input,
    includedRegionCodes: ['ar'],
    languageCode: 'es',
  };
  if (opts.bias) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.bias.lat, longitude: opts.bias.lng },
        // The API caps the bias radius at 50 km.
        radius: Math.min(opts.bias.radiusMeters, 50000),
      },
    };
  }
  if (opts.sessionToken) body.sessionToken = opts.sessionToken;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: opts.signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': opts.apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return (data.suggestions || [])
    .map((s: any) => s.placePrediction)
    .filter((p: any) => p?.placeId && p?.text?.text)
    .map((p: any) => ({ description: p.text.text as string, place_id: p.placeId as string }));
}
