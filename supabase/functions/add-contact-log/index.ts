import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )
    const { contactId, churchId, contact_date, contact_method, notes } = await req.json()
    if (!contactId || !churchId || !contact_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    // Verify contact belongs to church
    const { data: contact, error: cErr } = await supabaseAdmin.from('contacts').select('id, church_id').eq('id', contactId).single()
    if (cErr || !contact || contact.church_id !== churchId) {
      return new Response(JSON.stringify({ error: "Contact not found for this church" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('contact_logs').insert({
        contact_id: contactId,
        contacted_by: userData.user.id,
        contact_date,
        contact_method,
        notes
      }).select('*').single()
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    await supabaseAdmin.from('activity_logs').insert({
      user_id: userData.user.id,
      church_id: churchId,
      action: 'create',
      entity_type: 'contact_log',
      entity_id: inserted.id,
      before_data: null,
      after_data: inserted
    })
    return new Response(JSON.stringify({ success: true, log: inserted }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})