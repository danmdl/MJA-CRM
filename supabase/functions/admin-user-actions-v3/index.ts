// @ts-nocheck
// Source of the deployed `admin-user-actions-v3` edge function (version 3),
// which is what ChurchUserTable (Equipo) calls. Pulled from the project so
// the repo matches production; `admin-user-actions` is the older version.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLE_HIERARCHY = ['conector', 'consolidador', 'encargado_de_celula', 'referente', 'supervisor', 'pastor', 'general', 'admin'];
const getRoleLevel = (role: string): number => {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? 0 : idx;
};

const json = (body: any, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) return json({ error: 'Unauthorized' }, 401);
    const { data: profile } = await supabaseAdmin.from('profiles').select('role, church_id').eq('id', userAuth.user.id).single();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const callerRole = profile.role;
    const callerChurchId = profile.church_id;
    const callerLevel = getRoleLevel(callerRole);
    const isAdminOrGeneral = callerRole === 'admin' || callerRole === 'general';

    const { data: callerPerms } = await supabaseAdmin.from('permissions').select('*').eq('role', callerRole).single();
    const hasPerm = (key: string): boolean => !!(callerPerms && callerPerms[key]);

    const { action, email, role, churchId, userId, newRole, roles, newPassword, first_name, last_name, phone, numero_cuerda } = await req.json();
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://www.mjatu.casa';

    const canManageTarget = async (targetUserId: string): Promise<{ ok: boolean; targetRole?: string }> => {
      if (callerRole === 'admin') {
        const { data: t } = await supabaseAdmin.from('profiles').select('role').eq('id', targetUserId).single();
        return { ok: true, targetRole: t?.role };
      }
      const { data: target } = await supabaseAdmin.from('profiles').select('role, church_id').eq('id', targetUserId).single();
      if (!target) return { ok: false };
      if (!isAdminOrGeneral && target.church_id !== callerChurchId) return { ok: false };
      if (callerLevel < getRoleLevel(target.role)) return { ok: false };
      return { ok: true, targetRole: target.role };
    };

    switch (action) {
      case 'resendInvite':
      case 'generateInviteLink': {
        if (!email) return json({ error: 'Email is required' }, 400);
        if (!hasPerm('add_users')) return json({ error: 'No tenés permisos para invitar usuarios.' }, 403);
        if (churchId && !isAdminOrGeneral && callerChurchId !== churchId) return json({ error: 'Solo podés invitar a tu iglesia.' }, 403);
        if (!isAdminOrGeneral && (role === 'admin' || role === 'general')) return json({ error: 'No podés asignar ese rol.' }, 403);
        if (callerRole !== 'admin' && getRoleLevel(role) > callerLevel) return json({ error: 'No podés asignar un rol superior al tuyo.' }, 403);
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/setup-account`,
          data: { role: role || 'conector', church_id: churchId || null, first_name: first_name || null, last_name: last_name || null, phone: phone || null, numero_cuerda: numero_cuerda || null }
        });
        if (error) return json({ error: error.message }, 500);
        if (action === 'generateInviteLink') {
          const inviteLink = `${siteUrl}/setup-account?access_token=${data.user?.confirmation_token}&refresh_token=${data.user?.confirmation_token}&type=signup`;
          return json({ message: 'Invitation link generated', inviteLink }, 200);
        }
        return json({ message: 'Invitation sent', user: data.user }, 200);
      }
      case 'updateUserRole':
      case 'updateUserRoles': {
        if (!hasPerm('change_user_role')) return json({ error: 'No tenés permisos para cambiar roles.' }, 403);
        const { ok } = await canManageTarget(userId);
        if (!ok) return json({ error: 'No podés modificar este usuario (rol superior o de otra iglesia).' }, 403);
        const targetRole = action === 'updateUserRole' ? newRole : (Array.isArray(roles) ? roles[0] : newRole);
        if (!targetRole) return json({ error: 'newRole requerido.' }, 400);
        if (callerRole !== 'admin' && getRoleLevel(targetRole) > callerLevel) {
          return json({ error: 'No podés asignar un rol superior al tuyo.' }, 403);
        }
        const { error } = await supabaseAdmin.from('profiles').update({ role: targetRole }).eq('id', userId);
        if (error) return json({ error: error.message }, 500);
        return json({ message: 'Role updated', success: true }, 200);
      }
      case 'deleteUser': {
        if (!hasPerm('edit_delete_users')) return json({ error: 'No tenés permisos para eliminar usuarios.' }, 403);
        const { ok } = await canManageTarget(userId);
        if (!ok) return json({ error: 'No podés eliminar este usuario.' }, 403);
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) return json({ error: error.message }, 500);
        return json({ message: 'Deleted' }, 200);
      }
      case 'resetUserPassword': {
        if (!hasPerm('edit_delete_users')) return json({ error: 'No tenés permisos.' }, 403);
        const { ok } = await canManageTarget(userId);
        if (!ok) return json({ error: 'No podés modificar este usuario.' }, 403);
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
        if (error) return json({ error: error.message }, 500);
        return json({ message: 'Password reset' }, 200);
      }
      case 'updateUserProfile': {
        if (!hasPerm('edit_delete_users')) return json({ error: 'No tenés permisos.' }, 403);
        const { ok } = await canManageTarget(userId);
        if (!ok) return json({ error: 'No podés modificar este usuario.' }, 403);
        const updateData: Record<string, any> = {};
        if (first_name !== undefined) updateData.first_name = first_name || null;
        if (last_name !== undefined) updateData.last_name = last_name || null;
        if (phone !== undefined) updateData.phone = phone || null;
        if (numero_cuerda !== undefined) updateData.numero_cuerda = numero_cuerda || null;
        const { error } = await supabaseAdmin.from('profiles').update(updateData).eq('id', userId);
        if (error) return json({ error: error.message }, 500);
        return json({ message: 'Profile updated' }, 200);
      }
      case 'updateUserEmail': {
        // Change a user's login email. Updates auth.users and mirrors the new
        // address into profiles.email so the table listing keeps reflecting it.
        // Same gating as the rest of the profile mutations.
        if (!hasPerm('edit_delete_users')) return json({ error: 'No tenés permisos.' }, 403);
        if (!userId) return json({ error: 'userId requerido.' }, 400);
        const newEmail = (email || '').trim();
        if (!newEmail) return json({ error: 'Email requerido.' }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return json({ error: 'Email inválido.' }, 400);
        const { ok } = await canManageTarget(userId);
        if (!ok) return json({ error: 'No podés modificar este usuario.' }, 403);
        // Reject if another profile already has this email. Auth would reject
        // too but with an opaque error — this gives a clearer message.
        const { data: existing } = await supabaseAdmin.from('profiles').select('id').ilike('email', newEmail).neq('id', userId).maybeSingle();
        if (existing) return json({ error: 'Ese email ya está usado por otro usuario.' }, 409);
        // email_confirm: true skips the verification email — the admin doing
        // the change owns the decision; the user can't click a link they
        // never receive (the inbox they had access to may be the OLD one).
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
        if (authErr) return json({ error: authErr.message }, 500);
        const { error: profErr } = await supabaseAdmin.from('profiles').update({ email: newEmail }).eq('id', userId);
        if (profErr) return json({ error: profErr.message }, 500);
        return json({ message: 'Email updated' }, 200);
      }
      case 'listUsers': {
        if (!isAdminOrGeneral) return json({ error: 'Forbidden' }, 403);
        const { data, error } = await supabaseAdmin.rpc('get_all_users');
        if (error) return json({ error: error.message }, 500);
        return json(data, 200);
      }
      case 'listChurchUsers': {
        if (!churchId) return json({ error: 'Church ID required' }, 400);
        if (!isAdminOrGeneral && callerChurchId !== churchId) return json({ error: 'Forbidden' }, 403);
        const { data, error } = await supabaseAdmin.from('profiles').select('id, email, first_name, last_name, role, updated_at, church_id, numero_cuerda, profile_completed').eq('church_id', churchId);
        if (error) return json({ error: error.message }, 500);
        return json(data.map((p: any) => ({ ...p, status: 'confirmed', invited_at: p.updated_at, confirmed_at: p.updated_at })), 200);
      }
      default:
        return json({ error: 'Invalid action' }, 400);
    }
  } catch (error: any) {
    return json({ error: error.message || 'Server error' }, 500);
  }
});
