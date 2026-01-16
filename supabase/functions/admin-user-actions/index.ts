import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized: Missing Authorization header', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) {
      console.error('[admin-user-actions] Auth error:', userAuthError);
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, church_id')
      .eq('id', userAuth.user.id)
      .single();

    if (profileError || !profile) {
      console.error('[admin-user-actions] Profile error:', profileError);
      return new Response('Forbidden: User profile not found or accessible', { status: 403, headers: corsHeaders });
    }

    const callerRole = profile.role;
    const callerChurchId = profile.church_id;
    const isAdminOrGeneral = callerRole === 'admin' || callerRole === 'general';

    const { action, email, role, churchId, userId, newRole, roles, newPassword } = await req.json();
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://mja-one.vercel.app';
    console.log('[admin-user-actions] Edge Function using SITE_URL:', siteUrl);

    switch (action) {
      case 'resendInvite':
      case 'generateInviteLink': {
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Authorization check for invite
        if (churchId && !isAdminOrGeneral && callerChurchId !== churchId) {
          return new Response('Forbidden: You can only invite users to your assigned church.', { status: 403, headers: corsHeaders });
        }
        if (!churchId && !isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can invite users globally.', { status: 403, headers: corsHeaders });
        }
        if (!isAdminOrGeneral && (role === 'admin' || role === 'general')) {
          return new Response('Forbidden: Only administrators can assign admin or general roles.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/login`,
          data: { role: role || 'user', church_id: churchId || null }
        });

        if (error) {
          console.error('[admin-user-actions] Error inviting user:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (action === 'generateInviteLink') {
          const inviteLink = `${siteUrl}/login?access_token=${data.user?.confirmation_token}&refresh_token=${data.user?.confirmation_token}&type=signup`;
          return new Response(JSON.stringify({ message: 'Invitation link generated successfully', inviteLink }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'Invitation sent successfully', user: data.user }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'updateUserRole': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can update user roles.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ role: newRole })
          .eq('id', userId);

        if (error) {
          console.error('[admin-user-actions] Error updating user role:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'User role updated successfully' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'updateUserRoles': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can update user roles.', { status: 403, headers: corsHeaders });
        }

        // For now, just update the primary role
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ role: roles[0] })
          .eq('id', userId);

        if (error) {
          console.error('[admin-user-actions] Error updating user roles:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'deleteUser': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can delete users.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (error) {
          console.error('[admin-user-actions] Error deleting user:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'User deleted successfully' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resetUserPassword': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can reset passwords.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

        if (error) {
          console.error('[admin-user-actions] Error resetting password:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'Password reset successfully' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listUsers': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can list all users.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin.rpc('get_all_users');

        if (error) {
          console.error('[admin-user-actions] Error listing users:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listChurchUsers': {
        if (!churchId) {
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          return new Response('Forbidden: You can only view users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select(`
            id,
            email,
            first_name,
            last_name,
            role,
            updated_at,
            church_id,
            created_at
          `)
          .eq('church_id', churchId);

        if (error) {
          console.error('[admin-user-actions] Error listing church users:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const formattedData = data.map((profile: any) => ({
          ...profile,
          status: 'confirmed', // All profiles are confirmed
          invited_at: profile.created_at,
          confirmed_at: profile.updated_at
        }));

        return new Response(JSON.stringify(formattedData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('[admin-user-actions] Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});