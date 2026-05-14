"use client";
import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { Button } from '@/components/ui/button';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { geoJsonToGooglePaths } from '@/lib/territory-utils';
import { todayInART, formatDuration, filterRouteContacts } from './route-editor/helpers';
import { RouteEditDialog } from './route-editor/RouteEditDialog';
import { loadGoogleMaps } from '@/lib/google-maps';
import { buildGoogleMapsChunks, makeStopRanges, type StopRange } from '@/lib/google-maps-urls';
import {
  groupStopsByLocation,
  buildGroupLabel,
  buildGroupTitle,
  markerScaleFor,
  markerFontSizeFor,
} from '@/lib/route-stops';
import { Route as RouteIcon, ExternalLink, Share2, Copy, Pencil, Trash2, ChevronLeft, ChevronDown, MessageCircle, Plus, Map as MapIcon } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
// Lazy: profile dialog chunk only loads when a contact card is clicked.
const ContactProfileDialog = lazy(() => import('@/components/admin/ContactProfileDialog'));

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
}

const RouteEditorPage = () => {
  const { churchId: churchSlug, projectId } = useParams<{ churchId: string; projectId: string }>();
  const churchId = useChurchUuid();
  // Bias address autocomplete toward the church area.
  const { data: churchCoords } = useChurchCoords(churchId);
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  // Selection / picker state — also driven from the edit dialog
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [filterResponsableId, setFilterResponsableId] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [onlyWithNumber, setOnlyWithNumber] = useState(true);
  const [onlyInZone, setOnlyInZone] = useState(false);

  // Route + visited + notes state
  const [routeData, setRouteData] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // Per-stop notes (replaces the old route-wide notes textarea). Stored
  // in shared_routes.contact_notes JSONB and synced automatically into
  // contacts.observaciones by the DB trigger added in migration 0026.
  const [contactNotes, setContactNotes] = useState<Record<string, { text: string; date: string }>>({});
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const notesSaveTimers = useRef<Record<string, any>>({});
  // Which segment of the route to draw on the embedded map. Picking a
  // range (e.g. 5–10) hides the directions polyline and replaces it
  // with a straight line through just the in-range stops so earlier
  // legs don't crowd the canvas. Pure display filter — the chunked
  // GMaps share links still cover every stop.
  const [stopsRange, setStopsRange] = useState<StopRange | 'all'>('all');
  // Dropdown for the chunked Google Maps links (route with >10 stops).
  const [gmapsMenuOpen, setGmapsMenuOpen] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const customMarkers = useRef<any[]>([]);
  // Manual polyline used when the user picks a partial range (e.g. 5–10).
  // We hide the DirectionsRenderer and draw a straight line connecting
  // just the in-range stops so the earlier road-routed legs disappear.
  const customPolyline = useRef<any>(null);
  const projectHydratedRef = useRef(false);
  const autoCalcedRef = useRef(false);

  // Snapshot used to restore state if user cancels the edit dialog
  const editSnapshotRef = useRef<{
    selectedIds: Set<string>;
    startAddress: string;
    startLat: number | null;
    startLng: number | null;
  } | null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────
  const { data: contacts, isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['rutas-contacts', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      // Same .range() pagination as MapPickerPage / SemilleroPage. .limit(2000)
      // alone hits the Supabase 1000-row response cap and silently drops
      // the rest. Visibility gate is re-applied per page so non-globals
      // never see other cuerdas regardless of how many pages we walk.
      const PAGE_SIZE = 1000;
      const all: Contact[] = [];
      for (let page = 0; ; page++) {
        let q = supabase.from('contacts')
          .select('id, first_name, last_name, address, lat, lng, numero_cuerda, responsable_id, created_by, fecha_contacto')
          .eq('church_id', churchId!)
          .is('deleted_at', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
          if (profile.numero_cuerda) {
            q = q.eq('numero_cuerda', profile.numero_cuerda);
          } else {
            q = q.eq('responsable_id', profile.id);
          }
        }
        const { data, error } = await q;
        if (error) {
          console.error('[rutas-contacts] page', page, 'error', error);
          break;
        }
        const rows = (data || []) as Contact[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        if (page >= 49) break;
      }
      return all;
    },
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  const { data: teamMembers = [] } = useQuery<{ id: string; first_name: string | null; last_name: string | null; numero_cuerda: string | null }[]>({
    queryKey: ['rutas-team', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, first_name, last_name, numero_cuerda')
        .eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: church } = useQuery<{ id: string; name: string; address: string | null }>({
    queryKey: ['church', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('id, name, address').eq('id', churchId!).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: project, isLoading: projectLoading } = useQuery<any>({
    queryKey: ['route-project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase.from('shared_routes').select('*').eq('id', projectId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // ─── Hydration ────────────────────────────────────────────────────────
  // Wait for the project to actually have data before latching the gate.
  // Otherwise a stale empty cached version (e.g. right after creation in
  // RutasPage, or before MapPicker's setQueryData lands) would cause us to
  // hydrate empty and never re-hydrate.
  useEffect(() => {
    if (!project || projectHydratedRef.current) return;
    const hasStart = !!project.start_address || project.start_lat != null;
    const hasPicks = (project.ordered_contact_ids?.length ?? 0) > 0;
    const hasNotes = !!project.notes;
    const hasVisited = project.visited && Object.keys(project.visited).length > 0;
    if (!hasStart && !hasPicks && !hasNotes && !hasVisited) return;
    projectHydratedRef.current = true;
    if (project.start_address) setStartAddress(project.start_address);
    if (project.start_lat) setStartLat(Number(project.start_lat));
    if (project.start_lng) setStartLng(Number(project.start_lng));
    if (hasPicks) setSelectedIds(new Set(project.ordered_contact_ids));
    if (project.contact_notes) setContactNotes(project.contact_notes);
    if (project.visited) {
      const vSet = new Set<string>();
      Object.entries(project.visited).forEach(([id, v]) => { if (v) vSet.add(id); });
      setVisited(vSet);
    }
  }, [project]);

  // Mark the route's notes as seen for the creator. Only fires once per
  // mount when project loads, only updates if there's actually something
  // newer than what we already saw — avoids noisy writes on every open.
  // The Rutas grid card uses (notes_updated_at > notes_seen_at) to flag
  // unseen updates with a red 'NUEVA NOTA' pill, so this write is what
  // dismisses it.
  const seenBumpedRef = useRef(false);
  useEffect(() => {
    if (!project || !profile?.id || seenBumpedRef.current) return;
    if (project.created_by !== profile.id) return; // only the creator's view dismisses
    if (!project.notes_updated_at) return;          // no notes ever — nothing to mark seen
    const seenAt = project.notes_seen_at ? new Date(project.notes_seen_at).getTime() : 0;
    const updatedAt = new Date(project.notes_updated_at).getTime();
    if (seenAt >= updatedAt) return;                // already up to date
    seenBumpedRef.current = true;
    supabase.from('shared_routes')
      .update({ notes_seen_at: new Date().toISOString() })
      .eq('id', project.id)
      .then(() => {
        // Quietly invalidate the projects list so the badge disappears
        // from the grid when the user goes back. No toast — this is
        // background bookkeeping.
        queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      });
  }, [project, profile?.id, queryClient]);

  // Load Google Maps via the shared loader (places + drawing + geometry).
  useEffect(() => {
    loadGoogleMaps().catch(err => console.error('[RouteEditor] Google Maps load failed', err));
  }, []);

  // Cuerda territories — same query MapPickerPage uses. Used by the
  // 'Solo en zona' toggle in the edit dialog.
  const { data: cuerdasWithTerritory } = useQuery<{ id: string; numero: string; territory_geojson: string | null }[]>({
    queryKey: ['route-editor-cuerda-territories', churchId],
    queryFn: async () => {
      const { data: zonas } = await supabase.from('zonas').select('id').eq('church_id', churchId!);
      if (!zonas?.length) return [];
      const { data, error } = await supabase
        .from('cuerdas_with_geojson')
        .select('id, numero, territory_geojson')
        .in('zona_id', zonas.map((z: any) => z.id));
      if (error) {
        console.error('[route-editor-cuerda-territories]', error);
        return [];
      }
      return (data as any) || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // The 'Solo en zona' toggle scopes to the user's own cuerda's polygon.
  // No filterCuerda exists in this dialog (the dialog isn't cuerda-scoped),
  // so we always lean on profile.numero_cuerda. Globals without a cuerda
  // get the toggle disabled.
  const activeTerritoryPaths = useMemo(() => {
    const numero = profile?.numero_cuerda;
    if (!numero || !cuerdasWithTerritory) return null;
    const row = cuerdasWithTerritory.find(c => c.numero === numero);
    if (!row?.territory_geojson) return null;
    return geoJsonToGooglePaths(row.territory_geojson);
  }, [cuerdasWithTerritory, profile?.numero_cuerda]);

  useEffect(() => {
    if (onlyInZone && !activeTerritoryPaths) setOnlyInZone(false);
  }, [onlyInZone, activeTerritoryPaths]);

  // ─── Derived ──────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => filterRouteContacts(contacts, {
      search, onlyWithNumber, filterResponsableId, filterDateFrom, filterDateTo, onlyInZone, activeTerritoryPaths,
    }),
    [contacts, search, onlyWithNumber, filterResponsableId, filterDateFrom, filterDateTo, onlyInZone, activeTerritoryPaths],
  );

  const selectedContacts = useMemo(
    () => (contacts || []).filter(c => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

  const visitedCount = useMemo(() => {
    if (!routeData) return 0;
    return routeData.orderedContacts.filter((c: Contact) => visited.has(c.id)).length;
  }, [routeData, visited]);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const toggleContact = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      showError('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartLat(pos.coords.latitude);
        setStartLng(pos.coords.longitude);
        setStartAddress(`Mi ubicación (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`);
      },
      () => showError('No pudimos obtener tu ubicación.')
    );
  };

  const useChurchAddress = async () => {
    if (!church?.address) {
      showError(`${church?.name || 'La iglesia'} no tiene una dirección configurada.`);
      return;
    }
    if (!(window as any).google?.maps) {
      showError('Esperá a que cargue el mapa y volvé a intentar.');
      return;
    }
    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode({ address: church.address, region: 'AR' }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        setStartLat(loc.lat());
        setStartLng(loc.lng());
        setStartAddress(church.address!);
      } else {
        showError(`No se pudo geolocalizar: ${church.address}`);
      }
    });
  };

  const calculateRoute = async () => {
    if (selectedContacts.length === 0) { showError('Seleccioná al menos un contacto.'); return; }
    if (!startLat || !startLng) { showError('Ingresá un punto de partida.'); return; }
    setCalculating(true);
    // Intentionally NOT clearing routeData here. Doing so flipped
    // hasRoute false for a tick, which unmounted the map div, made
    // mapInstance.current point at an orphaned DOM node, and caused
    // a visible "hard refresh" flash every time we recalculated
    // (most commonly after closing the contact-edit dialog). The
    // new directions callback below overwrites routeData with the
    // fresh result, so the user sees the old route → new route
    // transition in place, no remount, no flash. If the calc fails
    // we keep the previous route on screen and surface the failure
    // via the error toast.

    const waitForGoogle = () => new Promise<void>((resolve) => {
      const check = () => {
        if ((window as any).google?.maps) { resolve(); return; }
        setTimeout(check, 100);
      };
      check();
    });
    await waitForGoogle();

    const google = (window as any).google;
    const directionsService = new google.maps.DirectionsService();

    const waypoints = selectedContacts.map(c => ({
      location: new google.maps.LatLng(c.lat!, c.lng!),
      stopover: true,
    }));
    const lastWaypoint = waypoints.pop()!;

    directionsService.route(
      {
        origin: new google.maps.LatLng(startLat, startLng),
        destination: lastWaypoint.location,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
        region: 'AR',
      },
      (result: any, status: string) => {
        setCalculating(false);
        if (status !== 'OK' || !result) {
          showError(`No se pudo calcular la ruta: ${status}`);
          return;
        }
        const order = result.routes[0].waypoint_order as number[];
        const orderedContacts = [...order.map(i => selectedContacts[i]), selectedContacts[selectedContacts.length - 1]];
        const legs = result.routes[0].legs;
        const totalMeters = legs.reduce((sum: number, l: any) => sum + l.distance.value, 0);
        const totalSeconds = legs.reduce((sum: number, l: any) => sum + l.duration.value, 0);
        setRouteData({ result, orderedContacts, totalMeters, totalSeconds, legs });
      }
    );
  };

  // Auto-calc on mount when project hydration brought selected + start.
  //
  // We deliberately do NOT bail on an existing `routeData` here — only on
  // `calculating`. The dialog-close handler below resets autoCalcedRef to
  // false specifically so an in-place address edit triggers a recalc, and
  // at that point `routeData` from the previous calc is still set. If we
  // skipped on truthy routeData the recalc would never fire and the user
  // would have to refresh to pick up the new address (Dan reported this
  // exact symptom — kept reproducing after the original fix because the
  // routeData guard was still in place).
  useEffect(() => {
    if (autoCalcedRef.current) return;
    if (!projectHydratedRef.current) return;
    if (!contacts || contacts.length === 0) return;
    if (selectedIds.size === 0) return;
    if (!startLat || !startLng) return;
    if (calculating) return;
    autoCalcedRef.current = true;
    calculateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, selectedIds, startLat, startLng, project]);

  const isStopInRange = (idx: number) => {
    if (stopsRange === 'all') return true;
    return idx + 1 >= stopsRange.from && idx + 1 <= stopsRange.to;
  };

  const refreshMarkers = () => {
    if (!routeData || !mapInstance.current) return;
    const google = (window as any).google;
    customMarkers.current.forEach(m => m.setMap(null));
    customMarkers.current = [];
    customMarkers.current.push(new google.maps.Marker({
      position: { lat: startLat!, lng: startLng! },
      map: mapInstance.current,
      label: { text: '★', color: 'white', fontSize: '14px', fontWeight: 'bold' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      },
      title: 'Punto de partida',
    }));
    // Group overlapping stops so two contacts at the same address get
    // a single pin labeled "2 y 3" (or "2, 3, 4" / "2-5" for bigger
    // groups) instead of one pin hiding the other.
    const stopsForMarkers = routeData.orderedContacts
      .map((c: Contact, idx: number) => ({ c, idx }))
      .filter(({ idx, c }: { idx: number; c: Contact }) =>
        isStopInRange(idx) && c.lat != null && c.lng != null,
      )
      .map(({ c, idx }: { c: Contact; idx: number }) => ({
        number: idx + 1,
        lat: c.lat as number,
        lng: c.lng as number,
        title: `${c.first_name} ${c.last_name || ''}`.trim(),
        visited: visited.has(c.id),
      }));
    const groups = groupStopsByLocation(stopsForMarkers);
    groups.forEach(g => {
      customMarkers.current.push(new google.maps.Marker({
        position: { lat: g.lat, lng: g.lng },
        map: mapInstance.current,
        label: {
          text: buildGroupLabel(g.numbers),
          color: 'white',
          fontSize: markerFontSizeFor(g),
          fontWeight: 'bold',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: markerScaleFor(g),
          fillColor: g.allVisited ? '#6b7280' : '#FFC233',
          fillOpacity: g.allVisited ? 0.6 : 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        title: buildGroupTitle(g),
      }));
    });
  };

  // Toggle between the road-routed directions polyline (range = 'all')
  // and a straight-line polyline through the in-range stops (partial
  // range). Called from the routeData effect and the stopsRange effect.
  const refreshPolyline = () => {
    if (!routeData || !mapInstance.current) return;
    const google = (window as any).google;
    if (customPolyline.current) {
      customPolyline.current.setMap(null);
      customPolyline.current = null;
    }
    if (stopsRange === 'all') {
      // Restore the directions polyline.
      if (directionsRenderer.current) directionsRenderer.current.setMap(mapInstance.current);
      return;
    }
    // Hide directions polyline for partial range and draw a straight
    // line through the in-range stops. Not road-routed, but enough
    // visual anchor for "this segment" without the earlier legs.
    if (directionsRenderer.current) directionsRenderer.current.setMap(null);
    const path: { lat: number; lng: number }[] = [];
    routeData.orderedContacts.forEach((c: Contact, idx: number) => {
      if (isStopInRange(idx) && c.lat != null && c.lng != null) {
        path.push({ lat: c.lat, lng: c.lng });
      }
    });
    if (path.length >= 2) {
      customPolyline.current = new google.maps.Polyline({
        path,
        map: mapInstance.current,
        strokeColor: '#FFC233',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        geodesic: false,
      });
    }
  };

  // Render map when routeData changes
  useEffect(() => {
    if (!routeData || !mapRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    // Detect a stale map instance. The <div ref={mapRef}> lives
    // inside the `hasRoute ? RouteView : EmptyState` ternary, so any
    // path that flips routeData to null and back (calculateRoute()
    // itself does this synchronously at the top, so every recalc
    // qualifies) unmounts the map div and remounts a fresh DOM node
    // when the new route lands. mapInstance.current is still bound
    // to the previous (now orphaned) node, so directionsRenderer
    // pours the new directions into an off-screen map and the
    // visible div stays pitch black until the user reloads. Tearing
    // it down here forces the block below to recreate the map
    // against the current node.
    if (mapInstance.current && mapInstance.current.getDiv() !== mapRef.current) {
      if (directionsRenderer.current) directionsRenderer.current.setMap(null);
      mapInstance.current = null;
      directionsRenderer.current = null;
    }

    if (!mapInstance.current) {
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: { lat: startLat!, lng: startLng! },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#FFC233', strokeWeight: 5 },
      });
      directionsRenderer.current.setMap(mapInstance.current);
    }
    directionsRenderer.current.setDirections(routeData.result);
    refreshMarkers();
    refreshPolyline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeData, startLat, startLng]);

  // Keep Google Maps in sync with the container's actual size. The map's
  // internal dimensions are cached at init and aren't refreshed unless we
  // explicitly fire a 'resize' event on the instance. When the user opens
  // the "Editar contactos" dialog and then hits Recalcular, the body
  // reflows (Radix Dialog locks scroll, swaps pointer-events, the
  // backdrop transitions out), and the map div ends up the same SIZE
  // but the tiles are drawn assuming the dimensions Google Maps cached
  // earlier — which renders as a black canvas until the user resizes
  // the window or refreshes. A ResizeObserver on the container catches
  // any layout-driven size change (dialog open/close, sidebar toggle,
  // window resize, container parent flex changes) and triggers the
  // resize event so Maps redraws the tiles correctly.
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

  // Re-color markers and toggle polyline mode when visited / range change.
  useEffect(() => {
    refreshMarkers();
    refreshPolyline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited, stopsRange]);

  const toggleVisited = async (contactId: string) => {
    const next = new Set(visited);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    setVisited(next);
    // Persist immediately so the public viewers see it too. JSONB shape:
    // { [contactId]: true }. We omit false entries to keep the object clean.
    if (project?.id) {
      const visitedObj: Record<string, boolean> = {};
      next.forEach(id => { visitedObj[id] = true; });
      await supabase.from('shared_routes').update({ visited: visitedObj }).eq('id', project.id);
    }
  };

  // Per-stop note save: debounced 800ms per contact. DB trigger
  // sync_route_contact_notes_to_observaciones mirrors each entry into
  // contacts.observaciones with an idempotent "[Ruta <short> · DATE]"
  // prefix so subsequent edits replace the same line.
  const handleContactNoteChange = (contactId: string, value: string) => {
    const date = contactNotes[contactId]?.date || todayInART();
    const nextAll = { ...contactNotes, [contactId]: { text: value, date } };
    if (!value.trim()) delete nextAll[contactId];
    setContactNotes(nextAll);
    if (!project?.id) return;
    if (notesSaveTimers.current[contactId]) clearTimeout(notesSaveTimers.current[contactId]);
    setSavingContactId(contactId);
    notesSaveTimers.current[contactId] = setTimeout(async () => {
      await supabase.from('shared_routes').update({ contact_notes: nextAll }).eq('id', project.id);
      setSavingContactId(curr => (curr === contactId ? null : curr));
    }, 800);
  };

  // Chunked Google Maps URLs. Routes with more than 10 stops can't fit
  // in a single web URL, so we hand the user one URL per chunk —
  // chunks overlap by one point so following them in order traces the
  // whole route without gaps.
  const gmapsUrls = useMemo(() => {
    if (!routeData || !startLat || !startLng) return [];
    // Pass the address per stop so iOS Google Maps shows the address
    // in each input box instead of 'Marcador'. See google-maps-urls.ts
    // for the rationale.
    const allStops = [
      { lat: startLat, lng: startLng, address: startAddress || null },
      ...routeData.orderedContacts.map((c: Contact) => ({ lat: c.lat!, lng: c.lng!, address: c.address })),
    ];
    return buildGoogleMapsChunks(allStops);
  }, [routeData, startLat, startLng]);

  const openGmapsUrl = (idx: number) => {
    const url = gmapsUrls[idx];
    if (!url) return;
    window.open(url, '_blank');
    setGmapsMenuOpen(false);
  };

  const shareUrl = project?.share_token ? `${window.location.origin}/r/${project.share_token}` : '';

  const shareWhatsApp = () => {
    if (!shareUrl) return;
    const text = `${project?.name || 'Ruta'}: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    showSuccess('Link copiado');
  };

  const handleShare = async () => {
    if (!routeData || !project) return;
    setSharing(true);
    try {
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('shared_routes')
        .update({
          start_address: startAddress,
          start_lat: startLat,
          start_lng: startLng,
          ordered_contact_ids: routeData.orderedContacts.map((c: Contact) => c.id),
          total_meters: routeData.totalMeters,
          total_seconds: routeData.totalSeconds,
          expires_at: expiresAt,
        })
        .eq('id', project.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      queryClient.invalidateQueries({ queryKey: ['route-project', projectId] });
      showSuccess('Ruta guardada. Link válido por 60 días.');
    } catch (e: any) {
      showError(e.message || 'Error al guardar la ruta.');
    } finally {
      setSharing(false);
    }
  };

  // ─── Edit dialog open/close ───────────────────────────────────────────
  const openEditDialog = () => {
    // Snapshot so we can restore on cancel
    editSnapshotRef.current = {
      selectedIds: new Set(selectedIds),
      startAddress,
      startLat,
      startLng,
    };
    setEditDialogOpen(true);
  };

  const cancelEdit = () => {
    if (editSnapshotRef.current) {
      setSelectedIds(editSnapshotRef.current.selectedIds);
      setStartAddress(editSnapshotRef.current.startAddress);
      setStartLat(editSnapshotRef.current.startLat);
      setStartLng(editSnapshotRef.current.startLng);
    }
    setEditDialogOpen(false);
  };

  // Quick-remove a contact directly from the route's stop list (the
  // numbered cards next to the map). Equivalent to opening "Editar
  // contactos" and unchecking the contact, but one click instead of
  // four. Triggers the auto-recalc useEffect via autoCalcedRef=false
  // so the route reorders + the map markers redraw without a refresh.
  const removeStop = (contactId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });
    // Empty selection — clear the route so the user lands on the
    // "Ruta vacía" state instead of seeing a stale calc.
    if (selectedIds.size <= 1) {
      setRouteData(null);
    }
    // Drop the once-only latch so the auto-recalc effect re-fires
    // against the new selectedContacts on the next render.
    autoCalcedRef.current = false;
  };

  const applyEditAndCalculate = async () => {
    if (selectedIds.size === 0) { showError('Seleccioná al menos un contacto.'); return; }
    if (!startLat || !startLng) { showError('Ingresá un punto de partida.'); return; }
    setEditDialogOpen(false);
    // Force recalc — this picks up whatever's in selectedIds + start state now
    await calculateRoute();
    // Belt-and-suspenders: even with the ResizeObserver above, the dialog
    // closes via a CSS transition that doesn't always change the map div's
    // measured size (the div was the same width/height the whole time;
    // what changed is whether something was drawn over it). Some browsers
    // skip the observer callback in that case. Fire the resize event
    // ourselves on the next frame and re-fit the bounds so the tiles
    // redraw and the route stays centered. This is the specific fix for
    // the "map turns black after Recalcular ruta" Dan reported.
    requestAnimationFrame(() => {
      const google = (window as any).google;
      if (!google?.maps || !mapInstance.current) return;
      google.maps.event.trigger(mapInstance.current, 'resize');
      // Re-fit to the directions bounds. setDirections already sets the
      // viewport via DirectionsRenderer, but explicitly fitBounds picks
      // up any new points the user just added/removed in the edit pass.
      const bounds = directionsRenderer.current?.getDirections?.()?.routes?.[0]?.bounds;
      if (bounds) mapInstance.current.fitBounds(bounds);
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────
  const hasRoute = !!routeData;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => navigate(`/admin/churches/${churchSlug}/rutas`)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Volver a proyectos"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <RouteIcon className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 flex-shrink">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold truncate">
              {projectLoading ? 'Cargando...' : (project?.name || 'Proyecto sin nombre')}
            </h1>
            {project && (
              <button
                onClick={async () => {
                  const newName = window.prompt('Renombrar proyecto:', project.name || '');
                  if (!newName || newName === project.name) return;
                  await supabase.from('shared_routes').update({ name: newName.trim() }).eq('id', project.id);
                  queryClient.invalidateQueries({ queryKey: ['route-project', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['route-projects'] });
                  showSuccess('Renombrado.');
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted shrink-0"
                title="Renombrar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {hasRoute && (
            <p className="text-[11px] text-muted-foreground">
              {(routeData.totalMeters / 1000).toFixed(1)} km · {formatDuration(routeData.totalSeconds)} · {visitedCount}/{routeData.orderedContacts.length} visitadas
            </p>
          )}
        </div>

        <div className="flex-1 min-w-0" />

        {/* Action buttons (only shown when there's a route) */}
        {hasRoute && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={openEditDialog} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar contactos
            </Button>
            {/* Google Maps — single link when short, dropdown of parts
                when the route has more than 10 stops and we had to
                chunk. Each chunk's URL covers up to 10 stops and starts
                where the previous one ended. */}
            {gmapsUrls.length > 1 ? (
              <div className="relative">
                <Button size="sm" variant="outline" onClick={() => setGmapsMenuOpen(o => !o)} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Google Maps ({gmapsUrls.length} partes)
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                {gmapsMenuOpen && (
                  <div className="absolute right-0 mt-1 z-20 bg-card border rounded-md shadow-lg min-w-[180px] overflow-hidden">
                    {gmapsUrls.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => openGmapsUrl(i)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-3"
                      >
                        <span>Parte {i + 1} de {gmapsUrls.length}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => openGmapsUrl(0)} className="gap-1.5" disabled={gmapsUrls.length === 0}>
                <ExternalLink className="h-3.5 w-3.5" /> Google Maps
              </Button>
            )}
            {project?.share_token && (
              <>
                <Button size="sm" variant="outline" onClick={shareWhatsApp} className="gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </Button>
              </>
            )}
            <Button size="sm" onClick={handleShare} disabled={sharing} className="gap-1.5">
              <Share2 className="h-3.5 w-3.5" /> {sharing ? 'Guardando...' : 'Guardar ruta'}
            </Button>
          </div>
        )}
      </div>

      {hasRoute ? (
        // ─── Calculated route view: 2 columns ───
        // The standalone "Notas compartidas" column is gone — notes now
        // live inline with each stop and sync to contacts.observaciones
        // through the DB trigger. Paradas keep a wider column so the
        // per-stop note textarea has room to breathe.
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Range filter for the polyline. Each range button hides
              earlier road legs so the user can review a segment
              cleanly — replaces the polyline with a straight line
              through just the in-range stops. The paradas list and
              the chunked GMaps share links still cover every stop. */}
          {makeStopRanges(routeData.orderedContacts.length).length > 0 && (
            <div className="lg:col-span-12 flex flex-wrap items-center gap-2 text-xs -mb-2">
              <span className="text-muted-foreground">Mostrar en el mapa:</span>
              {makeStopRanges(routeData.orderedContacts.length).map(r => {
                const isActive = stopsRange !== 'all' && stopsRange.from === r.from && stopsRange.to === r.to;
                return (
                  <button
                    key={`${r.from}-${r.to}`}
                    onClick={() => setStopsRange(r)}
                    className={`px-2.5 py-0.5 rounded-full border transition-colors ${
                      isActive
                        ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r.from}–{r.to}
                  </button>
                );
              })}
              <button
                onClick={() => setStopsRange('all')}
                className={`px-2.5 py-0.5 rounded-full border transition-colors ${
                  stopsRange === 'all'
                    ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas ({routeData.orderedContacts.length})
              </button>
            </div>
          )}
          {/* Stops + per-stop notes */}
          <div className="lg:col-span-5 border rounded-lg p-4 bg-card flex flex-col">
            <h3 className="text-sm font-semibold mb-3">Paradas ({routeData.orderedContacts.length})</h3>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[14px] shrink-0">★</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Partida</div>
                  <div className="text-muted-foreground truncate">{startAddress}</div>
                </div>
              </div>
              {routeData.orderedContacts.map((c: Contact, idx: number) => {
                const isVisited = visited.has(c.id);
                const note = contactNotes[c.id]?.text || '';
                return (
                  <div key={c.id} className={`flex flex-col gap-2 text-xs p-2 rounded border ${isVisited ? 'opacity-60 border-muted' : 'border-transparent hover:border-border'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[12px] shrink-0 ${isVisited ? 'bg-gray-500' : 'bg-primary'}`}>{idx + 1}</span>
                      <div className={`flex-1 min-w-0 ${isVisited ? 'line-through' : ''}`}>
                        <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                        <div className="text-muted-foreground truncate">{c.address}</div>
                      </div>
                      <button
                        onClick={() => setEditingContactId(c.id)}
                        className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted shrink-0"
                        title="Editar contacto"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeStop(c.id)}
                        className="text-muted-foreground hover:text-red-400 p-1 rounded hover:bg-red-500/10 shrink-0"
                        title="Quitar de la ruta"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleVisited(c.id)}
                        className={`text-[11px] px-2.5 py-1 rounded border whitespace-nowrap shrink-0 ${isVisited ? 'border-gray-500 text-gray-400' : 'border-green-500/40 text-green-400 hover:bg-green-500/10'}`}
                      >
                        {isVisited ? '✓' : 'Marcar'}
                      </button>
                    </div>
                    <div className="ml-9">
                      <textarea
                        value={note}
                        onChange={(e) => handleContactNoteChange(c.id, e.target.value)}
                        placeholder="Notas de esta visita (se guardan en el perfil del contacto)..."
                        className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] resize-y"
                        style={{ minHeight: 40 }}
                      />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {savingContactId === c.id
                          ? 'Guardando…'
                          : note ? 'Sincroniza al perfil del contacto' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map */}
          <div className="lg:col-span-7">
            <div ref={mapRef} className="w-full rounded-lg border" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }} />
          </div>
        </div>
      ) : (projectLoading || contactsLoading || ((project?.ordered_contact_ids?.length ?? 0) > 0 && !routeData) || calculating) ? (
        // ─── Loading state ─────────────────────────────────────────
        // Distinguishes "this route really has nothing yet" from
        // "we just landed here and the saved data hasn't loaded
        // yet". Opening an already-saved route used to flash the
        // "Ruta vacía / Elegir desde el mapa / Elegir desde lista"
        // placeholder for 1-2s until the project + contacts queries
        // resolved and the auto-calc effect kicked in, which is
        // exactly what Dan reported. If the project has saved picks
        // (or any query is in flight, or we're mid-calc) we show a
        // neutral "Cargando ruta..." card instead of inviting the
        // user to start over.
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <RouteIcon className="h-12 w-12 text-muted-foreground/60 mb-3 animate-pulse" />
          <h2 className="text-base font-semibold mb-1">Cargando ruta...</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {calculating
              ? 'Calculando el orden óptimo para visitar todos los contactos.'
              : 'Trayendo los contactos guardados y armando el mapa.'}
          </p>
        </div>
      ) : (
        // ─── Empty state: invite the user to add contacts ───────────────────
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <RouteIcon className="h-12 w-12 text-muted-foreground/60 mb-3" />
          <h2 className="text-base font-semibold mb-1">Ruta vacía</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-md">
            Agregá contactos a la ruta y un punto de partida para calcular el orden óptimo de visita.
          </p>
          {/* Two actions side-by-side. Primary (filled) is the map
              picker — that's the same flow the user took to create
              the project, so it's what they expect to see when they
              come back to a route they hadn't filled in yet. The
              dialog (outline) is the alternative for people who'd
              rather pick from a flat list. Putting both here means
              the user doesn't need to know there are two ways in. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="lg" onClick={() => navigate(`/admin/churches/${churchSlug}/rutas/${projectId}/mapa`)} className="gap-2">
              <MapIcon className="h-4 w-4" /> Elegir desde el mapa
            </Button>
            <Button size="lg" variant="outline" onClick={openEditDialog} className="gap-2">
              <Plus className="h-4 w-4" /> Elegir desde lista
            </Button>
          </div>
        </div>
      )}

      {/* Edit dialog: pick start point + select contacts.
          Display + interaction live in RouteEditDialog; state stays
          here so cancelEdit can restore the snapshot. */}
      <RouteEditDialog
        open={editDialogOpen}
        onCancel={cancelEdit}
        onApply={applyEditAndCalculate}
        hasRoute={hasRoute}
        startAddress={startAddress}
        setStartAddress={setStartAddress}
        startLat={startLat}
        setStartLat={setStartLat}
        startLng={startLng}
        setStartLng={setStartLng}
        churchCoords={churchCoords}
        church={church ?? null}
        onUseGeolocation={useGeolocation}
        onUseChurchAddress={useChurchAddress}
        search={search}
        setSearch={setSearch}
        filterResponsableId={filterResponsableId}
        setFilterResponsableId={setFilterResponsableId}
        filterDateFrom={filterDateFrom}
        setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo}
        setFilterDateTo={setFilterDateTo}
        onlyWithNumber={onlyWithNumber}
        setOnlyWithNumber={setOnlyWithNumber}
        onlyInZone={onlyInZone}
        setOnlyInZone={setOnlyInZone}
        activeTerritoryPaths={activeTerritoryPaths}
        teamMembers={teamMembers}
        profile={profile}
        contactsLoading={contactsLoading}
        filtered={filtered}
        selectedIds={selectedIds}
        selectedContacts={selectedContacts}
        toggleContact={toggleContact}
        setEditingContactId={setEditingContactId}
      />

      {/* Edit contact dialog */}
      {editingContactId && churchId && (
        <Suspense fallback={null}>
          <ContactProfileDialog
            open
            onOpenChange={(o) => {
              if (!o) {
                setEditingContactId(null);
                // Reset the once-only auto-calc latch and invalidate
                // the contacts query. When the refetch lands and
                // React re-renders with the fresh contacts array, the
                // auto-recalc useEffect sees autoCalcedRef=false +
                // updated deps and fires calculateRoute() — which
                // captures the FRESH selectedContacts because the
                // useMemo derived from the new contacts has already
                // recomputed in this render pass.
                //
                // Earlier versions of this handler called
                // calculateRoute() directly after awaiting the refetch.
                // That ran BEFORE React had a chance to re-render with
                // the new contacts, so the closure-captured
                // selectedContacts inside calculateRoute() was still
                // the stale list — Dan reported the contact stayed
                // at its old address after the first edit and only
                // moved on a second edit + refresh. Letting the
                // useEffect handle it after the refetch-driven render
                // is the correct fix.
                autoCalcedRef.current = false;
                queryClient.invalidateQueries({ queryKey: ['rutas-contacts', churchId] });
              }
            }}
            contactId={editingContactId}
            churchId={churchId}
          />
        </Suspense>
      )}
    </div>
  );
};

export default RouteEditorPage;
