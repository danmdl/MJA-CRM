import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, MapPin, Pencil, Lock, Unlock, PlusCircle, Home, Trash2 } from 'lucide-react';
import { normalize } from '@/lib/normalize';
import { showSuccess, showError } from '@/utils/toast';
import { useConfirm } from '@/hooks/use-confirm';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { usePermissions } from '@/lib/permissions';
import { useSession } from '@/hooks/use-session';
import { isWithinGBA } from '@/lib/geo-validation';

interface HogarRow {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_day: string | null;
  meeting_time: string | null;
  leader_name: string | null;
  anfitrion_name: string | null;
  fecha_apertura: string | null;
  fecha_cierre_estimada: string | null;
  cuerda_numero: string | null;
  cuerda_id: string | null;
  zona_nombre: string | null;
  referente_name: string | null;
  supervisor_name: string | null;
  closed_at: string | null;
  closed_reason: string | null;
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const HogaresDePazPage = () => {
  const confirm = useConfirm();
  const { churchId } = useParams<{ churchId: string }>();
  const { data: churchCoords } = useChurchCoords(churchId);
  const queryClient = useQueryClient();
  const { canEditCelulas, canSeeBaseDatosTotal, canEditCuerdas, canAddUsers } = usePermissions();
  const { session, profile } = useSession();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState<string>('all');
  const [editHogar, setEditHogar] = useState<HogarRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [closeDialog, setCloseDialog] = useState<{ id: string; name: string } | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [showNew, setShowNew] = useState(false);

  const userCuerda = profile?.numero_cuerda;
  const canSeeAll = canSeeBaseDatosTotal() || ['admin', 'general', 'pastor'].includes(profile?.role || '');
  const canEdit = canEditCelulas();
  const canCreate = canEditCuerdas() || canAddUsers();

  // ─── Data loading ──────────────────────────────────────────────
  const { data: hogares, isLoading } = useQuery<HogarRow[]>({
    queryKey: ['hogares-page', churchId, userCuerda, canSeeAll],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hogares_de_paz')
        .select('id, name, address, lat, lng, meeting_day, meeting_time, leader_name, anfitrion_name, fecha_apertura, fecha_cierre_estimada, cuerda_id, closed_at, closed_reason')
        .eq('church_id', churchId!)
        .is('deleted_at', null);
      if (error) throw error;

      const { data: cuerdas } = await supabase.from('cuerdas').select('id, numero, zona_id, referente_name, supervisor_name');
      const { data: zonas } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);

      const cuerdaMap = new Map((cuerdas || []).map(c => [c.id, c]));
      const zonaMap = new Map((zonas || []).map(z => [z.id, z]));

      const allHogares = (data || []).map(h => {
        const cuerda = cuerdaMap.get((h as any).cuerda_id);
        const zona = cuerda ? zonaMap.get(cuerda.zona_id) : null;
        return {
          ...h,
          cuerda_numero: cuerda?.numero || null,
          zona_nombre: zona?.nombre || null,
          referente_name: cuerda?.referente_name || null,
          supervisor_name: cuerda?.supervisor_name || null,
        } as HogarRow;
      });

      if (!canSeeAll && userCuerda) {
        return allHogares.filter(h => h.cuerda_numero === userCuerda);
      }
      return allHogares;
    },
    enabled: !!churchId,
  });

  const { data: cuerdasList } = useQuery<{ id: string; numero: string; zona_id: string }[]>({
    queryKey: ['cuerdas-hogares-page', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cuerdas')
        .select('id, numero, zona_id, zonas!inner(church_id)')
        .eq('zonas.church_id', churchId!)
        .order('numero');
      return (data || []).map((c: any) => ({ id: c.id, numero: c.numero, zona_id: c.zona_id }));
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: zonasList } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['zonas-hogares-page', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // ─── Filtering ─────────────────────────────────────────────────
  const zonas = useMemo(() => {
    const set = new Set<string>();
    (hogares || []).forEach(h => { if (h.zona_nombre) set.add(h.zona_nombre); });
    return Array.from(set).sort();
  }, [hogares]);

  const filtered = useMemo(() => {
    let result = hogares || [];
    if (zonaFilter !== 'all') result = result.filter(h => h.zona_nombre === zonaFilter);
    if (search) {
      const q = normalize(search);
      result = result.filter(h =>
        normalize(h.name || '').includes(q) || normalize(h.address || '').includes(q) ||
        normalize(h.leader_name || '').includes(q) || normalize(h.anfitrion_name || '').includes(q) ||
        normalize(h.cuerda_numero || '').includes(q) || normalize(h.referente_name || '').includes(q) ||
        normalize(h.supervisor_name || '').includes(q)
      );
    }
    return result;
  }, [hogares, zonaFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, HogarRow[]>();
    filtered.forEach(h => {
      const zona = h.zona_nombre || 'Sin zona';
      if (!map.has(zona)) map.set(zona, []);
      map.get(zona)!.push(h);
    });
    map.forEach(arr => arr.sort((a, b) => (a.cuerda_numero || '').localeCompare(b.cuerda_numero || '')));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const missingCount = (hogares || []).filter(h => !h.address).length;

  // ─── Empty template for new hogar ──────────────────────────────
  const emptyHogar: HogarRow = {
    id: '', name: '', address: '', lat: null, lng: null,
    meeting_day: '', meeting_time: '', leader_name: '', anfitrion_name: '',
    fecha_apertura: '', fecha_cierre_estimada: '', cuerda_id: null,
    cuerda_numero: null, zona_nombre: null, referente_name: null,
    supervisor_name: null, closed_at: null, closed_reason: null,
  };

  // ─── Save (create or update) ───────────────────────────────────
  const handleSave = async () => {
    const h = editHogar;
    if (!h) return;
    setSaving(true);
    try {
      if (showNew) {
        if (!h.cuerda_id) { showError('Seleccioná una cuerda.'); setSaving(false); return; }
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
          created_by: session?.user?.id,
        });
        if (error) throw error;
        await supabase.from('activity_logs').insert({
          user_id: session?.user?.id,
          church_id: churchId,
          action: 'create',
          entity_type: 'hogar_de_paz',
          after_data: { name: h.name, cuerda_id: h.cuerda_id, address: h.address },
        });
        showSuccess('Hogar de Paz creado.');
      } else {
        const { data: beforeData } = await supabase.from('hogares_de_paz').select('*').eq('id', h.id).single();
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
        const { data: afterData } = await supabase.from('hogares_de_paz').select('*').eq('id', h.id).single();
        await supabase.from('activity_logs').insert({
          user_id: session?.user?.id,
          church_id: churchId,
          action: 'update',
          entity_type: 'hogar_de_paz',
          entity_id: h.id,
          before_data: beforeData,
          after_data: afterData,
        });
        showSuccess('Hogar de Paz actualizado.');
      }
      queryClient.invalidateQueries({ queryKey: ['hogares-page', churchId] });
      queryClient.invalidateQueries({ queryKey: ['hogares', churchId] });
      queryClient.invalidateQueries({ queryKey: ['historial'] });
      setEditHogar(null);
      setShowNew(false);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Soft delete ───────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({
      title: `¿Eliminar "${name || 'este hogar'}"?`,
      description: 'Se puede recuperar desde Papelera.',
      confirmLabel: 'Eliminar',
      destructive: true,
    }))) return;
    const { error } = await supabase.from('hogares_de_paz').update({
      deleted_at: new Date().toISOString(),
      deleted_by: session?.user?.id,
    }).eq('id', id);
    if (error) showError(error.message);
    else {
      showSuccess('Hogar de Paz eliminado.');
      queryClient.invalidateQueries({ queryKey: ['hogares-page', churchId] });
      queryClient.invalidateQueries({ queryKey: ['hogares', churchId] });
    }
  };

  const setField = (field: keyof HogarRow, value: any) => {
    setEditHogar(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando hogares de paz...</div>;

  return (
    <div className="space-y-4">
      {/* Header: title + counts + search + nuevo on one row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Home className="h-5 w-5" /> Hogares de Paz</h1>
          {missingCount > 0 && <span className="text-xs text-red-400">{missingCount} sin dirección</span>}
          <span className="text-sm text-muted-foreground">{filtered.length} de {(hogares || []).length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => { setEditHogar({ ...emptyHogar }); setShowNew(true); }}>
              <PlusCircle className="mr-1.5 h-4 w-4" /> Nuevo Hogar
            </Button>
          )}
        </div>
      </div>

      {/* Zona chips */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setZonaFilter('all')} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === 'all' ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>Todas</button>
        {zonas.map(z => (
          <button key={z} onClick={() => setZonaFilter(z === zonaFilter ? 'all' : z)} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === z ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{z}</button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-xs w-[60px]">Cuerda</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Nombre</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Dirección</th>
              {canEdit && <th className="w-[32px]"></th>}
              <th className="text-left px-3 py-2 font-medium text-xs w-[90px]">Día</th>
              <th className="text-left px-3 py-2 font-medium text-xs w-[70px]">Hora</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Líder</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Anfitrión</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Apertura</th>
              {canEdit && <th className="px-3 py-2 w-[32px]"></th>}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([zona, rows]) => (
              <React.Fragment key={zona}>
                <tr className="bg-muted/30">
                  <td colSpan={canEdit ? 10 : 8} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{zona} ({rows.length})</td>
                </tr>
                {rows.map(h => {
                  const noAddr = !h.address;
                  return (
                    <tr key={h.id} className={`border-b hover:bg-muted/30 transition-colors ${h.closed_at ? 'opacity-50' : noAddr ? 'bg-red-500/5' : ''}`}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {h.cuerda_numero || '—'}
                        {h.closed_at && <span className="ml-1 text-[9px] text-red-400" title={h.closed_reason || 'Cerrado'}>🔒</span>}
                      </td>
                      <td className="px-3 py-2 font-medium">{h.name || '—'}</td>
                      <td className={`px-3 py-2 ${noAddr ? 'text-red-400 font-medium' : ''}`}>
                        {h.closed_at ? (
                          <div>
                            <span className="text-sm text-red-400 line-through">{h.address || h.name}</span>
                            {h.closed_reason && <p className="text-[10px] text-muted-foreground mt-0.5">Motivo: {h.closed_reason}</p>}
                          </div>
                        ) : noAddr ? <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Sin dirección</span> : (
                          <div>
                            <span className="truncate max-w-[250px] block text-sm" title={h.address!}>{h.address}</span>
                            {h.lat && h.lng && (
                              <a href={`https://www.google.com/maps?q=${h.lat},${h.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">
                                Ver en Mapa
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-1 py-1">
                          <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setEditHogar({ ...h }); setShowNew(false); }} title={h.closed_at ? 'Ver / Reabrir' : 'Editar'}><Pencil className="h-3.5 w-3.5" /></button>
                        </td>
                      )}
                      <td className="px-3 py-2 text-muted-foreground">{h.meeting_day || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{h.meeting_time || '—'}</td>
                      <td className="px-3 py-2">{h.leader_name || '—'}</td>
                      <td className="px-3 py-2">{h.anfitrion_name || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{h.fecha_apertura || '—'}</td>
                      {canEdit && (
                        <td className="px-1 py-1">
                          <button className="p-1 rounded hover:bg-muted text-red-400 hover:text-red-300 transition-colors" onClick={() => handleDelete(h.id, h.name || '')}><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {grouped.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 10 : 8} className="text-center py-12 text-muted-foreground">
                  <Home className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No se encontraron hogares de paz.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit / Create Dialog */}
      <Dialog open={!!editHogar} onOpenChange={(o) => { if (!o) { setEditHogar(null); setShowNew(false); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showNew ? 'Nuevo Hogar de Paz' : `Editar Hogar — Cuerda ${editHogar?.cuerda_numero || '?'}`}</DialogTitle>
          </DialogHeader>
          {editHogar && (
            <div className="space-y-4">
              {!showNew && <p className="text-xs text-muted-foreground">Los cambios se reflejan en todas las solapas.</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                  <Input value={editHogar.name || ''} onChange={e => setField('name', e.target.value || null)} placeholder="Ej: Hogar Villa Lynch" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cuerda</label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={editHogar.cuerda_id || ''} onChange={e => setField('cuerda_id', e.target.value || null)}>
                    <option value="">Sin cuerda</option>
                    {(cuerdasList || []).map(c => {
                      const z = zonasList?.find(zo => zo.id === c.zona_id);
                      return <option key={c.id} value={c.id}>{c.numero} {z ? `— ${z.nombre}` : ''}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <AddressAutocomplete
                  value={editHogar.address || ''}
                  onChange={(addr, lat, lng) => {
                    setField('address', addr || null);
                    if (lat != null && lng != null && isWithinGBA(lat, lng)) {
                      setField('lat', lat);
                      setField('lng', lng);
                    }
                  }}
                  placeholder="Ej: Av Corrientes 4000, CABA"
                  biasLat={churchCoords?.lat ?? null}
                  biasLng={churchCoords?.lng ?? null}
                />
              </div>

              {/* Map — always visible for drag-and-drop pin placement */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Ubicación en el mapa</label>
                  {editHogar.lat && editHogar.lng && (
                    <a href={`https://www.google.com/maps?q=${editHogar.lat},${editHogar.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Abrir en Google Maps</a>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Arrastrá el pin o hacé clic en el mapa para setear la dirección.</p>
                <div
                  ref={(el) => {
                    if (!el || (el as any).__mapInit) return;
                    const initMap = () => {
                      if (!(window as any).google?.maps) return false;
                      (el as any).__mapInit = true;
                      const google = (window as any).google;
                      const center = editHogar.lat && editHogar.lng
                        ? { lat: editHogar.lat, lng: editHogar.lng }
                        : { lat: -34.58, lng: -58.52 };
                      const map = new google.maps.Map(el, {
                        center, zoom: editHogar.lat ? 16 : 13,
                        zoomControl: true, mapTypeControl: false, streetViewControl: false,
                        fullscreenControl: true, scrollwheel: true, gestureHandling: 'greedy',
                      });
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
                      return true;
                    };
                    if (!initMap()) {
                      const interval = setInterval(() => { if (initMap()) clearInterval(interval); }, 200);
                    }
                  }}
                  className="w-full h-[200px] rounded border"
                />
                {editHogar.lat && editHogar.lng && (
                  <p className="text-[10px] text-muted-foreground">Coordenadas: {editHogar.lat.toFixed(5)}, {editHogar.lng.toFixed(5)}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Día</label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={editHogar.meeting_day || ''} onChange={e => setField('meeting_day', e.target.value || null)}>
                    <option value="">Sin día</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Hora</label>
                  <Input value={editHogar.meeting_time || ''} onChange={e => setField('meeting_time', e.target.value || null)} placeholder="Ej: 20:00hs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Líder</label>
                  <Input value={editHogar.leader_name || ''} onChange={e => setField('leader_name', e.target.value || null)} placeholder="Nombre del líder" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Anfitrión</label>
                  <Input value={editHogar.anfitrion_name || ''} onChange={e => setField('anfitrion_name', e.target.value || null)} placeholder="Nombre del anfitrión" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fecha de apertura</label>
                  <Input type="date" value={editHogar.fecha_apertura || ''} onChange={e => setField('fecha_apertura', e.target.value || null)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fecha estimada de cierre</label>
                  <Input type="date" value={editHogar.fecha_cierre_estimada || ''} onChange={e => setField('fecha_cierre_estimada', e.target.value || null)} />
                </div>
              </div>

              {editHogar.closed_at && !showNew ? (
                <div className="p-3 rounded border border-red-500/30 bg-red-500/5 space-y-2">
                  <p className="text-sm text-red-400 font-medium">🔒 Hogar cerrado</p>
                  {editHogar.closed_reason && <p className="text-xs text-muted-foreground">Motivo: {editHogar.closed_reason}</p>}
                  <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                    await supabase.from('hogares_de_paz').update({ closed_at: null, closed_reason: null, closed_by: null }).eq('id', editHogar.id);
                    showSuccess('Hogar reabierto.');
                    setEditHogar(null);
                    queryClient.invalidateQueries({ queryKey: ['hogares-page', churchId] });
                  }}>
                    <Unlock className="h-3.5 w-3.5 mr-1.5" /> Reabrir Hogar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => { setEditHogar(null); setShowNew(false); }}>Cancelar</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
                  </div>
                  {!showNew && (
                    <div className="pt-2 border-t">
                      <Button variant="ghost" size="sm" className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => {
                        setCloseDialog({ id: editHogar.id, name: editHogar.name || '' });
                        setCloseReason('');
                        setEditHogar(null);
                      }}>
                        <Lock className="h-3.5 w-3.5 mr-1.5" /> Cerrar este hogar...
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={!!closeDialog} onOpenChange={(o) => { if (!o) setCloseDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cerrar hogar de paz</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a cerrar <strong>{closeDialog?.name || 'este hogar'}</strong>. Seguirá visible pero marcado como cerrado.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo del cierre</label>
              <Textarea value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Ej: Fin de ciclo, mudanza del anfitrión..." rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setCloseDialog(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={async () => {
                if (!closeDialog) return;
                const { error } = await supabase.from('hogares_de_paz').update({
                  closed_at: new Date().toISOString(),
                  closed_reason: closeReason.trim() || null,
                  closed_by: session?.user?.id,
                }).eq('id', closeDialog.id);
                if (error) { showError(error.message); return; }
                await supabase.from('activity_logs').insert({
                  user_id: session?.user?.id,
                  church_id: churchId,
                  action: 'close',
                  entity_type: 'hogar_de_paz',
                  entity_id: closeDialog.id,
                  after_data: { reason: closeReason.trim() || null },
                });
                showSuccess('Hogar cerrado.');
                setCloseDialog(null);
                queryClient.invalidateQueries({ queryKey: ['hogares-page', churchId] });
              }}>
                Cerrar Hogar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HogaresDePazPage;
