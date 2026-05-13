import { useMemo } from 'react';
import { stageColor, stageLabel } from '@/lib/process-stages';
import { formatDateAR } from './helpers';
import type { AttendanceEvent, AttendanceCounts } from './types';

interface ResumenViewProps {
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, AttendanceCounts>;
}

export const ResumenView = ({ events, attendanceByEvent }: ResumenViewProps) => {
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
