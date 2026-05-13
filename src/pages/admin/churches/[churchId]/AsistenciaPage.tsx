"use client";
import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Calendar, Users, BarChart3, Search, Check, X as XIcon, Trash2, Pencil } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { PROCESS_STAGES, COURSE_STAGES, stageColor, stageLabel, isCourseStage, type ProcessStageKey } from '@/lib/process-stages';

// ─── Types ────────────────────────────────────────────────────────────

interface AttendanceEvent {
  id: string;
  church_id: string;
  stage: ProcessStageKey;
  cuerda_id: string | null;
  cell_id: string | null;
  event_date: string;
  event_time: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
}

interface AttendanceRow {
  id: string;
  event_id: string;
  contact_id: string;
  status: 'present' | 'absent' | 'justified';
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  numero_cuerda: string | null;
}

interface ProcessRow {
  id: string;
  contact_id: string;
  stage: ProcessStageKey;
  metadata: Record<string, any>;
  contacts: { first_name: string; last_name: string | null; numero_cuerda: string | null } | null;
}

type TabKey = 'eventos' | 'clases' | 'resumen';

// ─── Page ─────────────────────────────────────────────────────────────

const AsistenciaPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>('eventos');
  const [filterStage, setFilterStage] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [takingEvent, setTakingEvent] = useState<AttendanceEvent | null>(null);
  const [filterClaseStage, setFilterClaseStage] = useState<ProcessStageKey>('abc');

  const isPrivileged = !!profile && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role || '');
  const userCuerda = profile?.numero_cuerda || null;

  // ── Queries ────────────────────────────────────────────────────────
  const { data: events = [], isLoading: eventsLoading } = useQuery<AttendanceEvent[]>({
    queryKey: ['attendance-events', churchId, filterStage, filterFrom, filterTo],
    queryFn: async () => {
      if (!churchId) return [];
      let q = supabase.from('attendance_events')
        .select('*')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .order('event_date', { ascending: false });
      if (filterStage) q = q.eq('stage', filterStage);
      if (filterFrom) q = q.gte('event_date', filterFrom);
      if (filterTo) q = q.lte('event_date', filterTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AttendanceEvent[];
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  // Attendance counts per event (for the events list display)
  const { data: attendanceByEvent = {} } = useQuery<Record<string, { present: number; absent: number; justified: number }>>({
    queryKey: ['attendance-counts', churchId, events.map(e => e.id).join(',')],
    queryFn: async () => {
      if (events.length === 0) return {};
      const { data, error } = await supabase
        .from('contact_attendance')
        .select('event_id, status')
        .in('event_id', events.map(e => e.id));
      if (error) throw error;
      const counts: Record<string, { present: number; absent: number; justified: number }> = {};
      (data || []).forEach((r: any) => {
        const c = counts[r.event_id] || (counts[r.event_id] = { present: 0, absent: 0, justified: 0 });
        if (r.status === 'present') c.present++;
        else if (r.status === 'absent') c.absent++;
        else if (r.status === 'justified') c.justified++;
      });
      return counts;
    },
    enabled: events.length > 0,
    staleTime: 30_000,
  });

  // Cuerdas + Cells for the create-event dialog
  const { data: cuerdas = [] } = useQuery<{ id: string; numero: string; is_church_cuerda: boolean | null }[]>({
    queryKey: ['cuerdas-asistencia', churchId],
    queryFn: async () => {
      const { data: zonas } = await supabase.from('zonas').select('id').eq('church_id', churchId!);
      if (!zonas?.length) return [];
      const { data } = await supabase.from('cuerdas')
        .select('id, numero, is_church_cuerda')
        .in('zona_id', zonas.map(z => z.id))
        .order('numero');
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const { data: cells = [] } = useQuery<{ id: string; name: string; cuerda_id: string | null }[]>({
    queryKey: ['cells-asistencia', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells')
        .select('id, name, cuerda_id')
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .order('name');
      return data || [];
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  // Course-stage processes (ABC / Nivel 1 / Nivel 2) for the Clases tab
  const { data: courseProcesses = [], isLoading: processesLoading } = useQuery<ProcessRow[]>({
    queryKey: ['process-courses', churchId, filterClaseStage],
    queryFn: async () => {
      if (!churchId) return [];
      const { data, error } = await supabase
        .from('contact_processes')
        .select('id, contact_id, stage, metadata, contacts:contact_id ( first_name, last_name, numero_cuerda )')
        .eq('church_id', churchId)
        .eq('stage', filterClaseStage);
      if (error) throw error;
      return ((data || []) as any) as ProcessRow[];
    },
    enabled: !!churchId && tab === 'clases',
    staleTime: 30_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────
  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Evento eliminado');
      queryClient.invalidateQueries({ queryKey: ['attendance-events', churchId] });
    },
    onError: (e: any) => showError(e.message || 'Error al eliminar'),
  });

  // ── Derived: visible events (cuerda scoping for non-privileged) ────
  const visibleEvents = useMemo(() => {
    if (isPrivileged || !userCuerda) return events;
    // Non-privileged see events for their cuerda, plus events without
    // a cuerda set (church-wide like Domingos / Encuentros).
    const userCuerdaId = cuerdas.find(c => c.numero === userCuerda)?.id;
    return events.filter(e => !e.cuerda_id || e.cuerda_id === userCuerdaId);
  }, [events, isPrivileged, userCuerda, cuerdas]);

  // ── Stats for Resumen tab ──────────────────────────────────────────
  const stats = useMemo(() => {
    if (visibleEvents.length === 0) return { totalEvents: 0, avgPresent: 0, totalAttendanceRecords: 0 };
    let totalPresent = 0;
    let totalRecorded = 0;
    visibleEvents.forEach(e => {
      const c = attendanceByEvent[e.id];
      if (c) {
        totalPresent += c.present;
        totalRecorded += c.present + c.absent + c.justified;
      }
    });
    const avgPresent = totalRecorded === 0 ? 0 : Math.round((totalPresent / totalRecorded) * 100);
    return { totalEvents: visibleEvents.length, avgPresent, totalAttendanceRecords: totalRecorded };
  }, [visibleEvents, attendanceByEvent]);

  // Per-contact attendance % (last 90 days events)
  const { data: perContactStats = [] } = useQuery<{ contact_id: string; first_name: string; last_name: string | null; present: number; total: number }[]>({
    queryKey: ['per-contact-attendance', churchId, visibleEvents.map(e => e.id).join(',')],
    queryFn: async () => {
      if (visibleEvents.length === 0) return [];
      const { data: rows, error } = await supabase
        .from('contact_attendance')
        .select('contact_id, status, contacts:contact_id ( first_name, last_name )')
        .in('event_id', visibleEvents.map(e => e.id));
      if (error) throw error;
      const m = new Map<string, { contact_id: string; first_name: string; last_name: string | null; present: number; total: number }>();
      (rows || []).forEach((r: any) => {
        const id = r.contact_id;
        const entry = m.get(id) || { contact_id: id, first_name: r.contacts?.first_name || '?', last_name: r.contacts?.last_name || null, present: 0, total: 0 };
        entry.total++;
        if (r.status === 'present') entry.present++;
        m.set(id, entry);
      });
      return Array.from(m.values());
    },
    enabled: visibleEvents.length > 0 && tab === 'resumen',
    staleTime: 60_000,
  });

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Asistencia</h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">Registro de asistencias ligado a las etapas de Procesos</span>
        <div className="flex-1" />
        {tab === 'eventos' && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo evento
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-4">
        <TabBtn active={tab === 'eventos'} onClick={() => setTab('eventos')} icon={<Calendar className="h-3.5 w-3.5" />} label="Eventos" />
        <TabBtn active={tab === 'clases'} onClick={() => setTab('clases')} icon={<Users className="h-3.5 w-3.5" />} label="Clases (ABC / Niveles)" />
        <TabBtn active={tab === 'resumen'} onClick={() => setTab('resumen')} icon={<BarChart3 className="h-3.5 w-3.5" />} label="Resumen" />
      </div>

      {/* Filter bar (shared by eventos + resumen) */}
      {tab !== 'clases' && (
        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 border rounded-lg bg-card">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Etapa</Label>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background min-w-[180px]">
              <option value="">Todas las etapas</option>
              {PROCESS_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</Label>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-xs w-[140px]" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</Label>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-xs w-[140px]" />
          </div>
          {(filterStage || filterFrom || filterTo) && (
            <button onClick={() => { setFilterStage(''); setFilterFrom(''); setFilterTo(''); }} className="text-xs text-muted-foreground hover:text-foreground h-8 px-2">
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Tab content */}
      {tab === 'eventos' && (
        <EventosList
          events={visibleEvents}
          loading={eventsLoading}
          attendanceByEvent={attendanceByEvent}
          onTake={setTakingEvent}
          onEdit={setEditingEvent}
          onDelete={(id) => {
            if (confirm('¿Eliminar este evento? La asistencia registrada también se borra.')) {
              deleteEvent.mutate(id);
            }
          }}
        />
      )}

      {tab === 'clases' && (
        <ClasesGrid
          stage={filterClaseStage}
          onStageChange={setFilterClaseStage}
          processes={courseProcesses}
          loading={processesLoading}
          userCuerda={userCuerda}
          isPrivileged={isPrivileged}
        />
      )}

      {tab === 'resumen' && (
        <ResumenView
          stats={stats}
          perContact={perContactStats}
          events={visibleEvents}
          attendanceByEvent={attendanceByEvent}
        />
      )}

      {/* Dialogs */}
      {(createOpen || editingEvent) && (
        <EventoDialog
          churchId={churchId!}
          cuerdas={cuerdas}
          cells={cells}
          userId={profile?.id || null}
          userCuerdaNumero={userCuerda}
          isPrivileged={isPrivileged}
          existing={editingEvent}
          onClose={() => { setCreateOpen(false); setEditingEvent(null); }}
          onSaved={() => {
            setCreateOpen(false); setEditingEvent(null);
            queryClient.invalidateQueries({ queryKey: ['attendance-events', churchId] });
          }}
        />
      )}

      {takingEvent && (
        <TomarAsistenciaDialog
          event={takingEvent}
          churchId={churchId!}
          userCuerda={userCuerda}
          isPrivileged={isPrivileged}
          onClose={() => setTakingEvent(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['attendance-counts', churchId] });
            queryClient.invalidateQueries({ queryKey: ['per-contact-attendance', churchId] });
          }}
        />
      )}
    </div>
  );
};

// ─── Tab button ───────────────────────────────────────────────────────

const TabBtn = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
      active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}
  >
    {icon}
    {label}
  </button>
);

// ─── Eventos list ─────────────────────────────────────────────────────

const EventosList = ({ events, loading, attendanceByEvent, onTake, onEdit, onDelete }: {
  events: AttendanceEvent[];
  loading: boolean;
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
  onTake: (e: AttendanceEvent) => void;
  onEdit: (e: AttendanceEvent) => void;
  onDelete: (id: string) => void;
}) => {
  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Cargando eventos…</div>;
  if (events.length === 0) {
    return (
      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
        <p className="text-sm font-medium">No hay eventos cargados</p>
        <p className="text-xs text-muted-foreground mt-1">Apretá "Nuevo evento" para registrar la asistencia de una reunión.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {events.map(ev => {
        const counts = attendanceByEvent[ev.id] || { present: 0, absent: 0, justified: 0 };
        const total = counts.present + counts.absent + counts.justified;
        return (
          <div key={ev.id} className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition-colors">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-white shrink-0"
                  style={{ background: stageColor(ev.stage) }}>
              {stageLabel(ev.stage)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {ev.title || `${stageLabel(ev.stage)} · ${formatDateAR(ev.event_date)}`}
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0">
                <span>{formatDateAR(ev.event_date)}</span>
                {ev.event_time && <span>· {ev.event_time.slice(0, 5)}</span>}
                {total > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-green-400">{counts.present} presentes</span>
                    {counts.absent > 0 && <span className="text-red-400">/ {counts.absent} ausentes</span>}
                    {counts.justified > 0 && <span className="text-amber-400">/ {counts.justified} justificados</span>}
                  </>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onTake(ev)} className="gap-1 h-8 text-xs shrink-0">
              <Check className="h-3 w-3" /> Asistencia
            </Button>
            <button onClick={() => onEdit(ev)} className="p-1.5 text-muted-foreground hover:text-foreground rounded" title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(ev.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded" title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ─── Clases grid ──────────────────────────────────────────────────────

const ClasesGrid = ({ stage, onStageChange, processes, loading, userCuerda, isPrivileged }: {
  stage: ProcessStageKey;
  onStageChange: (s: ProcessStageKey) => void;
  processes: ProcessRow[];
  loading: boolean;
  userCuerda: string | null;
  isPrivileged: boolean;
}) => {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    let list = processes;
    if (!isPrivileged && userCuerda) {
      list = list.filter(p => p.contacts?.numero_cuerda === userCuerda);
    }
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(p => `${p.contacts?.first_name || ''} ${p.contacts?.last_name || ''}`.toLowerCase().includes(t));
    }
    return list;
  }, [processes, isPrivileged, userCuerda, search]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3 p-3 border rounded-lg bg-card">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Etapa con clases</Label>
          <select value={stage} onChange={e => onStageChange(e.target.value as ProcessStageKey)} className="h-8 text-xs border rounded px-2 bg-background min-w-[160px]">
            {COURSE_STAGES.map(k => (
              <option key={k} value={k}>{stageLabel(k)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8" placeholder="Nombre o apellido…" />
          </div>
        </div>
        <span className="text-xs text-muted-foreground self-center pb-1">
          La edición se hace desde la solapa Procesos (cards de cada contacto).
        </span>
      </div>
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>
      ) : visible.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No hay contactos en esta etapa.
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-muted/40">Contacto</th>
                <th className="text-left px-2 py-2">Cuerda</th>
                {Array.from({ length: 10 }, (_, i) => (
                  <th key={i} className="text-center px-1 py-2 w-9">C{i + 1}</th>
                ))}
                <th className="text-center px-2 py-2 w-14">%</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const pres = Array.from({ length: 10 }, (_, i) => p.metadata?.[`clase_${i + 1}`]);
                const presentCount = pres.filter(v => v === 'P').length;
                const recordedCount = pres.filter(v => v === 'P' || v === 'A').length;
                const pct = recordedCount === 0 ? null : Math.round((presentCount / recordedCount) * 100);
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="px-2 py-1.5 sticky left-0 bg-background font-medium whitespace-nowrap">
                      {p.contacts?.first_name} {p.contacts?.last_name || ''}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.contacts?.numero_cuerda || '—'}</td>
                    {pres.map((v, i) => (
                      <td key={i} className="text-center">
                        <span className={
                          v === 'P' ? 'inline-flex items-center justify-center w-6 h-6 rounded bg-green-500/20 text-green-400 font-bold' :
                          v === 'A' ? 'inline-flex items-center justify-center w-6 h-6 rounded bg-red-500/20 text-red-400 font-bold' :
                          'text-muted-foreground/40'
                        }>
                          {v || '—'}
                        </span>
                      </td>
                    ))}
                    <td className="text-center font-medium">
                      {pct === null ? '—' : `${pct}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Resumen view ─────────────────────────────────────────────────────

const ResumenView = ({ stats, perContact, events, attendanceByEvent }: {
  stats: { totalEvents: number; avgPresent: number; totalAttendanceRecords: number };
  perContact: { contact_id: string; first_name: string; last_name: string | null; present: number; total: number }[];
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
}) => {
  const topAttenders = useMemo(() => {
    return [...perContact]
      .map(p => ({ ...p, pct: p.total === 0 ? 0 : Math.round((p.present / p.total) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.present - a.present)
      .slice(0, 10);
  }, [perContact]);

  const lowAttenders = useMemo(() => {
    return [...perContact]
      .filter(p => p.total >= 2)
      .map(p => ({ ...p, pct: p.total === 0 ? 0 : Math.round((p.present / p.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 10);
  }, [perContact]);

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border rounded-lg bg-card">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Eventos en el rango</div>
          <div className="text-2xl font-bold mt-1">{stats.totalEvents}</div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">% de asistencia promedio</div>
          <div className="text-2xl font-bold mt-1">{stats.avgPresent}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{stats.totalAttendanceRecords} registros</div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contactos tracked</div>
          <div className="text-2xl font-bold mt-1">{perContact.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top attenders */}
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">Más constantes</div>
          {topAttenders.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Sin datos.</div>
          ) : (
            <div className="divide-y">
              {topAttenders.map(p => (
                <div key={p.contact_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0 truncate">{p.first_name} {p.last_name || ''}</div>
                  <div className="text-muted-foreground">{p.present}/{p.total}</div>
                  <div className="font-bold text-green-400 w-12 text-right">{p.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low attenders */}
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">A seguir de cerca</div>
          {lowAttenders.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Sin datos suficientes (mín. 2 registros).</div>
          ) : (
            <div className="divide-y">
              {lowAttenders.map(p => (
                <div key={p.contact_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0 truncate">{p.first_name} {p.last_name || ''}</div>
                  <div className="text-muted-foreground">{p.present}/{p.total}</div>
                  <div className="font-bold text-red-400 w-12 text-right">{p.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-event summary */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">Eventos del rango</div>
        {events.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Sin eventos en el rango.</div>
        ) : (
          <div className="divide-y">
            {events.slice(0, 25).map(ev => {
              const c = attendanceByEvent[ev.id] || { present: 0, absent: 0, justified: 0 };
              const total = c.present + c.absent + c.justified;
              const pct = total === 0 ? 0 : Math.round((c.present / total) * 100);
              return (
                <div key={ev.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-white"
                        style={{ background: stageColor(ev.stage) }}>
                    {stageLabel(ev.stage)}
                  </span>
                  <div className="flex-1 min-w-0 truncate">{ev.title || formatDateAR(ev.event_date)}</div>
                  <div className="text-muted-foreground">{formatDateAR(ev.event_date)}</div>
                  <div className="text-green-400">{c.present}P</div>
                  <div className="font-bold w-12 text-right">{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Create / Edit event dialog ───────────────────────────────────────

const EventoDialog = ({ churchId, cuerdas, cells, userId, userCuerdaNumero, isPrivileged, existing, onClose, onSaved }: {
  churchId: string;
  cuerdas: { id: string; numero: string; is_church_cuerda: boolean | null }[];
  cells: { id: string; name: string; cuerda_id: string | null }[];
  userId: string | null;
  userCuerdaNumero: string | null;
  isPrivileged: boolean;
  existing: AttendanceEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const userCuerdaId = useMemo(() => cuerdas.find(c => c.numero === userCuerdaNumero)?.id || null, [cuerdas, userCuerdaNumero]);

  const [stage, setStage] = useState<ProcessStageKey>(existing?.stage || 'nuevas_personas_celulas');
  const [date, setDate] = useState(existing?.event_date || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(existing?.event_time?.slice(0, 5) || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [cuerdaId, setCuerdaId] = useState<string | null>(
    existing?.cuerda_id ?? (isPrivileged ? null : userCuerdaId)
  );
  const [cellId, setCellId] = useState<string | null>(existing?.cell_id || null);
  const [saving, setSaving] = useState(false);

  const visibleCells = useMemo(
    () => cells.filter(c => !cuerdaId || c.cuerda_id === cuerdaId),
    [cells, cuerdaId],
  );

  const save = async () => {
    if (!date) { showError('Falta la fecha'); return; }
    setSaving(true);
    try {
      const payload = {
        church_id: churchId,
        stage,
        event_date: date,
        event_time: time || null,
        title: title.trim() || null,
        notes: notes.trim() || null,
        cuerda_id: cuerdaId,
        cell_id: cellId,
      };
      if (existing) {
        const { error } = await supabase.from('attendance_events').update(payload).eq('id', existing.id);
        if (error) throw error;
        showSuccess('Evento actualizado');
      } else {
        const { error } = await supabase.from('attendance_events').insert({ ...payload, created_by: userId });
        if (error) throw error;
        showSuccess('Evento creado');
      }
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{existing ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Etapa</Label>
            <select value={stage} onChange={e => setStage(e.target.value as ProcessStageKey)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              {PROCESS_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Horario (opcional)</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Título (opcional)</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Domingo 14/05, Célula de Joel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cuerda</Label>
              {isPrivileged ? (
                <select value={cuerdaId || ''} onChange={e => { setCuerdaId(e.target.value || null); setCellId(null); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Toda la iglesia</option>
                  {cuerdas.filter(c => !c.is_church_cuerda).map(c => (
                    <option key={c.id} value={c.id}>Cuerda {c.numero}</option>
                  ))}
                </select>
              ) : (
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                  {userCuerdaNumero ? `Cuerda ${userCuerdaNumero}` : 'Tu cuerda'}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Célula (opcional)</Label>
              <select value={cellId || ''} onChange={e => setCellId(e.target.value || null)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">Ninguna</option>
                {visibleCells.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Take attendance dialog ───────────────────────────────────────────

const TomarAsistenciaDialog = ({ event, churchId, userCuerda, isPrivileged, onClose, onSaved }: {
  event: AttendanceEvent;
  churchId: string;
  userCuerda: string | null;
  isPrivileged: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusById, setStatusById] = useState<Record<string, 'present' | 'absent' | 'justified' | undefined>>({});
  const [savingFor, setSavingFor] = useState<string | null>(null);

  // Eligible contacts: scoped by event's cuerda when set; otherwise by user's
  // cuerda for non-privileged users.
  const { data: contacts = [], isLoading } = useQuery<ContactRow[]>({
    queryKey: ['attendance-contacts', churchId, event.cuerda_id, userCuerda, isPrivileged],
    queryFn: async () => {
      const scopeCuerdaNumero = (() => {
        // If the event is tied to a cuerda, fetch its numero so we filter
        // contacts by the right value.
        return null;
      })();
      // Build the contact query. We always scope by church; if the event
      // is tied to a cuerda, use that; otherwise non-privileged users
      // fall back to their own cuerda; privileged see all.
      const PAGE_SIZE = 1000;
      const all: ContactRow[] = [];
      // Figure out which cuerda's contacts to fetch.
      let cuerdaNumero: string | null = null;
      if (event.cuerda_id) {
        const { data: cu } = await supabase.from('cuerdas').select('numero').eq('id', event.cuerda_id).maybeSingle();
        cuerdaNumero = cu?.numero || null;
      } else if (!isPrivileged && userCuerda) {
        cuerdaNumero = userCuerda;
      }
      for (let page = 0; ; page++) {
        let q = supabase.from('contacts')
          .select('id, first_name, last_name, numero_cuerda')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .order('first_name', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (cuerdaNumero) q = q.eq('numero_cuerda', cuerdaNumero);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []) as ContactRow[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        if (page >= 9) break;
        void scopeCuerdaNumero;
      }
      return all;
    },
    enabled: !!event.id,
    staleTime: 30_000,
  });

  // Existing attendance for this event
  const { data: existing = [], isLoading: existingLoading } = useQuery<AttendanceRow[]>({
    queryKey: ['attendance-rows', event.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_attendance')
        .select('id, event_id, contact_id, status')
        .eq('event_id', event.id);
      if (error) throw error;
      return (data || []) as AttendanceRow[];
    },
    staleTime: 0,
  });

  // Hydrate statusById from existing rows on load
  useMemo(() => {
    if (existing.length > 0) {
      const next: Record<string, 'present' | 'absent' | 'justified'> = {};
      existing.forEach(r => { next[r.contact_id] = r.status; });
      setStatusById(prev => ({ ...prev, ...next }));
    }
  }, [existing]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const t = search.toLowerCase();
    return contacts.filter(c => `${c.first_name} ${c.last_name || ''}`.toLowerCase().includes(t));
  }, [contacts, search]);

  const mark = async (contactId: string, status: 'present' | 'absent' | 'justified') => {
    setSavingFor(contactId);
    try {
      const { error } = await supabase
        .from('contact_attendance')
        .upsert({ event_id: event.id, contact_id: contactId, status }, { onConflict: 'event_id,contact_id' });
      if (error) throw error;
      setStatusById(prev => ({ ...prev, [contactId]: status }));
      queryClient.invalidateQueries({ queryKey: ['attendance-rows', event.id] });
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al guardar');
    } finally {
      setSavingFor(null);
    }
  };

  const clearMark = async (contactId: string) => {
    setSavingFor(contactId);
    try {
      const row = existing.find(r => r.contact_id === contactId);
      if (row) {
        const { error } = await supabase.from('contact_attendance').delete().eq('id', row.id);
        if (error) throw error;
      }
      setStatusById(prev => { const next = { ...prev }; delete next[contactId]; return next; });
      queryClient.invalidateQueries({ queryKey: ['attendance-rows', event.id] });
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al limpiar');
    } finally {
      setSavingFor(null);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>
            Asistencia · {event.title || stageLabel(event.stage)}
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-white"
                  style={{ background: stageColor(event.stage) }}>
              {stageLabel(event.stage)}
            </span>
            <span>{formatDateAR(event.event_date)}{event.event_time ? ` · ${event.event_time.slice(0,5)}` : ''}</span>
            {isCourseStage(event.stage) && (
              <span className="text-amber-400">(Etapa con clases — usar Procesos para clase_1..10)</span>
            )}
          </div>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto..." className="pl-9 h-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {(isLoading || existingLoading) ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Sin contactos para mostrar.</div>
          ) : (
            <div className="divide-y">
              {filtered.map(c => {
                const status = statusById[c.id];
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      {c.numero_cuerda && <div className="text-[10px] text-muted-foreground">Cuerda {c.numero_cuerda}</div>}
                    </div>
                    <MarkBtn label="P" title="Presente" active={status === 'present'} color="green" onClick={() => mark(c.id, 'present')} loading={savingFor === c.id} />
                    <MarkBtn label="A" title="Ausente" active={status === 'absent'} color="red" onClick={() => mark(c.id, 'absent')} loading={savingFor === c.id} />
                    <MarkBtn label="J" title="Justificado" active={status === 'justified'} color="amber" onClick={() => mark(c.id, 'justified')} loading={savingFor === c.id} />
                    {status && (
                      <button onClick={() => clearMark(c.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Limpiar">
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="px-6 py-3 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Las marcas se guardan al instante.
          </div>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MarkBtn = ({ label, title, active, color, onClick, loading }: {
  label: string;
  title: string;
  active: boolean;
  color: 'green' | 'red' | 'amber';
  onClick: () => void;
  loading: boolean;
}) => {
  const baseClass = `w-7 h-7 rounded text-[11px] font-bold border transition-colors disabled:opacity-50`;
  const palette = {
    green: active ? 'bg-green-500 text-white border-green-500' : 'border-green-500/40 text-green-400 hover:bg-green-500/10',
    red: active ? 'bg-red-500 text-white border-red-500' : 'border-red-500/40 text-red-400 hover:bg-red-500/10',
    amber: active ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10',
  }[color];
  return (
    <button onClick={onClick} disabled={loading} title={title} className={`${baseClass} ${palette}`}>
      {label}
    </button>
  );
};

// ─── Utils ────────────────────────────────────────────────────────────

function formatDateAR(s: string): string {
  // Inputs come as 'YYYY-MM-DD'. Format as DD/MM/YY without UTC drift.
  if (!s) return '';
  const parts = s.slice(0, 10).split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export default AsistenciaPage;
