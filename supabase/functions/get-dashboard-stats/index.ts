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
      console.error('[get-dashboard-stats] Auth error:', userAuthError);
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userAuth.user.id)
      .single();

    if (profileError || !profile) {
      console.error('[get-dashboard-stats] Profile error:', profileError);
      return new Response('Forbidden: User profile not found or accessible', { status: 403, headers: corsHeaders });
    }

    const callerRole = profile.role;
    const isAdminOrGeneral = callerRole === 'admin' || callerRole === 'general';

    if (!isAdminOrGeneral) {
      return new Response('Forbidden: Only administrators or generals can access dashboard statistics.', { status: 403, headers: corsHeaders });
    }

    // Fetch churches count
    const { count: churchesCount, error: churchesError } = await supabaseAdmin
      .from('churches')
      .select('*', { count: 'exact', head: true });

    if (churchesError) {
      console.error('[get-dashboard-stats] Error fetching churches count:', churchesError);
      throw new Error(churchesError.message);
    }

    // Fetch users count (from auth.users for all users)
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1, // We only need the total count, not the actual users
    });

    if (usersError) {
      console.error('[get-dashboard-stats] Error fetching users count:', usersError);
      throw new Error(usersError.message);
    }
    const usersCount = usersData.total;

    // Fetch contacts count
    const { count: contactsCount, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    if (contactsError) {
      console.error('[get-dashboard-stats] Error fetching contacts count:', contactsError);
      throw new Error(contactsError.message);
    }

    return new Response(JSON.stringify({
      churches: churchesCount,
      users: usersCount,
      contacts: contactsCount,
      activity: 24, // Placeholder for activity
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[get-dashboard-stats] Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});