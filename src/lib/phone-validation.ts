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
