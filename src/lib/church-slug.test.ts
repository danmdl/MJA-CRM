import { describe, it, expect } from 'vitest';
import { isUuid, normalizeSlug } from './church-slug';

describe('isUuid', () => {
  it('matches lowercase uuids', () => {
    expect(isUuid('77bac7b2-c1cc-407d-b0df-c82564d51a4f')).toBe(true);
  });
  it('matches uppercase uuids', () => {
    expect(isUuid('77BAC7B2-C1CC-407D-B0DF-C82564D51A4F')).toBe(true);
  });
  it('rejects slugs', () => {
    expect(isUuid('MJACENTRAL')).toBe(false);
    expect(isUuid('PUERTA8')).toBe(false);
  });
  it('rejects empty / null', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('normalizeSlug', () => {
  it('uppercases', () => {
    expect(normalizeSlug('mjacentral')).toBe('MJACENTRAL');
  });
  it('strips accents', () => {
    expect(normalizeSlug('María')).toBe('MARIA');
    expect(normalizeSlug('Iglésià')).toBe('IGLESIA');
  });
  it('strips spaces and punctuation', () => {
    expect(normalizeSlug('MJA-CENTRAL')).toBe('MJACENTRAL');
    expect(normalizeSlug('Puerta 8')).toBe('PUERTA8');
    expect(normalizeSlug("San José, Centro")).toBe('SANJOSECENTRO');
  });
  it('truncates to 20 characters', () => {
    expect(normalizeSlug('A'.repeat(50))).toHaveLength(20);
  });
  it('returns empty for empty input', () => {
    expect(normalizeSlug('')).toBe('');
  });
  it('preserves digits', () => {
    expect(normalizeSlug('Puerta8')).toBe('PUERTA8');
  });
});
