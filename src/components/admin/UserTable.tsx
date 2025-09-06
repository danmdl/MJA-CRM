import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Copy, Send, Trash2 } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';

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
}

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
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: users, isLoading, isError, error } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchUsers(session?.access_token || ''),
    enabled: !!session?.access_token,
  });

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
        body: JSON.stringify({ action: 'resendInvite', email, role }),
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
        body: JSON.stringify({ action: 'generateInviteLink', email, role }),
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

  const getBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'general':
        return 'default';
      case 'pastor':
        return 'secondary';
      case 'piloto':
        return 'outline';
      case 'encargado_de_celula':
        return 'default';
      case 'user':
      default:
        return 'secondary';
    }
  };

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

  return (
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
        {users && users.length > 0 ? (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={getBadgeVariant(user.role)}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>{getStatusBadge(user.status)}</TableCell>
              <TableCell>
                {user.updated_at ? format(new Date(user.updated_at), "d 'de' MMMM, yyyy", { locale: es }) : '-'}
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
                    {user.status === 'invited' && (
                      <DropdownMenuItem onClick={() => resendInviteMutation.mutate({ email: user.email!, role: user.role })}>
                        <Send className="mr-2 h-4 w-4" /> Reenviar Invitación
                      </DropdownMenuItem>
                    )}
                    {user.status === 'invited' && (
                      <DropdownMenuItem onClick={() => generateInviteLinkMutation.mutate({ email: user.email!, role: user.role })}>
                        <Copy className="mr-2 h-4 w-4" /> Copiar Enlace de Invitación
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => deleteUserMutation.mutate(user.id)} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" /> {user.status === 'invited' ? 'Cancelar Invitación' : 'Eliminar Usuario'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="text-center">
              No se encontraron usuarios.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default UserTable;