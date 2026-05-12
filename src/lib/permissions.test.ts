// Only testing the pure helpers exported from permissions.ts.
// The usePermissions hook itself is a React hook bound to supabase
// state and is covered by manual + future E2E testing instead.

// NB: importing from permissions.ts pulls supabase client transitively
// because hasPermission etc. live in the same module. The test-setup
// shim stubs `window`, which is enough for the supabase-js side to
// initialise without throwing in node.
import { describe, it, expect } from 'vitest';

import { getRoleLevel, ROLE_LABELS } from './permissions';

describe('getRoleLevel', () => {
  it('orders the role hierarchy lowest → highest', () => {
    // The contract is "higher index = higher privilege". Anfitrion is
    // the lowest tier, admin the highest. Don't tighten to exact
    // indices — the absolute number is implementation detail. Compare
    // pairwise instead so the test survives inserting a new tier in
    // the middle.
    expect(getRoleLevel('anfitrion')).toBeLessThan(getRoleLevel('conector'));
    expect(getRoleLevel('conector')).toBeLessThan(getRoleLevel('consolidador'));
    expect(getRoleLevel('consolidador')).toBeLessThan(getRoleLevel('encargado_de_celula'));
    expect(getRoleLevel('encargado_de_celula')).toBeLessThan(getRoleLevel('referente'));
    expect(getRoleLevel('referente')).toBeLessThan(getRoleLevel('supervisor'));
    expect(getRoleLevel('supervisor')).toBeLessThan(getRoleLevel('pastor'));
    expect(getRoleLevel('pastor')).toBeLessThan(getRoleLevel('general'));
    expect(getRoleLevel('general')).toBeLessThan(getRoleLevel('admin'));
  });

  it('returns 0 for unknown roles', () => {
    expect(getRoleLevel('not_a_role')).toBe(0);
    expect(getRoleLevel('')).toBe(0);
  });
});

describe('ROLE_LABELS (permissions.ts)', () => {
  it('has a label for every role in the hierarchy', () => {
    const roles = ['anfitrion', 'conector', 'consolidador', 'encargado_de_celula', 'referente', 'supervisor', 'pastor', 'general', 'admin'];
    for (const r of roles) {
      expect(ROLE_LABELS[r], `missing label for role "${r}"`).toBeTruthy();
    }
  });
});
