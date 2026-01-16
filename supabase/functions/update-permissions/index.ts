import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '');
    
    // Update permissions for pastors and referentes
    const result = await sql`
      UPDATE public.permissions 
      SET change_user_role = TRUE 
      WHERE role IN ('pastor', 'referente')
      RETURNING *
    `;
    
    console.log('Updated permissions:', result);
    
    await sql.end();
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Permissions updated successfully',
      updated: result 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error updating permissions:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});