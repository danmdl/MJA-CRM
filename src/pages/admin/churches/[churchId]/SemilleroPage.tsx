"use client";
import React, { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { logAdminAction } from '@/lib/audit-log';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users, Search, Undo2, ChevronDown, Zap, ExternalLink, Upload, PlusCircle, RefreshCw, Eye, MapPin, Trash2, Filter, ArrowUp, ArrowDown, ArrowUpDown, Columns3,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { normalize } from '@/lib/normalize';
import { isValidArgentinePhone } from '@/lib/phone-validation';
import { isWithinGBA, getDistanceColor, getDistanceBadgeClass } from '@/lib/geo-validation';
import { geoJsonToGooglePaths, isPointInTerritory } from '@/lib/territory-utils';
import { buildGeocodeAddress } from '@/lib/geocode-address';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import {
  fetchPoolPage,
  fetchPoolCounts,
  fetchDistinctCuerdas,
  fetchDistinctResponsables,
  fetchDistinctConectores,
  type PoolKind,
} from '@/lib/semillero-pool-query';
import ContactMapDialog from '@/components/admin/ContactMapDialog';
import WhatsAppComposeDialog, { WhatsAppIcon } from '@/components/admin/WhatsAppComposeDialog';
import FilterTabsBar, { applyFilterTab, FilterTabFilters, MJA_RECEIVED_TAB_ID } from '@/components/admin/FilterTabsBar';
// Heavy dialogs are lazy: they're conditionally rendered (open && <Dialog>),
// so the chunk only downloads when the user actually opens one. Pulled out
// roughly 70KB of JS from the SemilleroPage initial load.
const ContactProfileDialog = lazy(() => import('@/components/admin/ContactProfileDialog'));
const CsvImporter = lazy(() => import('@/components/admin/CsvImporter'));
const BulkWhatsAppDialog = lazy(() => import('@/components/admin/BulkWhatsAppDialog'));
const AddContactDialog = lazy(() => import('@/components/admin/AddContactDialog'));
const DuplicateMergeDialog = lazy(() => import('@/components/admin/DuplicateMergeDialog'));
import type { Zona, Barrio, Cuerda, Cell, Contact } from './semillero/types';
import {
  haversine,
  detectZonaForContact as detectZonaForContactPure,
  getCellsByDistance as getCellsByDistancePure,
} from './semillero/helpers';
import { ResizableHeader } from './semillero/ResizableHeader';
import { BulkDeleteDialog } from './semillero/BulkDeleteDialog';
import { BulkAssignDialog } from './semillero/BulkAssignDialog';
import { PaginationControls } from './semillero/PaginationControls';
import { AssignConfirmDialog, type ConfirmDialogState } from './semillero/AssignConfirmDialog';

// ─── Main Component ──────────────────────────────────────────────
const SemilleroPage = () => {
  const { churchId: _churchSlug } = useParams<{ churchId: string }>();
  const churchId = useChurchUuid();
  const { session, profile } = useSession();
  const queryClient = useQueryClient();

  const [activePool, setActivePool] = useState<string>('unassigned');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuerda, setFilterCuerda] = useState<string>('');
  const [filterResponsable, setFilterResponsable] = useState<string>('');
  // Filter by conector — same string-match pattern as filterResponsable but
  // on contact.conector (free-text). '' = todos, '__none__' = sin conector
  // (NULL or empty), anything else = exact-match the chosen value.
  const [filterConector, setFilterConector] = useState<string>('');
  // Toggle that narrows the table to rows whose normalized full name
  // appears more than once in this church's contacts. Same set as the
  // amber dot pill renders — when this is on, you only see the
  // contacts marked as possible duplicates.
  const [filterDuplicates, setFilterDuplicates] = useState<boolean>(false);
  const [filterOnlyWithCoords, setFilterOnlyWithCoords] = useState<boolean>(false);
  const [filterZonaStatus, setFilterZonaStatus] = useState<'' | 'in' | 'out'>('');
  // 'En ruta' / 'Sin ruta' filter — pairs with the new Ruta column.
  const [filterRoute, setFilterRoute] = useState<'' | 'in' | 'out'>('');
  // Pagination — pages of 200 contacts. The table is non-virtualized, so
  // dropping a thousand+ <tr>s into the DOM at once added noticeable click
  // and scroll lag. Pagination keeps the rendered set small while still
  // letting the user reach any contact via the page controls. The user is
  // taken back to page 0 whenever the filtered set changes shape (filter,
  // search, pool switch, etc.) — landing on page 5 of a freshly-narrowed
  // 80-row result would be jarring.
  const [currentPage, setCurrentPage] = useState<number>(0);
  const PAGE_SIZE = 200;
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeTabFilters, setActiveTabFilters] = useState<FilterTabFilters>({});
  // Sort state: which column and direction. null = default order from query.
  const [sortBy, setSortBy] = useState<'nombre' | 'fecha' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Track whether we've applied the per-user filter defaults yet, so we only
  // do it once per session and don't overwrite user changes on re-renders.
  const filterDefaultsAppliedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [recentImportIds, setRecentImportIds] = useState<Set<string>>(new Set());
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [mapContact, setMapContact] = useState<{ name: string; address: string; sugCell: { name: string; address: string | null; lat: number | null; lng: number | null; cuerdaNumero?: string; meetingDay?: string | null; meetingTime?: string | null } | null } | null>(null);
  const [whatsappCompose, setWhatsappCompose] = useState<{ contactId: string; name: string; firstName: string; lastName: string; phone: string } | null>(null);
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  // When non-null, the duplicate merge dialog is open and the array contains
  // every contact in the same name-group as the one the user clicked on.
  const [mergeGroup, setMergeGroup] = useState<Contact[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [undoData, setUndoData] = useState<{
    contactIds: string[];
    prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null; cell_id: string | null }[];
  } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Track the index (within filteredContacts) of the last checkbox the user
  // clicked, so shift-click can select the range between two clicks. Same
  // pattern as Gmail/file managers.
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);
  // Bulk-assign-responsable dialog state
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignTargetId, setBulkAssignTargetId] = useState<string>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const [colWidths, setColWidths] = useState({
    check: 34, cuerda: 60, nombre: 130, dup: 44, responsable: 100, telefono: 110, direccion: 130, fechaContacto: 56, sugerencia: 150, asignar: 110, conector: 110, ruta: 56,
  });
  const resizeCol = (col: keyof typeof colWidths) => (delta: number) => {
    setColWidths(prev => ({ ...prev, [col]: Math.max(60, prev[col] + delta) }));
  };

  // Optional columns the user can toggle from the "Columnas" dropdown in the
  // toolbar. Defaults are OFF for cuerda (most users only care about their
  // own cuerda anyway) and ON for conector (every Semillero workflow uses
  // it). Both choices persist in localStorage so the table stays the way
  // each user left it.
  const [showConectorCol, setShowConectorCol] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('semillero.showConectorCol');
    return v === null ? true : v === '1';
  });
  const [showCuerdaCol, setShowCuerdaCol] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('semillero.showCuerdaCol') === '1';
  });
  // Duplicates column off by default. The DUP badge is mostly useful
  // when the user is actively de-duping; for day-to-day work it's
  // visual noise (~2% of rows show it, but the column eats space on
  // every row). User can toggle via the Columns3 menu and the choice
  // persists.
  const [showDupCol, setShowDupCol] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('semillero.showDupCol') === '1';
  });
  // 'En ruta' column: a small badge per contact when they're a stop in
  // any non-expired shared_route. Lets the referente filter for "qué
  // contactos ya planeé visitar". Defaults to ON because once you adopt
  // the routes flow it becomes the answer to "who's already planned".
  const [showRutaCol, setShowRutaCol] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('semillero.showRutaCol');
    return v === null ? true : v === '1';
  });
  useEffect(() => { try { window.localStorage.setItem('semillero.showConectorCol', showConectorCol ? '1' : '0'); } catch {} }, [showConectorCol]);
  useEffect(() => { try { window.localStorage.setItem('semillero.showCuerdaCol', showCuerdaCol ? '1' : '0'); } catch {} }, [showCuerdaCol]);
  useEffect(() => { try { window.localStorage.setItem('semillero.showDupCol', showDupCol ? '1' : '0'); } catch {} }, [showDupCol]);
  useEffect(() => { try { window.localStorage.setItem('semillero.showRutaCol', showRutaCol ? '1' : '0'); } catch {} }, [showRutaCol]);

  // Assignment permission comes from canAssignContacts() via usePermissions
  const { canAddContacts, canImportCsv, canAssignContacts, canSendWhatsapp, canEditDeleteContacts, canAutoAssign, canFilterAllContacts } = usePermissions();
  const userCuerdaNumero = profile?.numero_cuerda || null;
  // The Semillero is the user's "my cuerda" working view. Visibility here is
  // strictly role-based — admin/general/pastor/supervisor see everything,
  // anyone else (referente, encargado_de_celula, consolidador, conector,
  // anfitrion) sees only their own cuerda. The base_datos_total permission
  // gates wider visibility in Cuerdas/Células pages but does NOT widen the
  // Semillero — that's role-based on purpose, so a referente with
  // base_datos_total=true still only sees their cuerda's "Sin asignar" pool.
  const canSeeContactsFromAllCuerdas = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';

  // For users without canFilterAllContacts permission, force filter to their
  // own contacts (security restriction). The actual effect lives further
  // down, AFTER the `cuerdas` query is declared — moving it past that
  // declaration is what kept the TDZ ('Cannot access before initialization')
  // error from biting. Don't move this hook back up here without also
  // refactoring the cuerdas reference out of it.

  // ─── Data Fetching ─────────────────────────────────────────────
  // Zonas, barrios, cuerdas, cells: these change very rarely. 5 min staleTime
  // means we don't re-fetch on every component remount. Mutations on these
  // tables explicitly invalidate the relevant query keys when they happen.
  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => { const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!).order('nombre'); return data || []; },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: barrios } = useQuery<Barrio[]>({
    queryKey: ['barrios', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const { data } = await supabase.from('barrios').select('id, nombre, zona_id').in('zona_id', zonas.map(z => z.id));
      return data || [];
    },
    enabled: !!zonas?.length,
    staleTime: 5 * 60_000,
  });

  const { data: cuerdas } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas-pool', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const { data } = await supabase
        .from('cuerdas_with_geojson')
        .select('id, numero, zona_id, is_church_cuerda, territory_geojson')
        .in('zona_id', zonas.map(z => z.id));
      return data || [];
    },
    enabled: !!zonas?.length,
    staleTime: 5 * 60_000,
  });

  // Pre-parse each cuerda's territory once. Used by the row renderer
  // to classify the suggested cell as 'En zona' / 'Fuera' instead of
  // a raw km distance, when the suggested cuerda has a defined
  // territory. Cuerdas without a territory still render the km label
  // (legacy behavior, important for MJA Central where there's no
  // territory ever).
  const cuerdaTerritoryMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof geoJsonToGooglePaths>>();
    for (const cu of cuerdas || []) {
      m.set(cu.id, geoJsonToGooglePaths(cu.territory_geojson || null));
    }
    return m;
  }, [cuerdas]);

  // Default filterResponsable on first useful render. Admins/generals
  // start unfiltered (they use FilterTabs to slice). MJA members
  // (anyone whose numero_cuerda matches an is_church_cuerda) also
  // start unfiltered — per Dan: 'en MJA Central siempre, por default,
  // va a estar seteado a Todos'. Everyone else without
  // canFilterAllContacts permission gets locked to their own
  // contacts (security restriction).
  //
  // Why is this hook DOWN HERE instead of next to the other
  // initialization hooks? Because we read `cuerdas` from the query
  // above to detect church-cuerda membership, and a `const`
  // declaration can't be referenced from code that runs above it
  // without triggering a Temporal Dead Zone error in production
  // (minified as 'Cannot access X before initialization'). Keep
  // this effect's position below the cuerdas declaration.
  useEffect(() => {
    if (filterDefaultsAppliedRef.current) return;
    if (!profile || !session?.user?.id) return;
    if (profile.role === 'admin' || profile.role === 'general') {
      filterDefaultsAppliedRef.current = true;
      return;
    }
    if (profile.role === 'conector') {
      filterDefaultsAppliedRef.current = true;
      return;
    }
    // Wait for cuerdas data so we can detect MJA membership before
    // committing a default that's hard to undo (filterDefaultsAppliedRef
    // is single-shot).
    if (!cuerdas) return;
    const churchCuerdaNumero = (cuerdas || []).find(cu => cu.is_church_cuerda)?.numero;
    const userIsMja = !!(profile.numero_cuerda && churchCuerdaNumero && profile.numero_cuerda === churchCuerdaNumero);
    if (!canFilterAllContacts() && !userIsMja) {
      setFilterResponsable(session.user.id);
    }
    filterDefaultsAppliedRef.current = true;
  }, [profile, session?.user?.id, canFilterAllContacts, cuerdas]);

  // Team members for Responsable dropdown.
  // staleTime is 5 min because team membership changes very rarely.
  const { data: teamMembers } = useQuery<{ id: string; first_name: string; last_name: string; numero_cuerda: string | null }[]>({
    queryKey: ['team-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name, numero_cuerda').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Build a lookup map from teamMembers for resolving responsable names in
  // the table cells and filter dropdowns. The previous version was a separate
  // useQuery that fetched ALL profiles in the entire database with no filter
  // (queryKey 'all-profiles-creator-lookup'), which was the main slowdown
  // the user reported. The responsable_id field is only ever set to one of
  // the 4 eligible roles (consolidador, encargado_de_celula, referente,
  // supervisor) by the auto_assign_responsable trigger, and all of those roles
  // belong to a specific church, so they're guaranteed to be in teamMembers.
  // No need for a global profile lookup.
  const profileById = React.useMemo(() => {
    const m = new Map<string, { first_name: string; last_name: string }>();
    (teamMembers || []).forEach(p => m.set(p.id, { first_name: p.first_name, last_name: p.last_name }));
    return m;
  }, [teamMembers]);

  // Promoted from later in the file — the new server-paginated pool
  // query (right below) needs churchCuerda.numero to translate the
  // "__church_cuerda__" responsable special value into a SQL eq.
  const churchCuerda = useMemo(
    () => (cuerdas || []).find(cu => cu.is_church_cuerda),
    [cuerdas],
  );

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, name, church_id, cuerda_id, address, lat, lng, meeting_day, meeting_time').eq('church_id', churchId!).is('deleted_at', null);
      return (data || []) as Cell[];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Set of contact ids that appear in at least one non-expired shared
  // route. Powers the 'En ruta' badge column + filter — referente can
  // see at a glance which contacts are already planned for a visit and
  // which still need one. Refresh interval matches the Rutas grid (20s)
  // so toggling a stop in the route editor reflects in the Semillero
  // without a manual refresh.
  const { data: routeContactIds } = useQuery<Set<string>>({
    queryKey: ['route-contact-ids', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shared_routes')
        .select('ordered_contact_ids')
        .eq('church_id', churchId!)
        .gt('expires_at', new Date().toISOString());
      const set = new Set<string>();
      (data || []).forEach((row: any) => {
        ((row.ordered_contact_ids || []) as string[]).forEach(id => set.add(id));
      });
      return set;
    },
    enabled: !!churchId,
    staleTime: 20_000,
  });

  // Server-paginated pool query (migration from the old "load everything
  // into memory" pattern). Each filter / sort / page change refires the
  // query with a fresh set of params; the server returns just the rows
  // for the current page plus the total filtered count so the UI can
  // render pagination correctly.
  //
  // Why this matters: the old pattern broke at ~10–15k contacts/church
  // and was completely unworkable past 50k. With server-side pagination
  // the page now scales to 500k+ contacts without changing UX.
  //
  // Caveats handled below:
  //   - duplicate detection now only sees the current page; users get
  //     a degraded experience when filterDuplicates is on at a giant
  //     church. A dedicated "find duplicates across base" action will
  //     come later.
  //   - zona-polygon filter likewise only applies to the current page.
  //   - Dropdown options (cuerda/responsable/conector) come from their
  //     own small queries below.
  //   - Pool-tab chip counts come from a separate count query.
  //
  // The query key intentionally lists every filter dependency so React
  // Query refetches on any change. activePool isn't included when a
  // search term is present (search crosses pool boundaries server-side).
  const { data: poolPage, isLoading } = useQuery<{ rows: Contact[]; totalCount: number }>({
    queryKey: [
      'pool-page', churchId,
      currentPage, PAGE_SIZE,
      activePool, searchTerm.trim(),
      filterCuerda, filterResponsable, filterConector, filterOnlyWithCoords,
      sortBy, sortDir,
      profile?.id, profile?.role, profile?.numero_cuerda,
    ],
    queryFn: () => fetchPoolPage<Contact>({
      churchId: churchId!,
      userId: profile?.id || null,
      userRole: profile?.role || null,
      userCuerda: profile?.numero_cuerda || null,
      canSeeAllCuerdas: canSeeContactsFromAllCuerdas,
      pool: activePool as PoolKind,
      search: searchTerm,
      filterCuerda,
      filterResponsable,
      filterConector,
      filterOnlyWithCoords,
      churchCuerdaNumero: churchCuerda?.numero || null,
      sortBy,
      sortDir,
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
    enabled: !!churchId && !!profile,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: prev => prev, // keep previous page visible during fetch
  });
  const allContacts = poolPage?.rows;
  const totalFilteredCount = poolPage?.totalCount ?? 0;

  // Church coords for geocoding bias. Without this, addresses like
  // "Las Heras 645" get matched to the most popular hit (often Capital
  // Federal) even though the church is in San Martín. Querying lat/lng
  // here (added as columns to churches) lets us pass `bounds` to the
  // geocoder so results near the church win.
  const { data: church } = useQuery<{ id: string; address: string | null; lat: number | null; lng: number | null } | null>({
    queryKey: ['church-coords', churchId],
    queryFn: async () => {
      if (!churchId) return null;
      const { data } = await supabase.from('churches').select('id, address, lat, lng').eq('id', churchId).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 60 * 60_000,
  });

  // Pairs the user has confirmed are NOT duplicates (despite same name).
  // Loaded once per church; the duplicate detector below subtracts these
  // from the set of "interesting" pairs before deciding which contacts to
  // light up with the amber dot.
  const { data: dedupeDismissals } = useQuery<Array<{ contact_id_a: string; contact_id_b: string }>>({
    queryKey: ['dedupe-dismissals', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_dedupe_dismissals')
        .select('contact_id_a, contact_id_b');
      return (data || []) as any[];
    },
    enabled: !!churchId,
    staleTime: 60_000,
  });

  // ─── Real duplicates: same first_name+last_name within this church ──────────
  // Builds a Set of contact ids whose normalized full name appears more than
  // once in the church's contacts AND there's at least one PAIR of contacts
  // in their name-group that the user hasn't dismissed as "different people".
  // Used to render the amber dot pill next to the name in the table and to
  // power the Duplicados filter toggle.
  //
  // Scoped to the contacts the CURRENT USER can see — non-globals only count
  // duplicates within their own cuerda (or, if they have no cuerda, within
  // the contacts where they're the responsable). A referente in cuerda 204
  // shouldn't see "141 duplicados" if half of those are in cuerda 105 and
  // they couldn't act on them anyway.
  //
  // Also computes duplicateGroupByContactId so the merge dialog can pull up
  // every contact that shares a name with the one the user clicked.
  const { duplicateNameIds, duplicateGroupByContactId } = useMemo(() => {
    const idSet = new Set<string>();
    const byContact = new Map<string, string[]>(); // contact id → all ids in same name-group (incl. itself)
    if (!allContacts?.length) return { duplicateNameIds: idSet, duplicateGroupByContactId: byContact };
    const userId = session?.user?.id;
    // Only consider contacts this user is allowed to see. Same gate the
    // row pipeline applies to filteredContacts — keeps the dot count and
    // the Duplicados pill in sync with the user's actual view.
    const visible = allContacts.filter(c => {
      if (canSeeContactsFromAllCuerdas) return true;
      if (userCuerdaNumero) return c.numero_cuerda === userCuerdaNumero;
      return c.responsable_id === userId;
    });
    if (visible.length === 0) return { duplicateNameIds: idSet, duplicateGroupByContactId: byContact };
    // 1) Group all visible contacts by normalized full name.
    const groups = new Map<string, string[]>();
    visible.forEach(c => {
      const full = normalize(`${c.first_name || ''} ${c.last_name || ''}`).replace(/\s+/g, ' ').trim();
      if (!full) return;
      const arr = groups.get(full) || [];
      arr.push(c.id);
      groups.set(full, arr);
    });
    // 2) Build a fast lookup of dismissed pairs. The table stores them with
    //    the lower UUID first (CHECK constraint), so we lookup the same way.
    const dismissedKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const dismissed = new Set<string>();
    (dedupeDismissals || []).forEach(d => dismissed.add(dismissedKey(d.contact_id_a, d.contact_id_b)));
    // 3) For each name-group of size 2+, walk every pair. If at least one
    //    pair is NOT dismissed, every id in that group counts as a duplicate.
    //    If EVERY pair is dismissed (the user already resolved all of them
    //    as different people), the group falls out entirely.
    groups.forEach(ids => {
      if (ids.length < 2) return;
      let anyLive = false;
      for (let i = 0; i < ids.length && !anyLive; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (!dismissed.has(dismissedKey(ids[i], ids[j]))) {
            anyLive = true;
            break;
          }
        }
      }
      if (anyLive) {
        ids.forEach(id => {
          idSet.add(id);
          byContact.set(id, ids);
        });
      }
    });
    return { duplicateNameIds: idSet, duplicateGroupByContactId: byContact };
  }, [allContacts, dedupeDismissals, canSeeContactsFromAllCuerdas, userCuerdaNumero, session?.user?.id]);

  // ─── Extra responsable lookup ──────────────────────────────────────────────
  // teamMembers is scoped to this church. When a contact's responsable_id
  // points at someone OUTSIDE the church (admin global with church_id NULL,
  // cross-church supervisor, legacy assignment), profileById can't resolve
  // it and the dropdown silently drops them. This top-up query loads
  // exactly those missing ids and produces an extended map that the filter
  // dropdown reads from. The original profileById is left alone — that one
  // backs other parts of the page (table cells, etc.) and doesn't need the
  // extra rows.
  const missingResponsableIds = useMemo(() => {
    if (!allContacts?.length || !teamMembers) return [] as string[];
    const known = new Set(teamMembers.map(m => m.id));
    const missing = new Set<string>();
    allContacts.forEach(c => {
      if (c.responsable_id && !known.has(c.responsable_id)) missing.add(c.responsable_id);
    });
    return Array.from(missing);
  }, [allContacts, teamMembers]);

  const { data: extraResponsableProfiles } = useQuery<Array<{ id: string; first_name: string | null; last_name: string | null }>>({
    queryKey: ['extra-responsable-profiles', missingResponsableIds.slice().sort().join(',')],
    queryFn: async () => {
      if (missingResponsableIds.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', missingResponsableIds);
      return data || [];
    },
    enabled: missingResponsableIds.length > 0,
    staleTime: 5 * 60_000,
  });

  // Extended map used ONLY by the Responsable filter dropdown render.
  // Everything else still uses profileById to avoid behavior changes.
  const profileByIdExtended = useMemo(() => {
    const m = new Map<string, { first_name: string; last_name: string }>(profileById);
    (extraResponsableProfiles || []).forEach(p =>
      m.set(p.id, { first_name: p.first_name || '', last_name: p.last_name || '' })
    );
    return m;
  }, [profileById, extraResponsableProfiles]);

  // O(1) lookup of full team-member records by id. Previously the row
  // render did `teamMembers?.find(...)` for every row on every re-render —
  // O(rows × team). At 200 rows × 24 members that's 4800 comparisons per
  // render; multiplied by every keystroke in a filter input it adds up
  // fast. Hoisting to a memo makes per-row access O(1).
  const teamMemberById = useMemo(
    () => new Map((teamMembers || []).map(m => [m.id, m])),
    [teamMembers],
  );
  // Same trick for the three reference tables the row + dialogs hit on
  // every re-render. Each row's `assignedCell`, `assignedCuerda`,
  // `assignedZona` previously chained three `.find()` calls — O(N) per
  // row for each one. Maps make the chain O(1) per row and stable across
  // re-renders so memoization further up doesn't get invalidated.
  const cellById = useMemo(
    () => new Map((cells || []).map(c => [c.id, c])),
    [cells],
  );
  const cuerdaById = useMemo(
    () => new Map((cuerdas || []).map(c => [c.id, c])),
    [cuerdas],
  );
  const zonaById = useMemo(
    () => new Map((zonas || []).map(z => [z.id, z])),
    [zonas],
  );

  // ─── Auto-geocode contacts with address but no lat/lng (runs ONCE) ──────────
  const geocodedRef = useRef(false);
  useEffect(() => {
    if (geocodedRef.current) return;
    if (!allContacts?.length) return;
    const toGeocode = allContacts.filter(c => c.address && (c.lat == null || c.lng == null));
    if (toGeocode.length === 0) return;
    if (!(window as any).google?.maps) return;
    geocodedRef.current = true;
    const google = (window as any).google;
    const geocoder = new google.maps.Geocoder();
    let processed = 0;

    // Build a ~10 km box around the church to bias geocode results.
    // If the church doesn't have coords yet, we pass no bounds and
    // fall back to the GBA validation below.
    const churchBounds = (church?.lat != null && church?.lng != null)
      ? new google.maps.LatLngBounds(
          { lat: church.lat - 0.09, lng: church.lng - 0.09 }, // ~10 km SW
          { lat: church.lat + 0.09, lng: church.lng + 0.09 }, // ~10 km NE
        )
      : null;

    toGeocode.forEach((contact, i) => {
      setTimeout(() => {
        // Bias the geocode to the church's locality (e.g. "General San
        // Martin") instead of the historical hardcoded "Buenos Aires"
        // tail, which Google reads as CABA and sends every ambiguous
        // street name to Capital. The bounds box below stays as a
        // second layer of bias for cases where Google ignores the
        // textual hint. See src/lib/geocode-address.ts for details.
        const searchAddr = buildGeocodeAddress(contact.address || '', church?.address);
        const request: any = { address: searchAddr, region: 'AR' };
        if (churchBounds) request.bounds = churchBounds;
        geocoder.geocode(request, async (results: any[], status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            // VALIDATE: only save if within Greater Buenos Aires area
            if (isWithinGBA(lat, lng)) {
              await supabase.from('contacts').update({ lat, lng }).eq('id', contact.id);
            }
            // If outside GBA, coordinates are wrong — don't save them
          }
          processed++;
          if (processed >= toGeocode.length) {
            queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          }
        });
      }, i * 300);
    });
  }, [allContacts, churchId, queryClient, church?.lat, church?.lng, church?.address]);

  // ─── Cell suggestion by distance ───────────────────────────────
  // detectZonaForContact + getCellsByDistance are pure helpers in
  // ./semillero/helpers — these are just the memoized partials bound
  // to the current React Query results.
  const detectZonaForContact = useCallback(
    (contact: Contact) => detectZonaForContactPure(contact, zonas, barrios),
    [zonas, barrios],
  );

  const getCellsByDistance = useCallback(
    (contact: Contact, filterZona?: Zona | null) =>
      getCellsByDistancePure(contact, cells, cuerdas, filterZona),
    [cells, cuerdas],
  );

  // Compute suggestion: closest cell + its cuerda + zona
  const suggestions = useMemo(() => {
    const map: Record<string, { cell: Cell | null; cuerda: Cuerda | null; zona: Zona | null }> = {};
    allContacts?.forEach(c => {
      if (!c.cell_id) {
        const sugZona = detectZonaForContact(c);
        const sortedCells = getCellsByDistance(c, sugZona);
        const sugCell = sortedCells[0] || null;
        let sugCuerda: Cuerda | null = null;
        let sugZonaFinal = sugZona;
        if (sugCell?.cuerda_id && cuerdas?.length) {
          sugCuerda = cuerdas.find(cr => cr.id === sugCell.cuerda_id) || null;
          if (sugCuerda && zonas?.length) {
            sugZonaFinal = zonas.find(z => z.id === sugCuerda!.zona_id) || sugZona;
          }
        }
        map[c.id] = { cell: sugCell, cuerda: sugCuerda, zona: sugZonaFinal };
      }
    });
    return map;
  }, [allContacts, detectZonaForContact, getCellsByDistance, cuerdas, zonas]);

  // Home zona (most contacts)
  const homeZonaId = useMemo(() => {
    if (!allContacts?.length || !zonas?.length) return null;
    const counts: Record<string, number> = {};
    allContacts.forEach(c => { if (c.zona_id) counts[c.zona_id] = (counts[c.zona_id] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || zonas[0]?.id || null;
  }, [allContacts, zonas]);

  // ─── Pool counts ───────────────────────────────────────────────
  // The "En MJA" chip is always the user's PERSONAL OUTBOX. What lives
  // in that outbox depends on whether the user is a member of the
  // church-cuerda (MJA Central) or not:
  //
  //   - NON-MJA member (referente de cuerda 204, encargado, conector,
  //     anfitrion, etc): outbox = the contacts THEY are about to send
  //     to MJA Central. Stage where pending_external_send=true and
  //     numero_cuerda is still their own. Chip label "Enviar a MJA".
  //
  //   - MJA member (admin/general OR anyone whose numero_cuerda is
  //     the church-cuerda's numero, e.g. 'MJA Central'): outbox = the
  //     contacts that LANDED in their pool from referentes' dispatches.
  //     Stage where is_external=true and the cell is unassigned. Their
  //     job is to assign each one to a final célula. Chip label
  //     "Confirmar asignación".
  //
  // Same conceptual function (an outbox waiting on the user's action),
  // different contents and label depending on who's looking. A
  // supervisor of cuerda 204 is NOT an MJA member — they work in 204,
  // they aren't on the receiving end of dispatches. They get the
  // referente UX.
  // churchCuerda moved up; see the definition above near the cells query.
  const isMjaMember = useMemo(() => {
    // Globals without an iglesia (admins like Dan) and generals are
    // always MJA-side — they manage the assignment pool by definition.
    if (profile?.role === 'admin' || profile?.role === 'general') return true;
    // For everyone else, membership is determined by their cuerda
    // matching the church-cuerda. Pastor of an iglesia who happens
    // to be assigned to MJA Central qualifies; pastor of cuerda 204
    // does not.
    return !!(userCuerdaNumero && churchCuerda?.numero && userCuerdaNumero === churchCuerda.numero);
  }, [profile?.role, userCuerdaNumero, churchCuerda?.numero]);

  // Sugerencia column is only useful for MJA members who assign contacts
  // to cuerdas. Non-MJA users whose cuerda has a territory drawn don't
  // need it — they already see "✓ En zona" / "⚠ Fuera → Enviar a MJA"
  // inline. Non-MJA users WITHOUT a territory still see it as a fallback
  // (km-based suggestions).
  // Sugerencia column is always visible. Content changes:
  // - MJA Central members: cell/km suggestions (they assign to cuerdas)
  // - Other cuerdas WITH territory: "✓ En zona" / "⚠ Fuera → Enviar a MJA"
  // - Other cuerdas WITHOUT territory: cell/km suggestions (fallback)
  const showSugerencia = true;

  // Does the current user's cuerda have a territory drawn?
  const userCuerdaHasTerritory = useMemo(() => {
    if (isMjaMember) return false; // MJA members always see km suggestions
    if (!userCuerdaNumero || !cuerdas) return false;
    const uc = cuerdas.find(c => c.numero === userCuerdaNumero);
    if (!uc) return false;
    return !!cuerdaTerritoryMap.get(uc.id);
  }, [isMjaMember, userCuerdaNumero, cuerdas, cuerdaTerritoryMap]);

  // Pool-tab chip counts come from their own small head queries now
  // (one COUNT per pool). The old in-memory derivations
  // (externalContacts / pendingAssignmentContacts / inboxCounts) used
  // to iterate allContacts, which doesn't work once allContacts is
  // just the current page. Counts are still scoped by visibility.
  const { data: poolCounts } = useQuery({
    queryKey: ['pool-counts', churchId, profile?.id, profile?.role, profile?.numero_cuerda, canSeeContactsFromAllCuerdas, isMjaMember],
    queryFn: () => fetchPoolCounts({
      churchId: churchId!,
      userId: profile?.id || null,
      userCuerda: profile?.numero_cuerda || null,
      canSeeAllCuerdas: canSeeContactsFromAllCuerdas,
      isMjaMember,
    }),
    enabled: !!churchId && !!profile,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const inboxChipCount = poolCounts?.inbox ?? 0;
  const outboxChipCount = isMjaMember ? 0 : (poolCounts?.outbox ?? 0);
  const pendingChipCount = poolCounts?.pending ?? 0;

  // Distinct values for the three filter dropdowns. They used to be
  // computed off the in-memory contact list; after server-paginated
  // refactor we query them separately so the dropdowns show every
  // distinct cuerda / responsable / conector in the user's visibility
  // scope, not just the ones that happen to land on the current page.
  // Counts next to each option are dropped for now — a follow-up can
  // add them via a single GROUP BY query if Dan misses them.
  const visibilityArg = useMemo(() => ({
    canSeeAllCuerdas: canSeeContactsFromAllCuerdas,
    userCuerda: profile?.numero_cuerda || null,
    userId: profile?.id || null,
    userRole: profile?.role || null,
  }), [canSeeContactsFromAllCuerdas, profile?.numero_cuerda, profile?.id, profile?.role]);

  const { data: distinctCuerdas = [] } = useQuery<string[]>({
    queryKey: ['pool-distinct-cuerdas', churchId, profile?.id, profile?.role, profile?.numero_cuerda, canSeeContactsFromAllCuerdas],
    queryFn: () => fetchDistinctCuerdas(churchId!, visibilityArg),
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  const { data: distinctResponsableIds = [] } = useQuery<string[]>({
    queryKey: ['pool-distinct-responsables', churchId, profile?.id, profile?.role, profile?.numero_cuerda, canSeeContactsFromAllCuerdas],
    queryFn: () => fetchDistinctResponsables(churchId!, visibilityArg),
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  const { data: distinctConectores = [] } = useQuery<string[]>({
    queryKey: ['pool-distinct-conectores', churchId, profile?.id, profile?.role, profile?.numero_cuerda, canSeeContactsFromAllCuerdas],
    queryFn: () => fetchDistinctConectores(churchId!, visibilityArg),
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  // (externalContacts / pendingDispatchIds placeholders removed —
  // unused after the server-side filtering migration.)
  const externalIds = useMemo(() => new Set<string>(), []);
  // Every contact pending dispatch (any user, any cuerda). Used to
  // remove them from the 'En Lista' pool view across the board — a
  // pending-dispatch contact is private to its sender's outbox until
  // dispatched.
  // (pendingDispatchIds placeholder removed — unused after migration.)

  // ─── MJA pre-assignment outbox ('Asignar Contactos' tab) ──────
  // For MJA members only. Symmetric to the referente Enviar-a-MJA flow:
  // this is the staging area before the final cell assignment is
  // committed. Workflow:
  //   1. MJA member sees a contact in En Lista with sugCell.
  //   2. Clicks 'Pre-Asignar' on that suggestion.
  //   3. Server writes pending_assignment_cell_id = sugCell.id (no
  //      change to cell_id yet — the contact is still un-celled).
  //   4. Contact moves out of En Lista (excluded by pendingAssignmentIds
  //      below) and into this 'Asignar Contactos' tab.
  //   5. From the tab, member clicks 'Confirmar asignación' to commit
  //      cell_id := pending_assignment_cell_id (and clear the staging
  //      column + is_external).
  //
  // Non-MJA users never see this list.
  // (pendingAssignmentContacts / pendingAssignmentIds placeholders removed
  // — unused after migration.)

  // Count of contacts currently sitting in the Inbox (formerly 'En
  // Lista') pool, with visibility scope applied but ad-hoc filters
  // (search, cuerda, responsable, conector, duplicates, tab filters)
  // ignored. This is the number the Inbox chip displays.
  //
  // Why ignore ad-hoc filters? The chip lives in the toolbar and is
  // there to tell the user 'X contacts are waiting in your inbox'
  // regardless of what slice they're currently filtering by. Otherwise
  // when a user is on the outbox tab AND has a filter active, the
  // chip's number would be filteredContacts.length on the outbox view
  // (often 0), which Dan called out as misleading: 'no debería ver 0
  // en EN LISTA, está mal llamado.'
  //
  // Visibility scope IS still applied — a referente in cuerda 204
  // shouldn't see the global count, just their own slice.
  // Inbox counts. Returns total + breakdown by whether the contact
  // has a usable address (mappable / sin dirección). The chip in the
  // toolbar shows total; the help line below it adds the breakdown
  // so the user knows how many of those they could actually plot on
  // the map. Per Dan: 'sería bueno también en Semillero — ponés total
  // tantos, X cantidad sin dirección.'
  //
  // Filters ad-hoc (search, cuerda, responsable, etc.) are NOT applied
  // here. The chip is a stable signpost that shouldn't move when the
  // user filters their view. Visibility scope IS applied (referente
  // sees only their cuerda's count, not the global one).
  // Inbox counts now come from the server poolCounts query. The
  // historical withAddress / withoutAddress breakdown that the chip
  // help-line showed has been dropped — the SQL equivalent of the
  // /[\p{L}\p{N}]/u JS regex on `address` is non-trivial and the
  // breakdown wasn't load-bearing UX. Can be added back later if Dan
  // misses it via a second small count query with
  // `not('address','is',null)`.
  const inboxCounts = useMemo(
    () => ({ total: inboxChipCount, withAddress: 0, withoutAddress: 0 }),
    [inboxChipCount],
  );
  const inboxTotalCount = inboxCounts.total;

  // Count of "received from MJA" contacts the receiving cuerda hasn't
  // marked seen yet. Drives the red badge on the locked "Recibidos de
  // MJA" tab. Globals see the whole iglesia's count; everyone else
  // sees only their own cuerda's. The set is computed in-memory off
  // allContacts so no extra query — the field is already part of the
  // contacts select.
  const mjaUnseenCount = useMemo(() => {
    if (!allContacts) return 0;
    return allContacts.reduce((n, c: any) => {
      // Either direction counts: a contact dropped down from MJA into
      // a regular cuerda (received_from_mja_*) OR pushed up from a
      // regular cuerda into MJA (sent_to_mja_*). Only one is ever set
      // at a time per trigger logic, so the OR doesn't double-count.
      const downUnseen = c.received_from_mja_at && !c.received_from_mja_seen_at;
      const upUnseen = c.sent_to_mja_at && !c.sent_to_mja_seen_at;
      if (!downUnseen && !upUnseen) return n;
      // Visibility: same rule as the main pool. Referentes only count
      // their own cuerda; globals count everyone.
      if (!canSeeContactsFromAllCuerdas) {
        if (userCuerdaNumero) {
          if (c.numero_cuerda !== userCuerdaNumero) return n;
        } else if (c.responsable_id !== session?.user?.id) {
          return n;
        }
      }
      return n + 1;
    }, 0);
  }, [allContacts, canSeeContactsFromAllCuerdas, userCuerdaNumero, session?.user?.id]);

  // How many contacts are autoassign-able for THIS user — visible to them
  // and currently without a cell_id. Used by the "Autoasignar todos (N)"
  // button label so the count matches what the action will actually do.
  // Independent of active filters because the button operates over the
  // entire pool, not the user's current view.
  const autoassignableCount = useMemo(() => {
    let n = 0;
    const userId = session?.user?.id;
    allContacts?.forEach(c => {
      if (c.cell_id) return;
      if (externalIds.has(c.id)) return;
      if (!canSeeContactsFromAllCuerdas) {
        if (userCuerdaNumero) {
          if (c.numero_cuerda !== userCuerdaNumero) return;
        } else {
          if (c.responsable_id !== userId) return;
        }
      }
      n++;
    });
    return n;
  }, [allContacts, canSeeContactsFromAllCuerdas, userCuerdaNumero, externalIds, session?.user?.id]);


  // ─── Filtered contacts ─────────────────────────────────────────
  // The Semillero is the user's working view — it shows ALL contacts
  // belonging to the user's cuerda (or all contacts for admins).
  // Contacts only disappear from a referente's Semillero if they get
  // assigned to a DIFFERENT cuerda. Having a cell_id is irrelevant —
  // the referente still needs to see and manage them.
  // Almost all filtering moved server-side via fetchPoolPage. What's
  // left in this useMemo are the two filters that don't have efficient
  // SQL equivalents:
  //   1. Zona in/out polygon test — needs PostGIS or full coord scan.
  //      We apply it client-side over just the current page; users
  //      who flip this filter on a giant church get a degraded result
  //      (only see in/out matches that happen to live on the current
  //      page). Fair trade for now.
  //   2. Duplicate detection — needs a full-group scan. Same caveat:
  //      runs against the current page only when filterDuplicates is
  //      on. A dedicated "Find duplicates across base" action will
  //      come later.
  //   3. Active tab filters (saved filter presets) — those still get
  //      applied client-side because their structure is dynamic and
  //      we haven't migrated them to SQL yet.
  // Sorting is done server-side too (ORDER BY in fetchPoolPage), so
  // this useMemo no longer reorders.
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered = allContacts;
    if (activeTabId && Object.keys(activeTabFilters).length > 0) {
      filtered = applyFilterTab(filtered, activeTabFilters);
    }
    const zonaFilter = filterZonaStatus || activeTabFilters?.zonaStatus || '';
    if (zonaFilter === 'in' || zonaFilter === 'out') {
      filtered = filtered.filter(c => {
        if (c.lat == null || c.lng == null) return false;
        const contactCuerda = (cuerdas || []).find(cu => cu.numero === c.numero_cuerda);
        if (!contactCuerda) return false;
        const paths = cuerdaTerritoryMap.get(contactCuerda.id);
        if (!paths) return false;
        const inside = isPointInTerritory(c.lat, c.lng, paths);
        return zonaFilter === 'in' ? inside : !inside;
      });
    }
    if (filterDuplicates) {
      filtered = filtered.filter(c => duplicateNameIds.has(c.id));
    }
    // routeFilter resolves to whichever of the two sources is set:
    //   - the header dropdown (filterRoute), or
    //   - the routeStatus field on a saved Solapa.
    // applyFilterTab can't do this itself because it doesn't have
    // access to routeContactIds — that's an extra query owned here.
    const routeFilter = filterRoute || activeTabFilters?.routeStatus || '';
    if (routeFilter && routeContactIds) {
      filtered = filtered.filter(c => routeFilter === 'in' ? routeContactIds.has(c.id) : !routeContactIds.has(c.id));
    }
    return filtered;
  }, [allContacts, activeTabId, activeTabFilters, filterZonaStatus, filterDuplicates, duplicateNameIds, cuerdas, cuerdaTerritoryMap, filterRoute, routeContactIds]);

  // How many of the currently-selected contacts are actually visible in the
  // filtered view. Prevents the "Seleccionados" counter from showing stale
  // ghost numbers when filters/refresh change which rows are on screen.
  const visibleSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const visibleIds = new Set(filteredContacts.map(c => c.id));
    let count = 0;
    selectedIds.forEach(id => { if (visibleIds.has(id)) count++; });
    return count;
  }, [selectedIds, filteredContacts]);

  // Reset to page 0 whenever the filtered set changes shape — staying on
  // page 5 after the user filters down to 80 rows would just show an empty
  // page and force them to navigate back.
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, filterCuerda, filterResponsable, filterConector, filterDuplicates, filterOnlyWithCoords, filterZonaStatus, filterRoute, activePool, activeTabId]);

  // totalPages now comes from the server-reported totalFilteredCount,
  // not the in-memory filteredContacts length (which is just the current
  // page after the refactor). The client-side filters (zona / duplicates)
  // narrow the displayed rows for that page but don't affect totalCount —
  // a known degradation, see fetchPoolPage notes.
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  // visibleContacts used to be the slice of the in-memory filtered set;
  // server now returns just the current page so visibleContacts == filteredContacts.
  // filteredContacts already IS the current page rows (post-refactor),
  // so visibleContacts is just the same array — no slicing needed.
  // Keeping the name and the alias for backwards compatibility with the
  // rest of the page.
  const visibleContacts = filteredContacts;
  // pageStart / pageEnd reflect server-paginated positions in the
  // filtered set: page 3 of 200/page shows rows 401–600 of totalCount.
  const pageStart = totalFilteredCount === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const pageEnd = Math.min((safePage + 1) * PAGE_SIZE, totalFilteredCount);

  // Count of duplicate-flagged contacts WITHIN the current filter context.
  // Reflects what the user is actually looking at: pick Responsable=Mauro
  // and the Duplicados pill says how many of Mauro's contacts are dups,
  // not the global church number. When filterDuplicates is on, this equals
  // filteredContacts.length (the table is already restricted to dups), so
  // the pill keeps a consistent "what you see" semantic both states.
  const dupsInFilteredView = useMemo(() => {
    if (!duplicateNameIds.size) return 0;
    let n = 0;
    for (const c of filteredContacts) {
      if (duplicateNameIds.has(c.id)) n++;
    }
    return n;
  }, [filteredContacts, duplicateNameIds]);

  // Pool is always unassigned or external view now (no zona cards)
  const isUnassignedView = true;

  // ─── Auto-assign preview ───────────────────────────────────────
  const autoAssignPreview = useMemo(() => {
    const counts: Record<string, number> = {};
    let noMatch = 0;
    allContacts?.forEach(c => {
      if (c.cell_id) return;
      const sug = suggestions[c.id];
      if (sug?.cell) {
        const label = sug.cell.name + (sug.cuerda ? ` (Cuerda ${sug.cuerda.numero})` : '');
        counts[label] = (counts[label] || 0) + 1;
      } else { noMatch++; }
    });
    const result = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    if (noMatch > 0) result.push({ label: '❌ Sin célula cercana (no se asignarán)', count: noMatch });
    return result;
  }, [allContacts, suggestions]);

  // ─── Mutations ─────────────────────────────────────────────────
  const assignSingleMutation = useMutation({
    mutationFn: async ({ contactId, cellId }: { contactId: string; cellId: string }) => {
      const contact = allContacts?.find(c => c.id === contactId);
      const cell = cells?.find(c => c.id === cellId);
      // Derive zona and cuerda from cell
      let zonaId: string | null = null;
      let zonaName: string | null = null;
      let cuerdaNum: string | null = null;
      if (cell?.cuerda_id && cuerdas?.length) {
        const cuerda = cuerdas.find(cr => cr.id === cell.cuerda_id);
        if (cuerda) {
          cuerdaNum = cuerda.numero;
          const zona = zonas?.find(z => z.id === cuerda.zona_id);
          if (zona) { zonaId = zona.id; zonaName = zona.nombre; }
        }
      }
      const { error } = await supabase.from('contacts').update({
        cell_id: cellId, zona_id: zonaId, zona: zonaName, numero_cuerda: cuerdaNum,
        pool_assigned_at: new Date().toISOString(), pool_assigned_by: session?.user?.id,
      }).eq('id', contactId);
      if (error) throw error;
      // Log transfer
      await supabase.from('contact_transfers').insert({
        contact_id: contactId,
        from_cuerda: contact?.numero_cuerda || null,
        to_cuerda: cuerdaNum,
        from_zona: contact?.zona || null,
        to_zona: zonaName,
        from_cell_id: contact?.cell_id || null,
        to_cell_id: cellId,
        transferred_by: session?.user?.id,
        transfer_type: 'pool_assignment',
      });
      // Log to activity_logs for Historial
      await supabase.from('activity_logs').insert({
        user_id: session?.user?.id,
        church_id: churchId,
        action: 'assign',
        entity_type: 'contact',
        entity_id: contactId,
        before_data: { numero_cuerda: contact?.numero_cuerda, cell_id: contact?.cell_id, zona: contact?.zona },
        after_data: { numero_cuerda: cuerdaNum, cell_id: cellId, zona: zonaName, cell_name: cell?.name },
      });
      setUndoData({
        contactIds: [contactId],
        prevStates: [{ zona_id: contact?.zona_id || null, zona: contact?.zona || null, numero_cuerda: contact?.numero_cuerda || null, cell_id: contact?.cell_id || null }],
      });
    },
    onSuccess: () => { showSuccess('Contacto asignado a célula.'); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); setConfirmDialog(null); },
    onError: (err: any) => showError(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!allContacts) return 0;
      const ids: string[] = [];
      const prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null; cell_id: string | null }[] = [];
      let count = 0;
      for (const contact of allContacts) {
        if (contact.zona_id || contact.cell_id) continue;
        const sug = suggestions[contact.id];
        if (!sug?.cell) continue;
        let zonaId: string | null = null; let zonaName: string | null = null; let cuerdaNum: string | null = null;
        if (sug.cell.cuerda_id && cuerdas?.length) {
          const cuerda = cuerdas.find(cr => cr.id === sug.cell!.cuerda_id);
          if (cuerda) { cuerdaNum = cuerda.numero; const z = zonas?.find(zn => zn.id === cuerda.zona_id); if (z) { zonaId = z.id; zonaName = z.nombre; } }
        }
        ids.push(contact.id);
        prevStates.push({ zona_id: contact.zona_id, zona: contact.zona || null, numero_cuerda: contact.numero_cuerda, cell_id: contact.cell_id });
        await supabase.from('contacts').update({
          cell_id: sug.cell.id, zona_id: zonaId, zona: zonaName, numero_cuerda: cuerdaNum,
          pool_assigned_at: new Date().toISOString(), pool_assigned_by: session?.user?.id,
        }).eq('id', contact.id);
        // Log transfer
        await supabase.from('contact_transfers').insert({
          contact_id: contact.id,
          from_cuerda: contact.numero_cuerda || null,
          to_cuerda: cuerdaNum,
          from_zona: contact.zona || null,
          to_zona: zonaName,
          from_cell_id: contact.cell_id || null,
          to_cell_id: sug.cell.id,
          transferred_by: session?.user?.id,
          transfer_type: 'auto_assignment',
        });
        count++;
      }
      if (count === 0) throw new Error('No se pudo asignar ningún contacto.');
      setUndoData({ contactIds: ids, prevStates });
      return count;
    },
    onSuccess: (count) => { showSuccess(`${count} contacto(s) asignados.`); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); setConfirmDialog(null); },
    onError: (err: any) => showError(err.message || 'Error al autoasignar.'),
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!undoData) return;
      for (let i = 0; i < undoData.contactIds.length; i++) {
        const prev = undoData.prevStates[i];
        await supabase.from('contacts').update({
          zona_id: prev.zona_id, zona: prev.zona, numero_cuerda: prev.numero_cuerda, cell_id: prev.cell_id,
          pool_assigned_at: null, pool_assigned_by: null,
        }).eq('id', undoData.contactIds[i]);
      }
    },
    onSuccess: () => { showSuccess('Deshecho.'); setUndoData(null); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); },
    onError: (err: any) => showError(err.message),
  });

  // ─── Render ────────────────────────────────────────────────────
  // Pagination block, declared once and rendered both above and below the
  // table so the user can flip pages without scrolling the whole list.
  // Rendered twice — top and bottom of the table — so users on a tall
  // page don't need to scroll back to switch pages.
  const paginationControls = !isLoading ? (
    <PaginationControls
      page={safePage}
      totalPages={totalPages}
      pageStart={pageStart}
      pageEnd={pageEnd}
      totalRows={filteredContacts.length}
      onPageChange={setCurrentPage}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {/* Compact header: title + stats pills + actions + search, all in one
          flex-wrap row. Stats pills are clickable and switch the active pool
          just like the old big Cards did. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1">
          <h1 className="text-xl font-bold flex items-center gap-2 leading-tight"><Users className="h-5 w-5" /> Semillero</h1>
          <p className="text-muted-foreground text-[11px] leading-tight mt-0.5">Asignación de contactos a células por cercanía</p>
          {/* Address breakdown. Per Dan: 'sería bueno también en
              Semillero — ponés total tantos, X cantidad sin dirección.'
              Same shape as the Rutas counter. Helps the user
              understand why the inbox count shrinks when they go
              filter by 'with address' or hop into Rutas (where only
              the addressable subset shows up on the map). Hidden
              when the inbox is empty — no useful breakdown then. */}
          {!isLoading && inboxCounts.total > 0 && inboxCounts.withoutAddress > 0 && (
            <p className="text-amber-400/80 text-[10px] leading-tight mt-0.5">
              {inboxCounts.withAddress} con dirección · {inboxCounts.withoutAddress} sin dirección
            </p>
          )}
        </div>

        {/* Inbox chip — the main pool of contacts waiting in the user's
            scope. Always shows the total inbox count (visibility-scoped
            for non-globals; ignores ad-hoc filters) so the number stays
            meaningful regardless of which tab is active. Per Dan: 'cuando
            estoy en el outbox, no debería ver 0 en EN LISTA, está mal
            llamado. Cambia a Inbox y poné el número total.' */}
        <button
          type="button"
          onClick={() => { setActivePool('unassigned'); setSearchTerm(''); }}
          className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${activePool === 'unassigned' ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30'}`}
          title="Total de contactos en tu inbox (sin contar los que están en outbox o pre-asignados)."
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Inbox</span>
          <span className={`text-sm font-bold tabular-nums ${inboxTotalCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{isLoading ? '…' : inboxTotalCount}</span>
        </button>
        {/* Outbox chip — only for non-MJA users (referentes etc.). MJA
            members don't have an outbox: contacts dispatched to MJA
            Central land directly in their En Lista, where they get the
            'Confirmar asignación' button to assign each one to a final
            célula. Showing an empty outbox tab for MJA members would
            be confusing, so it's gone for them. */}
        {!isMjaMember && (
          <button
            type="button"
            onClick={() => { setActivePool('external'); setSearchTerm(''); }}
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${activePool === 'external' ? 'border-orange-500 bg-orange-500/10' : outboxChipCount > 0 ? 'border-orange-500/30 hover:border-orange-500/60' : 'border-border hover:border-foreground/30'}`}
            title='Tu outbox: contactos que enviaste a MJA pero todavía no confirmaste el despacho. Confirmá cuando estés seguro y recién ahí salen de tu cuerda.'
          >
            <span className="text-[10px] uppercase tracking-wider text-orange-400">Enviar a MJA</span>
            <span className={`text-sm font-bold tabular-nums ${outboxChipCount > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? '…' : outboxChipCount}</span>
          </button>
        )}
        {/* Asignar Contactos chip — MJA members only. The mirror of the
            referente's Enviar-a-MJA chip on the receiving side: contacts
            the MJA member pre-asigned (clicked Pre-Asignar on a sugerencia)
            but hasn't confirmed yet. Always visible for MJA members
            regardless of count — Dan: 'el asignar contactos debería estar
            siempre visible even when there are 0 contacts there.' This
            way they always know where the staging tab lives even when
            empty. The number greys out to muted-foreground at zero so
            the chip doesn't visually clamor when there's nothing to do. */}
        {isMjaMember && (
          <button
            type="button"
            onClick={() => { setActivePool('pending_assignment'); setSearchTerm(''); }}
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${activePool === 'pending_assignment' ? 'border-orange-500 bg-orange-500/10' : pendingChipCount > 0 ? 'border-orange-500/30 hover:border-orange-500/60' : 'border-border hover:border-foreground/30'}`}
            title='Tu outbox de pre-asignaciones: contactos que pre-asignaste a una célula pero todavía no confirmaste. Confirmá cuando estés seguro y recién ahí entra a la célula final.'
          >
            <span className="text-[10px] uppercase tracking-wider text-orange-400">Asignar Contactos</span>
            <span className={`text-sm font-bold tabular-nums ${pendingChipCount > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? '…' : pendingChipCount}</span>
          </button>
        )}
        {/* Duplicates toggle — narrows the table to rows whose normalized
            full name appears more than once. The count reflects dups
            WITHIN the current filter context, not the church-wide total —
            so picking Responsable=Mauro updates the pill to Mauro's dup
            count, not all of MJA Central. Hidden entirely when there are
            no dups in the current view, so the toolbar stays clean. */}
        {dupsInFilteredView > 0 || filterDuplicates ? (
          <button
            type="button"
            onClick={() => setFilterDuplicates(v => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${filterDuplicates ? 'border-amber-500 bg-amber-500/10' : 'border-amber-500/30 hover:border-amber-500/60'}`}
            title={filterDuplicates ? 'Mostrar todos los contactos del filtro' : 'Mostrar solo posibles duplicados (mismo nombre y apellido) dentro del filtro actual'}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[10px] uppercase tracking-wider text-amber-400">{filterDuplicates ? 'Mostrando dups' : 'Duplicados'}</span>
            <span className="text-sm font-bold tabular-nums text-amber-400">{dupsInFilteredView}</span>
          </button>
        ) : null}
        {/* Coords filter toggle */}
        <button
          type="button"
          onClick={() => setFilterOnlyWithCoords(v => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${filterOnlyWithCoords ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-cyan-500/40'}`}
          title={filterOnlyWithCoords ? 'Mostrar todos los contactos' : 'Mostrar solo contactos con coordenadas (mapeables)'}
        >
          <MapPin className="h-3 w-3 text-cyan-400" />
          <span className="text-[10px] uppercase tracking-wider text-cyan-400">{filterOnlyWithCoords ? 'Ver todos' : 'Solo mapeables'}</span>
        </button>
        {searchTerm && (
          <div className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-blue-500/30 bg-blue-500/5">
            <span className="text-[10px] uppercase tracking-wider text-blue-400">En filtro</span>
            <span className="text-sm font-bold tabular-nums text-blue-400">{filteredContacts.length}</span>
          </div>
        )}

        {undoData && (
          <Button variant="outline" size="sm" onClick={() => undoMutation.mutate()} disabled={undoMutation.isPending} className="gap-1.5 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300">
            <Undo2 className="h-4 w-4" /> Deshacer ({undoData.contactIds.length})
          </Button>
        )}

        {/* Spacer pushes actions to the right on wide viewports. On narrow
            viewports flex-wrap takes over and everything stacks naturally. */}
        <div className="flex-1 min-w-0" />

        {/* Action buttons. Bulk actions (autoasignar/asignar/eliminar/whatsapp
            seleccionados) are NOT here on purpose — they live in the floating
            action bar at the bottom so the header doesn't reflow / push the
            table down every time the user (de)selects a contact. */}
        {activePool === 'unassigned' && canAutoAssign() && canSeeContactsFromAllCuerdas && autoassignableCount > 0 && (
          <Button size="sm" onClick={() => setConfirmDialog({ type: 'auto', preview: autoAssignPreview })} className="gap-1.5">
            <Zap className="h-4 w-4" /> Autoasignar todos ({autoassignableCount})
          </Button>
        )}
        {canImportCsv() && (
          <Button variant="outline" size="sm" onClick={() => setCsvDialogOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar
          </Button>
        )}
        {canAddContacts() && (
          <Button size="sm" onClick={() => setAddContactOpen(true)} className="gap-1.5">
            <PlusCircle className="h-4 w-4" /> Crear Contacto
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="gap-1.5 px-2" title="Mostrar / ocultar columnas">
              <Columns3 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={16}>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Columnas</DropdownMenuLabel>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowCuerdaCol(v => !v); }} className="gap-2">
              <span className="w-4 inline-flex justify-center">{showCuerdaCol ? '✓' : ''}</span>
              <span>Número de cuerda</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowConectorCol(v => !v); }} className="gap-2">
              <span className="w-4 inline-flex justify-center">{showConectorCol ? '✓' : ''}</span>
              <span>Conector</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowDupCol(v => !v); }} className="gap-2">
              <span className="w-4 inline-flex justify-center">{showDupCol ? '✓' : ''}</span>
              <span>Duplicados</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowRutaCol(v => !v); }} className="gap-2">
              <span className="w-4 inline-flex justify-center">{showRutaCol ? '✓' : ''}</span>
              <span>En ruta</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={async () => {
          setRefreshing(true);
          await queryClient.invalidateQueries({ queryKey: ['cells-pool', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['cuerdas-pool', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['zonas', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['barrios', churchId] });
          geocodedRef.current = false;
          showSuccess('Datos actualizados.');
          setRefreshing(false);
        }} className="gap-1.5 px-2" title="Actualizar datos">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Search + filter tabs row. The search input lives on the LEFT
          (where the "Todos" tab used to start) so the tabs sit visually
          to its right — Dan asked for this layout so the search isn't
          buried at the far end of the toolbar. */}
      {profile?.role !== 'conector' && churchId && (
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          <div className="relative w-52 max-w-full shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <FilterTabsBar
              churchId={churchId}
              activeTabId={activeTabId}
              mjaUnseenCount={mjaUnseenCount}
              onActiveTabChange={(id, filters) => {
                // Switching to the locked "Recibidos de MJA" tab → mark
                // every currently-unseen MJA arrival as seen, in the
                // user's cuerda. RPC runs as SECURITY DEFINER and
                // returns the number of rows it touched; we refetch
                // contacts so the badge clears immediately. Globals
                // without a numero_cuerda skip the RPC — there's no
                // single cuerda for them to mark as receiver.
                if (id === MJA_RECEIVED_TAB_ID && userCuerdaNumero && churchId) {
                  (async () => {
                    const { error } = await supabase.rpc('mark_mja_contacts_seen', {
                      p_church_id: churchId,
                      p_cuerda: userCuerdaNumero,
                    });
                    if (!error) {
                      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                    }
                  })();
                }
                setActiveTabId(id);
                setActiveTabFilters(filters);
                // Reset all ad-hoc filters when the user switches tabs.
                // Per Dan: 'si yo aplico un filtro estando en una solapa,
                // cuando paso a otra solapa esos filtros no los debo
                // arrastrar, sino que se resetearían.' Each tab is its
                // own scope; carrying over a Cuerda or Responsable
                // pick from the previous tab would surprise the user.
                // The tab's own saved filters (passed in `filters` and
                // stored in activeTabFilters) still apply.
                setFilterResponsable('');
                setFilterCuerda('');
                setFilterConector('');
                setFilterDuplicates(false);
                setFilterOnlyWithCoords(false);
                setFilterZonaStatus('');
                setSearchTerm('');
              }}
              cuerdas={cuerdas || []}
              teamMembers={teamMembers || []}
              zonas={zonas || []}
            />
          </div>
        </div>
      )}
      {/* Conectores get only the search input — they don't see the tab
          system. Same look as above, just no tabs row. */}
      {profile?.role === 'conector' && (
        <div className="mb-3">
          <div className="relative w-52 max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      )}

      {/* Recently imported contacts banner */}
      {recentImportIds.size > 0 && (
        <div className="flex items-center justify-between bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2 mb-3">
          <span className="text-sm font-medium text-amber-300">
            ✨ {recentImportIds.size} contacto{recentImportIds.size > 1 ? 's' : ''} recién importado{recentImportIds.size > 1 ? 's' : ''} — resaltados en la tabla
          </span>
          <button
            className="text-xs text-amber-400 hover:text-amber-300 underline"
            onClick={() => setRecentImportIds(new Set())}
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Table. Checkbox is the first column inside the table itself so
          rows and checkboxes line up automatically — no manual height
          syncing, and the last row's checkbox can never get pushed out
          of the visible area by the surrounding pagination. */}
      <Card>
        <CardContent className="p-0">
          {/* Top pagination — same controls as the bottom of the card.
              Renders only when there's more than one page. The border-t
              inside the controls visually separates them from whatever's
              above; with paginationControls also at the bottom of the
              card, the user can flip pages from either end without
              scrolling. */}
          {paginationControls}
          {isLoading ? (
            <div className="p-6 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 860 }}>
                <thead>
                  <tr className="border-b h-[37px]">
                    <th className="px-2" style={{ width: colWidths.check }}>
                      <input
                        type="checkbox"
                        className="rounded border-input align-middle"
                        checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredContacts.map(c => c.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    {showCuerdaCol && (
                      <ResizableHeader width={colWidths.cuerda} onResize={resizeCol('cuerda')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Cuerda</span>
                              <Filter className={`h-3 w-3 ${filterCuerda ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Filtrar por cuerda</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setFilterCuerda('')} className={filterCuerda === '' ? 'bg-accent' : ''}>
                              Todas
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Server-paginated cuerda options. Pulls every
                                distinct numero_cuerda in the user's
                                visibility scope (not just the current page).
                                Per-option counts and the "narrow by other
                                active filters" cascade dropped to keep this
                                a single lightweight query — Dan can re-add
                                them via a GROUP BY query if missed. */}
                            {distinctCuerdas.map(k => (
                              <DropdownMenuItem key={k} onClick={() => setFilterCuerda(k)} className={filterCuerda === k ? 'bg-accent' : ''}>
                                <span className="flex-1">{k}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ResizableHeader>
                    )}
                    <ResizableHeader width={colWidths.nombre} onResize={resizeCol('nombre')}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => {
                          if (sortBy !== 'nombre') { setSortBy('nombre'); setSortDir('asc'); }
                          else if (sortDir === 'asc') { setSortDir('desc'); }
                          else { setSortBy(null); }
                        }}
                        title="Ordenar por nombre"
                      >
                        Nombre
                        {sortBy === 'nombre'
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </ResizableHeader>
                    {/* Fixed-width Dup column. Renders the 'DUP' pill as
                        a centered cell so every duplicate flag lines up
                        vertically across rows regardless of name length.
                        Click on the pill opens the merge dialog (same
                        action the dot used to do). Toggleable via the
                        Columns3 menu — off by default since most rows
                        have nothing to flag. */}
                    {showDupCol && (
                      <ResizableHeader width={colWidths.dup} onResize={resizeCol('dup')}>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Dup</span>
                      </ResizableHeader>
                    )}
                    <ResizableHeader width={colWidths.telefono} onResize={resizeCol('telefono')}>Teléfono</ResizableHeader>
                    <ResizableHeader width={colWidths.responsable} onResize={resizeCol('responsable')}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                            Responsable
                            <Filter className={`h-3 w-3 ${filterResponsable ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Filtrar por responsable</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setFilterResponsable('')} className={filterResponsable === '' ? 'bg-accent' : ''}>
                            Todos
                          </DropdownMenuItem>
                          {/* 'Mis contactos' for everyone:
                              - Non-MJA: filterResponsable=userId (their own
                                contacts where they're responsable).
                              - MJA member: filterResponsable='__church_cuerda__'
                                — for them 'mis' contactos ARE the contacts
                                assigned to MJA Central. The church-cuerda
                                badge IS them. Per Dan: 'no tiene sentido
                                tener mis contactos y tener un MJA Central'.
                                So we collapsed the two redundant entries
                                into one. */}
                          {session?.user?.id && (() => {
                            const myToken = isMjaMember ? '__church_cuerda__' : session.user.id;
                            return (
                              <DropdownMenuItem onClick={() => setFilterResponsable(myToken)} className={filterResponsable === myToken ? 'bg-accent' : ''}>
                                ⭐ Mis contactos
                              </DropdownMenuItem>
                            );
                          })()}
                          <DropdownMenuItem onClick={() => setFilterResponsable('__none__')} className={filterResponsable === '__none__' ? 'bg-accent' : ''}>
                            Sin responsable
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(() => {
                            // Server-paginated responsable options. distinctResponsableIds
                            // is a small query over the user's visibility scope
                            // returning every distinct responsable_id appearing on a
                            // contact they can see. We hydrate names via the existing
                            // profileByIdExtended / teamMemberById maps for display.
                            const userId = session?.user?.id;
                            const creators = distinctResponsableIds
                              .map(id => ({ id, profile: profileByIdExtended.get(id), teamMember: teamMemberById.get(id) }))
                              .filter(c => {
                                if (!c.profile || c.id === userId) return false;
                                if (canSeeContactsFromAllCuerdas) return true;
                                if (!userCuerdaNumero) return false;
                                return c.teamMember?.numero_cuerda === userCuerdaNumero;
                              })
                              .sort((a, b) => (a.profile!.first_name || '').localeCompare(b.profile!.first_name || ''));
                            return creators.map(c => (
                              <DropdownMenuItem key={c.id} onClick={() => setFilterResponsable(c.id)} className={filterResponsable === c.id ? 'bg-accent' : ''}>
                                {c.profile!.first_name} {c.profile!.last_name}
                              </DropdownMenuItem>
                            ));
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ResizableHeader>
                    {showConectorCol && (
                      <ResizableHeader width={colWidths.conector} onResize={resizeCol('conector')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              Conector
                              <Filter className={`h-3 w-3 ${filterConector ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Filtrar por conector</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setFilterConector('')} className={filterConector === '' ? 'bg-accent' : ''}>
                              Todos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterConector('__none__')} className={filterConector === '__none__' ? 'bg-accent' : ''}>
                              Sin conector
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Server-paginated conector options. distinctConectores
                                comes from a separate small query over the user's
                                visibility scope (see fetchDistinctConectores).
                                The cuerda-profile restriction for non-privileged
                                users used to live here; for now we keep the full
                                list because the visibility scope already filters
                                conectores to those that appear on contacts the
                                user can see. A second pass can layer the
                                cuerda-profile narrowing back in if needed. */}
                            {distinctConectores.map(v => (
                              <DropdownMenuItem key={v} onClick={() => setFilterConector(v)} className={normalize(filterConector) === normalize(v) ? 'bg-accent' : ''}>
                                {v}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ResizableHeader>
                    )}
                    {showRutaCol && (
                      <ResizableHeader width={colWidths.ruta} onResize={resizeCol('ruta')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ruta</span>
                              <Filter className={`h-3 w-3 ${filterRoute ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setFilterRoute('')} className={filterRoute === '' ? 'bg-accent' : ''}>Todos</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterRoute('in')} className={filterRoute === 'in' ? 'bg-accent' : ''}>✓ En ruta</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilterRoute('out')} className={filterRoute === 'out' ? 'bg-accent' : ''}>○ Sin ruta</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ResizableHeader>
                    )}
                    <ResizableHeader width={colWidths.direccion} onResize={resizeCol('direccion')}>Dirección</ResizableHeader>
                    <ResizableHeader width={colWidths.fechaContacto} onResize={resizeCol('fechaContacto')}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => {
                          if (sortBy !== 'fecha') { setSortBy('fecha'); setSortDir('desc'); }
                          else if (sortDir === 'desc') { setSortDir('asc'); }
                          else { setSortBy(null); }
                        }}
                        title="Ordenar por fecha"
                      >
                        Fecha
                        {sortBy === 'fecha'
                          ? (sortDir === 'desc' ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </ResizableHeader>
                    {isUnassignedView && showSugerencia && (
                      <ResizableHeader width={colWidths.sugerencia} onResize={resizeCol('sugerencia')}>
                        {userCuerdaHasTerritory ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                                Zona
                                <Filter className={`h-3 w-3 ${filterZonaStatus ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => setFilterZonaStatus('')} className={filterZonaStatus === '' ? 'bg-accent' : ''}>Todos</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setFilterZonaStatus('in')} className={filterZonaStatus === 'in' ? 'bg-accent' : ''}>✓ En zona</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setFilterZonaStatus('out')} className={filterZonaStatus === 'out' ? 'bg-accent' : ''}>⚠ Fuera de zona</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : 'Sugerencia'}
                      </ResizableHeader>
                    )}
                    {isUnassignedView && canAssignContacts() && <ResizableHeader width={colWidths.asignar} onResize={resizeCol('asignar')}>Asignar</ResizableHeader>}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={20} className="text-sm text-muted-foreground py-10 text-center">
                        {searchTerm
                          ? 'Sin resultados para tu búsqueda.'
                          : (filterCuerda || filterResponsable)
                            ? 'No hay contactos que coincidan con los filtros aplicados.'
                            : !canSeeContactsFromAllCuerdas && !userCuerdaNumero
                              ? 'No tenés una cuerda asignada. Pedile a tu admin que te asigne una cuerda desde el panel de Equipo.'
                              : activePool === 'unassigned' ? 'Todos asignados ✅' : 'Bandeja MJA vacía.'}
                      </td>
                    </tr>
                  )}
                  {visibleContacts.map((c, idx) => {
                    const sug = suggestions[c.id];
                    const sugCell = sug?.cell;
                    const sugCuerda = sug?.cuerda;
                    const sugZona = sug?.zona;
                    // A contact is "external" when the nearest suggested cell belongs to a
                    // different cuerda than the contact's own cuerda. If the contact has no
                    // cuerda assigned, fall back to comparing zonas.
                    const isExternal = sugCuerda
                      ? (c.numero_cuerda ? sugCuerda.numero !== c.numero_cuerda : (sugZona && homeZonaId ? sugZona.id !== homeZonaId : false))
                      : false;

                    return (
                      <tr key={c.id} className={`border-b h-[37px] transition-colors ${recentImportIds.has(c.id) ? 'bg-amber-500/15 hover:bg-amber-500/25' : 'hover:bg-muted/50'}`}>
                        {/* Per-row checkbox. Inline with the table so it
                            stays aligned with its row no matter what
                            paginators or pool banners render above. */}
                        <td className="px-2 align-middle" style={{ width: colWidths.check }}>
                          <input
                            type="checkbox"
                            className="rounded border-input align-middle"
                            checked={selectedIds.has(c.id)}
                            onClick={(e) => {
                              // Shift-click range select. Range inclusive both ends,
                              // direction matches the action (select vs deselect)
                              // of the clicked row.
                              const isShift = (e as any).nativeEvent?.shiftKey;
                              if (isShift && lastClickedIdx !== null && lastClickedIdx !== idx) {
                                e.preventDefault();
                                const start = Math.min(lastClickedIdx, idx);
                                const end = Math.max(lastClickedIdx, idx);
                                const next = new Set(selectedIds);
                                const willSelect = !selectedIds.has(c.id);
                                for (let i = start; i <= end; i++) {
                                  const rowId = filteredContacts[i]?.id;
                                  if (!rowId) continue;
                                  if (willSelect) next.add(rowId); else next.delete(rowId);
                                }
                                setSelectedIds(next);
                                setLastClickedIdx(idx);
                              }
                            }}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(c.id); else next.delete(c.id);
                              setSelectedIds(next);
                              setLastClickedIdx(idx);
                            }}
                          />
                        </td>

                        {/* Cuerda — opt-in column toggled in toolbar. */}
                        {showCuerdaCol && (
                          <td className="px-2 py-1.5 tabular-nums text-xs text-muted-foreground" style={{ width: colWidths.cuerda }}>
                            {c.numero_cuerda || <span className="italic">—</span>}
                          </td>
                        )}

                        {/* Nombre (con ojo) */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.nombre }}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="flex items-center gap-1.5 hover:underline text-left text-sm font-medium min-w-0 w-full" onClick={() => setSelectedContactId(c.id)}>
                                <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{c.first_name} {c.last_name || ''}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Ver contacto</p></TooltipContent>
                          </Tooltip>
                        </td>

                        {/* Dup column — fixed width so the pill renders in
                            the same horizontal position on every row. Empty
                            cell on contacts that aren't flagged. Click on
                            the pill opens the merge dialog. Hidden when
                            showDupCol is off — header and cell move
                            together. */}
                        {showDupCol && (
                          <td className="px-2 py-1.5 text-center" style={{ width: colWidths.dup }}>
                            {duplicateNameIds.has(c.id) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center px-1.5 leading-none rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 hover:text-amber-200 cursor-pointer transition-colors"
                                    style={{ height: 18 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const groupIds = duplicateGroupByContactId.get(c.id) || [c.id];
                                      const groupContacts = (allContacts || []).filter(x => groupIds.includes(x.id));
                                      if (groupContacts.length >= 2) setMergeGroup(groupContacts);
                                    }}
                                    aria-label="Resolver duplicado"
                                  >
                                    Dup
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Posible duplicado. Click para resolver (mergear o marcar como personas distintas).</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </td>
                        )}

                        {/* Teléfono + WhatsApp - on mobile we hide the number text and keep just the WhatsApp button to save horizontal space.
                            Invalid AR phones (truncated / missing digits) render in red on both the text and the WhatsApp icon.
                            Missing phones show the same red button (non-clickable) instead of a dash, so the gap is visually obvious. */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.telefono }}>
                          {c.phone ? (() => {
                            const phoneOk = isValidArgentinePhone(c.phone);
                            return (
                              <div className="flex items-center gap-1 justify-center sm:justify-end">
                                <span
                                  className={`hidden sm:inline text-[11px] tabular-nums font-medium truncate flex-1 ${phoneOk ? 'text-foreground' : 'text-red-500'}`}
                                  title={phoneOk ? undefined : 'Número incompleto o inválido'}
                                >
                                  {c.phone}
                                </span>
                                {canSendWhatsapp() && (
                                  <button
                                    className={`flex items-center gap-0.5 shrink-0 group ${phoneOk ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'}`}
                                    title={phoneOk ? 'Enviar WhatsApp' : 'Número incompleto o inválido'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setWhatsappCompose({
                                        contactId: c.id,
                                        name: `${c.first_name} ${c.last_name || ''}`.trim(),
                                        firstName: c.first_name,
                                        lastName: c.last_name || '',
                                        phone: c.phone!,
                                      });
                                    }}
                                  >
                                    <span className="text-[10px] font-medium">Enviar</span>
                                    <WhatsAppIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5 group-hover:scale-110 transition-transform" />
                                  </button>
                                )}
                              </div>
                            );
                          })() : (
                            // No phone — keep the Enviar button right-aligned so it lines
                            // up vertically with the rows that DO have a phone. Without
                            // this, the button slides to the left of the cell because the
                            // phone-number span (which has flex-1) is missing.
                            <div className="flex items-center gap-1 justify-center sm:justify-end">
                              {canSendWhatsapp() && (
                                <span
                                  className="flex items-center gap-0.5 shrink-0 text-red-500 cursor-not-allowed"
                                  title="Sin teléfono cargado"
                                >
                                  <span className="hidden sm:inline text-[10px] font-medium">Enviar</span>
                                  <WhatsAppIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Responsable */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.responsable }}>
                          {(() => {
                            // Church-cuerda exception: contacts dispatched to
                            // MJA Central don't have a specific person as
                            // responsable — the church handles them as a
                            // whole. Per Dan: 'responsibles in church would
                            // always be called by default. It cannot be
                            // changed.' So we hardcode the label to the
                            // church-cuerda's own numero (e.g. 'MJA Central')
                            // regardless of what responsable_id holds. Only
                            // affects this one cuerda — every other cuerda's
                            // contacts still resolve via teamMembers.
                            if (churchCuerda?.numero && c.numero_cuerda === churchCuerda.numero) {
                              return <span className="text-[11px] text-foreground truncate block">{churchCuerda.numero}</span>;
                            }
                            const resp = c.responsable_id ? profileById.get(c.responsable_id) : null;
                            if (!resp) return <span className="text-[11px] text-muted-foreground italic">—</span>;
                            return <span className="text-[11px] text-foreground truncate block">{resp.first_name} {resp.last_name}</span>;
                          })()}
                        </td>

                        {/* Conector — opt-in column toggled in toolbar.
                            Free text from contact.conector. */}
                        {showConectorCol && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.conector }}>
                            {c.conector ? (
                              <span className="text-[11px] text-foreground truncate block" title={c.conector}>{c.conector}</span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">—</span>
                            )}
                          </td>
                        )}

                        {/* En ruta — small badge if this contact is a stop in any
                            non-expired shared route. Filterable via the column header
                            (Todos / En ruta / Sin ruta). Toggleable via Columns3. */}
                        {showRutaCol && (
                          <td className="px-2 py-1.5 text-center" style={{ width: colWidths.ruta }}>
                            {routeContactIds?.has(c.id) && (
                              <span
                                className="inline-flex items-center px-1.5 leading-none rounded text-[9px] font-semibold uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                style={{ height: 18 }}
                                title="Este contacto está en al menos una ruta activa"
                              >
                                En ruta
                              </span>
                            )}
                          </td>
                        )}

                        {/* Dirección + Ver en mapa */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.direccion }}>
                          {(c.address && /[\p{L}\p{N}]/u.test(c.address)) ? (() => {
                            // Incomplete address = no street number (just a locality like "San Martín")
                            const hasStreetNumber = /\d/.test(c.address!);
                            const colorClass = hasStreetNumber ? 'text-foreground' : 'text-red-400';
                            return (
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-xs truncate max-w-[150px] ${colorClass}`}
                                  title={hasStreetNumber ? c.address! : `⚠ Dirección incompleta (sin número): ${c.address}`}
                                >
                                  {c.address}
                                </span>
                                <button
                                  className="text-primary hover:text-primary/80 shrink-0"
                                  title="Ver en mapa"
                                  onClick={() => {
                                    const sugCell = sug?.cell;
                                    const sugCuerdaNum = sug?.cuerda?.numero;
                                    setMapContact({
                                      name: `${c.first_name} ${c.last_name || ''}`.trim(),
                                      address: c.address!,
                                      sugCell: sugCell ? { name: sugCell.name, address: sugCell.address, lat: sugCell.lat, lng: sugCell.lng, cuerdaNumero: sugCuerdaNum || undefined, meetingDay: sugCell.meeting_day, meetingTime: sugCell.meeting_time } : null,
                                    });
                                  }}
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })() : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600/30 cursor-help">Sin dirección</Badge>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">Sin dirección no se puede sugerir célula automáticamente.</p></TooltipContent>
                            </Tooltip>
                          )}
                        </td>

                        {/* Fecha (created_at) */}
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums" style={{ width: colWidths.fechaContacto }}>
                          {c.fecha_contacto ? (() => {
                            // Parse YYYY-MM-DD as local date to avoid UTC offset shifting
                            const parts = String(c.fecha_contacto).slice(0, 10).split('-');
                            if (parts.length !== 3) return '—';
                            return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
                          })() : '—'}
                        </td>

                        {/* Sugerencia / Célula asignada / Zona classification */}
                        {isUnassignedView && showSugerencia && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.sugerencia }}>
                            {userCuerdaHasTerritory ? (() => {
                              // Non-MJA user whose cuerda has territory: show zone classification only
                              const uc = (cuerdas || []).find(cu => cu.numero === userCuerdaNumero);
                              const paths = uc ? cuerdaTerritoryMap.get(uc.id) : null;
                              if (!paths || c.lat == null || c.lng == null) {
                                return <span className="text-xs text-muted-foreground">Sin coordenadas</span>;
                              }
                              const inside = isPointInTerritory(c.lat, c.lng, paths);
                              return inside
                                ? <span className="text-[11px] font-medium text-green-400">✓ En zona</span>
                                : <span className="text-[11px] font-medium text-red-400">⚠ Fuera de zona</span>;
                            })() : c.cell_id ? (() => {
                              // Already assigned to a cell — show the assignment
                              const assignedCell = c.cell_id ? cellById.get(c.cell_id) : undefined;
                              const assignedCuerda = assignedCell?.cuerda_id ? cuerdaById.get(assignedCell.cuerda_id) : null;
                              return assignedCell ? (
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <Badge className="text-[9px] shrink-0 bg-blue-500/15 text-blue-400 hover:bg-blue-500/15">{assignedCell.name}</Badge>
                                  {assignedCuerda && <span className="text-[9px] text-blue-400/70">Cda {assignedCuerda.numero}</span>}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">Asignado</span>;
                            })() : sugCell ? (() => {
                              const hasDist = c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng) && sugCell.lat != null && sugCell.lng != null;
                              const dist = hasDist ? haversine(c.lat!, c.lng!, sugCell.lat!, sugCell.lng!) : null;
                              // Territory-based classification beats km when
                              // the suggested cuerda has a polygon defined.
                              // Per Dan: 'el sistema mostraría En Zona / Fuera
                              // de Zona, especialmente en el Semillero. La
                              // distancia se queda solo para MJA Central.'
                              // Implementation: church-cuerda has no territory
                              // by trigger rule, so it naturally falls back to
                              // the km label. Other cuerdas without a drawn
                              // territory also fall back to km — no surprise.
                              const territoryPaths = sugCuerda ? cuerdaTerritoryMap.get(sugCuerda.id) : null;
                              const territoryClass = territoryPaths && c.lat != null && c.lng != null
                                ? (isPointInTerritory(c.lat, c.lng, territoryPaths) ? 'in' : 'out')
                                : null;
                              const useTerritory = territoryClass !== null;
                              const inZone = territoryClass === 'in';
                              const badgeClass = useTerritory
                                ? (inZone ? 'bg-green-500/15 text-green-400 hover:bg-green-500/15' : 'bg-red-500/15 text-red-400 hover:bg-red-500/15')
                                : (dist != null ? getDistanceBadgeClass(dist) : (isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15'));
                              const textColor = useTerritory
                                ? (inZone ? 'text-green-400' : 'text-red-400')
                                : (dist != null ? getDistanceColor(dist) : (isExternal ? 'text-orange-400' : 'text-green-500'));
                              return (
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <Badge className={`text-[9px] shrink-0 ${badgeClass}`}>{sugCell.name}</Badge>
                                  {useTerritory ? (
                                    inZone
                                      ? <span className="text-[9px] font-medium shrink-0 text-green-400">✓ En zona</span>
                                      : <span className="text-[9px] font-medium shrink-0 text-red-400">⚠ Fuera → Enviar a MJA</span>
                                  ) : (
                                    <>
                                      {sugZona && <span className={`text-[9px] truncate ${textColor}`}>{sugZona.nombre}{isExternal ? ' ↗' : ''}</span>}
                                      {dist != null && <span className={`text-[9px] font-medium shrink-0 ${textColor}`}>{dist.toFixed(1)}km</span>}
                                    </>
                                  )}
                                </div>
                              );
                            })() : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        )}

                        {/* Action buttons. Non-global users (referente, conector,
                            etc.) only see 'Enviar a MJA'. The church-cuerda flow
                            is the single way they hand off contacts, and only
                            admin/general/pastor/supervisor (the church-cuerda
                            authority) actually assigns to specific cells. */}
                        {isUnassignedView && canAssignContacts() && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.asignar }}>
                            {c.cell_id ? (
                              <span className="text-[10px] text-blue-400">✓ Asignado</span>
                            ) : !isMjaMember && (c as any).pending_external_send && activePool === 'external' ? (
                              // ── REFERENTE OUTBOX ──
                              // Contact is in their 'Enviar a MJA' outbox, waiting
                              // for dispatch confirmation. Two actions:
                              //   - Confirmar despacho: actually dispatch to
                              //     MJA Central. numero_cuerda flips to the
                              //     church-cuerda, is_external becomes true,
                              //     pending_external_send goes back to false.
                              //     Contact leaves their semillero entirely.
                              //   - Cancelar envío: take it back to their
                              //     normal list. Just clears pending_external_send.
                              <div className="flex items-center gap-1">
                                <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={async () => {
                                  const cc = (cuerdas || []).find(cu => cu.is_church_cuerda);
                                  const update: any = {
                                    pending_external_send: false,
                                    is_external: true,
                                    // Auto-clear responsable_id on dispatch.
                                    // Per Dan: 'responsibles in church would
                                    // always be called by default. It cannot
                                    // be changed. We don't have people
                                    // responsible for contacts, we have just
                                    // the church.' Setting to null + display
                                    // logic shows 'MJA Central' for these.
                                    responsable_id: null,
                                  };
                                  if (cc) update.numero_cuerda = cc.numero;
                                  await supabase.from('contacts').update(update).eq('id', c.id);
                                  showSuccess('Despachado a MJA Central.');
                                  queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                }}>
                                  <Zap className="h-3 w-3 mr-1" /> Confirmar despacho
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={async () => {
                                  await supabase.from('contacts').update({ pending_external_send: false }).eq('id', c.id);
                                  showSuccess('Cancelado. El contacto vuelve a tu lista.');
                                  queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                }}>
                                  <Undo2 className="h-3 w-3 mr-1" /> Cancelar
                                </Button>
                              </div>
                            ) : isMjaMember && (c as any).pending_assignment_cell_id && activePool === 'pending_assignment' ? (
                              // ── MJA PRE-ASSIGNMENT OUTBOX ──
                              // The contact has a tentative cell pre-selected
                              // (pending_assignment_cell_id). MJA member needs
                              // to either confirm (commit cell_id) or cancel
                              // (clear the staging field, contact returns to
                              // En Lista). The pre-selected cell is shown so
                              // the member knows exactly what they pre-asigned
                              // before confirming.
                              (() => {
                                const stagedCellId = (c as any).pending_assignment_cell_id as string;
                                const stagedCell = stagedCellId ? cellById.get(stagedCellId) : undefined;
                                const stagedCuerda = stagedCell?.cuerda_id ? cuerdaById.get(stagedCell.cuerda_id) : null;
                                const stagedZona = stagedCuerda ? zonaById.get(stagedCuerda.zona_id) : null;
                                return (
                                  <div className="flex items-center gap-1">
                                    <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={async () => {
                                      // Commit: cell_id := pending_assignment_cell_id,
                                      // clear the staging column and is_external,
                                      // set zona/cuerda metadata to match the cell.
                                      const update: any = {
                                        cell_id: stagedCellId,
                                        pending_assignment_cell_id: null,
                                        is_external: false,
                                      };
                                      if (stagedCuerda) update.numero_cuerda = stagedCuerda.numero;
                                      if (stagedZona) { update.zona_id = stagedZona.id; update.zona = stagedZona.nombre; }
                                      const { error } = await supabase.from('contacts').update(update).eq('id', c.id);
                                      if (error) { showError(error.message); return; }
                                      // Activity log so this shows up in Historial
                                      // the same way a normal assignment does.
                                      await supabase.from('activity_logs').insert({
                                        user_id: session?.user?.id, church_id: churchId, action: 'assign',
                                        entity_type: 'contact', entity_id: c.id,
                                        before_data: { numero_cuerda: c.numero_cuerda, cell_id: c.cell_id },
                                        after_data: { numero_cuerda: stagedCuerda?.numero, cell_id: stagedCellId, cell_name: stagedCell?.name },
                                      });
                                      showSuccess(`Asignado a ${stagedCell?.name}.`);
                                      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                    }}>
                                      <Zap className="h-3 w-3 mr-1" /> Confirmar asignación
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={async () => {
                                      // Cancel: clear staging, contact returns
                                      // to En Lista. is_external untouched (if
                                      // it was true before pre-assign, it stays
                                      // true so the contact remains visibly part
                                      // of the dispatched pool).
                                      await supabase.from('contacts').update({ pending_assignment_cell_id: null }).eq('id', c.id);
                                      showSuccess('Pre-asignación cancelada.');
                                      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                    }}>
                                      <Undo2 className="h-3 w-3 mr-1" /> Cancelar
                                    </Button>
                                  </div>
                                );
                              })()
                            ) : !isMjaMember ? (
                              // Non-MJA users on a normal-list row: 'Enviar a MJA'
                              // is the OUTBOX action (stage 1). Only flips
                              // pending_external_send=true and leaves
                              // numero_cuerda alone — the contact stays on the
                              // user's cuerda but moves into their 'Enviar a
                              // MJA' outbox tab. The actual dispatch
                              // (numero_cuerda → 'MJA Central', is_external=true)
                              // happens when they click 'Confirmar despacho'
                              // inside the outbox.
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[11px] px-2 border-orange-500/50 text-orange-400 gap-1"
                                title="Enviar a MJA — el contacto va a tu outbox 'Enviar a MJA' hasta que confirmes el despacho"
                                onClick={async () => {
                                  await supabase.from('contacts').update({ pending_external_send: true }).eq('id', c.id);
                                  showSuccess('Movido a tu outbox "Enviar a MJA". Confirmá el despacho cuando estés seguro.');
                                  queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                }}
                              >
                                <ExternalLink className="h-3 w-3" /> MJA
                              </Button>
                            ) : (
                              // MJA member on a normal inbox row. Both
                              // is_external (came from a referente dispatch)
                              // and non-external rows show the same control:
                              // a split button with 'Pre-Asignar' on the
                              // main click (committing to sugCell) and a
                              // caret dropdown for picking ANY cell in any
                              // non-church cuerda. Per Dan: 'el botón de
                              // pre-asignar no es solamente para pre-asignar
                              // a la cuerda sugerida; tiene que tener una
                              // flechita para asignarle cualquier cuerda.'
                              //
                              // The dropdown groups cells by cuerda so the
                              // user navigates by cuerda first, cell second.
                              // The suggested cell is highlighted with a
                              // ★ marker so it's still discoverable from
                              // inside the dropdown — useful when the user
                              // opened the menu intending the suggestion
                              // anyway.
                              //
                              // Renders even when sugCell is null (no
                              // address / no geographic suggestion) — the
                              // dropdown itself is the way to assign
                              // those rows manually. In that case the main
                              // half is disabled and only the caret works.
                              (() => {
                                // Build the cell list once per row. Skip cells
                                // belonging to the church-cuerda — that's the
                                // pool source, not a valid destination.
                                const assignableCells = (cells || []).filter(cl => {
                                  const cu = (cuerdas || []).find(x => x.id === cl.cuerda_id);
                                  return cu && !cu.is_church_cuerda;
                                });
                                // Group by cuerda numero for menu sections.
                                const cellsByCuerda = new Map<string, { cells: typeof assignableCells; cuerda: typeof cuerdas extends Array<infer T> ? T : never }>();
                                for (const cell of assignableCells) {
                                  const cu = (cuerdas || []).find(x => x.id === cell.cuerda_id);
                                  if (!cu) continue;
                                  const entry = cellsByCuerda.get(cu.numero) || { cells: [] as typeof assignableCells, cuerda: cu as any };
                                  entry.cells.push(cell);
                                  cellsByCuerda.set(cu.numero, entry);
                                }
                                const sortedCuerdaNumeros = Array.from(cellsByCuerda.keys()).sort();
                                const onPickCell = (cell: { id: string; name: string; cuerda_id: string }) => {
                                  const cu = (cuerdas || []).find(x => x.id === cell.cuerda_id);
                                  const z = cu ? (zonas || []).find(zz => zz.id === cu.zona_id) : null;
                                  setConfirmDialog({
                                    type: 'pre_assign', contactId: c.id,
                                    cellId: cell.id, cellName: cell.name,
                                    cuerdaNum: cu?.numero, zonaName: z?.nombre,
                                  });
                                };
                                return (
                                  <div className="inline-flex items-center">
                                    <Button
                                      variant="default" size="sm"
                                      className="h-7 text-[11px] pl-2 pr-1.5 rounded-r-none"
                                      disabled={!sugCell}
                                      onClick={() => sugCell && setConfirmDialog({
                                        type: 'pre_assign', contactId: c.id, cellId: sugCell.id, cellName: sugCell.name,
                                        cuerdaNum: sugCuerda?.numero, zonaName: sugZona?.nombre,
                                      })}
                                    >
                                      <Zap className="h-3 w-3 mr-1" /> Pre-Asignar
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="default" size="sm"
                                          className="h-7 px-1 rounded-l-none border-l border-l-primary-foreground/30"
                                          title="Pre-asignar a otra cuerda"
                                        >
                                          <ChevronDown className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-auto" collisionPadding={16}>
                                        {sortedCuerdaNumeros.length === 0 && (
                                          <DropdownMenuItem disabled>Sin células disponibles</DropdownMenuItem>
                                        )}
                                        {sortedCuerdaNumeros.map((numero, idx) => {
                                          const entry = cellsByCuerda.get(numero)!;
                                          return (
                                            <React.Fragment key={numero}>
                                              {idx > 0 && <DropdownMenuSeparator />}
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                Cuerda {numero}
                                              </DropdownMenuLabel>
                                              {entry.cells.map(cell => (
                                                <DropdownMenuItem
                                                  key={cell.id}
                                                  onClick={() => onPickCell(cell)}
                                                  className="text-[11px]"
                                                >
                                                  {cell.id === sugCell?.id && <span className="mr-1.5">★</span>}
                                                  <span>{cell.name}</span>
                                                </DropdownMenuItem>
                                              ))}
                                            </React.Fragment>
                                          );
                                        })}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                );
                              })()
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination controls — same block rendered above the table too
              (see paginationControls const below). Buttons are disabled at
              the edges so accidental clicks don't loop. */}
          {paginationControls}
        </CardContent>
      </Card>

      {/* Confirmation Dialog — unified across 5 assignment flows.
          Display + copy live in AssignConfirmDialog; the mutations
          themselves stay here so they can read allContacts / cuerdas
          / zonas / selectedIds / suggestions out of the page state. */}
      <AssignConfirmDialog
        state={confirmDialog}
        onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
        visibleSelectedCount={visibleSelectedCount}
        pending={autoAssignMutation.isPending || assignSingleMutation.isPending}
        onConfirm={async () => {
          if (!confirmDialog) return;
          if (confirmDialog.type === 'auto') {
            autoAssignMutation.mutate();
            return;
          }
          if (confirmDialog.type === 'auto_selected') {
            const toAssign = filteredContacts.filter(c => selectedIds.has(c.id) && !c.cell_id);
            let count = 0;
            for (const c of toAssign) {
              const sug = suggestions[c.id];
              if (!sug?.cell) continue;
              const cell = sug.cell;
              let zonaId: string | null = null;
              let zonaName: string | null = null;
              let cuerdaNum: string | null = null;
              if (cell.cuerda_id && cuerdas?.length) {
                const cuerda = cuerdas.find(cr => cr.id === cell.cuerda_id);
                if (cuerda) {
                  cuerdaNum = cuerda.numero;
                  const zona = zonas?.find(z => z.id === cuerda.zona_id);
                  if (zona) { zonaId = zona.id; zonaName = zona.nombre; }
                }
              }
              const { error } = await supabase.from('contacts').update({
                cell_id: cell.id, zona_id: zonaId, zona: zonaName, numero_cuerda: cuerdaNum,
                pool_assigned_at: new Date().toISOString(), pool_assigned_by: session?.user?.id,
              }).eq('id', c.id);
              if (!error) {
                count++;
                await supabase.from('activity_logs').insert({
                  user_id: session?.user?.id, church_id: churchId, action: 'assign',
                  entity_type: 'contact', entity_id: c.id,
                  before_data: { numero_cuerda: c.numero_cuerda, cell_id: c.cell_id },
                  after_data: { numero_cuerda: cuerdaNum, cell_id: cell.id, cell_name: cell.name },
                });
              }
            }
            showSuccess(`${count} contacto(s) autoasignados.`);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
            setConfirmDialog(null);
            return;
          }
          if (confirmDialog.type === 'cuerda_only') {
            const zona = zonas?.find(z => z.id === confirmDialog.cuerdaZonaId);
            const { error } = await supabase.from('contacts').update({
              numero_cuerda: confirmDialog.cuerdaNum,
              zona_id: zona?.id || null,
              zona: zona?.nombre || null,
              cell_id: null,
            }).eq('id', confirmDialog.contactId);
            if (error) {
              showError(error.message);
            } else {
              const contact = allContacts?.find(ct => ct.id === confirmDialog.contactId);
              await supabase.from('activity_logs').insert({
                user_id: session?.user?.id,
                church_id: churchId,
                action: 'assign',
                entity_type: 'contact',
                entity_id: confirmDialog.contactId,
                before_data: { numero_cuerda: contact?.numero_cuerda, cell_id: contact?.cell_id, zona: contact?.zona },
                after_data: { numero_cuerda: confirmDialog.cuerdaNum, cell_id: null, zona: zona?.nombre },
              });
              showSuccess(`Contacto asignado a Cuerda ${confirmDialog.cuerdaNum}.`);
              queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
            }
            setConfirmDialog(null);
            return;
          }
          if (confirmDialog.type === 'pre_assign') {
            // Stage the assignment in pending_assignment_cell_id without touching
            // cell_id. Contact moves to the 'Asignar Contactos' outbox tab.
            // Member confirms or cancels from there.
            const { error } = await supabase.from('contacts').update({
              pending_assignment_cell_id: confirmDialog.cellId,
            }).eq('id', confirmDialog.contactId);
            if (error) {
              showError(error.message);
            } else {
              showSuccess('Pre-asignado. Lo encontrás en "Asignar Contactos" para confirmar.');
              queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
            }
            setConfirmDialog(null);
            return;
          }
          if (confirmDialog.type === 'assign') {
            assignSingleMutation.mutate({ contactId: confirmDialog.contactId, cellId: confirmDialog.cellId });
          }
        }}
      />

      {/* CSV Import Dialog — render the wrapper only when open so the lazy
          CsvImporter chunk only fetches on first open, not page mount. */}
      {csvDialogOpen && (
        <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
          <DialogContent className="sm:max-w-[1200px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Importar Contactos desde CSV o Excel</DialogTitle>
              <DialogDescription>
                Los contactos importados aparecerán en el pool "Sin asignar" para que puedas verificar sus direcciones y asignarles una célula.
              </DialogDescription>
            </DialogHeader>
            <Suspense fallback={<div className="py-6 text-center text-sm text-muted-foreground">Cargando importador…</div>}>
              <CsvImporter
                tableName="contacts"
                requiredFields={CONTACT_FIELDS.filter(f => f.key === 'first_name' || f.key === 'sexo')}
                optionalFields={CONTACT_FIELDS.filter(f => f.key !== 'first_name' && f.key !== 'sexo' && f.key !== 'barrio' && f.key !== 'leader_assigned')}
                churchId={churchId}
                onImportComplete={(ids) => {
                  setRecentImportIds(new Set(ids));
                  setCsvDialogOpen(false);
                }}
              />
            </Suspense>
          </DialogContent>
        </Dialog>
      )}

      {/* Contact Profile Dialog — only mount once a row has been clicked. */}
      {selectedContactId && (
        <Suspense fallback={null}>
          <ContactProfileDialog
            open
            onOpenChange={(o) => {
              if (!o) {
                setSelectedContactId(null);
                queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
              }
            }}
            contactId={selectedContactId}
            churchId={churchId!}
          />
        </Suspense>
      )}

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedCount={selectedIds.size}
        deleting={deleting}
        onConfirm={async () => {
          setDeleting(true);
          const ids = Array.from(selectedIds);
          const nowIso = new Date().toISOString();
          const userId = session?.user?.id || null;
          // Bulk-delete in chunks. Sending 1138 ids as a single PostgREST .in()
          // call builds a query string of ~42KB and the server rejects it with
          // 400. Chunk size 200 keeps each URL around 7-8KB.
          const CHUNK = 200;
          let failed = 0;
          let firstError: string | null = null;
          for (let i = 0; i < ids.length; i += CHUNK) {
            const slice = ids.slice(i, i + CHUNK);
            const { error } = await supabase
              .from('contacts')
              .update({ deleted_at: nowIso, deleted_by: userId })
              .in('id', slice);
            if (error) {
              failed += slice.length;
              if (!firstError) firstError = error.message;
            }
          }
          setDeleting(false);
          if (failed > 0) {
            showError(`No se pudieron eliminar ${failed} contacto(s). ${firstError || ''}`);
            queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
            return;
          }
          // Audit row for the bulk delete. We log a single row covering
          // the whole batch — the affected ids are in after_data so we
          // can reconstruct exactly which contacts were soft-deleted if
          // an incident calls for it.
          logAdminAction({
            action: 'bulk_delete_contacts',
            entityType: 'contacts',
            entityId: ids[0],
            churchId,
            afterData: { count: ids.length, contact_ids: ids, deleted_at: nowIso },
          });
          showSuccess(`${ids.length} contacto${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}.`);
          setSelectedIds(new Set());
          setBulkDeleteOpen(false);
          queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
        }}
      />

      {/* Add Contact Dialog — lazy: only rendered after the user clicks "Add". */}
      {addContactOpen && (
        <Suspense fallback={null}>
          <AddContactDialog
            open
            onOpenChange={(o) => {
              setAddContactOpen(o);
              if (!o) queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
            }}
            churchId={churchId!}
          />
        </Suspense>
      )}

      {/* Duplicate merge dialog — opened by clicking the amber dot on a row.
          On resolve (merge or dismiss) we invalidate both the contacts pool
          and the dismissals query so the table updates and the dot recomputes
          correctly without a manual refresh. Lazy because most users never
          open it. */}
      {mergeGroup && (
        <Suspense fallback={null}>
          <DuplicateMergeDialog
            open
            onOpenChange={(o) => { if (!o) setMergeGroup(null); }}
            group={mergeGroup as any}
            userId={session?.user?.id || null}
            onResolved={() => {
              queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              queryClient.invalidateQueries({ queryKey: ['dedupe-dismissals', churchId] });
              setSelectedIds(new Set());
            }}
          />
        </Suspense>
      )}

      {/* Contact Map Dialog */}
      <ContactMapDialog
        open={!!mapContact}
        onOpenChange={(o) => { if (!o) setMapContact(null); }}
        contactName={mapContact?.name || ''}
        contactAddress={mapContact?.address || ''}
        churchAddress={church?.address || null}
        suggestedCell={mapContact?.sugCell || null}
      />
      <WhatsAppComposeDialog
        open={!!whatsappCompose}
        onOpenChange={(o) => { if (!o) setWhatsappCompose(null); }}
        contactId={whatsappCompose?.contactId}
        contactName={whatsappCompose?.name || ''}
        contactFirstName={whatsappCompose?.firstName || ''}
        contactLastName={whatsappCompose?.lastName || ''}
        contactPhone={whatsappCompose?.phone || ''}
        churchId={churchId}
        onSent={async (_message, templateName) => {
          // Log WhatsApp send to contact history
          if (!whatsappCompose) return;
          const contactId = whatsappCompose.contactId;
          try {
            const session = (await supabase.auth.getSession()).data.session;
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
            const note = templateName
              ? `WhatsApp enviado a las ${time} usando plantilla "${templateName}".`
              : `WhatsApp enviado a las ${time} (sin plantilla).`;
            const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/add-contact-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
              body: JSON.stringify({
                contactId,
                churchId,
                contact_date: today,
                contact_method: 'WhatsApp',
                notes: note,
              }),
            });
            if (!resp.ok) {
              console.error('add-contact-log failed:', resp.status, await resp.text());
              showError('No se pudo registrar el envío en el historial.');
              return;
            }
            showSuccess('Envío registrado en el historial.');
            queryClient.invalidateQueries({ queryKey: ['contact-logs-inline', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact_logs', contactId] });
          } catch (e) { console.error('Failed to log WhatsApp send:', e); showError('Error registrando el envío.'); }
        }}
      />

      {/* Bulk WhatsApp dialog - up to 5 contacts at once. Lazy: most uses
          of Semillero never trigger a bulk send. */}
      {bulkWhatsAppOpen && (
        <Suspense fallback={null}>
          <BulkWhatsAppDialog
            open
            onOpenChange={setBulkWhatsAppOpen}
            contacts={(allContacts || []).filter(c => selectedIds.has(c.id)).map(c => ({
              id: c.id,
              first_name: c.first_name,
              last_name: c.last_name,
              phone: c.phone,
            }))}
            churchId={churchId}
            onSent={async (sentContactIds, _message, templateName) => {
          // Log each WhatsApp send to contact history
          try {
            const session = (await supabase.auth.getSession()).data.session;
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
            const note = templateName
              ? `WhatsApp enviado a las ${time} usando plantilla "${templateName}" (envío masivo).`
              : `WhatsApp enviado a las ${time} (envío masivo, sin plantilla).`;
            await Promise.all(sentContactIds.map(contactId =>
              fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/add-contact-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
                body: JSON.stringify({
                  contactId, churchId, contact_date: today, contact_method: 'WhatsApp', notes: note,
                }),
              })
            ));
          } catch (e) { console.error('Failed to log bulk WhatsApp:', e); }
        }}
          />
        </Suspense>
      )}

      {/* Floating action bar - appears at bottom of viewport when contacts are selected.
          Solves the problem of having to scroll back to the top to find the delete
          button when the user selects a contact at the bottom of a long list. */}
      {visibleSelectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 px-4 py-3 rounded-xl bg-background border-2 border-primary/40 shadow-2xl backdrop-blur-sm max-w-[95vw]" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(255,194,51,0.2)' }}>
          <span className="text-sm font-medium">
            <strong className="text-primary">{visibleSelectedCount}</strong> seleccionado{visibleSelectedCount === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Limpiar
          </button>
          {canAssignContacts() && isMjaMember && (
            <Button
              size="sm"
              onClick={() => setConfirmDialog({ type: 'auto_selected' })}
              className="gap-1.5"
            >
              <Zap className="h-4 w-4" /> Autoasignar
            </Button>
          )}
          {canAssignContacts() && !isMjaMember && activePool === 'unassigned' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
              onClick={async () => {
                // Bulk OUTBOX action: same as the per-row button — flip
                // pending_external_send=true on every selected contact.
                // Numero_cuerda stays. They land in the user's 'Enviar
                // a MJA' tab waiting for dispatch confirmation.
                const ids = Array.from(selectedIds).filter(id => filteredContacts.some(fc => fc.id === id));
                if (ids.length === 0) return;
                await supabase.from('contacts').update({ pending_external_send: true }).in('id', ids);
                showSuccess(`${ids.length} movido${ids.length === 1 ? '' : 's'} al outbox "Enviar a MJA".`);
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              }}
            >
              <ExternalLink className="h-4 w-4" /> Enviar a MJA
            </Button>
          )}
          {canAssignContacts() && !isMjaMember && activePool === 'external' && (
            // Inside the referente outbox, bulk = the second-stage
            // dispatch confirmation: actually push everything to MJA
            // Central. numero_cuerda flips, is_external becomes true,
            // pending_external_send goes back to false.
            <Button
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                const cc = (cuerdas || []).find(cu => cu.is_church_cuerda);
                const ids = Array.from(selectedIds).filter(id => filteredContacts.some(fc => fc.id === id));
                if (ids.length === 0) return;
                const update: any = {
                  pending_external_send: false,
                  is_external: true,
                  // Same church-handles-no-individual-responsable rule as
                  // the per-row Confirmar despacho action.
                  responsable_id: null,
                };
                if (cc) update.numero_cuerda = cc.numero;
                await supabase.from('contacts').update(update).in('id', ids);
                showSuccess(`${ids.length} despachado${ids.length === 1 ? '' : 's'} a MJA Central.`);
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              }}
            >
              <Zap className="h-4 w-4" /> Confirmar despacho
            </Button>
          )}
          {canSendWhatsapp() && visibleSelectedCount <= 5 && (
            <Button
              size="sm"
              onClick={() => setBulkWhatsAppOpen(true)}
              className="gap-1.5 bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              <WhatsAppIcon className="h-4 w-4" /> Enviar WhatsApp
            </Button>
          )}
          {canSendWhatsapp() && visibleSelectedCount > 5 && (
            <span className="text-xs text-amber-500 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/30">
              Máx 5 para WhatsApp
            </span>
          )}
          {canEditDeleteContacts() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setBulkAssignTargetId(''); setBulkAssignOpen(true); }}
              className="gap-1.5"
            >
              <Users className="h-4 w-4" /> Asignar Responsable
            </Button>
          )}
          {canEditDeleteContacts() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      )}

      <BulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        selectedCount={visibleSelectedCount}
        assigning={bulkAssigning}
        targetId={bulkAssignTargetId}
        onTargetChange={setBulkAssignTargetId}
        teamMembers={teamMembers}
        canSeeAllCuerdas={canSeeContactsFromAllCuerdas}
        userCuerdaNumero={userCuerdaNumero}
        onConfirm={async () => {
          if (!bulkAssignTargetId) return;
          setBulkAssigning(true);
          // Only act on the contacts that are actually visible in the current
          // filtered view, matching the visibleSelectedCount UI.
          const visibleIds = new Set(filteredContacts.map(c => c.id));
          const ids = Array.from(selectedIds).filter(id => visibleIds.has(id));
          const newResponsableId = bulkAssignTargetId === '__none__' ? null : bulkAssignTargetId;
          const { error } = await supabase
            .from('contacts')
            .update({ responsable_id: newResponsableId })
            .in('id', ids);
          setBulkAssigning(false);
          if (error) { showError(error.message); return; }
          showSuccess(`${ids.length} contacto${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}.`);
          setSelectedIds(new Set());
          setBulkAssignOpen(false);
          setBulkAssignTargetId('');
          queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
        }}
      />
    </div>
  );
};

export default SemilleroPage;
