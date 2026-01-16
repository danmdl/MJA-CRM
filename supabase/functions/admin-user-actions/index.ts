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
    const { action, email, userId, role, newRole, churchId, newPassword, password, first_name, last_name, phone } = requestBody;

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

    // Fetch permissions for the caller
    const { data: callerPermissions, error: permissionsError } = await supabaseAdmin
      .from('permissions')
      .select('change_user_role')
      .eq('role', callerRole)
      .single();

    const canCallerChangeUserRole = isAdmin || callerPermissions?.change_user_role;

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
        console.log(`[DEBUG EDGE] listChurchUsers action received.`);
        console.log(`[DEBUG EDGE] Request churchId: ${churchId}`);
        console.log(`[DEBUG EDGE] Caller Role: ${callerRole}, Caller Church ID: ${callerChurchId}`);

        if (!churchId) {
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          return new Response('Forbidden: You can only list users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        // Fetch profiles explicitly assigned to this church
        const { data: assignedProfiles, error: assignedProfilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, role, updated_at, church_id, phone')
          .eq('church_id', churchId); // This is the core filter

        if (assignedProfilesError) {
          console.error('Error fetching assigned church profiles:', assignedProfilesError);
          return new Response(JSON.stringify({ error: assignedProfilesError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[DEBUG EDGE] Profiles fetched from DB for churchId ${churchId}:`, assignedProfiles);

        const profileIdsToFetch = assignedProfiles?.map(p => p.id) || [];
        console.log(`[DEBUG EDGE] Profile IDs to fetch from Auth for churchId ${churchId}:`, profileIdsToFetch);


        if (profileIdsToFetch.length === 0) {
          console.log(`[DEBUG EDGE] No profiles found for churchId ${churchId}. Returning empty array.`);
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // --- MODIFICACIÓN: Obtener todos los usuarios y luego filtrar en la función Edge ---
        const { data: allUsersData, error: allUsersError } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 100, // Ajusta esto si esperas más de 100 usuarios en total
        });

        if (allUsersError) {
          console.error('Error listing all auth users:', allUsersError);
          return new Response(JSON.stringify({ error: allUsersError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`[DEBUG EDGE] All Auth users fetched (IDs):`, allUsersData.users.map(u => u.id));

        const filteredAuthUsers = allUsersData.users.filter(user => profileIdsToFetch.includes(user.id));
        console.log(`[DEBUG EDGE] Filtered Auth users by profile IDs:`, filteredAuthUsers.map(u => u.id));
        // --- FIN MODIFICACIÓN ---

        // Fetch extra roles
        const { data: extraRoles } = await supabaseAdmin
          .from('profiles_roles')
          .select('user_id, role')
          .in('user_id', profileIdsToFetch);

        const churchUsers = filteredAuthUsers.map(user => {
          const userProfile = (assignedProfiles || []).find(p => p.id === user.id);
          const rolesArr = [userProfile?.role || 'user'].concat((extraRoles || []).filter(r => r.user_id === user.id).map(r => r.role));
          const status = user.confirmed_at ? 'confirmed' : (user.invited_at ? 'invited' : 'unknown');
          return {
            id: user.id,
            email: user.email,
            first_name: userProfile?.first_name || null,
            last_name: userProfile?.last_name || null,
            role: userProfile?.role || 'user',
            roles: rolesArr,
            updated_at: userProfile?.updated_at || user.updated_at,
            status: status,
            invited_at: user.invited_at,
            confirmed_at: user.confirmed_at,
            church_id: userProfile?.church_id || null,
            phone: userProfile?.phone || null,
          };
        });
        console.log(`[DEBUG EDGE] Final churchUsers array for churchId ${churchId}:`, churchUsers);


        return new Response(JSON.stringify(churchUsers), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'createUser': {
        if (!canCallerChangeUserRole) { // Enforce new permission
          return new Response('Forbidden: You do not have permission to create users with assigned roles.', { status: 403, headers: corsHeaders });
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
            church_id: churchId || null,
            phone: (requestBody && requestBody.phone) || null
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
        if (!canCallerChangeUserRole) { // Enforce new permission
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
        if (!canCallerChangeUserRole) { // Enforce new permission
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
        if (!canCallerChangeUserRole) { // Enforce new permission
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
          // NEW: Add check to prevent non-admins from assigning admin/general roles as primary
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