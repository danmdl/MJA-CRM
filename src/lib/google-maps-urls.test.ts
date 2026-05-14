import { describe, it, expect } from 'vitest';
import { buildGoogleMapsChunks, makeStopRanges, MAX_STOPS_PER_LINK } from './google-maps-urls';

const stop = (n: number) => ({ lat: -34 - n * 0.001, lng: -58 - n * 0.001 });

describe('buildGoogleMapsChunks', () => {
  it('returns one URL when there are 10 or fewer stops', () => {
    const stops = Array.from({ length: 10 }, (_, i) => stop(i));
    const urls = buildGoogleMapsChunks(stops);
    expect(urls).toHaveLength(1);
    // The comma in `lat,lng` is URL-encoded as %2C since we
    // encodeURIComponent the value before substituting.
    expect(decodeURIComponent(urls[0].match(/origin=([^&]+)/)![1])).toBe('-34,-58');
    // 8 waypoints between origin and destination.
    const wpCount = (decodeURIComponent(urls[0].match(/waypoints=([^&]+)/)![1])).split('|').length;
    expect(wpCount).toBe(8);
  });

  it('uses addresses when preferAddress is on (iOS path — fixes Marcador labels)', () => {
    const stops = [
      { lat: -34.6, lng: -58.4, address: 'Av. Rivadavia 1234, Buenos Aires' },
      { lat: -34.61, lng: -58.41, address: 'Calle 90 587, San Andrés' },
    ];
    const urls = buildGoogleMapsChunks(stops, { preferAddress: true });
    expect(urls).toHaveLength(1);
    const origin = decodeURIComponent(urls[0].match(/origin=([^&]+)/)![1]);
    const dest = decodeURIComponent(urls[0].match(/destination=([^&]+)/)![1]);
    expect(origin).toBe('Av. Rivadavia 1234, Buenos Aires');
    expect(dest).toBe('Calle 90 587, San Andrés');
  });

  it('keeps lat,lng when preferAddress is off (Android path — addresses break route)', () => {
    const stops = [
      { lat: -34.6, lng: -58.4, address: 'Av. Rivadavia 1234' },
      { lat: -34.61, lng: -58.41, address: 'Calle 90 587, San Andrés' },
    ];
    const urls = buildGoogleMapsChunks(stops, { preferAddress: false });
    const origin = decodeURIComponent(urls[0].match(/origin=([^&]+)/)![1]);
    expect(origin).toBe('-34.6,-58.4');
  });

  it('falls back to lat,lng when a stop has no address (iOS path)', () => {
    const stops = [
      { lat: -34.6, lng: -58.4 }, // starting point — no address
      { lat: -34.61, lng: -58.41, address: 'Calle 90 587, San Andrés' },
    ];
    const urls = buildGoogleMapsChunks(stops, { preferAddress: true });
    const origin = decodeURIComponent(urls[0].match(/origin=([^&]+)/)![1]);
    expect(origin).toBe('-34.6,-58.4');
  });

  it('mixes addresses and lat,lng across waypoints (iOS path)', () => {
    const stops = [
      { lat: -34.6, lng: -58.4, address: 'A' },
      { lat: -34.61, lng: -58.41 }, // no address
      { lat: -34.62, lng: -58.42, address: 'C' },
    ];
    const urls = buildGoogleMapsChunks(stops, { preferAddress: true });
    const waypoints = decodeURIComponent(urls[0].match(/waypoints=([^&]+)/)![1]);
    expect(waypoints).toBe('-34.61,-58.41');
  });

  it('splits into 2 URLs at 11 stops, overlapping by 1', () => {
    const stops = Array.from({ length: 11 }, (_, i) => stop(i));
    const urls = buildGoogleMapsChunks(stops);
    expect(urls).toHaveLength(2);
    // Chunk 1 covers indexes 0..9; chunk 2 starts at the same point chunk 1 ended on.
    const chunk1Dest = urls[0].match(/destination=([^&]+)/)![1];
    const chunk2Origin = urls[1].match(/origin=([^&]+)/)![1];
    expect(chunk2Origin).toBe(chunk1Dest);
  });

  it('handles big routes (25 stops → 3 chunks)', () => {
    const stops = Array.from({ length: 25 }, (_, i) => stop(i));
    const urls = buildGoogleMapsChunks(stops);
    // 25 stops, chunk size 10, overlap 1 → ceil((25-1)/(10-1)) = 3 chunks.
    expect(urls).toHaveLength(3);
  });

  it('returns empty for fewer than 2 stops', () => {
    expect(buildGoogleMapsChunks([])).toEqual([]);
    expect(buildGoogleMapsChunks([stop(0)])).toEqual([]);
  });

  it('handles exactly 2 stops with no waypoints param', () => {
    const urls = buildGoogleMapsChunks([stop(0), stop(1)]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain('waypoints=');
  });

  it('exposes the chunk size constant', () => {
    expect(MAX_STOPS_PER_LINK).toBe(10);
  });
});

describe('makeStopRanges', () => {
  it('returns no ranges for short routes (≤5 stops)', () => {
    expect(makeStopRanges(0)).toEqual([]);
    expect(makeStopRanges(3)).toEqual([]);
    expect(makeStopRanges(5)).toEqual([]);
  });

  it('produces overlapping 5-step ranges for the examples Dan asked for', () => {
    expect(makeStopRanges(17)).toEqual([
      { from: 1, to: 5 },
      { from: 5, to: 10 },
      { from: 10, to: 15 },
      { from: 15, to: 17 },
    ]);
    expect(makeStopRanges(20)).toEqual([
      { from: 1, to: 5 },
      { from: 5, to: 10 },
      { from: 10, to: 15 },
      { from: 15, to: 20 },
    ]);
    expect(makeStopRanges(12)).toEqual([
      { from: 1, to: 5 },
      { from: 5, to: 10 },
      { from: 10, to: 12 },
    ]);
  });

  it('handles routes at anchor boundaries', () => {
    expect(makeStopRanges(10)).toEqual([
      { from: 1, to: 5 },
      { from: 5, to: 10 },
    ]);
    expect(makeStopRanges(6)).toEqual([
      { from: 1, to: 5 },
      { from: 5, to: 6 },
    ]);
  });
});
