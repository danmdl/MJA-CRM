"use client";
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  churchId: string;
  contactId: string;
  refreshSignal: number;
}

const ContactLogInline = ({ churchId, contactId, refreshSignal }: Props) => {
  const { data: logs } = useQuery({
    queryKey: ['contact-logs-inline', contactId, refreshSignal],
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_logs')
        .select('id, contact_date, notes, contacted_by, contact_method')
        .eq('contact_id', contactId)
        .order('contact_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(15);
      return data || [];
    },
    enabled: !!contactId,
  });

  if (!logs?.length) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground/60 italic">Sin registros aún. Ejemplo:</p>
        <div className="rounded border border-dashed border-muted-foreground/20 bg-muted/10 p-2 space-y-0.5 opacity-50">
          <p className="text-[10px] text-muted-foreground">04/04/26 · WhatsApp</p>
          <p className="text-xs italic text-muted-foreground">Estuvo enfermo en los últimos días. Nos pidió oración por su familia.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log: any) => {
        return (
          <div key={log.id} className="text-xs space-y-0.5">
            <div className="flex justify-between items-start">
              <span className="font-medium text-foreground">{log.contact_method || 'Registro'}</span>
              <span className="text-muted-foreground text-[10px]">
                {format(new Date(log.contact_date), "d MMM yy", { locale: es })}
              </span>
            </div>
            {log.notes && <p className="text-muted-foreground leading-snug">{log.notes}</p>}
          </div>
        );
      })}
    </div>
  );
};

export default ContactLogInline;
