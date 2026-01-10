import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Copy, Send, Trash2, Key, Search } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { logger } from '@/utils/logger';
import React from 'react';

// Definir el tipo de rol de usuario para TypeScript
type UserRole = 'admin' | 'general' | 'pastor' | 'piloto' | 'encargado_de_celula' | 'user';

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

const passwordResetSchema = z.object({
  newPassword: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

const fetchChurchUsers = async (accessToken: string, churchId: string): Promise<User[]> => {
  console.log(`[DEBUG CLIENT] fetchChurchUsers called with churchId: ${churchId} and accessToken present: ${!!accessToken}`);

  const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'listChurchUsers', churchId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error fetching church users from Edge Function:', errorData);
    throw new Error(errorData.error || 'No se pudieron cargar los usuarios de la iglesia.');
  }

  const data = await response.json();
  console.log(`[DEBUG CLIENT] Users received from Edge Function for Church ID ${churchId}:`, data);
  return data || [];
};

const ChurchUserTable = ({ churchId }: { churchId: string }) => {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: users, isLoading, isError, error } = useQuery<User[]>({
    queryKey: ['churchUsers', churchId],
    queryFn: () => fetchChurchUsers(session?.access_token || '', churchId),
    enabled: !!session?.access_token && !!churchId,
  });

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return users;
    
    return users.filter(user => {
      const searchableText = [
        user.first_name || '',
        user.last_name || '',
        user.email || '',
        user.role
      ].join(' ').toLowerCase();
      return searchableText.includes(term);
    });
  }, [users, searchTerm]);

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'deleteUser', userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al eliminar el usuario.');
      }

      return response.json();
    },
    onSuccess: () => {
      showSuccess('Usuario eliminado con éxito.');
      queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
    },
    onError: (err) => {
      showError(err.message);
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: UserRole }) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'resendInvite', email, role, churchId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al reenviar la invitación.');
      }

      return response.json();
    },
    onSuccess: () => {
      showSuccess('Invitación reenviada con éxito.');
      queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
    },
    onError: (err) => {
      showError(err.message);
    },
  });

  const generateInviteLinkMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: UserRole }) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'generateInviteLink', email, role, churchId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el enlace de invitación.');
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink);
        showSuccess('Enlace de invitación copiado al portapapeles.');
      }
    },
    onError: (err) => {
      showError(err.message);
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: UserRole }) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'updateUserRole', userId, newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar el rol del usuario.');
      }

      return response.json();
    },
    onSuccess: () => {
      showSuccess('Rol de usuario actualizado con éxito.');
      queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
    },
    onError: (err) => {
      showError(err.message);
    },
  });

  const updateUserRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: UserRole[] }) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'updateUserRoles', userId, roles }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar los roles del usuario.');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Roles actualizados con éxito.');
      queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
    },
    onError: (err) => {
      showError((err as any).message);
    },
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return dateString;
    }
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
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los usuarios de la iglesia.'}</div>;
  }

  const getStatusBadge = (status: User['status']) => {
    switch (status) {
      case 'confirmed':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-500">Confirmado</Badge>;
      case 'invited':
        return <Badge variant="outline" className="bg-yellow-500 hover:bg-yellow-500 text-white">Invitación Enviada</Badge>;
      case 'unknown':
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  // Roles que pueden ser asignados a usuarios de iglesia
  const assignableRoles: UserRole[] = ['user', 'encargado_de_celula', 'piloto', 'pastor'];

  return (
    <div className="space-y-4">
      {/* Search bar */}
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
          {filteredUsers && filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {assignableRoles.map(roleOption => {
                      const rolesArr = (user as any).roles || [user.role];
                      const checked = rolesArr.includes(roleOption);
                      return (
                        <label key={roleOption} className="flex items-center gap-1 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(val) => {
                              const next = new Set(rolesArr);
                              if (val) next.add(roleOption); else next.delete(roleOption);
                              updateUserRolesMutation.mutate({ userId: user.id, roles: Array.from(next) as UserRole[] });
                            }}
                            disabled={user.id === session?.user.id}
                          />
                          <span>{roleOption === 'piloto' ? 'Referente' : roleOption.charAt(0).toUpperCase() + roleOption.slice(1).replace(/_/g,' ')}</span>
                        </label>
                      )
                    })}
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(user.status)}</TableCell>
                <TableCell>{formatDate(user.updated_at)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menú</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {user.status === 'invited' && (
                        <DropdownMenuItem 
                          onClick={() => resendInviteMutation.mutate({ email: user.email!, role: user.role })}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Reenviar Invitación
                        </DropdownMenuItem>
                      )}
                      {user.status === 'invited' && (
                        <DropdownMenuItem 
                          onClick={() => generateInviteLinkMutation.mutate({ email: user.email!, role: user.role })}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar Enlace de Invitación
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => deleteUserMutation.mutate(user.id)} 
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {user.status === 'invited' ? 'Cancelar Invitación' : 'Eliminar Usuario'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center">
                {searchTerm ? 'No se encontraron usuarios que coincidan con la búsqueda.' : 'No se encontraron usuarios para esta iglesia.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ChurchUserTable;