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

  let requestBody; 
  try {
    requestBody = await req.json(); 
    const { action, email, userId, role, newRole, churchId, newPassword, password, first_name, last_name } = requestBody;

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

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:8080';
    console.log('Edge Function admin-user-actions using SITE_URL:', siteUrl);

    switch (action) {
      case 'listUsers': {
        if (!isAdminOrGeneral) {
          return new Response('Forbidden: Only administrators or generals can list all users.', { status: 403, headers: corsHeaders });
        }
        const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 100,
        });

        if (error) {
          console.error('Error listing users:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const userIds = users.users.map(u => u.id);
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, role, updated_at, church_id')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          return new Response(JSON.stringify({ error: profilesError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const usersWithProfiles = users.users.map(user => {
          const userProfile = profilesData?.find(p => p.id === user.id);
          const status = user.confirmed_at ? 'confirmed' : (user.invited_at ? 'invited' : 'unknown');
          return {
            id: user.id,
            email: user.email,
            first_name: userProfile?.first_name || null,
            last_name: userProfile?.last_name || null,
            role: userProfile?.role || 'user',
            updated_at: userProfile?.updated_at || user.updated_at,
            status: status,
            invited_at: user.invited_at,
            confirmed_at: user.confirmed_at,
            church_id: userProfile?.church_id || null,
          };
        });

        return new Response(JSON.stringify(usersWithProfiles), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listChurchUsers': {
        console.log('Action: listChurchUsers');
        console.log('Received churchId:', churchId);
        console.log('Caller Role:', callerRole, 'Caller Church ID:', callerChurchId);
        console.log('Request Body:', requestBody); // Added log

        if (!churchId) {
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          return new Response('Forbidden: You can only list users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, role, updated_at, church_id')
          .eq('church_id', churchId);

        if (profilesError) {
          console.error('Error fetching church profiles:', profilesError);
          return new Response(JSON.stringify({ error: profilesError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log('Profiles data for church:', profilesData); // Added log

        const userIds = profilesData?.map(p => p.id) || [];
        console.log('User IDs from profiles:', userIds); // Added log

        if (userIds.length === 0) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: users, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
          filter: `id in (${userIds.map(id => `'${id}'`).join(',')})`,
          perPage: 100,
        });

        if (authUsersError) {
          console.error('Error listing auth users for church:', authUsersError);
          return new Response(JSON.stringify({ error: authUsersError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log('Auth users data for church IDs:', users.users); // Added log

        const churchUsers = users.users.map(user => {
          const userProfile = profilesData?.find(p => p.id === user.id);
          const status = user.confirmed_at ? 'confirmed' : (user.invited_at ? 'invited' : 'unknown');
          return {
            id: user.id,
            email: user.email,
            first_name: userProfile?.first_name || null,
            last_name: userProfile?.last_name || null,
            role: userProfile?.role || 'user',
            updated_at: userProfile?.updated_at || user.updated_at,
            status: status,
            invited_at: user.invited_at,
            confirmed_at: user.confirmed_at,
            church_id: userProfile?.church_id || null,
          };
        });
        console.log('Final church users list:', churchUsers); // Added log

        return new Response(JSON.stringify(churchUsers), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'createUser': {
        if (!isAdmin) {
          return new Response('Forbidden: Only administrators can create users directly.', { status: 403, headers: corsHeaders });
        }
        if (!email || !password || !role) {
          return new Response(JSON.stringify({ error: 'Email, password, and role are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isAdmin && (role === 'admin' || role === 'general')) {
          return new Response('Forbidden: Only administrators can assign admin or general roles.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true,
          user_metadata: { 
            first_name: first_name || null,
            last_name: last_name || null,
            role: role, 
            church_id: churchId || null 
          },
        });

        if (error) {
          console.error('Error creating user:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'User created successfully', user: data.user }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'deleteUser': {
        if (!userId) {
          return new Response(JSON.stringify({ error: 'User ID is required' }), {
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
          return new Response('Forbidden: You can only delete users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          console.error('Error deleting user:', error);
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

      case 'resendInvite':
      case 'generateInviteLink': {
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
          data: { role: role || 'user', church_id: churchId || null }
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
        if (!userId || !newRole) {
          return new Response(JSON.stringify({ error: 'User ID and new role are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const validRoles = ['admin', 'general', 'pastor', 'piloto', 'encargado_de_celula', 'user'];
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

      case 'resetUserPassword': {
        if (!isAdmin) {
          return new Response('Forbidden: Only administrators can reset user passwords.', { status: 403, headers: corsHeaders });
        }
        if (!userId || !newPassword) {
          return new Response(JSON.stringify({ error: 'User ID and new password are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) {
          console.error('Error resetting user password:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'User password reset successfully', user: data.user }), {
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