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
 * San Martin, Buenos Aires, Argentina" and resolves correctly.
 *
 * Two-province disambiguation: we always tail the result with
 * ", Buenos Aires, Argentina" (the province + country). General San
 * Martín exists in Mendoza and other provinces too, so the locality
 * alone isn't enough — adding the province name makes the geocode
 * unambiguous. The country tail keeps the Argentina region bias.
 *
 * Both functions are pure so they're easy to test and to use from any
 * component or page without dragging in React.
 */

/**
 * Pulls the locality portion out of a church's full address string.
 * The convention adopted by the team is "Calle Numero, Localidad" or
 * "Calle Numero, Localidad, Provincia", so anything after the first
 * comma is the locality plus optional extras. If multiple commas exist
 * we take only the segment before the second comma to avoid pulling
 * the province (we add that ourselves below).
 *
 * Returns null if the address is empty or has no comma — caller
 * decides the fallback.
 */
export function parseChurchLocality(churchAddress: string | null | undefined): string | null {
  if (!churchAddress) return null;
  const idx = churchAddress.indexOf(',');
  if (idx === -1) return null;
  const tail = churchAddress.slice(idx + 1).trim();
  if (!tail) return null;
  // If the tail itself has another comma (e.g. "General San Martin,
  // Buenos Aires"), keep only the first segment — that's the locality.
  // We append the province ourselves below regardless.
  const secondComma = tail.indexOf(',');
  return secondComma === -1 ? tail : tail.slice(0, secondComma).trim();
}

/**
 * Builds the full address string we send to Google's Geocoder, biased
 * toward the church's locality.
 *
 * Behaviour:
 *  - If the church has a parseable locality (e.g. "General San Martin"),
 *    we append "<locality>, Buenos Aires, Argentina". Special case: if
 *    the contact's address ALREADY mentions the locality (case + accent
 *    insensitive token match), we don't duplicate it — we append just
 *    ", Buenos Aires, Argentina" so a row like "Mendoza 407, San Martin"
 *    doesn't become "Mendoza 407, San Martin, General San Martin, ..."
 *    which confuses the geocoder more than it helps.
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
    // The user already wrote the locality — don't repeat it, but tail
    // with the province + country so the bias still applies. This
    // disambiguates cases where the same locality name exists in
    // another province (General San Martín exists in Mendoza, La
    // Pampa, etc.).
    return `${trimmed}, Buenos Aires, Argentina`;
  }
  return `${trimmed}, ${locality}, Buenos Aires, Argentina`;
}
