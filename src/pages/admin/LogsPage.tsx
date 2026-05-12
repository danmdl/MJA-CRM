"use client";
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, RefreshCw, Search, ChevronDown, ChevronUp, UserSearch, Users } from 'lucide-react';
import { normalize } from '@/lib/normalize';
import { showSuccess } from '@/utils/toast';


const ACTION_LABELS: Record<string, string> = {
  login_success:           'login ✓',
  login_failed:            'login ✗',
  reset_requested:         'reset solicitado',
  reset_request_failed:    'reset fallido',
  reset_link_clicked:      'reset link abierto',
  reset_completed:         'reset completado',
  reset_failed:            'reset error',
  expired_link_used:       'link expirado',
  logout_manual:           'logout',
  session_expired:         'sesión expirada',
  account_setup_completed: 'cuenta creada',
};

const ACTION_COLORS: Record<string, string> = {
  login:                   'bg-blue-500/15 text-blue-400',
  login_success:           'bg-blue-500/15 text-blue-400',
  login_failed:            'bg-red-500/20 text-red-400 border border-red-500/30',
  reset_requested:         'bg-amber-500/15 text-amber-400',
  reset_request_failed:    'bg-red-500/15 text-red-400',
  reset_link_clicked:      'bg-amber-500/15 text-amber-400',
  reset_completed:         'bg-green-500/15 text-green-400',
  reset_failed:            'bg-red-500/15 text-red-400',
  expired_link_used:       'bg-red-500/20 text-red-400 border border-red-500/30',
  logout_manual:           'bg-muted text-muted-foreground',
  session_expired:         'bg-orange-500/15 text-orange-400',
  account_setup_completed: 'bg-green-500/15 text-green-400',
  create:                  'bg-green-500/15 text-green-400',
  update:                  'bg-amber-500/15 text-amber-400',
  delete:                  'bg-red-500/15 text-red-400',
  assign:                  'bg-purple-500/15 text-purple-400',
};

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

const ActivityGroupRow = ({ group, name, email }: { group: any[]; name: string; email: string; }) => {
  const [expanded, setExpanded] = useState(false);
  const first = group[0]; // newest in the group (since data comes desc)
  const last = group[group.length - 1]; // oldest in the group
  const isGroup = group.length > 1;

  return (
    <>
      <TableRow className={isGroup ? 'cursor-pointer hover:bg-muted/30' : ''} onClick={() => isGroup && setExpanded(v => !v)}>
        <TableCell className="w-8">
          {isGroup ? (
            <button className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {isGroup ? (
            <div>
              <div>{formatART(first.created_at)}</div>
              <div className="text-muted-foreground">↳ {formatART(last.created_at).split(' ')[1]}</div>
            </div>
          ) : (
            formatART(first.created_at)
          )}
        </TableCell>
        <TableCell>
          <div className="text-sm">{name || email || 'Usuario'}</div>
          {name && email && <div className="text-xs text-muted-foreground">{email}</div>}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Badge className={`${ACTION_COLORS[first.action] || 'bg-muted'} hover:bg-opacity-100 text-xs`}>{ACTION_LABELS[first.action] || first.action}</Badge>
            {isGroup && <span className="text-xs text-muted-foreground">×{group.length}</span>}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
          {first.action === 'login_failed'
            ? (first.error_message || 'Credenciales inválidas')
            : (first.entity_type || '—')}
        </TableCell>
      </TableRow>
      {isGroup && expanded && group.map((row: any) => (
        <TableRow key={row.id} className="bg-muted/10">
          <TableCell></TableCell>
          <TableCell className="font-mono text-xs pl-6 text-muted-foreground">↳ {formatART(row.created_at)}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{name || email || 'Usuario'}</TableCell>
          <TableCell><Badge className={`${ACTION_COLORS[row.action] || 'bg-muted'} hover:bg-opacity-100 text-xs`}>{ACTION_LABELS[row.action] || row.action}</Badge></TableCell>
          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
            {row.action === 'login_failed' ? (row.error_message || '—') : (row.entity_type || '—')}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
};

const formatRelative = (ts: string | null) => {
  if (!ts) return 'Nunca';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  const mo = Math.floor(d / 30);
  return `hace ${mo} mes${mo > 1 ? 'es' : ''}`;
};

const lastLoginStatus = (ts: string | null): 'green' | 'yellow' | 'red' => {
  if (!ts) return 'red';
  const diffH = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (diffH < 24) return 'green';
  if (diffH < 72) return 'yellow';
  return 'red';
};

const STATUS_DOT: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

const PerPersonRow = ({ user }: { user: { id: string; name: string; email: string; lastLogin: string | null; status: 'green' | 'yellow' | 'red' } }) => {
  const [expanded, setExpanded] = useState(false);

  const { data: events, isLoading } = useQuery<any[]>({
    queryKey: ['per_person_events', user.id],
    queryFn: async () => {
      const [actRes, cliRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, action, entity_type, entity_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('client_logs')
          .select('id, action, error_message, error_code, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      const merged = [
        ...(actRes.data || []).map((r: any) => ({ ...r, source: 'activity' })),
        ...(cliRes.data || []).map((r: any) => ({ ...r, source: 'client' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
      return merged;
    },
    enabled: expanded,
  });

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(v => !v)}>
        <TableCell className="w-8">
          <button className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="w-8">
          <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[user.status]}`} title={user.status === 'green' ? '<24h' : user.status === 'yellow' ? '24-72h' : '>72h o nunca'} />
        </TableCell>
        <TableCell>
          <div className="text-sm font-medium">{user.name || user.email || 'Usuario'}</div>
          {user.name && user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {user.lastLogin ? (
            <>
              <div>{formatART(user.lastLogin)}</div>
              <div>{formatRelative(user.lastLogin)}</div>
            </>
          ) : (
            <span className="italic">Nunca ingresó</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={4} className="p-0">
            <div className="p-3">
              {isLoading ? (
                <p className="text-xs text-muted-foreground py-2 px-2">Cargando eventos…</p>
              ) : !events || events.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 px-2">Sin eventos registrados.</p>
              ) : (
                <div className="border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Hora (ART)</TableHead>
                        <TableHead className="h-8 text-xs">Acción</TableHead>
                        <TableHead className="h-8 text-xs">Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((e: any) => (
                        <TableRow key={`${e.source}-${e.id}`}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{formatART(e.created_at)}</TableCell>
                          <TableCell>
                            <Badge className={`${ACTION_COLORS[e.action] || 'bg-muted'} hover:bg-opacity-100 text-xs`}>{ACTION_LABELS[e.action] || e.action || '—'}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                            {e.source === 'client' ? (e.error_message || e.error_code || '—') : (e.entity_type || '—')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
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
  const [view, setView] = useState<'errors' | 'activity' | 'per_person'>('activity');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [activityUserSearch, setActivityUserSearch] = useState<string>('');
  const [perPersonSearch, setPerPersonSearch] = useState<string>('');
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

  // Failed login attempts logged from Login.tsx into client_logs
  const { data: loginFailures } = useQuery<any[]>({
    queryKey: ['login_failures'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_logs')
        .select('id, created_at, user_email, user_id, error_message, error_code, context, action')
        .in('action', ['login_failed','login_success','reset_requested','reset_request_failed',
                       'reset_link_clicked','reset_completed','reset_failed','expired_link_used',
                       'logout_manual','session_expired','account_setup_completed'])
        .order('created_at', { ascending: false })
        .limit(200);
      return (data || []).map(f => ({
        ...f,
        profiles: null,
        entity_type: null,
      }));
    },
    refetchInterval: 30_000,
    enabled: view === 'activity',
  });

  const filteredActivity = useMemo(() => {
    // Merge successes + failures, then apply action + user filters
    const failures = loginFailures || [];
    let result: any[];
    const authClientActions = ['login_failed','login_success','reset_requested','reset_request_failed',
      'reset_link_clicked','reset_completed','reset_failed','expired_link_used',
      'logout_manual','session_expired','account_setup_completed'];
    if (authClientActions.includes(activityFilter)) {
      result = failures.filter((r: any) => r.action === activityFilter);
    } else if (activityFilter === 'login_failed') {
      result = failures;
    } else if (activityFilter !== 'all') {
      result = (activity || []).filter((r: any) => r.action === activityFilter);
    } else {
      result = [...(activity || []), ...failures].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    if (activityUserSearch.trim()) {
      const q = normalize(activityUserSearch);
      result = result.filter((r: any) => {
        const name = r.profiles
          ? [r.profiles.first_name, r.profiles.last_name].filter(Boolean).join(' ')
          : '';
        return normalize(name + ' ' + (r.profiles?.email || '') + ' ' + (r.user_email || '')).includes(q);
      });
    }
    return result;
  }, [activity, loginFailures, activityFilter, activityUserSearch]);

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

  // Per-person view: every user with their last login
  const { data: perPersonUsers, isLoading: perPersonLoading } = useQuery<any[]>({
    queryKey: ['per_person_users'],
    queryFn: async () => {
      const [profilesRes, actRes, cliRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .order('first_name', { ascending: true }),
        supabase
          .from('activity_logs')
          .select('user_id, created_at')
          .eq('action', 'login')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('client_logs')
          .select('user_id, created_at')
          .eq('action', 'login_success')
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);
      const lastByUser: Record<string, string> = {};
      (actRes.data || []).forEach((r: any) => {
        if (r.user_id && !lastByUser[r.user_id]) lastByUser[r.user_id] = r.created_at;
      });
      (cliRes.data || []).forEach((r: any) => {
        if (r.user_id) {
          const prev = lastByUser[r.user_id];
          if (!prev || new Date(r.created_at).getTime() > new Date(prev).getTime()) {
            lastByUser[r.user_id] = r.created_at;
          }
        }
      });
      return (profilesRes.data || []).map((p: any) => {
        const lastLogin = lastByUser[p.id] || null;
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        return {
          id: p.id,
          name,
          email: p.email || '',
          lastLogin,
          status: lastLoginStatus(lastLogin),
        };
      });
    },
    refetchInterval: 60_000,
    enabled: view === 'per_person',
  });

  const filteredPerPerson = useMemo(() => {
    const list = perPersonUsers || [];
    const order = { red: 0, yellow: 1, green: 2 } as const;
    const sorted = [...list].sort((a, b) => {
      const o = order[a.status as keyof typeof order] - order[b.status as keyof typeof order];
      if (o !== 0) return o;
      // Within same bucket: most recent first for green/yellow, then alphabetical for red without login
      if (a.lastLogin && b.lastLogin) return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
      if (a.lastLogin) return -1;
      if (b.lastLogin) return 1;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
    if (!perPersonSearch.trim()) return sorted;
    const q = normalize(perPersonSearch);
    return sorted.filter(u => normalize(`${u.name} ${u.email}`).includes(q));
  }, [perPersonUsers, perPersonSearch]);

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
        <button
          onClick={() => setView('per_person')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${view === 'per_person' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Users className="h-4 w-4" />
          Por persona
        </button>
      </div>

      {view === 'per_person' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative">
              <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-8 w-52 text-xs"
                placeholder="Buscar por persona..."
                value={perPersonSearch}
                onChange={e => setPerPersonSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> &lt;24h</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500" /> 24–72h</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> &gt;72h o nunca</span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mb-2">
            Mostrando {filteredPerPerson.length} usuario{filteredPerPerson.length !== 1 ? 's' : ''} · Hora en Argentina (ART UTC-3) · Click en un usuario para ver sus últimos 20 eventos
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Último ingreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perPersonLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
                ) : filteredPerPerson.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin usuarios.</TableCell></TableRow>
                ) : (
                  filteredPerPerson.map(u => <PerPersonRow key={u.id} user={u} />)
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

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

          {/* Person search + activity type filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-8 w-52 text-xs"
                placeholder="Buscar por persona..."
                value={activityUserSearch}
                onChange={e => setActivityUserSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { v: 'all', l: 'Todas' },
              { v: 'login', l: 'Login ✓' },
              { v: 'login_failed', l: 'Login fallido' },
              { v: 'reset_requested', l: 'Reset solicitado' },
              { v: 'reset_completed', l: 'Reset completado' },
              { v: 'expired_link_used', l: 'Link expirado' },
              { v: 'create', l: 'Creaciones' },
              { v: 'update', l: 'Ediciones' },
              { v: 'delete', l: 'Eliminaciones' },
              { v: 'assign', l: 'Asignaciones' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setActivityFilter(v as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  activityFilter === v
                    ? v === 'login_failed'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-primary text-primary-foreground border-primary'
                    : v === 'login_failed'
                      ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                      : 'border-border hover:bg-muted'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Activity table */}
          <div className="text-xs text-muted-foreground mb-2">
            Mostrando {filteredActivity.length} evento{filteredActivity.length !== 1 ? 's' : ''} · Hora en Argentina (ART UTC-3) · Se actualiza cada 30s
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Hora (ART)</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActivity.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin actividad registrada.</TableCell></TableRow>
                ) : (
                  (() => {
                    // Group consecutive rows by user_id + action + same hour bucket

                    const groups: any[][] = [];
                    filteredActivity.forEach((row: any) => {
                      const last = groups[groups.length - 1];
                      // For login_failed, group by email since user_id is null
                      const rowKey = row.action === 'login_failed'
                        ? `__fail__|${row.user_email}|${row.action}`
                        : `${row.user_id}|${row.action}`;
                      if (last && last.length > 0) {
                        const lastKey = `${last[0].user_id}|${last[0].action}`;
                        if (lastKey === rowKey) {
                          last.push(row);
                          return;
                        }
                      }
                      groups.push([row]);
                    });
                    return groups.map((group, gIdx) => {
                      const first = group[0];
                      const name = first.profiles ? [first.profiles.first_name, first.profiles.last_name].filter(Boolean).join(' ') : '';
                      const email = first.profiles?.email || first.user_email || '';
                      const actionLabel = ACTION_LABELS[first.action] || first.action;
                      return (
                        <ActivityGroupRow
                          key={`${first.id}-group`}
                          group={group}
                          name={name}
                          email={email}
                        />
                      );
                    });
                  })()
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
