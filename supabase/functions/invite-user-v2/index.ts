// @ts-nocheck
// invite-user-v2 - personalized invite flow
// Created because the existing admin-user-actions function cannot be redeployed
// (the deploy tool returns InternalServerErrorException for that specific slug).
// This is a focused replacement for the resendInvite/generateInviteLink actions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, church_id, first_name, last_name')
      .eq('id', userAuth.user.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isAdminOrGeneral = callerProfile.role === 'admin' || callerProfile.role === 'general';

    const body = await req.json();
    const { email, role, churchId, first_name, last_name, phone, numero_cuerda } = body;
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://mja-one.vercel.app';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: same rules as the original
    if (churchId && !isAdminOrGeneral && callerProfile.church_id !== churchId) {
      return new Response(JSON.stringify({ error: 'You can only invite users to your assigned church.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!churchId && !isAdminOrGeneral) {
      return new Response(JSON.stringify({ error: 'Only administrators or generals can invite users globally.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isAdminOrGeneral && (role === 'admin' || role === 'general')) {
      return new Response(JSON.stringify({ error: 'Only administrators can assign admin or general roles.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build inviter name from caller profile (already loaded)
    const inviterName = `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || null;

    // Look up church name
    let churchName = null;
    if (churchId) {
      try {
        const { data: cr } = await supabaseAdmin
          .from('churches')
          .select('name')
          .eq('id', churchId)
          .single();
        if (cr) churchName = cr.name;
      } catch (e) { console.error('[invite-user-v2] church lookup failed', e); }
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/login`,
      data: {
        role: role || 'conector',
        church_id: churchId || null,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        numero_cuerda: numero_cuerda || null,
        invited_by_name: inviterName,
        invited_to_church_name: churchName,
      },
    });

    if (error) {
      console.error('[invite-user-v2] inviteUserByEmail failed', error);
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
    console.error('[invite-user-v2] unexpected error', error);
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
