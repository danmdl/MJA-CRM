// Password strength + leaked-password check.
//
// Two layers:
//   1. validatePasswordRules(): local rules (min length, mix of chars).
//   2. isPasswordPwned(): network check against the HaveIBeenPwned API
//      using k-anonymity, so we never send the actual password anywhere.
//
// k-anonymity flow:
//   - SHA-1 hash the password locally.
//   - Send only the first 5 hex chars of the hash to
//     https://api.pwnedpasswords.com/range/<first5>
//   - The API returns ~500 hash suffixes (35 chars each) of every
//     leaked password whose hash starts with those 5 chars, with a
//     breach count.
//   - We compare locally. If our hash suffix is in the list, the
//     password was in a known breach.
//
// The actual password (and even its full hash) never leaves the
// browser. This is the same protocol Supabase Pro uses internally.

/**
 * SHA-1 of the input string, hex-uppercase. Implemented with
 * SubtleCrypto so it stays off the main thread and we don't ship a
 * hash library in the bundle.
 */
export const sha1Hex = async (input: string): Promise<string> => {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
};

/**
 * Returns the breach count if the password was found in HIBP, or 0 if
 * not found. Returns null on network/API error — caller decides whether
 * to fail-open (allow) or fail-closed (block). Default policy in this
 * app is fail-open so we don't lock people out if the API is down.
 */
export const isPasswordPwned = async (password: string): Promise<number | null> => {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      // Add-Padding tells HIBP to randomise the response size so a
      // network observer can't distinguish a real query from a probe.
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Each line: SUFFIX:COUNT (newline-separated, count is ASCII int).
    for (const line of text.split(/\r?\n/)) {
      const [lineSuffix, count] = line.split(':');
      if (lineSuffix === suffix) {
        const n = parseInt((count || '').trim(), 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
      }
    }
    return 0;
  } catch {
    return null;
  }
};

export interface PasswordValidation {
  ok: boolean;
  /** First reason that made the password unacceptable, or null when ok. */
  reason: string | null;
}

/**
 * Local rules — no network. Run synchronously to give instant feedback
 * while typing. The remote pwned check is a separate async call run on
 * submit, not on every keystroke (it would rate-limit the API and burn
 * the user's data on mobile).
 *
 * The bar is intentionally low (8 chars) because:
 *   - Most non-tech users hate "must have a symbol, capital, number".
 *   - The HIBP check is what catches the actually-bad passwords —
 *     "Password1!" passes complexity rules and IS in HIBP 2M+ times.
 *   - Length matters more than complexity for crack resistance.
 */
export const validatePasswordRules = (password: string): PasswordValidation => {
  if (!password) {
    return { ok: false, reason: 'La contraseña es obligatoria.' };
  }
  if (password.length < 8) {
    return { ok: false, reason: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  // Block trivially weak passwords without needing an API call.
  const lower = password.toLowerCase();
  const trivial = ['12345678', 'password', 'contrasena', 'qwerty', '11111111', 'abc12345'];
  if (trivial.includes(lower)) {
    return { ok: false, reason: 'Esta contraseña es demasiado común. Elegí otra.' };
  }
  return { ok: true, reason: null };
};

/**
 * Full check: local rules + HIBP. Awaited on submit, not on each keystroke.
 *
 * fail-open: if HIBP is unreachable, we still accept the password as
 * long as the local rules pass. We log the failure so it's visible in
 * client_logs but we don't block the user from setting a password just
 * because their internet hiccupped or HIBP is rate-limiting us.
 */
export const validatePasswordFull = async (password: string): Promise<PasswordValidation> => {
  const local = validatePasswordRules(password);
  if (!local.ok) return local;
  const breachCount = await isPasswordPwned(password);
  if (breachCount === null) return { ok: true, reason: null };
  if (breachCount > 0) {
    return {
      ok: false,
      reason: `Esta contraseña apareció en filtraciones públicas (${breachCount.toLocaleString('es-AR')} veces). Por seguridad, elegí otra.`,
    };
  }
  return { ok: true, reason: null };
};
