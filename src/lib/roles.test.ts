import { describe, it, expect } from 'vitest';
import { ROLE_LABELS, getRoleLabel, isReferenceRole } from './roles';

describe('ROLE_LABELS', () => {
  it('covers every RoleKey', () => {
    const expected = ['admin', 'general', 'pastor', 'referente', 'encargado_de_celula', 'conector', 'consolidador', 'supervisor', 'anfitrion'];
    for (const k of expected) {
      expect((ROLE_LABELS as Record<string, string>)[k]).toBeTruthy();
    }
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(expected.sort());
  });
});

describe('getRoleLabel', () => {
  it('returns the label for a known role', () => {
    expect(getRoleLabel('admin')).toBe('Admin');
    expect(getRoleLabel('encargado_de_celula')).toBe('Encargado de Célula');
    expect(getRoleLabel('anfitrion')).toBe('Anfitrión');
  });

  it('falls back to the raw role string for unknown roles', () => {
    expect(getRoleLabel('not_a_role')).toBe('not_a_role');
  });
});

describe('isReferenceRole', () => {
  it('returns true for pastor, referente, encargado_de_celula', () => {
    expect(isReferenceRole('pastor')).toBe(true);
    expect(isReferenceRole('referente')).toBe(true);
    expect(isReferenceRole('encargado_de_celula')).toBe(true);
  });

  it('returns false for any other role', () => {
    expect(isReferenceRole('admin')).toBe(false);
    expect(isReferenceRole('conector')).toBe(false);
    expect(isReferenceRole('anfitrion')).toBe(false);
  });

  it('returns false for undefined/empty', () => {
    expect(isReferenceRole(undefined)).toBe(false);
    expect(isReferenceRole('')).toBe(false);
  });
});
