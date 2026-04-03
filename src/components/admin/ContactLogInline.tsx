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
        .select('id, contact_date, notes, contacted_by, method')
        .eq('contact_id', contactId)
        .order('contact_date', { ascending: false })
        .limit(15);
      return data || [];
    },
    enabled: !!contactId,
  });

  if (!logs?.length) {
    return <p className="text-xs text-muted-foreground italic">Sin registros aún.</p>;
  }

  return (
    <div className="space-y-3">
      {logs.map((log: any) => {
        return (
          <div key={log.id} className="text-xs space-y-0.5">
            <div className="flex justify-between items-start">
              <span className="font-medium text-foreground">{log.method || 'Registro'}</span>
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
