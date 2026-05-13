import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Check, Pencil, Trash2 } from 'lucide-react';
import { stageColor, stageLabel } from '@/lib/process-stages';
import { formatDateAR, isoDate } from './helpers';
import { MONTH_NAMES, WEEKDAYS, type AttendanceCounts, type AttendanceEvent } from './types';

interface YearCalendarProps {
  year: number;
  events: AttendanceEvent[];
  onDayClick: (dateStr: string) => void;
  onEventClick: (ev: AttendanceEvent) => void;
  onEventEdit: (ev: AttendanceEvent) => void;
  onEventDelete: (ev: AttendanceEvent) => void;
  attendanceByEvent: Record<string, AttendanceCounts>;
}

/**
 * 12-month grid that lays out the whole year. Clicking a day with no
 * events opens the new-event flow via `onDayClick`; clicking a day
 * with events opens a DayPopover that lets you take attendance, edit
 * or delete each event or schedule another one for the same date.
 */
export const YearCalendar = ({
  year, events, onDayClick, onEventClick, onEventEdit, onEventDelete, attendanceByEvent,
}: YearCalendarProps) => {
  const [popoverDay, setPopoverDay] = useState<{ month: number; day: number } | null>(null);

  // Bucket events by 'YYYY-MM-DD' for fast lookup per cell.
  const byDate = useMemo(() => {
    const m: Record<string, AttendanceEvent[]> = {};
    events.forEach(e => {
      (m[e.event_date] = m[e.event_date] || []).push(e);
    });
    return m;
  }, [events]);

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
  attendanceByEvent: Record<string, AttendanceCounts>;
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

// formatDateAR is exported from helpers; this re-export keeps the original
// file's symbol available for callers that imported it from here.
export { formatDateAR };
