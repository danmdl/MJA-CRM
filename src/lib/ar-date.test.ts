import { describe, it, expect } from 'vitest';
import { addDays, arDayStartIso, arToday, isIsoDay, toArDate } from './ar-date';

describe('toArDate', () => {
  it('keeps the AR calendar day for late-evening timestamps (UTC already next day)', () => {
    // 22:30 AR on Sep 27 = 01:30 UTC on Sep 28.
    expect(toArDate('2026-09-28T01:30:00+00:00')).toBe('2026-09-27');
  });
  it('matches the UTC day during AR daytime', () => {
    expect(toArDate('2026-09-28T15:00:00Z')).toBe('2026-09-28');
  });
  it('parses Postgres-style timestamps with a space separator', () => {
    expect(toArDate('2026-10-09 02:15:13.889381+00')).toBe('2026-10-08');
  });
  it('returns empty for missing or garbage input', () => {
    expect(toArDate(null)).toBe('');
    expect(toArDate('not a date')).toBe('');
  });
});

describe('arToday', () => {
  it('is yesterday in UTC terms before 03:00 UTC', () => {
    expect(arToday(new Date('2026-10-10T02:00:00Z'))).toBe('2026-10-09');
  });
});

describe('addDays / arDayStartIso / isIsoDay', () => {
  it('rolls over months and years', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('builds an AR midnight bound', () => {
    expect(arDayStartIso('2026-09-28')).toBe('2026-09-28T00:00:00-03:00');
  });
  it('validates YYYY-MM-DD', () => {
    expect(isIsoDay('2026-09-28')).toBe(true);
    expect(isIsoDay('28/09/2026')).toBe(false);
    expect(isIsoDay('')).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
  });
});
