"use client";
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
      // Was N+1 queries (one per stage + one for nulls). At 8.9K contacts
      // and 9 stages that's 9 round-trips. Now: single SELECT projecting
      // only the stage column and counting in JS — same correctness, one
      // round-trip, scales fine to 500K rows because Postgres just streams
      // a single text column from the index. Pulling all rows in chunks
      // because PostgREST default cap is 1000.
      const result: Record<string, number> = {};
      const PAGE = 1000;
      for (let p = 0; ; p++) {
        const { data, error } = await supabase
          .from('contacts')
          .select('estado_seguimiento')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .range(p * PAGE, (p + 1) * PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const row of data) {
          const key = row.estado_seguimiento || 'nuevo';
          result[key] = (result[key] || 0) + 1;
        }
        if (data.length < PAGE) break;
      }
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
