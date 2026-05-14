import { describe, it, expect } from 'vitest';
import { isUuid, normalizeSlug, computeSlugRedirect } from './church-slug';

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

describe('computeSlugRedirect', () => {
  // This is the math that takes /admin/churches/<uuid>/team and
  // rewrites it to /admin/churches/<slug>/team in the URL bar. The
  // hook calls navigate(redirectTo, { replace: true }) — so this is
  // the smoke test for the redirect behavior end-to-end (everything
  // else is just plumbing the result of this function).
  const UUID = '77bac7b2-c1cc-407d-b0df-c82564d51a4f';
  const SLUG = 'MJACENTRAL';

  it('rewrites a /team URL', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}/team`, '', '', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL/team');
  });
  it('rewrites a /semillero URL', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}/semillero`, '', '', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL/semillero');
  });
  it('rewrites bare /admin/churches/<uuid>', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}`, '', '', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL');
  });
  it('preserves query string', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}/contacts`, '?q=joel&page=2', '', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL/contacts?q=joel&page=2');
  });
  it('preserves hash fragment', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}/asistencia`, '', '#abc', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL/asistencia#abc');
  });
  it('preserves both query string and hash', () => {
    expect(computeSlugRedirect(`/admin/churches/${UUID}/procesos`, '?stage=invitacion', '#card-5', UUID, SLUG))
      .toBe('/admin/churches/MJACENTRAL/procesos?stage=invitacion#card-5');
  });
  it('only replaces the first UUID match if it somehow appears twice', () => {
    // Defensive: a deep-link could theoretically contain the UUID
    // twice (path + query). Only the URL-segment one should be
    // rewritten. .replace(str, str) replaces just the first match,
    // which is the correct behavior here.
    expect(computeSlugRedirect(`/admin/churches/${UUID}/contacts`, `?ref=${UUID}`, '', UUID, SLUG))
      .toBe(`/admin/churches/MJACENTRAL/contacts?ref=${UUID}`);
  });
});
