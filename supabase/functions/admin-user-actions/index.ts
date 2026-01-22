// @ts-nocheck
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
      console.error('[admin-user-actions] Missing Authorization header');
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

    const { action, churchId } = await req.json(); // Removed user management specific fields
    console.log('[admin-user-actions] Edge Function received action:', action);

    switch (action) {
      case 'listChurchUsers': {
        if (!churchId) {
          console.error('[admin-user-actions] Church ID is required for listChurchUsers');
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          console.error('[admin-user-actions] Forbidden: Caller can only view users from their assigned church.');
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
            church_id
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
          invited_at: profile.updated_at,
          confirmed_at: profile.updated_at
        }));

        return new Response(JSON.stringify(formattedData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        console.warn('[admin-user-actions] Invalid action received:', action);
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('[admin-user-actions] Edge Function unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});