/**
 * Argentine phone number validation.
 *
 * Valid shapes (after stripping non-digits and leading country code 54):
 *  - Mobile CABA/GBA:    "11" + 8 digits  → 10 digits total
 *  - Legacy mobile prefix: "15" + 8 digits → 10 digits total
 *  - Other area codes:   area code + local number, must be ≥ 10 digits total
 *
 * Anything shorter than 10 digits, or starting with 11/15 but with fewer than
 * 8 trailing digits, is considered invalid.
 *
 * Returns true when the phone looks complete enough to dial, false when it's
 * obviously truncated/malformed. Empty/nullish values return true (no phone
 * to validate, don't flag it).
 */
export function isValidArgentinePhone(raw: string | null | undefined): boolean {
  if (!raw) return true;
  // Strip everything that isn't a digit
  let digits = raw.replace(/\D/g, '');
  if (!digits) return true;

  // Drop country code if present (54)
  if (digits.startsWith('54')) digits = digits.slice(2);
  // Some numbers get stored as 549... (mobile with country code + 9)
  if (digits.startsWith('9') && digits.length > 10) digits = digits.slice(1);

  // If it starts with 11 or 15, there must be at least 8 more digits
  if (digits.startsWith('11') || digits.startsWith('15')) {
    return digits.length >= 10;
  }

  // Otherwise: any Argentine number should be at least 10 digits
  return digits.length >= 10;
}

/**
 * Normalize an Argentine phone number to WhatsApp wa.me/ format (no +).
 *
 * wa.me/ needs the full international number with country code, no +/spaces.
 * For Argentine mobiles, that means: 54 + 9 + area code + number.
 * The "9" after 54 is MANDATORY for mobiles, otherwise WhatsApp can't route
 * the message (or worse, treats the bare number as US +1 and fails).
 *
 * Returns null when the input is empty or clearly invalid so callers can
 * disable the action instead of opening a broken wa.me link.
 *
 * Examples:
 *   "11 2345-6789"        → "5491123456789"
 *   "15 2345-6789"        → "5491123456789"  (legacy 15 prefix → 11)
 *   "+54 9 11 2345 6789"  → "5491123456789"
 *   "+54 11 2345 6789"    → "5491123456789"
 *   "2914567890"          → "542914567890"   (non-mobile area code, no 9)
 *   "1234567" (too short) → null
 */
export function normalizeArgentinePhoneForWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Strip country code if present so we can normalize from a consistent shape
  if (digits.startsWith('54')) digits = digits.slice(2);
  // Strip the mobile "9" after country code if present
  if (digits.startsWith('9')) digits = digits.slice(1);

  // Legacy "15" prefix used locally for mobiles → drop it, it's not dialable internationally.
  // In practice old contacts get saved as "15xxxxxxxx" meaning "11 xxxxxxxx".
  if (digits.startsWith('15') && digits.length === 10) {
    digits = '11' + digits.slice(2);
  }

  // Validate: after all stripping we need at least 10 digits for a real AR number
  if (digits.length < 10) return null;

  // Determine if it's a mobile: AR mobiles in CABA/GBA start with 11.
  // For other provinces, mobiles follow the area code; we can't reliably detect
  // mobile vs landline from digits alone, so we default to prepending "9" (mobile)
  // when the number starts with 11, and leave it off otherwise. Most contacts in
  // this CRM are CABA/GBA mobiles, so this covers the 99% case.
  if (digits.startsWith('11')) {
    return '549' + digits;
  }

  return '54' + digits;
}
