// Argentina is UTC-3 year-round (no DST since 2009). Comparing a
// timestamptz against a calendar day must happen in AR time: slicing the
// UTC ISO string shifts the day for anything created after 21:00 AR,
// which is ~40% of contacts in production.

export const AR_UTC_OFFSET = '-03:00';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(s: string | null | undefined): s is string {
  return !!s && DAY_RE.test(s);
}

/** 'YYYY-MM-DD' calendar day in Argentina for a timestamp ('' if unparseable). */
export function toArDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's calendar day in Argentina. */
export function arToday(now: Date = new Date()): string {
  return toArDate(now.toISOString());
}

/** Shift a 'YYYY-MM-DD' day by n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Timestamp for 00:00 AR of the given day, for server-side gte/lt bounds. */
export function arDayStartIso(day: string): string {
  return `${day}T00:00:00${AR_UTC_OFFSET}`;
}
