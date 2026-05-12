import { describe, it, expect } from 'vitest';
import { findDuplicates } from './duplicate-detector';

const make = (id: string, first_name: string, last_name: string | null = null, phone: string | null = null, address: string | null = null) =>
  ({ id, first_name, last_name, phone, address });

describe('findDuplicates', () => {
  it('returns no groups when all contacts are distinct', () => {
    const contacts = [
      make('1', 'Juan', 'Pérez', '1123456789'),
      make('2', 'María', 'Gómez', '1198765432'),
      make('3', 'Pedro'),
    ];
    expect(findDuplicates(contacts)).toEqual([]);
  });

  it('groups same name + same last-8-of-phone as high confidence', () => {
    const groups = findDuplicates([
      make('1', 'Juan', 'Pérez', '11 2345-6789'),
      make('2', 'JUAN', 'perez', '5491123456789'), // same last 8 digits
      make('3', 'María', null, '1112345555'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe('high');
    expect(groups[0].contacts.map(c => c.id).sort()).toEqual(['1', '2']);
  });

  it('groups same normalized name without phone as medium confidence', () => {
    const groups = findDuplicates([
      make('1', 'Camila', 'Próspero'),
      make('2', 'CAMILA', 'prospero'),
      make('3', 'Juan'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe('medium');
    expect(groups[0].contacts.map(c => c.id).sort()).toEqual(['1', '2']);
  });

  it('does not double-count contacts already in a high-confidence group', () => {
    // High-confidence catch happens first; the same pair must not also
    // appear in the medium-confidence pass.
    const groups = findDuplicates([
      make('1', 'Juan', 'Pérez', '1123456789'),
      make('2', 'Juan', 'Pérez', '1123456789'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe('high');
  });

  it('ignores contacts with empty names (avoids merging blanks)', () => {
    const groups = findDuplicates([
      make('1', '', ''),
      make('2', '', ''),
    ]);
    expect(groups).toEqual([]);
  });

  it('sorts high-confidence groups before medium', () => {
    const groups = findDuplicates([
      // Medium: same name, no phone
      make('1', 'Pedro', 'Rojas'),
      make('2', 'PEDRO', 'rojas'),
      // High: same name + phone
      make('3', 'Ana', 'Suárez', '1144556677'),
      make('4', 'Ana', 'Suarez', '1144556677'),
    ]);
    expect(groups[0].confidence).toBe('high');
    expect(groups[1].confidence).toBe('medium');
  });
});
