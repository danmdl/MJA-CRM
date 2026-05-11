import { describe, it, expect } from 'vitest';
import {
  geoJsonToGooglePaths,
  googlePathsToGeoJson,
  isPointInTerritory,
  classifyAgainstTerritory,
  type GeoJsonPolygon,
} from './territory-utils';

const square: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [[
    [-58.5, -34.5],
    [-58.4, -34.5],
    [-58.4, -34.6],
    [-58.5, -34.6],
    [-58.5, -34.5],
  ]],
};

describe('geoJsonToGooglePaths', () => {
  it('returns null for null/undefined input', () => {
    expect(geoJsonToGooglePaths(null)).toBeNull();
    expect(geoJsonToGooglePaths(undefined)).toBeNull();
  });

  it('parses a stringified GeoJSON polygon', () => {
    const paths = geoJsonToGooglePaths(JSON.stringify(square));
    expect(paths).not.toBeNull();
    expect(paths![0]).toHaveLength(5);
    expect(paths![0][0]).toEqual({ lat: -34.5, lng: -58.5 });
  });

  it('returns null for malformed JSON', () => {
    expect(geoJsonToGooglePaths('not-json')).toBeNull();
  });

  it('returns null for non-Polygon geometry', () => {
    expect(geoJsonToGooglePaths({ type: 'Point' } as any)).toBeNull();
  });
});

describe('googlePathsToGeoJson', () => {
  it('returns null for empty paths', () => {
    expect(googlePathsToGeoJson([])).toBeNull();
  });

  it('skips rings with fewer than 3 points', () => {
    expect(googlePathsToGeoJson([[{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]])).toBeNull();
  });

  it('closes an open ring automatically', () => {
    const paths = [[
      { lat: -34.5, lng: -58.5 },
      { lat: -34.5, lng: -58.4 },
      { lat: -34.6, lng: -58.4 },
    ]];
    const geo = googlePathsToGeoJson(paths);
    expect(geo).not.toBeNull();
    expect(geo!.coordinates[0]).toHaveLength(4);
    expect(geo!.coordinates[0][0]).toEqual(geo!.coordinates[0][3]);
  });
});

describe('isPointInTerritory (JS fallback)', () => {
  const paths = geoJsonToGooglePaths(square)!;

  it('returns true for a point inside the polygon', () => {
    expect(isPointInTerritory(-34.55, -58.45, paths)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(isPointInTerritory(-34.7, -58.7, paths)).toBe(false);
  });

  it('returns false when paths is null', () => {
    expect(isPointInTerritory(-34.55, -58.45, null)).toBe(false);
  });

  it('returns false when lat/lng are not numbers', () => {
    expect(isPointInTerritory(null, null, paths)).toBe(false);
    expect(isPointInTerritory(undefined, -58.45, paths)).toBe(false);
  });
});

describe('classifyAgainstTerritory', () => {
  const paths = geoJsonToGooglePaths(square);

  it('returns "no-territory" when no polygon is provided', () => {
    expect(classifyAgainstTerritory(-34.55, -58.45, null)).toBe('no-territory');
  });

  it('returns "no-coords" when lat/lng are missing', () => {
    expect(classifyAgainstTerritory(null, null, paths)).toBe('no-coords');
  });

  it('returns "in" for a point inside the polygon', () => {
    expect(classifyAgainstTerritory(-34.55, -58.45, paths)).toBe('in');
  });

  it('returns "out" for a point outside the polygon', () => {
    expect(classifyAgainstTerritory(-34.7, -58.7, paths)).toBe('out');
  });
});
