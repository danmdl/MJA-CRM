// Trusted-device helpers for MFA.
//
// Flow:
//   1. First time the app boots in a browser, getOrCreateDeviceId() makes
//      a v4 UUID and persists it in localStorage. Same browser/profile =
//      same id forever (until the user clears storage).
//   2. After a successful password login, the app sends a SHA-256 of
//      that id to the DB and checks trusted_devices: if the (user, hash)
//      pair exists, MFA challenge is skipped; otherwise it must be
//      verified before granting access.
//   3. On a successful TOTP verify, the app inserts (or updates
//      last_seen) the trusted_devices row so the same browser doesn't
//      get prompted again.
//
// We hash on the client BEFORE sending to the DB. The raw id never
// leaves the device. If someone reads the DB they can't replay the
// device-trust check against an attacker-controlled browser, because
// they don't have the original id — only the hash.

import { supabase } from '@/integrations/supabase/client';

const DEVICE_ID_KEY = '_mja_device_id';

/**
 * Returns the persistent device id for this browser profile, creating
 * one the first time it's called. Stays the same across reloads and
 * logins; only cleared by the user wiping site data or using `/reset`.
 */
export const getOrCreateDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked (incognito with cookies off, etc). Fall back
    // to an ephemeral id so the rest of the flow doesn't break — that
    // session just won't be remembered as trusted afterwards.
    return crypto.randomUUID();
  }
};

/**
 * SHA-256 of a string as hex-lowercase. Used to hash the device id
 * before sending it to the DB so we never store the raw value.
 */
export const sha256Hex = async (input: string): Promise<string> => {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * Best-effort, human-readable name for the current browser/OS, used
 * only so the user can recognise rows in their Trusted Devices list.
 * No security relevance — picked entirely from navigator.userAgent.
 */
export const inferDeviceName = (): string => {
  const ua = (navigator.userAgent || '').toLowerCase();
  const browser =
    ua.includes('edg/') ? 'Edge' :
    ua.includes('opr/') || ua.includes('opera') ? 'Opera' :
    ua.includes('chrome/') ? 'Chrome' :
    ua.includes('firefox/') ? 'Firefox' :
    ua.includes('safari/') ? 'Safari' : 'Browser';
  const os =
    ua.includes('iphone') ? 'iPhone' :
    ua.includes('ipad') ? 'iPad' :
    ua.includes('android') ? 'Android' :
    ua.includes('mac os') || ua.includes('macintosh') ? 'macOS' :
    ua.includes('windows') ? 'Windows' :
    ua.includes('linux') ? 'Linux' : 'Unknown';
  return `${browser} en ${os}`;
};

// ─── Location-trust ──────────────────────────────────────────────────
//
// Companion check to the device-trust above. The MFA gate skips the
// challenge when the user's CURRENT IP geolocates to the same
// country + (region or city) as ANY trusted device they have on
// file. So once a user has logged in with MFA from Buenos Aires on
// any device, a fresh browser in Buenos Aires won't get prompted
// again — same prove-once-per-region UX they were asking for.
// Different region (someone with an IP outside Buenos Aires) still
// gets the challenge.

interface ClientLocation {
  country: string | null;
  region: string | null;
  city: string | null;
}

let cachedLocation: ClientLocation | null = null;
let cachedLocationAt = 0;

/**
 * Returns the current browser's IP-based geolocation via ipapi.co
 * (free, no API key, HTTPS + CORS). Result is cached for 10 min so
 * navigations within a session don't keep hammering the API. On any
 * failure (network down, rate-limited, blocked) it returns nulls and
 * the caller falls back to device-trust only.
 */
export const getClientLocation = async (): Promise<ClientLocation> => {
  if (cachedLocation && Date.now() - cachedLocationAt < 10 * 60_000) {
    return cachedLocation;
  }
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!res.ok) return { country: null, region: null, city: null };
    const data: any = await res.json();
    // ipapi.co returns { country_name, country_code, region, region_code,
    // city, ... } on success and { error: true, reason: '...' } on
    // rate-limit / failure. Guard explicitly.
    if (data?.error) return { country: null, region: null, city: null };
    const loc: ClientLocation = {
      country: data.country_name || data.country || null,
      region: data.region || data.region_code || null,
      city: data.city || null,
    };
    cachedLocation = loc;
    cachedLocationAt = Date.now();
    return loc;
  } catch {
    return { country: null, region: null, city: null };
  }
};

/**
 * Returns true if this browser is in trusted_devices for the given user.
 */
export const isCurrentDeviceTrusted = async (userId: string): Promise<boolean> => {
  try {
    const deviceId = getOrCreateDeviceId();
    const hash = await sha256Hex(deviceId);
    const { data, error } = await supabase
      .from('trusted_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_id_hash', hash)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
};

/**
 * Returns true if the user's CURRENT IP geolocates to the same
 * country AND (region or city) as ANY of their trusted_devices rows.
 * Returns false if the geolocation lookup fails or the user has no
 * trusted devices with location data yet — in either case the caller
 * falls back to the regular device-trust check or the MFA challenge.
 */
export const isCurrentLocationTrusted = async (userId: string): Promise<boolean> => {
  try {
    const loc = await getClientLocation();
    if (!loc.country) return false;
    const { data, error } = await supabase
      .from('trusted_devices')
      .select('last_country, last_region, last_city')
      .eq('user_id', userId)
      .not('last_country', 'is', null);
    if (error || !data || data.length === 0) return false;
    return data.some(d =>
      d.last_country === loc.country &&
      ((loc.region && d.last_region === loc.region) || (loc.city && d.last_city === loc.city)),
    );
  } catch {
    return false;
  }
};

/**
 * Registers the current browser as trusted for the given user. Called
 * after a successful TOTP verify. Upserts on (user_id, device_id_hash)
 * so re-trusting an existing device just refreshes last_seen_at.
 * Also captures the current IP geolocation so a future fresh browser
 * in the same region can be skipped via the location-trust check.
 */
export const markCurrentDeviceTrusted = async (userId: string): Promise<void> => {
  try {
    const deviceId = getOrCreateDeviceId();
    const hash = await sha256Hex(deviceId);
    const loc = await getClientLocation();
    await supabase
      .from('trusted_devices')
      .upsert(
        {
          user_id: userId,
          device_id_hash: hash,
          device_name: inferDeviceName(),
          user_agent: (navigator.userAgent || '').slice(0, 500),
          last_seen_at: new Date().toISOString(),
          last_country: loc.country,
          last_region: loc.region,
          last_city: loc.city,
        },
        { onConflict: 'user_id,device_id_hash' },
      );
  } catch {
    // Trust persistence is best-effort. If it fails the user will be
    // re-prompted next login, which is acceptable.
  }
};

/**
 * Refresh the last_seen_at column for the current device without
 * inserting a new row. Called on successful login when the device is
 * already trusted, so the Trusted Devices list shows a recent date.
 * Also opportunistically updates the location columns — if the user
 * moves to a new city the row reflects their latest location.
 */
export const touchCurrentDevice = async (userId: string): Promise<void> => {
  try {
    const deviceId = getOrCreateDeviceId();
    const hash = await sha256Hex(deviceId);
    const loc = await getClientLocation();
    const patch: Record<string, any> = { last_seen_at: new Date().toISOString() };
    // Only patch the location columns when we actually got a value
    // back from the geolocator — never blow away good data with nulls.
    if (loc.country) patch.last_country = loc.country;
    if (loc.region) patch.last_region = loc.region;
    if (loc.city) patch.last_city = loc.city;
    await supabase
      .from('trusted_devices')
      .update(patch)
      .eq('user_id', userId)
      .eq('device_id_hash', hash);
  } catch { /* best-effort */ }
};
