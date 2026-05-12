import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  categorizeAuthError,
  recordFailedAttempt,
  getFailedAttempts,
  clearFailedAttempts,
  getDeviceInfo,
} from './auth-logger';

describe('categorizeAuthError', () => {
  it('maps known Supabase error messages to short codes', () => {
    expect(categorizeAuthError('Invalid login credentials')).toBe('wrong_credentials');
    expect(categorizeAuthError('Email not confirmed yet')).toBe('email_not_confirmed');
    expect(categorizeAuthError('User not found in our records')).toBe('user_not_found');
  });

  it('catches all rate-limit variants', () => {
    expect(categorizeAuthError('Too many requests')).toBe('rate_limited');
    expect(categorizeAuthError('You hit a rate limit')).toBe('rate_limited');
    expect(categorizeAuthError('too many tries')).toBe('rate_limited');
  });

  it('catches expired / invalid token variants', () => {
    expect(categorizeAuthError('Token has expired')).toBe('expired_or_invalid_token');
    expect(categorizeAuthError('Some invalid token here')).toBe('expired_or_invalid_token');
  });

  it('detects network errors', () => {
    expect(categorizeAuthError('Network request failed')).toBe('network_error');
    expect(categorizeAuthError('Could not fetch endpoint')).toBe('network_error');
  });

  it('defaults to "unknown" for unmatched messages', () => {
    expect(categorizeAuthError('Something weird happened')).toBe('unknown');
    expect(categorizeAuthError('')).toBe('unknown');
  });
});

describe('failed-attempts tracker', () => {
  // Mock localStorage with a Map-backed in-memory store so each test runs
  // against a fresh state.
  const memoryStore = new Map<string, string>();
  beforeEach(() => {
    memoryStore.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoryStore.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStore.set(k, v),
      removeItem: (k: string) => memoryStore.delete(k),
      clear: () => memoryStore.clear(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records and counts attempts within the window', () => {
    expect(recordFailedAttempt('user@example.com')).toBe(1);
    expect(recordFailedAttempt('user@example.com')).toBe(2);
    expect(recordFailedAttempt('user@example.com')).toBe(3);
    expect(getFailedAttempts('user@example.com')).toBe(3);
  });

  it('normalises email casing so DAN@X.com and dan@x.com share the bucket', () => {
    recordFailedAttempt('DAN@X.com');
    expect(getFailedAttempts('dan@x.COM')).toBe(1);
  });

  it('keeps counts per email isolated', () => {
    recordFailedAttempt('a@x.com');
    recordFailedAttempt('a@x.com');
    recordFailedAttempt('b@x.com');
    expect(getFailedAttempts('a@x.com')).toBe(2);
    expect(getFailedAttempts('b@x.com')).toBe(1);
  });

  it('clearFailedAttempts resets the email\'s bucket', () => {
    recordFailedAttempt('a@x.com');
    recordFailedAttempt('a@x.com');
    clearFailedAttempts('a@x.com');
    expect(getFailedAttempts('a@x.com')).toBe(0);
  });

  it('drops attempts older than the 10-minute window', () => {
    // Seed the store directly with an old timestamp.
    const old = Date.now() - 11 * 60 * 1000;
    memoryStore.set('_login_fails_a@x.com', JSON.stringify([old]));
    // Reading should ignore the stale entry.
    expect(getFailedAttempts('a@x.com')).toBe(0);
    // Recording a new attempt should also drop the stale one.
    expect(recordFailedAttempt('a@x.com')).toBe(1);
  });
});

describe('getDeviceInfo', () => {
  // Helper to stub navigator.userAgent for each test.
  const setUA = (ua: string) => {
    vi.stubGlobal('navigator', { userAgent: ua });
  };
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies a desktop Chrome on macOS', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/118');
    const info = getDeviceInfo();
    expect(info.device).toBe('desktop');
    expect(info.browser).toBe('Chrome');
    expect(info.os).toBe('macOS');
  });

  it('classifies an iPhone', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605');
    const info = getDeviceInfo();
    expect(info.device).toBe('mobile');
    expect(info.browser).toBe('Safari');
    expect(info.os).toBe('iOS');
  });

  it('classifies an Android Chrome', () => {
    setUA('Mozilla/5.0 (Linux; Android 14) Chrome/118 Mobile');
    const info = getDeviceInfo();
    expect(info.device).toBe('mobile');
    expect(info.browser).toBe('Chrome');
    expect(info.os).toBe('Android');
  });

  it('handles unknown UAs gracefully', () => {
    setUA('CompletelyMadeUpAgent/1.0');
    const info = getDeviceInfo();
    expect(info.device).toBe('desktop');
    expect(info.browser).toBe('Unknown');
    expect(info.os).toBe('Unknown');
  });
});
