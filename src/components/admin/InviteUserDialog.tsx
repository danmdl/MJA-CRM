"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

  // Pre-fill cuerda with the caller's own cuerda when the dialog opens —
  // useful both for below-supervisor users (who can ONLY invite there)
  // and as a sensible default for supervisor+ inviters in their cuerda.
  useEffect(() => {
    if (open && profile?.numero_cuerda && !numeroCuerda) {
      setNumeroCuerda(profile.numero_cuerda);
    }
    if (!open) {
      // Reset on close so reopening with a different church/role doesn't
      // hold a stale value (e.g. admin reopens after switching churches).
      setNumeroCuerda(profile?.numero_cuerda || '');
      setSinCuerda(false);
    }
  // We deliberately don't depend on numeroCuerda — that would re-set on
  // every keystroke. Run only on open/profile change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.numero_cuerda]);

  const myLevel = getRoleLevel(profile?.role || '');

  // Cuerdas list for the dropdown. Joined to zonas to filter by churchId.
  // Church-cuerdas (the special is_church_cuerda=true row per iglesia)
  // are only offered to admins — assigning a regular user to the
  // church-cuerda would put them in the same authority bucket as the
  // people who distribute contacts, which only admin should be able
  // to grant.
  const { data: cuerdas } = useQuery<Array<{ numero: string; is_church_cuerda: boolean; zona_nombre: string | null }>>({
    queryKey: ['invite-cuerdas', churchId],
    queryFn: async () => {
      if (!churchId) return [];
      const { data: zonas } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId);
      if (!zonas?.length) return [];
      const zonaIdToNombre = new Map(zonas.map((z: any) => [z.id, z.nombre]));
      const { data: rows } = await supabase
        .from('cuerdas')
        .select('numero, is_church_cuerda, zona_id')
        .in('zona_id', zonas.map((z: any) => z.id))
        .order('numero');
      return (rows || []).map((c: any) => ({
        numero: c.numero,
        is_church_cuerda: !!c.is_church_cuerda,
        zona_nombre: zonaIdToNombre.get(c.zona_id) || null,
      }));
    },
    enabled: !!churchId && open,
    staleTime: 60_000,
  });

  // Filter rules for the cuerda dropdown:
  //   1. Church-cuerdas (is_church_cuerda=true) only show for admins.
  //      Anyone else assigning to the church-cuerda would silently
  //      expand the authority bucket that distributes contacts.
  //   2. Below supervisor (referente, encargado, consolidador, conector,
  //      anfitrion) can only invite to their OWN cuerda. Cross-cuerda
  //      invites aren't a feature for them — same logic as the contact
  //      cross-cuerda restriction. Supervisor and above (pastor,
  //      general, admin) can invite to any cuerda.
  const SUPERVISOR_AND_ABOVE: UserRole[] = ['supervisor', 'pastor', 'general', 'admin'];
  const callerCanInviteAnyCuerda = SUPERVISOR_AND_ABOVE.includes(profile?.role as UserRole);
  const callerCuerdaNumero = profile?.numero_cuerda || null;
  const cuerdaOptions = (cuerdas || []).filter(c => {
    if (c.is_church_cuerda && profile?.role !== 'admin') return false;
    if (!callerCanInviteAnyCuerda) {
      return callerCuerdaNumero != null && c.numero === callerCuerdaNumero;
    }
    return true;
  });

  // For below-supervisor users, lock the form to their cuerda. The
  // 'Sin cuerda' checkbox is also hidden for them, since they're only
  // ever inviting people INTO their cuerda.
  const cuerdaIsLocked = !callerCanInviteAnyCuerda;

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
              {/* 'Sin cuerda' is only meaningful for supervisor+ inviters.
                  Below-supervisor users are locked to their own cuerda. */}
              {!cuerdaIsLocked && (
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
              )}
            </div>
            <Select
              value={numeroCuerda || undefined}
              onValueChange={(v) => setNumeroCuerda(v)}
              disabled={loading || sinCuerda || cuerdaIsLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder={cuerdaOptions.length === 0 ? 'No hay cuerdas configuradas' : 'Seleccionar cuerda...'} />
              </SelectTrigger>
              <SelectContent>
                {cuerdaOptions.map(c => (
                  <SelectItem key={c.numero} value={c.numero}>
                    <span className="flex items-center gap-1.5">
                      {c.is_church_cuerda
                        ? <span>🏛️ {c.numero}</span>
                        : <span>Cuerda {c.numero}</span>}
                      {c.zona_nombre && !c.is_church_cuerda && (
                        <span className="text-xs text-muted-foreground">({c.zona_nombre})</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cuerdaIsLocked && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Solo podés invitar a tu propia cuerda.
              </p>
            )}
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
