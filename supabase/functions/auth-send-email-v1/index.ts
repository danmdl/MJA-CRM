// auth-send-email-v1
// Supabase Auth Hook — replaces all auth email sending.
// For password-reset (recovery) emails it appends a daily counter to the
// subject so Gmail creates a new thread each time instead of stacking them.
//
// Setup:
//   1. Add RESEND_API_KEY to Edge Function secrets in Supabase Dashboard.
//   2. Go to Authentication > Hooks > Send Email > HTTP Hook.
//   3. Point it at this function's URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL        = 'noreply@mjatu.casa';
const FROM_NAME         = 'MJA CRM';
const SITE_URL          = 'https://mjatu.casa';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ─── helpers ────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

function buildConfirmationUrl(tokenHash: string, type: string, redirectTo: string): string {
  return `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

// Shared HTML shell — dark theme matching the app
function emailShell(title: string, preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#09090b;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090b;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
             style="max-width:600px;background-color:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <tr><td style="height:4px;background:linear-gradient(90deg,#FFE07A 0%,#FFC233 50%,#B8720A 100%);font-size:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:44px 40px 8px 40px;">
          <img src="https://mjatu.casa/logo.png" width="64" height="64" alt="MJA"
               style="display:block;width:64px;height:64px;border:0;">
        </td></tr>
        <tr><td align="center" style="padding:14px 40px 4px 40px;">
          <div style="font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#FFC233;">MJA CRM</div>
        </td></tr>
        ${bodyHtml}
        <tr><td style="padding:32px 48px 0 48px;">
          <div style="height:1px;background:rgba(255,255,255,0.07);font-size:0;">&nbsp;</div>
        </td></tr>
        <tr><td align="center" style="padding:20px 48px 40px 48px;">
          <p style="margin:0;font-size:11px;color:#52525b;">MJA CRM &middot; Sistema de gestión ministerial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function goldButton(url: string, label: string): string {
  return `<tr><td align="center" style="padding:32px 48px 8px 48px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
      <td align="center" style="border-radius:10px;background:linear-gradient(160deg,#FFE07A 0%,#FFC233 45%,#B8720A 100%);box-shadow:0 6px 20px rgba(255,194,51,0.32);">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:15px 44px;font-size:15px;font-weight:700;color:#1a0e00;text-decoration:none;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td align="center" style="padding:16px 48px 0 48px;">
    <p style="margin:0;font-size:11px;color:#71717a;">¿El botón no funciona? Copiá este enlace:</p>
    <p style="margin:6px 0 0 0;font-size:11px;color:#a1a1aa;word-break:break-all;">
      <a href="${url}" style="color:#FFC233;text-decoration:none;">${url}</a>
    </p>
  </td></tr>`;
}

// ─── email builders ──────────────────────────────────────────────────────────

function buildRecoveryEmail(confirmUrl: string, subject: string) {
  const body = `
    <tr><td align="center" style="padding:20px 40px 0 40px;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#fafafa;letter-spacing:-0.4px;">Recuperar contraseña</h1>
    </td></tr>
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <p style="margin:0;font-size:16px;line-height:1.6;color:#d4d4d8;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong style="color:#fafafa;">MJA CRM</strong>.
      </p>
      <p style="margin:18px 0 0 0;font-size:16px;line-height:1.6;color:#d4d4d8;">
        Hacé click en el botón de abajo para crear una nueva contraseña. Este enlace expira en <strong style="color:#fafafa;">1 hora</strong>.
      </p>
    </td></tr>
    ${goldButton(confirmUrl, 'Crear nueva contraseña &nbsp;→')}
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td valign="top" width="22" style="padding-top:2px;"><span style="font-size:14px;color:#71717a;">🔒</span></td>
          <td style="padding-left:10px;">
            <p style="margin:0;font-size:12px;color:#71717a;line-height:1.55;">
              Si no pediste restablecer tu contraseña, podés ignorar este mensaje. Tu contraseña actual no cambia.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>`;
  return emailShell(subject, 'Restablecé tu contraseña de MJA CRM', body);
}

function buildInviteEmail(confirmUrl: string, meta: Record<string, string>) {
  const { invited_by_name = 'Alguien', first_name = '', invited_to_church_name = '', numero_cuerda = '' } = meta;
  const infoBox = (invited_to_church_name || numero_cuerda) ? `
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="background-color:rgba(255,194,51,0.06);border:1px solid rgba(255,194,51,0.2);border-radius:10px;">
        <tr><td style="padding:18px 22px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#FFC233;margin-bottom:8px;">Tu invitación</div>
          ${invited_to_church_name ? `<div style="font-size:15px;color:#fafafa;"><span style="color:#a1a1aa;">Iglesia:&nbsp;</span><strong>${invited_to_church_name}</strong></div>` : ''}
          ${numero_cuerda ? `<div style="font-size:15px;color:#fafafa;margin-top:4px;"><span style="color:#a1a1aa;">Cuerda:&nbsp;</span><strong>${numero_cuerda}</strong></div>` : ''}
        </td></tr>
      </table>
    </td></tr>` : '';

  const body = `
    <tr><td align="center" style="padding:20px 40px 0 40px;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#fafafa;letter-spacing:-0.4px;">
        ${invited_by_name} te invitó a unirte
      </h1>
    </td></tr>
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <p style="margin:0;font-size:16px;line-height:1.6;color:#d4d4d8;">
        Hola${first_name ? ` <strong style="color:#fafafa;">${first_name}</strong>` : ''}, ¡bienvenido/a a la familia!
      </p>
      <p style="margin:18px 0 0 0;font-size:16px;line-height:1.6;color:#d4d4d8;">
        <strong style="color:#fafafa;">${invited_by_name}</strong> te invitó a ser parte
        ${numero_cuerda ? ` de la <strong style="color:#FFC233;">Cuerda ${numero_cuerda}</strong>` : ''}
        ${invited_to_church_name ? ` en <strong style="color:#fafafa;">${invited_to_church_name}</strong>` : ''}.
      </p>
    </td></tr>
    ${infoBox}
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <p style="margin:0;font-size:15px;line-height:1.65;color:#a1a1aa;">
        Para activar tu cuenta, hacé click en el botón de abajo y completá tus datos.
      </p>
    </td></tr>
    ${goldButton(confirmUrl, 'Activar mi cuenta &nbsp;→')}
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td valign="top" width="22" style="padding-top:2px;"><span style="font-size:14px;color:#71717a;">🔒</span></td>
          <td style="padding-left:10px;">
            <p style="margin:0;font-size:12px;color:#71717a;line-height:1.55;">
              Este enlace es de un solo uso. Si no esperabas esta invitación, podés ignorar este mensaje.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>`;
  return emailShell(`${invited_by_name} te invitó a MJA CRM`, `${invited_by_name} te invitó a unirte al equipo.`, body);
}

function buildGenericEmail(confirmUrl: string, actionType: string) {
  const titles: Record<string, string> = {
    signup:               'Confirmá tu cuenta',
    magiclink:            'Tu enlace de acceso',
    email_change_new:     'Confirmá tu nuevo email',
    email_change_current: 'Confirmá el cambio de email',
    reauthentication:     'Confirmá tu identidad',
  };
  const title = titles[actionType] || 'Acción requerida';
  const body = `
    <tr><td align="center" style="padding:20px 40px 0 40px;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#fafafa;">${title}</h1>
    </td></tr>
    <tr><td align="left" style="padding:24px 48px 0 48px;">
      <p style="margin:0;font-size:16px;line-height:1.6;color:#d4d4d8;">
        Hacé click en el botón de abajo para continuar.
      </p>
    </td></tr>
    ${goldButton(confirmUrl, 'Continuar &nbsp;→')}`;
  return emailShell(title, title, body);
}

// ─── main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = await req.json();
    const { user_id, email_data } = payload;
    const {
      token_hash,
      redirect_to,
      email_action_type: actionType,
      site_url,
    } = email_data ?? {};

    // Fetch user email via admin API
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(user_id);
    if (userErr || !user?.email) {
      console.error('Could not fetch user', userErr);
      return new Response('{}', { status: 200 }); // fail-open
    }
    const userEmail = user.email;

    // Build confirmation URL
    const effectiveSiteUrl = site_url || SITE_URL;
    const effectiveRedirect = redirect_to || effectiveSiteUrl;
    const confirmUrl = buildConfirmationUrl(token_hash, actionType, effectiveRedirect);

    let subject: string;
    let html: string;

    if (actionType === 'recovery') {
      // Increment daily counter and build subject
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const { data: countData, error: cntErr } = await supabase.rpc('increment_email_counter', {
        p_email: userEmail,
        p_date: today,
      });
      const count: number = cntErr ? 1 : (countData ?? 1);
      subject = count <= 1
        ? 'Recuperar contraseña — MJA CRM'
        : `Recuperar contraseña — MJA CRM +${count - 1}`;
      html = buildRecoveryEmail(confirmUrl, subject);

    } else if (actionType === 'invite') {
      const meta = user.user_metadata ?? {};
      subject = `${meta.invited_by_name || 'Alguien'} te invitó a MJA CRM`;
      html = buildInviteEmail(confirmUrl, meta);

    } else {
      subject = actionType === 'signup'      ? 'Confirmá tu cuenta en MJA CRM'
              : actionType === 'magiclink'   ? 'Tu enlace de acceso a MJA CRM'
              : 'MJA CRM — acción requerida';
      html = buildGenericEmail(confirmUrl, actionType);
    }

    await sendEmail(userEmail, subject, html);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('auth-send-email-v1 error:', err);
    // Return 200 to prevent Supabase from retrying indefinitely
    return new Response('{}', { status: 200 });
  }
});
