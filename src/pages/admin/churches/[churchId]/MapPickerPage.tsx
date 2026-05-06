"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, MapPin, Route as RouteIcon, Search, Filter, X, List, Map as MapIcon } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  numero_cuerda: string | null;
  responsable_id: string | null;
  fecha_contacto: string | null;
  sexo: string | null;
}

const MapPickerPage = () => {
  const { churchId, projectId } = useParams<{ churchId: string; projectId: string }>();
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersById = useRef<Map<string, any>>(new Map());
  const fittedRef = useRef(false);
  const projectHydratedRef = useRef(false);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterResponsableId, setFilterResponsableId] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterSexo, setFilterSexo] = useState<string>('');
  const [onlyWithNumber, setOnlyWithNumber] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('map');
  const [saving, setSaving] = useState(false);

  // Load project (so we can save to it later + show its name)
  const { data: project } = useQuery<any>({
    queryKey: ['route-project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase.from('shared_routes').select('*').eq('id', projectId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // Hydrate any pre-existing selection from the project so a user can come
  // back to the map picker and keep iterating on what they had picked.
  useEffect(() => {
    if (!project || projectHydratedRef.current) return;
    projectHydratedRef.current = true;
    if (project.ordered_contact_ids?.length) {
      setSelectedIds(new Set(project.ordered_contact_ids));
    }
  }, [project]);

  // Fetch contacts with valid coordinates, applying strict cuerda visibility
  // (matches Semillero / RouteEditor rule).
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['mappicker-contacts', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, address, lat, lng, numero_cuerda, responsable_id, fecha_contacto, sexo')
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
        if (profile.numero_cuerda) {
          q = q.eq('numero_cuerda', profile.numero_cuerda);
        } else {
          q = q.eq('responsable_id', profile.id);
        }
      }
      const { data } = await q.limit(2000);
      return (data || []) as Contact[];
    },
    enabled: !!churchId && !!profile,
    staleTime: 60_000,
  });

  // Team members for Responsable filter — restricted to user's cuerda for non-globals.
  const { data: teamMembers = [] } = useQuery<{ id: string; first_name: string | null; last_name: string | null; numero_cuerda: string | null }[]>({
    queryKey: ['mappicker-team', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, first_name, last_name, numero_cuerda')
        .eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Load Google Maps script once
  useEffect(() => {
    if ((window as any).google?.maps) return;
    if (document.querySelector('script[data-gmaps]')) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    script.setAttribute('data-gmaps', '1');
    document.head.appendChild(script);
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts || []).filter(c => {
      if (onlyWithNumber && !/\d/.test(c.address || '')) return false;
      if (filterResponsableId === '__none__') {
        if (c.responsable_id) return false;
      } else if (filterResponsableId && c.responsable_id !== filterResponsableId) return false;
      if (filterDateFrom && (!c.fecha_contacto || c.fecha_contacto < filterDateFrom)) return false;
      if (filterDateTo && (!c.fecha_contacto || c.fecha_contacto > filterDateTo)) return false;
      if (filterSexo && c.sexo !== filterSexo) return false;
      if (term) {
        const name = `${c.first_name} ${c.last_name || ''}`.toLowerCase();
        const addr = (c.address || '').toLowerCase();
        if (!name.includes(term) && !addr.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithNumber, filterResponsableId, filterDateFrom, filterDateTo, filterSexo]);

  // Quick filter presets — set fecha_contacto >= N days ago
  const setLastNDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    setFilterDateFrom(d.toISOString().slice(0, 10));
    setFilterDateTo('');
  };

  const clearFilters = () => {
    setSearch('');
    setFilterResponsableId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSexo('');
  };

  const hasActiveFilters = !!(search || filterResponsableId || filterDateFrom || filterDateTo || filterSexo);

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Initialize the map once it has filtered data + the script is loaded.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const google = (window as any).google;
    if (!google?.maps) {
      // Retry until Google Maps loads
      const id = setInterval(() => {
        if ((window as any).google?.maps && mapRef.current && !mapInstance.current) {
          clearInterval(id);
          // Trigger this effect again by setting a no-op — simplest is just call init inline
          initMap();
        }
      }, 200);
      return () => clearInterval(id);
    }
    initMap();
    function initMap() {
      const g = (window as any).google;
      mapInstance.current = new g.maps.Map(mapRef.current, {
        // Default to Buenos Aires; will fit bounds when data loads.
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
      });
    }
  }, []);

  // Re-render markers whenever filtered list or selection changes.
  useEffect(() => {
    const google = (window as any).google;
    if (!google?.maps || !mapInstance.current) return;

    const visibleIds = new Set(filtered.map(c => c.id));

    // Remove markers no longer visible
    markersById.current.forEach((m, id) => {
      if (!visibleIds.has(id)) {
        m.setMap(null);
        markersById.current.delete(id);
      }
    });

    // Add or update markers
    filtered.forEach(c => {
      if (c.lat == null || c.lng == null) return;
      const isSelected = selectedIds.has(c.id);
      const existing = markersById.current.get(c.id);
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 11 : 8,
        fillColor: isSelected ? '#10b981' : '#FFC233',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      };
      if (existing) {
        existing.setIcon(icon);
        existing.setTitle(`${c.first_name} ${c.last_name || ''}${isSelected ? ' (seleccionado)' : ''}`);
      } else {
        const marker = new google.maps.Marker({
          position: { lat: c.lat, lng: c.lng },
          map: mapInstance.current,
          icon,
          title: `${c.first_name} ${c.last_name || ''}`,
        });
        marker.addListener('click', () => {
          toggleContact(c.id);
        });
        markersById.current.set(c.id, marker);
      }
    });

    // Fit bounds the first time we have markers
    if (!fittedRef.current && filtered.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filtered.forEach(c => {
        if (c.lat != null && c.lng != null) bounds.extend({ lat: c.lat, lng: c.lng });
      });
      mapInstance.current.fitBounds(bounds, 60);
      fittedRef.current = true;
    }
  }, [filtered, selectedIds]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      markersById.current.forEach(m => m.setMap(null));
      markersById.current.clear();
    };
  }, []);

  const proceedToRoute = async () => {
    if (selectedIds.size === 0) {
      showError('Seleccioná al menos un contacto.');
      return;
    }
    if (!project) return;
    setSaving(true);
    try {
      // Save the picked contact ids to the project. We're not running the
      // optimization yet — that happens on the next page. We just need to
      // persist what was picked so RouteEditorPage can hydrate from it.
      const { error } = await supabase.from('shared_routes')
        .update({ ordered_contact_ids: Array.from(selectedIds) })
        .eq('id', project.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['route-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      showSuccess(`${selectedIds.size} contacto${selectedIds.size === 1 ? '' : 's'} guardado${selectedIds.size === 1 ? '' : 's'}.`);
      navigate(`/admin/churches/${churchId}/rutas/${projectId}`);
    } catch (e: any) {
      showError(e.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <button
          onClick={() => navigate(`/admin/churches/${churchId}/rutas`)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Volver a proyectos"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <RouteIcon className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-base sm:text-lg font-semibold truncate">{project?.name || 'Selección por mapa'}</div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            Filtrá los contactos, hacé click en los pines y armá tu ruta.
          </div>
        </div>
        {/* Mobile view toggle */}
        <div className="flex sm:hidden items-center bg-muted rounded-md p-0.5">
          <button
            onClick={() => setMobileView('map')}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${mobileView === 'map' ? 'bg-background shadow' : 'text-muted-foreground'}`}
          >
            <MapIcon className="h-3 w-3" /> Mapa
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${mobileView === 'list' ? 'bg-background shadow' : 'text-muted-foreground'}`}
          >
            <List className="h-3 w-3" /> Lista
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="border rounded-lg bg-card mb-3 p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o dirección..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <select value={filterResponsableId} onChange={e => setFilterResponsableId(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background min-w-[140px]">
            <option value="">Todos los responsables</option>
            <option value="__none__">Sin responsable</option>
            {teamMembers
              .filter(m => {
                if (profile?.role && !['admin', 'general', 'pastor', 'supervisor'].includes(profile.role)) {
                  return m.numero_cuerda === profile.numero_cuerda;
                }
                return true;
              })
              .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
              .map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ))}
          </select>
          <select value={filterSexo} onChange={e => setFilterSexo(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background">
            <option value="">Sexo: todos</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Fecha contacto desde" className="h-8 text-xs border rounded px-2 bg-background" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="Fecha contacto hasta" className="h-8 text-xs border rounded px-2 bg-background" />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 h-8">
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Rápidos:</span>
          <button onClick={() => setLastNDays(7)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted">Últimos 7 días</button>
          <button onClick={() => setLastNDays(15)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted">Últimos 15 días</button>
          <button onClick={() => setLastNDays(30)} className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted">Últimos 30 días</button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto select-none">
            <input
              type="checkbox"
              checked={onlyWithNumber}
              onChange={e => setOnlyWithNumber(e.target.checked)}
              className="rounded border-input"
            />
            Solo direcciones con número
          </label>
        </div>
      </div>

      {/* Body: sidebar + map */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left sidebar: contact list */}
        <aside className={`${mobileView === 'list' ? 'flex' : 'hidden'} sm:flex flex-col w-full sm:w-72 lg:w-80 shrink-0 border rounded-lg bg-card overflow-hidden`}>
          <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
            <div className="text-xs">
              <span className="font-semibold">{filtered.length}</span>
              <span className="text-muted-foreground"> visibles</span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold text-primary">{selectedIds.size}</span>
                  <span className="text-muted-foreground"> elegidos</span>
                </>
              )}
            </div>
            {selectedIds.size > 0 && (
              <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-foreground">
                Limpiar
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Cargando contactos...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {hasActiveFilters ? 'Ningún contacto matchea estos filtros.' : 'No hay contactos georreferenciados.'}
              </div>
            ) : (
              filtered.map(c => {
                const isSelected = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      toggleContact(c.id);
                      // Pan to the contact on the map so user gets feedback
                      if (mapInstance.current && c.lat != null && c.lng != null) {
                        mapInstance.current.panTo({ lat: c.lat, lng: c.lng });
                      }
                    }}
                    className={`w-full text-left flex items-start gap-2 p-2 border-b last:border-b-0 hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'}`}>
                      {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {c.first_name} {c.last_name || ''}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.address || 'Sin dirección'}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Map */}
        <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} sm:flex flex-1 relative rounded-lg border overflow-hidden bg-muted`}>
          <div ref={mapRef} className="w-full h-full" />
          {/* Floating CTA */}
          {selectedIds.size > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <Button
                onClick={proceedToRoute}
                disabled={saving}
                size="lg"
                className="shadow-lg gap-2"
              >
                <RouteIcon className="h-4 w-4" />
                {saving ? 'Guardando...' : `Crear ruta con ${selectedIds.size} contacto${selectedIds.size === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only floating CTA when in list view */}
      {selectedIds.size > 0 && mobileView === 'list' && (
        <div className="sm:hidden mt-3">
          <Button onClick={proceedToRoute} disabled={saving} className="w-full gap-2">
            <RouteIcon className="h-4 w-4" />
            {saving ? 'Guardando...' : `Crear ruta con ${selectedIds.size}`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default MapPickerPage;
