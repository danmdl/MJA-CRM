import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_QUERY_ROOTS, isContactQueryKey } from './contact-queries';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

// Scan the app for `queryKey: ['root'` literals and split them into
// definitions (useQuery) and usages (invalidate/refetch/setQueryData...).
function scanKeys() {
  const defined = new Set<string>();
  const used = new Map<string, string>();
  for (const file of sourceFiles(join(__dirname, '..'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)) {
      const before = src.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
      if (/(Queries|QueryData|QueriesData)\(\s*\{?\s*$/.test(before)) used.set(m[1], file);
      else defined.add(m[1]);
    }
  }
  return { defined, used };
}

describe('query keys', () => {
  const { defined, used } = scanKeys();

  it('never invalidates a key that no query defines (the stale-table bug)', () => {
    const dead = [...used.entries()].filter(([k]) => !defined.has(k)).map(([k, f]) => `${k} (${f})`);
    expect(dead).toEqual([]);
  });

  it('every contact root is a real query', () => {
    expect([...CONTACT_QUERY_ROOTS].filter(k => !defined.has(k))).toEqual([]);
  });

  it('isContactQueryKey matches by root only', () => {
    expect(isContactQueryKey(['pool-page', 'church-1', 0])).toBe(true);
    expect(isContactQueryKey(['cells', 'church-1'])).toBe(false);
    expect(isContactQueryKey([])).toBe(false);
  });
});
