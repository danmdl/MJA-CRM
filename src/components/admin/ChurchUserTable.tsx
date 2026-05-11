import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Copy, Send, Trash2, KeyRound, Eye, EyeOff, UserPen, UserSearch, ChevronDown } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { normalize as norm } from '@/lib/normalize';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Search } from 'lucide-react';
import React from 'react';
import { usePermissions, getRoleLevel, ROLE_LABELS } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'conector' | 'consolidador' | 'supervisor';

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
  numero_cuerda: string | null;
  profile_completed?: boolean;
  last_sign_in_at?: string | null;
}

const fetchChurchUsers = async (accessToken: string, churchId: string): Promise<User[]> => {
  const response = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions-v3', {
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

const ALL_ROLES: UserRole[] = ['conector', 'consolidador', 'encargado_de_celula', 'referente', 'supervisor', 'pastor', 'general', 'admin'];

const ChurchUserTable = ({ churchId }: { churchId: string }) => {
  const { session, profile } = useSession();
  const { canChangeUserRole, canEditDeleteMembers, canAddMembers } = usePermissions();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuerdas, setFilterCuerdas] = useState<Set<string>>(new Set());
  const myLevel = getRoleLevel(profile?.role || '');
  const [resetDialogUser, setResetDialogUser] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [editDialogUser, setEditDialogUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCuerda, setEditCuerda] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: users, isLoading, isError, error } = useQuery<User[]>({
    queryKey: ['churchUsers', churchId],
    queryFn: async () => {
      const edgeUsers = await fetchChurchUsers(session?.access_token || '', churchId);
      // Fetch profile details directly from profiles (edge function may not return them)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, numero_cuerda, profile_completed')
        .eq('church_id', churchId);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      return edgeUsers.map(u => {
        const prof = profileMap.get(u.id);
        return {
          ...u,
          numero_cuerda: u.numero_cuerda ?? prof?.numero_cuerda ?? null,
          profile_completed: prof?.profile_completed ?? false,
        };
      });
    },
    enabled: !!session?.access_token && !!churchId,
  });

  // Load cuerdas dynamically for THIS church (numerical cuerdas + church-cuerda).
  // Previously the dropdown was hardcoded and only had MJA Central cuerdas, so
  // members of other churches couldn't be assigned to their own cuerdas, and
  // nobody could be assigned to the special church-cuerda.
  const { data: cuerdas = [] } = useQuery<{ id: string; numero: string; is_church_cuerda: boolean; zona_nombre: string }[]>({
    queryKey: ['cuerdas-for-edit', churchId],
    queryFn: async () => {
      const { data: zonas } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId);
      if (!zonas?.length) return [];
      const zonasMap = new Map(zonas.map(z => [z.id, z.nombre]));
      const { data: cu } = await supabase.from('cuerdas').select('id, numero, zona_id, is_church_cuerda').in('zona_id', zonas.map(z => z.id)).order('numero');
      return (cu || []).map(c => ({ id: c.id, numero: c.numero, is_church_cuerda: !!c.is_church_cuerda, zona_nombre: zonasMap.get(c.zona_id) || '' }));
    },
    enabled: !!churchId,
    staleTime: 5 * 60_000,
  });

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    // Cuerda visibility gate. Non-global roles (anyone outside admin /
    // general / pastor / supervisor) only ever see members of their own
    // cuerda — a referente of cuerda 202 going to Equipo should see her
    // cuerda's team and nobody else's. This is just a view filter; it
    // doesn't change permissions or what add/edit they can do, so the
    // existing permission system stays untouched as Dan asked.
    //
    // The user themselves is always visible (so a referente without a
    // cuerda set still sees their own row and isn't stuck with an empty
    // list). We do NOT include the church-cuerda anymore — it's
    // considered a separate cuerda, just one whose members happen to
    // see everything. From the referente's point of view it's not "their
    // people", so it shouldn't show up in their team listing.
    const isGlobal = profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
    const myCuerda = profile?.numero_cuerda;
    let visible = users;
    if (!isGlobal) {
      visible = users.filter(u =>
        u.id === profile?.id ||
        (myCuerda && u.numero_cuerda === myCuerda)
      );
    }
    if (filterCuerdas.size > 0) {
      visible = visible.filter(u => u.numero_cuerda != null && filterCuerdas.has(u.numero_cuerda));
    }
    const term = norm(searchTerm);
    if (!term) return visible;
    return visible.filter(u =>
      norm([u.first_name, u.last_name, u.email, u.role, u.numero_cuerda].join(' ')).includes(term)
    );
  }, [users, searchTerm, filterCuerdas, profile?.role, profile?.id, profile?.numero_cuerda]);

  const callEdge = async (body: object) => {
    const response = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions-v3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let msg = 'Error.';
      try { const e = await response.json(); msg = e?.error || msg; }
      catch { try { const t = await response.text(); if (t) msg = t; } catch {} }
      throw new Error(msg);
    }
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

  const updateUserProfileMutation = useMutation({
    mutationFn: async ({ userId, first_name, last_name, phone, numero_cuerda, email, originalEmail }: { userId: string; first_name: string; last_name: string; phone: string; numero_cuerda?: string | null; email?: string; originalEmail?: string }) => {
      // Update name/phone/cuerda via edge function
      await callEdge({ action: 'updateUserProfile', userId, first_name, last_name, phone, numero_cuerda });
      // Also update numero_cuerda directly (in case edge function doesn't support it yet)
      if (numero_cuerda !== undefined) {
        await supabase.from('profiles').update({ numero_cuerda: numero_cuerda || null }).eq('id', userId);
      }
      // Email change is a separate edge call — touches auth.users + profiles.email
      // and validates uniqueness server-side. Only fire if the email actually
      // changed (skip when the field was edited and reverted, or never touched).
      if (email !== undefined && email.trim() && email.trim().toLowerCase() !== (originalEmail || '').toLowerCase()) {
        await callEdge({ action: 'updateUserEmail', userId, email: email.trim() });
      }
    },
    onSuccess: () => { showSuccess('Perfil actualizado.'); queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] }); },
    onError: (err: any) => showError(err.message || 'Error al actualizar perfil.'),
  });

  // Impersonation mutation. Calls admin-impersonate-v1 which generates
  // a one-time magic link for the target user, returns it in
  // { link, target_email, hint }, and writes an audit row in
  // impersonation_logs. The link is copied to clipboard so the admin
  // can paste it into an incognito window — that way their own admin
  // session in the current window stays alive (different storage
  // contexts in incognito vs regular).
  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-impersonate-v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo generar el link.');
      }
      return response.json() as Promise<{ link: string; target_email: string; hint: string }>;
    },
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.link);
        showSuccess(`Link copiado para ${data.target_email}. Pegalo en una ventana de incógnito (Ctrl+Shift+N) para no perder tu sesión.`);
      } catch {
        // Fallback if clipboard isn't writable (older browsers, insecure
        // contexts). Show the link so the admin can copy by hand.
        showError(`No pude copiar al clipboard. Link manual: ${data.link}`);
      }
    },
    onError: (err: any) => showError(err.message || 'Error al generar el link de impersonación.'),
  });

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return d; }
  };

  const getStatusBadge = (user: User) => {
    if (user.profile_completed) return <Badge className="bg-green-500 hover:bg-green-500">Activo</Badge>;
    return <Badge variant="outline" className="bg-red-500/80 hover:bg-red-500/80 text-white">Nunca Ingresó</Badge>;
  };

  // Roles assignable by current user (strictly below their level)
  const assignableRoles = ALL_ROLES.filter(r => {
    if (profile?.role === 'admin') return r !== 'admin';
    return getRoleLevel(r) <= myLevel;
  });

  if (isLoading) return (
    <div className="space-y-2">
      <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
    </div>
  );

  if (isError) return <div className="text-red-500">Error: {error?.message}</div>;

  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-[280px] max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, correo o rol"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5 text-sm font-normal">
              {filterCuerdas.size === 0
                ? 'Todas las cuerdas'
                : filterCuerdas.size === 1
                  ? `Cuerda ${Array.from(filterCuerdas)[0]}`
                  : `${filterCuerdas.size} cuerdas`}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Filtrar por cuerda</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filterCuerdas.size === 0}
              onCheckedChange={() => setFilterCuerdas(new Set())}
              onSelect={(e) => e.preventDefault()}
            >
              Todas las cuerdas
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {cuerdas.filter(c => !c.is_church_cuerda).map(c => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={filterCuerdas.has(c.numero)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => {
                  setFilterCuerdas(prev => {
                    const next = new Set(prev);
                    if (checked) next.add(c.numero);
                    else next.delete(c.numero);
                    return next;
                  });
                }}
              >
                Cuerda {c.numero}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Cuerda</TableHead>
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
              profile?.role === 'admin' || getRoleLevel(user.role) <= myLevel
            );

            return (
              <TableRow key={user.id}>
                <TableCell>{user.first_name || '-'} {user.last_name || ''}</TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{user.numero_cuerda || '—'}</span>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {canChangeUserRole() && canManageThisUser ? (
                    <select
                      className="border rounded px-2 py-1 text-sm bg-background"
                      value={user.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        if (profile?.role !== 'admin' && getRoleLevel(newRole) > myLevel) {
                          showError('No podés asignar un rol superior al tuyo.');
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
                <TableCell>{getStatusBadge(user)}</TableCell>
                <TableCell>{formatDate(user.updated_at)}</TableCell>
                <TableCell className="text-right">
                  {/* Only show actions menu if user has edit/delete permissions and can manage this user */}
                  {(canEditDeleteMembers() || canAddMembers()) && canManageThisUser ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!user.profile_completed && canAddMembers() && (
                          <DropdownMenuItem onClick={() => resendInviteMutation.mutate({ email: user.email!, role: user.role })}>
                            <Send className="mr-2 h-4 w-4" /> Reenviar Invitación
                          </DropdownMenuItem>
                        )}
                        {!user.profile_completed && canAddMembers() && (
                          <DropdownMenuItem onClick={() => generateInviteLinkMutation.mutate({ email: user.email!, role: user.role })}>
                            <Copy className="mr-2 h-4 w-4" /> Copiar Enlace de Invitación
                          </DropdownMenuItem>
                        )}
                        {canEditDeleteMembers() && (
                          <DropdownMenuItem onClick={() => {
                            setEditDialogUser(user);
                            setEditFirstName(user.first_name || '');
                            setEditLastName(user.last_name || '');
                            setEditEmail(user.email || '');
                            setEditPhone('');
                            setEditCuerda(user.numero_cuerda || '');
                          }}>
                            <UserPen className="mr-2 h-4 w-4" /> Editar Usuario
                          </DropdownMenuItem>
                        )}
                        {canEditDeleteMembers() && user.status === 'confirmed' && (
                          <DropdownMenuItem onClick={() => { setResetDialogUser({ id: user.id, email: user.email }); setNewPassword(''); setShowPw(false); }}>
                            <KeyRound className="mr-2 h-4 w-4" /> Cambiar Contraseña
                          </DropdownMenuItem>
                        )}
                        {/* Ver como — generates a magic-link login for the target
                            user and copies it to clipboard. Only admins of the
                            iglesia can use this, and only on non-admin confirmed
                            users (the edge function rejects admin→admin to keep
                            the audit clean and prevent privilege chains).
                            Use case: see the app the way Ana sees it for
                            troubleshooting, without asking Ana for her password. */}
                        {profile?.role === 'admin' && user.status === 'confirmed' && user.role !== 'admin' && user.role !== 'general' && user.id !== profile?.id && (
                          <DropdownMenuItem
                            onClick={() => impersonateMutation.mutate(user.id)}
                            disabled={impersonateMutation.isPending}
                          >
                            <UserSearch className="mr-2 h-4 w-4" /> Ver como este usuario
                          </DropdownMenuItem>
                        )}
                        {canEditDeleteMembers() && (
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

    {/* Edit User Dialog */}
    <Dialog open={!!editDialogUser} onOpenChange={(open) => { if (!open) setTimeout(() => setEditDialogUser(null), 50); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-1">
              <Label>Apellido</Label>
              <Input value={editLastName} onChange={e => setEditLastName(e.target.value)} placeholder="Apellido" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="usuario@dominio.com" />
            {editEmail.trim().toLowerCase() !== (editDialogUser?.email || '').toLowerCase() && (
              <p className="text-[11px] text-amber-400">
                Vas a cambiar el email de inicio de sesión. El usuario se autenticará con el nuevo email.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Teléfono</Label>
            <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Ej: 5491122334455" />
          </div>
          <div className="space-y-1">
            <Label>Número de Cuerda</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={editCuerda}
              onChange={e => setEditCuerda(e.target.value)}
            >
              <option value="">Sin cuerda</option>
              {(() => {
                // Group cuerdas by zona name. Church-cuerda goes first as a separate optgroup.
                const churchCuerdas = cuerdas.filter(c => c.is_church_cuerda);
                const numericalCuerdas = cuerdas.filter(c => !c.is_church_cuerda);
                const byZona = new Map<string, typeof numericalCuerdas>();
                numericalCuerdas.forEach(c => {
                  const arr = byZona.get(c.zona_nombre) || [];
                  arr.push(c);
                  byZona.set(c.zona_nombre, arr);
                });
                return (
                  <>
                    {churchCuerdas.length > 0 && (
                      <optgroup label="🏛️ Iglesia">
                        {churchCuerdas.map(c => (
                          <option key={c.id} value={c.numero}>{c.numero}</option>
                        ))}
                      </optgroup>
                    )}
                    {Array.from(byZona.entries()).map(([zona, list]) => (
                      <optgroup key={zona} label={zona}>
                        {list.map(c => (
                          <option key={c.id} value={c.numero}>{c.numero}</option>
                        ))}
                      </optgroup>
                    ))}
                  </>
                );
              })()}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTimeout(() => setEditDialogUser(null), 50)}>Cancelar</Button>
          <Button
            disabled={savingEdit}
            onClick={async () => {
              if (!editDialogUser) return;
              setSavingEdit(true);
              try {
                await updateUserProfileMutation.mutateAsync({
                  userId: editDialogUser.id,
                  first_name: editFirstName.trim(),
                  last_name: editLastName.trim(),
                  phone: editPhone.trim(),
                  numero_cuerda: editCuerda || null,
                  email: editEmail,
                  originalEmail: editDialogUser.email,
                });
                setTimeout(() => setEditDialogUser(null), 50);
              } finally {
                setSavingEdit(false);
              }
            }}
          >
            {savingEdit ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Change Password Dialog */}
    <Dialog open={!!resetDialogUser} onOpenChange={(open) => { if (!open) setTimeout(() => setResetDialogUser(null), 50); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <p className="text-sm text-muted-foreground">{resetDialogUser?.email}</p>
        </DialogHeader>
        <div className="relative">
          <Input
            type={showPw ? 'text' : 'password'}
            placeholder="Nueva contraseña (mín. 6 caracteres)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTimeout(() => setResetDialogUser(null), 50)}>Cancelar</Button>
          <Button
            disabled={newPassword.length < 6 || resettingPw}
            onClick={async () => {
              if (!resetDialogUser || !session?.access_token) return;
              setResettingPw(true);
              const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions-v3', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ action: 'resetUserPassword', userId: resetDialogUser.id, newPassword }),
              });
              setResettingPw(false);
              if (resp.ok) {
                showSuccess('Contraseña actualizada correctamente.');
                setTimeout(() => setResetDialogUser(null), 50);
              } else {
                const err = await resp.json();
                showError(err.error || 'Error al cambiar la contraseña.');
              }
            }}
          >
            {resettingPw ? 'Guardando...' : 'Guardar contraseña'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};

export default ChurchUserTable;
