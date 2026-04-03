"use client";
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, X, Users } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';

interface PendingMatch {
  id: string;
  cell_id: string;
  matched_name: string;
  status: string;
  cell: { name: string; address: string | null; meeting_day: string | null; meeting_time: string | null } | null;
}

const PendingLeaderMatches = () => {
  const { session, profile } = useSession();
  const queryClient = useQueryClient();

  const { data: matches } = useQuery<PendingMatch[]>({
    queryKey: ['pending-leader-matches', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      const { data } = await supabase
        .from('pending_leader_matches')
        .select('id, cell_id, matched_name, status, cell:cells(name, address, meeting_day, meeting_time)')
        .eq('profile_id', session.user.id)
        .eq('status', 'pending');
      return (data || []) as PendingMatch[];
    },
    enabled: !!session?.user?.id,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ matchId, cellId, accept }: { matchId: string; cellId: string; accept: boolean }) => {
      // Update the match status
      await supabase.from('pending_leader_matches').update({ status: accept ? 'confirmed' : 'rejected' }).eq('id', matchId);
      
      if (accept && session?.user?.id) {
        // Link the profile to the cell as encargado
        await supabase.from('cells').update({ encargado_id: session.user.id }).eq('id', cellId);
      }
    },
    onSuccess: (_, { accept }) => {
      showSuccess(accept ? 'Liderazgo confirmado' : 'Asignación rechazada');
      queryClient.invalidateQueries({ queryKey: ['pending-leader-matches'] });
      queryClient.invalidateQueries({ queryKey: ['cells'] });
    },
    onError: () => showError('Error al procesar'),
  });

  if (!matches?.length) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary">Células asignadas por nombre</span>
      </div>
      <div className="space-y-2">
        {matches.map(m => (
          <Card key={m.id} className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 space-y-2">
              <p className="text-xs">
                Se encontró una célula con líder <span className="font-semibold">"{m.matched_name}"</span> que coincide con tu nombre.
              </p>
              {m.cell && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{m.cell.name}</p>
                  {m.cell.address && <p>{m.cell.address}</p>}
                  {m.cell.meeting_day && <p>{m.cell.meeting_day} · {m.cell.meeting_time}</p>}
                </div>
              )}
              <p className="text-xs font-medium">¿Sos el líder de esta célula?</p>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => respondMutation.mutate({ matchId: m.id, cellId: m.cell_id, accept: true })}>
                  <CheckCircle2 className="h-3 w-3" /> Sí, confirmar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => respondMutation.mutate({ matchId: m.id, cellId: m.cell_id, accept: false })}>
                  <X className="h-3 w-3" /> No soy yo
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PendingLeaderMatches;
