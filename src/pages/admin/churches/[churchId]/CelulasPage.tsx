import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search, MapPin } from 'lucide-react';
import { normalize } from '@/lib/normalize';

interface CellRow {
  id: string;
  name: string;
  address: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  leader_name: string | null;
  anfitrion_name: string | null;
  cuerda_numero: string | null;
  zona_nombre: string | null;
}

const CelulasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [search, setSearch] = useState('');
  const [zonaFilter, setZonaFilter] = useState<string>('all');

  const { data: cells, isLoading } = useQuery<CellRow[]>({
    queryKey: ['celulas-page', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cells')
        .select('id, name, address, meeting_day, meeting_time, leader_name, anfitrion_name, cuerda_id')
        .eq('church_id', churchId!);
      if (error) throw error;

      // Fetch cuerdas + zonas for mapping
      const { data: cuerdas } = await supabase.from('cuerdas').select('id, numero, zona_id');
      const { data: zonas } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);

      const cuerdaMap = new Map((cuerdas || []).map(c => [c.id, c]));
      const zonaMap = new Map((zonas || []).map(z => [z.id, z]));

      return (data || []).map(cell => {
        const cuerda = cuerdaMap.get(cell.cuerda_id);
        const zona = cuerda ? zonaMap.get(cuerda.zona_id) : null;
        return {
          ...cell,
          cuerda_numero: cuerda?.numero || null,
          zona_nombre: zona?.nombre || null,
        };
      });
    },
    enabled: !!churchId,
  });

  // Get unique zonas for filter
  const zonas = useMemo(() => {
    const set = new Set<string>();
    (cells || []).forEach(c => { if (c.zona_nombre) set.add(c.zona_nombre); });
    return Array.from(set).sort();
  }, [cells]);

  // Filter and group
  const filtered = useMemo(() => {
    let result = cells || [];
    if (zonaFilter !== 'all') result = result.filter(c => c.zona_nombre === zonaFilter);
    if (search) {
      const q = normalize(search);
      result = result.filter(c =>
        normalize(c.name || '').includes(q) ||
        normalize(c.address || '').includes(q) ||
        normalize(c.leader_name || '').includes(q) ||
        normalize(c.anfitrion_name || '').includes(q) ||
        normalize(c.cuerda_numero || '').includes(q)
      );
    }
    return result;
  }, [cells, zonaFilter, search]);

  // Group by zona
  const grouped = useMemo(() => {
    const map = new Map<string, CellRow[]>();
    filtered.forEach(c => {
      const zona = c.zona_nombre || 'Sin zona';
      if (!map.has(zona)) map.set(zona, []);
      map.get(zona)!.push(c);
    });
    // Sort cells within each zona by cuerda
    map.forEach(arr => arr.sort((a, b) => (a.cuerda_numero || '').localeCompare(b.cuerda_numero || '')));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const missingCount = (cells || []).filter(c => !c.address).length;

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Cargando células...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Células</h1>
        <div className="flex items-center gap-3">
          {missingCount > 0 && (
            <span className="text-xs text-red-400">{missingCount} sin dirección</span>
          )}
          <span className="text-sm text-muted-foreground">{filtered.length} de {(cells || []).length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setZonaFilter('all')}
            className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === 'all' ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            Todas
          </button>
          {zonas.map(z => (
            <button
              key={z}
              onClick={() => setZonaFilter(z === zonaFilter ? 'all' : z)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${zonaFilter === z ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-xs">Cuerda</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Dirección</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Día</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Hora</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Líder</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Anfitrión</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([zona, rows]) => (
              <React.Fragment key={zona}>
                {/* Zona header row */}
                <tr className="bg-muted/30">
                  <td colSpan={6} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                    {zona} ({rows.length})
                  </td>
                </tr>
                {rows.map(cell => {
                  const noAddr = !cell.address;
                  return (
                    <tr key={cell.id} className={`border-b hover:bg-muted/30 transition-colors ${noAddr ? 'bg-red-500/5' : ''}`}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{cell.cuerda_numero || '—'}</td>
                      <td className={`px-3 py-2 ${noAddr ? 'text-red-400 font-medium' : ''}`}>
                        {noAddr ? (
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Sin dirección</span>
                        ) : (
                          <span className="truncate max-w-[300px] block" title={cell.address!}>{cell.address}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_day || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell.meeting_time || '—'}</td>
                      <td className="px-3 py-2">{cell.leader_name || '—'}</td>
                      <td className="px-3 py-2">{cell.anfitrion_name || '—'}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {grouped.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No se encontraron células.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CelulasPage;
