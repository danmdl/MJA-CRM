/**
 * Geocode-address builders biased toward the church's locality.
 *
 * Why this exists: every place we feed a contact's address to the Google
 * Geocoder, we used to append a hardcoded ", Buenos Aires, Argentina"
 * tail. The problem is that "Buenos Aires" in Spanish is ambiguous —
 * Google reads it as Capital Federal (CABA) by default, not the province
 * of Buenos Aires that surrounds it. So a contact from MJA Central
 * (whose church sits in General San Martín, a suburb in the province)
 * who entered "Mendoza 407" without a locality would get geocoded to a
 * Mendoza street in CABA — completely wrong, often kilometres away from
 * any church plausibly serving them. The lat/lng bounds we set on the
 * Geocoder request help, but they're a soft hint — when the same street
 * name exists inside the bounds AND outside, Google still tends to pick
 * the more famous hit.
 *
 * Fix: derive the locality from the church's address (whatever follows
 * the first comma — for "Ricardo Balbin 1860, General San Martin", the
 * locality is "General San Martin") and use THAT as the suffix instead
 * of "Buenos Aires". Now "Mendoza 407" becomes "Mendoza 407, General
 * San Martin, Argentina" and resolves correctly.
 *
 * Both functions are pure so they're easy to test and to use from any
 * component or page without dragging in React.
 */

/**
 * Pulls the locality portion out of a church's full address string.
 * The convention adopted by the team is "Calle Numero, Localidad" or
 * "Calle Numero, Localidad, Provincia", so anything after the first
 * comma is the locality plus optional extras. Returns null if the
 * address is empty or has no comma — caller decides the fallback.
 */
export function parseChurchLocality(churchAddress: string | null | undefined): string | null {
  if (!churchAddress) return null;
  const idx = churchAddress.indexOf(',');
  if (idx === -1) return null;
  const tail = churchAddress.slice(idx + 1).trim();
  return tail || null;
}

/**
 * Builds the full address string we send to Google's Geocoder, biased
 * toward the church's locality.
 *
 * Behaviour:
 *  - If the church has a parseable locality (e.g. "General San Martin"),
 *    we append that. Special case: if the contact's address ALREADY
 *    mentions the locality (case + accent insensitive token match),
 *    we don't duplicate it — we append ", Argentina" only, so a row
 *    like "Mendoza 407, San Martin" doesn't become "Mendoza 407, San
 *    Martin, General San Martin, Argentina" which confuses the
 *    geocoder more than it helps.
 *  - If the church has no parseable locality (legacy church row with
 *    no address yet), we fall back to "Buenos Aires, Argentina" — same
 *    behaviour as before this helper existed, so churches in CABA
 *    don't regress.
 */
export function buildGeocodeAddress(
  rawAddress: string,
  churchAddress?: string | null,
): string {
  const trimmed = (rawAddress || '').trim();
  if (!trimmed) return '';
  const locality = parseChurchLocality(churchAddress);
  if (!locality) {
    return `${trimmed}, Buenos Aires, Argentina`;
  }
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Pull locality keywords (3+ chars to avoid matching on tiny words
  // like "de" or "y") to test against the contact's address.
  const localityTokens = norm(locality)
    .split(/[,\s]+/)
    .filter(w => w.length > 2);
  const addrTokens = new Set(norm(trimmed).split(/[,\s]+/));
  const alreadyMentioned =
    localityTokens.length > 0 &&
    localityTokens.every(w => addrTokens.has(w));
  if (alreadyMentioned) {
    // The user already wrote the locality — don't repeat it, but make
    // sure Argentina is on the end so the country-level bias still
    // applies.
    return `${trimmed}, Argentina`;
  }
  return `${trimmed}, ${locality}, Argentina`;
}
