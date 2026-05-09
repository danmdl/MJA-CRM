"use client";
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users, AlertCircle, Search, Undo2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Zap, ExternalLink, Upload, PlusCircle, RefreshCw, Eye, MessageSquare, MapPin, Trash2, Filter, ArrowUp, ArrowDown, ArrowUpDown, Columns3,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { normalize } from '@/lib/normalize';
import { isValidArgentinePhone } from '@/lib/phone-validation';
import { isWithinGBA, getDistanceColor, getDistanceWarning, getDistanceBadgeClass } from '@/lib/geo-validation';
import { buildGeocodeAddress } from '@/lib/geocode-address';
import CsvImporter from '@/components/admin/CsvImporter';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';
import ContactMapDialog from '@/components/admin/ContactMapDialog';
import WhatsAppComposeDialog, { WhatsAppIcon } from '@/components/admin/WhatsAppComposeDialog';
import FilterTabsBar, { applyFilterTab, FilterTabFilters } from '@/components/admin/FilterTabsBar';
import BulkWhatsAppDialog from '@/components/admin/BulkWhatsAppDialog';
import AddContactDialog from '@/components/admin/AddContactDialog';
import DuplicateMergeDialog from '@/components/admin/DuplicateMergeDialog';
import ContactPipelineBadge from '@/components/admin/ContactPipelineBadge';

// ─── Types ───────────────────────────────────────────────────────
interface Zona { id: string; nombre: string; }
interface Barrio { id: string; nombre: string; zona_id: string; }
interface Cuerda { id: string; numero: string; zona_id: string; is_church_cuerda?: boolean; }
interface Cell {
  id: string; name: string; church_id: string; cuerda_id: string | null;
  address: string | null; lat: number | null; lng: number | null;
  meeting_day: string | null; meeting_time: string | null;
}

interface Contact {
  id: string; first_name: string; last_name: string | null;
  phone: string | null; address: string | null; barrio: string | null;
  zona_id: string | null; zona?: string | null;
  conector: string | null; fecha_contacto: string | null;
  numero_cuerda: string | null; edad: string | null;
  cell_id: string | null; estado_seguimiento?: string | null;
  lat?: number | null; lng?: number | null;
  sexo?: string | null;
  estado_civil?: string | null;
  is_external?: boolean;
  pending_external_send?: boolean;
  pending_assignment_cell_id?: string | null;
  responsable_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

// Haversine distance in km
const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Resizable Header ────────────────────────────────────────────
const ResizableHeader = ({ children, width, onResize, className = '' }: {
  children: React.ReactNode; width: number; onResize: (delta: number) => void; className?: string;
}) => {
  const startX = useRef(0);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); startX.current = e.clientX;
    const onMove = (ev: MouseEvent) => { onResize(ev.clientX - startX.current); startX.current = ev.clientX; };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  };
  return (
    <th className={`relative text-left text-xs font-medium text-muted-foreground px-3 py-2 select-none ${className}`} style={{ width, minWidth: 60 }}>
      {children}
      <div onMouseDown={onMouseDown} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors" />
    </th>
  );
};

// ─── Main Component ──────────────────────────────────────────────
const SemilleroPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
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
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'auto' | 'manual' | 'cuerda_only' | 'auto_selected' | 'pre_assign';
    contactId?: string;
    cellId?: string;
    cellName?: string;
    cuerdaNum?: string;
    zonaName?: string;
    cuerdaZonaId?: string;
    preview?: { label: string; count: number }[];
  } | null>(null);
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
    check: 34, cuerda: 60, nombre: 130, dup: 44, responsable: 100, telefono: 110, direccion: 130, fechaContacto: 56, sugerencia: 150, asignar: 145, conector: 110,
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
  useEffect(() => { try { window.localStorage.setItem('semillero.showConectorCol', showConectorCol ? '1' : '0'); } catch {} }, [showConectorCol]);
  useEffect(() => { try { window.localStorage.setItem('semillero.showCuerdaCol', showCuerdaCol ? '1' : '0'); } catch {} }, [showCuerdaCol]);

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
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id, is_church_cuerda').in('zona_id', zonas.map(z => z.id));
      return data || [];
    },
    enabled: !!zonas?.length,
    staleTime: 5 * 60_000,
  });

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

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, name, church_id, cuerda_id, address, lat, lng, meeting_day, meeting_time').eq('church_id', churchId!).is('deleted_at', null);
      return (data || []) as Cell[];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Contacts is the hot data - users expect it to update when they come back
  // to the tab after sending a WhatsApp or editing in another tab. Override
  // the global default of refetchOnWindowFocus=false specifically for this query.
  const { data: allContacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-all-contacts', churchId],
    queryFn: async () => {
      // Supabase silently caps queries at 1000 rows. .limit(2000) doesn't
      // override the server default — it just sets a smaller cap if the
      // Supabase silently caps queries at 1000 rows. .limit(2000) doesn't
      // override the server default — it just sets a smaller cap if the
      // server's already lower. With 1680+ contacts in MJA Central, the
      // first 1000 by fecha_contacto DESC happened to all share the same
      // responsable (Micaela), so the Responsable filter dropdown showed
      // only her — and the "SIN ASIGNAR" counter at the top capped at 1000.
      // Paginate explicitly with .range() until we've drained the table.
      //
      // CRITICAL: order has to be stable across pages. fecha_contacto alone
      // is NOT — when CSV imports stamp thousands of rows with the same
      // timestamp, postgres returns those rows in arbitrary order, and the
      // arbitrary order is not consistent between two .range() calls. The
      // result is that page 2 starts somewhere unpredictable inside the
      // tied block: some rows show up twice, others never. (Dan's MJA
      // Central had 2983/3525 rows tied on fecha_contacto after a big
      // import, and the client was only receiving ~600 of the 3525 alive
      // rows because of this.) Adding `id` as a secondary sort gives every
      // row a globally unique position, which is the only way .range()
      // pagination is correct.
      const PAGE_SIZE = 1000;
      const all: Contact[] = [];
      for (let page = 0; ; page++) {
        let q = supabase.from('contacts')
          .select('id, first_name, last_name, phone, address, barrio, zona_id, zona, conector, fecha_contacto, numero_cuerda, edad, cell_id, estado_seguimiento, lat, lng, sexo, estado_civil, is_external, pending_external_send, pending_assignment_cell_id, responsable_id, created_by, created_at')
          .eq('church_id', churchId!)
          .is('deleted_at', null)
          .order('fecha_contacto', { ascending: false })
          .order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (profile?.role === 'conector') {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) q = q.eq('created_by', user.id);
        }
        const { data, error } = await q;
        if (error) {
          console.error('[pool-all-contacts] page', page, 'error', error);
          break;
        }
        const rows = (data || []) as Contact[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        // Safety stop — bumped from 10 → 50 pages so churches that grow
        // past 10k contacts still load completely. 50k rows is well past
        // anything plausible; the real protection is the staleTime on
        // this query so we don't refetch on every render.
        if (page >= 49) break;
      }
      // Belt-and-suspenders dedupe by id. With the (fecha_contacto, id)
      // ordering above .range() pagination should already be exact, but
      // if the server ever returns the same row in two pages (race
      // between INSERTs and our pagination, etc.) this keeps the client
      // count honest.
      const seen = new Set<string>();
      const unique: Contact[] = [];
      for (const r of all) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        unique.push(r);
      }
      return unique;
    },
    enabled: !!churchId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

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
  // First detect zona from barrio/address text, then find cells in that zona sorted by distance
  const detectZonaForContact = useCallback((contact: Contact): Zona | null => {
    if (!zonas?.length) return null;
    const text = normalize((contact.barrio || '') + ' ' + (contact.address || ''));
    if (!text.trim()) return null;
    if (barrios?.length) {
      for (const barrio of barrios) {
        if (text.includes(normalize(barrio.nombre))) return zonas.find(z => z.id === barrio.zona_id) || null;
      }
    }
    return zonas.find(z => text.includes(normalize(z.nombre))) || null;
  }, [zonas, barrios]);

  // Get the cuerda number for a cell
  const getCuerdaNumero = useCallback((cell: Cell): string | null => {
    if (!cell.cuerda_id || !cuerdas?.length) return null;
    const cuerda = cuerdas.find(c => c.id === cell.cuerda_id);
    return cuerda?.numero || null;
  }, [cuerdas]);

  // Filter cells by gender: 1xx = Masculino, 2xx = Femenino, 3xx = either
  const filterCellsByGender = useCallback((allCells: Cell[], sexo: string | null | undefined): Cell[] => {
    if (!sexo) return allCells; // Unknown gender → show all cells
    const isFemale = sexo.toLowerCase() === 'femenino';
    const isMale = sexo.toLowerCase() === 'masculino';
    if (!isFemale && !isMale) return allCells;

    return allCells.filter(cell => {
      const num = getCuerdaNumero(cell);
      if (!num) return true; // No cuerda → include
      const prefix = parseInt(num.charAt(0));
      if (prefix === 3) return true; // 3xx → gender-neutral
      if (isFemale) return prefix === 2; // Women → 2xx only
      if (isMale) return prefix === 1; // Men → 1xx only
      return true;
    });
  }, [getCuerdaNumero]);

  // Get cells sorted by distance to a contact (filtered by gender)
  const getCellsByDistance = useCallback((contact: Contact, filterZona?: Zona | null): Cell[] => {
    if (!cells?.length) return [];

    // FIRST: filter by gender — 1xx for men, 2xx for women
    const genderFiltered = filterCellsByGender(cells, contact.sexo);

    // If contact has VALID coordinates, use PURE distance on gender-filtered cells
    if (contact.lat != null && contact.lng != null && isWithinGBA(contact.lat, contact.lng)) {
      const cellsWithDist = genderFiltered
        .filter(c => c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng))
        .map(cell => ({
          cell,
          dist: haversine(contact.lat!, contact.lng!, cell.lat!, cell.lng!),
        }));
      return cellsWithDist.sort((a, b) => a.dist - b.dist).map(x => x.cell);
    }

    // No coordinates — use zona filtering + text matching as fallback
    let candidates = genderFiltered;
    if (filterZona && cuerdas?.length) {
      const zonaCuerdaIds = cuerdas.filter(c => c.zona_id === filterZona.id).map(c => c.id);
      const zonaCells = genderFiltered.filter(c => c.cuerda_id && zonaCuerdaIds.includes(c.cuerda_id));
      if (zonaCells.length > 0) candidates = zonaCells;
    }

    const cellsWithScore = candidates.map(cell => {
      let score = 999;
      const contactText = normalize((contact.address || '') + ' ' + (contact.barrio || ''));
      const cellText = normalize(cell.address || '');
      if (cellText && contactText) {
        const contactWords = new Set(contactText.split(/\s+/).filter(w => w.length > 2));
        const cellWords = cellText.split(/\s+/).filter(w => w.length > 2);
        const shared = cellWords.filter(w => contactWords.has(w)).length;
        score = shared > 0 ? (100 - shared * 10) : 500;
      }
      return { cell, score };
    });

    return cellsWithScore.sort((a, b) => a.score - b.score).map(x => x.cell);
  }, [cells, cuerdas, filterCellsByGender]);

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
  const churchCuerda = useMemo(
    () => (cuerdas || []).find(cu => cu.is_church_cuerda),
    [cuerdas],
  );
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

  const externalContacts = useMemo(() => {
    if (isMjaMember) {
      // ── NO OUTBOX FOR MJA MEMBERS ──
      // Per Dan: 'now the member of the church would see a new member
      // [contact] added to their own semillero'. Dispatched contacts
      // land in the MJA member's En Lista directly, not in a separate
      // outbox tab. The 'Enviar a MJA' chip will read 0 for them, and
      // is hidden in the toolbar render below to avoid confusion.
      return [];
    }
    // ── REFERENTE DISPATCH OUTBOX ──
    // The user's own pending dispatches — contacts they clicked
    // 'Enviar a MJA' on but haven't confirmed yet. Cuerda still
    // theirs.
    const userId = session?.user?.id;
    return (allContacts || []).filter(c => {
      if (!(c as any).pending_external_send) return false;
      if (c.cell_id) return false;
      if (userCuerdaNumero) {
        if (c.numero_cuerda !== userCuerdaNumero) return false;
      } else {
        if (c.created_by !== userId && c.responsable_id !== userId) return false;
      }
      return true;
    });
  }, [allContacts, isMjaMember, userCuerdaNumero, session?.user?.id]);

  const externalIds = useMemo(() => new Set(externalContacts.map(c => c.id)), [externalContacts]);
  // Every contact pending dispatch (any user, any cuerda). Used to
  // remove them from the 'En Lista' pool view across the board — a
  // pending-dispatch contact is private to its sender's outbox until
  // dispatched.
  const pendingDispatchIds = useMemo(() => {
    return new Set((allContacts || []).filter(c => (c as any).pending_external_send).map(c => c.id));
  }, [allContacts]);

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
  const pendingAssignmentContacts = useMemo(() => {
    if (!isMjaMember) return [];
    return (allContacts || []).filter(c => {
      if (!(c as any).pending_assignment_cell_id) return false;
      if (c.cell_id) return false;
      return true;
    });
  }, [allContacts, isMjaMember]);

  const pendingAssignmentIds = useMemo(
    () => new Set(pendingAssignmentContacts.map(c => c.id)),
    [pendingAssignmentContacts],
  );

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
  const inboxTotalCount = useMemo(() => {
    if (!allContacts) return 0;
    const userId = session?.user?.id;
    let n = 0;
    for (const c of allContacts) {
      // Already assigned to a cell → graduated out of the inbox.
      if (c.cell_id) continue;
      // In the inbox: not staged for dispatch, not pre-assigned, not
      // already in someone's outbox view.
      if (externalIds.has(c.id)) continue;
      if (pendingDispatchIds.has(c.id)) continue;
      if (pendingAssignmentIds.has(c.id)) continue;
      // Visibility — same rule as the main filter pipeline.
      if (!canSeeContactsFromAllCuerdas) {
        if (userCuerdaNumero) {
          if (c.numero_cuerda !== userCuerdaNumero) continue;
        } else if (c.responsable_id !== userId) {
          continue;
        }
      }
      n++;
    }
    return n;
  }, [allContacts, externalIds, pendingDispatchIds, pendingAssignmentIds, canSeeContactsFromAllCuerdas, userCuerdaNumero, session?.user?.id]);

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
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered: Contact[];
    if (searchTerm.trim()) {
      // Global search: when the user types in the search box, look
      // across ALL contacts in their visibility scope — assigned,
      // unassigned, in outbox, pre-asigned, anywhere. The user is
      // looking for a specific person and shouldn't be blocked by
      // pool boundaries. Per Dan: searching 'yesica Lopez' from
      // MJA Central was returning 0 results because the inbox view
      // had her excluded (she has a cell). Search now finds her
      // regardless. Pool-state badges in the row (Asignado, etc.)
      // tell the user where she actually is. Other filters (cuerda,
      // responsable, conector, duplicates) still apply normally.
      filtered = allContacts;
    } else if (activePool === 'unassigned') {
      // Inbox = the user's pending workload. Excludes:
      // - Already-assigned contacts (cell_id IS NOT NULL). Per Dan:
      //   'either they are part of the cuerda or they are not.' Once
      //   a contact has a célula, it has graduated out of the inbox
      //   and lives in that cell now. The DB trigger
      //   sync_contact_cuerda_from_cell makes sure numero_cuerda
      //   matches the cell's cuerda, so a referente of cuerda 201
      //   won't see contacts that ended up in another cuerda after
      //   assignment — they're filtered out here by the cell_id
      //   exclusion AND by the visibility filter further down.
      // - Contacts in the referente outbox (pending_external_send).
      //   Live in 'Enviar a MJA' until the referente confirms.
      // - Contacts pre-asigned by an MJA member but not yet confirmed
      //   (pending_assignment_cell_id). Live in 'Asignar Contactos'.
      filtered = allContacts.filter(c =>
        !c.cell_id
        && !externalIds.has(c.id)
        && !pendingDispatchIds.has(c.id)
        && !pendingAssignmentIds.has(c.id)
      );
    } else if (activePool === 'external') {
      filtered = externalContacts;
    } else if (activePool === 'pending_assignment') {
      // 'Asignar Contactos' tab — contacts MJA member pre-assigned,
      // awaiting final confirmation.
      filtered = pendingAssignmentContacts;
    } else {
      filtered = [];
    }
    // Visibility rules for non-global users (strict cuerda-based):
    // - If they have a cuerda: see ONLY contacts of their cuerda. Period.
    //   No exceptions for created_by or responsable_id (otherwise referentes
    //   could see contacts they assigned to people in other cuerdas, which
    //   leaked across cuerdas).
    // - If they DON'T have a cuerda: see ONLY contacts where they are
    //   responsable_id (the contacts that were specifically given to them).
    //   created_by is NOT enough (a conector might have created hundreds of
    //   contacts now in different cuerdas — they shouldn't see those anymore).
    if (!canSeeContactsFromAllCuerdas) {
      const userId = session?.user?.id;
      if (userCuerdaNumero) {
        filtered = filtered.filter(c => c.numero_cuerda === userCuerdaNumero);
      } else {
        filtered = filtered.filter(c => c.responsable_id === userId);
      }
    }
    // When Duplicados toggle is on, narrow to the dup-flagged rows BUT
    // keep the other active filters (Responsable, Cuerda, Conector, search)
    // applied — so picking Responsable=Mauro and then Duplicados shows
    // only Mauro's duplicates, not all of them. The visibility gate above
    // still applies as the first cut for non-globals.
    // Search now tokenizes by whitespace and requires every token to be
    // found somewhere in the combined haystack (first_name + last_name +
    // phone + address + barrio). Per Dan: typing 'camila b' in MJA Central
    // returned 0 results because the old search compared the whole query
    // 'camila b' against each field individually — it never spans the
    // first_name/last_name boundary. With tokenization, both 'camila' AND
    // 'b' independently must appear in the haystack: 'Camila Betancourt'
    // matches because the haystack 'camila betancourt …' contains both.
    // Order-insensitive too: 'b camila' or 'betancourt c' work the same.
    if (searchTerm.trim()) {
      const tokens = normalize(searchTerm).split(/\s+/).filter(Boolean);
      filtered = filtered.filter(c => {
        const hay = normalize(`${c.first_name || ''} ${c.last_name || ''} ${c.phone || ''} ${c.address || ''} ${c.barrio || ''}`);
        return tokens.every(t => hay.includes(t));
      });
    }
    if (filterCuerda) {
      filtered = filtered.filter(c => c.numero_cuerda === filterCuerda);
    }
    if (filterResponsable === '__none__') {
      filtered = filtered.filter(c => !c.responsable_id);
    } else if (filterResponsable === '__church_cuerda__') {
      // Virtual 'MJA Central' filter — match the contacts that landed
      // on the church-cuerda after dispatch. The church-cuerda
      // trigger forces responsable_id NULL on these, so the filter
      // is the conjunction of cuerda + null responsable.
      filtered = filtered.filter(c => !c.responsable_id && churchCuerda?.numero && c.numero_cuerda === churchCuerda.numero);
    } else if (filterResponsable) {
      filtered = filtered.filter(c => c.responsable_id === filterResponsable);
    }
    if (filterConector === '__none__') {
      filtered = filtered.filter(c => !c.conector);
    } else if (filterConector) {
      const target = normalize(filterConector);
      filtered = filtered.filter(c => c.conector && normalize(c.conector) === target);
    }
    if (filterDuplicates) {
      filtered = filtered.filter(c => duplicateNameIds.has(c.id));
    }
    // Apply active tab filters (saved per-user filter combination)
    if (activeTabId && Object.keys(activeTabFilters).length > 0) {
      filtered = applyFilterTab(filtered, activeTabFilters);
    }
    // Sorting. When Duplicados toggle is on, we force-sort by normalized
    // name regardless of what the user's sort header was set to — there's
    // no point seeing duplicate pairs scattered down the table when the
    // whole reason for the toggle is comparing them. Outside that mode,
    // honour whatever the user picked via the column headers.
    if (filterDuplicates) {
      filtered = [...filtered].sort((a, b) => {
        const an = normalize(`${a.first_name || ''} ${a.last_name || ''}`.trim());
        const bn = normalize(`${b.first_name || ''} ${b.last_name || ''}`.trim());
        return an.localeCompare(bn);
      });
    } else if (sortBy === 'nombre') {
      filtered = [...filtered].sort((a, b) => {
        // normalize() strips accents + lowercases, so "Alexander Martínez"
        // and "Alexander Martinez" sort to the same key and end up next
        // to each other in the table — useful for spotting the 'dup'
        // pill rows without scrolling.
        const an = normalize(`${a.first_name || ''} ${a.last_name || ''}`.trim());
        const bn = normalize(`${b.first_name || ''} ${b.last_name || ''}`.trim());
        return sortDir === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an);
      });
    } else if (sortBy === 'fecha') {
      filtered = [...filtered].sort((a, b) => {
        const at = a.fecha_contacto ? new Date(a.fecha_contacto).getTime() : 0;
        const bt = b.fecha_contacto ? new Date(b.fecha_contacto).getTime() : 0;
        return sortDir === 'asc' ? at - bt : bt - at;
      });
    }
    return filtered;
  }, [allContacts, activePool, searchTerm, filterCuerda, filterResponsable, filterConector, filterDuplicates, duplicateNameIds, activeTabId, activeTabFilters, externalContacts, externalIds, pendingDispatchIds, pendingAssignmentContacts, pendingAssignmentIds, canSeeContactsFromAllCuerdas, userCuerdaNumero, sortBy, sortDir, session?.user?.id]);

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
  }, [searchTerm, filterCuerda, filterResponsable, filterConector, filterDuplicates, activePool, activeTabId]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE));
  // Clamp the current page in case the data shrank below where we are
  // (race between filteredContacts updating and the useEffect above firing).
  const safePage = Math.min(currentPage, totalPages - 1);
  // Slice we actually render — only the current page worth of rows. Both
  // the floating checkbox column and the table render against this so they
  // stay in sync.
  const visibleContacts = useMemo(
    () => filteredContacts.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filteredContacts, safePage]
  );
  const pageStart = filteredContacts.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const pageEnd = Math.min((safePage + 1) * PAGE_SIZE, filteredContacts.length);

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
  // Hidden when the filtered set fits in a single page so the toolbar
  // doesn't get visually busy for small results.
  const paginationControls = !isLoading && totalPages > 1 ? (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t text-xs">
      <div className="text-muted-foreground tabular-nums">
        Mostrando <span className="font-semibold text-foreground">{pageStart.toLocaleString('es-AR')}–{pageEnd.toLocaleString('es-AR')}</span> de {filteredContacts.length.toLocaleString('es-AR')}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCurrentPage(0)}
          disabled={safePage === 0}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Primera página"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={safePage === 0}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 tabular-nums text-muted-foreground">
          Página <span className="font-semibold text-foreground">{safePage + 1}</span> de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={safePage >= totalPages - 1}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Página siguiente"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setCurrentPage(totalPages - 1)}
          disabled={safePage >= totalPages - 1}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Última página"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
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
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${activePool === 'external' ? 'border-orange-500 bg-orange-500/10' : externalContacts.length > 0 ? 'border-orange-500/30 hover:border-orange-500/60' : 'border-border hover:border-foreground/30'}`}
            title='Tu outbox: contactos que enviaste a MJA pero todavía no confirmaste el despacho. Confirmá cuando estés seguro y recién ahí salen de tu cuerda.'
          >
            <span className="text-[10px] uppercase tracking-wider text-orange-400">Enviar a MJA</span>
            <span className={`text-sm font-bold tabular-nums ${externalContacts.length > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? '…' : externalContacts.length}</span>
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
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border transition-colors ${activePool === 'pending_assignment' ? 'border-orange-500 bg-orange-500/10' : pendingAssignmentContacts.length > 0 ? 'border-orange-500/30 hover:border-orange-500/60' : 'border-border hover:border-foreground/30'}`}
            title='Tu outbox de pre-asignaciones: contactos que pre-asignaste a una célula pero todavía no confirmaste. Confirmá cuando estés seguro y recién ahí entra a la célula final.'
          >
            <span className="text-[10px] uppercase tracking-wider text-orange-400">Asignar Contactos</span>
            <span className={`text-sm font-bold tabular-nums ${pendingAssignmentContacts.length > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? '…' : pendingAssignmentContacts.length}</span>
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
              onActiveTabChange={(id, filters) => {
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
                            {(() => {
                              // Same dropdown-narrowing approach as the Responsable
                              // column: build the visible set with all OTHER active
                              // filters applied (cuerda excluded so the dropdown
                              // doesn't collapse to just the selected one), then
                              // collect distinct numero_cuerda values from there.
                              // That way picking a Responsable first narrows what
                              // cuerdas appear here to ones that actually have
                              // contacts under the current criteria — admins
                              // looking at "Responsable=Micaela" only see her
                              // cuerdas, not every cuerda in the church.
                              const userId = session?.user?.id;
                              const visible = (allContacts || []).filter(c => {
                                if (!canSeeContactsFromAllCuerdas) {
                                  if (userCuerdaNumero) {
                                    if (c.numero_cuerda !== userCuerdaNumero) return false;
                                  } else if (c.responsable_id !== userId) {
                                    return false;
                                  }
                                }
                                if (filterResponsable === '__none__') {
                                  if (c.responsable_id) return false;
                                } else if (filterResponsable === '__church_cuerda__') {
                                  if (c.responsable_id) return false;
                                  if (!churchCuerda?.numero || c.numero_cuerda !== churchCuerda.numero) return false;
                                } else if (filterResponsable && c.responsable_id !== filterResponsable) {
                                  return false;
                                }
                                if (filterConector === '__none__' && c.conector) return false;
                                if (filterConector && filterConector !== '__none__') {
                                  if (!c.conector || normalize(c.conector) !== normalize(filterConector)) return false;
                                }
                                if (filterDuplicates && !duplicateNameIds.has(c.id)) return false;
                                if (searchTerm.trim()) {
                                  // Tokenized search — see main filter for the rationale.
                                  const tokens = normalize(searchTerm).split(/\s+/).filter(Boolean);
                                  const hay = normalize(`${c.first_name || ''} ${c.last_name || ''} ${c.phone || ''}`);
                                  if (!tokens.every(t => hay.includes(t))) return false;
                                }
                                return true;
                              });
                              // Distinct cuerda values that actually appear in the
                              // visible set, plus their counts so the user can see
                              // at a glance how many contacts each cuerda holds
                              // under the current view.
                              const counts = new Map<string, number>();
                              visible.forEach(c => {
                                const k = c.numero_cuerda || '';
                                if (!k) return;
                                counts.set(k, (counts.get(k) || 0) + 1);
                              });
                              // Sort: numeric cuerdas ascending (101, 102, ..., 204),
                              // then anything non-numeric (e.g. 'MJA Central') after.
                              // Sorting purely lexically would put "104" between "1"
                              // and "2", which is wrong for the church's numbering
                              // convention (1xx masc, 2xx fem, 3xx etc).
                              const cuerdas = Array.from(counts.keys()).sort((a, b) => {
                                const an = Number(a), bn = Number(b);
                                const aIsNum = !Number.isNaN(an), bIsNum = !Number.isNaN(bn);
                                if (aIsNum && bIsNum) return an - bn;
                                if (aIsNum) return -1;
                                if (bIsNum) return 1;
                                return a.localeCompare(b);
                              });
                              return cuerdas.map(k => (
                                <DropdownMenuItem key={k} onClick={() => setFilterCuerda(k)} className={filterCuerda === k ? 'bg-accent' : ''}>
                                  <span className="flex-1">{k}</span>
                                  <span className="text-[10px] text-muted-foreground tabular-nums ml-2">{counts.get(k)}</span>
                                </DropdownMenuItem>
                              ));
                            })()}
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
                        action the dot used to do). */}
                    <ResizableHeader width={colWidths.dup} onResize={resizeCol('dup')}>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Dup</span>
                    </ResizableHeader>
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
                            // Build the responsable filter list. Two layers of protection
                            // for non-global users:
                            //   1. Only consider contacts from the user's own cuerda — so
                            //      we don't leak who the responsables in other cuerdas are.
                            //   2. ALSO require that each responsable themselves belongs to
                            //      the user's cuerda. Without this second check, a contact
                            //      in cuerda 104 whose responsable_id was reassigned to a
                            //      person in cuerda 105 (legacy data) would still leak that
                            //      person's name into the dropdown.
                            // Only admin/general/pastor/supervisor see everyone.
                            const userId = session?.user?.id;
                            // Build the visible set the same way the row pipeline
                            // does — but skip the Responsable filter itself so the
                            // dropdown doesn't collapse to just the selected name.
                            // This way picking a Cuerda or Conector narrows what
                            // responsables you can choose from to the ones who
                            // actually have contacts under the active criteria.
                            const visible = (allContacts || []).filter(c => {
                              if (!canSeeContactsFromAllCuerdas) {
                                if (userCuerdaNumero) {
                                  if (c.numero_cuerda !== userCuerdaNumero) return false;
                                } else if (c.responsable_id !== userId) {
                                  return false;
                                }
                              }
                              if (filterCuerda && c.numero_cuerda !== filterCuerda) return false;
                              if (filterConector === '__none__' && c.conector) return false;
                              if (filterConector && filterConector !== '__none__') {
                                if (!c.conector || normalize(c.conector) !== normalize(filterConector)) return false;
                              }
                              if (filterDuplicates && !duplicateNameIds.has(c.id)) return false;
                              if (searchTerm.trim()) {
                                // Tokenized search — see main filter for the rationale.
                                const tokens = normalize(searchTerm).split(/\s+/).filter(Boolean);
                                const hay = normalize(`${c.first_name || ''} ${c.last_name || ''} ${c.phone || ''}`);
                                if (!tokens.every(t => hay.includes(t))) return false;
                              }
                              return true;
                            });
                            const creatorIds = new Set<string>();
                            visible.forEach(c => { if (c.responsable_id) creatorIds.add(c.responsable_id); });
                            const teamMemberById = new Map((teamMembers || []).map(m => [m.id, m]));
                            const creators = Array.from(creatorIds)
                              .map(id => ({ id, profile: profileByIdExtended.get(id), teamMember: teamMemberById.get(id) }))
                              .filter(c => {
                                // The current user is excluded from this list
                                // because 'Mis contactos' at the top already
                                // covers them (with the right semantics for
                                // MJA members vs not). Including them here
                                // would just duplicate the entry.
                                if (!c.profile || c.id === userId) return false;
                                if (canSeeContactsFromAllCuerdas) return true;
                                if (!userCuerdaNumero) return false; // user has no cuerda — only Mis contactos applies
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
                            {(() => {
                              // Build the conector dropdown from contacts that
                              // already pass every OTHER active filter (Cuerda,
                              // Responsable, search, etc.) — but NOT the
                              // conector filter itself, otherwise the dropdown
                              // would collapse to just the selected value.
                              // This way picking a Responsable narrows what
                              // names you see here to the conectors who
                              // actually feed that responsable.
                              const baseSet = (allContacts || []).filter(c => {
                                if (!canSeeContactsFromAllCuerdas && userCuerdaNumero && c.numero_cuerda !== userCuerdaNumero) return false;
                                if (filterCuerda && c.numero_cuerda !== filterCuerda) return false;
                                if (filterResponsable === '__none__' && c.responsable_id) return false;
                                if (filterResponsable === '__church_cuerda__') {
                                  if (c.responsable_id) return false;
                                  if (!churchCuerda?.numero || c.numero_cuerda !== churchCuerda.numero) return false;
                                }
                                if (filterResponsable && filterResponsable !== '__none__' && filterResponsable !== '__church_cuerda__' && c.responsable_id !== filterResponsable) return false;
                                if (filterDuplicates && !duplicateNameIds.has(c.id)) return false;
                                if (searchTerm.trim()) {
                                  // Tokenized search — see main filter for the rationale.
                                  const tokens = normalize(searchTerm).split(/\s+/).filter(Boolean);
                                  const hay = normalize(`${c.first_name || ''} ${c.last_name || ''} ${c.phone || ''}`);
                                  if (!tokens.every(t => hay.includes(t))) return false;
                                }
                                return true;
                              });
                              // Group by normalized form so accent / case
                              // variants ("Camila Próspero" vs "Camila Prospero",
                              // "Agustina" vs "Agustína") don't show up as
                              // separate entries. For each group we pick one
                              // canonical representative by counting how often
                              // each raw spelling appears and taking the most
                              // common; the chosen one is what's displayed AND
                              // what gets passed to setFilterConector. The row
                              // filter itself is normalize-aware, so the choice
                              // of representative doesn't change which rows
                              // match — it only controls what label the user
                              // sees in the dropdown and the active-filter pill.
                              const groups = new Map<string, Map<string, number>>();
                              baseSet.forEach(c => {
                                const raw = c.conector?.trim();
                                if (!raw) return;
                                const key = normalize(raw);
                                if (!key) return;
                                const counts = groups.get(key) || new Map<string, number>();
                                counts.set(raw, (counts.get(raw) || 0) + 1);
                                groups.set(key, counts);
                              });
                              const representatives: string[] = [];
                              groups.forEach(counts => {
                                let best: string | null = null;
                                let bestCount = -1;
                                counts.forEach((count, raw) => {
                                  if (count > bestCount) { best = raw; bestCount = count; }
                                });
                                if (best) representatives.push(best);
                              });
                              return representatives
                                .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
                                .map(v => (
                                  <DropdownMenuItem key={v} onClick={() => setFilterConector(v)} className={normalize(filterConector) === normalize(v) ? 'bg-accent' : ''}>
                                    {v}
                                  </DropdownMenuItem>
                                ));
                            })()}
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
                    {isUnassignedView && <ResizableHeader width={colWidths.sugerencia} onResize={resizeCol('sugerencia')}>Sugerencia</ResizableHeader>}
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
                    const hasAddress = !!(c.address || c.barrio);
                    // A contact is "external" when the nearest suggested cell belongs to a
                    // different cuerda than the contact's own cuerda. If the contact has no
                    // cuerda assigned, fall back to comparing zonas.
                    const isExternal = sugCuerda
                      ? (c.numero_cuerda ? sugCuerda.numero !== c.numero_cuerda : (sugZona && homeZonaId ? sugZona.id !== homeZonaId : false))
                      : false;
                    const responsable = teamMembers?.find(m => m.id === c.responsable_id);

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
                            the pill opens the merge dialog. */}
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

                        {/* Teléfono + WhatsApp - on mobile we hide the number text and keep just the WhatsApp button to save horizontal space.
                            Invalid AR phones (truncated / missing digits) render in red on both the text and the WhatsApp icon.
                            Missing phones show the same red button (non-clickable) instead of a dash, so the gap is visually obvious. */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.telefono }}>
                          {c.phone ? (() => {
                            const phoneOk = isValidArgentinePhone(c.phone);
                            return (
                              <div className="flex items-center gap-1 justify-end">
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
                            <div className="flex items-center gap-1 justify-end">
                              {canSendWhatsapp() && (
                                <span
                                  className="flex items-center gap-0.5 shrink-0 text-red-500 cursor-not-allowed"
                                  title="Sin teléfono cargado"
                                >
                                  <span className="text-[10px] font-medium">Enviar</span>
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

                        {/* Dirección + Ver en mapa */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.direccion }}>
                          {c.address ? (() => {
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

                        {/* Sugerencia / Célula asignada */}
                        {isUnassignedView && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.sugerencia }}>
                            {c.cell_id ? (() => {
                              // Already assigned to a cell — show the assignment
                              const assignedCell = cells?.find(cl => cl.id === c.cell_id);
                              const assignedCuerda = assignedCell?.cuerda_id ? cuerdas?.find(cr => cr.id === assignedCell.cuerda_id) : null;
                              return assignedCell ? (
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <Badge className="text-[9px] shrink-0 bg-blue-500/15 text-blue-400 hover:bg-blue-500/15">{assignedCell.name}</Badge>
                                  {assignedCuerda && <span className="text-[9px] text-blue-400/70">Cda {assignedCuerda.numero}</span>}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">Asignado</span>;
                            })() : sugCell ? (() => {
                              const hasDist = c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng) && sugCell.lat != null && sugCell.lng != null;
                              const dist = hasDist ? haversine(c.lat!, c.lng!, sugCell.lat!, sugCell.lng!) : null;
                              const badgeClass = dist != null ? getDistanceBadgeClass(dist) : (isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15');
                              const textColor = dist != null ? getDistanceColor(dist) : (isExternal ? 'text-orange-400' : 'text-green-500');
                              return (
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <Badge className={`text-[9px] shrink-0 ${badgeClass}`}>{sugCell.name}</Badge>
                                  {sugZona && <span className={`text-[9px] truncate ${textColor}`}>{sugZona.nombre}{isExternal ? ' ↗' : ''}</span>}
                                  {dist != null && <span className={`text-[9px] font-medium shrink-0 ${textColor}`}>{dist.toFixed(1)}km</span>}
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
                                const stagedCell = cells?.find(cl => cl.id === stagedCellId);
                                const stagedCuerda = stagedCell ? cuerdas?.find(cu => cu.id === stagedCell.cuerda_id) : null;
                                const stagedZona = stagedCuerda ? zonas?.find(z => z.id === stagedCuerda.zona_id) : null;
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
                              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 border-orange-500/50 text-orange-400" onClick={async () => {
                                await supabase.from('contacts').update({ pending_external_send: true }).eq('id', c.id);
                                showSuccess('Movido a tu outbox "Enviar a MJA". Confirmá el despacho cuando estés seguro.');
                                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                              }}>
                                <ExternalLink className="h-3 w-3 mr-1" /> Enviar a MJA
                              </Button>
                            ) : !hasAddress ? (
                              null
                            ) : (
                              // MJA member on a normal inbox row. Both
                              // is_external (came from a referente dispatch)
                              // and non-external rows show the same single
                              // button: Pre-Asignar. There used to be a
                              // separate 'Devolver' button on is_external
                              // rows that cleared is_external=false, but Dan
                              // pointed out it's confusing — once a contact
                              // is in MJA Central's inbox, the MJA member's
                              // job is to assign it. There's no meaningful
                              // 'devolver' destination since MJA Central is
                              // the receiving end of the flow. The Cancelar
                              // action belongs in the 'Asignar Contactos'
                              // outbox tab (where it undoes a pre-assignment
                              // by clearing pending_assignment_cell_id).
                              <div className="flex items-center gap-1">
                                {sugCell && (
                                  <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={() => setConfirmDialog({
                                    type: 'pre_assign', contactId: c.id, cellId: sugCell.id, cellName: sugCell.name,
                                    cuerdaNum: sugCuerda?.numero, zonaName: sugZona?.nombre,
                                  })}>
                                    <Zap className="h-3 w-3 mr-1" /> Pre-Asignar
                                  </Button>
                                )}
                              </div>
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

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{
              confirmDialog?.type === 'auto' ? 'Autoasignar contactos'
              : confirmDialog?.type === 'auto_selected' ? `Autoasignar ${visibleSelectedCount} seleccionados`
              : confirmDialog?.type === 'pre_assign' ? 'Pre-asignar contacto'
              : 'Confirmar asignación'
            }</DialogTitle>
            <DialogDescription asChild>
              <div>
                {confirmDialog?.type === 'auto' ? (
                  <>
                    <p>Se asignarán los contactos a la célula más cercana según su dirección.</p>
                    {confirmDialog.preview && confirmDialog.preview.length > 0 && (
                      <div className="mt-3 space-y-1 border rounded-md p-3 bg-muted/50">
                        <p className="text-xs font-medium text-foreground mb-2">Vista previa:</p>
                        {confirmDialog.preview.map(p => (
                          <div key={p.label} className="flex justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                            <span>{p.label}</span>
                            <span className="font-mono font-medium tabular-nums">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : confirmDialog?.type === 'auto_selected' ? (
                  <p>Se asignarán los <strong>{visibleSelectedCount}</strong> contactos seleccionados a la célula más cercana según su dirección. Solo se asignarán los que tengan dirección y no estén ya asignados a una célula.</p>
                ) : confirmDialog?.type === 'pre_assign' ? (
                  <>
                    <p>
                      ¿Pre-asignar a <strong>{confirmDialog?.cellName}</strong>
                      {confirmDialog?.cuerdaNum && <> (Cuerda {confirmDialog.cuerdaNum})</>}
                      {confirmDialog?.zonaName && <> — {confirmDialog.zonaName}</>}?
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Va a quedar pendiente en tu outbox <strong>"Asignar Contactos"</strong> hasta que confirmes la asignación final.
                    </p>
                  </>
                ) : (
                  <p>
                    ¿Asignar a <strong>{confirmDialog?.cellName}</strong>
                    {confirmDialog?.cuerdaNum && <> (Cuerda {confirmDialog.cuerdaNum})</>}
                    {confirmDialog?.zonaName && <> — {confirmDialog.zonaName}</>}?
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmDialog(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (confirmDialog?.type === 'auto') autoAssignMutation.mutate();
                else if (confirmDialog?.type === 'auto_selected') {
                  // Auto-assign only selected contacts that don't have a cell yet
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
                }
                else if (confirmDialog?.type === 'cuerda_only' && confirmDialog?.contactId && confirmDialog?.cuerdaNum) {
                  // Assign to cuerda only (no cell)
                  const zona = zonas?.find(z => z.id === confirmDialog.cuerdaZonaId);
                  const { error } = await supabase.from('contacts').update({
                    numero_cuerda: confirmDialog.cuerdaNum,
                    zona_id: zona?.id || null,
                    zona: zona?.nombre || null,
                    cell_id: null,
                  }).eq('id', confirmDialog.contactId);
                  if (error) showError(error.message);
                  else {
                    const contact = allContacts?.find(ct => ct.id === confirmDialog.contactId);
                    // Log to activity_logs for Historial
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
                }
                else if (confirmDialog?.type === 'pre_assign' && confirmDialog?.contactId && confirmDialog?.cellId) {
                  // Stage the assignment in pending_assignment_cell_id
                  // without touching cell_id. Contact moves to the
                  // 'Asignar Contactos' outbox tab. Member confirms or
                  // cancels from there.
                  const { error } = await supabase.from('contacts').update({
                    pending_assignment_cell_id: confirmDialog.cellId,
                  }).eq('id', confirmDialog.contactId);
                  if (error) showError(error.message);
                  else {
                    showSuccess('Pre-asignado. Lo encontrás en "Asignar Contactos" para confirmar.');
                    queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                  }
                  setConfirmDialog(null);
                }
                else if (confirmDialog?.contactId && confirmDialog?.cellId) assignSingleMutation.mutate({ contactId: confirmDialog.contactId, cellId: confirmDialog.cellId });
              }}
              disabled={autoAssignMutation.isPending || assignSingleMutation.isPending}
            >
              {(autoAssignMutation.isPending || assignSingleMutation.isPending) ? 'Asignando...'
                : confirmDialog?.type === 'pre_assign' ? 'Pre-asignar'
                : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="sm:max-w-[1200px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Contactos desde CSV o Excel</DialogTitle>
            <DialogDescription>
              Los contactos importados aparecerán en el pool "Sin asignar" para que puedas verificar sus direcciones y asignarles una célula.
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Contact Profile Dialog */}
      <ContactProfileDialog
        open={!!selectedContactId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedContactId(null);
            queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
          }
        }}
        contactId={selectedContactId || ''}
        churchId={churchId!}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { if (!o && !deleting) setBulkDeleteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar contactos</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar <strong>{selectedIds.size}</strong> contacto{selectedIds.size === 1 ? '' : 's'}? Los vas a poder restaurar desde la Papelera.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                const ids = Array.from(selectedIds);
                const nowIso = new Date().toISOString();
                const userId = session?.user?.id || null;
                // Bulk-delete in chunks. Sending 1138 ids as a single
                // PostgREST .in() call builds a query string of ~42KB
                // (each UUID is 36 chars), and the server rejects it
                // with a 400 Bad Request. Chunk size 200 keeps each URL
                // around 7-8KB, which is well inside any sane limit.
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
                  // Still refetch — partial deletes did succeed.
                  queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                  return;
                }
                showSuccess(`${ids.length} contacto${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}.`);
                setSelectedIds(new Set());
                setBulkDeleteOpen(false);
                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={(o) => {
          setAddContactOpen(o);
          if (!o) queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
        }}
        churchId={churchId!}
      />

      {/* Duplicate merge dialog — opened by clicking the amber dot on a row.
          On resolve (merge or dismiss) we invalidate both the contacts pool
          and the dismissals query so the table updates and the dot recomputes
          correctly without a manual refresh. */}
      <DuplicateMergeDialog
        open={!!mergeGroup}
        onOpenChange={(o) => { if (!o) setMergeGroup(null); }}
        group={(mergeGroup || []) as any}
        userId={session?.user?.id || null}
        onResolved={() => {
          queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          queryClient.invalidateQueries({ queryKey: ['dedupe-dismissals', churchId] });
          setSelectedIds(new Set()); // mergees might be in selection — drop ghosts
        }}
      />

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
        onSent={async (message, templateName) => {
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

      {/* Bulk WhatsApp dialog - up to 5 contacts at once */}
      <BulkWhatsAppDialog
        open={bulkWhatsAppOpen}
        onOpenChange={setBulkWhatsAppOpen}
        contacts={(allContacts || []).filter(c => selectedIds.has(c.id)).map(c => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
        }))}
        churchId={churchId}
        onSent={async (sentContactIds, message, templateName) => {
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

      {/* Bulk-assign Responsable dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={(o) => { if (!o && !bulkAssigning) setBulkAssignOpen(false); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Asignar Responsable</DialogTitle>
            <DialogDescription>
              Vas a asignar un responsable a <strong>{visibleSelectedCount}</strong> contacto{visibleSelectedCount === 1 ? '' : 's'}.
              Esto va a sobreescribir el responsable actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nuevo responsable</label>
            <select
              className="w-full h-9 text-sm border rounded px-2 bg-background"
              value={bulkAssignTargetId}
              onChange={(e) => setBulkAssignTargetId(e.target.value)}
              disabled={bulkAssigning}
            >
              <option value="">Seleccionar responsable...</option>
              <option value="__none__">— Sin responsable (limpiar)</option>
              {(teamMembers || [])
                .filter(m => {
                  if (!m.id) return false;
                  // Non-global users can only assign to people in their own cuerda.
                  // This prevents a referente of cuerda 202 from assigning a contact
                  // to a referente of cuerda 101.
                  if (!canSeeContactsFromAllCuerdas) {
                    if (!userCuerdaNumero) return false;
                    return m.numero_cuerda === userCuerdaNumero;
                  }
                  return true;
                })
                .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
                .map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
            </select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBulkAssignOpen(false)} disabled={bulkAssigning}>Cancelar</Button>
            <Button
              disabled={bulkAssigning || !bulkAssignTargetId}
              onClick={async () => {
                if (!bulkAssignTargetId) return;
                setBulkAssigning(true);
                // Only act on the contacts that are actually visible in the
                // current filtered view, matching the visibleSelectedCount UI.
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
            >
              {bulkAssigning ? 'Asignando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SemilleroPage;
