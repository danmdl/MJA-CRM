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

    const { email, role, churchId } = await req.json();
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://mja-one.vercel.app';
    console.log('[invite-user] Edge Function using SITE_URL:', siteUrl);

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization check for invite
    // If churchId is provided in the request, ensure caller is admin/general OR assigned to that church
    if (churchId && !isAdminOrGeneral && callerChurchId !== churchId) {
      return new Response('Forbidden: You can only invite users to your assigned church.', { status: 403, headers: corsHeaders });
    }
    // If no churchId is provided, only admin/general can invite globally
    if (!churchId && !isAdminOrGeneral) {
      return new Response('Forbidden: Only administrators or generals can invite users globally.', { status: 403, headers: corsHeaders });
    }
    // Prevent non-admins from setting admin/general roles
    if (!isAdminOrGeneral && (role === 'admin' || role === 'general')) {
      return new Response('Forbidden: Only administrators can assign admin or general roles.', { status: 403, headers: corsHeaders });
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/login`,
      data: { role: role || 'user', church_id: churchId || null }
    });

    if (error) {
      console.error('Error inviting user:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Invitation sent successfully', user: data.user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});