"use client";
import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';

interface Cell {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_day: string | null;
  meeting_time: string | null;
  encargado_id: string | null;
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

const MapaPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const { data: cells, isLoading } = useQuery<Cell[]>({
    queryKey: ['cells-map', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name, address, lat, lng, meeting_day, meeting_time, encargado_id')
        .eq('church_id', churchId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!churchId,
  });

  const { data: profilesMap } = useQuery<Record<string, string>>({
    queryKey: ['profilesMap', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name, email').eq('church_id', churchId!);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Sin nombre'; });
      return map;
    },
    enabled: !!churchId,
  });

  const mappableCells = (cells || []).filter(c => c.lat && c.lng);
  const noCoordCells = (cells || []).filter(c => !c.lat || !c.lng);

  useEffect(() => {
    if (!mappableCells.length || !mapRef.current || isLoading) return;

    const initMap = async () => {
      const gmaps = await loadGoogleMaps();

      // Destroy previous map
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        mapRef.current!.innerHTML = '';
      }

      // Center on first cell
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
        const leader = cell.encargado_id ? (profilesMap?.[cell.encargado_id] || 'Sin referente') : 'Sin referente';
        const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';
        const pos = { lat: cell.lat!, lng: cell.lng! };

        // Gold SVG pin
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
            <div style="font-family:system-ui,sans-serif;min-width:180px;padding:4px 0;color:#111;">
              <div style="font-size:15px;font-weight:700;margin-bottom:5px;">${cell.name}</div>
              <div style="font-size:12px;color:#555;margin-bottom:2px;">👤 ${leader}</div>
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
  }, [mappableCells.length, profilesMap, isLoading]);

  return (
    <div className="h-full flex flex-col gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Mapa de Células</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Cargando...' : `${mappableCells.length} célula(s) en el mapa${noCoordCells.length > 0 ? ` · ${noCoordCells.length} sin dirección` : ''}`}
        </p>
      </div>

      {!isLoading && noCoordCells.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>{noCoordCells.map(c => c.name).join(', ')}</strong> no tiene{noCoordCells.length > 1 ? 'n' : ''} coordenadas. Edita y selecciona una dirección del autocompletado.
          </span>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="flex-1 rounded-lg" style={{ minHeight: 400 }} />
      ) : (cells || []).length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">No hay células en esta iglesia.</div>
      ) : mappableCells.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium mb-2">Sin coordenadas registradas</p>
            <p className="text-sm">Edita tus células y selecciona una dirección del autocompletado.</p>
          </div>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1 rounded-xl overflow-hidden border" style={{ minHeight: '400px' }} />
      )}
    </div>
  );
};

export default MapaPage;
