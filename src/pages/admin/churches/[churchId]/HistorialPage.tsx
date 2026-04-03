import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { normalize } from '@/lib/normalize';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: any;
  after_data: any;
  created_at: string;
  user_name?: string;
}

const ACTION_LABELS: Record<string, string> = {
  update: 'Editó',
  create: 'Creó',
  delete: 'Eliminó',
  assign: 'Asignó',
  transfer: 'Transfirió',
};

const ENTITY_LABELS: Record<string, string> = {
  contact: 'contacto',
  contact_log: 'registro de contacto',
  cell: 'célula',
  cuerda: 'cuerda',
  profile: 'perfil',
};

const getChangedFields = (before: any, after: any): { field: string; from: any; to: any }[] => {
  if (!before || !after) return [];
  const changes: { field: string; from: any; to: any }[] = [];
  const skipKeys = new Set(['id', 'church_id', 'created_at', 'created_by', 'updated_at']);
  for (const key of Object.keys(after)) {
    if (skipKeys.has(key)) continue;
    const bVal = before[key];
    const aVal = after[key];
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes.push({ field: key, from: bVal, to: aVal });
    }
  }
  return changes;
};

const formatFieldName = (field: string): string => {
  const map: Record<string, string> = {
    first_name: 'Nombre', last_name: 'Apellido', phone: 'Teléfono', address: 'Dirección',
    numero_cuerda: 'Cuerda', zona: 'Zona', cell_id: 'Célula', estado_seguimiento: 'Estado',
    observaciones: 'Observaciones', pedido_de_oracion: 'Pedido de oración',
    barrio: 'Barrio', apartment_number: 'Departamento', date_of_birth: 'Nacimiento',
    leader_assigned: 'Líder', conector: 'Conector', edad: 'Edad', sexo: 'Sexo',
    estado_civil: 'Estado civil', meeting_day: 'Día', meeting_time: 'Hora',
    leader_name: 'Líder', anfitrion_name: 'Anfitrión', zona_id: 'Zona ID',
    lat: 'Latitud', lng: 'Longitud', email: 'Email',
  };
  return map[field] || field;
};

const HistorialPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const { data: logs, isLoading } = useQuery<LogEntry[]>({
    queryKey: ['historial', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('church_id', churchId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      // Resolve user names
      const userIds = [...new Set((data || []).map(d => d.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre']));

      return (data || []).map(log => ({
        ...log,
        user_name: nameMap.get(log.user_id) || 'Sistema',
      }));
    },
    enabled: !!churchId,
  });

  const filtered = useMemo(() => {
    let result = logs || [];
    if (filterType !== 'all') result = result.filter(l => l.entity_type === filterType);
    if (search) {
      const q = normalize(search);
      result = result.filter(l =>
        normalize(l.user_name || '').includes(q) ||
        normalize(l.action || '').includes(q) ||
        normalize(l.entity_type || '').includes(q) ||
        normalize(JSON.stringify(l.after_data || {})).includes(q)
      );
    }
    return result;
  }, [logs, filterType, search]);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    (logs || []).forEach(l => { if (l.entity_type) set.add(l.entity_type); });
    return Array.from(set).sort();
  }, [logs]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando historial...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Historial de Actividad</h1>
        <span className="text-sm text-muted-foreground">{filtered.length} registros</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterType('all')} className={`px-2.5 py-1 rounded text-xs border transition-colors ${filterType === 'all' ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>Todos</button>
          {entityTypes.map(t => (
            <button key={t} onClick={() => setFilterType(t === filterType ? 'all' : t)} className={`px-2.5 py-1 rounded text-xs border transition-colors ${filterType === t ? 'bg-primary/20 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{ENTITY_LABELS[t] || t}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Sin actividad registrada.</p>}
        {filtered.map(log => {
          const changes = getChangedFields(log.before_data, log.after_data);
          const contactName = log.after_data
            ? `${log.after_data.first_name || ''} ${log.after_data.last_name || ''}`.trim()
            : '';

          return (
            <div key={log.id} className="p-3 rounded border hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{log.user_name}</span>
                    {' '}
                    <span className="text-muted-foreground">{ACTION_LABELS[log.action] || log.action}</span>
                    {' '}
                    <span className="text-muted-foreground">{ENTITY_LABELS[log.entity_type] || log.entity_type}</span>
                    {contactName && <span className="font-medium"> — {contactName}</span>}
                  </p>

                  {changes.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {changes.slice(0, 5).map((ch, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">{formatFieldName(ch.field)}:</span>
                          {' '}
                          {ch.from != null && ch.from !== '' ? (
                            <><span className="line-through opacity-50">{String(ch.from).slice(0, 40)}</span> → </>
                          ) : null}
                          <span>{ch.to != null ? String(ch.to).slice(0, 40) : '(vacío)'}</span>
                        </p>
                      ))}
                      {changes.length > 5 && <p className="text-[10px] text-muted-foreground">+{changes.length - 5} campo(s) más</p>}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  {format(new Date(log.created_at), "d MMM yy, HH:mm", { locale: es })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistorialPage;
