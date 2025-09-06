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

  console.log('Incoming request method:', req.method);
  console.log('Incoming request Content-Type:', req.headers.get('Content-Type'));
  console.log('SITE_URL env var:', Deno.env.get('SITE_URL'));
  console.log('SUPABASE_URL env var:', Deno.env.get('SUPABASE_URL') ? 'Set' : 'Not Set');
  console.log('SUPABASE_SERVICE_ROLE_KEY env var:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'Set' : 'Not Set');

  let requestBody;
  try {
    // Leer el cuerpo de la solicitud como texto primero para depuración
    const rawBody = await req.text();
    console.log('Raw request body:', rawBody);

    if (!rawBody) {
      console.error('Request body is empty.');
      return new Response(JSON.stringify({ error: 'El cuerpo de la solicitud está vacío.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    requestBody = JSON.parse(rawBody);
    console.log('Successfully parsed request body:', requestBody);

    const { email, role } = requestBody;
    console.log('Received invitation request for email:', email, 'with role:', role);

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

    const siteUrl = Deno.env.get('SITE_URL');
    const redirectToUrl = siteUrl ? `${siteUrl}/login` : 'http://localhost:8080/login';
    console.log('Redirecting new user to:', redirectToUrl);

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { role: role },
      redirectTo: redirectToUrl,
    });

    if (error) {
      console.error('Error inviting user via Supabase Admin:', error.message);
      return new Response(JSON.stringify({ error: `Error al invitar usuario: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User invited successfully. User ID:', data.user?.id);
    return new Response(JSON.stringify({ message: 'Invitación enviada con éxito.', user: data.user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in Edge Function catch block:', error.message);
    return new Response(JSON.stringify({ error: `Error interno del servidor: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});