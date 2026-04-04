import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Plus, Home, MapPin, Trash2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { isWithinGBA } from '@/lib/geo-validation';
import { useSession } from '@/hooks/use-session';

interface Hogar {
  id: string;
  name: string | null;
  leader_name: string | null;
  anfitrion_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_day: string | null;
  meeting_time: string | null;
  fecha_apertura: string | null;
  fecha_cierre_estimada: string | null;
  cuerda_id: string | null;
}

interface Cuerda {
  id: string;
  numero: string;
  zona_id: string;
}

interface Zona {
  id: string;
  nombre: string;
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const HogaresDePazPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [editHogar, setEditHogar] = useState<Hogar | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const isAdminOrPastor = ['admin', 'general', 'pastor'].includes(profile?.role || '');

  const { data: hogares, isLoading } = useQuery<Hogar[]>({
    queryKey: ['hogares', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('hogares_de_paz')
        .select('*')
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      return (data || []) as Hogar[];
    },
    enabled: !!churchId,
  });

  const { data: cuerdas } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas-hogares', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id')
        .in('zona_id', (await supabase.from('zonas').select('id').eq('church_id', churchId!)).data?.map(z => z.id) || []);
      return (data || []) as Cuerda[];
    },
    enabled: !!churchId,
  });

  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas-hogares', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);
      return (data || []) as Zona[];
    },
    enabled: !!churchId,
  });

  const getZonaForCuerda = (cuerdaId: string | null) => {
    if (!cuerdaId || !cuerdas || !zonas) return null;
    const c = cuerdas.find(cr => cr.id === cuerdaId);
    if (!c) return null;
    return zonas.find(z => z.id === c.zona_id) || null;
  };

  const getCuerdaNumero = (cuerdaId: string | null) => {
    if (!cuerdaId || !cuerdas) return null;
    return cuerdas.find(c => c.id === cuerdaId)?.numero || null;
  };

  const emptyHogar: Hogar = {
    id: '', name: '', leader_name: '', anfitrion_name: '', address: '',
    lat: null, lng: null, meeting_day: '', meeting_time: '',
    fecha_apertura: '', fecha_cierre_estimada: '', cuerda_id: null,
  };

  const handleSave = async () => {
    const h = showNew ? editHogar : editHogar;
    if (!h) return;
    setSaving(true);
    try {
      if (showNew) {
        const { error } = await supabase.from('hogares_de_paz').insert({
          church_id: churchId,
          name: h.name || null,
          leader_name: h.leader_name || null,
          anfitrion_name: h.anfitrion_name || null,
          address: h.address || null,
          lat: h.lat, lng: h.lng,
          meeting_day: h.meeting_day || null,
          meeting_time: h.meeting_time || null,
          fecha_apertura: h.fecha_apertura || null,
          fecha_cierre_estimada: h.fecha_cierre_estimada || null,
          cuerda_id: h.cuerda_id || null,
        });
        if (error) throw error;
        showSuccess('Hogar de Paz creado.');
      } else {
        const { error } = await supabase.from('hogares_de_paz').update({
          name: h.name || null,
          leader_name: h.leader_name || null,
          anfitrion_name: h.anfitrion_name || null,
          address: h.address || null,
          lat: h.lat, lng: h.lng,
          meeting_day: h.meeting_day || null,
          meeting_time: h.meeting_time || null,
          fecha_apertura: h.fecha_apertura || null,
          fecha_cierre_estimada: h.fecha_cierre_estimada || null,
          cuerda_id: h.cuerda_id || null,
        }).eq('id', h.id);
        if (error) throw error;
        showSuccess('Hogar de Paz actualizado.');
      }
      queryClient.invalidateQueries({ queryKey: ['hogares', churchId] });
      setEditHogar(null);
      setShowNew(false);
      setShowMap(false);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('hogares_de_paz').update({
      deleted_at: new Date().toISOString(),
      deleted_by: (await supabase.auth.getUser()).data.user?.id,
    }).eq('id', id);
    if (error) showError(error.message);
    else { showSuccess('Hogar de Paz eliminado.'); queryClient.invalidateQueries({ queryKey: ['hogares', churchId] }); }
  };

  const dialogOpen = !!editHogar || showNew;
  const current = editHogar || emptyHogar;

  const setField = (field: keyof Hogar, value: any) => {
    if (showNew) setEditHogar(prev => ({ ...(prev || emptyHogar), [field]: value }));
    else setEditHogar(prev => prev ? { ...prev, [field]: value } : null);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Home className="h-5 w-5" /> Hogares de Paz</h1>
        {isAdminOrPastor && (
          <Button size="sm" onClick={() => { setEditHogar({ ...emptyHogar }); setShowNew(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo Hogar
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {!isLoading && (!hogares || hogares.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Home className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay hogares de paz registrados.</p>
        </div>
      )}

      {!isLoading && hogares && hogares.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Nombre</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Cuerda</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Líder</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Anfitrión</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Dirección</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Día / Hora</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Apertura</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Cierre est.</th>
                {isAdminOrPastor && <th className="px-3 py-2 w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {hogares.map(h => {
                const cuerdaNum = getCuerdaNumero(h.cuerda_id);
                const zona = getZonaForCuerda(h.cuerda_id);
                return (
                  <tr key={h.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">{h.name || '—'}</td>
                    <td className="px-3 py-2">
                      {cuerdaNum ? (
                        <div>
                          <Badge variant="secondary" className="text-[10px] font-mono">{cuerdaNum}</Badge>
                          {zona && <span className="text-[10px] text-muted-foreground ml-1">{zona.nombre}</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">{h.leader_name || '—'}</td>
                    <td className="px-3 py-2">{h.anfitrion_name || '—'}</td>
                    <td className="px-3 py-2">
                      {h.address ? (
                        <div>
                          <span className="truncate max-w-[200px] block text-xs" title={h.address}>{h.address}</span>
                          {h.lat && h.lng && <a href={`https://www.google.com/maps?q=${h.lat},${h.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Ver en Mapa</a>}
                        </div>
                      ) : <span className="text-red-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Sin dirección</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{h.meeting_day || '—'} {h.meeting_time ? `· ${h.meeting_time}` : ''}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{h.fecha_apertura || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{h.fecha_cierre_estimada || '—'}</td>
                    {isAdminOrPastor && (
                      <td className="px-3 py-1 flex gap-1">
                        <button className="p-1 rounded hover:bg-muted" onClick={() => { setEditHogar({ ...h }); setShowNew(false); }}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="p-1 rounded hover:bg-muted text-red-400" onClick={() => handleDelete(h.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setEditHogar(null); setShowNew(false); setShowMap(false); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showNew ? 'Nuevo Hogar de Paz' : 'Editar Hogar de Paz'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <Input value={current.name || ''} onChange={e => setField('name', e.target.value || null)} placeholder="Ej: Hogar de Paz Villa Lynch" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Líder</label>
                <Input value={current.leader_name || ''} onChange={e => setField('leader_name', e.target.value || null)} placeholder="Nombre del líder" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Anfitrión</label>
                <Input value={current.anfitrion_name || ''} onChange={e => setField('anfitrion_name', e.target.value || null)} placeholder="Nombre del anfitrión" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dirección</label>
              <AddressAutocomplete
                value={current.address || ''}
                onChange={(addr, lat, lng) => {
                  setField('address', addr || null);
                  if (lat != null && lng != null && isWithinGBA(lat, lng)) {
                    setField('lat', lat);
                    setField('lng', lng);
                  }
                }}
                placeholder="Ej: Av Corrientes 4000, CABA"
              />
              <div className="flex items-center gap-2 mt-1">
                <button type="button" className="text-[10px] text-primary hover:underline flex items-center gap-1" onClick={() => setShowMap(!showMap)}>
                  <MapPin className="h-3 w-3" /> {showMap ? 'Ocultar mapa' : 'Ubicar en Mapa'}
                </button>
                {current.lat != null && current.lng != null && (
                  <span className="text-[10px] text-muted-foreground">({current.lat.toFixed(4)}, {current.lng.toFixed(4)})</span>
                )}
              </div>
              {showMap && (
                <div
                  ref={(el) => {
                    if (!el || !(window as any).google) return;
                    const google = (window as any).google;
                    const center = current.lat && current.lng ? { lat: current.lat, lng: current.lng } : { lat: -34.58, lng: -58.52 };
                    const map = new google.maps.Map(el, { center, zoom: current.lat ? 16 : 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
                    const marker = new google.maps.Marker({ position: center, map, draggable: true });
                    const updatePos = (lat: number, lng: number) => {
                      const geocoder = new google.maps.Geocoder();
                      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                        if (status === 'OK' && results?.[0]) setField('address', results[0].formatted_address);
                        setField('lat', lat);
                        setField('lng', lng);
                      });
                    };
                    map.addListener('click', (e: any) => { marker.setPosition(e.latLng); updatePos(e.latLng.lat(), e.latLng.lng()); });
                    marker.addListener('dragend', () => { const p = marker.getPosition(); updatePos(p.lat(), p.lng()); });
                  }}
                  className="w-full h-[200px] rounded border"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Día</label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={current.meeting_day || ''} onChange={e => setField('meeting_day', e.target.value || null)}>
                  <option value="">Sin día</option>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Hora</label>
                <Input value={current.meeting_time || ''} onChange={e => setField('meeting_time', e.target.value || null)} placeholder="Ej: 20:00hs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fecha de apertura</label>
                <Input type="date" value={current.fecha_apertura || ''} onChange={e => setField('fecha_apertura', e.target.value || null)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fecha estimada de cierre</label>
                <Input type="date" value={current.fecha_cierre_estimada || ''} onChange={e => setField('fecha_cierre_estimada', e.target.value || null)} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cuerda</label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={current.cuerda_id || ''} onChange={e => setField('cuerda_id', e.target.value || null)}>
                <option value="">Sin cuerda</option>
                {(cuerdas || []).map(c => {
                  const z = zonas?.find(zo => zo.id === c.zona_id);
                  return <option key={c.id} value={c.id}>{c.numero} {z ? `— ${z.nombre}` : ''}</option>;
                })}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => { setEditHogar(null); setShowNew(false); setShowMap(false); }}>Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HogaresDePazPage;
