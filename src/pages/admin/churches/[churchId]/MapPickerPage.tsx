"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { buildGeocodeAddress } from '@/lib/geocode-address';
import { ChevronLeft, MapPin, Route as RouteIcon, Search, Filter, X, List, Map as MapIcon, Navigation } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

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
  sexo: string | null;
}

const MapPickerPage = () => {
  const { churchId, projectId } = useParams<{ churchId: string; projectId: string }>();
  // Bias address autocomplete toward the church area.
  const { data: churchCoords } = useChurchCoords(churchId);
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersById = useRef<Map<string, any>>(new Map());
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
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterSexo, setFilterSexo] = useState<string>('');
  const [onlyWithNumber, setOnlyWithNumber] = useState(true);
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
          .select('id, first_name, last_name, address, lat, lng, numero_cuerda, responsable_id, fecha_contacto, sexo')
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

  // Load Google Maps script once
  useEffect(() => {
    if ((window as any).google?.maps) return;
    if (document.querySelector('script[data-gmaps]')) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    script.setAttribute('data-gmaps', '1');
    document.head.appendChild(script);
  }, []);

  // Apply filters. Two memos: one for the MAP (map markers respect every
  // filter EXCEPT onlySelected — picking 'Solo seleccionados' shouldn't
  // remove markers from the map, only condense the sidebar list), and
  // one for the SIDEBAR LIST (which additionally applies onlySelected).
  const filteredForMap = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts || []).filter(c => {
      if (onlyWithNumber && !/\d/.test(c.address || '')) return false;
      if (filterResponsableId === '__none__') {
        if (c.responsable_id) return false;
      } else if (filterResponsableId && c.responsable_id !== filterResponsableId) return false;
      if (filterCuerda && c.numero_cuerda !== filterCuerda) return false;
      if (filterDateFrom && (!c.fecha_contacto || c.fecha_contacto < filterDateFrom)) return false;
      if (filterDateTo && (!c.fecha_contacto || c.fecha_contacto > filterDateTo)) return false;
      if (filterSexo && c.sexo !== filterSexo) return false;
      if (term) {
        const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
        const addr = (c.address || '').toLowerCase();
        if (!name.includes(term) && !addr.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithNumber, filterResponsableId, filterCuerda, filterDateFrom, filterDateTo, filterSexo]);

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
    setFilterSexo('');
  };

  const hasActiveFilters = !!(search || filterResponsableId || filterCuerda || filterDateFrom || filterDateTo || filterSexo);

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
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 11 : 8,
        fillColor: isSelected ? '#10b981' : '#FFC233',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      };
      if (existing) {
        existing.setIcon(icon);
        existing.setTitle(`${c.first_name} ${c.last_name || ''}${isSelected ? ' (seleccionado)' : ''}`);
      } else {
        const marker = new google.maps.Marker({
          position: { lat: c.lat, lng: c.lng },
          map: mapInstance.current,
          icon,
          title: `${c.first_name} ${c.last_name || ''}`,
        });
        marker.addListener('click', () => {
          toggleContact(c.id);
        });
        markersById.current.set(c.id, marker);
      }
    });

    // Fit bounds the first time we have markers
    if (!fittedRef.current && filteredForMap.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filteredForMap.forEach(c => {
        if (c.lat != null && c.lng != null) bounds.extend({ lat: c.lat, lng: c.lng });
      });
      mapInstance.current.fitBounds(bounds, 60);
      fittedRef.current = true;
    }
  }, [filteredForMap, selectedIds]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
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
      navigate(`/admin/churches/${churchId}/rutas/${projectId}`);
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
    geocoder.geocode({ address: biased, region: 'AR' }, (results: any[], status: string) => {
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
          onClick={() => navigate(`/admin/churches/${churchId}/rutas`)}
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
        {/* Cuerda filter — only shown when there's more than one cuerda
            in the visible contact set. For a non-global referente whose
            list is already scoped to their own cuerda this would be a
            single-option dropdown, so we skip it. Same numeric-first
            sort order as the Cuerda dropdown in Semillero. */}
        {availableCuerdas.length > 1 && (
          <select value={filterCuerda} onChange={e => setFilterCuerda(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background shrink-0" title="Filtrar por número de cuerda">
            <option value="">Todas las cuerdas</option>
            {availableCuerdas.map(num => (
              <option key={num} value={num}>Cuerda {num}</option>
            ))}
          </select>
        )}
        <select value={filterSexo} onChange={e => setFilterSexo(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background shrink-0">
          <option value="">Sexo: todos</option>
          <option value="masculino">Masculino</option>
          <option value="femenino">Femenino</option>
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Fecha contacto desde" className="h-8 text-xs border rounded px-2 bg-background shrink-0" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="Fecha contacto hasta" className="h-8 text-xs border rounded px-2 bg-background shrink-0" />
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
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Rápidos:</span>
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
              <span className="font-semibold">{filtered.length}</span>
              <span className="text-muted-foreground"> visibles</span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold text-primary">{selectedIds.size}</span>
                  <span className="text-muted-foreground"> elegidos</span>
                </>
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
              <div className="p-4 text-center text-xs text-muted-foreground">
                {hasActiveFilters ? 'Ningún contacto matchea estos filtros.' : 'No hay contactos georreferenciados.'}
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
