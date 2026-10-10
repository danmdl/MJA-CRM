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
import { addDays, arDayStartIso, isIsoDay } from '@/lib/ar-date';
import type { FilterTabFilters } from '@/components/admin/FilterTabsBar';

// estado_civil is free text in the DB ('Soltero', 'Soltera', 'soltera',
// 'Soltero/a', 'Concubinato'...). Each dropdown option maps to a
// case-insensitive regex (Postgres ~*) that groups the real variants.
// Unknown options fall back to exact equality.
export const ESTADO_CIVIL_PATTERNS: Record<string, string> = {
  'Soltero/a': '^\\s*solter',
  'Casado/a': '^\\s*casad',
  'En pareja': 'pareja|concubin|novi',
  'Divorciado/a': 'divorci|separad',
  'Viudo/a': '^\\s*viud',
  'No brindó información': '^\\s*no brind',
};

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

  /** Filters of the active saved solapa (null on "Todos"). */
  tab: FilterTabFilters | null;
  /** 'in' / 'out' of a live shared route; needs routeContactIds. */
  routeFilter: '' | 'in' | 'out';
  routeContactIds: string[] | null;

  sortBy: SortBy;
  sortDir: SortDir;
  page: number;
  pageSize: number;
}

export interface PoolPage<TRow> {
  rows: TRow[];
  totalCount: number;
}

// Applies visibility, pool gate, search, toolbar filters, the active
// solapa's filters and the route filter. Returns null when the result
// is provably empty (e.g. 'En ruta' with no live routes) so callers can
// skip the round-trip.
function applyPoolFilters(q: any, f: PoolFilters): any | null {
  // ── Visibility scope ──────────────────────────────────────────
  //   - 'conector' role: only contacts they created (created_by).
  //   - Other non-globals with a cuerda: only their cuerda.
  //   - Other non-globals without a cuerda: only where responsable_id.
  //   - Globals (canSeeAllCuerdas): full church view.
  if (f.userRole === 'conector') {
    if (!f.userId) return null;
    q = q.eq('created_by', f.userId);
  } else if (!f.canSeeAllCuerdas) {
    if (f.userCuerda) q = q.eq('numero_cuerda', f.userCuerda);
    else if (f.userId) q = q.eq('responsable_id', f.userId);
    else return null;
  }

  // ── Pool gate ─────────────────────────────────────────────────
  // Searching crosses pool boundaries so users can find anyone.
  // pending_external_send is NOT NULL DEFAULT false, so plain equality
  // replaces the old null-or-false OR (keeps the query at a single
  // PostgREST `or` param, used below by the MJA filter).
  const isSearching = f.search.trim().length > 0;
  if (!isSearching) {
    if (f.pool === 'unassigned') {
      q = q.is('cell_id', null).eq('pending_external_send', false).is('pending_assignment_cell_id', null);
    } else if (f.pool === 'external') {
      q = q.is('cell_id', null).eq('pending_external_send', true);
    } else if (f.pool === 'pending_assignment') {
      q = q.is('cell_id', null).not('pending_assignment_cell_id', 'is', null);
    }
  }

  // ── Search ────────────────────────────────────────────────────
  // Tokens AND-chained against search_haystack (trigram-indexed).
  if (isSearching) {
    const tokens = normalize(f.search).split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const safe = token.replace(/[%_]/g, ch => `\\${ch}`);
      q = q.ilike('search_haystack', `%${safe}%`);
    }
  }

  // ── Toolbar filters ───────────────────────────────────────────
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
    // Stored in normalizeName() form by a DB trigger.
    q = q.eq('conector', normalizeName(f.filterConector));
  }

  if (f.filterOnlyWithCoords) q = q.not('lat', 'is', null).not('lng', 'is', null);

  // Set internally while the Zona filter is active: 'En zona' is relative
  // to the logged-in user's own cuerda.
  if (f.restrictToCuerda) q = q.eq('numero_cuerda', f.restrictToCuerda);

  // ── Saved solapa ──────────────────────────────────────────────
  const t = f.tab;
  if (t) {
    if (t.mjaReceived) q = q.or('received_from_mja_at.not.is.null,sent_to_mja_at.not.is.null');

    // Legacy tabs saved a single `cuerda`; newer ones the `cuerdas` array.
    const cuerdas = t.cuerdas && t.cuerdas.length > 0 ? t.cuerdas : t.cuerda ? [t.cuerda] : null;
    if (cuerdas) q = q.in('numero_cuerda', cuerdas);

    if (t.responsable === '__none__') q = q.is('responsable_id', null);
    else if (t.responsable) q = q.eq('responsable_id', t.responsable);

    if (t.sexo) q = q.eq('sexo', t.sexo);

    if (t.estadoCivil) {
      const re = ESTADO_CIVIL_PATTERNS[t.estadoCivil];
      q = re ? q.filter('estado_civil', 'imatch', re) : q.eq('estado_civil', t.estadoCivil);
    }

    const edadMin = parseInt(t.edadMin || '', 10);
    const edadMax = parseInt(t.edadMax || '', 10);
    if (!Number.isNaN(edadMin)) q = q.gte('edad', edadMin);
    if (!Number.isNaN(edadMax)) q = q.lte('edad', edadMax);

    // Keys keep the legacy fechaContacto* names for saved tabs; the
    // dialog labels them "Fecha de creación" and they filter created_at
    // by Argentina calendar day ('hasta' is inclusive).
    if (isIsoDay(t.fechaContactoFrom)) q = q.gte('created_at', arDayStartIso(t.fechaContactoFrom));
    if (isIsoDay(t.fechaContactoTo)) q = q.lt('created_at', arDayStartIso(addDays(t.fechaContactoTo, 1)));

    if (t.zonaId) q = q.eq('zona_id', t.zonaId);

    if (t.hasPhone === 'yes') q = q.not('phone', 'is', null);
    else if (t.hasPhone === 'no') q = q.is('phone', null);

    if (t.hasAddress === 'yes') q = q.not('address', 'is', null);
    else if (t.hasAddress === 'no') q = q.is('address', null);

    if (t.hasCoords === 'yes') q = q.not('lat', 'is', null).not('lng', 'is', null);
    else if (t.hasCoords === 'no') q = q.is('lat', null);
  }

  // ── En ruta ───────────────────────────────────────────────────
  if (f.routeFilter) {
    const ids = f.routeContactIds || [];
    if (f.routeFilter === 'in') {
      if (ids.length === 0) return null;
      q = q.in('id', ids);
    } else if (ids.length > 0) {
      q = q.not('id', 'in', `(${ids.join(',')})`);
    }
  }

  return q;
}

function applyPoolSort(q: any, f: PoolFilters): any {
  if (f.sortBy === 'nombre') {
    q = q.order('search_name', { ascending: f.sortDir === 'asc' });
  } else {
    q = q.order('fecha_contacto', { ascending: f.sortBy === 'fecha' && f.sortDir === 'asc', nullsFirst: false });
  }
  // Tie-breaker on id keeps .range() pagination stable across calls.
  return q.order('id', { ascending: true });
}

/**
 * Build and run a Semillero pool query against `contacts` with all
 * filters applied server-side. Returns the page rows + total count
 * for the filtered set so the UI can render "page N of M".
 */
export async function fetchPoolPage<TRow = any>(f: PoolFilters): Promise<PoolPage<TRow>> {
  const base = supabase
    .from('contacts')
    .select(POOL_ROW_COLUMNS, { count: 'exact' })
    .eq('church_id', f.churchId)
    .is('deleted_at', null);
  const filtered = applyPoolFilters(base, f);
  if (!filtered) return { rows: [], totalCount: 0 };

  const from = f.page * f.pageSize;
  const { data, count, error } = await applyPoolSort(filtered, f).range(from, from + f.pageSize - 1);
  if (error) {
    console.error('[fetchPoolPage]', error, { filters: f });
    throw error;
  }
  return {
    rows: (data || []) as unknown as TRow[],
    totalCount: count ?? 0,
  };
}

/**
 * Every row matching the filters (ignores page/pageSize), walked in
 * 1000-row chunks to get past the PostgREST response cap. Used when a
 * filter can only be evaluated client-side (the Zona polygon test) so
 * it sees the whole filtered set instead of a single page.
 */
export async function fetchPoolAll<TRow = any>(f: PoolFilters, maxRows = 20000): Promise<TRow[]> {
  const CHUNK = 1000;
  const all: TRow[] = [];
  for (let from = 0; from < maxRows; from += CHUNK) {
    const base = supabase
      .from('contacts')
      .select(POOL_ROW_COLUMNS)
      .eq('church_id', f.churchId)
      .is('deleted_at', null);
    const filtered = applyPoolFilters(base, f);
    if (!filtered) return [];
    const { data, error } = await applyPoolSort(filtered, f).range(from, from + CHUNK - 1);
    if (error) {
      console.error('[fetchPoolAll]', error, { filters: f });
      throw error;
    }
    const rows = (data || []) as unknown as TRow[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all;
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
// Distinct Cuerda / Responsable / Conector values for the toolbar
// dropdowns, computed in SQL (migration 0040). Selecting the column and
// de-duplicating here was capped at 1000 rows by PostgREST, so most
// options were missing (e.g. 39 of 188 conectores).

interface DropdownVisibility {
  canSeeAllCuerdas: boolean;
  userCuerda: string | null;
  userId: string | null;
  userRole?: string | null;
}

async function fetchFilterOptions(
  churchId: string,
  kind: 'cuerda' | 'responsable' | 'conector',
  v: DropdownVisibility,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_pool_filter_options', {
    p_church_id: churchId,
    p_kind: kind,
    p_user_role: v.userRole ?? null,
    p_user_cuerda: v.userCuerda,
    p_user_id: v.userId,
    p_can_see_all: v.canSeeAllCuerdas,
  });
  if (error) throw error;
  return ((data || []) as string[]).filter(Boolean);
}

export async function fetchDistinctCuerdas(churchId: string, visibility: DropdownVisibility): Promise<string[]> {
  const values = await fetchFilterOptions(churchId, 'cuerda', visibility);
  return values.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export async function fetchDistinctResponsables(churchId: string, visibility: DropdownVisibility): Promise<string[]> {
  return fetchFilterOptions(churchId, 'responsable', visibility);
}

export async function fetchDistinctConectores(churchId: string, visibility: DropdownVisibility): Promise<string[]> {
  const values = await fetchFilterOptions(churchId, 'conector', visibility);
  return values.sort((a, b) => a.localeCompare(b, 'es'));
}
