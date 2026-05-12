import { describe, it, expect } from 'vitest';
import { parseChurchLocality, buildGeocodeAddress } from './geocode-address';

describe('parseChurchLocality', () => {
  it('returns null for empty/nullish input', () => {
    expect(parseChurchLocality(null)).toBeNull();
    expect(parseChurchLocality(undefined)).toBeNull();
    expect(parseChurchLocality('')).toBeNull();
  });

  it('returns null when no comma is present', () => {
    expect(parseChurchLocality('Av. Mendoza 1850')).toBeNull();
  });

  it('returns the locality from a two-part address', () => {
    expect(parseChurchLocality('Ricardo Balbin 1860, General San Martin')).toBe('General San Martin');
  });

  it('returns only the locality when the address has a third province segment', () => {
    expect(parseChurchLocality('Ricardo Balbin 1860, General San Martin, Buenos Aires')).toBe('General San Martin');
  });

  it('trims whitespace around the locality', () => {
    expect(parseChurchLocality('Cuyo 100,   Villa Lynch  ')).toBe('Villa Lynch');
  });
});

describe('buildGeocodeAddress', () => {
  it('returns an empty string for empty contact addresses', () => {
    expect(buildGeocodeAddress('', null)).toBe('');
    expect(buildGeocodeAddress('   ', 'whatever')).toBe('');
  });

  it('falls back to "Buenos Aires, Argentina" when no church locality is parseable', () => {
    expect(buildGeocodeAddress('Mendoza 407')).toBe('Mendoza 407, Buenos Aires, Argentina');
    expect(buildGeocodeAddress('Mendoza 407', null)).toBe('Mendoza 407, Buenos Aires, Argentina');
    expect(buildGeocodeAddress('Mendoza 407', 'Address With No Comma')).toBe('Mendoza 407, Buenos Aires, Argentina');
  });

  it('appends the church locality + province + country when contact address lacks them', () => {
    const out = buildGeocodeAddress('Mendoza 407', 'Ricardo Balbin 1860, General San Martin');
    expect(out).toBe('Mendoza 407, General San Martin, Buenos Aires, Argentina');
  });

  it('does NOT duplicate the locality when the contact address already mentions it', () => {
    // Contact wrote "San Martin"; church locality is "General San Martin".
    // Both relevant tokens (general, san, martin) — only san+martin are in
    // the contact, "general" is missing, so the locality is NOT considered
    // already mentioned and gets appended.
    expect(buildGeocodeAddress('Mendoza 407, San Martin', 'Balbin 1860, General San Martin'))
      .toBe('Mendoza 407, San Martin, General San Martin, Buenos Aires, Argentina');

    // Full match: every locality token IS in the address, so the helper
    // skips the locality and tails with province + country.
    expect(buildGeocodeAddress('Mendoza 407, General San Martin', 'Balbin 1860, General San Martin'))
      .toBe('Mendoza 407, General San Martin, Buenos Aires, Argentina');
  });

  it('is accent-insensitive when checking if locality is mentioned', () => {
    // "San Martín" (with accent) in contact, "San Martin" in church — match.
    expect(buildGeocodeAddress('Mendoza 407, General San Martín', 'Balbin 1860, General San Martin'))
      .toBe('Mendoza 407, General San Martín, Buenos Aires, Argentina');
  });
});
