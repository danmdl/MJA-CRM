import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sha1Hex,
  isPasswordPwned,
  validatePasswordRules,
  validatePasswordFull,
} from './password-strength';

describe('sha1Hex', () => {
  // Well-known SHA-1 test vectors so we know we're calling SubtleCrypto
  // correctly and not e.g. swapping byte order.
  it('matches the known SHA-1 of "password"', async () => {
    expect(await sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('matches the known SHA-1 of empty string', async () => {
    expect(await sha1Hex('')).toBe('DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
  });

  it('matches the known SHA-1 of "abc"', async () => {
    expect(await sha1Hex('abc')).toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
  });
});

describe('validatePasswordRules', () => {
  it('rejects empty', () => {
    expect(validatePasswordRules('').ok).toBe(false);
  });

  it('rejects fewer than 8 chars', () => {
    expect(validatePasswordRules('1234567').ok).toBe(false);
  });

  it('accepts an 8+ char password that is not in the trivial list', () => {
    const r = validatePasswordRules('Estrella2024');
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('rejects trivially common passwords even at 8+ chars', () => {
    expect(validatePasswordRules('password').ok).toBe(false);
    expect(validatePasswordRules('PASSWORD').ok).toBe(false);
    expect(validatePasswordRules('12345678').ok).toBe(false);
    expect(validatePasswordRules('qwerty').ok).toBe(false);
  });
});

describe('isPasswordPwned', () => {
  // We stub global fetch so the tests don't actually hit HIBP.
  const stubFetch = (impl: (url: string) => Response | Promise<Response>) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => impl(url)));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a positive count when the suffix is in the response', async () => {
    // SHA-1 of "password" = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // prefix = "5BAA6", suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
    stubFetch((url) => {
      expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
      return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:1234\nFOO:5\n');
    });
    expect(await isPasswordPwned('password')).toBe(1234);
  });

  it('returns 0 when the suffix is not in the response', async () => {
    stubFetch(() => new Response('AAAA:1\nBBBB:2\n'));
    expect(await isPasswordPwned('password')).toBe(0);
  });

  it('returns null on network error so the caller can fail-open', async () => {
    stubFetch(() => { throw new Error('network'); });
    expect(await isPasswordPwned('password')).toBeNull();
  });

  it('returns null on non-2xx HTTP response', async () => {
    stubFetch(() => new Response('rate limited', { status: 429 }));
    expect(await isPasswordPwned('password')).toBeNull();
  });

  it('sends only the first 5 hex chars of the hash, never the password', async () => {
    let observed = '';
    stubFetch((url) => {
      observed = url;
      return new Response('');
    });
    await isPasswordPwned('hunter2');
    expect(observed).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/);
    expect(observed).not.toContain('hunter2');
  });
});

describe('validatePasswordFull', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('NOMATCHHERE:1\n')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits on local rule failure without calling HIBP', async () => {
    const fetchSpy = vi.fn(async () => new Response(''));
    vi.stubGlobal('fetch', fetchSpy);
    const r = await validatePasswordFull('short');
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a strong password that is not in HIBP', async () => {
    const r = await validatePasswordFull('Estrella2024!');
    expect(r.ok).toBe(true);
  });

  it('rejects a strong-looking password that is in HIBP', async () => {
    // The suffix for SHA-1("Password123!") happens to not be the one we
    // hardcode here, so build a deterministic test by stubbing fetch to
    // return ALL suffixes the impl asks about as matches.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      // The URL contains the 5-char prefix. To force a hit, respond
      // with EVERY possible 35-char suffix mapped to a count. The impl
      // splits on \n and reads SUFFIX:COUNT, so include a wildcard
      // entry that matches the actual suffix of our test password.
      // Easier: compute the hash here and craft a response that
      // contains it.
      const password = 'Estrella2024!';
      const buf = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest('SHA-1', buf);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (const b of bytes) hex += b.toString(16).padStart(2, '0');
      const suffix = hex.toUpperCase().slice(5);
      // The URL prefix should be the first 5 chars of that hash.
      expect(url).toContain(hex.toUpperCase().slice(0, 5));
      return new Response(`${suffix}:9999`);
    }));
    const r = await validatePasswordFull('Estrella2024!');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('filtraciones');
  });

  it('fails OPEN when HIBP is unreachable so users can still set passwords', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const r = await validatePasswordFull('Estrella2024!');
    expect(r.ok).toBe(true);
  });
});
