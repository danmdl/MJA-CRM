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

const loadLeaflet = (): Promise<any> => {
  return new Promise((resolve) => {
    if ((window as any).L) { resolve((window as any).L); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve((window as any).L);
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

    loadLeaflet().then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

      const map = L.map(mapRef.current!).setView([-34.6037, -58.3816], 12);
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);

      const goldIcon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:38px;"><div style="width:32px;height:32px;background:linear-gradient(160deg,#FFE07A 0%,#FFC233 45%,#B8720A 100%);border:2px solid #B8720A;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:14px;">⛪</span></div></div>`,
        iconSize: [32, 38], iconAnchor: [16, 38], popupAnchor: [0, -38],
      });

      const bounds: [number, number][] = [];

      mappableCells.forEach(cell => {
        const leader = cell.encargado_id ? (profilesMap?.[cell.encargado_id] || 'Sin referente') : 'Sin referente';
        const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';
        const marker = L.marker([cell.lat!, cell.lng!], { icon: goldIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:170px;padding:2px 0;">
            <div style="font-size:14px;font-weight:700;margin-bottom:5px;">${cell.name}</div>
            <div style="font-size:12px;color:#555;margin-bottom:2px;">👤 ${leader}</div>
            <div style="font-size:12px;color:#555;margin-bottom:2px;">🕐 ${schedule}</div>
            ${cell.address ? `<div style="font-size:11px;color:#777;margin-top:4px;">📍 ${cell.address}</div>` : ''}
          </div>
        `);
        bounds.push([cell.lat!, cell.lng!]);
      });

      if (bounds.length === 1) map.setView(bounds[0], 15);
      else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    });

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [mappableCells.length, profilesMap, isLoading]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">Mapa de Células</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Cargando...' : `${mappableCells.length} célula(s) en el mapa${noCoordCells.length > 0 ? ` · ${noCoordCells.length} sin dirección` : ''}`}
        </p>
      </div>

      {/* Cells without coords — prompt to edit them */}
      {!isLoading && noCoordCells.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>{noCoordCells.map(c => c.name).join(', ')}</strong> no tiene{noCoordCells.length > 1 ? 'n' : ''} dirección con coordenadas.
            Edita {noCoordCells.length > 1 ? 'esas células' : 'esa célula'} y selecciona una dirección del autocompletado para que aparezca{noCoordCells.length > 1 ? 'n' : ''} en el mapa.
          </span>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="flex-1 rounded-lg" style={{ minHeight: 500 }} />
      ) : (cells || []).length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">No hay células en esta iglesia.</div>
      ) : mappableCells.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium mb-2">Sin coordenadas registradas</p>
            <p className="text-sm">Edita tus células y selecciona una dirección del autocompletado para verlas aquí.</p>
          </div>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1 rounded-xl overflow-hidden border" style={{ minHeight: '500px' }} />
      )}
    </div>
  );
};

export default MapaPage;
