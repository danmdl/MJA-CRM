"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { MapPin, Navigation, X, Search, Route as RouteIcon, ExternalLink, Share2, Copy, Pencil } from 'lucide-react';
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
}

const RutasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startAddress, setStartAddress] = useState('');
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [routeData, setRouteData] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);

  // Fetch contacts of this church with valid coordinates
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['rutas-contacts', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, address, lat, lng, numero_cuerda, responsable_id, created_by')
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      // Non-global users see contacts of their cuerda + their own
      if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
        if (profile.numero_cuerda) {
          q = q.or(`numero_cuerda.eq.${profile.numero_cuerda},responsable_id.eq.${profile.id},created_by.eq.${profile.id}`);
        } else {
          q = q.or(`responsable_id.eq.${profile.id},created_by.eq.${profile.id}`);
        }
      }
      const { data } = await q.limit(2000);
      return (data || []) as Contact[];
    },
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  // Fetch church info to enable "Use church address" button
  const { data: church } = useQuery<{ id: string; name: string; address: string | null }>({
    queryKey: ['church', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('id, name, address').eq('id', churchId!).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Fetch user's existing shared route projects (non-expired)
  const { data: myRoutes } = useQuery<any[]>({
    queryKey: ['my-shared-routes', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase.from('shared_routes')
        .select('id, share_token, name, created_at, expires_at, ordered_contact_ids, total_meters, total_seconds')
        .eq('created_by', profile.id)
        .eq('church_id', churchId!)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!profile?.id && !!churchId,
  });

  const useChurchAddress = async () => {
    if (!church?.address) {
      showError(`${church?.name || 'La iglesia'} no tiene una dirección configurada. Pedile a un admin que la cargue.`);
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
        showError(`No se pudo geolocalizar la dirección: ${church.address}`);
      }
    });
  };

  const [onlyWithNumber, setOnlyWithNumber] = useState(true);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts || []).filter(c => {
      // Filter by address with street number when toggle is on.
      // Heuristic: address must contain at least one digit (most ARG addresses
      // have a street number like 'Av Corrientes 4000'). Without a number,
      // the geocoded lat/lng is just an area centroid which makes routes useless.
      if (onlyWithNumber && !/\d/.test(c.address || '')) return false;
      if (term) {
        const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
        const addr = (c.address || '').toLowerCase();
        if (!name.includes(term) && !addr.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithNumber]);

  const selectedContacts = useMemo(
    () => (contacts || []).filter(c => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

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

  // Load Google Maps script when needed
  useEffect(() => {
    if ((window as any).google?.maps) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const calculateRoute = async () => {
    if (selectedContacts.length === 0) { showError('Seleccioná al menos un contacto.'); return; }
    if (!startLat || !startLng) { showError('Ingresá un punto de partida.'); return; }
    setCalculating(true);
    setRouteData(null);
    setShareToken(null);
    setVisited(new Set());

    // Wait for Google Maps to load
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

    // Build waypoints from selected contacts
    const waypoints = selectedContacts.map(c => ({
      location: new google.maps.LatLng(c.lat!, c.lng!),
      stopover: true,
    }));

    // Last contact is the destination, the rest are waypoints to optimize
    const lastWaypoint = waypoints.pop()!;

    directionsService.route(
      {
        origin: new google.maps.LatLng(startLat, startLng),
        destination: lastWaypoint.location,
        waypoints: waypoints,
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
        // result.routes[0].waypoint_order tells us the new order
        const order = result.routes[0].waypoint_order as number[];
        const orderedContacts = [...order.map(i => selectedContacts[i]), selectedContacts[selectedContacts.length - 1]];

        // Compute total distance + duration
        const legs = result.routes[0].legs;
        const totalMeters = legs.reduce((sum: number, l: any) => sum + l.distance.value, 0);
        const totalSeconds = legs.reduce((sum: number, l: any) => sum + l.duration.value, 0);

        setRouteData({
          result,
          orderedContacts,
          totalMeters,
          totalSeconds,
          legs,
        });
      }
    );
  };

  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const customMarkers = useRef<any[]>([]);

  const toggleVisited = (contactId: string) => {
    setVisited(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
    refreshMarkers();
  };

  const refreshMarkers = () => {
    if (!routeData || !mapInstance.current) return;
    const google = (window as any).google;
    // Clear old markers
    customMarkers.current.forEach(m => m.setMap(null));
    customMarkers.current = [];
    // Start marker (green)
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
    // Numbered stops
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

  // Render map when routeData is set
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

  // Re-color markers when visited state changes
  useEffect(() => {
    refreshMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited]);

  const openInGoogleMaps = () => {
    if (!routeData) return;
    const origin = `${startLat},${startLng}`;
    const destination = `${routeData.orderedContacts[routeData.orderedContacts.length - 1].lat},${routeData.orderedContacts[routeData.orderedContacts.length - 1].lng}`;
    const waypoints = routeData.orderedContacts.slice(0, -1).map((c: Contact) => `${c.lat},${c.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleShare = async () => {
    if (!routeData) return;
    const defaultName = `Ruta ${new Date().toLocaleDateString('es-AR')} (${routeData.orderedContacts.length} paradas)`;
    const projectName = window.prompt('Nombre del proyecto de ruta:', defaultName);
    if (projectName === null) return; // user cancelled
    const finalName = projectName.trim() || defaultName;
    setSharing(true);
    try {
      // Generate a random token (UUID-like)
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('shared_routes').insert({
        share_token: token,
        name: finalName,
        created_by: profile?.id,
        church_id: churchId,
        start_address: startAddress,
        start_lat: startLat,
        start_lng: startLng,
        ordered_contact_ids: routeData.orderedContacts.map((c: Contact) => c.id),
        total_meters: routeData.totalMeters,
        total_seconds: routeData.totalSeconds,
        expires_at: expiresAt,
        visited: {},
        notes: '',
      });
      if (error) throw error;
      setShareToken(token);
      queryClient.invalidateQueries({ queryKey: ['my-shared-routes', profile?.id] });
      showSuccess(`Proyecto "${finalName}" creado. Link válido por 7 días.`);
    } catch (e: any) {
      showError(e.message || 'Error al generar el link.');
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

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <RouteIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Rutas</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Seleccioná contactos del Semillero para calcular el orden óptimo de visita.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Selection */}
        <div className="space-y-4">
          {/* Starting point */}
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Punto de partida</h3>
            </div>
            <AddressAutocomplete
              value={startAddress}
              onChange={(addr, lat, lng) => {
                setStartAddress(addr);
                if (lat && lng) { setStartLat(lat); setStartLng(lng); }
              }}
              placeholder="Escribí la dirección de partida..."
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={useGeolocation} className="text-xs">
                <Navigation className="h-3 w-3 mr-1" /> Usar mi ubicación
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={useChurchAddress} className="text-xs" disabled={!church?.address}>
                <MapPin className="h-3 w-3 mr-1" /> Dirección de iglesia
              </Button>
              {startLat && startLng && (
                <span className="text-xs text-muted-foreground self-center">
                  ✓ Listo ({startLat.toFixed(4)}, {startLng.toFixed(4)})
                </span>
              )}
            </div>
          </div>

          {/* Contact selector */}
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Contactos a visitar ({selectedIds.size})</h3>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                  Limpiar
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o dirección..."
                className="pl-9 h-9"
              />
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
            <div className="max-h-[400px] overflow-y-auto border rounded">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {search ? 'Sin resultados' : 'No hay contactos con dirección georreferenciada.'}
                </div>
              ) : (
                filtered.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                    >
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
                        title="Editar contacto (incluye dirección)"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected contacts list with quick remove */}
          {selectedContacts.length > 0 && (
            <div className="border rounded-lg p-3 bg-primary/5">
              <div className="text-xs font-semibold mb-2 text-muted-foreground">Seleccionados ({selectedContacts.length}):</div>
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

          <Button
            onClick={calculateRoute}
            disabled={calculating || selectedIds.size === 0 || !startLat}
            className="w-full"
          >
            {calculating ? 'Calculando ruta óptima...' : `Calcular ruta (${selectedIds.size} ${selectedIds.size === 1 ? 'parada' : 'paradas'})`}
          </Button>
        </div>

        {/* Right: Map + result */}
        <div className="space-y-4">
          {/* My active projects */}
          {(myRoutes || []).length > 0 && (
            <div className="border rounded-lg p-4 bg-card">
              <h3 className="text-sm font-semibold mb-2">Mis proyectos de ruta activos</h3>
              <p className="text-xs text-muted-foreground mb-3">Cada proyecto incluye un link compartible y notas colaborativas.</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {(myRoutes || []).map((r: any) => {
                  const url = `${window.location.origin}/r/${r.share_token}`;
                  const expiresIn = Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{r.name || `Ruta sin nombre · ${(r.ordered_contact_ids || []).length} paradas`}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(r.ordered_contact_ids || []).length} paradas · expira en {expiresIn} {expiresIn === 1 ? 'día' : 'días'}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(url, '_blank')} title="Abrir">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        navigator.clipboard.writeText(url);
                        showSuccess('Link copiado');
                      }} title="Copiar link">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={async () => {
                        if (!confirm(`¿Eliminar el proyecto "${r.name || 'sin nombre'}"?`)) return;
                        await supabase.from('shared_routes').delete().eq('id', r.id);
                        queryClient.invalidateQueries({ queryKey: ['my-shared-routes', profile?.id] });
                        showSuccess('Proyecto eliminado.');
                      }} title="Eliminar">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {routeData ? (
            <>
              <div className="border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Ruta óptima</h3>
                  <Button size="sm" variant="outline" onClick={openInGoogleMaps}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Abrir en Google Maps
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                  <div className="bg-muted/30 rounded px-3 py-2">
                    <div className="text-muted-foreground">Distancia total</div>
                    <div className="font-semibold text-base">{(routeData.totalMeters / 1000).toFixed(1)} km</div>
                  </div>
                  <div className="bg-muted/30 rounded px-3 py-2">
                    <div className="text-muted-foreground">Tiempo estimado</div>
                    <div className="font-semibold text-base">{formatDuration(routeData.totalSeconds)}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[12px]">★</span>
                    <span className="font-medium">Punto de partida</span>
                    <span className="text-muted-foreground truncate">— {startAddress}</span>
                  </div>
                  {routeData.orderedContacts.map((c: Contact, idx: number) => {
                    const isVisited = visited.has(c.id);
                    return (
                      <div key={c.id} className={`flex items-center gap-2 text-xs p-1.5 rounded ${isVisited ? 'opacity-50 line-through' : ''}`}>
                        <span className={`w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] ${isVisited ? 'bg-gray-500' : 'bg-primary'}`}>{idx + 1}</span>
                        <span className="font-medium truncate flex-1">{c.first_name} {c.last_name || ''}</span>
                        <span className="text-muted-foreground truncate hidden sm:inline">— {c.address}</span>
                        <button
                          onClick={() => toggleVisited(c.id)}
                          className={`text-[10px] px-2 py-0.5 rounded border ${isVisited ? 'border-gray-500 text-gray-400 hover:bg-gray-500/10' : 'border-green-500/40 text-green-400 hover:bg-green-500/10'}`}
                          title={isVisited ? 'Marcar como no visitado' : 'Marcar como visitado'}
                        >
                          {isVisited ? '✓ Visitado' : 'Marcar visitado'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Share link button */}
                <div className="mt-4 pt-3 border-t flex items-center gap-2">
                  {!shareToken ? (
                    <Button size="sm" variant="outline" onClick={handleShare} disabled={sharing} className="gap-2">
                      <Share2 className="h-3 w-3" /> {sharing ? 'Generando...' : 'Compartir ruta (link público, 7 días)'}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <Input
                        value={`${window.location.origin}/r/${shareToken}`}
                        readOnly
                        className="text-xs h-8"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <Button size="sm" variant="outline" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/r/${shareToken}`);
                        showSuccess('Link copiado');
                      }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div ref={mapRef} className="w-full h-[500px] rounded-lg border" />
            </>
          ) : (
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center h-[400px] flex flex-col items-center justify-center">
              <RouteIcon className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Seleccioná contactos y un punto de partida</p>
              <p className="text-xs text-muted-foreground mt-1">para ver la ruta óptima en el mapa.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit contact dialog (for editing addresses without leaving Rutas) */}
      {editingContactId && churchId && (
        <ContactProfileDialog
          open={!!editingContactId}
          onOpenChange={(o) => {
            if (!o) {
              setEditingContactId(null);
              // Refresh contacts so any address change is reflected immediately
              queryClient.invalidateQueries({ queryKey: ['rutas-contacts', churchId] });
            }
          }}
          contactId={editingContactId}
          churchId={churchId}
        />
      )}
    </div>
  );
};

export default RutasPage;
