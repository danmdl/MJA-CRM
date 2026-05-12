import { describe, it, expect } from 'vitest';
import {
  isWithinGBA,
  validateCoords,
  getDistanceColor,
  getDistanceBadgeClass,
  getDistanceWarning,
  DISTANCE_THRESHOLDS,
} from './geo-validation';

describe('isWithinGBA', () => {
  it('returns true for coordinates inside the GBA bounding box', () => {
    // San Martín-ish — sample point inside the bounds
    expect(isWithinGBA(-34.57, -58.54)).toBe(true);
    expect(isWithinGBA(-34.6, -58.4)).toBe(true);
  });

  it('returns false for coordinates outside the box', () => {
    // Bariloche
    expect(isWithinGBA(-41.13, -71.31)).toBe(false);
    // Lima, Peru
    expect(isWithinGBA(-12.04, -77.04)).toBe(false);
  });

  it('returns false for null or undefined coords', () => {
    expect(isWithinGBA(null, null)).toBe(false);
    expect(isWithinGBA(undefined, undefined)).toBe(false);
    expect(isWithinGBA(-34.55, null)).toBe(false);
  });

  it('returns false at exactly outside-of-box values', () => {
    expect(isWithinGBA(0, 0)).toBe(false);
  });
});

describe('validateCoords', () => {
  it('returns the coords when inside GBA', () => {
    expect(validateCoords(-34.55, -58.45)).toEqual({ lat: -34.55, lng: -58.45 });
  });

  it('returns null when outside GBA', () => {
    expect(validateCoords(-41.13, -71.31)).toBeNull();
  });

  it('returns null when either coord is missing', () => {
    expect(validateCoords(null, -58.45)).toBeNull();
    expect(validateCoords(-34.55, null)).toBeNull();
    expect(validateCoords(undefined, undefined)).toBeNull();
  });
});

describe('getDistanceColor', () => {
  it('green under the CLOSE threshold', () => {
    expect(getDistanceColor(0)).toBe('text-green-500');
    expect(getDistanceColor(DISTANCE_THRESHOLDS.CLOSE - 0.1)).toBe('text-green-500');
  });

  it('orange between CLOSE and FAR', () => {
    expect(getDistanceColor(DISTANCE_THRESHOLDS.CLOSE)).toBe('text-orange-500');
    expect(getDistanceColor(DISTANCE_THRESHOLDS.FAR - 0.1)).toBe('text-orange-500');
  });

  it('red at or above FAR', () => {
    expect(getDistanceColor(DISTANCE_THRESHOLDS.FAR)).toBe('text-red-500');
    expect(getDistanceColor(50)).toBe('text-red-500');
  });
});

describe('getDistanceBadgeClass', () => {
  it('maps distance into a tailwind-friendly badge class', () => {
    expect(getDistanceBadgeClass(0)).toContain('green');
    expect(getDistanceBadgeClass(3)).toContain('orange');
    expect(getDistanceBadgeClass(10)).toContain('red');
  });
});

describe('getDistanceWarning', () => {
  it('returns a warning when distance crosses TOO_FAR', () => {
    expect(getDistanceWarning(DISTANCE_THRESHOLDS.TOO_FAR)).toContain('Muy lejos');
    expect(getDistanceWarning(20)).toContain('Muy lejos');
  });

  it('returns null below TOO_FAR', () => {
    expect(getDistanceWarning(0)).toBeNull();
    expect(getDistanceWarning(DISTANCE_THRESHOLDS.TOO_FAR - 0.1)).toBeNull();
  });
});
