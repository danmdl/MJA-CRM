"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CellDetailsDialog from '@/components/admin/CellDetailsDialog';
import { buildGeocodeAddress } from '@/lib/geocode-address';

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    document.head.appendChild(script);
  });
};

// Geocode a single address using Google Maps Geocoding API
// Gran Buenos Aires bounding box for validation
const GBA_BOUNDS = { latMin: -34.85, latMax: -34.25, lngMin: -58.85, lngMax: -58.15 };

const geocodeAddress = async (
  address: string,
  churchAddress?: string | null,
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // Bias the geocode toward the church's locality (e.g. "General San
    // Martin") instead of falling back to "Buenos Aires" — the latter
    // gets read as CABA by Google and sends ambiguous street names to
    // Capital. See src/lib/geocode-address.ts. The GBA bounds and
    // region=ar params below stay as additional bias layers.
    const biasedAddress = buildGeocodeAddress(address, churchAddress);
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
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

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

  // Church address — used to bias every geocode call we make from this
  // page toward the church's locality. Without this, "Mendoza 407"
  // resolves to a Mendoza street in CABA instead of in San Martín
  // where MJA Central actually is. Loaded once per session.
  const { data: church } = useQuery<{ address: string | null } | null>({
    queryKey: ['church-address', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('address').eq('id', churchId!).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 60 * 60_000,
  });

  // Count contacts assigned to each cell for the popup
  const { data: cellContactCounts } = useQuery<Record<string, number>>({
    queryKey: ['cell-contact-counts', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('cell_id')
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .not('cell_id', 'is', null);
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => { if (c.cell_id) counts[c.cell_id] = (counts[c.cell_id] || 0) + 1; });
      return counts;
    },
    enabled: !!churchId,
    staleTime: 60_000,
  });
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

  const [geocodeFailed, setGeocodeFailed] = useState<string[]>([]);

  // Auto-geocode cells that have address but no coordinates
  const runGeocode = async () => {
    if (needsGeocode.length === 0) return;
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: needsGeocode.length });
    const failed: string[] = [];

    for (let i = 0; i < needsGeocode.length; i++) {
      const cell = needsGeocode[i];
      const coords = await geocodeAddress(cell.address!, church?.address);
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

  // Stable key that changes when ANY cell's position changes, not just the set of IDs
  const mappableCellKey = mappableCells.map(c => `${c.id}:${c.lat}:${c.lng}`).join(',');

  // Distinct colors for each cuerda
  const CUERDA_COLORS = [
    { fill: '#3b82f6', stroke: '#1d4ed8' }, // blue
    { fill: '#ef4444', stroke: '#b91c1c' }, // red
    { fill: '#10b981', stroke: '#047857' }, // green
    { fill: '#f59e0b', stroke: '#b45309' }, // amber
    { fill: '#8b5cf6', stroke: '#6d28d9' }, // purple
    { fill: '#ec4899', stroke: '#be185d' }, // pink
    { fill: '#06b6d4', stroke: '#0e7490' }, // cyan
    { fill: '#f97316', stroke: '#c2410c' }, // orange
    { fill: '#14b8a6', stroke: '#0f766e' }, // teal
    { fill: '#a855f7', stroke: '#7e22ce' }, // violet
  ];
  const cuerdaColorMap = React.useMemo(() => {
    const map = new Map<string, typeof CUERDA_COLORS[0]>();
    availableCuerdas.forEach((num, i) => {
      map.set(num, CUERDA_COLORS[i % CUERDA_COLORS.length]);
    });
    return map;
  }, [availableCuerdas]);

  useEffect(() => {
    if (!mapRef.current || isLoading || geocoding) return;

    // If no cells to show (e.g. "Ninguna" filter), clear the map
    if (!mappableCells.length) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        mapRef.current!.innerHTML = '';
      }
      return;
    }

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

      // Global callback for info window "Ver detalles" button
      (window as any).__openCellDetails = (cellId: string) => {
        setSelectedCellId(cellId);
      };

      mappableCells.forEach(cell => {
        const leader = cell.leader_name || 'Sin líder';
        const anfitrion = cell.anfitrion_name || '';
        const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';
        const cuerdaLabel = cell.cuerda_numero ? `Cuerda ${cell.cuerda_numero}` : '';
        const pos = { lat: cell.lat!, lng: cell.lng! };
        const contactCount = cellContactCounts?.[cell.id] || 0;

        // Color by cuerda, fallback to gold
        const colors = cell.cuerda_numero ? cuerdaColorMap.get(cell.cuerda_numero) : null;
        const fillColor = colors?.fill || '#FFC233';
        const strokeColor = colors?.stroke || '#B8720A';

        const markerIcon = {
          path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
          fillColor,
          fillOpacity: 1,
          strokeColor,
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
            <div style="font-family:system-ui,sans-serif;min-width:220px;padding:4px 0;color:#111;">
              <div style="font-size:15px;font-weight:700;margin-bottom:5px;">${cell.name}</div>
              ${cuerdaLabel ? `<div style="font-size:12px;color:#555;margin-bottom:2px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${fillColor};margin-right:4px;vertical-align:middle;"></span>${cuerdaLabel}</div>` : ''}
              <div style="font-size:12px;color:#555;margin-bottom:2px;">👤 Líder: ${leader}</div>
              ${anfitrion ? `<div style="font-size:12px;color:#555;margin-bottom:2px;">🏠 Anfitrión: ${anfitrion}</div>` : ''}
              <div style="font-size:12px;color:#555;margin-bottom:2px;">🕐 ${schedule}</div>
              <div style="font-size:12px;color:#555;margin-bottom:2px;">👥 ${contactCount} persona${contactCount !== 1 ? 's' : ''}</div>
              ${cell.address ? `<div style="font-size:11px;color:#777;margin-top:4px;">📍 ${cell.address}</div>` : ''}
              <div style="margin-top:8px;"><button onclick="window.__openCellDetails('${cell.id}')" style="background:#FFC233;color:#000;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;">Ver detalles</button></div>
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
  }, [mappableCellKey, isLoading, geocoding, cellContactCounts]);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Compact header. Title + count + cuerda chips all on the same row
          (wraps to a second line when chips don't fit). The 'Cuerdas' card
          and the 'sin dirección' banner that used to live here are gone —
          they ate vertical space without adding much over the chips. */}
      {!isLoading && !geocoding && availableCuerdas.length > 1 ? (() => {
        return (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap">Mapa</h1>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {mappableCells.length}/{allMappable.length} células
            </span>
            <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
              {availableCuerdas.map(num => {
                const colors = cuerdaColorMap.get(num);
                const isActive = visibleCuerdas?.has(num) ?? true;
                return (
                  <button
                    key={num}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-all ${isActive ? 'bg-muted/60 text-foreground' : 'opacity-30 text-muted-foreground'}`}
                    onClick={() => toggleCuerda(num)}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors?.fill || '#FFC233' }} />
                    {num}
                  </button>
                );
              })}
            </div>
            <button
              className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors text-muted-foreground whitespace-nowrap"
              onClick={() => toggleAllCuerdas(visibleCuerdas?.size !== availableCuerdas.length)}
            >
              {visibleCuerdas?.size === availableCuerdas.length ? 'Ninguna' : 'Todas'}
            </button>
          </div>
        );
      })() : (
        // Loading / geocoding state — just show the title row, no chips yet.
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold">Mapa</h1>
          <span className="text-xs text-muted-foreground">
            {isLoading ? 'Cargando...' : geocoding
              ? `Geocodificando... ${geocodeProgress.done}/${geocodeProgress.total}`
              : `${mappableCells.length} en el mapa`
            }
          </span>
        </div>
      )}

      {geocoding && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm text-blue-400">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Convirtiendo direcciones en coordenadas para el mapa... {geocodeProgress.done}/{geocodeProgress.total}</span>
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
            {allMappable.length > 0 ? (
              <>
                <p className="text-lg font-medium mb-2">Sin células seleccionadas</p>
                <p className="text-sm">Activá al menos una cuerda en el filtro de arriba para ver células en el mapa.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-2">Sin coordenadas registradas</p>
                <p className="text-sm">Las células no tienen direcciones válidas para mostrar en el mapa.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1 rounded-xl overflow-hidden border" style={{ minHeight: '400px' }} />
      )}

      {/* Cell details dialog — opens when clicking "Ver detalles" in a marker popup */}
      <CellDetailsDialog
        open={!!selectedCellId}
        onOpenChange={(o) => { if (!o) setSelectedCellId(null); }}
        churchId={churchId!}
        cellId={selectedCellId}
      />
    </div>
  );
};

export default MapaPage;
