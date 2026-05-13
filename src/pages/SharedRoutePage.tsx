"use client";
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, Route as RouteIcon, AlertCircle, MessageCircle, Copy, ChevronDown } from 'lucide-react';
import { showSuccess } from '@/utils/toast';
import { buildGoogleMapsChunks } from '@/lib/google-maps-urls';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

interface ContactNote {
  text: string;
  date: string; // YYYY-MM-DD
}

// Today in ART (Buenos Aires), formatted YYYY-MM-DD. Used as the
// fallback "fecha" on per-stop notes so the trigger doesn't have to
// guess. The viewer's clock isn't authoritative — the DB trigger
// also fills in a date when none is provided — but stamping the
// payload here keeps the optimistic UI honest.
const todayInART = () => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA gives YYYY-MM-DD natively
};

const SharedRoutePage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  // Per-stop notes. Replaces the old route-wide textarea. Auto-syncs to
  // contacts.observaciones via the DB trigger added in migration 0026.
  const [contactNotes, setContactNotes] = useState<Record<string, ContactNote>>({});
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const notesSaveTimers = useRef<Record<string, any>>({});
  // How many stops to render on the map's route line. Defaults to 'all'
  // but the user can collapse to the first N so overlapping legs don't
  // crowd the canvas. Pure display filter — the underlying contact
  // list and the Google Maps share links use every stop regardless.
  const [stopsLimit, setStopsLimit] = useState<number | 'all'>('all');
  // "Open in Google Maps" dropdown — when the route has more than ~10
  // stops we split into multiple chunked URLs and let the user pick.
  const [gmapsMenuOpen, setGmapsMenuOpen] = useState(false);
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
      setContactNotes(data.contact_notes || {});
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

  // Stops actually plotted on the route line. Respects `stopsLimit` so
  // the user can isolate the first N stops when the polyline overlaps.
  const stopsOnMap = useMemo(() => {
    if (stopsLimit === 'all') return contacts;
    return contacts.slice(0, stopsLimit);
  }, [contacts, stopsLimit]);

  // Render map + route
  useEffect(() => {
    if (!route || !mapRef.current || stopsOnMap.length === 0) return;
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

      // Google's Directions API also caps waypoints around 23. When the
      // user kept stopsLimit='all' and the route is huge, skip the
      // server-side directions request and just plot pins — the polyline
      // would fail anyway. Pins still let the user see the spread; the
      // chunked "Open in Google Maps" links handle the actual driving.
      const PLOT_LINE_LIMIT = 23;
      const stopsForLine = stopsOnMap.length > PLOT_LINE_LIMIT
        ? stopsOnMap.slice(0, PLOT_LINE_LIMIT)
        : stopsOnMap;

      if (stopsForLine.length >= 1) {
        const waypoints = stopsForLine.slice(0, -1).map(c => ({
          location: new google.maps.LatLng(c.lat!, c.lng!),
          stopover: true,
        }));
        const dest = stopsForLine[stopsForLine.length - 1];
        ds.route({
          origin: new google.maps.LatLng(Number(route.start_lat), Number(route.start_lng)),
          destination: new google.maps.LatLng(dest.lat!, dest.lng!),
          waypoints,
          optimizeWaypoints: false, // already ordered
          travelMode: google.maps.TravelMode.DRIVING,
          region: 'AR',
        }, (result: any, status: string) => {
          if (status === 'OK') dr.setDirections(result);
        });
      }

      // Custom numbered markers — always paint every stop in the
      // ordered contact list, even those beyond stopsForLine. That way
      // the user sees where the rest of the route lives even when the
      // polyline is collapsed to the first N.
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
        const isPlottedOnLine = idx < stopsForLine.length;
        customMarkers.current.push(new google.maps.Marker({
          position: { lat: c.lat!, lng: c.lng! },
          map: mapInstance.current,
          label: { text: String(idx + 1), color: 'white', fontSize: '13px', fontWeight: 'bold' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: isVisited ? '#6b7280' : (isPlottedOnLine ? '#FFC233' : '#9CA3AF'),
            fillOpacity: isVisited ? 0.6 : (isPlottedOnLine ? 1 : 0.5),
            strokeColor: 'white',
            strokeWeight: 2,
          },
          title: `${idx + 1}. ${c.first_name} ${c.last_name || ''}`,
        }));
      });
    };
    tryRender();
  }, [route, contacts, visited, stopsOnMap]);

  const toggleVisited = async (contactId: string) => {
    const next = { ...visited, [contactId]: !visited[contactId] };
    if (!next[contactId]) delete next[contactId];
    setVisited(next);
    if (route?.id) {
      await supabase.from('shared_routes').update({ visited: next }).eq('id', route.id);
    }
  };

  // Per-stop note save: debounced 800ms per contact so typing doesn't
  // hammer the DB. The DB trigger syncs the value into
  // contacts.observaciones with a "[Ruta <short> · YYYY-MM-DD]" prefix,
  // and re-saving the same contact's note replaces that line in-place
  // (no duplicates).
  const handleContactNoteChange = (contactId: string, value: string) => {
    const date = contactNotes[contactId]?.date || todayInART();
    const nextEntry: ContactNote = { text: value, date };
    const nextAll = { ...contactNotes, [contactId]: nextEntry };
    if (!value.trim()) {
      // Empty text — drop the entry entirely. The trigger detects the
      // removal and clears the line from observaciones too.
      delete nextAll[contactId];
    }
    setContactNotes(nextAll);
    if (!route?.id) return;
    if (notesSaveTimers.current[contactId]) clearTimeout(notesSaveTimers.current[contactId]);
    setSavingContactId(contactId);
    notesSaveTimers.current[contactId] = setTimeout(async () => {
      await supabase.from('shared_routes').update({ contact_notes: nextAll }).eq('id', route.id);
      setSavingContactId(curr => (curr === contactId ? null : curr));
    }, 800);
  };

  // Chunked Google Maps URLs. With >10 stops the web URL refuses to
  // build a single route, so we hand the user one link per chunk. The
  // chunks overlap by one point — last stop of part N is the first
  // stop of part N+1 — so following them in order traces the full
  // route without gaps.
  const gmapsUrls = useMemo(() => {
    if (!route || contacts.length === 0) return [];
    const allStops = [
      { lat: Number(route.start_lat), lng: Number(route.start_lng) },
      ...contacts.map(c => ({ lat: c.lat!, lng: c.lng! })),
    ];
    return buildGoogleMapsChunks(allStops);
  }, [route, contacts]);

  const openGmapsUrl = (idx: number) => {
    const url = gmapsUrls[idx];
    if (!url) return;
    window.open(url, '_blank');
    setGmapsMenuOpen(false);
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
  const hasMultipleParts = gmapsUrls.length > 1;

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
            {/* Google Maps — single link when short, dropdown of parts
                when the route exceeds 10 stops and we had to chunk. */}
            {hasMultipleParts ? (
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
            <Button size="sm" variant="outline" onClick={shareWhatsApp} className="gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </Button>
          </div>
        </div>

        {/* Display filter: how many stops to plot on the map line.
            The chunked GMaps links and the paradas list always show
            everything — this is purely about the polyline. */}
        {contacts.length > 3 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Mostrar en el mapa:</span>
            {([3, 5, 10, 'all'] as const).map(opt => (
              <button
                key={String(opt)}
                onClick={() => setStopsLimit(opt)}
                className={`px-2.5 py-0.5 rounded-full border transition-colors ${
                  stopsLimit === opt
                    ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt === 'all' ? `Todas (${contacts.length})` : `Primeras ${opt}`}
              </button>
            ))}
          </div>
        )}

        {/* 2-column layout: stops (with per-stop notes) on the left,
            map on the right. The old separate "Notas compartidas"
            column was removed — notes now live inline with each stop. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Stops */}
          <div className="lg:col-span-5 border rounded-lg p-4 bg-card flex flex-col min-h-0">
            <h3 className="text-sm font-semibold mb-3">Paradas ({contacts.length})</h3>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-[14px] shrink-0">★</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Partida</div>
                  <div className="text-muted-foreground truncate">{route.start_address}</div>
                </div>
              </div>
              {contacts.map((c, idx) => {
                const isVisited = !!visited[c.id];
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
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
                        <span>
                          {savingContactId === c.id
                            ? 'Guardando…'
                            : note
                              ? 'Sincroniza al perfil del contacto'
                              : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map */}
          <div className="lg:col-span-7">
            <div ref={mapRef} className="w-full rounded-lg border" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedRoutePage;
