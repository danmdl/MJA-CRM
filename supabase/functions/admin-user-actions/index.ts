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

    // Verify the user's role to ensure only admins can call this function
    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) {
      console.error('Auth error:', userAuthError);
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userAuth.user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      console.error('Profile error or not admin:', profileError, profile?.role);
      return new Response('Forbidden: Only administrators can perform this action', { status: 403, headers: corsHeaders });
    }

    const { action, email, userId, role } = await req.json();
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:8080'; // Fallback for SITE_URL

    switch (action) {
      case 'listUsers': {
        const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 100, // Adjust as needed
        });

        if (error) {
          console.error('Error listing users:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch profiles to get roles and names
        const userIds = users.users.map(u => u.id);
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, role, updated_at')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          return new Response(JSON.stringify({ error: profilesError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const usersWithProfiles = users.users.map(user => {
          const userProfile = profiles?.find(p => p.id === user.id);
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
          };
        });

        return new Response(JSON.stringify(usersWithProfiles), {
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

      case 'resendInvite': {
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/login`,
          data: { role: role || 'user' } // Pass role if provided
        });
        if (error) {
          console.error('Error resending invite:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'Invitation resent successfully', user: data.user }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'generateInviteLink': {
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Supabase's inviteUserByEmail returns the user object which contains the confirmation_url
        // We can use this to extract the invite link.
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/login`,
          data: { role: role || 'user' } // Pass role if provided
        });
        if (error) {
          console.error('Error generating invite link:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // The confirmation_url is the invite link
        const inviteLink = data.user?.confirmation_url;
        if (!inviteLink) {
          return new Response(JSON.stringify({ error: 'Could not generate invite link' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ inviteLink }), {
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