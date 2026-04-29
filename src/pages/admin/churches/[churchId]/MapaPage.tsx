"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Cell {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_day: string | null;
  meeting_time: string | null;
  leader_name: string | null;
  anfitrion_name: string | null;
  cuerda_numero: string | null;
}

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

const loadGoogleMaps = (): Promise<any> => {
  return new Promise((resolve) => {
    if ((window as any).google?.maps) { resolve((window as any).google.maps); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      const interval = setInterval(() => {
        if ((window as any).google?.maps) { clearInterval(interval); resolve((window as any).google.maps); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    document.head.appendChild(script);
  });
};

// Geocode a single address using Google Maps Geocoding API
// Gran Buenos Aires bounding box for validation
const GBA_BOUNDS = { latMin: -34.85, latMax: -34.25, lngMin: -58.85, lngMax: -58.15 };

const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    // Add Buenos Aires bias to avoid geocoding "Tucumán 2590" to Tucumán province
    const biasedAddress = address.includes('Buenos Aires') ? address : `${address}, Buenos Aires, Argentina`;
    const bounds = `${GBA_BOUNDS.latMin},${GBA_BOUNDS.lngMin}|${GBA_BOUNDS.latMax},${GBA_BOUNDS.lngMax}`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(biasedAddress)}&bounds=${bounds}&region=ar&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const { lat, lng } = data.results[0].geometry.location;
      // Validate: must be within Gran Buenos Aires area
      if (lat >= GBA_BOUNDS.latMin && lat <= GBA_BOUNDS.latMax && lng >= GBA_BOUNDS.lngMin && lng <= GBA_BOUNDS.lngMax) {
        return { lat, lng };
      }
      console.warn(`Geocode out of GBA bounds: "${address}" → ${lat}, ${lng}`);
      return null; // Outside GBA — likely wrong match
    }
  } catch (e) {
    console.error('Geocode error:', e);
  }
  return null;
};

const MapaPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const queryClient = useQueryClient();
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });

  const { data: cells, isLoading } = useQuery<Cell[]>({
    queryKey: ['cells-map', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name, address, lat, lng, meeting_day, meeting_time, leader_name, anfitrion_name, cuerda_id, cuerdas(numero)')
        .eq('church_id', churchId!)
        .is('deleted_at', null);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        cuerda_numero: c.cuerdas?.numero ?? null,
      }));
    },
    enabled: !!churchId,
  });

  // Distinct cuerdas for filter checkboxes
  const availableCuerdas = React.useMemo(() => {
    const nums = new Set<string>();
    (cells || []).forEach(c => { if (c.cuerda_numero) nums.add(c.cuerda_numero); });
    return Array.from(nums).sort((a, b) => Number(a) - Number(b));
  }, [cells]);

  // Which cuerdas are visible — starts with all selected
  const [visibleCuerdas, setVisibleCuerdas] = useState<Set<string> | null>(null);
  // Initialize once when cuerdas data loads
  React.useEffect(() => {
    if (availableCuerdas.length > 0 && visibleCuerdas === null) {
      setVisibleCuerdas(new Set(availableCuerdas));
    }
  }, [availableCuerdas]);

  const toggleCuerda = (num: string) => {
    setVisibleCuerdas(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  const toggleAllCuerdas = (on: boolean) => {
    setVisibleCuerdas(on ? new Set(availableCuerdas) : new Set());
  };

  const allMappable = (cells || []).filter(c => c.lat && c.lng);
  const mappableCells = allMappable.filter(c =>
    !c.cuerda_numero || !visibleCuerdas || visibleCuerdas.has(c.cuerda_numero)
  );
  const needsGeocode = (cells || []).filter(c => c.address && (!c.lat || !c.lng));
  const noAddress = (cells || []).filter(c => !c.address);

  const [geocodeFailed, setGeocodeFailed] = useState<string[]>([]);

  // Auto-geocode cells that have address but no coordinates
  const runGeocode = async () => {
    if (needsGeocode.length === 0) return;
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: needsGeocode.length });
    const failed: string[] = [];

    for (let i = 0; i < needsGeocode.length; i++) {
      const cell = needsGeocode[i];
      const coords = await geocodeAddress(cell.address!);
      if (coords) {
        await supabase.from('cells').update({ lat: coords.lat, lng: coords.lng }).eq('id', cell.id);
      } else {
        failed.push(`${cell.name} — "${cell.address}"`);
      }
      setGeocodeProgress({ done: i + 1, total: needsGeocode.length });
      if (i < needsGeocode.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    setGeocodeFailed(failed);
    setGeocoding(false);
    queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
  };

  // Auto-run geocode on first load if needed
  useEffect(() => {
    if (!isLoading && needsGeocode.length > 0 && !geocoding) {
      runGeocode();
    }
  }, [isLoading, cells?.length]);

  // Stable key for the set of visible cells so the map re-renders on filter changes
  const mappableCellIds = mappableCells.map(c => c.id).join(',');

  useEffect(() => {
    if (!mappableCells.length || !mapRef.current || isLoading || geocoding) return;

    const initMap = async () => {
      const gmaps = await loadGoogleMaps();

      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        mapRef.current!.innerHTML = '';
      }

      const center = { lat: mappableCells[0].lat!, lng: mappableCells[0].lng! };
      const map = new gmaps.Map(mapRef.current, {
        center,
        zoom: 13,
        mapTypeId: 'roadmap',
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#b0b0b0' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
          { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
          { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
          { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      });
      mapInstanceRef.current = map;

      const bounds = new gmaps.LatLngBounds();
      const infoWindow = new gmaps.InfoWindow();

      mappableCells.forEach(cell => {
        const leader = cell.leader_name || 'Sin líder';
        const anfitrion = cell.anfitrion_name || '';
        const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';
        const cuerdaLabel = cell.cuerda_numero ? `Cuerda ${cell.cuerda_numero}` : '';
        const pos = { lat: cell.lat!, lng: cell.lng! };

        const markerIcon = {
          path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
          fillColor: '#FFC233',
          fillOpacity: 1,
          strokeColor: '#B8720A',
          strokeWeight: 1.5,
          scale: 1.6,
          anchor: new gmaps.Point(12, 24),
        };

        const marker = new gmaps.Marker({
          position: pos,
          map,
          icon: markerIcon,
          title: cell.name,
        });

        marker.addListener('click', () => {
          infoWindow.setContent(`
            <div style="font-family:system-ui,sans-serif;min-width:200px;padding:4px 0;color:#111;">
              <div style="font-size:15px;font-weight:700;margin-bottom:5px;">${cell.name}</div>
              ${cuerdaLabel ? `<div style="font-size:12px;color:#555;margin-bottom:2px;">🎵 ${cuerdaLabel}</div>` : ''}
              <div style="font-size:12px;color:#555;margin-bottom:2px;">👤 Líder: ${leader}</div>
              ${anfitrion ? `<div style="font-size:12px;color:#555;margin-bottom:2px;">🏠 Anfitrión: ${anfitrion}</div>` : ''}
              <div style="font-size:12px;color:#555;margin-bottom:2px;">🕐 ${schedule}</div>
              ${cell.address ? `<div style="font-size:11px;color:#777;margin-top:4px;">📍 ${cell.address}</div>` : ''}
            </div>
          `);
          infoWindow.open(map, marker);
        });

        bounds.extend(pos);
      });

      if (mappableCells.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }
    };

    initMap();
  }, [mappableCellIds, isLoading, geocoding]);

  return (
    <div className="h-full flex flex-col gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Mapa de Células</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Cargando...' : geocoding
            ? `Geocodificando direcciones... ${geocodeProgress.done}/${geocodeProgress.total}`
            : `${mappableCells.length} célula(s) en el mapa${noAddress.length > 0 ? ` · ${noAddress.length} sin dirección` : ''}`
          }
        </p>
      </div>

      {/* Cuerda filter */}
      {!isLoading && !geocoding && availableCuerdas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Cuerdas:</span>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => toggleAllCuerdas(visibleCuerdas?.size !== availableCuerdas.length)}
          >
            {visibleCuerdas?.size === availableCuerdas.length ? 'Ninguna' : 'Todas'}
          </button>
          {availableCuerdas.map(num => (
            <label key={num} className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input h-3.5 w-3.5"
                checked={visibleCuerdas?.has(num) ?? true}
                onChange={() => toggleCuerda(num)}
              />
              <span className="text-xs font-medium">{num}</span>
            </label>
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            ({mappableCells.length}/{allMappable.length} en mapa)
          </span>
        </div>
      )}

      {geocoding && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm text-blue-400">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Convirtiendo direcciones en coordenadas para el mapa... {geocodeProgress.done}/{geocodeProgress.total}</span>
        </div>
      )}

      {!isLoading && !geocoding && noAddress.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p>{noAddress.length} célula(s) sin dirección — no aparecen en el mapa:</p>
            {noAddress.map((c: any) => <p key={c.id} className="text-xs mt-0.5">• {c.name || `Célula ${c.id.slice(0,6)}`}</p>)}
          </div>
        </div>
      )}

      {!isLoading && !geocoding && geocodeFailed.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{geocodeFailed.length} dirección(es) no se pudieron ubicar en el mapa (fuera de Buenos Aires o dirección inválida):</p>
            {geocodeFailed.map((f, i) => <p key={i} className="text-xs mt-0.5">{f}</p>)}
          </div>
        </div>
      )}

      {isLoading || geocoding ? (
        <div className="flex-1 flex items-center justify-center" style={{ minHeight: 400 }}>
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">{geocoding ? `Geocodificando ${geocodeProgress.done}/${geocodeProgress.total}...` : 'Cargando mapa...'}</p>
          </div>
        </div>
      ) : (cells || []).length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">No hay células en esta iglesia.</div>
      ) : mappableCells.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium mb-2">Sin coordenadas registradas</p>
            <p className="text-sm">Las células no tienen direcciones válidas para mostrar en el mapa.</p>
          </div>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1 rounded-xl overflow-hidden border" style={{ minHeight: '400px' }} />
      )}
    </div>
  );
};

export default MapaPage;
