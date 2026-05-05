"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { MapPin, Navigation, X, Search, Route as RouteIcon, ExternalLink } from 'lucide-react';
import { showError } from '@/utils/toast';

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts || [];
    return (contacts || []).filter(c => {
      const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
      const addr = (c.address || '').toLowerCase();
      return name.includes(term) || addr.includes(term);
    });
  }, [contacts, search]);

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
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#FFC233', strokeWeight: 5 },
      });
      directionsRenderer.current.setMap(mapInstance.current);
    }
    directionsRenderer.current.setDirections(routeData.result);
  }, [routeData, startLat, startLng]);

  const openInGoogleMaps = () => {
    if (!routeData) return;
    const origin = `${startLat},${startLng}`;
    const destination = `${routeData.orderedContacts[routeData.orderedContacts.length - 1].lat},${routeData.orderedContacts[routeData.orderedContacts.length - 1].lng}`;
    const waypoints = routeData.orderedContacts.slice(0, -1).map((c: Contact) => `${c.lat},${c.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
    window.open(url, '_blank');
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
            <div className="flex gap-2 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={useGeolocation} className="text-xs">
                <Navigation className="h-3 w-3 mr-1" /> Usar mi ubicación
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
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o dirección..."
                className="pl-9 h-9"
              />
            </div>
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
                    <label
                      key={c.id}
                      className={`flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleContact(c.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {c.first_name} {c.last_name || ''}
                          {c.numero_cuerda && (
                            <span className="ml-2 text-xs text-muted-foreground">· Cuerda {c.numero_cuerda}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.address || 'Sin dirección'}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

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
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[10px]">A</span>
                    <span className="font-medium">Punto de partida</span>
                    <span className="text-muted-foreground truncate">— {startAddress}</span>
                  </div>
                  {routeData.orderedContacts.map((c: Contact, idx: number) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px]">{idx + 1}</span>
                      <span className="font-medium truncate">{c.first_name} {c.last_name || ''}</span>
                      <span className="text-muted-foreground truncate">— {c.address}</span>
                    </div>
                  ))}
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
    </div>
  );
};

export default RutasPage;
