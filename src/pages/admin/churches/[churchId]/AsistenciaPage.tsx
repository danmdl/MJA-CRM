"use client";
import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { PROCESS_STAGES, type ProcessStageKey } from '@/lib/process-stages';
import { YearCalendar } from './asistencia/YearCalendar';
import { EtapaView } from './asistencia/EtapaView';
import { EventoDialog } from './asistencia/EventoDialog';
import { TomarAsistenciaDialog } from './asistencia/TomarAsistenciaDialog';
import { ResumenView } from './asistencia/ResumenView';
import { EtapaTab } from './asistencia/EtapaTab';
import type { AttendanceEvent, ProcessRow, TabKey } from './asistencia/types';

const SPECIAL_TABS: TabKey[] = ['todos'];

// ─── Page ─────────────────────────────────────────────────────────────

const AsistenciaPage = () => {
  const { churchId: _churchSlug } = useParams<{ churchId: string }>();
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
export default AsistenciaPage;
