import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Contact {
  created_at: string;
  numero_cuerda: string | null;
  estado_seguimiento: string | null;
}

const COLORS = ['#FFC233', '#f43f5e', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#6366f1'];

const MetricsCharts = ({ churchId }: { churchId: string }) => {
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['metrics-contacts', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('contacts')
        .select('created_at, numero_cuerda, estado_seguimiento')
        .eq('church_id', churchId)
        .is('deleted_at', null);
      return (data || []) as Contact[];
    },
    staleTime: 60000,
  });

  // Weekly trend: contacts created per week (last 8 weeks)
  const weeklyData = useMemo(() => {
    if (!contacts?.length) return [];
    const weeks: { label: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const count = contacts.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d < end;
      }).length;
      const label = `${start.getDate()}/${start.getMonth() + 1}`;
      weeks.push({ label, count });
    }
    return weeks;
  }, [contacts]);

  const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1);

  // Distribution by cuerda
  const cuerdaData = useMemo(() => {
    if (!contacts?.length) return [];
    const counts: Record<string, number> = {};
    contacts.forEach(c => {
      const key = c.numero_cuerda || 'Sin asignar';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([cuerda, count]) => ({ cuerda, count }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  const maxCuerda = Math.max(...cuerdaData.map(c => c.count), 1);

  if (!contacts?.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Weekly trend */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contactos nuevos por semana</p>
        <div className="flex items-end gap-1.5 h-[120px]">
          {weeklyData.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground tabular-nums">{w.count > 0 ? w.count : ''}</span>
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max((w.count / maxWeekly) * 90, 2)}px`,
                  backgroundColor: w.count > 0 ? '#FFC233' : '#27272a',
                }}
              />
              <span className="text-[8px] text-muted-foreground">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution by cuerda */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contactos por cuerda</p>
        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
          {cuerdaData.map((c, i) => (
            <div key={c.cuerda} className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-14 text-right shrink-0 text-muted-foreground">{c.cuerda}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(c.count / maxCuerda) * 100}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              <span className="text-[10px] font-bold tabular-nums w-6 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MetricsCharts;
