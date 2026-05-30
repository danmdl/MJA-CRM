"use client";
import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { normalize } from '@/lib/normalize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { buildGeocodeAddress } from '@/lib/geocode-address';
import { geoJsonToGooglePaths, isPointInTerritory } from '@/lib/territory-utils';
import { loadGoogleMaps } from '@/lib/google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { ChevronLeft, MapPin, Route as RouteIcon, Search, X, List, Map as MapIcon, Navigation, Lasso } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  numero_cuerda: string | null;
  responsable_id: string | null;
  fecha_contacto: string | null;
  sexo: string | null;
  created_at: string | null;
}

/**
 * Filtro de rango de fechas como pill: muestra el rango actual en
 * forma compacta y abre un popover con Desde/Hasta al hacer click.
 * Antes la toolbar tenía 4 inputs `dd/mm/yyyy` siempre abiertos —
 * dos por filtro — y comía media pantalla a lo ancho.
 */
const fmtDate = (s: string) => {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

interface DateRangeChipProps {
  label: string;
  hint?: string;
  from: string;
  to: string;
  setFrom: (s: string) => void;
  setTo: (s: string) => void;
}

const DateRangeChip = ({ label, hint, from, to, setFrom, setTo }: DateRangeChipProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const active = !!(from || to);
  const summary = !active
    ? 'cualquiera'
    : from && to
      ? `${fmtDate(from)} – ${fmtDate(to)}`
      : from
        ? `desde ${fmtDate(from)}`
        : `hasta ${fmtDate(to)}`;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={hint}
        className={`h-8 text-xs rounded-full px-3 inline-flex items-center gap-1.5 transition-colors ${active ? 'border-2 border-primary text-primary font-medium' : 'border text-muted-foreground hover:bg-muted'}`}
      >
        <span className="uppercase tracking-wider text-[10px] font-semibold">{label}</span>
        <span className="opacity-70">·</span>
        <span>{summary}</span>
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 flex flex-col gap-2 min-w-[200px]">
          <div className="text-xs font-semibold border-b pb-1.5 mb-0.5">{label}</div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="h-8 text-xs border rounded px-2 bg-background"
          />
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="h-8 text-xs border rounded px-2 bg-background"
          />
          {active && (
            <button
              type="button"
              onClick={() => { setFrom(''); setTo(''); }}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1 self-start"
            >
              <X className="h-3 w-3" /> Limpiar fechas
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const MapPickerPage = () => {
  const { churchId: churchSlug, projectId } = useParams<{ churchId: string; projectId: string }>();
  const churchId = useChurchUuid();
  // Bias address autocomplete toward the church area.
  const { data: churchCoords } = useChurchCoords(churchId);
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersById = useRef<Map<string, any>>(new Map());
  // Single clusterer reused across renders. We rebuild the marker
  // membership in the same diff loop that updates markersById — no
  // teardown needed unless the map itself unmounts.
  const clustererRef = useRef<MarkerClusterer | null>(null);
  // Separate marker for the starting point, kept in its own ref so the
  // contact-marker effect can rebuild without ever touching it. Updated
  // by a dedicated effect that fires when startLat / startLng change.
  const startMarkerRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const projectHydratedRef = useRef(false);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterResponsableId, setFilterResponsableId] = useState<string>('');
  const [filterCuerda, setFilterCuerda] = useState<string>('');
  // Rango sobre fecha_contacto (la fecha de la conexión).
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  // Rango sobre created_at (cuándo se cargó el contacto al sistema).
  const [filterCreatedFrom, setFilterCreatedFrom] = useState<string>('');
  const [filterCreatedTo, setFilterCreatedTo] = useState<string>('');
  const [filterSexo, setFilterSexo] = useState<string>('');
  const [onlyWithNumber, setOnlyWithNumber] = useState(true);
  // 'Solo en zona' toggle: hides contacts whose lat/lng falls outside
  // the relevant cuerda's drawn territorio. Refers to filterCuerda when
  // a global picked one, otherwise the user's own cuerda. If there's no
  // territory drawn, the toggle is disabled and shows a hint.
  const [onlyInZone, setOnlyInZone] = useState(false);
  // Lasso state: while drawing, every click pushes a vertex; double-click
  // closes the polygon and selects every visible contact inside.
  const [drawingMode, setDrawingMode] = useState(false);
  const drawingManagerRef = useRef<any>(null);
  // 'Solo seleccionados' toggle: when on, the sidebar list only shows
  // contacts the user has already picked (via the map markers or the
  // list checkboxes). Useful while building a route — instead of
  // scrolling 1000+ contacts to verify what's in the route, you collapse
  // the view to just the route members. Map markers are unaffected; this
  // is purely a sidebar filter.
  const [onlySelected, setOnlySelected] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('map');
  const [saving, setSaving] = useState(false);
  // Starting point — required before we can finalize the route
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);

  // Load project (so we can save to it later + show its name)
  const { data: project } = useQuery<any>({
    queryKey: ['route-project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase.from('shared_routes').select('*').eq('id', projectId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // Hydrate any pre-existing selection from the project so a user can come
  // back to the map picker and keep iterating on what they had picked.
  useEffect(() => {
    if (!project || projectHydratedRef.current) return;
    projectHydratedRef.current = true;
    if (project.ordered_contact_ids?.length) {
      setSelectedIds(new Set(project.ordered_contact_ids));
    }
    if (project.start_address) setStartAddress(project.start_address);
    if (project.start_lat) setStartLat(Number(project.start_lat));
    if (project.start_lng) setStartLng(Number(project.start_lng));
  }, [project]);

  // Church (for "use church address" button)
  const { data: church } = useQuery<{ id: string; name: string; address: string | null }>({
    queryKey: ['church', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('id, name, address').eq('id', churchId!).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Fetch contacts with valid coordinates, applying strict cuerda visibility
  // (matches Semillero / RouteEditor rule).
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['mappicker-contacts', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      // Same pagination strategy as SemilleroPage's allContacts query
      // (see d039767 for the full story): Supabase silently caps each
      // response at 1000 rows, .limit(N) can only narrow that, and an
      // ORDER BY that has many tied values across pages is unstable. So
      // we paginate explicitly with .range(start, end), order by id (a
      // globally unique tiebreaker), and stop when a partial page comes
      // back. The visibility filter (cuerda for non-globals) is applied
      // on every page so the security cut still holds.
      const PAGE_SIZE = 1000;
      const all: Contact[] = [];
      for (let page = 0; ; page++) {
        let q = supabase.from('contacts')
          .select('id, first_name, last_name, address, lat, lng, numero_cuerda, responsable_id, fecha_contacto, sexo, created_at')
          .eq('church_id', churchId!)
          .is('deleted_at', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
          // Non-globals only see their cuerda's contacts. If the user has
          // no cuerda assigned, fall back to "the contacts I'm responsable
          // for" so they're not stuck with an empty map. This mirrors the
          // visibility gate in SemilleroPage.
          if (profile.numero_cuerda) {
            q = q.eq('numero_cuerda', profile.numero_cuerda);
          } else {
            q = q.eq('responsable_id', profile.id);
          }
        }
        const { data, error } = await q;
        if (error) {
          console.error('[mappicker-contacts] page', page, 'error', error);
          break;
        }
        const rows = (data || []) as Contact[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        // Safety stop — 50k rows past which we assume something is wrong
        // and don't keep spinning.
        if (page >= 49) break;
      }
      return all;
    },
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  // Lightweight count query: how many contacts exist in the user's
  // scope total (with AND without coordinates), so we can render
  // an honest counter like '623 con dirección · 557 sin dirección'.
  // The main contacts query above filters to lat/lng IS NOT NULL —
  // necessary because we paint pins on a map — but the user needs
  // to know that the cuerda has more contacts that just aren't
  // mappable yet. Per Dan: 'Micaela tiene muchos más que 691, tal
  // vez no todos tienen dirección.'
  //
  // Two HEAD requests with .count('exact') so we don't pay for row
  // payloads we won't use. Same scope rules as the main query.
  const { data: scopeCounts } = useQuery<{ withCoords: number; withoutCoords: number }>({
    queryKey: ['mappicker-counts', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      const applyScope = (q: any) => {
        if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
          if (profile.numero_cuerda) return q.eq('numero_cuerda', profile.numero_cuerda);
          return q.eq('responsable_id', profile.id);
        }
        return q;
      };
      const baseFilter = (q: any) => q
        .eq('church_id', churchId!)
        .is('deleted_at', null);
      const [withQ, withoutQ] = await Promise.all([
        applyScope(baseFilter(supabase.from('contacts').select('id', { count: 'exact', head: true })))
          .not('lat', 'is', null)
          .not('lng', 'is', null),
        applyScope(baseFilter(supabase.from('contacts').select('id', { count: 'exact', head: true })))
          .or('lat.is.null,lng.is.null'),
      ]);
      return {
        withCoords: withQ.count || 0,
        withoutCoords: withoutQ.count || 0,
      };
    },
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  // Cuerdas with their drawn territories for this church. Used by the
  // 'Solo en zona' filter and the green/red coloring of map pins. We
  // read the GeoJSON-projecting view so the polygon comes back as a
  // string we can parse with geoJsonToGooglePaths (the plain `cuerdas`
  // table can't be SELECTed with the geography column over supabase-js
  // without a manual ST_AsGeoJSON cast).
  const { data: cuerdasWithTerritory } = useQuery<{ id: string; numero: string; territory_geojson: string | null }[]>({
    queryKey: ['mappicker-cuerda-territories', churchId],
    queryFn: async () => {
      const { data: zonas } = await supabase.from('zonas').select('id').eq('church_id', churchId!);
      if (!zonas?.length) return [];
      const { data, error } = await supabase
        .from('cuerdas_with_geojson')
        .select('id, numero, territory_geojson')
        .in('zona_id', zonas.map((z: any) => z.id));
      if (error) {
        console.error('[mappicker-cuerda-territories]', error);
        return [];
      }
      return (data as any) || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Which cuerda's territory does the 'Solo en zona' toggle refer to?
  // - When the user has picked a cuerda filter, use that — they're
  //   actively scoping to one cuerda, the polygon they care about is
  //   the one drawn for that cuerda.
  // - Otherwise fall back to the user's own cuerda (referente
  //   default). Globals without a filter get nothing — they should
  //   pick a cuerda first.
  const activeCuerdaNumero = filterCuerda || profile?.numero_cuerda || '';
  const activeTerritoryPaths = useMemo(() => {
    if (!activeCuerdaNumero || !cuerdasWithTerritory) return null;
    const row = cuerdasWithTerritory.find(c => c.numero === activeCuerdaNumero);
    if (!row?.territory_geojson) return null;
    return geoJsonToGooglePaths(row.territory_geojson);
  }, [cuerdasWithTerritory, activeCuerdaNumero]);

  // Defensive: if 'Solo en zona' is on but the active cuerda doesn't
  // have a polygon (e.g. user cleared the filter, swapped cuerdas),
  // disable the toggle automatically so the user isn't staring at an
  // empty map wondering why nothing renders.
  useEffect(() => {
    if (onlyInZone && !activeTerritoryPaths) setOnlyInZone(false);
  }, [onlyInZone, activeTerritoryPaths]);

  // Team members for Responsable filter — restricted to user's cuerda for non-globals.
  const { data: teamMembers = [] } = useQuery<{ id: string; first_name: string | null; last_name: string | null; numero_cuerda: string | null }[]>({
    queryKey: ['mappicker-team', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, first_name, last_name, numero_cuerda')
        .eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Load Google Maps via the shared loader so we always get places +
  // drawing + geometry. The legacy inline script tag here only requested
  // 'places', which broke the lasso (drawing) and in-zone classification
  // (geometry) when this page loaded before any component using the
  // shared loader had a chance to.
  useEffect(() => {
    loadGoogleMaps().catch(err => console.error('[MapPicker] Google Maps load failed', err));
  }, []);

  // Apply filters. Two memos: one for the MAP (map markers respect every
  // filter EXCEPT onlySelected — picking 'Solo seleccionados' shouldn't
  // remove markers from the map, only condense the sidebar list), and
  // one for the SIDEBAR LIST (which additionally applies onlySelected).
  // Whether this user is a 'global' (admin / general / pastor /
  // supervisor) — globals can see every contact in the church, which
  // for MJA Central means 1500+ pins. Painting all of them on initial
  // load is slow, and the user almost always wants to focus on a
  // specific cuerda anyway. So for globals we require an explicit
  // narrowing filter (cuerda, responsable, search, date range, etc.)
  // before populating the map. Non-globals are already cuerda-scoped
  // by the backend query so this gate doesn't apply to them.
  const isGlobalRole = !!profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
  const hasAnyNarrowingFilter = !!(
    search.trim() ||
    filterResponsableId ||
    filterCuerda ||
    filterDateFrom ||
    filterDateTo ||
    filterCreatedFrom ||
    filterCreatedTo ||
    filterSexo
  );
  const requireFilterBeforePainting = isGlobalRole && !hasAnyNarrowingFilter;

  const filteredForMap = useMemo(() => {
    // Empty result for globals who haven't picked a filter yet —
    // surfaces the "Elegí una cuerda" empty state, keeps the map
    // marker count at zero so Google Maps doesn't render thousands of
    // pins on first load.
    if (requireFilterBeforePainting) return [];
    // normalize() strips accents and lowercases so "maría", "María"
    // and "maria" all match the same set. The earlier toLowerCase()
    // kept the accent on the haystack, which is why Dan was seeing
    // different result orders for the same query with/without the
    // tilde.
    const term = normalize(search);
    return (contacts || []).filter(c => {
      if (onlyWithNumber && !/\d/.test(c.address || '')) return false;
      if (filterResponsableId === '__none__') {
        if (c.responsable_id) return false;
      } else if (filterResponsableId && c.responsable_id !== filterResponsableId) return false;
      if (filterCuerda && c.numero_cuerda !== filterCuerda) return false;
      if (filterDateFrom && (!c.fecha_contacto || c.fecha_contacto < filterDateFrom)) return false;
      if (filterDateTo && (!c.fecha_contacto || c.fecha_contacto > filterDateTo)) return false;
      // created_at is an ISO timestamp; slice to the date prefix so the
      // 'to' bound includes the whole day instead of cutting off at midnight.
      const created = c.created_at ? c.created_at.slice(0, 10) : '';
      if (filterCreatedFrom && (!created || created < filterCreatedFrom)) return false;
      if (filterCreatedTo && (!created || created > filterCreatedTo)) return false;
      if (filterSexo && c.sexo !== filterSexo) return false;
      // In-zone filter: drop pins whose coords fall outside the active
      // cuerda's drawn polygon. Selection state is preserved — only the
      // visible set narrows.
      if (onlyInZone && activeTerritoryPaths) {
        if (!isPointInTerritory(c.lat, c.lng, activeTerritoryPaths)) return false;
      }
      if (term) {
        // Name-only match. Address was included before, but a street
        // called "Maria Asunta" pushed unrelated contacts to the top of
        // the list when Dan searched "maria" — confusing because the
        // first hit wasn't a Maria at all. If the user wants to filter
        // by address there's a different toolbar for that.
        const name = normalize(`${c.first_name} ${c.last_name || ''}`);
        if (!name.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithNumber, filterResponsableId, filterCuerda, filterDateFrom, filterDateTo, filterCreatedFrom, filterCreatedTo, filterSexo, requireFilterBeforePainting, onlyInZone, activeTerritoryPaths]);

  // Sidebar list = map filtered set, optionally narrowed to selected.
  const filtered = useMemo(() => {
    if (!onlySelected) return filteredForMap;
    return filteredForMap.filter(c => selectedIds.has(c.id));
  }, [filteredForMap, onlySelected, selectedIds]);

  // Distinct cuerdas present in the church's data, for the cuerda
  // filter dropdown. Sorted numerically when both values parse as
  // numbers (101, 102, ..., 204) — same convention as everywhere else.
  const availableCuerdas = useMemo(() => {
    const set = new Set<string>();
    (contacts || []).forEach(c => { if (c.numero_cuerda) set.add(c.numero_cuerda); });
    return Array.from(set).sort((a, b) => {
      const an = Number(a), bn = Number(b);
      const aIsNum = !Number.isNaN(an), bIsNum = !Number.isNaN(bn);
      if (aIsNum && bIsNum) return an - bn;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.localeCompare(b);
    });
  }, [contacts]);

  // Pre-fill filterCuerda with the user's own cuerda the first time the
  // contact data lands. Same UX pattern as MapaPage: a user who works
  // in cuerda 204 doesn't want to scroll past 800 contacts from other
  // cuerdas before finding the ones they actually plan visits for.
  // Globals and users without a cuerda get no default — they're meant
  // to scope manually. Runs once via the ref guard so the user can
  // clear the filter if they actually want all cuerdas.
  const cuerdaDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (cuerdaDefaultAppliedRef.current) return;
    if (!profile) return;
    if (availableCuerdas.length === 0) return;
    cuerdaDefaultAppliedRef.current = true;
    const isGlobal = profile.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
    const userCuerda = profile.numero_cuerda;
    if (!isGlobal && userCuerda && availableCuerdas.includes(userCuerda)) {
      setFilterCuerda(userCuerda);
    }
  }, [profile, availableCuerdas]);

  // Quick filter presets — set fecha_contacto >= N days ago
  const setLastNDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    setFilterDateFrom(d.toISOString().slice(0, 10));
    setFilterDateTo('');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterResponsableId('');
    setFilterCuerda('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterCreatedFrom('');
    setFilterCreatedTo('');
    setFilterSexo('');
  };

  const hasActiveFilters = !!(search || filterResponsableId || filterCuerda || filterDateFrom || filterDateTo || filterCreatedFrom || filterCreatedTo || filterSexo);

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Initialize the map once it has filtered data + the script is loaded.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const google = (window as any).google;
    if (!google?.maps) {
      // Retry until Google Maps loads
      const id = setInterval(() => {
        if ((window as any).google?.maps && mapRef.current && !mapInstance.current) {
          clearInterval(id);
          // Trigger this effect again by setting a no-op — simplest is just call init inline
          initMap();
        }
      }, 200);
      return () => clearInterval(id);
    }
    initMap();
    function initMap() {
      const g = (window as any).google;
      mapInstance.current = new g.maps.Map(mapRef.current, {
        // Default to Buenos Aires; will fit bounds when data loads.
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
      });
    }
  }, []);

  // Keep Google Maps in sync with the container's actual size. Same fix
  // as RouteEditorPage: dialogs and layout changes around the map can
  // leave Google's cached dimensions stale and the canvas paints black
  // until something forces a resize. ResizeObserver catches every size
  // change and fires the resize event so the tiles redraw correctly.
  // Cheap defensive guard — even if no current flow triggers the bug
  // here, anything that grows the toolbar or shows a dialog over the
  // picker would, and this prevents it.
  useEffect(() => {
    if (!mapRef.current) return;
    const el = mapRef.current;
    const ro = new ResizeObserver(() => {
      const google = (window as any).google;
      if (google?.maps && mapInstance.current) {
        google.maps.event.trigger(mapInstance.current, 'resize');
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-render markers whenever the map-filtered list or selection
  // changes. Uses filteredForMap (NOT the sidebar `filtered` list,
  // which may be narrowed by 'Solo seleccionados') — turning that
  // sidebar toggle on shouldn't make markers vanish from the map.
  useEffect(() => {
    const google = (window as any).google;
    if (!google?.maps || !mapInstance.current) return;

    const visibleIds = new Set(filteredForMap.map(c => c.id));

    // Remove markers no longer visible
    markersById.current.forEach((m, id) => {
      if (!visibleIds.has(id)) {
        m.setMap(null);
        markersById.current.delete(id);
      }
    });

    // Add or update markers
    filteredForMap.forEach(c => {
      if (c.lat == null || c.lng == null) return;
      const isSelected = selectedIds.has(c.id);
      const existing = markersById.current.get(c.id);
      // Color rule mirrors TerritoriosPage: green if inside the active
      // cuerda's polygon, red if outside, gold if no territory drawn yet.
      // Selected always wins (bright green at a larger scale) so the
      // route picks stand out from the territory backdrop.
      let fillColor = '#FFC233'; // no territory → neutral gold
      if (activeTerritoryPaths) {
        fillColor = isPointInTerritory(c.lat, c.lng, activeTerritoryPaths) ? '#22c55e' : '#ef4444';
      }
      if (isSelected) fillColor = '#10b981';
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 11 : 8,
        fillColor,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      };
      if (existing) {
        existing.setIcon(icon);
        existing.setTitle(`${c.first_name} ${c.last_name || ''}${isSelected ? ' (seleccionado)' : ''}`);
      } else {
        // No `map:` here — the MarkerClusterer below owns attachment.
        const marker = new google.maps.Marker({
          position: { lat: c.lat, lng: c.lng },
          icon,
          title: `${c.first_name} ${c.last_name || ''}`,
        });
        marker.addListener('click', () => {
          toggleContact(c.id);
        });
        markersById.current.set(c.id, marker);
      }
    });

    // Replace cluster membership with the current visible-marker set.
    // setMarkers + clearMarkers is the API contract; resetting both
    // sides keeps cluster counts honest after every diff cycle.
    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map: mapInstance.current, markers: [] });
    }
    clustererRef.current.clearMarkers();
    clustererRef.current.addMarkers(Array.from(markersById.current.values()));

    // Fit bounds the first time we have markers
    if (!fittedRef.current && filteredForMap.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filteredForMap.forEach(c => {
        if (c.lat != null && c.lng != null) bounds.extend({ lat: c.lat, lng: c.lng });
      });
      mapInstance.current.fitBounds(bounds, 60);
      fittedRef.current = true;
    }
  }, [filteredForMap, selectedIds, activeTerritoryPaths]);

  // Paint the active cuerda's polygon as a translucent overlay so the
  // user sees what defines "en zona". The polygon is recreated whenever
  // the active cuerda changes (which happens when the user switches the
  // cuerda filter or when their own cuerda's geometry loads in for the
  // first time). Stored in a ref so the next pass can clear the previous
  // one before drawing a new one — otherwise polygons accumulate.
  const territoryOverlayRef = useRef<any>(null);
  useEffect(() => {
    const google = (window as any).google;
    if (!google?.maps || !mapInstance.current) return;
    if (territoryOverlayRef.current) {
      territoryOverlayRef.current.setMap(null);
      territoryOverlayRef.current = null;
    }
    if (!activeTerritoryPaths) return;
    territoryOverlayRef.current = new google.maps.Polygon({
      paths: activeTerritoryPaths,
      strokeColor: '#FFC233',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: '#FFC233',
      fillOpacity: 0.08,
      clickable: false, // don't intercept marker clicks
      map: mapInstance.current,
    });
  }, [activeTerritoryPaths]);

  // Lasso: a drawing-manager polygon that, on completion, adds every
  // visible contact whose pin falls inside it to the selection. The
  // polygon itself is discarded right after — it's a one-shot selection
  // tool, not a saved overlay. Tied to `drawingMode` so the user can
  // toggle in/out of the mode from the toolbar.
  useEffect(() => {
    const google = (window as any).google;
    if (!google?.maps?.drawing || !mapInstance.current) return;
    if (!drawingMode) {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current.setDrawingMode(null);
        drawingManagerRef.current = null;
      }
      return;
    }
    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: false, // we provide our own toolbar button
      polygonOptions: {
        strokeColor: '#10b981',
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.15,
        editable: false,
        clickable: false,
      },
    });
    dm.setMap(mapInstance.current);
    drawingManagerRef.current = dm;
    const listener = google.maps.event.addListener(dm, 'polygoncomplete', (polygon: any) => {
      // Collect every visible contact whose pin lies inside the polygon.
      // We use the map-filtered list (not the sidebar list, which may be
      // narrowed by 'Solo seleccionados'), so the lasso picks from what
      // the user actually sees.
      const additions = new Set<string>();
      filteredForMap.forEach(c => {
        if (c.lat == null || c.lng == null) return;
        const pt = new google.maps.LatLng(c.lat, c.lng);
        if (google.maps.geometry.poly.containsLocation(pt, polygon)) {
          additions.add(c.id);
        }
      });
      setSelectedIds(prev => {
        const next = new Set(prev);
        additions.forEach(id => next.add(id));
        return next;
      });
      polygon.setMap(null); // one-shot — don't keep the lasso visible
      setDrawingMode(false);
      if (additions.size === 0) {
        showError('No había contactos visibles dentro del área dibujada.');
      } else {
        showSuccess(`+${additions.size} contacto${additions.size === 1 ? '' : 's'} agregado${additions.size === 1 ? '' : 's'} a la ruta.`);
      }
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [drawingMode, filteredForMap]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current = null;
      }
      markersById.current.forEach(m => m.setMap(null));
      markersById.current.clear();
      if (startMarkerRef.current) {
        startMarkerRef.current.setMap(null);
        startMarkerRef.current = null;
      }
    };
  }, []);

  // Render / update / remove the starting-point marker on the map. Lives
  // in its own effect (separate from the contact markers) so the contact
  // pass doesn't accidentally wipe it out. Uses a blue pin path on a
  // larger scale than the contact circles so it stands out as the route's
  // origin. When the user picks a new start (typing an address, hitting
  // 'Mi ubicación', or 'Iglesia') we also pan the map to the marker so
  // they can see where the route is going to start from.
  useEffect(() => {
    const google = (window as any).google;
    if (!google?.maps || !mapInstance.current) return;
    if (startLat == null || startLng == null) {
      if (startMarkerRef.current) {
        startMarkerRef.current.setMap(null);
        startMarkerRef.current = null;
      }
      return;
    }
    const position = { lat: startLat, lng: startLng };
    const icon = {
      // Standard Maps drop-pin path. Blue fill, white stroke for contrast
      // against both light and dark map styles.
      path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
      fillColor: '#3B82F6',
      fillOpacity: 1,
      strokeColor: 'white',
      strokeWeight: 2,
      scale: 1.8,
      anchor: new google.maps.Point(12, 24),
    };
    if (startMarkerRef.current) {
      startMarkerRef.current.setPosition(position);
      startMarkerRef.current.setIcon(icon);
    } else {
      startMarkerRef.current = new google.maps.Marker({
        position,
        map: mapInstance.current,
        icon,
        title: `Punto de partida: ${startAddress || ''}`,
        zIndex: 1000,
      });
    }
    // Recenter the map on the new starting point. Don't change zoom — if
    // the user is mid-pan looking at a particular cluster of contacts,
    // jumping the zoom would lose their place. A pan is enough to
    // confirm "the start landed here".
    mapInstance.current.panTo(position);
  }, [startLat, startLng, startAddress]);

  const proceedToRoute = async () => {
    if (selectedIds.size === 0) {
      showError('Seleccioná al menos un contacto.');
      return;
    }
    if (!startLat || !startLng) {
      showError('Ingresá un punto de partida antes de crear la ruta.');
      return;
    }
    if (!project) return;
    setSaving(true);
    try {
      // Persist picks + starting point to the project. RouteEditorPage will
      // hydrate from these and auto-calculate the optimal order on mount,
      // so the user lands directly on the calculated-route view. Bump expiry
      // to 60 days from now (was 7d when row was first created).
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const updatePayload = {
        ordered_contact_ids: Array.from(selectedIds),
        start_address: startAddress,
        start_lat: startLat,
        start_lng: startLng,
        expires_at: expiresAt,
      };
      const { error } = await supabase.from('shared_routes')
        .update(updatePayload)
        .eq('id', project.id);
      if (error) throw error;
      // Pre-fill the cache so RouteEditorPage reads the new state immediately
      // on mount instead of seeing the pre-update cached version. Without this,
      // the editor latches its hydration onto stale empty data and the user
      // lands on an empty form.
      queryClient.setQueryData(['route-project', projectId], (old: any) => ({
        ...(old || {}),
        ...updatePayload,
        id: project.id,
      }));
      queryClient.invalidateQueries({ queryKey: ['route-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      showSuccess(`${selectedIds.size} contacto${selectedIds.size === 1 ? '' : 's'} guardado${selectedIds.size === 1 ? '' : 's'}.`);
      navigate(`/admin/churches/${churchSlug}/rutas/${projectId}`);
    } catch (e: any) {
      showError(e.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      showError('Tu navegador no soporta geolocalización.');
      return;
    }
    // High accuracy is critical here — without it, the browser uses
    // IP-based / WiFi-triangulation lookup which can be off by several
    // kilometers (Dan reported the start point landing in completely
    // wrong neighborhoods). enableHighAccuracy asks the OS to use GPS
    // when possible; on a laptop without GPS it falls back to WiFi but
    // with much better precision than the default "fast" mode.
    // timeout caps how long we wait so the user isn't stuck on a
    // browser that can't get a fix.
    // maximumAge: 0 forces a fresh fix instead of accepting whatever
    // cached position the browser has from a previous lookup.
    const toastId = showLoading('Obteniendo tu ubicación...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        dismissToast(toastId);
        // Reject coordinates with absurd accuracy (>10km) — that's
        // almost always IP-geolocation falling back, and the user is
        // better off picking a manual start than starting their route
        // from a guess that's miles wrong.
        if (pos.coords.accuracy && pos.coords.accuracy > 10000) {
          showError(`Ubicación poco precisa (~${Math.round(pos.coords.accuracy / 1000)} km). Probá desde un dispositivo con GPS o usá "Iglesia".`);
          return;
        }
        setStartLat(pos.coords.latitude);
        setStartLng(pos.coords.longitude);
        setStartAddress(`Mi ubicación (~${Math.round(pos.coords.accuracy)}m de precisión)`);
        showSuccess('Ubicación capturada.');
      },
      (err) => {
        dismissToast(toastId);
        const reason = err.code === 1 ? 'Permiso denegado' : err.code === 2 ? 'Ubicación no disponible' : 'Tiempo agotado';
        showError(`No pudimos obtener tu ubicación: ${reason}.`);
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  };

  const useChurchAddress = async () => {
    if (!church) {
      showError('Iglesia no encontrada.');
      return;
    }
    // Prefer the lat/lng stored on the churches row. They were
    // calibrated once and are authoritative — geocoding the address
    // string fresh on every click is both unnecessary (we already
    // know the answer) and unreliable (the historical bug Dan kept
    // reporting was the result going to the wrong neighborhood
    // because the query string was missing ', Buenos Aires,
    // Argentina', so Google was matching against a different town
    // with the same street name). Stored coords skip that whole
    // class of failure.
    if (churchCoords?.lat != null && churchCoords?.lng != null) {
      setStartLat(churchCoords.lat);
      setStartLng(churchCoords.lng);
      setStartAddress(church.address || church.name);
      return;
    }

    // Fallback for churches that don't have lat/lng stored yet
    // (other churches in the org may not be calibrated). Use the
    // locality-aware builder so the geocode at least gets the
    // province + country tail and lands in the right city, then
    // ask the user to verify since this path is less reliable.
    if (!church.address) {
      showError(`${church.name || 'La iglesia'} no tiene una dirección configurada.`);
      return;
    }
    if (!(window as any).google?.maps) {
      showError('Esperá a que cargue el mapa y volvé a intentar.');
      return;
    }
    const geocoder = new (window as any).google.maps.Geocoder();
    const biased = buildGeocodeAddress(church.address, church.address);
    geocoder.geocode({ address: biased, region: 'AR' }, async (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        setStartLat(lat);
        setStartLng(lng);
        setStartAddress(church.address!);
        // Calibration: persist the geocoded result back to the church
        // row so future clicks on 'Iglesia' (in any session, by any
        // user) skip the geocoder and use the stored coords directly.
        // First-click cost = 1 geocode call; every click after = 0.
        // If the row already had coords this branch wouldn't have
        // run — we got here because lat/lng was NULL, which is the
        // signal that calibration is needed.
        await supabase.from('churches').update({ lat, lng }).eq('id', church.id);
        // Refresh the cached churchCoords so the rest of the app sees
        // the new value without a manual reload.
        queryClient.invalidateQueries({ queryKey: ['church-coords', churchId] });
      } else {
        showError(`No se pudo geolocalizar: ${church.address}`);
      }
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Header. Combines the project title with the responsable / sexo /
          date filters on a single flex-wrap row when the viewport is wide
          enough — they used to live in their own bar below, eating
          another row of vertical space before the map. The search input
          gets a tight max-width so it doesn't stretch across the whole
          page (was flex-1 unbounded). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2 px-1">
        <button
          onClick={() => navigate(`/admin/churches/${churchSlug}/rutas`)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          title="Volver a proyectos"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <RouteIcon className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 shrink">
          <div className="text-base sm:text-lg font-semibold truncate">{project?.name || 'Selección por mapa'}</div>
          <div className="text-[11px] text-muted-foreground hidden lg:block">
            Filtrá los contactos, hacé click en los pines y armá tu ruta.
          </div>
        </div>

        {/* Search lives in the sidebar header now (next to the contact
            list it filters), so it's gone from this top row. */}

        {/* Filter dropdowns — same options as before, just sitting on the
            header row instead of their own card. */}
        <select value={filterResponsableId} onChange={e => setFilterResponsableId(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background min-w-[140px] shrink-0">
          <option value="">Todos los responsables</option>
          <option value="__none__">Sin responsable</option>
          {(() => {
            // See RouteEditorPage for rationale: privileged roles see
            // the whole iglesia team; everyone else sees only themselves
            // (the contacts in their scope are already responsable_id =
            // their own id, so listing other people in their cuerda just
            // adds noise).
            const isPrivileged = profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
            let list = teamMembers;
            if (!isPrivileged) {
              list = teamMembers.filter(m => m.id === profile?.id);
            }
            return list
              .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
              .map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ));
          })()}
        </select>
        {/* Cuerda filter — only shown when there's more than one cuerda
            in the visible contact set. For a non-global referente whose
            list is already scoped to their own cuerda this would be a
            single-option dropdown, so we skip it. Same numeric-first
            sort order as the Cuerda dropdown in Semillero.
            
            Highlighted in gold when a global hasn't picked a filter yet
            — in that case the page intentionally shows nothing on the
            map until a cuerda is chosen, so we point to the dropdown
            with an attention-grabbing border + ring + a small caption.
            Once they pick anything, it goes back to a plain border. */}
        {availableCuerdas.length > 1 && (
          <div className="flex flex-col items-start shrink-0">
            <select
              value={filterCuerda}
              onChange={e => setFilterCuerda(e.target.value)}
              className={`h-8 text-xs rounded px-2 bg-background ${requireFilterBeforePainting ? 'border-2 border-primary ring-2 ring-primary/30 font-semibold text-primary' : 'border'}`}
              title="Filtrar por número de cuerda"
            >
              <option value="">Todas las cuerdas</option>
              {availableCuerdas.map(num => (
                <option key={num} value={num}>Cuerda {num}</option>
              ))}
            </select>
            {requireFilterBeforePainting && (
              <span className="text-[10px] text-primary mt-0.5 font-medium">↑ Elegí una para empezar</span>
            )}
          </div>
        )}
        <select value={filterSexo} onChange={e => setFilterSexo(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background shrink-0">
          <option value="">Sexo: todos</option>
          <option value="masculino">Masculino</option>
          <option value="femenino">Femenino</option>
        </select>
        {/* Dos rangos independientes, cada uno como un pill que se abre
            en popover con Desde/Hasta. Cerrado muestra el resumen
            ('1/5 – 15/5' / 'desde 1/5' / 'cualquiera') así no comen ancho. */}
        <DateRangeChip
          label="Fecha de contacto"
          hint="Fecha de contacto (cuándo se conectó con la persona)"
          from={filterDateFrom}
          to={filterDateTo}
          setFrom={setFilterDateFrom}
          setTo={setFilterDateTo}
        />
        <DateRangeChip
          label="Fecha de carga"
          hint="Fecha de carga (cuándo entró el contacto al sistema)"
          from={filterCreatedFrom}
          to={filterCreatedTo}
          setFrom={setFilterCreatedFrom}
          setTo={setFilterCreatedTo}
        />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 h-8 shrink-0">
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}

        {/* Mobile view toggle stays at the right end of the row. */}
        <div className="flex sm:hidden items-center bg-muted rounded-md p-0.5 ml-auto">
          <button
            onClick={() => setMobileView('map')}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${mobileView === 'map' ? 'bg-background shadow' : 'text-muted-foreground'}`}
          >
            <MapIcon className="h-3 w-3" /> Mapa
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${mobileView === 'list' ? 'bg-background shadow' : 'text-muted-foreground'}`}
          >
            <List className="h-3 w-3" /> Lista
          </button>
        </div>
      </div>

      {/* Second row: quick date pills + 'Solo con número' + Starting point.
          Punto de partida used to live in its own card below; now it
          shares the row with the quick filters so the map starts higher
          on the page. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0" title="Aplican al rango de Fecha de contacto">Rápidos (contacto):</span>
        <button onClick={() => setLastNDays(7)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted shrink-0">7 días</button>
        <button onClick={() => setLastNDays(15)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted shrink-0">15 días</button>
        <button onClick={() => setLastNDays(30)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted shrink-0">30 días</button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={onlyWithNumber}
            onChange={e => setOnlyWithNumber(e.target.checked)}
            className="rounded border-input"
          />
          Solo con número
        </label>
        <label
          className={`flex items-center gap-1.5 text-xs cursor-pointer select-none shrink-0 ${activeTerritoryPaths ? 'text-muted-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}`}
          title={activeTerritoryPaths ? 'Mostrar solo los contactos dentro de la zona dibujada para esta cuerda' : 'La cuerda activa no tiene un territorio dibujado'}
        >
          <input
            type="checkbox"
            checked={onlyInZone}
            disabled={!activeTerritoryPaths}
            onChange={e => setOnlyInZone(e.target.checked)}
            className="rounded border-input"
          />
          Solo en zona
        </label>
        <Button
          type="button"
          size="sm"
          variant={drawingMode ? 'default' : 'outline'}
          onClick={() => setDrawingMode(v => !v)}
          className="text-xs h-8 shrink-0 gap-1"
          title="Dibujá un área en el mapa para seleccionar todos los contactos dentro"
        >
          <Lasso className="h-3 w-3" />
          {drawingMode ? 'Cancelar dibujo' : 'Dibujar área'}
        </Button>

        {/* Punto de partida — inline on the second row. Label + address
            input + the two preset buttons. The 'Listo' tick still surfaces
            once a coordinate is set so the user knows the routing is
            ready to compute. */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Partida:</span>
            {startLat && startLng && (
              <span className="text-[10px] text-green-500 font-medium">✓ Listo</span>
            )}
          </div>
          <div className="w-56 max-w-full">
            <AddressAutocomplete
              value={startAddress}
              onChange={(addr, lat, lng) => {
                setStartAddress(addr);
                if (lat && lng) { setStartLat(lat); setStartLng(lng); }
              }}
              placeholder="Dirección de partida..."
              biasLat={churchCoords?.lat ?? null}
              biasLng={churchCoords?.lng ?? null}
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={useGeolocation} className="text-xs h-8 shrink-0">
            <Navigation className="h-3 w-3 mr-1" /> Mi ubicación
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={useChurchAddress} className="text-xs h-8 shrink-0" disabled={!church?.address}>
            <MapPin className="h-3 w-3 mr-1" /> Iglesia
          </Button>
        </div>
      </div>

      {/* Body: sidebar + map */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left sidebar: contact list */}
        <aside className={`${mobileView === 'list' ? 'flex' : 'hidden'} sm:flex flex-col w-full sm:w-72 lg:w-80 shrink-0 border rounded-lg bg-card overflow-hidden`}>
          {/* Sidebar search — filters the list (and therefore the map
              markers) by name or address. Lives here, attached to the
              list it filters, instead of in the top toolbar where the
              connection to "this is what's filtering my list" was less
              obvious. */}
          <div className="px-2 py-2 border-b bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o dirección..."
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
            <div className="text-xs">
              {/* Multi-line counter so the user understands the
                  relationship between filters / addressable / total.
                  Per Dan: 'es mejor que pongas algo así como mostrando
                  tantos contactos.' Without the breakdown it looks
                  like the cuerda has fewer contacts than it really
                  does — the 'sin dirección' bucket is invisible to
                  the map by definition but accounts for hundreds of
                  contacts in this iglesia. */}
              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="font-semibold">{filtered.length}</span>
                <span className="text-muted-foreground">mostrados</span>
                {scopeCounts && (
                  <>
                    <span className="text-muted-foreground">de</span>
                    <span className="font-semibold">{scopeCounts.withCoords}</span>
                    <span className="text-muted-foreground">con dirección</span>
                  </>
                )}
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-semibold text-primary">{selectedIds.size}</span>
                    <span className="text-muted-foreground">elegidos</span>
                  </>
                )}
              </div>
              {scopeCounts && scopeCounts.withCoords > filtered.length && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {scopeCounts.withCoords - filtered.length} oculto{scopeCounts.withCoords - filtered.length === 1 ? '' : 's'} por los filtros activos
                </div>
              )}
              {scopeCounts && scopeCounts.withoutCoords > 0 && (
                <div className="text-[10px] text-amber-400/80 mt-0.5">
                  +{scopeCounts.withoutCoords} contacto{scopeCounts.withoutCoords === 1 ? '' : 's'} sin dirección (no se pueden mapear)
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 'Solo seleccionados' toggle — hidden when nothing is
                  selected yet (would be a confusing button with no
                  effect). Maps continue to show every visible marker
                  even with this on; only the sidebar list narrows.
                  Click again to go back to the full list. */}
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setOnlySelected(v => !v)}
                  className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                    onlySelected
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                  title="Mostrar solo los contactos elegidos en la lista"
                >
                  {onlySelected ? '✓ Solo elegidos' : 'Solo elegidos'}
                </button>
              )}
              {selectedIds.size > 0 && (
                <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-foreground">
                  Limpiar
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Cargando contactos...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                {requireFilterBeforePainting ? (
                  <>
                    <p className="text-sm font-medium text-primary mb-1">Elegí una cuerda para empezar</p>
                    <p className="text-xs text-muted-foreground">Hay muchos contactos en esta iglesia. Filtrá por cuerda (o por responsable, fecha, etc.) para que aparezcan en el mapa.</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{hasActiveFilters ? 'Ningún contacto matchea estos filtros.' : 'No hay contactos georreferenciados.'}</p>
                )}
              </div>
            ) : (
              filtered.map(c => {
                const isSelected = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      toggleContact(c.id);
                      // Pan to the contact on the map so user gets feedback
                      if (mapInstance.current && c.lat != null && c.lng != null) {
                        mapInstance.current.panTo({ lat: c.lat, lng: c.lng });
                      }
                    }}
                    className={`w-full text-left flex items-start gap-2 p-2 border-b last:border-b-0 hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'}`}>
                      {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {c.first_name} {c.last_name || ''}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.address || 'Sin dirección'}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Map */}
        <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} sm:flex flex-1 relative rounded-lg border overflow-hidden bg-muted`}>
          <div ref={mapRef} className="w-full h-full" />
          {/* Floating CTA */}
          {selectedIds.size > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
              {(!startLat || !startLng) && (
                <span className="text-[11px] bg-yellow-500/90 text-yellow-950 px-2 py-0.5 rounded-full font-medium">
                  Falta el punto de partida
                </span>
              )}
              <Button
                onClick={proceedToRoute}
                disabled={saving || !startLat || !startLng}
                size="lg"
                className="shadow-lg gap-2"
              >
                <RouteIcon className="h-4 w-4" />
                {saving ? 'Guardando...' : `Crear ruta con ${selectedIds.size} contacto${selectedIds.size === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only floating CTA when in list view */}
      {selectedIds.size > 0 && mobileView === 'list' && (
        <div className="sm:hidden mt-3 space-y-1">
          {(!startLat || !startLng) && (
            <div className="text-[11px] text-center bg-yellow-500/15 text-yellow-600 px-2 py-1 rounded">
              Falta el punto de partida
            </div>
          )}
          <Button onClick={proceedToRoute} disabled={saving || !startLat || !startLng} className="w-full gap-2">
            <RouteIcon className="h-4 w-4" />
            {saving ? 'Guardando...' : `Crear ruta con ${selectedIds.size}`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default MapPickerPage;
