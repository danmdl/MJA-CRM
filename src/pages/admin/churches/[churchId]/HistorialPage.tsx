"use client";
import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { normalize } from '@/lib/normalize';

const ART_TZ = 'America/Argentina/Buenos_Aires';

const formatART = (ts: string) => {
  try {
    return format(toZonedTime(new Date(ts), ART_TZ), 'dd/MM/yyyy HH:mm:ss');
  } catch {
    return ts;
  }
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Creación',
  update: 'Edición',
  delete: 'Eliminación',
  assign: 'Asignación',
  login: 'Login',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/15 text-green-400',
  update: 'bg-amber-500/15 text-amber-400',
  delete: 'bg-red-500/15 text-red-400',
  assign: 'bg-purple-500/15 text-purple-400',
  login:  'bg-blue-500/15 text-blue-400',
};

interface ActivityRow {
  id: string;
  user_id: string | null;
  church_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: any;
  after_data: any;
  created_at: string;
  profiles?: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

const actorName = (r: ActivityRow): string => {
  const p = r.profiles;
  if (!p) return 'Sistema';
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || p.email || 'Usuario';
};

// Activity rows touching contacts carry numero_cuerda and sexo inside
// after_data (creates/updates) or before_data (deletes). Pull whichever
// side is present so filters work for all three.
const extractCuerda = (r: ActivityRow): string | null =>
  r.after_data?.numero_cuerda ?? r.before_data?.numero_cuerda ?? null;
const extractSexo = (r: ActivityRow): string | null =>
  r.after_data?.sexo ?? r.before_data?.sexo ?? null;

const HistorialRow = ({ row }: { row: ActivityRow }) => {
  const [expanded, setExpanded] = useState(false);
  const cuerda = extractCuerda(row);
  const sexo = extractSexo(row);
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(v => !v)}>
        <TableCell className="font-mono text-xs whitespace-nowrap">{formatART(row.created_at)}</TableCell>
        <TableCell className="text-sm">{actorName(row)}</TableCell>
        <TableCell>
          <Badge className={`${ACTION_COLORS[row.action] || 'bg-muted'} hover:bg-opacity-100 text-xs`}>
            {ACTION_LABELS[row.action] || row.action}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{row.entity_type || '—'}</TableCell>
        <TableCell className="text-xs">{cuerda || '—'}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{sexo || '—'}</TableCell>
        <TableCell className="w-6">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={7} className="p-4">
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <p className="font-semibold text-muted-foreground mb-1">ANTES</p>
                <pre className="whitespace-pre-wrap text-foreground bg-background border rounded p-2 overflow-auto max-h-64">
                  {row.before_data ? JSON.stringify(row.before_data, null, 2) : 'N/A'}
                </pre>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">DESPUÉS</p>
                <pre className="whitespace-pre-wrap text-foreground bg-background border rounded p-2 overflow-auto max-h-64">
                  {row.after_data ? JSON.stringify(row.after_data, null, 2) : 'N/A'}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const HistorialPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [cuerdaFilter, setCuerdaFilter] = useState<string>('all');
  const [sexoFilter, setSexoFilter] = useState<string>('all');

  const { data: rows, isLoading, refetch } = useQuery<ActivityRow[]>({
    queryKey: ['historial', churchId],
    queryFn: async () => {
      if (!churchId) return [];
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, user_id, church_id, action, entity_type, entity_id, before_data, after_data, created_at, profiles!activity_logs_user_id_profiles_fkey(first_name, last_name, email)')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        // FK alias may not exist; fall back to no join.
        const { data: fallback } = await supabase
          .from('activity_logs')
          .select('id, user_id, church_id, action, entity_type, entity_id, before_data, after_data, created_at')
          .eq('church_id', churchId)
          .order('created_at', { ascending: false })
          .limit(500);
        return (fallback as any) || [];
      }
      return (data as any) || [];
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const cuerdaOptions = useMemo(() => {
    const set = new Set<string>();
    (rows || []).forEach(r => {
      const c = extractCuerda(r);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    return (rows || []).filter(r => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      const c = extractCuerda(r);
      if (cuerdaFilter !== 'all' && c !== cuerdaFilter) return false;
      const s = extractSexo(r);
      if (sexoFilter !== 'all' && s !== sexoFilter) return false;
      if (!q) return true;
      const haystack = [
        actorName(r),
        r.action,
        r.entity_type,
        c,
        JSON.stringify(r.after_data || r.before_data || {}),
      ].filter(Boolean).join(' ');
      return normalize(haystack).includes(q);
    });
  }, [rows, search, actionFilter, cuerdaFilter, sexoFilter]);

  const clearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setCuerdaFilter('all');
    setSexoFilter('all');
  };

  const hasActiveFilters = !!search || actionFilter !== 'all' || cuerdaFilter !== 'all' || sexoFilter !== 'all';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Historial de actividad</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Buscar por usuario, tipo, dato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            <SelectItem value="create">Creaciones</SelectItem>
            <SelectItem value="update">Ediciones</SelectItem>
            <SelectItem value="delete">Eliminaciones</SelectItem>
            <SelectItem value="assign">Asignaciones</SelectItem>
            <SelectItem value="login">Logins</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cuerdaFilter} onValueChange={setCuerdaFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Cuerda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuerdas</SelectItem>
            {cuerdaOptions.map(c => (
              <SelectItem key={c} value={c}>Cuerda {c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sexoFilter} onValueChange={setSexoFilter}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Sexo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="M">Masculino</SelectItem>
            <SelectItem value="F">Femenino</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar filtros</Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        Mostrando {filtered.length}{hasActiveFilters && rows ? ` de ${rows.length}` : ''} evento{filtered.length !== 1 ? 's' : ''} · Hora en Argentina (ART UTC-3) · Últimos 500 eventos · Click en una fila para ver before/after
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora (ART)</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cuerda</TableHead>
              <TableHead>Sexo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin eventos.</TableCell></TableRow>
            ) : (
              filtered.map(r => <HistorialRow key={r.id} row={r} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HistorialPage;
