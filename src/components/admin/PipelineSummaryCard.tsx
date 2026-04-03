"use client";
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PIPELINE_STAGES } from '@/components/admin/ContactPipelineBadge';

interface Props {
  churchId: string;
}

const PipelineSummaryCard = ({ churchId }: Props) => {
  const { data: counts } = useQuery({
    queryKey: ['pipeline-counts', churchId],
    queryFn: async () => {
      const result: Record<string, number> = {};
      for (const stage of PIPELINE_STAGES) {
        const { count } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('estado_seguimiento', stage.key);
        result[stage.key] = count || 0;
      }
      // Also count nulls as 'nuevo'
      const { count: nullCount } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .is('estado_seguimiento', null);
      result['nuevo'] = (result['nuevo'] || 0) + (nullCount || 0);
      return result;
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Pipeline de Seguimiento</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {PIPELINE_STAGES.map(stage => {
            const count = counts?.[stage.key] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="text-xs w-24 text-muted-foreground">{stage.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${stage.color.split(' ')[0].replace('/15', '')}`}
                    style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-xs font-mono w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">Total: {total} contactos</p>
      </CardContent>
    </Card>
  );
};

export default PipelineSummaryCard;
