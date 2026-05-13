"use client";
import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Check, X as XIcon, Trash2, Pencil, ChevronLeft, ChevronRight, BarChart3, UserPlus } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { PROCESS_STAGES, stageColor, stageLabel, isCourseStage, type ProcessStageKey } from '@/lib/process-stages';
import { normalize } from '@/lib/normalize';

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
  moved_at: string;
  metadata: Record<string, any>;
  contacts: { first_name: string; last_name: string | null; numero_cuerda: string | null } | null;
}

// 'todos' = aggregate across stages, 'resumen' = stats. All other tab
// keys map directly to ProcessStageKey.
type TabKey = 'todos' | ProcessStageKey | 'resumen';

const SPECIAL_TABS: TabKey[] = ['todos'];

// Calendar setup — Monday-start, Spanish month/day names.
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ─── Page ─────────────────────────────────────────────────────────────

const AsistenciaPage = () => {
  const { churchId: churchSlug } = useParams<{ churchId: string }>();
  const churchId = useChurchUuid();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>('todos');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefillDate, setCreatePrefillDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [takingEvent, setTakingEvent] = useState<AttendanceEvent | null>(null);

  const isPrivileged = !!profile && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role || '');
  const userCuerda = profile?.numero_cuerda || null;

  // Reset year when switching tabs so the user always lands on the
  // current year for the new stage — keeps navigation predictable.
  const stageForTab = useMemo<ProcessStageKey | null>(() => {
    if (SPECIAL_TABS.includes(tab) || tab === 'resumen') return null;
    return tab as ProcessStageKey;
  }, [tab]);

  // ── Events for the current tab + year ──────────────────────────────
  const { data: events = [] } = useQuery<AttendanceEvent[]>({
    queryKey: ['attendance-events', churchId, year, stageForTab],
    queryFn: async () => {
      if (!churchId) return [];
      const yearFrom = `${year}-01-01`;
      const yearTo = `${year}-12-31`;
      let q = supabase.from('attendance_events')
        .select('*')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .gte('event_date', yearFrom)
        .lte('event_date', yearTo)
        .order('event_date', { ascending: false });
      if (stageForTab) q = q.eq('stage', stageForTab);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AttendanceEvent[];
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  // Attendance counts per event
  const eventIds = useMemo(() => events.map(e => e.id), [events]);
  const { data: attendanceByEvent = {} } = useQuery<Record<string, { present: number; absent: number; justified: number }>>({
    queryKey: ['attendance-counts', churchId, eventIds.join(',')],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const { data, error } = await supabase
        .from('contact_attendance')
        .select('event_id, status')
        .in('event_id', eventIds);
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
    enabled: eventIds.length > 0,
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

  // ── Enrolled list for the current etapa ────────────────────────────
  // contact_processes rows for the selected stage. For "todos" we don't
  // show the enrolled list (it'd be a wall of names across all etapas);
  // for each individual etapa we list every contact in that stage
  // regardless of cuerda, so a contact added by Cuerda 12 is visible to
  // Cuerda 5 too. Edit/delete is gated client-side by role + cuerda
  // ownership.
  const { data: enrolled = [], isLoading: enrolledLoading } = useQuery<ProcessRow[]>({
    queryKey: ['asistencia-enrolled', churchId, stageForTab],
    queryFn: async () => {
      if (!churchId || !stageForTab) return [];
      const { data, error } = await supabase
        .from('contact_processes')
        .select('id, contact_id, stage, moved_at, metadata, contacts:contact_id ( first_name, last_name, numero_cuerda )')
        .eq('church_id', churchId)
        .eq('stage', stageForTab)
        .order('moved_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as any) as ProcessRow[];
    },
    enabled: !!churchId && !!stageForTab,
    staleTime: 30_000,
  });

  const handleEventDelete = (ev: AttendanceEvent) => {
    if (!confirm('¿Eliminar este evento? La asistencia registrada también se borra.')) return;
    supabase.from('attendance_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ev.id)
      .then(({ error }) => {
        if (error) { showError(error.message); return; }
        showSuccess('Evento eliminado');
        queryClient.invalidateQueries({ queryKey: ['attendance-events', churchId] });
      });
  };

  // ── Render ─────────────────────────────────────────────────────────
  // The page is content-sized — let AdminLayout's <main overflow:auto>
  // handle scroll if the year calendar ever overflows. We don't try
  // to force fit-in-viewport with h-full + flex-1 anymore because
  // that was stretching the month grids vertically and squashing the
  // month labels against their top edge with empty space underneath.
  return (
    <div className="p-3 sm:p-4">
      {/* Header: title + Nuevo evento. Compact, single row. */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-lg sm:text-xl font-bold">Asistencia</h1>
        <span className="text-xs text-muted-foreground hidden md:inline">Registro ligado a las etapas de Procesos</span>
        <div className="flex-1" />
        {tab !== 'resumen' && (
          <Button onClick={() => { setCreatePrefillDate(null); setCreateOpen(true); }} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" /> Nuevo evento
          </Button>
        )}
      </div>

      {/* Etapa tabs — Calendario first, one tab per stage, then
          Resumen. Full stage labels (Nuevas Personas Domingos,
          Liberación, etc.) instead of the 6-char short codes — the
          short ones were unreadable per Dan's feedback. The row
          scrolls horizontally on narrow viewports. */}
      <div className="flex items-center gap-1 border-b border-border mb-2 overflow-x-auto pb-px shrink-0">
        <EtapaTab active={tab === 'todos'} onClick={() => setTab('todos')} label="Calendario" />
        {PROCESS_STAGES.map(s => (
          <EtapaTab
            key={s.key}
            active={tab === s.key}
            onClick={() => setTab(s.key)}
            label={s.label}
            fullLabel={s.label}
            color={s.color}
          />
        ))}
        <EtapaTab active={tab === 'resumen'} onClick={() => setTab('resumen')} label="Resumen" icon={<BarChart3 className="h-3 w-3" />} />
      </div>

      {tab === 'resumen' ? (
        <div className="flex-1 overflow-y-auto">
          <ResumenView events={events} attendanceByEvent={attendanceByEvent} />
        </div>
      ) : tab === 'todos' ? (
        // ─── Calendario view ─────────────────────────────────────────
        // Sized to content — let the year grid pack itself tightly
        // instead of stretching to fill the viewport. The 6×2
        // layout already keeps the 12 months above the fold on
        // desktop; making the container flex-1 was just inflating
        // each month box and visually squishing the month label
        // against the top.
        <div className="overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px]">
            <div className="inline-flex items-center gap-1 border rounded-md">
              <button onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-muted/50 rounded-l-md" title="Año anterior">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-3 text-xs font-semibold min-w-[50px] text-center">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-muted/50 rounded-r-md" title="Año siguiente">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Referencias:</span>
            {PROCESS_STAGES.map(s => (
              <span key={s.key} className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.short}
              </span>
            ))}
          </div>
          <YearCalendar
            year={year}
            events={events}
            onDayClick={(dateStr) => { setCreatePrefillDate(dateStr); setCreateOpen(true); }}
            onEventClick={(ev) => setTakingEvent(ev)}
            onEventEdit={(ev) => setEditingEvent(ev)}
            onEventDelete={handleEventDelete}
            attendanceByEvent={attendanceByEvent}
          />
        </div>
      ) : (
        // ─── Specific etapa view ─────────────────────────────────────
        // No almanaque here per Dan's spec — just the enrolled list +
        // the scheduled-dates list for this etapa. Dates set here
        // show up as colored dots on the Calendario tab.
        <div className="flex-1 overflow-y-auto">
          <EtapaView
            stage={stageForTab!}
            events={events}
            attendanceByEvent={attendanceByEvent}
            enrolled={enrolled}
            enrolledLoading={enrolledLoading}
            isPrivileged={isPrivileged}
            userCuerda={userCuerda}
            userId={profile?.id || null}
            churchId={churchId!}
            onTakeAttendance={setTakingEvent}
            onEditEvent={setEditingEvent}
            onDeleteEvent={handleEventDelete}
            onScheduleDate={() => { setCreatePrefillDate(null); setCreateOpen(true); }}
            onEnrolledChanged={() => queryClient.invalidateQueries({ queryKey: ['asistencia-enrolled', churchId, stageForTab] })}
          />
        </div>
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
          defaultStage={stageForTab || 'nuevas_personas_celulas'}
          defaultDate={createPrefillDate}
          existing={editingEvent}
          onClose={() => { setCreateOpen(false); setEditingEvent(null); setCreatePrefillDate(null); }}
          onSaved={() => {
            setCreateOpen(false); setEditingEvent(null); setCreatePrefillDate(null);
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
          }}
        />
      )}
    </div>
  );
};

// ─── Tab button ───────────────────────────────────────────────────────

const EtapaTab = ({ active, onClick, label, fullLabel, color, icon }: {
  active: boolean;
  onClick: () => void;
  label: string;
  fullLabel?: string;
  color?: string;
  icon?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    title={fullLabel || label}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b-2 -mb-px transition-colors ${
      active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}
  >
    {color && (
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
    )}
    {icon}
    {label}
  </button>
);

// Legend is now inlined into the Calendario tab row so it shares
// the year-nav line — saves a whole vertical strip and makes the
// year fit without scrolling. The standalone component is gone.

// ─── Year calendar ────────────────────────────────────────────────────

const YearCalendar = ({ year, events, onDayClick, onEventClick, onEventEdit, onEventDelete, attendanceByEvent }: {
  year: number;
  events: AttendanceEvent[];
  onDayClick: (dateStr: string) => void;
  onEventClick: (ev: AttendanceEvent) => void;
  onEventEdit: (ev: AttendanceEvent) => void;
  onEventDelete: (ev: AttendanceEvent) => void;
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
}) => {
  const [popoverDay, setPopoverDay] = useState<{ month: number; day: number } | null>(null);

  // Bucket events by 'YYYY-MM-DD' for fast lookup per cell.
  const byDate = useMemo(() => {
    const m: Record<string, AttendanceEvent[]> = {};
    events.forEach(e => {
      (m[e.event_date] = m[e.event_date] || []).push(e);
    });
    return m;
  }, [events]);

  // Six columns × two rows of month grids on xl+ so a full year
  // fits in the viewport without page scroll. Drops to 4×3 on lg,
  // 3×4 on md, 2×6 on sm, 1×12 on phone (mobile keeps scroll —
  // making 12 mini-calendars share a phone viewport is hostile).
  // No h-full on the grid: each MonthGrid sizes to its content
  // (~210px) so the boxes don't stretch to fill empty space when
  // the viewport is taller than the calendar needs. The month
  // name stays full-size at the top instead of getting visually
  // squashed by an oversized container.
  return (
    <div className="relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {Array.from({ length: 12 }, (_, monthIdx) => (
          <MonthGrid
            key={monthIdx}
            year={year}
            month={monthIdx}
            byDate={byDate}
            onDayClick={(day) => {
              const eventsHere = byDate[isoDate(year, monthIdx, day)] || [];
              if (eventsHere.length === 0) {
                onDayClick(isoDate(year, monthIdx, day));
              } else {
                // Open a popover-ish list for this day instead of
                // immediately jumping into one of N events.
                setPopoverDay({ month: monthIdx, day });
              }
            }}
          />
        ))}
      </div>

      {popoverDay && (
        <DayPopover
          year={year}
          month={popoverDay.month}
          day={popoverDay.day}
          events={byDate[isoDate(year, popoverDay.month, popoverDay.day)] || []}
          attendanceByEvent={attendanceByEvent}
          onClose={() => setPopoverDay(null)}
          onTake={(ev) => { setPopoverDay(null); onEventClick(ev); }}
          onEdit={(ev) => { setPopoverDay(null); onEventEdit(ev); }}
          onDelete={onEventDelete}
          onNew={() => { setPopoverDay(null); onDayClick(isoDate(year, popoverDay.month, popoverDay.day)); }}
        />
      )}
    </div>
  );
};

const MonthGrid = ({ year, month, byDate, onDayClick }: {
  year: number;
  month: number;
  byDate: Record<string, AttendanceEvent[]>;
  onDayClick: (day: number) => void;
}) => {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Convert JS Sunday-start (0) into Monday-start offset.
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to 42 cells (6 weeks) so every month grid is the same height.
  while (cells.length < 42) cells.push(null);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Compact layout: tight padding, small fonts, fixed cell height
  // (no aspect-square — that scaled the cells with width and made
  // months balloon when the grid had few columns). h-6 cells ×
  // 6 rows of weeks = 144px of grid; plus header (14px) + weekday
  // row (12px) + padding (8px) ≈ 180px per month. 2 rows of months
  // = ~360px, comfortably under a typical viewport's calendar
  // budget after the page header / etapa tabs / legend.
  return (
    <div className="border rounded-md p-1.5 bg-card">
      <div className="text-xs font-semibold mb-1.5 leading-tight">{MONTH_NAMES[month]}</div>
      <div className="grid grid-cols-7 gap-px text-[9px] text-muted-foreground mb-0.5">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center leading-none">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="h-6" />;
          const dateStr = isoDate(year, month, d);
          const evs = byDate[dateStr] || [];
          const isToday = isCurrentMonth && today.getDate() === d;
          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={`h-6 flex flex-col items-center justify-start py-0.5 rounded text-[9px] leading-none transition-colors ${
                isToday ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-muted/40'
              }`}
            >
              <span className={`${isToday ? 'font-bold text-primary' : 'text-foreground'}`}>{d}</span>
              {evs.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {evs.slice(0, 3).map(e => (
                    <span key={e.id} className="w-1 h-1 rounded-full" style={{ background: stageColor(e.stage) }} />
                  ))}
                  {evs.length > 3 && <span className="text-[7px] leading-none text-muted-foreground">+</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const DayPopover = ({ year, month, day, events, attendanceByEvent, onClose, onTake, onEdit, onDelete, onNew }: {
  year: number;
  month: number;
  day: number;
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
  onClose: () => void;
  onTake: (ev: AttendanceEvent) => void;
  onEdit: (ev: AttendanceEvent) => void;
  onDelete: (ev: AttendanceEvent) => void;
  onNew: () => void;
}) => (
  <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{day} de {MONTH_NAMES[month]} {year}</DialogTitle>
      </DialogHeader>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto py-1">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin eventos en este día.</p>
        ) : events.map(ev => {
          const c = attendanceByEvent[ev.id] || { present: 0, absent: 0, justified: 0 };
          const total = c.present + c.absent + c.justified;
          return (
            <div key={ev.id} className="flex items-center gap-2 p-2 border rounded">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-white shrink-0"
                    style={{ background: stageColor(ev.stage) }}>
                {stageLabel(ev.stage)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {ev.title || stageLabel(ev.stage)}
                </div>
                {total > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    {c.present}P {c.absent > 0 && `· ${c.absent}A`} {c.justified > 0 && `· ${c.justified}J`}
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => onTake(ev)} className="gap-1 h-7 text-xs">
                <Check className="h-3 w-3" /> Asistencia
              </Button>
              <button onClick={() => onEdit(ev)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Editar">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => onDelete(ev)} className="p-1 text-muted-foreground hover:text-red-400 rounded" title="Eliminar">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        <Button onClick={onNew} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Nuevo evento este día</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── Etapa view (no almanaque, just scheduled dates + enrolled) ──────

const EtapaView = ({ stage, events, attendanceByEvent, enrolled, enrolledLoading, isPrivileged, userCuerda, userId, churchId, onTakeAttendance, onEditEvent, onDeleteEvent, onScheduleDate, onEnrolledChanged }: {
  stage: ProcessStageKey;
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
  enrolled: ProcessRow[];
  enrolledLoading: boolean;
  isPrivileged: boolean;
  userCuerda: string | null;
  userId: string | null;
  churchId: string;
  onTakeAttendance: (ev: AttendanceEvent) => void;
  onEditEvent: (ev: AttendanceEvent) => void;
  onDeleteEvent: (ev: AttendanceEvent) => void;
  onScheduleDate: () => void;
  onEnrolledChanged: () => void;
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Fechas programadas — list of events scheduled for this
          etapa, oldest to newest. Each row offers take attendance /
          edit / delete. Dates set here show up as colored dots in
          the Calendario tab. */}
      <div className="border rounded-lg bg-card overflow-hidden h-fit">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <div className="text-sm font-semibold">Fechas programadas</div>
          <span className="text-xs text-muted-foreground">({events.length})</span>
          <div className="flex-1" />
          <Button size="sm" onClick={onScheduleDate} className="gap-1 h-7 text-xs">
            <Plus className="h-3 w-3" /> Programar fecha
          </Button>
        </div>
        {events.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground px-4">
            No hay fechas programadas para {stageLabel(stage)}. Apretá "Programar fecha" para crear una.
          </div>
        ) : (
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {events.map(ev => {
              const c = attendanceByEvent[ev.id] || { present: 0, absent: 0, justified: 0 };
              const total = c.present + c.absent + c.justified;
              return (
                <div key={ev.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="text-[11px] font-semibold tabular-nums w-14 shrink-0">{formatDateAR(ev.event_date)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {ev.title || stageLabel(ev.stage)}
                    </div>
                    {total > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        {c.present}P{c.absent > 0 && ` · ${c.absent}A`}{c.justified > 0 && ` · ${c.justified}J`}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onTakeAttendance(ev)} className="gap-1 h-7 text-xs">
                    <Check className="h-3 w-3" /> Asistencia
                  </Button>
                  <button onClick={() => onEditEvent(ev)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Editar">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDeleteEvent(ev)} className="p-1 text-muted-foreground hover:text-red-400 rounded" title="Eliminar">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Personas inscriptas en la etapa */}
      <EnrolledList
        churchId={churchId}
        stage={stage}
        enrolled={enrolled}
        loading={enrolledLoading}
        isPrivileged={isPrivileged}
        userCuerda={userCuerda}
        userId={userId}
        onChanged={onEnrolledChanged}
      />
    </div>
  );
};

// ─── Enrolled list per etapa ──────────────────────────────────────────

const EnrolledList = ({ churchId, stage, enrolled, loading, isPrivileged, userCuerda, userId, onChanged }: {
  churchId: string;
  stage: ProcessStageKey;
  enrolled: ProcessRow[];
  loading: boolean;
  isPrivileged: boolean;
  userCuerda: string | null;
  userId: string | null;
  onChanged: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [adderOpen, setAdderOpen] = useState(false);
  const [savingDelete, setSavingDelete] = useState<string | null>(null);

  const canEditRow = (row: ProcessRow) => {
    if (isPrivileged) return true;
    // Field roles can only edit rows for contacts in their own cuerda.
    if (!userCuerda) return false;
    return row.contacts?.numero_cuerda === userCuerda;
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return enrolled;
    const t = normalize(search);
    return enrolled.filter(p =>
      normalize(`${p.contacts?.first_name || ''} ${p.contacts?.last_name || ''}`).includes(t) ||
      normalize(p.contacts?.numero_cuerda || '').includes(t),
    );
  }, [enrolled, search]);

  const handleDelete = async (row: ProcessRow) => {
    if (!confirm('¿Sacar a esta persona de la etapa? La asistencia registrada queda intacta.')) return;
    setSavingDelete(row.id);
    try {
      const { error } = await supabase.from('contact_processes').delete().eq('id', row.id);
      if (error) throw error;
      showSuccess('Persona removida');
      onChanged();
    } catch (e: any) {
      showError(e.message || 'Error al remover');
    } finally {
      setSavingDelete(null);
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b">
        <div className="text-sm font-semibold">
          Personas en {stageLabel(stage)}
          <span className="text-muted-foreground font-normal ml-1.5">({enrolled.length})</span>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 w-[220px]" placeholder="Buscar inscriptos..." />
        </div>
        <Button size="sm" onClick={() => setAdderOpen(true)} className="gap-1 h-8 text-xs">
          <UserPlus className="h-3 w-3" /> Agregar persona
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-xs text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          {search ? 'Sin coincidencias.' : 'Nadie cargado en esta etapa todavía.'}
        </div>
      ) : (
        <div className="divide-y">
          {filtered.map(row => {
            const editable = canEditRow(row);
            // Clase % for course stages (ABC / Nivel 1 / Nivel 2).
            const isCourse = isCourseStage(stage);
            const presentClases = isCourse
              ? Array.from({ length: 10 }, (_, i) => row.metadata?.[`clase_${i + 1}`]).filter(v => v === 'P').length
              : null;
            const recordedClases = isCourse
              ? Array.from({ length: 10 }, (_, i) => row.metadata?.[`clase_${i + 1}`]).filter(v => v === 'P' || v === 'A').length
              : null;
            return (
              <div key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.contacts?.first_name} {row.contacts?.last_name || ''}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.contacts?.numero_cuerda ? `Cuerda ${row.contacts.numero_cuerda}` : 'Sin cuerda'}
                  </div>
                </div>
                {isCourse && recordedClases !== null && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {presentClases}/{recordedClases} clases
                  </div>
                )}
                {editable && (
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={savingDelete === row.id}
                    className="p-1.5 text-muted-foreground hover:text-red-400 rounded disabled:opacity-50"
                    title="Sacar de la etapa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adderOpen && (
        <AddPersonDialog
          churchId={churchId}
          stage={stage}
          userId={userId}
          existingContactIds={new Set(enrolled.map(e => e.contact_id))}
          onClose={() => setAdderOpen(false)}
          onAdded={() => { setAdderOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
};

// ─── Add-person search dialog ─────────────────────────────────────────

const AddPersonDialog = ({ churchId, stage, userId, existingContactIds, onClose, onAdded }: {
  churchId: string;
  stage: ProcessStageKey;
  userId: string | null;
  existingContactIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  // Cross-cuerda search of the church's contacts. Users from any
  // cuerda can ADD a contact to an etapa per Dan's spec — the
  // edit/delete restriction is enforced on the row in the list above.
  const { data: results = [], isLoading } = useQuery<ContactRow[]>({
    queryKey: ['asistencia-add-person-search', churchId, search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      // search_name (migration 0033) is unaccent(lower(first + ' ' +
      // last)) maintained by trigger, so the query is accent + case
      // insensitive. Normalize the user's input the same way.
      const t = normalize(search);
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, numero_cuerda')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .ilike('search_name', `%${t}%`)
        .order('first_name')
        .limit(40);
      if (error) throw error;
      return (data || []) as ContactRow[];
    },
    enabled: !!churchId && search.trim().length >= 2,
    staleTime: 15_000,
  });

  const handleAdd = async (contact: ContactRow) => {
    if (existingContactIds.has(contact.id)) {
      showError('Esta persona ya está en la etapa');
      return;
    }
    setAdding(contact.id);
    try {
      // Move (or create) the row to this stage. ON CONFLICT updates
      // an existing row's stage rather than rejecting — a contact
      // can only be in one stage at a time.
      const { error } = await supabase.from('contact_processes')
        .upsert({
          contact_id: contact.id,
          church_id: churchId,
          stage,
          moved_at: new Date().toISOString(),
          moved_by: userId,
          metadata: {},
        }, { onConflict: 'contact_id' });
      if (error) throw error;
      showSuccess(`${contact.first_name} agregado a ${stageLabel(stage)}`);
      onAdded();
    } catch (e: any) {
      showError(e.message || 'Error al agregar');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Agregar persona a {stageLabel(stage)}</DialogTitle>
          <div className="text-xs text-muted-foreground">Buscá por nombre. Cualquier cuerda puede agregar.</div>
        </DialogHeader>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-sm pl-9" placeholder="Nombre o apellido..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {search.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Escribí al menos 2 letras para buscar.</p>
          ) : isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin coincidencias.</p>
          ) : (
            <div className="divide-y">
              {results.map(c => {
                const already = existingContactIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.numero_cuerda ? `Cuerda ${c.numero_cuerda}` : 'Sin cuerda'}
                      </div>
                    </div>
                    {already ? (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Ya está</span>
                    ) : (
                      <Button size="sm" variant="outline" disabled={adding === c.id} onClick={() => handleAdd(c)} className="h-7 text-xs">
                        {adding === c.id ? 'Agregando…' : 'Agregar'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Resumen view (unchanged behavior) ───────────────────────────────

const ResumenView = ({ events, attendanceByEvent }: {
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, { present: number; absent: number; justified: number }>;
}) => {
  const stats = useMemo(() => {
    let totalPresent = 0;
    let totalRecorded = 0;
    events.forEach(e => {
      const c = attendanceByEvent[e.id];
      if (c) {
        totalPresent += c.present;
        totalRecorded += c.present + c.absent + c.justified;
      }
    });
    const avgPresent = totalRecorded === 0 ? 0 : Math.round((totalPresent / totalRecorded) * 100);
    return { totalEvents: events.length, avgPresent, totalAttendanceRecords: totalRecorded };
  }, [events, attendanceByEvent]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Eventos" value={String(stats.totalEvents)} />
        <Stat label="% asistencia promedio" value={`${stats.avgPresent}%`} sub={`${stats.totalAttendanceRecords} registros`} />
        <Stat label="Etapas con eventos" value={String(new Set(events.map(e => e.stage)).size)} />
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">Eventos recientes</div>
        {events.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Sin eventos.</div>
        ) : (
          <div className="divide-y">
            {events.slice(0, 30).map(ev => {
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

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="p-4 border rounded-lg bg-card">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

// ─── Create / Edit event dialog ──────────────────────────────────────

const EventoDialog = ({ churchId, cuerdas, cells, userId, userCuerdaNumero, isPrivileged, defaultStage, defaultDate, existing, onClose, onSaved }: {
  churchId: string;
  cuerdas: { id: string; numero: string; is_church_cuerda: boolean | null }[];
  cells: { id: string; name: string; cuerda_id: string | null }[];
  userId: string | null;
  userCuerdaNumero: string | null;
  isPrivileged: boolean;
  defaultStage: ProcessStageKey;
  defaultDate: string | null;
  existing: AttendanceEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const userCuerdaId = useMemo(() => cuerdas.find(c => c.numero === userCuerdaNumero)?.id || null, [cuerdas, userCuerdaNumero]);

  const [stage, setStage] = useState<ProcessStageKey>(existing?.stage || defaultStage);
  const [date, setDate] = useState(existing?.event_date || defaultDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(existing?.event_time?.slice(0, 5) || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [cuerdaId, setCuerdaId] = useState<string | null>(
    existing?.cuerda_id ?? (isPrivileged ? null : userCuerdaId),
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

// ─── Take attendance dialog ──────────────────────────────────────────

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

  // Pull contacts from the enrolled list for this stage rather than
  // every contact in the church — taking attendance is bounded to who
  // is actually in the etapa. Cross-cuerda since the etapa list is
  // shared across cuerdas.
  const { data: enrolled = [], isLoading } = useQuery<{ contact_id: string; first_name: string; last_name: string | null; numero_cuerda: string | null }[]>({
    queryKey: ['asistencia-take-list', churchId, event.stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_processes')
        .select('contact_id, contacts:contact_id ( first_name, last_name, numero_cuerda )')
        .eq('church_id', churchId)
        .eq('stage', event.stage);
      if (error) throw error;
      return ((data || []) as any).map((r: any) => ({
        contact_id: r.contact_id,
        first_name: r.contacts?.first_name || '?',
        last_name: r.contacts?.last_name || null,
        numero_cuerda: r.contacts?.numero_cuerda || null,
      }));
    },
    staleTime: 30_000,
  });

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

  useEffect(() => {
    if (existing.length === 0) return;
    const next: Record<string, 'present' | 'absent' | 'justified'> = {};
    existing.forEach(r => { next[r.contact_id] = r.status; });
    setStatusById(prev => ({ ...prev, ...next }));
  }, [existing]);

  // Default visible list scopes by the event's cuerda (if any), then
  // by the user's cuerda when not privileged. Privileged see all
  // enrolled across cuerdas.
  const visible = useMemo(() => {
    let list = enrolled;
    if (!isPrivileged && userCuerda) {
      list = list.filter(c => c.numero_cuerda === userCuerda);
    }
    if (search.trim()) {
      const t = normalize(search);
      list = list.filter(c => normalize(`${c.first_name} ${c.last_name || ''}`).includes(t));
    }
    return list;
  }, [enrolled, isPrivileged, userCuerda, search]);

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
              <span className="text-amber-400">(Etapa con clases — clase_1..10 se carga en Procesos)</span>
            )}
          </div>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar inscripto..." className="pl-9 h-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {(isLoading || existingLoading) ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {enrolled.length === 0
                ? 'Nadie está cargado en esta etapa todavía. Agregalos desde la lista.'
                : 'Sin coincidencias en tu cuerda.'}
            </div>
          ) : (
            <div className="divide-y">
              {visible.map(c => {
                const status = statusById[c.contact_id];
                return (
                  <div key={c.contact_id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      {c.numero_cuerda && <div className="text-[10px] text-muted-foreground">Cuerda {c.numero_cuerda}</div>}
                    </div>
                    <MarkBtn label="P" title="Presente" active={status === 'present'} color="green" onClick={() => mark(c.contact_id, 'present')} loading={savingFor === c.contact_id} />
                    <MarkBtn label="A" title="Ausente" active={status === 'absent'} color="red" onClick={() => mark(c.contact_id, 'absent')} loading={savingFor === c.contact_id} />
                    <MarkBtn label="J" title="Justificado" active={status === 'justified'} color="amber" onClick={() => mark(c.contact_id, 'justified')} loading={savingFor === c.contact_id} />
                    {status && (
                      <button onClick={() => clearMark(c.contact_id)} className="p-1 text-muted-foreground hover:text-foreground" title="Limpiar">
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
          <div className="text-xs text-muted-foreground">Las marcas se guardan al instante.</div>
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
  if (!s) return '';
  const parts = s.slice(0, 10).split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

function isoDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export default AsistenciaPage;
