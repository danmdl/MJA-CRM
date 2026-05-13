import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Pencil, Lock, Unlock, PlusCircle, Upload, Trash2 } from 'lucide-react';
import { normalize } from '@/lib/normalize';
import { showSuccess, showError } from '@/utils/toast';
import { useConfirm } from '@/hooks/use-confirm';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import { useChurchCoords } from '@/hooks/use-church-coords';
import { usePermissions } from '@/lib/permissions';
import { useSession } from '@/hooks/use-session';
import ContactMapDialog from '@/components/admin/ContactMapDialog';
import { Textarea } from '@/components/ui/textarea';
import AddCellDialog from '@/components/admin/AddCellDialog';
import CellCsvImporter from '@/components/admin/CellCsvImporter';

interface CellRow {
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
  zona_nombre: string | null;
  referente_name: string | null;
  supervisor_name: string | null;
  closed_at: string | null;
  closed_reason: string | null;
}

const CelulasPage = () => {
  const confirm = useConfirm();
  const { churchId: _churchSlug } = useParams<{ churchId: string }>();
  const churchId = useChurchUuid();
  // Bias address autocomplete toward the church area.
  const { data: churchCoords } = useChurchCoords(churchId);
  const queryClient = useQueryClient();
  const { canEditCelulas, canSeeBaseDatosTotal, canEditCuerdas, canAddUsers } = usePermissions();
  const { session, profile } = useSession();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState<string>('all');
  const [editCell, setEditCell] = useState<CellRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [closeDialog, setCloseDialog] = useState<{ id: string; name: string } | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [mapCell, setMapCell] = useState<{ name: string; address: string; lat: number | null; lng: number | null } | null>(null);
  const [addCellOpen, setAddCellOpen] = useState(false);
  const [csvImporterOpen, setCsvImporterOpen] = useState(false);

  // If user doesn't have "see all" permission, only show their cuerda
  const userCuerda = profile?.numero_cuerda;
  const canSeeAll = canSeeBaseDatosTotal() || ['admin', 'general', 'pastor'].includes(profile?.role || '');

  const { data: cells, isLoading } = useQuery<CellRow[]>({
    queryKey: ['celulas-page', churchId, userCuerda, canSeeAll],
    queryFn: async () => {
      // Fire cells/cuerdas/zonas in parallel — they're independent, so waiting
      // serially is just network-stall time we don't need.
      const [cellsRes, cuerdasRes, zonasRes] = await Promise.all([
        supabase
          .from('cells')
          .select('id, name, address, lat, lng, meeting_day, meeting_time, leader_name, anfitrion_name, cuerda_id, closed_at, closed_reason')
          .eq('church_id', churchId!)
          .is('deleted_at', null),
        supabase.from('cuerdas').select('id, numero, zona_id, referente_name, supervisor_name'),
        supabase.from('zonas').select('id, nombre').eq('church_id', churchId!),
      ]);
      if (cellsRes.error) throw cellsRes.error;
      const data = cellsRes.data;
      const cuerdas = cuerdasRes.data;
      const zonas = zonasRes.data;

      const cuerdaMap = new Map((cuerdas || []).map(c => [c.id, c]));
      const zonaMap = new Map((zonas || []).map(z => [z.id, z]));

      const allCells = (data || []).map(cell => {
        const cuerda = cuerdaMap.get((cell as any).cuerda_id);
        const zona = cuerda ? zonaMap.get(cuerda.zona_id) : null;
        return {
          id: cell.id, name: cell.name, address: cell.address,
          lat: cell.lat, lng: cell.lng,
          meeting_day: cell.meeting_day, meeting_time: cell.meeting_time,
          leader_name: cell.leader_name, anfitrion_name: cell.anfitrion_name,
          cuerda_numero: cuerda?.numero || null, zona_nombre: zona?.nombre || null,
          referente_name: cuerda?.referente_name || null,
          supervisor_name: cuerda?.supervisor_name || null,
          closed_at: (cell as any).closed_at || null,
          closed_reason: (cell as any).closed_reason || null,
        };
      });

      // Filter by user's cuerda if they don't have "see all" permission
      if (!canSeeAll && userCuerda) {
        return allCells.filter(c => c.cuerda_numero === userCuerda);
      }
      return allCells;
    },
    enabled: !!churchId,
  });

  // Needed for AddCellDialog (cuerda picker) and CellCsvImporter
  const { data: cuerdasList } = useQuery<{ id: string; numero: string; zona_id: string }[]>({
    queryKey: ['cuerdas-celulas-page', churchId],
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

  // Needed for the CSV importer leader dropdown
  const { data: profilesMap } = useQuery<Record<string, string>>({
    queryKey: ['profilesMap-celulas', churchId],
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
    staleTime: 5 * 60_000,
  });

  const leadersList = useMemo(() => {
    if (!profilesMap) return [];
    return Object.entries(profilesMap).map(([id, name]) => ({ id, name }));
  }, [profilesMap]);

  const zonas = useMemo(() => {
    const set = new Set<string>();
    (cells || []).forEach(c => { if (c.zona_nombre) set.add(c.zona_nombre); });
    return Array.from(set).sort();
  }, [cells]);

  const filtered = useMemo(() => {
    let result = cells || [];
    if (zonaFilter !== 'all') result = result.filter(c => c.zona_nombre === zonaFilter);
    if (search) {
      const q = normalize(search);
      result = result.filter(c =>
        normalize(c.name || '').includes(q) || normalize(c.address || '').includes(q) ||
        normalize(c.leader_name || '').includes(q) || normalize(c.anfitrion_name || '').includes(q) ||
        normalize(c.cuerda_numero || '').includes(q) || normalize(c.referente_name || '').includes(q) ||
        normalize(c.supervisor_name || '').includes(q)
      );
    }
    return result;
  }, [cells, zonaFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, CellRow[]>();
    filtered.forEach(c => {
      const zona = c.zona_nombre || 'Sin zona';
      if (!map.has(zona)) map.set(zona, []);
      map.get(zona)!.push(c);
    });
    map.forEach(arr => arr.sort((a, b) => (a.cuerda_numero || '').localeCompare(b.cuerda_numero || '')));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const missingCount = (cells || []).filter(c => !c.address).length;

  // Admin only: delete every cell in the church (after double confirm)
  const deleteAllCells = async () => {
    const count = cells?.length || 0;
    if (count === 0) return;
    if (!(await confirm({
      title: `¿BORRAR TODAS las ${count} células?`,
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Continuar',
      destructive: true,
    }))) return;
    if (!(await confirm({
      title: 'CONFIRMACIÓN FINAL',
      description: `¿Estás seguro de borrar las ${count} células? Los contactos asignados quedarán sin célula.`,
      confirmLabel: 'Borrar todo',
      destructive: true,
    }))) return;
    await supabase.from('contacts').update({ cell_id: null }).eq('church_id', churchId!).not('cell_id', 'is', null);
    const { error } = await supabase.from('cells').delete().eq('church_id', churchId!);
    if (error) { showError(error.message); return; }
    showSuccess(`${count} células eliminadas.`);
    queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
    queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
    queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
    queryClient.invalidateQueries({ queryKey: ['cell-contact-counts', churchId] });
    queryClient.invalidateQueries({ queryKey: ['cuerdas-page'] });
  };

  const handleSave = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      // Get before state for activity log
      const { data: beforeData } = await supabase.from('cells').select('*').eq('id', editCell.id).single();

      const updatePayload = {
        address: editCell.address || null,
        lat: editCell.lat || null,
        lng: editCell.lng || null,
        meeting_day: editCell.meeting_day || null,
        meeting_time: editCell.meeting_time || null,
        leader_name: editCell.leader_name || null,
        anfitrion_name: editCell.anfitrion_name || null,
      };
      const { error } = await supabase.from('cells').update(updatePayload).eq('id', editCell.id);

      if (error) { showError(error.message); return; }

      // Log the edit to activity_logs
      const { data: afterData } = await supabase.from('cells').select('*').eq('id', editCell.id).single();
      await supabase.from('activity_logs').insert({
        user_id: session?.user?.id,
        church_id: churchId,
        action: 'update',
        entity_type: 'cell',
        entity_id: editCell.id,
        before_data: beforeData,
        after_data: afterData,
      });

      showSuccess('Célula actualizada. Los cambios se reflejan en todas las solapas.');
      setEditCell(null);
      queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
      queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
      queryClient.invalidateQueries({ queryKey: ['cell-contact-counts', churchId] });
      queryClient.invalidateQueries({ queryKey: ['overviewCells'] });
      queryClient.invalidateQueries({ queryKey: ['cells-pool'] });
      queryClient.invalidateQueries({ queryKey: ['cells'] });
      queryClient.invalidateQueries({ queryKey: ['cuerdas-page'] });
      queryClient.invalidateQueries({ queryKey: ['historial'] });
    } catch { showError('Error inesperado.'); } finally { setSaving(false); }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando células...</div>;

  return (
    <div className="space-y-4">
      {/* Single header row: title + count + search + zona filter + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Células</h1>
          {missingCount > 0 && <span className="text-xs text-red-400">{missingCount} sin dirección</span>}
          <span className="text-sm text-muted-foreground">{filtered.length} de {(cells || []).length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {profile?.role === 'admin' && (cells?.length || 0) > 0 && (
            <Button variant="outline" size="sm" className="text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={deleteAllCells}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Borrar todas
            </Button>
          )}
          {(canEditCuerdas() || canAddUsers()) && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCsvImporterOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Importar
              </Button>
              <Button size="sm" onClick={() => setAddCellOpen(true)}>
                <PlusCircle className="mr-1.5 h-4 w-4" /> Nueva
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Zona chips — kept on their own row because they wrap a lot */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setZonaFilter('all')} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === 'all' ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>Todas</button>
        {zonas.map(z => (
          <button key={z} onClick={() => setZonaFilter(z === zonaFilter ? 'all' : z)} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === z ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{z}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-xs w-[60px]">Cuerda</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Dirección</th>
              {canEditCelulas() && <th className="w-[32px]"></th>}
              <th className="text-left px-3 py-2 font-medium text-xs w-[90px]">Día</th>
              <th className="text-left px-3 py-2 font-medium text-xs w-[70px]">Hora</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Líder</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Anfitrión</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Referente</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Supervisor</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([zona, rows]) => (
              <React.Fragment key={zona}>
                <tr className="bg-muted/30">
                  <td colSpan={canEditCelulas() ? 9 : 8} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{zona} ({rows.length})</td>
                </tr>
                {rows.map(cell => {
                  const noAddr = !cell.address;
                  return (
                    <tr key={cell.id} className={`border-b hover:bg-muted/30 transition-colors ${cell.closed_at ? 'opacity-50' : noAddr ? 'bg-red-500/5' : ''}`}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {cell.cuerda_numero || '—'}
                        {cell.closed_at && <span className="ml-1 text-[9px] text-red-400" title={cell.closed_reason || 'Cerrada'}>🔒</span>}
                      </td>
                      <td className={`px-3 py-2 ${noAddr ? 'text-red-400 font-medium' : ''}`}>
                        {cell.closed_at ? (
                          <div>
                            <span className="text-sm text-red-400 line-through">{cell.address || cell.name}</span>
                            {cell.closed_reason && <p className="text-[10px] text-muted-foreground mt-0.5">Motivo: {cell.closed_reason}</p>}
                          </div>
                        ) : noAddr ? <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Sin dirección</span> : (
                          <div>
                            <span className="truncate max-w-[250px] block text-sm" title={cell.address!}>{cell.address}</span>
                            {cell.lat && cell.lng && (
                              <button onClick={() => setMapCell({ name: cell.name, address: cell.address!, lat: cell.lat, lng: cell.lng })} className="text-[10px] text-primary hover:underline">
                                Ver en Mapa ({cell.lat.toFixed(4)}, {cell.lng.toFixed(4)})
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      {canEditCelulas() && (
                        <td className="px-1 py-1">
                          <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={() => setEditCell({ ...cell })} title={cell.closed_at ? 'Ver / Reabrir' : 'Editar'}><Pencil className="h-3.5 w-3.5" /></button>
                        </td>
                      )}
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_day || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_time || '—'}</td>
                      <td className="px-3 py-2">{cell.leader_name || '—'}</td>
                      <td className="px-3 py-2">{cell.anfitrion_name || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.referente_name || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.supervisor_name || '—'}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {grouped.length === 0 && <tr><td colSpan={canEditCelulas() ? 9 : 8} className="text-center py-8 text-muted-foreground">No se encontraron células.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Edit dialog — updates the cells table directly, all pages see the change */}
      <Dialog open={!!editCell} onOpenChange={(o) => { if (!o) { setEditCell(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Célula — Cuerda {editCell?.cuerda_numero}</DialogTitle>
          </DialogHeader>
          {editCell && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Los cambios se reflejan en todas las solapas: Cuerdas, Mapa y Semillero.</p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <AddressAutocomplete
                  value={editCell.address || ''}
                  onChange={(addr, lat, lng) => {
                    setEditCell(prev => prev ? {
                      ...prev,
                      address: addr || null,
                      ...(lat != null ? { lat } : {}),
                      ...(lng != null ? { lng } : {}),
                    } : null);
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
                  {editCell.lat && editCell.lng && (
                    <a
                      href={`https://www.google.com/maps?q=${editCell.lat},${editCell.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline"
                    >
                      Abrir en Google Maps
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Arrastrá el pin o hacé clic en el mapa para setear la dirección.</p>
                <div
                  ref={(el) => {
                    if (!el) return;
                    if ((el as any).__mapInit) return;
                    const initMap = () => {
                      if (!(window as any).google?.maps) return false;
                      (el as any).__mapInit = true;
                      const google = (window as any).google;
                    const center = editCell.lat && editCell.lng
                      ? { lat: editCell.lat, lng: editCell.lng }
                      : { lat: -34.58, lng: -58.46 }; // Default: Buenos Aires
                    const map = new google.maps.Map(el, {
                      center,
                      zoom: editCell.lat ? 16 : 12,
                      zoomControl: true,
                      mapTypeControl: false,
                      streetViewControl: false,
                      fullscreenControl: true,
                      scrollwheel: true,
                      gestureHandling: 'greedy',
                    });
                    const marker = new google.maps.Marker({
                      position: center,
                      map,
                      draggable: true,
                    });
                    // Click on map → move pin
                    map.addListener('click', (e: any) => {
                      const lat = e.latLng.lat();
                      const lng = e.latLng.lng();
                      marker.setPosition(e.latLng);
                      const geocoder = new google.maps.Geocoder();
                      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                        if (status === 'OK' && results[0]) {
                          setEditCell(prev => prev ? { ...prev, lat, lng, address: results[0].formatted_address } : null);
                        } else {
                          setEditCell(prev => prev ? { ...prev, lat, lng } : null);
                        }
                      });
                    });
                    // Drag marker → update
                    marker.addListener('dragend', () => {
                      const pos = marker.getPosition();
                      const lat = pos.lat();
                      const lng = pos.lng();
                      const geocoder = new google.maps.Geocoder();
                      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                        if (status === 'OK' && results[0]) {
                          setEditCell(prev => prev ? { ...prev, lat, lng, address: results[0].formatted_address } : null);
                        } else {
                          setEditCell(prev => prev ? { ...prev, lat, lng } : null);
                        }
                      });
                    });
                      return true;
                    };
                    // If Google Maps isn't loaded yet, retry every 200ms until it is
                    if (!initMap()) {
                      const interval = setInterval(() => {
                        if (initMap()) clearInterval(interval);
                      }, 200);
                    }
                  }}
                  className="w-full h-[250px] rounded border"
                />
                {editCell.lat && editCell.lng && (
                  <p className="text-[10px] text-muted-foreground">Coordenadas: {editCell.lat.toFixed(5)}, {editCell.lng.toFixed(5)}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Día</label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={editCell.meeting_day || ''} onChange={e => setEditCell(prev => prev ? { ...prev, meeting_day: e.target.value || null } : null)}>
                    <option value="">Sin día</option>
                    {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Hora</label>
                  <Input value={editCell.meeting_time || ''} onChange={e => setEditCell(prev => prev ? { ...prev, meeting_time: e.target.value || null } : null)} placeholder="Ej: 20:00hs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Líder</label>
                  <Input value={editCell.leader_name || ''} onChange={e => setEditCell(prev => prev ? { ...prev, leader_name: e.target.value || null } : null)} placeholder="Nombre del líder" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Anfitrión</label>
                  <Input value={editCell.anfitrion_name || ''} onChange={e => setEditCell(prev => prev ? { ...prev, anfitrion_name: e.target.value || null } : null)} placeholder="Nombre del anfitrión" />
                </div>
              </div>

              {editCell.closed_at ? (
                <div className="p-3 rounded border border-red-500/30 bg-red-500/5 space-y-2">
                  <p className="text-sm text-red-400 font-medium">🔒 Célula cerrada</p>
                  {editCell.closed_reason && <p className="text-xs text-muted-foreground">Motivo: {editCell.closed_reason}</p>}
                  <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                    await supabase.from('cells').update({ closed_at: null, closed_reason: null, closed_by: null }).eq('id', editCell.id);
                    showSuccess(`${editCell.name} reabierta.`);
                    setEditCell(null);
                    queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
                    queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
                  }}>
                    <Unlock className="h-3.5 w-3.5 mr-1.5" /> Reabrir Célula
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => { setEditCell(null); }}>Cancelar</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
                  </div>
                  <div className="pt-2 border-t">
                    <Button variant="ghost" size="sm" className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => {
                      setCloseDialog({ id: editCell.id, name: editCell.name });
                      setCloseReason('');
                      setEditCell(null);
                    }}>
                      <Lock className="h-3.5 w-3.5 mr-1.5" /> Cerrar esta célula...
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Map popup for cell */}
      <ContactMapDialog
        open={!!mapCell}
        onOpenChange={(o) => { if (!o) setMapCell(null); }}
        contactName={mapCell?.name || ''}
        contactAddress={mapCell?.address || ''}
        churchAddress={churchCoords?.address || null}
        suggestedCell={null}
      />

      {/* Close cell dialog */}
      <Dialog open={!!closeDialog} onOpenChange={(o) => { if (!o) setCloseDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cerrar célula</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a cerrar <strong>{closeDialog?.name}</strong>. La célula seguirá visible pero marcada como cerrada.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo del cierre</label>
              <Textarea
                value={closeReason}
                onChange={e => setCloseReason(e.target.value)}
                placeholder="Ej: Mudanza del anfitrión, falta de asistentes..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setCloseDialog(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={async () => {
                if (!closeDialog) return;
                const { error } = await supabase.from('cells').update({
                  closed_at: new Date().toISOString(),
                  closed_reason: closeReason.trim() || null,
                  closed_by: session?.user?.id,
                }).eq('id', closeDialog.id);
                if (error) { showError(error.message); return; }
                await supabase.from('activity_logs').insert({
                  user_id: session?.user?.id,
                  church_id: churchId,
                  action: 'close',
                  entity_type: 'cell',
                  entity_id: closeDialog.id,
                  before_data: null,
                  after_data: { reason: closeReason.trim() || null },
                });
                showSuccess(`${closeDialog.name} cerrada.`);
                setCloseDialog(null);
                queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
                queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
              }}>
                Cerrar Célula
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create cell dialog */}
      <AddCellDialog
        open={addCellOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddCellOpen(false);
            queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
            queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
            queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
            queryClient.invalidateQueries({ queryKey: ['cuerdas-page'] });
          } else {
            setAddCellOpen(o);
          }
        }}
        churchId={churchId!}
      />

      {/* Bulk CSV importer */}
      <CellCsvImporter
        open={csvImporterOpen}
        onOpenChange={setCsvImporterOpen}
        churchId={churchId!}
        cuerdas={cuerdasList || []}
        leaders={leadersList}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['celulas-page', churchId] });
          queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
          queryClient.invalidateQueries({ queryKey: ['cells-map', churchId] });
          queryClient.invalidateQueries({ queryKey: ['cuerdas-page'] });
        }}
      />
    </div>
  );
};

export default CelulasPage;
