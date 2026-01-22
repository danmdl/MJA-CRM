"use client";

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { PlusCircle } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';

interface Candidate {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  church_id: string | null;
}

const AddChurchMemberDialog = ({ churchId }: { churchId: string }) => {
  const { session } = useSession();
  const { canAddUsers } = usePermissions();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);

  const edgeUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;

  const { data: candidates, isLoading } = useQuery<Candidate[]>({
    queryKey: ['churchCandidates', churchId, open],
    queryFn: async () => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'listAvailableChurchCandidates', churchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudieron cargar candidatos.');
      }
      return res.json();
    },
    enabled: !!session?.access_token && !!churchId && open,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'addUserToChurch', userId: selectedUserId, churchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al agregar el usuario a la iglesia.');
      }
      return res.json();
    },
    onSuccess: () => {
      showSuccess('Miembro agregado al equipo.');
      setOpen(false);
      setSelectedUserId(null);
      queryClient.invalidateQueries({ queryKey: ['churchTeam', churchId] });
    },
    onError: (e: any) => {
      const msg = e?.message || 'Error desconocido.';
      showError(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canAddUsers()} type="button">
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar miembro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar miembro a la iglesia</DialogTitle>
          <DialogDescription>Selecciona un usuario existente para asignarlo a esta iglesia.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={selectedUserId ?? ''} onValueChange={(v) => setSelectedUserId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={isLoading ? 'Cargando...' : 'Seleccionar usuario'} />
            </SelectTrigger>
            <SelectContent>
              {(candidates || []).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {(c.first_name || '-') + ' ' + (c.last_name || '')} {c.email ? `— ${c.email}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => addMutation.mutate()}
            disabled={!selectedUserId || addMutation.isPending}
          >
            {addMutation.isPending ? 'Agregando...' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddChurchMemberDialog;