"use client";

import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface Cell {
  id: string;
  name: string;
  address: string | null;
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
      const { data, error } = await supabase.from('cells').select('id, name, address, meeting_day, meeting_time, encargado_id').eq('church_id', churchId!);
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

  useEffect(() => {
    if (!cells || !mapRef.current || isLoading) return;
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

      const geocodeAll = cells.filter(c => c.address).map(async (cell) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cell.address!)},Argentina&format=json&limit=1`, { headers: { 'Accept-Language': 'es', 'User-Agent': 'MJA-CRM/1.0' } });
          const data = await res.json();
          if (data?.[0]) {
            const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
            const leader = cell.encargado_id ? (profilesMap?.[cell.encargado_id] || 'Sin referente') : 'Sin referente';
            const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';
            L.marker([lat, lng], { icon: goldIcon }).addTo(map).bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:170px;"><div style="font-size:14px;font-weight:700;margin-bottom:4px;">${cell.name}</div><div style="font-size:12px;color:#555;">👤 ${leader}</div><div style="font-size:12px;color:#555;">🕐 ${schedule}</div><div style="font-size:11px;color:#777;">📍 ${cell.address}</div></div>`);
            return { lat, lng };
          }
        } catch { }
        return null;
      });

      Promise.all(geocodeAll).then((coords) => {
        const valid = coords.filter(Boolean) as { lat: number; lng: number }[];
        if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map(c => [c.lat, c.lng])), { padding: [50, 50] });
        else if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 15);
      });
    });
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [cells, profilesMap, isLoading]);

  const withAddr = (cells || []).filter(c => c.address).length;
  const withoutAddr = (cells || []).filter(c => !c.address).length;

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">Mapa de Células</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Cargando...' : `${withAddr} célula(s) en el mapa${withoutAddr > 0 ? ` · ${withoutAddr} sin dirección` : ''}`}
        </p>
      </div>
      {isLoading ? <Skeleton className="flex-1 rounded-lg" style={{ minHeight: 500 }} />
        : (cells || []).length === 0 ? <div className="flex-1 flex items-center justify-center text-muted-foreground">No hay células en esta iglesia.</div>
        : withAddr === 0 ? <div className="flex-1 flex items-center justify-center text-center text-muted-foreground"><div><p className="text-lg font-medium mb-2">Sin direcciones registradas</p><p className="text-sm">Agrega una dirección a tus células para verlas en el mapa.</p></div></div>
        : <div ref={mapRef} className="flex-1 rounded-xl overflow-hidden border" style={{ minHeight: '500px' }} />}
    </div>
  );
};

export default MapaPage;
