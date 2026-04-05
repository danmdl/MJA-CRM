// WEEKLY EMAIL REPORT — Prepared but NOT activated
// To activate: set up a Supabase cron job that calls this function weekly
// Requires: RESEND_API_KEY env variable in Supabase project settings
//
// This function generates a weekly summary for each referente:
// - New contacts in their cuerda
// - Contacts assigned to cells
// - Contacts without follow-up (>7 days)
// - Overall stats
//
// To activate later:
// 1. Sign up at resend.com (free, 3000 emails/month)
// 2. Add RESEND_API_KEY to Supabase Edge Function secrets
// 3. Create a cron: SELECT cron.schedule('weekly-report', '0 8 * * 1', $$SELECT net.http_post(...)$$)
// 4. Deploy this edge function

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get all referentes/supervisors with email
  const { data: referentes } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, role, church_id, numero_cuerda')
    .in('role', ['referente', 'supervisor', 'pastor', 'general', 'admin'])
    .not('email', 'is', null);

  if (!referentes?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let sentCount = 0;

  for (const ref of referentes) {
    if (!ref.email || !ref.church_id) continue;

    // Get contacts for this person's cuerda (or all if admin/pastor)
    let contactQuery = supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, numero_cuerda, estado_seguimiento, created_at, ultimo_seguimiento')
      .eq('church_id', ref.church_id)
      .is('deleted_at', null);

    if (ref.numero_cuerda && !['admin', 'general', 'pastor'].includes(ref.role)) {
      contactQuery = contactQuery.eq('numero_cuerda', ref.numero_cuerda);
    }

    const { data: contacts } = await contactQuery;
    if (!contacts?.length) continue;

    const newContacts = contacts.filter(c => c.created_at >= oneWeekAgo);
    const withoutFollowUp = contacts.filter(c => {
      if (!c.ultimo_seguimiento) return true;
      return new Date(c.ultimo_seguimiento) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    });

    const cuerdaLabel = ref.numero_cuerda ? `Cuerda ${ref.numero_cuerda}` : 'Todas las cuerdas';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #09090b; color: #fafafa;">
        <h1 style="color: #FFC233; font-size: 20px;">📊 Resumen Semanal — ${cuerdaLabel}</h1>
        <p style="color: #a1a1aa; font-size: 14px;">Hola ${ref.first_name || 'equipo'},</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0;">
          <div style="background: #111113; border: 1px solid #27272a; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #a1a1aa; font-size: 11px; margin: 0;">Total contactos</p>
            <p style="color: #fafafa; font-size: 28px; font-weight: bold; margin: 4px 0 0;">${contacts.length}</p>
          </div>
          <div style="background: #111113; border: 1px solid #27272a; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #a1a1aa; font-size: 11px; margin: 0;">Nuevos esta semana</p>
            <p style="color: #22c55e; font-size: 28px; font-weight: bold; margin: 4px 0 0;">${newContacts.length}</p>
          </div>
        </div>

        ${withoutFollowUp.length > 0 ? `
          <div style="background: #111113; border: 1px solid #f97316; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="color: #f97316; font-size: 13px; font-weight: 600; margin: 0 0 8px;">⚠️ ${withoutFollowUp.length} contacto(s) sin seguimiento (+7 días)</p>
            ${withoutFollowUp.slice(0, 5).map(c => `<p style="color: #a1a1aa; font-size: 12px; margin: 2px 0;">• ${c.first_name} ${c.last_name || ''}</p>`).join('')}
            ${withoutFollowUp.length > 5 ? `<p style="color: #71717a; font-size: 11px; margin-top: 4px;">y ${withoutFollowUp.length - 5} más...</p>` : ''}
          </div>
        ` : '<p style="color: #22c55e; font-size: 13px;">✅ Todos los contactos tienen seguimiento reciente.</p>'}

        <p style="color: #71717a; font-size: 11px; margin-top: 24px;">— MJA CRM · <a href="https://mjatu.casa" style="color: #FFC233;">mjatu.casa</a></p>
      </div>
    `;

    // Send via Resend
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'MJA CRM <noreply@mjatu.casa>',
          to: ref.email,
          subject: `📊 Resumen semanal — ${cuerdaLabel}`,
          html,
        }),
      });
      if (res.ok) sentCount++;
    } catch (e) {
      console.error(`Failed to send to ${ref.email}:`, e);
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
