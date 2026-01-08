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
      console.error("[add-contact-log] Missing Authorization header")
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )
    const { contactId, churchId, contact_date, contact_method, notes } = await req.json()
    console.log("[add-contact-log] Payload received", { contactId, churchId })
    if (!contactId || !churchId || !contact_date) {
      console.error("[add-contact-log] Missing required fields")
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      console.error("[add-contact-log] Invalid token", userErr)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // NEW: Load caller profile and enforce role/church authorization
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("profiles")
      .select("role, church_id")
      .eq("id", userData.user.id)
      .single()
    if (callerErr || !callerProfile) {
      console.error("[add-contact-log] Caller profile not found", callerErr)
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const isAdminOrGeneral = callerProfile.role === "admin" || callerProfile.role === "general"
    const allowedLeaderRoles = ["pastor", "piloto", "encargado_de_celula"]
    if (!isAdminOrGeneral) {
      const sameChurch = callerProfile.church_id === churchId
      const isAllowedRole = allowedLeaderRoles.includes(callerProfile.role)
      if (!sameChurch || !isAllowedRole) {
        console.error("[add-contact-log] Caller not allowed", { callerRole: callerProfile.role, callerChurch: callerProfile.church_id, targetChurch: churchId })
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // Verify contact belongs to church
    const { data: contact, error: cErr } = await supabaseAdmin.from('contacts').select('id, church_id').eq('id', contactId).single()
    if (cErr || !contact || contact.church_id !== churchId) {
      console.error("[add-contact-log] Contact not found for this church", cErr)
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
      console.error("[add-contact-log] Insert failed", insErr)
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
    console.log("[add-contact-log] Log created", { id: inserted.id })
    return new Response(JSON.stringify({ success: true, log: inserted }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("[add-contact-log] Unexpected error", e)
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})