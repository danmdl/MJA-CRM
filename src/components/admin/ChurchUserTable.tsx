import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Copy, Send, Trash2 } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Search } from 'lucide-react';
import React from 'react';
import { usePermissions, getRoleLevel, ROLE_LABELS } from '@/lib/permissions';

type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  updated_at: string;
  status: 'confirmed' | 'invited' | 'unknown';
  invited_at: string | null;
  confirmed_at: string | null;
  church_id: string | null;
}

const fetchChurchUsers = async (accessToken: string, churchId: string): Promise<User[]> => {
  const response = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'listChurchUsers', churchId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'No se pudieron cargar los usuarios de la iglesia.');
  }
  return response.json();
};

const ALL_ROLES: UserRole[] = ['user', 'encargado_de_celula', 'referente', 'pastor', 'general', 'admin'];

const ChurchUserTable = ({ churchId }: { churchId: string }) => {
  const { session, profile } = useSession();
  const { canChangeUserRole, canEditDeleteUsers, canAddUsers } = usePermissions();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const myLevel = getRoleLevel(profile?.role || '');

  const { data: users, isLoading, isError, error } = useQuery<User[]>({
    queryKey: ['churchUsers', churchId],
    queryFn: () => fetchChurchUsers(session?.access_token || '', churchId),
    enabled: !!session?.access_token && !!churchId,
  });

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return users;
    return users.filter(u =>
      [u.first_name, u.last_name, u.email, u.role].join(' ').toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const callEdge = async (body: object) => {
    const response = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Error.'); }
    return response.json();
  };

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => callEdge({ action: 'deleteUser', userId }),
    onSuccess: () => { showSuccess('Usuario eliminado.'); queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] }); },
    onError: (err: any) => showError(err.message || 'Error al eliminar.'),
  });

  const resendInviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      callEdge({ action: 'resendInvite', email, role, churchId }),
    onSuccess: () => { showSuccess('Invitación reenviada.'); queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] }); },
    onError: (err: any) => showError(err.message || 'Error al reenviar.'),
  });

  const generateInviteLinkMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      callEdge({ action: 'generateInviteLink', email, role, churchId }),
    onSuccess: (data) => {
      if (data.inviteLink) { navigator.clipboard.writeText(data.inviteLink); showSuccess('Enlace copiado.'); }
    },
    onError: (err: any) => showError(err.message || 'Error al generar enlace.'),
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: UserRole }) =>
      callEdge({ action: 'updateUserRole', userId, newRole }),
    onSuccess: () => { showSuccess('Rol actualizado.'); queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] }); },
    onError: (err: any) => showError(err.message || 'Error al actualizar rol.'),
  });

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return d; }
  };

  const getStatusBadge = (status: User['status']) => {
    switch (status) {
      case 'confirmed': return <Badge className="bg-green-500 hover:bg-green-500">Confirmado</Badge>;
      case 'invited': return <Badge variant="outline" className="bg-yellow-500 hover:bg-yellow-500 text-white">Invitación Enviada</Badge>;
      default: return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  // Roles assignable by current user (strictly below their level)
  const assignableRoles = ALL_ROLES.filter(r => {
    if (profile?.role === 'admin') return r !== 'admin';
    return getRoleLevel(r) < myLevel;
  });

  if (isLoading) return (
    <div className="space-y-2">
      <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
    </div>
  );

  if (isError) return <div className="text-red-500">Error: {error?.message}</div>;

  return (
    <div className="space-y-4">
      <div className="relative w-[320px] max-w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, correo o rol"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo Electrónico</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Última Actualización</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.length > 0 ? filteredUsers.map((user) => {
            const isSelf = user.id === session?.user.id;
            const canManageThisUser = !isSelf && (
              profile?.role === 'admin' || getRoleLevel(user.role) < myLevel
            );

            return (
              <TableRow key={user.id}>
                <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {canChangeUserRole() && canManageThisUser ? (
                    <select
                      className="border rounded px-2 py-1 text-sm bg-background"
                      value={user.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        if (profile?.role !== 'admin' && getRoleLevel(newRole) >= myLevel) {
                          showError('No podés asignar un rol igual o superior al tuyo.');
                          return;
                        }
                        updateUserRoleMutation.mutate({ userId: user.id, newRole });
                      }}
                      disabled={updateUserRoleMutation.isPending}
                    >
                      {assignableRoles.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm">{ROLE_LABELS[user.role] || user.role}</span>
                  )}
                </TableCell>
                <TableCell>{getStatusBadge(user.status)}</TableCell>
                <TableCell>{formatDate(user.updated_at)}</TableCell>
                <TableCell className="text-right">
                  {/* Only show actions menu if user has edit/delete permissions and can manage this user */}
                  {(canEditDeleteUsers() || canAddUsers()) && canManageThisUser ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.status === 'invited' && canAddUsers() && (
                          <DropdownMenuItem onClick={() => resendInviteMutation.mutate({ email: user.email!, role: user.role })}>
                            <Send className="mr-2 h-4 w-4" /> Reenviar Invitación
                          </DropdownMenuItem>
                        )}
                        {user.status === 'invited' && canAddUsers() && (
                          <DropdownMenuItem onClick={() => generateInviteLinkMutation.mutate({ email: user.email!, role: user.role })}>
                            <Copy className="mr-2 h-4 w-4" /> Copiar Enlace de Invitación
                          </DropdownMenuItem>
                        )}
                        {canEditDeleteUsers() && (
                          <DropdownMenuItem
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {user.status === 'invited' ? 'Cancelar Invitación' : 'Eliminar Usuario'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center">
                {searchTerm ? 'No se encontraron usuarios.' : 'No hay miembros en esta iglesia.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ChurchUserTable;
