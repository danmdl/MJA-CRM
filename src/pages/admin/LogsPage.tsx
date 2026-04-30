"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { showSuccess } from '@/utils/toast';

const ART_TZ = 'America/Argentina/Buenos_Aires';

const formatART = (ts: string) => {
  try {
    const zoned = toZonedTime(new Date(ts), ART_TZ);
    return format(zoned, 'dd/MM/yyyy HH:mm:ss');
  } catch {
    return ts;
  }
};

const LEVEL_COLORS: Record<string, string> = {
  error: 'bg-red-500 hover:bg-red-500',
  warn: 'bg-yellow-500 hover:bg-yellow-500',
  info: 'bg-blue-500 hover:bg-blue-500',
};

interface LogEntry {
  id: string;
  created_at: string;
  user_email: string | null;
  level: string;
  action: string | null;
  payload: any;
  error_message: string | null;
  error_code: string | null;
  context: any;
  resolved: boolean;
}

const LogRow = ({ log, onResolve }: { log: LogEntry; onResolve: (id: string) => void }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className={`${log.resolved ? 'opacity-40' : ''} cursor-pointer hover:bg-muted/50`}
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell className="text-xs font-mono whitespace-nowrap">{formatART(log.created_at)}</TableCell>
        <TableCell className="text-xs">{log.user_email || '-'}</TableCell>
        <TableCell>
          <Badge className={`text-white text-xs ${LEVEL_COLORS[log.level] || ''}`}>{log.level}</Badge>
        </TableCell>
        <TableCell className="text-sm font-mono">{log.action || '-'}</TableCell>
        <TableCell className="text-sm text-red-400 max-w-xs truncate">{log.error_message || '-'}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{log.context?.url || '-'}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {!log.resolved && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(log.id)} title="Marcar como resuelto">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </Button>
            )}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className={log.resolved ? 'opacity-40' : ''}>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <p className="font-semibold text-muted-foreground mb-1">PAYLOAD (lo que envió)</p>
                <pre className="whitespace-pre-wrap text-foreground bg-background border rounded p-2 overflow-auto max-h-48">
                  {log.payload ? JSON.stringify(log.payload, null, 2) : 'N/A'}
                </pre>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">CONTEXTO</p>
                <pre className="whitespace-pre-wrap text-foreground bg-background border rounded p-2 overflow-auto max-h-48">
                  {log.context ? JSON.stringify(log.context, null, 2) : 'N/A'}
                </pre>
              </div>
            </div>
            {log.error_code && (
              <p className="mt-2 text-xs text-muted-foreground">Código de error: <span className="font-mono text-red-400">{log.error_code}</span></p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const LogsPage = () => {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [view, setView] = useState<'errors' | 'activity'>('errors');
  const [activityFilter, setActivityFilter] = useState<'all' | 'login' | 'create' | 'update' | 'delete' | 'assign'>('all');
  const queryClient = useQueryClient();

  const { data: logs, isLoading, refetch } = useQuery<LogEntry[]>({
    queryKey: ['client_logs', showResolved],
    queryFn: async () => {
      let q = supabase
        .from('client_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!showResolved) q = q.eq('resolved', false);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_logs').update({ resolved: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Marcado como resuelto');
      queryClient.invalidateQueries({ queryKey: ['client_logs'] });
    },
  });

  // Activity logs (logins, creates, updates, deletes) — for the activity view
  const { data: activity } = useQuery<any[]>({
    queryKey: ['activity_logs_recent', activityFilter],
    queryFn: async () => {
      let q = supabase
        .from('activity_logs')
        .select('id, user_id, action, entity_type, entity_id, created_at, profiles!activity_logs_user_id_profiles_fkey(first_name, last_name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (activityFilter !== 'all') q = q.eq('action', activityFilter);
      const { data, error } = await q;
      if (error) {
        // FK might not exist; fall back without join
        const { data: fallback } = await supabase
          .from('activity_logs')
          .select('id, user_id, action, entity_type, entity_id, created_at')
          .order('created_at', { ascending: false })
          .limit(200);
        return fallback || [];
      }
      return data || [];
    },
    refetchInterval: 30_000,
    enabled: view === 'activity',
  });

  // Currently online users — anyone who logged in within the last 30 minutes
  const { data: onlineUsers } = useQuery<any[]>({
    queryKey: ['online_users'],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('activity_logs')
        .select('user_id, created_at, profiles!activity_logs_user_id_profiles_fkey(first_name, last_name, email)')
        .eq('action', 'login')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      // Dedup by user_id (latest first)
      const seen = new Set<string>();
      const unique: any[] = [];
      (data || []).forEach((row: any) => {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          unique.push(row);
        }
      });
      return unique;
    },
    refetchInterval: 60_000,
    enabled: view === 'activity',
  });

  const filtered = (logs || []).filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (search) {
      const s = normalize(search);
      return normalize([log.user_email, log.action, log.error_message, log.context?.url]
        .join(' ')).includes(s);
    }
    return true;
  });

  const errorCount = (logs || []).filter(l => l.level === 'error' && !l.resolved).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Logs del Sistema</h1>
          {errorCount > 0 && view === 'errors' && (
            <Badge className="bg-red-500 hover:bg-red-500 text-white">{errorCount} errores sin resolver</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* View tabs */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setView('errors')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'errors' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Errores del sistema
        </button>
        <button
          onClick={() => setView('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'activity' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Actividad de usuarios
        </button>
      </div>

      {view === 'activity' && (
        <>
          {/* Online now panel */}
          <div className="mb-4 p-4 border rounded-lg bg-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-sm font-semibold">En línea ahora ({(onlineUsers || []).length})</h3>
              <span className="text-xs text-muted-foreground">— últimos 30 minutos</span>
            </div>
            {(onlineUsers || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie conectado en los últimos 30 minutos.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {(onlineUsers || []).map((u: any) => {
                  const name = u.profiles ? [u.profiles.first_name, u.profiles.last_name].filter(Boolean).join(' ') : (u.profiles?.email || 'Usuario');
                  return (
                    <div key={u.user_id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="font-medium">{name || u.profiles?.email || 'Usuario'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{formatART(u.created_at).split(' ')[1]}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { v: 'all', l: 'Todas' },
              { v: 'login', l: 'Logins' },
              { v: 'create', l: 'Creaciones' },
              { v: 'update', l: 'Ediciones' },
              { v: 'delete', l: 'Eliminaciones' },
              { v: 'assign', l: 'Asignaciones' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setActivityFilter(v as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${activityFilter === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Activity table */}
          <div className="text-xs text-muted-foreground mb-2">
            Mostrando {(activity || []).length} eventos · Hora en Argentina (ART UTC-3) · Se actualiza cada 30s
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora (ART)</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(activity || []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin actividad registrada.</TableCell></TableRow>
                ) : (
                  (activity || []).map((row: any) => {
                    const name = row.profiles ? [row.profiles.first_name, row.profiles.last_name].filter(Boolean).join(' ') : '';
                    const email = row.profiles?.email || '';
                    const actionColors: Record<string, string> = {
                      login: 'bg-blue-500/15 text-blue-400',
                      create: 'bg-green-500/15 text-green-400',
                      update: 'bg-amber-500/15 text-amber-400',
                      delete: 'bg-red-500/15 text-red-400',
                      assign: 'bg-purple-500/15 text-purple-400',
                    };
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{formatART(row.created_at)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{name || email || 'Usuario'}</div>
                          {name && email && <div className="text-xs text-muted-foreground">{email}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${actionColors[row.action] || 'bg-muted'} hover:bg-opacity-100 text-xs`}>{row.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.entity_type || '—'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {view === 'errors' && (
      <>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por usuario, acción, error..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            <SelectItem value="error">Solo errores</SelectItem>
            <SelectItem value="warn">Solo warnings</SelectItem>
            <SelectItem value="info">Solo info</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={showResolved ? 'default' : 'outline'} size="sm" onClick={() => setShowResolved(v => !v)}>
          {showResolved ? 'Ocultar resueltos' : 'Mostrar resueltos'}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        Mostrando {filtered.length} registros · Hora en Argentina (ART UTC-3) · Se actualiza cada 30s
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora (ART)</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Nivel</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Página</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay logs {showResolved ? '' : 'sin resolver'}.</TableCell></TableRow>
            ) : (
              filtered.map(log => (
                <LogRow key={log.id} log={log} onResolve={(id) => resolveMutation.mutate(id)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </>
      )}
    </div>
  );
};

export default LogsPage;
