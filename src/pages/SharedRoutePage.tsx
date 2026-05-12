"use client";
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, Route as RouteIcon, AlertCircle, MessageCircle, Copy } from 'lucide-react';
import { showSuccess } from '@/utils/toast';

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
  const [notes, setNotes] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);
  const notesSaveTimer = useRef<any>(null);
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
      setNotes(data.notes || '');
      // Fetch the contacts in order
      const { data: cs } = await supabase.from('contacts')
        .select('id, first_name, last_name, address, lat, lng')
        .in('id', data.ordered_contact_ids);
      const orderMap = new Map<string, number>(
        (data.ordered_contact_ids as string[]).map((id, i) => [id, i] as [string, number])
      );
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
    if (route?.id) {
      await supabase.from('shared_routes').update({ visited: next }).eq('id', route.id);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (!route?.id) return;
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    setSavingNotes(true);
    notesSaveTimer.current = setTimeout(async () => {
      await supabase.from('shared_routes').update({ notes: value }).eq('id', route.id);
      setSavingNotes(false);
    }, 800);
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

  const shareWhatsApp = () => {
    const url = window.location.href;
    const text = `${route?.name || 'Ruta compartida'}: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    showSuccess('Link copiado');
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

  const visitedCount = contacts.filter(c => visited[c.id]).length;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <RouteIcon className="h-6 w-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{route.name || 'Ruta compartida'}</h1>
            <p className="text-[11px] text-muted-foreground">
              Expira el {new Date(route.expires_at).toLocaleDateString('es-AR')}
              {route.total_meters ? ` · ${(route.total_meters / 1000).toFixed(1)} km` : ''}
              {route.total_seconds ? ` · ${formatDuration(route.total_seconds)}` : ''}
              {contacts.length > 0 ? ` · ${visitedCount}/${contacts.length} visitadas` : ''}
            </p>
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={openInGoogleMaps} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Google Maps
            </Button>
            <Button size="sm" variant="outline" onClick={shareWhatsApp} className="gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </Button>
          </div>
        </div>

        {/* 3-column layout on desktop, stacks on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Stops */}
          <div className="lg:col-span-4 border rounded-lg p-4 bg-card flex flex-col min-h-0">
            <h3 className="text-sm font-semibold mb-3">Paradas ({contacts.length})</h3>
            <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[14px] shrink-0">★</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Partida</div>
                  <div className="text-muted-foreground truncate">{route.start_address}</div>
                </div>
              </div>
              {contacts.map((c, idx) => {
                const isVisited = !!visited[c.id];
                return (
                  <div key={c.id} className={`flex items-center gap-2 text-xs p-2 rounded border ${isVisited ? 'opacity-60 border-muted' : 'border-transparent hover:border-border'}`}>
                    <span className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[12px] shrink-0 ${isVisited ? 'bg-gray-500' : 'bg-primary'}`}>{idx + 1}</span>
                    <div className={`flex-1 min-w-0 ${isVisited ? 'line-through' : ''}`}>
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      <div className="text-muted-foreground truncate">{c.address}</div>
                    </div>
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
            <div ref={mapRef} className="w-full rounded-lg border" style={{ height: 'calc(100vh - 200px)', minHeight: 400 }} />
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
              Cualquiera con este link puede leer y editar.
            </p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Escribí acá observaciones, quién atendió, qué se habló, próximos pasos..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              style={{ minHeight: 'calc(100vh - 280px)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedRoutePage;
