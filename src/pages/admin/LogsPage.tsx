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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Logs del Sistema</h1>
          {errorCount > 0 && (
            <Badge className="bg-red-500 hover:bg-red-500 text-white">{errorCount} errores sin resolver</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

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
    </div>
  );
};

export default LogsPage;
