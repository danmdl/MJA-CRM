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
    const requestBody = await req.json(); 
    const { action, email, userId, role, newRole, churchId, newPassword, password, first_name, last_name, phone } = requestBody;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized: Missing Authorization header', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      // @ts-ignore - Deno global available in Edge Functions
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore - Deno global available in Edge Functions
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) {
      console.error('Auth error:', userAuthError);
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, church_id')
      .eq('id', userAuth.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile error:', profileError);
      return new Response('Forbidden: User profile not found or accessible', { status: 403, headers: corsHeaders });
    }

    const callerRole = profile.role;
    const callerChurchId = profile.church_id;
    const isAdminOrGeneral = callerRole === 'admin' || callerRole === 'general';
    const isAdmin = callerRole === 'admin';

    // Fetch permissions for the caller
    const { data: callerPermissions, error: permissionsError } = await supabaseAdmin
      .from('permissions')
      .select('change_user_role')
      .eq('role', callerRole)
      .single();

    const canCallerChangeUserRole = isAdmin || callerPermissions?.change_user_role;
    
    const siteUrl = 'https://church-crm-lime.vercel.app';

    switch (action) {
      case 'resendInvite':
      case 'generateInviteLink': {
        if (!canCallerChangeUserRole) {
          return new Response('Forbidden: You do not have permission to invite users with assigned roles.', { status: 403, headers: corsHeaders });
        }
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (churchId && !isAdminOrGeneral && callerChurchId !== churchId) {
          return new Response('Forbidden: You can only invite users to your assigned church.', { status: 403, headers: corsHeaders });
        }
        if (!churchId && !isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can invite users globally.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/login`,
          data: { role: role || 'user', church_id: churchId || null, first_name, last_name, phone }
        });
        if (error) {
          console.error(`Error ${action} user:`, error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const responseBody = action === 'generateInviteLink' ? { inviteLink: data.user?.confirmation_url } : { message: 'Invitation sent successfully', user: data.user };
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'updateUserRole': {
        if (!canCallerChangeUserRole) {
          return new Response('Forbidden: You do not have permission to update user roles.', { status: 403, headers: corsHeaders });
        }
        if (!userId || !newRole) {
          return new Response(JSON.stringify({ error: 'User ID and new role are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const validRoles = ['admin', 'general', 'pastor', 'referente', 'encargado_de_celula', 'user'];
        if (!validRoles.includes(newRole)) {
          return new Response(JSON.stringify({ error: 'Invalid role provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
          .from('profiles')
          .select('church_id')
          .eq('id', userId)
          .single();

        if (targetProfileError || !targetProfile) {
          console.error('Error fetching target user profile:', targetProfileError);
          return new Response('Error: Target user profile not found.', { status: 404, headers: corsHeaders });
        }

        if (!isAdminOrGeneral && targetProfile.church_id !== callerChurchId) {
          return new Response('Forbidden: You can only update roles for users from your assigned church.', { status: 403, headers: corsHeaders });
        }
        if (!isAdmin && (newRole === 'admin' || newRole === 'general')) {
          return new Response('Forbidden: Only administrators can assign admin or general roles.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (error) {
          console.error('Error updating user role:', error);
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
        if (!canCallerChangeUserRole) {
          return new Response('Forbidden: You do not have permission to update user roles.', { status: 403, headers: corsHeaders });
        }
        if (!userId || !Array.isArray(requestBody.roles)) {
          return new Response(JSON.stringify({ error: 'User ID and roles[] are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
          .from('profiles')
          .select('church_id')
          .eq('id', userId)
          .single();

        if (targetProfileError || !targetProfile) {
          console.error('Error fetching target user profile:', targetProfileError);
          return new Response('Error: Target user profile not found.', { status: 404, headers: corsHeaders });
        }

        if (!isAdminOrGeneral && targetProfile.church_id !== callerChurchId) {
          return new Response('Forbidden: You can only update roles for users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        // clear existing extra roles
        await supabaseAdmin.from('profiles_roles').delete().eq('user_id', userId);

        // ensure primary role remains set in profiles (first item if provided)
        if (requestBody.roles.length > 0) {
          const primary = requestBody.roles[0];
          if (!isAdmin && (primary === 'admin' || primary === 'general')) {
            return new Response('Forbidden: Only administrators can assign admin or general roles.', { status: 403, headers: corsHeaders });
          }
          await supabaseAdmin.from('profiles').update({ role: primary }).eq('id', userId);
        }

        // add the rest as extra roles (skip duplicate of primary)
        const extras = requestBody.roles.slice(1).map((r: any) => ({ user_id: userId, role: r }));
        if (extras.length > 0) {
          await supabaseAdmin.from('profiles_roles').insert(extras);
        }

        return new Response(JSON.stringify({ success: true }), {
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
  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});