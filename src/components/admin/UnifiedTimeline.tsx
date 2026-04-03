"use client";
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TimelineEvent {
  id: string;
  type: 'transfer' | 'edit' | 'created';
  description: string;
  detail?: string;
  date: Date;
  color: string;
}

interface Props {
  contactId: string;
  churchId: string;
  transfers: any[];
}

const UnifiedTimeline = ({ contactId, churchId, transfers }: Props) => {
  const { data: activityLogs } = useQuery({
    queryKey: ['activity-logs', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('id, action, before_data, after_data, created_at, user_id')
        .eq('entity_id', contactId)
        .eq('entity_type', 'contact')
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!contactId,
  });

  // Build unified timeline
  const events: TimelineEvent[] = [];

  // Add transfers
  transfers.forEach(t => {
    const desc = t.transfer_type === 'auto_assignment' ? 'Autoasignado' : 'Asignado manualmente';
    const detail = [
      t.to_zona && `Zona: ${t.to_zona}`,
      t.to_cuerda && `Cuerda: ${t.to_cuerda}`,
    ].filter(Boolean).join(' · ');
    events.push({
      id: `t-${t.id}`,
      type: 'transfer',
      description: desc,
      detail: detail || undefined,
      date: new Date(t.created_at),
      color: 'bg-primary',
    });
  });

  // Add activity logs (edits)
  (activityLogs || []).forEach(log => {
    if (log.action === 'update') {
      // Detect what changed
      const before = log.before_data as Record<string, any> | null;
      const after = log.after_data as Record<string, any> | null;
      const changes: string[] = [];
      if (before && after) {
        const fields: Record<string, string> = {
          first_name: 'Nombre', last_name: 'Apellido', phone: 'Teléfono',
          address: 'Dirección', cell_id: 'Célula', estado_seguimiento: 'Estado',
          numero_cuerda: 'Cuerda', zona: 'Zona', barrio: 'Barrio',
        };
        for (const [key, label] of Object.entries(fields)) {
          if (String(before[key] || '') !== String(after[key] || '')) {
            if (key === 'estado_seguimiento') {
              changes.push(`${label}: ${before[key] || 'nuevo'} → ${after[key] || 'nuevo'}`);
            } else {
              changes.push(label);
            }
          }
        }
      }
      if (changes.length > 0) {
        events.push({
          id: `a-${log.id}`,
          type: 'edit',
          description: 'Editado',
          detail: changes.join(', '),
          date: new Date(log.created_at),
          color: 'bg-blue-500',
        });
      }
    }
  });

  // Sort by date descending
  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (events.length === 0) return null;

  return (
    <Card className="mt-2">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Historial del contacto</p>
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className="flex items-start gap-3 text-xs">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${e.color}`} />
              <div className="flex-1">
                <p className="text-foreground">
                  <span className="font-medium">{e.description}</span>
                  {e.detail && <span className="text-muted-foreground ml-1">— {e.detail}</span>}
                </p>
                <p className="text-muted-foreground">
                  {format(e.date, "d 'de' MMM yyyy, HH:mm", { locale: es })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UnifiedTimeline;
