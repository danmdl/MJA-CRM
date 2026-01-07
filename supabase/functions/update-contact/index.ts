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
      console.error("[update-contact] Missing Authorization header")
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const { contactId, churchId, data } = await req.json()
    console.log("[update-contact] Payload received", { contactId, churchId })

    if (!contactId || !churchId || !data) {
      console.error("[update-contact] Missing required fields")
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Validate user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      console.error("[update-contact] Invalid token", userErr)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Load caller profile
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("profiles")
      .select("role, church_id")
      .eq("id", userData.user.id)
      .single()

    if (callerErr || !callerProfile) {
      console.error("[update-contact] Caller profile not found", callerErr)
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const isAdminOrGeneral = callerProfile.role === "admin" || callerProfile.role === "general"
    if (!isAdminOrGeneral && callerProfile.church_id !== churchId) {
      console.error("[update-contact] Caller not allowed for this church", { callerChurch: callerProfile.church_id, churchId })
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Verify contact belongs to the church
    const { data: targetContact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, church_id")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    if (contactErr || !targetContact) {
      console.error("[update-contact] Contact not found or not in church", contactErr)
      return new Response(JSON.stringify({ error: "Contact not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Fetch before state
    const { data: before } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    // Sanitize incoming fields to only allow valid columns
    const allowedKeys = new Set([
      "first_name",
      "last_name",
      "email",
      "phone",
      "address",
      "apartment_number",
      "barrio",
      "leader_assigned",
      "cell_id",
      "date_of_birth",
    ])
    const sanitized: Record<string, unknown> = {}
    for (const k in data) {
      if (allowedKeys.has(k)) sanitized[k] = data[k]
    }

    console.log("[update-contact] Updating contact with", sanitized)

    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update(sanitized)
      .eq("id", contactId)
      .eq("church_id", churchId)

    if (updateErr) {
      console.error("[update-contact] Update failed", updateErr)
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Fetch after state
    const { data: after } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    // Log activity
    const { error: logErr } = await supabaseAdmin
      .from("activity_logs")
      .insert({
        user_id: userData.user.id,
        church_id: churchId,
        action: "update",
        entity_type: "contact",
        entity_id: contactId,
        before_data: before ?? null,
        after_data: after ?? null,
      })

    if (logErr) {
      console.error("[update-contact] Failed to write activity log", logErr)
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("[update-contact] Unexpected error", e)
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})