import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"
import { captureException } from "../_shared/sentry.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { contactId, churchId, data } = await req.json()
    if (!contactId || !churchId || !data) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("profiles")
      .select("role, church_id, numero_cuerda")
      .eq("id", userData.user.id)
      .single()
    if (callerErr || !callerProfile) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const isAdminOrGeneral = callerProfile.role === "admin" || callerProfile.role === "general"
    if (!isAdminOrGeneral && callerProfile.church_id !== churchId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: targetContact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, church_id, numero_cuerda, responsable_id")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()
    if (contactErr || !targetContact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Cuerda-isolation for non-privileged roles. A 'conector' /
    // 'anfitrion' / 'consolidador' / etc. in the same church but a
    // different cuerda was previously able to edit ANY contact in
    // the church via this endpoint. Now they're constrained to
    // contacts of their own cuerda (or contacts where they're the
    // responsable, for users without a cuerda). admin/general/pastor/
    // supervisor pass through (they oversee everyone in the church).
    if (!isAdminOrGeneral && callerProfile.role !== "pastor" && callerProfile.role !== "supervisor") {
      const callerCuerda = (callerProfile as any).numero_cuerda || null;
      if (callerCuerda) {
        if (targetContact.numero_cuerda !== callerCuerda) {
          return new Response(JSON.stringify({ error: "Forbidden: out-of-cuerda contact" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      } else if (targetContact.responsable_id !== userData.user.id) {
        return new Response(JSON.stringify({ error: "Forbidden: not your contact" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // Capture before/after snapshots for activity_logs.
    const { data: before } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    // Sensitive fields: cuerda assignment + cell/zona/responsable
    // routing. Below pastor/supervisor cannot change these via this
    // endpoint — they have to be routed through the dedicated assign
    // flow which is admin/supervisor only. Audit flagged this as the
    // path that let a conector silently reassign a contact across
    // cuerdas.
    const SENSITIVE_KEYS = new Set([
      "numero_cuerda", "cell_id", "zona", "zona_id",
      "leader_assigned", "responsable_id", "conector",
    ]);
    const canEditSensitive = isAdminOrGeneral
      || callerProfile.role === "pastor"
      || callerProfile.role === "supervisor";

    const allowedKeys = new Set([
      "first_name", "last_name", "email", "phone", "address",
      "apartment_number", "barrio", "leader_assigned", "cell_id",
      "date_of_birth", "numero_cuerda", "zona", "zona_id", "sexo",
      "estado_civil", "edad", "observaciones", "pedido_de_oracion",
      "fecha_contacto", "estado_seguimiento", "ultimo_seguimiento",
      "lat", "lng", "conector",
    ])
    const sanitized: Record<string, unknown> = {}
    const rejected: string[] = []
    for (const k in data) {
      if (!allowedKeys.has(k)) continue;
      if (SENSITIVE_KEYS.has(k) && !canEditSensitive) {
        // Silently drop sensitive fields for non-privileged callers
        // and log the attempt so admins can audit. Better than 4xx
        // because the rest of the update should still succeed.
        rejected.push(k);
        continue;
      }
      sanitized[k] = data[k];
    }
    if (rejected.length > 0) {
      console.warn(`[update-contact] dropped sensitive fields for ${callerProfile.role}`, { userId: userData.user.id, rejected });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update(sanitized)
      .eq("id", contactId)
      .eq("church_id", churchId)
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: after } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("church_id", churchId)
      .single()

    await supabaseAdmin.from("activity_logs").insert({
      user_id: userData.user.id,
      church_id: churchId,
      action: "update",
      entity_type: "contact",
      entity_id: contactId,
      before_data: before ?? null,
      after_data: after ?? null,
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    captureException(e, { fn: 'update-contact' });
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
