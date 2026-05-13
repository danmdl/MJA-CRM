"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Trash2, Pencil, Eye, AlertCircle } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { geoJsonToGooglePaths, googlePathsToGeoJson, isPointInTerritory } from '@/lib/territory-utils';
import { loadGoogleMaps } from '@/lib/google-maps';

interface CuerdaWithTerritory {
  id: string;
  numero: string;
  zona_id: string;
  is_church_cuerda: boolean | null;
  // territory comes back from supabase as GeoJSON string when we
  // SELECT ST_AsGeoJSON(territory). When the column is NULL it's null.
  territory_geojson: string | null;
}

interface Cell {
  id: string;
  name: string;
  cuerda_id: string;
  lat: number | null;
  lng: number | null;
}

// Per-cuerda colors. We cycle through a curated palette; cuerdas with
// the same numero get the same hue across renders. The active (being
// edited) cuerda is rendered solid; everyone else is rendered as a
// translucent outline so the user can see overlaps without colors
// fighting for attention.
const CUERDA_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#f43f5e', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7',
];

function colorForCuerda(numero: string): string {
  // Stable hash so the same cuerda always gets the same color.
  let h = 0;
  for (let i = 0; i < numero.length; i++) h = (h * 31 + numero.charCodeAt(i)) | 0;
  return CUERDA_PALETTE[Math.abs(h) % CUERDA_PALETTE.length];
}

const TerritoriosPage: React.FC = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  // Active polygon currently being edited. There can only be ONE at
  // a time — the polygon for the cuerda the user picked.
  const editingPolygonRef = useRef<any>(null);
  // Read-only polygons for OTHER cuerdas (the user can see them for
  // reference but not modify). Indexed by cuerda numero so we can
  // remove + add as needed.
  const readonlyPolygonsRef = useRef<Map<string, any>>(new Map());
  // Label markers — one per polygon, showing the cuerda numero centred on
  // the territory. Rebuilt in lockstep with the polygons.
  const labelMarkersRef = useRef<any[]>([]);
  // Cell markers — small dots so the user knows where their cells
  // sit relative to the territory they're drawing.
  const cellMarkersRef = useRef<any[]>([]);
  const contactMarkersRef = useRef<any[]>([]);
  // ── Tap-to-draw mode ──
  // Instead of Google's DrawingManager (which makes you tap the FIRST
  // vertex again to close — borderline impossible on mobile), we
  // implement our own simple flow: enter draw mode, tap to add
  // vertices, click 'Cerrar polígono' to finalize. Dan's words:
  // 'sería bueno que sea fácil cerrar el polígono.'
  const [isDrawing, setIsDrawing] = useState(false);
  // vertexCount mirrors drawingVerticesRef.current.length but as state
  // so the help banner ('N puntos agregados') and the undo button's
  // disabled state actually re-render on each tap. The ref is the
  // source of truth for the data; this is purely UI sync.
  const [vertexCount, setVertexCount] = useState(0);
  const drawingVerticesRef = useRef<{ lat: number; lng: number }[]>([]);
  // Visual aids during drawing:
  //   - drawingMarkersRef holds the small numbered dots at each tap
  //   - drawingPreviewLineRef is the open polyline connecting them so
  //     the user sees what they're drawing as they go
  const drawingMarkersRef = useRef<any[]>([]);
  const drawingPreviewLineRef = useRef<any>(null);
  const tapListenerRef = useRef<any>(null);

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showCells, setShowCells] = useState(false);
  const [showContacts, setShowContacts] = useState(true);
  // "Solo mi zona" — hides every other cuerda's polygon overlay.
  // Useful when two cuerdas (e.g. men/women) share territory and the
  // overlapping fills make it hard to see which one is yours.
  const [onlyMyZone, setOnlyMyZone] = useState(false);
  const [selectedCuerdaNumero, setSelectedCuerdaNumero] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Privileged roles see the whole iglesia's cuerdas in the picker.
  // Everyone else (referente, conector, encargado_de_celula, anfitrion,
  // consolidador) is locked to their own cuerda — they have no business
  // viewing another cuerda's territorio. Source of truth for the
  // dropdown render below and the auto-selection effect on mount.
  const isPrivilegedRole = !!profile && (
    profile.role === 'admin'
    || profile.role === 'general'
    || profile.role === 'pastor'
    || profile.role === 'supervisor'
  );

  // ─── Load data ───────────────────────────────────────────────────
  const { data: zonas } = useQuery<{ id: string }[]>({
    queryKey: ['zonas-territorios', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: cuerdas, isLoading: cuerdasLoading } = useQuery<CuerdaWithTerritory[]>({
    queryKey: ['cuerdas-territorios', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      // Read from the view that exposes territory as a GeoJSON
      // string (territory_geojson column). Plain `cuerdas` table
      // can't be SELECTed with the geography column via supabase-js
      // without manual casting.
      const { data, error } = await supabase
        .from('cuerdas_with_geojson')
        .select('id, numero, zona_id, is_church_cuerda, territory_geojson')
        .in('zona_id', zonas.map(z => z.id));
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!zonas?.length,
    staleTime: 60_000,
  });

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells-territorios', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cells')
        .select('id, name, cuerda_id, lat, lng')
        .eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 60_000,
  });

  // Contacts for the SELECTED cuerda only — shown as pins on the map
  const { data: contacts } = useQuery<{ id: string; first_name: string; last_name: string | null; lat: number | null; lng: number | null; numero_cuerda: string | null }[]>({
    queryKey: ['contacts-territorios', churchId, selectedCuerdaNumero],
    queryFn: async () => {
      if (!selectedCuerdaNumero) return [];
      const PAGE = 1000;
      const all: any[] = [];
      for (let p = 0; ; p++) {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, lat, lng, numero_cuerda')
          .eq('church_id', churchId!)
          .eq('numero_cuerda', selectedCuerdaNumero)
          .is('deleted_at', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('id')
          .range(p * PAGE, (p + 1) * PAGE - 1);
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
    enabled: !!churchId && !!selectedCuerdaNumero && showContacts,
    staleTime: 60_000,
  });

  const { data: church } = useQuery<{ lat: number | null; lng: number | null; address: string | null; name: string | null }>({
    queryKey: ['church-territorios', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('lat, lng, address, name').eq('id', churchId!).single();
      return data || { lat: null, lng: null, address: null, name: null };
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // ─── Permissions ────────────────────────────────────────────────
  // Per Dan: 'admin/general/pastor cualquier cuerda; referente solo
  // la suya. Sí puede ver los polígonos de otras cuerdas pero no
  // editarla de nadie más.'
  const canEditCuerda = (cuerda: CuerdaWithTerritory): boolean => {
    if (!profile) return false;
    if (cuerda.is_church_cuerda) return false; // hard rule everywhere
    if (profile.role === 'admin' || profile.role === 'general') return true;
    if (profile.role === 'pastor') return true; // pastor scoped to their iglesia by sidebar/route already
    if (profile.role === 'referente') {
      return profile.numero_cuerda === cuerda.numero;
    }
    return false;
  };

  const editableCuerdas = useMemo(
    () => (cuerdas || []).filter(c => !c.is_church_cuerda && canEditCuerda(c)),
    [cuerdas, profile?.role, profile?.numero_cuerda],
  );

  // Default selection on mount: the user's own cuerda if they have
  // one, otherwise the first editable. If they have nothing editable
  // (rare — wrong role for this page), leave empty.
  useEffect(() => {
    if (selectedCuerdaNumero) return;
    if (!editableCuerdas.length) return;
    const own = profile?.numero_cuerda
      ? editableCuerdas.find(c => c.numero === profile.numero_cuerda)
      : null;
    setSelectedCuerdaNumero((own || editableCuerdas[0]).numero);
  }, [editableCuerdas, profile?.numero_cuerda, selectedCuerdaNumero]);

  const selectedCuerda = useMemo(
    () => (cuerdas || []).find(c => c.numero === selectedCuerdaNumero) || null,
    [cuerdas, selectedCuerdaNumero],
  );

  // ─── Map init ────────────────────────────────────────────────────
  // This component is kept mounted even when its tab is inactive
  // (display:none) so Google Maps state is preserved across tab
  // switches. The problem: when mounted hidden, the container has
  // 0×0 size and Google Maps can't initialize. Previous attempts
  // polled 20 times over 2s and gave up — causing the black map.
  //
  // Fix: load the script eagerly, but defer map creation until a
  // ResizeObserver detects the container has non-zero size (i.e.
  // the user switched to the Delineación tab). The same observer
  // also fires resize on the map when the container changes size
  // after creation (orientation change, etc).
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled) return;
      setMapsLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;
    const el = mapRef.current;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      if (!mapInstanceRef.current) {
        // First time the container is visible — create the map.
        const center = church?.lat && church?.lng
          ? { lat: church.lat, lng: church.lng }
          : { lat: -34.5824, lng: -58.5401 };
        try {
          mapInstanceRef.current = new g.maps.Map(el, {
            center,
            zoom: 14,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            disableDoubleClickZoom: true,
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
              { featureType: 'poi.park', stylers: [{ visibility: 'simplified' }] },
              { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
              { featureType: 'landscape', stylers: [{ saturation: -30 }] },
              { featureType: 'water', stylers: [{ saturation: -30 }] },
            ],
          });
        } catch (err) {
          console.error('[Territorios] Map() constructor threw', err);
          return;
        }
        // Nudge resize after creation so tiles fill the container.
        setTimeout(() => {
          if (!mapInstanceRef.current) return;
          const c = mapInstanceRef.current.getCenter();
          g.maps.event.trigger(mapInstanceRef.current, 'resize');
          if (c) mapInstanceRef.current.setCenter(c);
        }, 100);
        setMapReady(true);
      } else {
        // Container resized after map already exists (e.g. tab
        // re-shown, orientation change). Trigger resize so tiles
        // fill the new dimensions.
        const c = mapInstanceRef.current.getCenter();
        g.maps.event.trigger(mapInstanceRef.current, 'resize');
        if (c) mapInstanceRef.current.setCenter(c);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapsLoaded, church?.lat, church?.lng]);

  // Attach mvc listeners that mark the polygon dirty whenever the
  // user drags a vertex or inserts/removes one. We have to listen
  // on every path's 'set_at', 'insert_at', 'remove_at' events.
  const attachEditListeners = (polygon: any) => {
    const g = (window as any).google;
    const paths = polygon.getPaths();
    paths.forEach((path: any) => {
      g.maps.event.addListener(path, 'set_at', () => setHasUnsavedChanges(true));
      g.maps.event.addListener(path, 'insert_at', () => setHasUnsavedChanges(true));
      g.maps.event.addListener(path, 'remove_at', () => setHasUnsavedChanges(true));
    });
  };

  // ─── Render polygons whenever data or selection changes ──────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !cuerdas) return;
    const g = (window as any).google;

    // Tear down everything and rebuild. Cheaper than diffing for the
    // small number of cuerdas we have (~26 max). Avoids stale state.
    if (editingPolygonRef.current) {
      editingPolygonRef.current.setMap(null);
      editingPolygonRef.current = null;
    }
    readonlyPolygonsRef.current.forEach(p => p.setMap(null));
    readonlyPolygonsRef.current.clear();
    labelMarkersRef.current.forEach(m => m.setMap(null));
    labelMarkersRef.current = [];

    // Editing polygon — only for the selected cuerda IF the user can
    // edit it AND it has a territory.
    for (const cuerda of cuerdas) {
      if (cuerda.is_church_cuerda) continue;
      const paths = geoJsonToGooglePaths(cuerda.territory_geojson as any);
      if (!paths) continue;
      const isSelected = cuerda.numero === selectedCuerdaNumero;
      // When "Solo mi zona" is on, skip every other cuerda's polygon
      // so overlapping fills don't clutter the view. The selected
      // cuerda still renders (with its label) regardless.
      if (onlyMyZone && !isSelected) continue;
      const isEditable = isSelected && canEditCuerda(cuerda);
      const color = colorForCuerda(cuerda.numero);
      const polygon = new g.maps.Polygon({
        paths,
        editable: isEditable,
        draggable: false,
        strokeColor: color,
        strokeOpacity: isSelected ? 1.0 : 0.85,
        strokeWeight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: isSelected ? 0.30 : 0.18,
        zIndex: isSelected ? 10 : 1,
      });
      polygon.setMap(mapInstanceRef.current);
      if (isEditable) {
        editingPolygonRef.current = polygon;
        attachEditListeners(polygon);
      } else {
        readonlyPolygonsRef.current.set(cuerda.numero, polygon);
      }

      // Centroid label so the user can read which cuerda each polygon
      // represents at a glance. Average of the outer ring points — not
      // a true centroid, but close enough at sub-city scale and cheap.
      const outer = paths[0] || [];
      if (outer.length >= 3) {
        let lat = 0, lng = 0;
        for (const p of outer) { lat += p.lat; lng += p.lng; }
        const center = { lat: lat / outer.length, lng: lng / outer.length };
        const labelMarker = new g.maps.Marker({
          position: center,
          map: mapInstanceRef.current,
          clickable: false,
          zIndex: isSelected ? 11 : 2,
          icon: {
            // 1×1 transparent SVG so only the label text renders.
            url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%221%22 height%3D%221%22%2F%3E',
            scaledSize: new g.maps.Size(1, 1),
            anchor: new g.maps.Point(0, 0),
          },
          label: {
            text: cuerda.numero,
            color: '#ffffff',
            fontSize: isSelected ? '18px' : '15px',
            fontWeight: 'bold',
            className: 'mja-cuerda-label',
          },
        });
        labelMarkersRef.current.push(labelMarker);
      }
    }

    setHasUnsavedChanges(false);
  }, [mapReady, cuerdas, selectedCuerdaNumero, profile?.role, profile?.numero_cuerda, onlyMyZone]);

  // ─── Render cell markers (toggled via showCells checkbox) ────────
  useEffect(() => {
    cellMarkersRef.current.forEach(m => m.setMap(null));
    cellMarkersRef.current = [];
    if (!mapReady || !mapInstanceRef.current || !cells || !cuerdas || !showCells) return;
    const g = (window as any).google;
    const cuerdaById = new Map((cuerdas || []).map(c => [c.id, c]));
    for (const cell of cells) {
      if (typeof cell.lat !== 'number' || typeof cell.lng !== 'number') continue;
      const cuerda = cuerdaById.get(cell.cuerda_id);
      const color = cuerda ? colorForCuerda(cuerda.numero) : '#888';
      const marker = new g.maps.Marker({
        position: { lat: cell.lat, lng: cell.lng },
        map: mapInstanceRef.current,
        title: cell.name + (cuerda ? ` · Cuerda ${cuerda.numero}` : ''),
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 1.5,
          scale: 6,
        },
      });
      cellMarkersRef.current.push(marker);
    }
  }, [mapReady, cells, cuerdas, showCells]);

  // ─── Render contact markers (toggled via showContacts checkbox) ──
  useEffect(() => {
    contactMarkersRef.current.forEach(m => m.setMap(null));
    contactMarkersRef.current = [];
    if (!mapReady || !mapInstanceRef.current || !contacts || !showContacts) return;
    const g = (window as any).google;
    // If the selected cuerda has territory, color pins green (in) or red (out)
    const selCuerda = selectedCuerdaNumero && cuerdas ? cuerdas.find(c => c.numero === selectedCuerdaNumero) : null;
    const selPaths = selCuerda ? geoJsonToGooglePaths(selCuerda.territory_geojson as any) : null;
    for (const ct of contacts) {
      if (typeof ct.lat !== 'number' || typeof ct.lng !== 'number') continue;
      let color: string;
      if (selPaths) {
        color = isPointInTerritory(ct.lat, ct.lng, selPaths) ? '#22c55e' : '#ef4444';
      } else {
        color = ct.numero_cuerda ? colorForCuerda(ct.numero_cuerda) : '#888';
      }
      const marker = new g.maps.Marker({
        position: { lat: ct.lat, lng: ct.lng },
        map: mapInstanceRef.current,
        title: `${ct.first_name} ${ct.last_name || ''}`.trim() + (ct.numero_cuerda ? ` · C${ct.numero_cuerda}` : ''),
        icon: {
          path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 1,
          scale: 1.2,
          anchor: new g.maps.Point(12, 24),
        },
      });
      contactMarkersRef.current.push(marker);
    }
  }, [mapReady, contacts, showContacts, selectedCuerdaNumero, cuerdas]);

  // ─── Drawing controls ────────────────────────────────────────────
  // Tap-to-draw flow:
  //   1. enterDrawMode(): attach a click listener to the map. Each
  //      click adds a vertex (numbered marker), and the preview
  //      polyline updates to connect all current vertices.
  //   2. undoLastVertex(): pops the last vertex. No-op if empty.
  //   3. closePolygon(): freezes the current vertex list as a real
  //      editable Google Polygon, removes the preview markers + line,
  //      exits draw mode. Requires at least 3 vertices.
  //   4. cancelDrawing(): exits without committing anything.
  //
  // This avoids Google's DrawingManager which forces the user to tap
  // the FIRST vertex AGAIN to close — practically impossible on a
  // touch screen with shaky fingers.

  const renderDrawingPreview = () => {
    const g = (window as any).google;
    if (!g?.maps || !mapInstanceRef.current) return;
    const verts = drawingVerticesRef.current;
    const color = selectedCuerda ? colorForCuerda(selectedCuerda.numero) : '#3b82f6';

    // Refresh markers
    drawingMarkersRef.current.forEach(m => m.setMap(null));
    drawingMarkersRef.current = [];
    verts.forEach((v, idx) => {
      const marker = new g.maps.Marker({
        position: v,
        map: mapInstanceRef.current,
        label: { text: String(idx + 1), color: '#fff', fontSize: '11px', fontWeight: 'bold' },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          scale: 9,
        },
        zIndex: 100,
      });
      drawingMarkersRef.current.push(marker);
    });

    // Refresh preview polyline (open — connects vertices in order)
    if (drawingPreviewLineRef.current) {
      drawingPreviewLineRef.current.setMap(null);
      drawingPreviewLineRef.current = null;
    }
    if (verts.length >= 2) {
      drawingPreviewLineRef.current = new g.maps.Polyline({
        path: verts,
        map: mapInstanceRef.current,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2.5,
        zIndex: 99,
      });
    }
  };

  const enterDrawMode = () => {
    const g = (window as any).google;
    if (!g?.maps || !mapInstanceRef.current) return;
    if (!selectedCuerda || !canEditCuerda(selectedCuerda)) return;
    // If there's already an existing saved polygon, the user should
    // clear it first or edit by dragging vertices. Don't stack two.
    if (editingPolygonRef.current) {
      showError('Ya hay un territorio dibujado. Borralo primero o editalo arrastrando los vértices.');
      return;
    }
    drawingVerticesRef.current = [];
    setIsDrawing(true);
    // Wire up tap-to-add listener
    if (tapListenerRef.current) g.maps.event.removeListener(tapListenerRef.current);
    tapListenerRef.current = mapInstanceRef.current.addListener('click', (e: any) => {
      if (!e.latLng) return;
      drawingVerticesRef.current = [
        ...drawingVerticesRef.current,
        { lat: e.latLng.lat(), lng: e.latLng.lng() },
      ];
      setVertexCount(drawingVerticesRef.current.length);
      renderDrawingPreview();
    });
  };

  const undoLastVertex = () => {
    if (drawingVerticesRef.current.length === 0) return;
    drawingVerticesRef.current = drawingVerticesRef.current.slice(0, -1);
    setVertexCount(drawingVerticesRef.current.length);
    renderDrawingPreview();
  };

  const cancelDrawing = () => {
    const g = (window as any).google;
    if (tapListenerRef.current) {
      g?.maps?.event?.removeListener(tapListenerRef.current);
      tapListenerRef.current = null;
    }
    drawingVerticesRef.current = [];
    setVertexCount(0);
    drawingMarkersRef.current.forEach(m => m.setMap(null));
    drawingMarkersRef.current = [];
    if (drawingPreviewLineRef.current) {
      drawingPreviewLineRef.current.setMap(null);
      drawingPreviewLineRef.current = null;
    }
    setIsDrawing(false);
  };

  const closePolygon = () => {
    const g = (window as any).google;
    if (!g?.maps || !mapInstanceRef.current) return;
    const verts = drawingVerticesRef.current;
    if (verts.length < 3) {
      showError('Necesitás al menos 3 puntos para cerrar el polígono.');
      return;
    }
    if (!selectedCuerda) return;
    const color = colorForCuerda(selectedCuerda.numero);
    // Promote the vertex list to a real editable polygon
    const polygon = new g.maps.Polygon({
      paths: verts,
      editable: true,
      draggable: false,
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 3,
      fillColor: color,
      fillOpacity: 0.18,
      zIndex: 10,
    });
    polygon.setMap(mapInstanceRef.current);
    attachEditListeners(polygon);
    editingPolygonRef.current = polygon;
    // Tear down the drawing aids
    cancelDrawing();
    setHasUnsavedChanges(true);
    showSuccess('Polígono cerrado. Podés arrastrar los vértices para ajustar y después tocar Guardar.');
  };

  const clearDrawing = () => {
    if (!editingPolygonRef.current) return;
    if (!confirm('¿Borrar el territorio actual? Vas a tener que dibujarlo de nuevo y guardar.')) return;
    editingPolygonRef.current.setMap(null);
    editingPolygonRef.current = null;
    setHasUnsavedChanges(true);
  };

  const saveTerritory = async () => {
    if (!selectedCuerda || !canEditCuerda(selectedCuerda)) return;
    setSaving(true);
    try {
      let geojsonStr: string | null = null;
      if (editingPolygonRef.current) {
        const paths = editingPolygonRef.current.getPaths().getArray().map((p: any) =>
          p.getArray().map((latLng: any) => ({ lat: latLng.lat(), lng: latLng.lng() }))
        );
        const geojson = googlePathsToGeoJson(paths);
        if (!geojson) {
          showError('Polígono inválido. Necesita al menos 3 puntos.');
          setSaving(false);
          return;
        }
        geojsonStr = JSON.stringify(geojson);
      }
      // We have to write the geography column. supabase-js can pass
      // a string formatted with ST_GeomFromGeoJSON. Easiest: an RPC
      // that takes (cuerda_id, geojson_text) and updates with proper
      // geography casting. We use raw SQL via rpc.
      const { error } = await supabase.rpc('set_cuerda_territory', {
        p_cuerda_id: selectedCuerda.id,
        p_geojson: geojsonStr,
      });
      if (error) {
        showError(error.message);
        setSaving(false);
        return;
      }
      // Verify the territory was actually persisted — RPC can succeed
      // but write 0 rows if RLS or trigger blocks silently.
      const { data: verify } = await supabase
        .from('cuerdas_with_geojson')
        .select('territory_geojson')
        .eq('id', selectedCuerda.id)
        .single();
      const saved = geojsonStr ? !!verify?.territory_geojson : !verify?.territory_geojson;
      if (!saved) {
        showError('No se pudo guardar el territorio. Verificá que tenés permisos para editar esta cuerda.');
        setSaving(false);
        return;
      }
      showSuccess(geojsonStr ? 'Territorio guardado.' : 'Territorio borrado.');
      setHasUnsavedChanges(false);
      await queryClient.invalidateQueries({ queryKey: ['cuerdas-territorios', churchId] });
      // Bust the Semillero pool query too — territory changes affect
      // the in/out badges there.
      await queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
      await queryClient.invalidateQueries({ queryKey: ['cuerdas-pool', churchId] });
    } catch (e: any) {
      showError(e?.message || 'Error guardando territorio.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Stats: how many cells fall in/out the selected territory ───
  const selectedCuerdaPaths = useMemo(
    () => geoJsonToGooglePaths(selectedCuerda?.territory_geojson as any),
    [selectedCuerda?.territory_geojson],
  );

  // Contacts in the selected cuerda — for territory in/out stats.
  // Lightweight query that only fetches coords + cuerda, always enabled.
  const { data: cuerdaContacts } = useQuery<{ lat: number | null; lng: number | null }[]>({
    queryKey: ['contacts-territory-stats', churchId, selectedCuerdaNumero],
    queryFn: async () => {
      if (!selectedCuerdaNumero) return [];
      const PAGE = 1000;
      const all: any[] = [];
      for (let p = 0; ; p++) {
        const { data } = await supabase
          .from('contacts')
          .select('lat, lng')
          .eq('church_id', churchId!)
          .eq('numero_cuerda', selectedCuerdaNumero)
          .is('deleted_at', null)
          .order('id')
          .range(p * PAGE, (p + 1) * PAGE - 1);
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
    enabled: !!churchId && !!selectedCuerdaNumero,
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    if (!selectedCuerda || !cuerdaContacts) return null;
    if (!selectedCuerdaPaths) return null;
    let inn = 0, out = 0, noCoords = 0;
    for (const ct of cuerdaContacts) {
      if (typeof ct.lat !== 'number' || typeof ct.lng !== 'number') {
        noCoords++;
        continue;
      }
      if (isPointInTerritory(ct.lat, ct.lng, selectedCuerdaPaths)) inn++;
      else out++;
    }
    return { in: inn, out, noCoords, total: cuerdaContacts.length };
  }, [selectedCuerda, cuerdaContacts, selectedCuerdaPaths]);

  // Never early-return after this point — the map div must always stay in
  // the DOM so mapRef.current is set before mapsLoaded fires.
  const noCuerdas = !cuerdasLoading && !editableCuerdas.length && (cuerdas || []).filter(c => !c.is_church_cuerda).length === 0;

  const isSelectedEditable = selectedCuerda ? canEditCuerda(selectedCuerda) : false;
  const hasExistingTerritory = !!selectedCuerda?.territory_geojson;

  return (
    <div className="flex flex-col h-full p-2 gap-2">
      {/* Cuerda picker + actions — single compact row */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded border bg-card">
        <label className="text-sm font-medium mr-1">Cuerda:</label>
        {cuerdasLoading && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </span>
        )}
        <select
          disabled={cuerdasLoading || !isPrivilegedRole}
          className="h-8 px-2 rounded border bg-background text-sm disabled:opacity-100 disabled:cursor-default"
          value={selectedCuerdaNumero}
          onChange={(e) => {
            if (hasUnsavedChanges) {
              if (!confirm('Tenés cambios sin guardar. ¿Cambiar de cuerda y descartarlos?')) return;
            }
            if (isDrawing) cancelDrawing();
            setSelectedCuerdaNumero(e.target.value);
          }}
          title={isPrivilegedRole ? undefined : 'Solo podés ver tu propia cuerda'}
        >
          {/* Non-privileged users only ever see their own cuerda in the
              picker. Letting a referente switch to another cuerda's
              delineation invites confusion (and edits to a territory
              they don't own). Globals / pastor / supervisor keep the
              full picker so they can audit every cuerda. */}
          {(cuerdas || [])
            .filter(c => !c.is_church_cuerda)
            .filter(c => isPrivilegedRole || c.numero === profile?.numero_cuerda)
            .sort((a, b) => a.numero.localeCompare(b.numero))
            .map(c => (
              <option key={c.id} value={c.numero}>
                Cuerda {c.numero}
              </option>
            ))}
        </select>

        {/* "Solo mi zona" checkbox — hides every other cuerda's polygon
            on the map. Useful when men/women cuerdas overlap and the
            translucent fills stack visually. The selected cuerda still
            renders regardless. */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-1">
          <input
            type="checkbox"
            checked={onlyMyZone}
            onChange={(e) => setOnlyMyZone(e.target.checked)}
            className="rounded border-input"
          />
          Solo mi zona
        </label>

        {selectedCuerda && (
          <>
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded"
              style={{ background: `${colorForCuerda(selectedCuerda.numero)}33`, color: colorForCuerda(selectedCuerda.numero) }}
            >
              {hasExistingTerritory ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {hasExistingTerritory ? 'Con territorio' : 'Sin territorio'}
            </span>

            {/* DRAW MODE CONTROLS (active only while drawing) */}
            {isDrawing && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={undoLastVertex}
                  disabled={vertexCount === 0}
                  className="gap-1.5"
                  title="Quitar el último punto"
                >
                  ↶ Deshacer punto
                </Button>
                <Button
                  size="sm"
                  onClick={closePolygon}
                  disabled={vertexCount < 3}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  title="Cerrar el polígono y pasar a modo edición"
                >
                  ✓ Cerrar polígono
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelDrawing}
                  className="gap-1.5"
                >
                  Cancelar
                </Button>
              </>
            )}

            {/* IDLE-STATE BUTTONS (only visible when not drawing) */}
            {!isDrawing && isSelectedEditable && !editingPolygonRef.current && (
              <Button size="sm" onClick={enterDrawMode} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Dibujar territorio
              </Button>
            )}

            {!isDrawing && isSelectedEditable && editingPolygonRef.current && (
              <Button size="sm" variant="outline" onClick={clearDrawing} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Borrar
              </Button>
            )}

            {!isDrawing && isSelectedEditable && (
              <Button
                size="sm"
                onClick={saveTerritory}
                disabled={!hasUnsavedChanges || saving}
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </Button>
            )}

            {!isDrawing && !isSelectedEditable && (
              <span className="text-xs text-muted-foreground italic">Solo podés ver esta cuerda. Para editarla, hablá con tu pastor o admin.</span>
            )}
          </>
        )}

        {hasUnsavedChanges && !isDrawing && <span className="text-xs text-amber-400 ml-auto">Cambios sin guardar</span>}

        {/* Compact description hint — only when idle */}
        {!isDrawing && <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">Dibujá el área de cada cuerda · "En zona" / "Fuera de zona" en Semillero</span>}
      </div>

      {/* Drawing-mode help banner */}
      {isDrawing && (
        <div className="px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-sm flex items-center gap-2">
          <Pencil className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-amber-300">
            Tocá el mapa para agregar puntos al borde de tu territorio.
            {' '}
            <strong>{vertexCount}</strong> punto{vertexCount === 1 ? '' : 's'} agregado{vertexCount === 1 ? '' : 's'}.
            {vertexCount < 3
              ? ' Necesitás 3 o más para poder cerrar.'
              : ' Cuando termines, tocá "Cerrar polígono".'}
          </span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="flex flex-wrap items-center gap-3 px-2 text-sm">
          <span className="text-muted-foreground">Contactos en cuerda {selectedCuerda?.numero}:</span>
          <span className="text-green-400">✓ {stats.in} en zona</span>
          <span className="text-red-400">⚠ {stats.out} fuera de zona</span>
          {stats.noCoords > 0 && <span className="text-muted-foreground">{stats.noCoords} sin coordenadas</span>}
          <span className="text-muted-foreground">· total {stats.total}</span>
        </div>
      )}

      {noCuerdas && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <AlertCircle className="h-4 w-4" />
          No hay cuerdas configuradas en esta iglesia.
        </div>
      )}

      {/* Overlay toggles */}
      <div className="flex items-center gap-4 px-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={showCells} onChange={e => setShowCells(e.target.checked)} className="rounded" />
          Mostrar células
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={showContacts} onChange={e => setShowContacts(e.target.checked)} className="rounded" />
          Mostrar contactos
        </label>
      </div>

      {/* Map container — flex-1 fills all remaining vertical space */}
      <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden border">
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default TerritoriosPage;
