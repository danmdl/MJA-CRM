import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin-only function. Originally deployed as an unauthenticated one-shot
// migration that anyone with the URL could trigger to flip change_user_role=true
// for pastor/referente roles. Now requires a valid Supabase JWT belonging to a
// user with profiles.role = 'admin'.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json(401, { success: false, error: 'Missing bearer token' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Validate the caller's JWT against Supabase auth using the anon key client.
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) return json(401, { success: false, error: 'Invalid token' });

    // Admin-scope check using the service role client (bypasses RLS) to read role.
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileErr || !profile) return json(403, { success: false, error: 'Profile not found' });
    if (profile.role !== 'admin') return json(403, { success: false, error: 'Admin role required' });

    const { data, error } = await supabaseAdmin
      .from('permissions')
      .update({ change_user_role: true })
      .in('role', ['pastor', 'referente'])
      .select();

    if (error) {
      console.error('Error updating permissions:', error);
      return json(500, { success: false, error: error.message });
    }

    return json(200, {
      success: true,
      message: 'Permissions updated successfully',
      updated: data,
    });
  } catch (error: any) {
    captureException(error, { fn: 'update-permissions' });
    return json(500, { success: false, error: error?.message || 'Unknown error' });
  }
});
