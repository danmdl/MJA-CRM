import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from './pagination';

// Build a fake supabase-style query builder that returns rows in
// configurable pages. Each call to `builder()` returns an object with
// `.order()` and `.range()`; range resolves to { data, error }.
function makeFakeBuilder(allRows: any[], opts: { failOnPage?: number } = {}) {
  let buildCount = 0;
  const builder = () => {
    const thisBuild = buildCount;
    buildCount += 1;
    return {
      order(_col: string) { return this; },
      async range(from: number, to: number) {
        if (opts.failOnPage === thisBuild) {
          return { data: null, error: { message: 'simulated failure' } };
        }
        const slice = allRows.slice(from, to + 1);
        return { data: slice, error: null };
      },
    };
  };
  return builder;
}

describe('fetchAllPages', () => {
  it('returns an empty array when there is nothing to fetch', async () => {
    const result = await fetchAllPages(makeFakeBuilder([]));
    expect(result).toEqual([]);
  });

  it('returns a single page when rows fit under the limit', async () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = await fetchAllPages(makeFakeBuilder(rows), { pageSize: 10 });
    expect(result).toHaveLength(3);
  });

  it('aggregates across multiple pages', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i) }));
    const result = await fetchAllPages(makeFakeBuilder(rows), { pageSize: 1000 });
    expect(result).toHaveLength(2500);
    expect(result[0]).toEqual({ id: '0' });
    expect(result[result.length - 1]).toEqual({ id: '2499' });
  });

  it('breaks early when a page returns fewer rows than the page size', async () => {
    // 1500 rows with pageSize 1000 → first page 1000, second page 500.
    // Helper should NOT issue a third request since 500 < 1000 signals last page.
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: String(i) }));
    const fake = makeFakeBuilder(rows);
    const wrappedBuilder = vi.fn(fake);
    const result = await fetchAllPages(wrappedBuilder as any, { pageSize: 1000 });
    expect(result).toHaveLength(1500);
    expect(wrappedBuilder).toHaveBeenCalledTimes(2);
  });

  it('returns partial results when a page fails mid-fetch', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i) }));
    const fake = makeFakeBuilder(rows, { failOnPage: 1 });
    const result = await fetchAllPages(fake, { pageSize: 1000 });
    // First page (0-999) succeeded → 1000 rows. Page 1 failed → break.
    expect(result).toHaveLength(1000);
  });

  it('respects the orderColumn option when provided', async () => {
    // We don't observe the order externally here; just confirm the option
    // doesn't crash. The order() call on the builder is called with the
    // string but the fake builder ignores it.
    const rows = [{ id: '1' }];
    const result = await fetchAllPages(makeFakeBuilder(rows), {
      pageSize: 10,
      orderColumn: 'created_at',
    });
    expect(result).toEqual(rows);
  });
});
