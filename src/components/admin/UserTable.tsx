import React from 'react'; // Added missing React import
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Copy, Send, Trash2, Key } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { usePermissions } from '@/lib/permissions';

// Definir el tipo de rol de usuario para TypeScript
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

const passwordResetSchema = z.object({
  newPassword: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

const fetchUsers = async (accessToken: string): Promise<User[]> => {
  const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'listUsers' }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error fetching users from Edge Function:', errorData);
    throw new Error(errorData.error || 'No se pudieron cargar los usuarios.');
  }

  const data = await response.json();
  return data || [];
};

const UserTable = () => {
  const { session, profile } = useSession();
  const { canChangeUserRole } = usePermissions();
  const queryClient = useQueryClient();
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);

  const form = useForm<z.infer<typeof passwordResetSchema>>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const { data: users, isLoading, isError, error } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchUsers(session?.access_token || ''),
    enabled: !!session?.access_token && (profile?.role === 'admin' || profile?.role === 'general'),
  });

  // Fetch church names
  const { data: churches } = useQuery({
    queryKey: ['churches'],
    queryFn: async () => {
      const { data, error } = await (await import('@/integrations/supabase/client')).supabase
        .from('churches')
        .select('id, name');
      if (error) return [];
      return data || [];
    },
    enabled: !!session?.access_token,
  });

  const churchMap = React.useMemo(() => { // Fixed by adding React prefix
    const map: Record<string, string> = {};
    churches?.forEach(church => {
      map[church.id] = church.name;
    });
    return map;
  }, [churches]);

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
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const errorMessage = (err as any).message || 'Error desconocido.';
      if (errorMessage.includes('Forbidden')) {
        showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
      } else {
        showError(errorMessage);
      }
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async ({ email, role, churchId }: { email: string; role: UserRole; churchId: string | null }) => {
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
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const errorMessage = (err as any).message || 'Error desconocido.';
      if (errorMessage.includes('Forbidden')) {
        showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
      } else {
        showError(errorMessage);
      }
    },
  });

  const generateInviteLinkMutation = useMutation({
    mutationFn: async ({ email, role, churchId }: { email: string; role: UserRole; churchId: string | null }) => {
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
      const errorMessage = (err as any).message || 'Error desconocido.';
      if (errorMessage.includes('Forbidden')) {
        showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
      } else {
        showError(errorMessage);
      }
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
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const errorMessage = (err as any).message || 'Error desconocido.';
      if (errorMessage.includes('Forbidden')) {
        showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
      } else {
        showError(errorMessage);
      }
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'resetUserPassword', userId, newPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cambiar la contraseña.');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Contraseña actualizada con éxito.');
      setIsPasswordResetDialogOpen(false);
      setUserToResetPassword(null);
      form.reset();
    },
    onError: (err) => {
      const errorMessage = (err as any).message || 'Error desconocido.';
      if (errorMessage.includes('Forbidden')) {
        showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
      } else {
        showError(errorMessage);
      }
    },
  });

  const handleOpenPasswordResetDialog = (user: User) => {
    setUserToResetPassword(user);
    setIsPasswordResetDialogOpen(true);
    form.reset();
  };

  const onSubmitPasswordReset = async (values: z.infer<typeof passwordResetSchema>) => {
    if (!userToResetPassword) return;
    resetPasswordMutation.mutate({ userId: userToResetPassword.id, newPassword: values.newPassword });
  };

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
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los usuarios.'}</div>;
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

  // Todos los roles disponibles
  const userRoles: UserRole[] = ['user', 'encargado_de_celula', 'referente', 'pastor', 'general', 'admin'];

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo Electrónico</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Iglesia Asignada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Última Actualización</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users && users.length > 0 ? (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
                <TableCell>
                  {user.email}
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    onValueChange={(newRole: UserRole) => updateUserRoleMutation.mutate({ userId: user.id, newRole })}
                    disabled={updateUserRoleMutation.isPending || user.id === session?.user.id || !canChangeUserRole()}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {userRoles.map((roleOption) => (
                        <SelectItem
                          key={roleOption}
                          value={roleOption}
                          disabled={profile?.role !== 'admin' && (roleOption === 'admin' || roleOption === 'general')}
                        >
                          {roleOption === 'referente' ? 'Referente' : roleOption.charAt(0).toUpperCase() + roleOption.slice(1).replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{user.church_id ? churchMap[user.church_id] || '-' : '-'}</TableCell>
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
                          onClick={() => resendInviteMutation.mutate({ email: user.email!, role: user.role, churchId: user.church_id })}
                          disabled={!canChangeUserRole()}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Reenviar Invitación
                        </DropdownMenuItem>
                      )}
                      {user.status === 'invited' && (
                        <DropdownMenuItem
                          onClick={() => generateInviteLinkMutation.mutate({ email: user.email!, role: user.role, churchId: user.church_id })}
                          disabled={!canChangeUserRole()}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar Enlace de Invitación
                        </DropdownMenuItem>
                      )}
                      {profile?.role === 'admin' && (
                        <DropdownMenuItem onClick={() => handleOpenPasswordResetDialog(user)}>
                          <Key className="mr-2 h-4 w-4" />
                          Cambiar Contraseña
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => deleteUserMutation.mutate(user.id)}
                        className="text-red-600"
                        disabled={user.id === session?.user.id}
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
              <TableCell colSpan={7} className="text-center">
                No se encontraron usuarios.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Password Reset Dialog */}
      <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña para {userToResetPassword?.email}</DialogTitle>
            <DialogDescription>
              Introduce una nueva contraseña para este usuario.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitPasswordReset)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="newPassword">Nueva Contraseña</FormLabel>
                    <FormControl>
                      <Input id="newPassword" type="password" {...field} disabled={resetPasswordMutation.isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="confirmPassword">Confirmar Nueva Contraseña</FormLabel>
                    <FormControl>
                      <Input id="confirmPassword" type="password" {...field} disabled={resetPasswordMutation.isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsPasswordResetDialogOpen(false)}
                  disabled={resetPasswordMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? 'Cambiando...' : 'Cambiar Contraseña'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserTable;