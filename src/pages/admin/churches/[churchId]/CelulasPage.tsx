import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Pencil } from 'lucide-react';
import { normalize } from '@/lib/normalize';
import { showSuccess, showError } from '@/utils/toast';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';

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
}

const CelulasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState<string>('all');
  const [editCell, setEditCell] = useState<CellRow | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: cells, isLoading } = useQuery<CellRow[]>({
    queryKey: ['celulas-page', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name, address, lat, lng, meeting_day, meeting_time, leader_name, anfitrion_name, cuerda_id')
        .eq('church_id', churchId!);
      if (error) throw error;

      const { data: cuerdas } = await supabase.from('cuerdas').select('id, numero, zona_id');
      const { data: zonas } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);

      const cuerdaMap = new Map((cuerdas || []).map(c => [c.id, c]));
      const zonaMap = new Map((zonas || []).map(z => [z.id, z]));

      return (data || []).map(cell => {
        const cuerda = cuerdaMap.get((cell as any).cuerda_id);
        const zona = cuerda ? zonaMap.get(cuerda.zona_id) : null;
        return {
          id: cell.id, name: cell.name, address: cell.address,
          lat: cell.lat, lng: cell.lng,
          meeting_day: cell.meeting_day, meeting_time: cell.meeting_time,
          leader_name: cell.leader_name, anfitrion_name: cell.anfitrion_name,
          cuerda_numero: cuerda?.numero || null, zona_nombre: zona?.nombre || null,
        };
      });
    },
    enabled: !!churchId,
  });

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
        normalize(c.cuerda_numero || '').includes(q)
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

  const handleSave = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('cells').update({
        address: editCell.address || null,
        lat: editCell.lat || null,
        lng: editCell.lng || null,
        meeting_day: editCell.meeting_day || null,
        meeting_time: editCell.meeting_time || null,
        leader_name: editCell.leader_name || null,
        anfitrion_name: editCell.anfitrion_name || null,
      }).eq('id', editCell.id);

      if (error) { showError(error.message); return; }
      showSuccess('Célula actualizada. Los cambios se reflejan en todas las solapas.');
      setEditCell(null);
      // Invalidate ALL cell-related queries so every page sees the update
      queryClient.invalidateQueries({ queryKey: ['celulas-page'] });
      queryClient.invalidateQueries({ queryKey: ['overviewCells'] });
      queryClient.invalidateQueries({ queryKey: ['cells-pool'] });
      queryClient.invalidateQueries({ queryKey: ['cells'] });
      queryClient.invalidateQueries({ queryKey: ['cuerdas-page'] });
    } catch { showError('Error inesperado.'); } finally { setSaving(false); }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando células...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Células</h1>
        <div className="flex items-center gap-3">
          {missingCount > 0 && <span className="text-xs text-red-400">{missingCount} sin dirección</span>}
          <span className="text-sm text-muted-foreground">{filtered.length} de {(cells || []).length}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setZonaFilter('all')} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === 'all' ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>Todas</button>
          {zonas.map(z => (
            <button key={z} onClick={() => setZonaFilter(z === zonaFilter ? 'all' : z)} className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === z ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{z}</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-xs w-[60px]">Cuerda</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Dirección</th>
              <th className="text-left px-3 py-2 font-medium text-xs w-[90px]">Día</th>
              <th className="text-left px-3 py-2 font-medium text-xs w-[70px]">Hora</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Líder</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Anfitrión</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([zona, rows]) => (
              <React.Fragment key={zona}>
                <tr className="bg-muted/30">
                  <td colSpan={7} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{zona} ({rows.length})</td>
                </tr>
                {rows.map(cell => {
                  const noAddr = !cell.address;
                  return (
                    <tr key={cell.id} className={`border-b hover:bg-muted/30 transition-colors ${noAddr ? 'bg-red-500/5' : ''}`}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{cell.cuerda_numero || '—'}</td>
                      <td className={`px-3 py-2 ${noAddr ? 'text-red-400 font-medium' : ''}`}>
                        {noAddr ? <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Sin dirección</span> : <span className="truncate max-w-[300px] block" title={cell.address!}>{cell.address}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_day || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_time || '—'}</td>
                      <td className="px-3 py-2">{cell.leader_name || '—'}</td>
                      <td className="px-3 py-2">{cell.anfitrion_name || '—'}</td>
                      <td className="px-3 py-1">
                        <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={() => setEditCell({ ...cell })} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {grouped.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No se encontraron células.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Edit dialog — updates the cells table directly, all pages see the change */}
      <Dialog open={!!editCell} onOpenChange={(o) => { if (!o) setEditCell(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Célula — Cuerda {editCell?.cuerda_numero}</DialogTitle>
          </DialogHeader>
          {editCell && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Los cambios se reflejan en todas las solapas: Cuerdas, Mapa, Base de Datos y Pool.</p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <AddressAutocomplete
                  value={editCell.address || ''}
                  onChange={(addr, lat, lng) => setEditCell(prev => prev ? { ...prev, address: addr || null, ...(lat != null ? { lat } : {}), ...(lng != null ? { lng } : {}) } : null)}
                  placeholder="Ej: Av Corrientes 4000, CABA"
                />
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

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setEditCell(null)}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CelulasPage;
