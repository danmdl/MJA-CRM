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

    const { contactId, churchId, data } = await req.json()

    if (!contactId || !churchId || !data) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Validate user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Load caller profile
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("profiles")
      .select("role, church_id")
      .eq("id", userData.user.id)
      .single()

    if (callerErr || !callerProfile) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const isAdminOrGeneral = callerProfile.role === "admin" || callerProfile.role === "general"
    const isConector = callerProfile.role === "user"

    // Church access check
    if (!isAdminOrGeneral && callerProfile.church_id !== churchId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Check edit_delete_contacts permission from permissions table
    const { data: perm } = await supabaseAdmin
      .from("permissions")
      .select("edit_delete_contacts")
      .eq("role", callerProfile.role)
      .single()

    const hasEditPermission = perm?.edit_delete_contacts === true

    // Fetch the contact to check ownership for Connectors
    const { data: targetContact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, church_id, created_by")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    if (contactErr || !targetContact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Permission check:
    // - Admin/General with edit_delete_contacts: always allowed
    // - Other roles with edit_delete_contacts: allowed if same church
    // - Conector (user role): only allowed if they created the contact
    const isOwner = targetContact.created_by === userData.user.id

    if (!hasEditPermission && !(isConector && isOwner)) {
      console.error("[update-contact] Permission denied", { role: callerProfile.role, hasEditPermission, isConector, isOwner })
      return new Response(JSON.stringify({ error: "No tienes permiso para editar contactos." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Sanitize incoming fields
    const allowedKeys = new Set([
      "first_name", "last_name", "email", "phone", "address",
      "apartment_number", "barrio", "leader_assigned", "cell_id",
      "date_of_birth", "fecha_contacto", "sexo", "estado_civil",
      "observaciones", "pedido_de_oracion", "conector", "edad",
      "numero_cuerda", "zona",
    ])
    const sanitized: Record<string, unknown> = {}
    for (const k in data) {
      if (allowedKeys.has(k)) sanitized[k] = data[k]
    }

    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update(sanitized)
      .eq("id", contactId)
      .eq("church_id", churchId)

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Log activity
    await supabaseAdmin.from("activity_logs").insert({
      user_id: userData.user.id,
      church_id: churchId,
      action: "update",
      entity_type: "contact",
      entity_id: contactId,
    }).then(() => {})

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error("[update-contact] Unexpected error", e)
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
