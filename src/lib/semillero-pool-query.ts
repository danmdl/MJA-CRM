// Server-side data layer for the Semillero pool view.
//
// Replaces the historical "fetch every contact, filter client-side"
// pattern that started breaking around 10–15k contacts per church
// and was completely unworkable past 50k. The page now sends each
// filter + sort + pagination change as a fresh query and gets back
// just the rows it needs to render (PAGE_SIZE rows + total count).
//
// What's still client-side after this:
//   - Zona in/out polygon test — runs over the returned page only.
//     A "Find all in-zone" full-base scan would need PostGIS; deferred.
//   - Duplicate detection — runs over the returned page only. Full
//     duplicate scan across the whole base would need its own scan
//     endpoint; deferred.
//   - Bulk "select all" — picks the current page only. Cross-page
//     fanout (UPDATE WHERE filters) would be its own action and is
//     deferred.
//
// The `search_haystack` column is the normalized concatenation of
// first_name + last_name + phone + address + barrio (migration 0034).
// Tokens are AND-chained via repeated .ilike calls because Postgres
// trigram-indexed ilike is the cheapest match here.

import { supabase } from '@/integrations/supabase/client';
import { normalize, normalizeName } from '@/lib/normalize';

// Columns brought back per row. Kept tight on purpose — the old
// SELECT pulled 28 columns including some that only the dialog
// needs (lat / lng / sexo / estado_civil etc). Those that ARE
// needed at row render time stay; the rest the profile dialog
// fetches when opened.
export const POOL_ROW_COLUMNS = [
  'id', 'first_name', 'last_name', 'phone', 'address', 'barrio',
  'zona_id', 'zona', 'conector', 'fecha_contacto', 'numero_cuerda',
  'cell_id', 'estado_seguimiento', 'lat', 'lng',
  'is_external', 'pending_external_send', 'pending_assignment_cell_id',
  'responsable_id', 'created_by', 'created_at',
  'received_from_mja_at', 'received_from_mja_seen_at',
  'sent_to_mja_at', 'sent_to_mja_seen_at',
].join(', ');

export type PoolKind = 'unassigned' | 'external' | 'pending_assignment' | 'all';
export type SortBy = 'nombre' | 'fecha' | null;
export type SortDir = 'asc' | 'desc';

export interface PoolFilters {
  churchId: string;
  userId: string | null;
  userRole: string | null;
  userCuerda: string | null;
  canSeeAllCuerdas: boolean;

  pool: PoolKind;
  search: string;
  filterCuerda: string;                 // '' | numero_cuerda
  filterResponsable: string;            // '' | '__none__' | '__church_cuerda__' | uuid
  filterConector: string;               // '' | '__none__' | name
  filterOnlyWithCoords: boolean;
  /**
   * Hard restrict the result set to a single numero_cuerda. Different
   * from `filterCuerda` (user's dropdown choice) — this one is set
   * internally when the Zona filter is active: 'En zona' / 'Fuera de
   * zona' is by definition relative to the LOGGED-IN user's cuerda,
   * so we restrict the candidate rows to that cuerda server-side
   * before the client polygon test runs.
   *
   * The previous bbox prefilter attempt mixed cuerdas (contacts from
   * cuerda 104 living geographically inside 108's polygon got labeled
   * En zona for a supervisor of 108) — Dan reported it as
   * 'mezclaste las cuerdas'. This is the strict-cuerda replacement.
   *
   * Stacks with filterCuerda: if both are set the intersection
   * applies (degenerate combo, returns empty when they differ).
   */
  restrictToCuerda: string | null;
  churchCuerdaNumero: string | null;    // for the __church_cuerda__ special case

  sortBy: SortBy;
  sortDir: SortDir;
  page: number;
  pageSize: number;
}

export interface PoolPage<TRow> {
  rows: TRow[];
  totalCount: number;
}

/**
 * Build and run a Semillero pool query against `contacts` with all
 * filters applied server-side. Returns the page rows + total count
 * for the filtered set so the UI can render "page N of M".
 */
export async function fetchPoolPage<TRow = any>(f: PoolFilters): Promise<PoolPage<TRow>> {
  let q = supabase
    .from('contacts')
    .select(POOL_ROW_COLUMNS, { count: 'exact' })
    .eq('church_id', f.churchId)
    .is('deleted_at', null);

  // ── Visibility scope ──────────────────────────────────────────
  // Mirrors the visibility rules the old client-side flow applied:
  //   - 'conector' role: only contacts they created themselves
  //     (created_by). This overrides cuerda / responsable scoping.
  //   - Other non-globals with a cuerda: only contacts of their
  //     cuerda. created_by leaks were possible before — keeping
  //     this strict prevents that.
  //   - Other non-globals without a cuerda: only contacts where
  //     they are responsable_id.
  //   - Globals (admin/general/pastor/supervisor + canSeeAllCuerdas):
  //     no scope, full church view.
  if (f.userRole === 'conector') {
    if (f.userId) {
      q = q.eq('created_by', f.userId);
    } else {
      return { rows: [], totalCount: 0 };
    }
  } else if (!f.canSeeAllCuerdas) {
    if (f.userCuerda) {
      q = q.eq('numero_cuerda', f.userCuerda);
    } else if (f.userId) {
      q = q.eq('responsable_id', f.userId);
    } else {
      return { rows: [], totalCount: 0 };
    }
  }

  // ── Pool gate ─────────────────────────────────────────────────
  // 'all' is used by the global search view (when the user types in
  // the search box we cross pool boundaries so they can find anyone).
  // Otherwise narrow to the active pool.
  const isSearching = f.search.trim().length > 0;
  if (!isSearching) {
    if (f.pool === 'unassigned') {
      q = q
        .is('cell_id', null)
        .or('pending_external_send.is.null,pending_external_send.eq.false')
        .is('pending_assignment_cell_id', null);
    } else if (f.pool === 'external') {
      q = q
        .is('cell_id', null)
        .eq('pending_external_send', true);
    } else if (f.pool === 'pending_assignment') {
      q = q
        .is('cell_id', null)
        .not('pending_assignment_cell_id', 'is', null);
    }
  }

  // ── Search ────────────────────────────────────────────────────
  // Tokenize on whitespace and AND the tokens via chained ilike
  // against search_haystack (migration 0034). Each token uses the
  // trigram index, so the chained match still ends up cheap.
  if (isSearching) {
    const tokens = normalize(f.search).split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      // Escape `%` and `_` from user input so they're literal.
      const safe = token.replace(/[%_]/g, ch => `\\${ch}`);
      q = q.ilike('search_haystack', `%${safe}%`);
    }
  }

  // ── Equality / IS NULL filters ────────────────────────────────
  if (f.filterCuerda) q = q.eq('numero_cuerda', f.filterCuerda);

  if (f.filterResponsable === '__none__') {
    q = q.is('responsable_id', null);
  } else if (f.filterResponsable === '__church_cuerda__') {
    q = q.is('responsable_id', null);
    if (f.churchCuerdaNumero) q = q.eq('numero_cuerda', f.churchCuerdaNumero);
  } else if (f.filterResponsable) {
    q = q.eq('responsable_id', f.filterResponsable);
  }

  if (f.filterConector === '__none__') {
    q = q.is('conector', null);
  } else if (f.filterConector) {
    // Conector is stored in normalizeName() form by the DB trigger,
    // so we can do equality against the same normalization client-side.
    q = q.eq('conector', normalizeName(f.filterConector));
  }

  if (f.filterOnlyWithCoords) {
    q = q.not('lat', 'is', null).not('lng', 'is', null);
  }

  // restrictToCuerda is the internal counterpart to filterCuerda
  // (which is the user's dropdown choice). Used when the Zona filter
  // is active so the client polygon test only sees contacts of the
  // user's own cuerda, across all pages.
  if (f.restrictToCuerda) {
    q = q.eq('numero_cuerda', f.restrictToCuerda);
  }

  // ── Sort ──────────────────────────────────────────────────────
  if (f.sortBy === 'nombre') {
    q = q.order('search_name', { ascending: f.sortDir === 'asc' });
  } else if (f.sortBy === 'fecha') {
    q = q.order('fecha_contacto', { ascending: f.sortDir === 'asc', nullsFirst: false });
  } else {
    q = q.order('fecha_contacto', { ascending: false, nullsFirst: false });
  }
  // Secondary tie-breaker on id keeps .range() pagination stable across
  // calls — without it, rows with equal fecha_contacto can swap places
  // between page N and page N+1 (the bug that prompted the original
  // server-side pagination of the bulk fetch back in PR #14).
  q = q.order('id', { ascending: true });

  // ── Pagination ────────────────────────────────────────────────
  const from = f.page * f.pageSize;
  const to = (f.page + 1) * f.pageSize - 1;
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) {
    console.error('[fetchPoolPage]', error, { filters: f });
    throw error;
  }
  return {
    rows: (data || []) as unknown as TRow[],
    totalCount: count ?? 0,
  };
}

// ─── Count-only queries for the pool tab chips ───────────────────
//
// The Inbox / Outbox / Pending Asignación chips at the top show
// counts even when the user is on a different tab — so we run their
// counts as small head queries with the visibility gate applied but
// no further filters.

export interface PoolCountFilters {
  churchId: string;
  userId: string | null;
  userCuerda: string | null;
  canSeeAllCuerdas: boolean;
  isMjaMember: boolean;
}

const applyVisibilityScope = (
  builder: any,
  f: { canSeeAllCuerdas: boolean; userCuerda: string | null; userId: string | null; userRole?: string | null },
) => {
  // Same precedence as fetchPoolPage: conector → created_by, then
  // cuerda → numero_cuerda, then fallback → responsable_id.
  if (f.userRole === 'conector') {
    return f.userId
      ? builder.eq('created_by', f.userId)
      : builder.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  if (f.canSeeAllCuerdas) return builder;
  if (f.userCuerda) return builder.eq('numero_cuerda', f.userCuerda);
  if (f.userId) return builder.eq('responsable_id', f.userId);
  return builder.eq('id', '00000000-0000-0000-0000-000000000000');
};

export async function fetchPoolCounts(f: PoolCountFilters): Promise<{
  inbox: number;
  outbox: number;
  pending: number;
}> {
  const inboxBuilder = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', f.churchId)
    .is('deleted_at', null)
    .is('cell_id', null)
    .or('pending_external_send.is.null,pending_external_send.eq.false')
    .is('pending_assignment_cell_id', null);

  const outboxBuilder = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', f.churchId)
    .is('deleted_at', null)
    .is('cell_id', null)
    .eq('pending_external_send', true);

  // Pending assignment chip only shows for MJA members, but counting
  // is cheap so we always compute it.
  const pendingBuilder = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', f.churchId)
    .is('deleted_at', null)
    .is('cell_id', null)
    .not('pending_assignment_cell_id', 'is', null);

  const [inboxRes, outboxRes, pendingRes] = await Promise.all([
    applyVisibilityScope(inboxBuilder, f),
    applyVisibilityScope(outboxBuilder, f),
    applyVisibilityScope(pendingBuilder, f),
  ]);
  return {
    inbox: inboxRes.count ?? 0,
    outbox: outboxRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  };
}

// ─── Dropdown option queries ────────────────────────────────────
//
// The three dropdowns (Cuerda, Responsable, Conector) used to be
// computed from the in-memory contact list. After the refactor we
// query them separately and small.

export async function fetchDistinctCuerdas(churchId: string, visibility: {
  canSeeAllCuerdas: boolean; userCuerda: string | null; userId: string | null;
}): Promise<string[]> {
  let q = supabase
    .from('contacts')
    .select('numero_cuerda')
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .not('numero_cuerda', 'is', null);
  q = applyVisibilityScope(q, visibility);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  const seen = new Set<string>();
  (data || []).forEach((r: any) => { if (r.numero_cuerda) seen.add(r.numero_cuerda); });
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export async function fetchDistinctResponsables(churchId: string, visibility: {
  canSeeAllCuerdas: boolean; userCuerda: string | null; userId: string | null;
}): Promise<string[]> {
  let q = supabase
    .from('contacts')
    .select('responsable_id')
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .not('responsable_id', 'is', null);
  q = applyVisibilityScope(q, visibility);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  const seen = new Set<string>();
  (data || []).forEach((r: any) => { if (r.responsable_id) seen.add(r.responsable_id); });
  return Array.from(seen);
}

export async function fetchDistinctConectores(churchId: string, visibility: {
  canSeeAllCuerdas: boolean; userCuerda: string | null; userId: string | null;
}): Promise<string[]> {
  let q = supabase
    .from('contacts')
    .select('conector')
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .not('conector', 'is', null);
  q = applyVisibilityScope(q, visibility);
  const { data, error } = await q.limit(10000);
  if (error) throw error;
  const seen = new Set<string>();
  (data || []).forEach((r: any) => { if (r.conector) seen.add(r.conector); });
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'es'));
}
