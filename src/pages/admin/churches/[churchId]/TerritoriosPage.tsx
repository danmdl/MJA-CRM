"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Loader2, Save, Trash2, Pencil, Eye, AlertCircle } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { geoJsonToGooglePaths, googlePathsToGeoJson, isPointInTerritory } from '@/lib/territory-utils';

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places,drawing,geometry`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    document.head.appendChild(script);
  });
};

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
  const drawingManagerRef = useRef<any>(null);
  // Active polygon currently being edited. There can only be ONE at
  // a time — the polygon for the cuerda the user picked.
  const editingPolygonRef = useRef<any>(null);
  // Read-only polygons for OTHER cuerdas (the user can see them for
  // reference but not modify). Indexed by cuerda numero so we can
  // remove + add as needed.
  const readonlyPolygonsRef = useRef<Map<string, any>>(new Map());
  // Cell markers — small dots so the user knows where their cells
  // sit relative to the territory they're drawing.
  const cellMarkersRef = useRef<any[]>([]);

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [selectedCuerdaNumero, setSelectedCuerdaNumero] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

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
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled) return;
      setMapsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    if (mapInstanceRef.current) return;
    const center = church?.lat && church?.lng
      ? { lat: church.lat, lng: church.lng }
      : { lat: -34.5824, lng: -58.5401 }; // MJA Central fallback
    const g = (window as any).google;
    mapInstanceRef.current = new g.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });
    // Drawing manager — used by the user to create a new polygon when
    // the selected cuerda doesn't have one yet. Hidden by default;
    // we toggle it on demand from the 'Dibujar territorio' button.
    drawingManagerRef.current = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false, // we expose our own button
      polygonOptions: {
        editable: true,
        draggable: false,
        strokeColor: '#000',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#000',
        fillOpacity: 0.18,
      },
    });
    drawingManagerRef.current.setMap(mapInstanceRef.current);

    g.maps.event.addListener(drawingManagerRef.current, 'polygoncomplete', (polygon: any) => {
      // User finished drawing a new polygon. Stop drawing mode, treat
      // this as the new editing polygon, and mark unsaved.
      drawingManagerRef.current.setDrawingMode(null);
      // Wire up edit listeners so dragging vertices marks unsaved.
      attachEditListeners(polygon);
      // If there was an existing editing polygon (shouldn't happen but
      // covered) drop it.
      if (editingPolygonRef.current && editingPolygonRef.current !== polygon) {
        editingPolygonRef.current.setMap(null);
      }
      editingPolygonRef.current = polygon;
      // Recolor to the selected cuerda's hue
      if (selectedCuerda) {
        const c = colorForCuerda(selectedCuerda.numero);
        polygon.setOptions({ strokeColor: c, fillColor: c });
      }
      setHasUnsavedChanges(true);
    });
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
    if (!mapsLoaded || !mapInstanceRef.current || !cuerdas) return;
    const g = (window as any).google;

    // Tear down everything and rebuild. Cheaper than diffing for the
    // small number of cuerdas we have (~26 max). Avoids stale state.
    if (editingPolygonRef.current) {
      editingPolygonRef.current.setMap(null);
      editingPolygonRef.current = null;
    }
    readonlyPolygonsRef.current.forEach(p => p.setMap(null));
    readonlyPolygonsRef.current.clear();

    // Editing polygon — only for the selected cuerda IF the user can
    // edit it AND it has a territory.
    for (const cuerda of cuerdas) {
      if (cuerda.is_church_cuerda) continue;
      const paths = geoJsonToGooglePaths(cuerda.territory_geojson as any);
      if (!paths) continue;
      const isSelected = cuerda.numero === selectedCuerdaNumero;
      const isEditable = isSelected && canEditCuerda(cuerda);
      const color = colorForCuerda(cuerda.numero);
      const polygon = new g.maps.Polygon({
        paths,
        editable: isEditable,
        draggable: false,
        strokeColor: color,
        strokeOpacity: isSelected ? 0.9 : 0.5,
        strokeWeight: isSelected ? 3 : 1.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.18 : 0.05,
        zIndex: isSelected ? 10 : 1,
      });
      polygon.setMap(mapInstanceRef.current);
      if (isEditable) {
        editingPolygonRef.current = polygon;
        attachEditListeners(polygon);
      } else {
        readonlyPolygonsRef.current.set(cuerda.numero, polygon);
      }
    }

    setHasUnsavedChanges(false);
  }, [mapsLoaded, cuerdas, selectedCuerdaNumero, profile?.role, profile?.numero_cuerda]);

  // ─── Render cell markers ─────────────────────────────────────────
  // Show all cells in the iglesia as small dots, colored by their
  // cuerda. Helps the user verify their drawing covers the right
  // cells.
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !cells || !cuerdas) return;
    const g = (window as any).google;
    cellMarkersRef.current.forEach(m => m.setMap(null));
    cellMarkersRef.current = [];
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
  }, [mapsLoaded, cells, cuerdas]);

  // ─── Drawing controls ────────────────────────────────────────────
  const startDrawing = () => {
    if (!drawingManagerRef.current) return;
    if (!selectedCuerda || !canEditCuerda(selectedCuerda)) return;
    // If there's already an editing polygon, the user has to clear it
    // first — drawing a second polygon would create ambiguity. We
    // rely on the 'Borrar' button to reset state.
    if (editingPolygonRef.current) {
      showError('Ya hay un territorio dibujado. Borralo primero o editalo arrastrando los vértices.');
      return;
    }
    const g = (window as any).google;
    drawingManagerRef.current.setDrawingMode(g.maps.drawing.OverlayType.POLYGON);
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

  const stats = useMemo(() => {
    if (!selectedCuerda || !cells || !mapsLoaded) return null;
    if (!selectedCuerdaPaths) return null;
    const cuerdaCells = cells.filter(c => c.cuerda_id === selectedCuerda.id);
    let inn = 0, out = 0, noCoords = 0;
    for (const cell of cuerdaCells) {
      if (typeof cell.lat !== 'number' || typeof cell.lng !== 'number') {
        noCoords++;
        continue;
      }
      if (isPointInTerritory(cell.lat, cell.lng, selectedCuerdaPaths)) inn++;
      else out++;
    }
    return { in: inn, out, noCoords, total: cuerdaCells.length };
  }, [selectedCuerda, cells, selectedCuerdaPaths, mapsLoaded]);

  if (cuerdasLoading) {
    return <div className="p-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!editableCuerdas.length && (cuerdas || []).filter(c => !c.is_church_cuerda).length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          No hay cuerdas configuradas en esta iglesia.
        </div>
      </div>
    );
  }

  const isSelectedEditable = selectedCuerda ? canEditCuerda(selectedCuerda) : false;
  const hasExistingTerritory = !!selectedCuerda?.territory_geojson;

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Territorios</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Definí el área geográfica de cada cuerda dibujándola sobre el mapa. Las células dentro del territorio aparecerán como "En zona" en el Semillero; las de afuera, "Fuera de zona".
        </p>
      </div>

      {/* Cuerda picker + actions */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded border bg-card">
        <label className="text-sm font-medium mr-1">Cuerda:</label>
        <select
          className="h-9 px-3 rounded border bg-background text-sm"
          value={selectedCuerdaNumero}
          onChange={(e) => {
            if (hasUnsavedChanges) {
              if (!confirm('Tenés cambios sin guardar. ¿Cambiar de cuerda y descartarlos?')) return;
            }
            setSelectedCuerdaNumero(e.target.value);
          }}
        >
          {(cuerdas || [])
            .filter(c => !c.is_church_cuerda)
            .sort((a, b) => a.numero.localeCompare(b.numero))
            .map(c => {
              const editable = canEditCuerda(c);
              return (
                <option key={c.id} value={c.numero}>
                  Cuerda {c.numero} {editable ? '(editable)' : '(solo lectura)'}
                </option>
              );
            })}
        </select>

        {selectedCuerda && (
          <>
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded"
              style={{ background: `${colorForCuerda(selectedCuerda.numero)}33`, color: colorForCuerda(selectedCuerda.numero) }}
            >
              {hasExistingTerritory ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {hasExistingTerritory ? 'Con territorio' : 'Sin territorio'}
            </span>

            {isSelectedEditable && !editingPolygonRef.current && (
              <Button size="sm" onClick={startDrawing} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Dibujar territorio
              </Button>
            )}

            {isSelectedEditable && editingPolygonRef.current && (
              <Button size="sm" variant="outline" onClick={clearDrawing} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Borrar
              </Button>
            )}

            {isSelectedEditable && (
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

            {!isSelectedEditable && (
              <span className="text-xs text-muted-foreground italic">Solo podés ver esta cuerda. Para editarla, hablá con tu pastor o admin.</span>
            )}
          </>
        )}

        {hasUnsavedChanges && <span className="text-xs text-amber-400 ml-auto">Cambios sin guardar</span>}
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex flex-wrap items-center gap-3 px-3 text-sm">
          <span className="text-muted-foreground">Células en cuerda {selectedCuerda?.numero}:</span>
          <span className="text-green-400">✓ {stats.in} en zona</span>
          <span className="text-red-400">⚠ {stats.out} fuera de zona</span>
          {stats.noCoords > 0 && <span className="text-muted-foreground">{stats.noCoords} sin coordenadas</span>}
          <span className="text-muted-foreground">· total {stats.total}</span>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-[60vh] rounded-xl overflow-hidden border">
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default TerritoriosPage;
