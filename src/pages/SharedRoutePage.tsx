"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin, Route as RouteIcon, AlertCircle } from 'lucide-react';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const SharedRoutePage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const customMarkers = useRef<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!token) { setError('Link inválido.'); setLoading(false); return; }
      const { data, error: e } = await supabase.from('shared_routes')
        .select('*')
        .eq('share_token', token)
        .single();
      if (e || !data) { setError('Ruta no encontrada o expirada.'); setLoading(false); return; }
      if (new Date(data.expires_at).getTime() < Date.now()) {
        setError('Este link expiró.'); setLoading(false); return;
      }
      setRoute(data);
      setVisited(data.visited || {});
      // Fetch the contacts in order
      const { data: cs } = await supabase.from('contacts')
        .select('id, first_name, last_name, address, lat, lng')
        .in('id', data.ordered_contact_ids);
      const orderMap = new Map(data.ordered_contact_ids.map((id: string, i: number) => [id, i]));
      const sorted = (cs || []).sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      setContacts(sorted as Contact[]);
      setLoading(false);
    })();
  }, [token]);

  // Load Google Maps
  useEffect(() => {
    if ((window as any).google?.maps) return;
    if (!route) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }, [route]);

  // Render map + route
  useEffect(() => {
    if (!route || !mapRef.current || contacts.length === 0) return;
    const tryRender = () => {
      const google = (window as any).google;
      if (!google?.maps) { setTimeout(tryRender, 200); return; }

      if (!mapInstance.current) {
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: { lat: Number(route.start_lat), lng: Number(route.start_lng) },
          zoom: 13,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        });
      }

      // Compute directions
      const ds = new google.maps.DirectionsService();
      const dr = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#FFC233', strokeWeight: 5 },
      });
      dr.setMap(mapInstance.current);

      const waypoints = contacts.slice(0, -1).map(c => ({
        location: new google.maps.LatLng(c.lat!, c.lng!),
        stopover: true,
      }));
      ds.route({
        origin: new google.maps.LatLng(Number(route.start_lat), Number(route.start_lng)),
        destination: new google.maps.LatLng(contacts[contacts.length - 1].lat!, contacts[contacts.length - 1].lng!),
        waypoints,
        optimizeWaypoints: false, // already ordered
        travelMode: google.maps.TravelMode.DRIVING,
        region: 'AR',
      }, (result: any, status: string) => {
        if (status === 'OK') dr.setDirections(result);
      });

      // Custom numbered markers
      customMarkers.current.forEach(m => m.setMap(null));
      customMarkers.current = [];
      customMarkers.current.push(new google.maps.Marker({
        position: { lat: Number(route.start_lat), lng: Number(route.start_lng) },
        map: mapInstance.current,
        label: { text: '★', color: 'white', fontSize: '14px', fontWeight: 'bold' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#10b981', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
        title: 'Punto de partida',
      }));
      contacts.forEach((c, idx) => {
        const isVisited = !!visited[c.id];
        customMarkers.current.push(new google.maps.Marker({
          position: { lat: c.lat!, lng: c.lng! },
          map: mapInstance.current,
          label: { text: String(idx + 1), color: 'white', fontSize: '13px', fontWeight: 'bold' },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: isVisited ? '#6b7280' : '#FFC233', fillOpacity: isVisited ? 0.6 : 1, strokeColor: 'white', strokeWeight: 2 },
          title: `${idx + 1}. ${c.first_name} ${c.last_name || ''}`,
        }));
      });
    };
    tryRender();
  }, [route, contacts, visited]);

  const toggleVisited = async (contactId: string) => {
    const next = { ...visited, [contactId]: !visited[contactId] };
    if (!next[contactId]) delete next[contactId];
    setVisited(next);
    // Persist back (anyone with the link can update — RLS allows this)
    if (route?.id) {
      await supabase.from('shared_routes').update({ visited: next }).eq('id', route.id);
    }
  };

  const openInGoogleMaps = () => {
    if (!route || contacts.length === 0) return;
    const origin = `${route.start_lat},${route.start_lng}`;
    const last = contacts[contacts.length - 1];
    const destination = `${last.lat},${last.lng}`;
    const waypoints = contacts.slice(0, -1).map(c => `${c.lat},${c.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Cargando ruta...</div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-500" />
        <h1 className="text-xl font-bold mb-1">{error}</h1>
        <p className="text-sm text-muted-foreground">Pedile a quien te compartió un nuevo link.</p>
      </div>
    </div>
  );
  if (!route) return null;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <RouteIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Ruta compartida</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Expira el {new Date(route.expires_at).toLocaleDateString('es-AR')}. Marcá las visitas a medida que avanzás.
        </p>

        <div className="border rounded-lg p-4 bg-card mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            <div className="bg-muted/30 rounded px-3 py-2">
              <div className="text-muted-foreground">Distancia total</div>
              <div className="font-semibold text-base">{route.total_meters ? (route.total_meters / 1000).toFixed(1) : '—'} km</div>
            </div>
            <div className="bg-muted/30 rounded px-3 py-2">
              <div className="text-muted-foreground">Tiempo estimado</div>
              <div className="font-semibold text-base">{route.total_seconds ? formatDuration(route.total_seconds) : '—'}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={openInGoogleMaps} className="gap-2 w-full sm:w-auto">
            <ExternalLink className="h-3 w-3" /> Abrir en Google Maps
          </Button>
        </div>

        <div className="border rounded-lg p-4 bg-card mb-4">
          <h3 className="text-sm font-semibold mb-3">Paradas ({contacts.length})</h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[14px]">★</span>
              <span className="font-medium">Partida</span>
              <span className="text-muted-foreground truncate flex-1">— {route.start_address}</span>
            </div>
            {contacts.map((c, idx) => {
              const isVisited = !!visited[c.id];
              return (
                <div key={c.id} className={`flex items-center gap-2 text-xs p-2 rounded border ${isVisited ? 'opacity-60' : 'border-transparent'}`}>
                  <span className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[12px] ${isVisited ? 'bg-gray-500' : 'bg-primary'}`}>{idx + 1}</span>
                  <div className={`flex-1 min-w-0 ${isVisited ? 'line-through' : ''}`}>
                    <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                    <div className="text-muted-foreground truncate">{c.address}</div>
                  </div>
                  <button
                    onClick={() => toggleVisited(c.id)}
                    className={`text-[11px] px-3 py-1 rounded border whitespace-nowrap ${isVisited ? 'border-gray-500 text-gray-400' : 'border-green-500/40 text-green-400 hover:bg-green-500/10'}`}
                  >
                    {isVisited ? '✓ Visitado' : 'Marcar'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div ref={mapRef} className="w-full h-[400px] sm:h-[500px] rounded-lg border" />
      </div>
    </div>
  );
};

export default SharedRoutePage;
