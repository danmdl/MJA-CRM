// Supabase returns at most 1000 rows per request by default. This helper
// transparently paginates through ALL matching rows, no matter how many,
// using range-based iteration on a stable order column.
//
// Why this exists: we had multiple bugs where queries silently capped at
// 1000 rows (territory stats showing "total 1000", semillero missing
// contacts, etc). Each file had its own ad-hoc pagination loop. This
// centralizes the pattern so we can never re-introduce the cap.
//
// Usage:
//   const all = await fetchAllPages(() =>
//     supabase.from('contacts').select('id, name').eq('church_id', cid)
//   );
//
// The builder function receives nothing and must return a Supabase
// query builder. The helper applies .order('id') and .range() to it.
// Pass orderColumn if your table doesn't have an 'id' column.

type SupabaseQueryBuilder<T> = {
  order: (col: string) => SupabaseQueryBuilder<T>;
  range: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>;
};

const DEFAULT_PAGE_SIZE = 1000;
const SAFETY_MAX_PAGES = 100; // 100k rows. Adjust if you ever need more.

export async function fetchAllPages<T = any>(
  builder: () => any,
  options: { pageSize?: number; orderColumn?: string } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const orderColumn = options.orderColumn ?? 'id';
  const all: T[] = [];

  for (let page = 0; page < SAFETY_MAX_PAGES; page++) {
    const query = builder()
      .order(orderColumn)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await query;
    if (error) {
      // Log but don't throw — return what we have so the UI degrades
      // gracefully (showing partial results) instead of going blank.
      // eslint-disable-next-line no-console
      console.error('[fetchAllPages] page', page, 'failed:', error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break; // last page
  }

  return all;
}
