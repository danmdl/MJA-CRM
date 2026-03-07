"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { getRoleLevel, ROLE_LABELS } from '@/lib/permissions';

// DB enum values for user_role
type UserRole = 'admin' | 'general' | 'pastor' | 'piloto' | 'encargado_de_celula' | 'user';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId?: string;
}

// All roles in hierarchy order (lowest to highest)
const ALL_ROLES: UserRole[] = ['user', 'encargado_de_celula', 'piloto', 'pastor', 'general', 'admin'];

const InviteUserDialog = ({ open, onOpenChange, churchId }: InviteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const queryClient = useQueryClient();
  const { session, profile } = useSession();

  const myLevel = getRoleLevel(profile?.role || '');

  // Roles available to assign: strictly below current user's level
  // Admin can assign everything except admin itself
  // General can assign pastor, piloto, encargado_de_celula, user
  // Pastor can assign piloto, encargado_de_celula, user
  const assignableRoles = ALL_ROLES.filter(r => {
    if (profile?.role === 'admin') return r !== 'admin'; // admin can assign all except admin
    return getRoleLevel(r) < myLevel; // others can only assign roles below themselves
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { showError('Por favor, introduce un correo electrónico'); return; }
    setLoading(true);
    try {
      if (!session?.access_token) { showError('No hay sesión activa.'); setLoading(false); return; }

      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'resendInvite', email, role, churchId, first_name: firstName, last_name: lastName, phone }),
      });
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Error al enviar invitación.');
      } else {
        showSuccess('¡Invitación enviada con éxito!');
        setEmail(''); setRole('user'); setFirstName(''); setLastName(''); setPhone('');
        queryClient.invalidateQueries({ queryKey: ['users'] });
        if (churchId) queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
        onOpenChange(false);
      }
    } catch (error: any) {
      showError(error.message || 'Error al enviar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invitar a un nuevo miembro</DialogTitle>
          <DialogDescription>
            Introduce el correo electrónico y asigna un rol. El usuario recibirá una invitación para unirse.
            {churchId && <p className="text-sm text-muted-foreground mt-1">Se asignará a la iglesia actual.</p>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Correo Electrónico</label>
            <Input type="email" placeholder="nombre@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div>
            <label className="text-sm font-medium">Rol</label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>
                    {ROLE_LABELS[roleOption] || roleOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" disabled={loading} />
            </div>
            <div>
              <label className="text-sm font-medium">Apellido</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido" disabled={loading} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Teléfono</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5491122334455" disabled={loading} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar Invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;
