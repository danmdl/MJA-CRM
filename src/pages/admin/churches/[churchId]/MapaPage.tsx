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

const MapaPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const { data: cells, isLoading } = useQuery<Cell[]>({
    queryKey: ['cells-map', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name, address, meeting_day, meeting_time, encargado_id')
        .eq('church_id', churchId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!churchId,
  });

  const { data: profilesMap } = useQuery<Record<string, string>>({
    queryKey: ['profilesMap', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('church_id', churchId!);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Sin nombre';
      });
      return map;
    },
    enabled: !!churchId,
  });

  useEffect(() => {
    if (!cells || !mapRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Destroy existing map if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Default to Buenos Aires
      const map = L.map(mapRef.current!).setView([-34.6037, -58.3816], 12);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Gold custom icon
      const goldIcon = L.divIcon({
        className: '',
        html: `<div style="
          background: linear-gradient(160deg, #FFE07A 0%, #FFC233 45%, #B8720A 100%);
          border: 2px solid #B8720A;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          width: 28px; height: 28px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
        ">
          <span style="transform: rotate(45deg); font-size: 13px;">⛪</span>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -30],
      });

      const geocodePromises = cells
        .filter(c => c.address)
        .map(async (cell) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cell.address!)}&format=json&limit=1`,
              { headers: { 'Accept-Language': 'es' } }
            );
            const data = await res.json();
            if (data && data[0]) {
              const lat = parseFloat(data[0].lat);
              const lng = parseFloat(data[0].lon);
              const leaderName = cell.encargado_id ? (profilesMap?.[cell.encargado_id] || 'Sin referente') : 'Sin referente';
              const schedule = [cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ') || 'Sin horario';

              const marker = L.marker([lat, lng], { icon: goldIcon }).addTo(map);
              marker.bindPopup(`
                <div style="min-width: 160px; font-family: 'Geist', sans-serif;">
                  <strong style="font-size: 14px;">${cell.name}</strong><br/>
                  <span style="color: #666; font-size: 12px;">👤 ${leaderName}</span><br/>
                  <span style="color: #666; font-size: 12px;">🕐 ${schedule}</span><br/>
                  <span style="color: #666; font-size: 11px;">📍 ${cell.address}</span>
                </div>
              `);
              return { lat, lng };
            }
          } catch {
            // geocoding failed for this cell
          }
          return null;
        });

      Promise.all(geocodePromises).then((coords) => {
        const valid = coords.filter(Boolean) as { lat: number; lng: number }[];
        if (valid.length > 0) {
          const bounds = L.latLngBounds(valid.map(c => [c.lat, c.lng]));
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      });

      // Cells without address — show a notice
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [cells, profilesMap]);

  const cellsWithAddress = (cells || []).filter(c => c.address).length;
  const cellsWithoutAddress = (cells || []).filter(c => !c.address).length;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mapa de Células</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cellsWithAddress} célula(s) en el mapa
            {cellsWithoutAddress > 0 && ` · ${cellsWithoutAddress} sin dirección`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="flex-1 rounded-lg" />
      ) : (cells || []).length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No hay células creadas en esta iglesia.
        </div>
      ) : cellsWithAddress === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-center">
          <div>
            <p className="text-lg font-medium mb-2">Sin direcciones registradas</p>
            <p className="text-sm">Agrega una dirección a tus células para verlas en el mapa.</p>
          </div>
        </div>
      ) : (
        <div
          ref={mapRef}
          className="flex-1 rounded-xl overflow-hidden border"
          style={{ minHeight: '500px' }}
        />
      )}
    </div>
  );
};

export default MapaPage;
