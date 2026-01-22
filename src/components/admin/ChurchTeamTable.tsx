"use client";

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { usePermissions } from '@/lib/permissions';

type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

interface ChurchUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  updated_at: string | null;
  church_id: string | null;
}

const ChurchTeamTable = ({ churchId }: { churchId: string }) => {
  const { session } = useSession();
  const { canChangeUserRole, canEditDeleteUsers } = usePermissions();
  const queryClient = useQueryClient();

  // Reglas dinámicas de roles visibles
  const getVisibleRoles = (): UserRole[] => {
    const roles: UserRole[] = ['pastor', 'referente', 'encargado_de_celula'];

    // Solo admin puede ver y asignar 'general'
    if ((session as any)?.profile?.role === 'admin') roles.push('general');

    // Solo tu cuenta (super admin) puede ver y asignar 'admin'
    if (session?.user?.email === 'dan.delauretis@gmail.com') roles.push('admin');

    // Nota: 'user' queda completamente oculto del selector
    return roles;
  };

  const visibleRoles = getVisibleRoles();

  const edgeUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;

  const { data: users, isLoading, isError, error } = useQuery<ChurchUser[]>({
    queryKey: ['churchTeam', churchId],
    queryFn: async () => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'listChurchUsers', churchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudieron cargar los miembros del equipo.');
      }
      return res.json();
    },
    enabled: !!session?.access_token && !!churchId,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'updateUserChurchRole', userId, role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al actualizar el rol del usuario.');
      }
      return res.json();
    },
    onSuccess: () => {
      showSuccess('Rol actualizado correctamente.');
      queryClient.invalidateQueries({ queryKey: ['churchTeam', churchId] });
    },
    onError: (e: any) => {
      const msg = e?.message || 'Error desconocido.';
      showError(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'removeUserFromChurch', userId, churchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al remover el usuario de la iglesia.');
      }
      return res.json();
    },
    onSuccess: () => {
      showSuccess('Usuario removido del equipo.');
      queryClient.invalidateQueries({ queryKey: ['churchTeam', churchId] });
    },
    onError: (e: any) => {
      const msg = e?.message || 'Error desconocido.';
      showError(msg);
    },
  });

  const formatRoleLabel = (role: UserRole) => {
    if (role === 'referente') return 'Referente';
    if (role === 'encargado_de_celula') return 'Encargado de Célula';
    return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isError) {
    return <div className="text-red-500">Error: {(error as any)?.message || 'No se pudieron cargar los miembros.'}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users && users.length > 0 ? (
          users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.first_name || '-'} {u.last_name || ''}</TableCell>
              <TableCell>{u.email || '-'}</TableCell>
              <TableCell>
                <Select
                  value={u.role}
                  onValueChange={(newRole: UserRole) => updateRoleMutation.mutate({ userId: u.id, role: newRole })}
                  disabled={!canChangeUserRole()}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRoles.map((r) => (
                      <SelectItem
                        key={r}
                        value={r}
                      >
                        {formatRoleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Abrir menú</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => removeMutation.mutate(u.id)}
                      className="text-red-600"
                      disabled={!canEditDeleteUsers()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover del equipo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className="text-center">
              No hay miembros en esta iglesia.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default ChurchTeamTable;