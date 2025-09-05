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
    const { email, role } = await req.json();

    if (!email || !role) {
      console.error('Missing email or role in request body.');
      return new Response(JSON.stringify({ error: 'Email y rol son requeridos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Log the keys being used (for debugging)
    console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'Set' : 'Not Set');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'Set' : 'Not Set');
    console.log('SITE_URL:', Deno.env.get('SITE_URL') ? 'Set' : 'Not Set');

    // Ensure redirectToUrl is always valid, defaulting to localhost for local development
    const redirectToUrl = Deno.env.get('SITE_URL') ? `${Deno.env.get('SITE_URL')}/login` : 'http://localhost:8080/login';
    console.log('Redirecting to:', redirectToUrl);

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { role: role },
      redirectTo: redirectToUrl,
    });

    if (error) {
      console.error('Error inviting user via Supabase Admin:', error); // Log the full error object
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Invitación enviada con éxito.', user: data.user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in Edge Function catch block:', error); // Log the full error object
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});