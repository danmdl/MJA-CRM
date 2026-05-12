import { describe, it, expect } from 'vitest';
import { CONTACT_FIELDS } from './contact-fields';

describe('CONTACT_FIELDS', () => {
  it('has stable keys for the contact form fields the UI depends on', () => {
    // Smoke test against accidental removal — every place that iterates
    // CONTACT_FIELDS (CSV importer, AddContactDialog, ContactProfileDialog)
    // relies on at least these keys being present.
    const keys = CONTACT_FIELDS.map(f => f.key);
    const required = [
      'first_name', 'last_name', 'phone', 'address',
      'numero_cuerda', 'zona', 'fecha_contacto', 'sexo',
    ];
    for (const k of required) {
      expect(keys, `missing field "${k}"`).toContain(k);
    }
  });

  it('every entry has a non-empty label and a valid type', () => {
    const validTypes = ['text', 'phone', 'date'];
    for (const field of CONTACT_FIELDS) {
      expect(field.key, 'key must be non-empty').toBeTruthy();
      expect(field.label, `label missing for ${field.key}`).toBeTruthy();
      expect(validTypes, `unknown type "${field.type}" on ${field.key}`).toContain(field.type);
    }
  });

  it('has no duplicate keys', () => {
    const keys = CONTACT_FIELDS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
