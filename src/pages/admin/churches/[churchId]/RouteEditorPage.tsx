"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { MapPin, Navigation, X, Search, Route as RouteIcon, ExternalLink, Share2, Copy, Pencil, ChevronLeft, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

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
  const { churchId, projectId } = useParams<{ churchId: string; projectId: string }>();
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

  // Route + visited + notes state
  const [routeData, setRouteData] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const notesSaveTimer = useRef<any>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const customMarkers = useRef<any[]>([]);
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
    if (project.notes) setNotes(project.notes);
    if (project.visited) {
      const vSet = new Set<string>();
      Object.entries(project.visited).forEach(([id, v]) => { if (v) vSet.add(id); });
      setVisited(vSet);
    }
  }, [project]);

  // Load Google Maps once
  useEffect(() => {
    if ((window as any).google?.maps) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts || []).filter(c => {
      if (onlyWithNumber && !/\d/.test(c.address || '')) return false;
      if (filterResponsableId === '__none__') {
        if (c.responsable_id) return false;
      } else if (filterResponsableId && c.responsable_id !== filterResponsableId) return false;
      if (filterDateFrom && (!c.fecha_contacto || c.fecha_contacto < filterDateFrom)) return false;
      if (filterDateTo && (!c.fecha_contacto || c.fecha_contacto > filterDateTo)) return false;
      if (term) {
        const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
        const addr = (c.address || '').toLowerCase();
        if (!name.includes(term) && !addr.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithNumber, filterResponsableId, filterDateFrom, filterDateTo]);

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
    setRouteData(null);

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

  // Auto-calc on mount when project hydration brought selected + start
  useEffect(() => {
    if (autoCalcedRef.current) return;
    if (!projectHydratedRef.current) return;
    if (!contacts || contacts.length === 0) return;
    if (selectedIds.size === 0) return;
    if (!startLat || !startLng) return;
    if (routeData || calculating) return;
    autoCalcedRef.current = true;
    calculateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, selectedIds, startLat, startLng, project]);

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
    routeData.orderedContacts.forEach((c: Contact, idx: number) => {
      const isVisited = visited.has(c.id);
      customMarkers.current.push(new google.maps.Marker({
        position: { lat: c.lat!, lng: c.lng! },
        map: mapInstance.current,
        label: { text: String(idx + 1), color: 'white', fontSize: '13px', fontWeight: 'bold' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: isVisited ? '#6b7280' : '#FFC233',
          fillOpacity: isVisited ? 0.6 : 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        title: `${idx + 1}. ${c.first_name} ${c.last_name || ''}${isVisited ? ' (visitado)' : ''}`,
      }));
    });
  };

  // Render map when routeData changes
  useEffect(() => {
    if (!routeData || !mapRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

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

  // Re-color markers when visited changes
  useEffect(() => {
    refreshMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited]);

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

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (!project?.id) return;
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    setSavingNotes(true);
    notesSaveTimer.current = setTimeout(async () => {
      await supabase.from('shared_routes').update({ notes: value }).eq('id', project.id);
      setSavingNotes(false);
    }, 800);
  };

  const openInGoogleMaps = () => {
    if (!routeData) return;
    const origin = `${startLat},${startLng}`;
    const last = routeData.orderedContacts[routeData.orderedContacts.length - 1];
    const destination = `${last.lat},${last.lng}`;
    const waypoints = routeData.orderedContacts.slice(0, -1).map((c: Contact) => `${c.lat},${c.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
    window.open(url, '_blank');
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

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
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
          onClick={() => navigate(`/admin/churches/${churchId}/rutas`)}
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
            <Button size="sm" variant="outline" onClick={openInGoogleMaps} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Google Maps
            </Button>
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
        // ─── Calculated route view: 3 columns (matches public shared view) ───
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Stops */}
          <div className="lg:col-span-4 border rounded-lg p-4 bg-card flex flex-col">
            <h3 className="text-sm font-semibold mb-3">Paradas ({routeData.orderedContacts.length})</h3>
            <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[14px] shrink-0">★</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Partida</div>
                  <div className="text-muted-foreground truncate">{startAddress}</div>
                </div>
              </div>
              {routeData.orderedContacts.map((c: Contact, idx: number) => {
                const isVisited = visited.has(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 text-xs p-2 rounded border ${isVisited ? 'opacity-60 border-muted' : 'border-transparent hover:border-border'}`}>
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
                      onClick={() => toggleVisited(c.id)}
                      className={`text-[11px] px-2.5 py-1 rounded border whitespace-nowrap shrink-0 ${isVisited ? 'border-gray-500 text-gray-400' : 'border-green-500/40 text-green-400 hover:bg-green-500/10'}`}
                    >
                      {isVisited ? '✓' : 'Marcar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map */}
          <div className="lg:col-span-5">
            <div ref={mapRef} className="w-full rounded-lg border" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }} />
          </div>

          {/* Notes */}
          <div className="lg:col-span-3 border rounded-lg p-4 bg-card flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Notas compartidas</h3>
              <span className="text-[10px] text-muted-foreground">
                {savingNotes ? 'Guardando...' : 'Auto'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Cualquiera con el link puede leer y editar.
            </p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Escribí acá observaciones, quién atendió, qué se habló, próximos pasos..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              style={{ minHeight: 'calc(100vh - 300px)' }}
            />
          </div>
        </div>
      ) : (
        // ─── Empty state: invite the user to add contacts ───────────────────
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <RouteIcon className="h-12 w-12 text-muted-foreground/60 mb-3" />
          <h2 className="text-base font-semibold mb-1">{calculating ? 'Calculando ruta...' : 'Ruta vacía'}</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-md">
            {calculating
              ? 'Calculando el orden óptimo para visitar todos los contactos.'
              : 'Agregá contactos a la ruta y un punto de partida para calcular el orden óptimo de visita.'}
          </p>
          {!calculating && (
            <Button size="lg" onClick={openEditDialog} className="gap-2">
              <Plus className="h-4 w-4" /> Agregar contactos
            </Button>
          )}
        </div>
      )}

      {/* Edit dialog: pick start point + select contacts */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { if (!o) cancelEdit(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Editar contactos de la ruta</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Starting point */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-primary" /> Punto de partida
                {startLat && startLng && <span className="text-[10px] text-green-500 font-medium normal-case">✓ Listo</span>}
              </label>
              <AddressAutocomplete
                value={startAddress}
                onChange={(addr, lat, lng) => {
                  setStartAddress(addr);
                  if (lat && lng) { setStartLat(lat); setStartLng(lng); }
                }}
                placeholder="Escribí la dirección de partida..."
                biasLat={churchCoords?.lat ?? null}
                biasLng={churchCoords?.lng ?? null}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Button type="button" size="sm" variant="outline" onClick={useGeolocation} className="text-xs h-8">
                  <Navigation className="h-3 w-3 mr-1" /> Mi ubicación
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={useChurchAddress} className="text-xs h-8" disabled={!church?.address}>
                  <MapPin className="h-3 w-3 mr-1" /> Iglesia
                </Button>
              </div>
            </div>

            {/* Contact filters */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                Contactos ({selectedIds.size} seleccionados)
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o dirección..."
                  className="pl-9 h-9"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <select value={filterResponsableId} onChange={e => setFilterResponsableId(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background">
                  <option value="">Todos los responsables</option>
                  <option value="__none__">Sin responsable</option>
                  {teamMembers
                    .filter(m => {
                      if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
                        return m.numero_cuerda === profile.numero_cuerda;
                      }
                      return true;
                    })
                    .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                    ))}
                </select>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="Desde" className="h-8 w-full text-xs border rounded px-2 bg-background" />
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="Hasta" className="h-8 w-full text-xs border rounded px-2 bg-background" />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyWithNumber}
                  onChange={(e) => setOnlyWithNumber(e.target.checked)}
                  className="rounded border-input"
                />
                Solo direcciones con número (recomendado para rutas precisas)
              </label>

              <div className="max-h-[320px] overflow-y-auto border rounded">
                {contactsLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {search ? 'Sin resultados' : 'No hay contactos georreferenciados.'}
                  </div>
                ) : (
                  filtered.map(c => {
                    const isSelected = selectedIds.has(c.id);
                    return (
                      <div key={c.id} className={`flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleContact(c.id)} className="mt-0.5 cursor-pointer" />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleContact(c.id)}>
                          <div className="text-sm font-medium truncate">
                            {c.first_name} {c.last_name || ''}
                            {c.numero_cuerda && (
                              <span className="ml-2 text-xs text-muted-foreground">· Cuerda {c.numero_cuerda}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{c.address || 'Sin dirección'}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingContactId(c.id); }}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Editar contacto"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedContacts.length > 0 && (
                <div className="mt-3 p-3 bg-primary/5 rounded border">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground">
                    Seleccionados ({selectedContacts.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContacts.map(c => (
                      <div key={c.id} className="flex items-center gap-1 bg-card border rounded-full pl-3 pr-1 py-0.5 text-xs">
                        <span>{c.first_name} {c.last_name || ''}</span>
                        <button
                          onClick={() => toggleContact(c.id)}
                          className="ml-1 w-4 h-4 rounded-full bg-muted hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center"
                          title="Quitar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
            <Button onClick={applyEditAndCalculate} disabled={selectedIds.size === 0 || !startLat} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {hasRoute ? 'Recalcular ruta' : 'Calcular ruta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact dialog */}
      {editingContactId && churchId && (
        <ContactProfileDialog
          open={!!editingContactId}
          onOpenChange={(o) => {
            if (!o) {
              setEditingContactId(null);
              queryClient.invalidateQueries({ queryKey: ['rutas-contacts', churchId] });
              // Force a recalc so updated coordinates flow into the map
              setRouteData(null);
              autoCalcedRef.current = false;
            }
          }}
          contactId={editingContactId}
          churchId={churchId}
        />
      )}
    </div>
  );
};

export default RouteEditorPage;
