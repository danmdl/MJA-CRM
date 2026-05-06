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
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'conector' | 'consolidador' | 'supervisor' | 'anfitrion';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId?: string;
}

// All roles in hierarchy order (lowest to highest)
const ALL_ROLES: UserRole[] = ['conector', 'consolidador', 'encargado_de_celula', 'referente', 'supervisor', 'pastor', 'general', 'admin'];

const InviteUserDialog = ({ open, onOpenChange, churchId }: InviteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('conector');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [numeroCuerda, setNumeroCuerda] = useState('');
  const [sinCuerda, setSinCuerda] = useState(false);
  const queryClient = useQueryClient();
  const { session, profile } = useSession();

  const myLevel = getRoleLevel(profile?.role || '');

  // Roles available to assign: same level or below current user's level.
  // A referente can invite another referente, but not a supervisor.
  // Admin can assign everything except admin itself.
  const assignableRoles = ALL_ROLES.filter(r => {
    if (profile?.role === 'admin') return r !== 'admin';
    return getRoleLevel(r) <= myLevel;
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { showError('Por favor, introduce un correo electrónico'); return; }
    if (!sinCuerda && !numeroCuerda.trim()) {
      showError('Ingresá un número de cuerda o tildá "Sin cuerda".');
      return;
    }
    setLoading(true);
    try {
      if (!session?.access_token) { showError('No hay sesión activa.'); setLoading(false); return; }

      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/invite-user-v2`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, role, churchId, first_name: firstName, last_name: lastName, phone, numero_cuerda: sinCuerda ? null : numeroCuerda.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Error al enviar invitación.');
      } else {
        showSuccess('¡Invitación enviada con éxito!');
        setEmail(''); setRole('conector'); setFirstName(''); setLastName(''); setPhone(''); setNumeroCuerda(''); setSinCuerda(false);
        queryClient.invalidateQueries({ queryKey: ['users'] });
        if (churchId) queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
        setTimeout(() => onOpenChange(false), 50);
      }
    } catch (error: any) {
      showError(error.message || 'Error al enviar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setTimeout(() => onOpenChange(false), 50); else onOpenChange(true); }}>
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
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assignableRoles.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {ROLE_LABELS[roleOption] || roleOption}
                </option>
              ))}
            </select>
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">
                Número de Cuerda {!sinCuerda && <span className="text-red-500">*</span>}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sinCuerda}
                  onChange={(e) => { setSinCuerda(e.target.checked); if (e.target.checked) setNumeroCuerda(''); }}
                  disabled={loading}
                  className="rounded border-input"
                />
                Sin cuerda
              </label>
            </div>
            <Input
              value={numeroCuerda}
              onChange={(e) => setNumeroCuerda(e.target.value)}
              placeholder="Ej: 202"
              disabled={loading || sinCuerda}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setTimeout(() => onOpenChange(false), 50)} disabled={loading}>Cancelar</Button>
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
