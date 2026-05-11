import { describe, it, expect } from 'vitest';
import { isValidArgentinePhone, normalizeArgentinePhoneForWhatsapp } from './phone-validation';

describe('isValidArgentinePhone', () => {
  it('returns true for empty/nullish input (nothing to validate)', () => {
    expect(isValidArgentinePhone('')).toBe(true);
    expect(isValidArgentinePhone(null)).toBe(true);
    expect(isValidArgentinePhone(undefined)).toBe(true);
  });

  it('returns true for a non-digit string after stripping (no actual phone)', () => {
    expect(isValidArgentinePhone('abc-')).toBe(true);
  });

  it('accepts 10-digit CABA mobile starting with 11', () => {
    expect(isValidArgentinePhone('1123456789')).toBe(true);
    expect(isValidArgentinePhone('11 2345-6789')).toBe(true);
  });

  it('accepts legacy 15 prefix mobile', () => {
    expect(isValidArgentinePhone('1523456789')).toBe(true);
  });

  it('rejects truncated 11-prefix phone', () => {
    expect(isValidArgentinePhone('11234')).toBe(false);
  });

  it('accepts number with country code 54', () => {
    expect(isValidArgentinePhone('5411234567890')).toBe(true);
  });

  it('strips leading 9 after country code when length > 10', () => {
    expect(isValidArgentinePhone('5491123456789')).toBe(true);
  });

  it('rejects phones shorter than 10 digits', () => {
    expect(isValidArgentinePhone('123456789')).toBe(false);
  });
});

describe('normalizeArgentinePhoneForWhatsapp', () => {
  it('returns null for empty/nullish input', () => {
    expect(normalizeArgentinePhoneForWhatsapp('')).toBeNull();
    expect(normalizeArgentinePhoneForWhatsapp(null)).toBeNull();
    expect(normalizeArgentinePhoneForWhatsapp(undefined)).toBeNull();
  });

  it('returns null for too-short numbers', () => {
    expect(normalizeArgentinePhoneForWhatsapp('1234567')).toBeNull();
  });

  it('formats a CABA mobile to 549 prefix', () => {
    expect(normalizeArgentinePhoneForWhatsapp('11 2345-6789')).toBe('5491123456789');
  });

  it('converts legacy 15 prefix to 11 mobile', () => {
    expect(normalizeArgentinePhoneForWhatsapp('15 2345-6789')).toBe('5491123456789');
  });

  it('handles international format with country code already present', () => {
    expect(normalizeArgentinePhoneForWhatsapp('+54 9 11 2345 6789')).toBe('5491123456789');
    expect(normalizeArgentinePhoneForWhatsapp('+54 11 2345 6789')).toBe('5491123456789');
  });

  it('keeps non-mobile area code without 9 prefix', () => {
    expect(normalizeArgentinePhoneForWhatsapp('2914567890')).toBe('542914567890');
  });

  it('returns null for purely non-digit input', () => {
    expect(normalizeArgentinePhoneForWhatsapp('abc-def')).toBeNull();
  });
});
