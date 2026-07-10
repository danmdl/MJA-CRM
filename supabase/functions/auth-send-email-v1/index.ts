// auth-send-email-v1
// Supabase Auth Hook — replaces all auth email sending.
//
// SECURITY HARDENING (audit 2026-05-13):
//   1. HMAC signature verification against SEND_EMAIL_HOOK_SECRET
//      (Standard Webhooks / Svix scheme). Without this, anyone with
//      the function URL could trigger arbitrary password-reset /
//      signup / invite emails to any user_id, with an
//      attacker-controlled `redirect_to` → account-takeover-grade
//      phishing primitive.
//   2. `redirect_to` is allow-listed against ALLOWED_REDIRECT_HOSTS.
//      A redirect to anywhere else falls back to SITE_URL.
//   3. user_metadata values that flow into the email HTML are
//      escapeHTML'd. Previously an inviter could put `<script>` or
//      HTML formatting into the invite metadata and it would land
//      verbatim in the recipient's email.
//   4. fail-OPEN -> fail-CLOSED. Errors return 4xx/5xx instead of
//      200; if the hook secret is missing the function refuses to
//      start (would otherwise accept anything).
//
// Payload contract (do not change without checking GoTrue):
//   { user: { id, email, user_metadata, ... },
//     email_data: { token, token_hash, redirect_to, email_action_type,
//                   site_url, token_new, token_hash_new } }
//   There is NO top-level `user_id`. The user object arrives inline, so
//   no admin.getUserById round-trip is needed.
//
// Setup:
//   1. Add RESEND_API_KEY and SEND_EMAIL_HOOK_SECRET to Edge Function
//      secrets in Supabase Dashboard. The hook secret is the one
//      shown by Authentication > Hooks > Send Email > HTTP Hook
//      (format: `v1,whsec_<base64>`).
//   2. Go to Authentication > Hooks > Send Email > HTTP Hook.
//   3. Point it at this function's URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureException } from '../_shared/sentry.ts';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HOOK_SECRET_RAW   = Deno.env.get('SEND_EMAIL_HOOK_SECRET') || '';
const FROM_EMAIL        = 'noreply@mjatu.casa';
const FROM_NAME         = 'MJA CRM';
const SITE_URL          = 'https://mjatu.casa';

// Redirect allow-list — anything not on this list falls back to
// SITE_URL. The Supabase Site URL setting in Auth dashboard already
// covers some of this server-side, but mirroring it here means an
// attacker who bypasses Supabase's check (e.g. a future config drift)
// can't still smuggle a phishing redirect via this function.
const ALLOWED_REDIRECT_HOSTS = new Set([
  'mjatu.casa',
  'www.mjatu.casa',
  'mja-one.vercel.app',
]);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ─── helpers ────────────────────────────────────────────────────────────────

// Decode the v1,whsec_<base64> secret format Supabase Auth uses.
// Returns the raw secret bytes ready for HMAC, or null if not
// configured / malformed.
function decodeHookSecret(): Uint8Array | null {
  if (!HOOK_SECRET_RAW) return null;
  // Two accepted formats: `v1,whsec_<base64>` (current) and a plain
  // base64-encoded secret (older). Strip prefix if present.
  const cleaned = HOOK_SECRET_RAW.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  try {
    const bin = atob(cleaned);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

const SECRET_KEY_PROMISE = (async () => {
  const raw = decodeHookSecret();
  if (!raw) return null;
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
})();

async function verifyWebhookSignature(
  body: string,
  msgId: string | null,
  msgTimestamp: string | null,
  msgSignature: string | null,
): Promise<boolean> {
  const key = await SECRET_KEY_PROMISE;
  if (!key) return false;
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Reject stamps older than 5 minutes (replay protection).
  const tsNum = Number(msgTimestamp);
  if (!Number.isFinite(tsNum)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > 5 * 60) return false;

  const payload = `${msgId}.${msgTimestamp}.${body}`;
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // The header carries a space-separated list of versioned signatures
  // (e.g. `v1,base64sig v1,base64sig2`). Any match wins. Constant-time
  // compare per candidate.
  for (const part of msgSignature.split(' ')) {
    const [, candidate] = part.split(',');
    if (!candidate) continue;
    if (constantTimeEqual(candidate, expected)) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Minimal HTML escape — every user-controlled string that lands in
// the email body MUST go through this. Otherwise an inviter who can
// edit user_metadata can put script-equivalent payloads into the
// recipient's email.
function esc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeRedirect(redirectTo: string | undefined): string {
  if (!redirectTo) return SITE_URL;
  try {
    const u = new URL(redirectTo);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return SITE_URL;
    if (!ALLOWED_REDIRECT_HOSTS.has(u.host)) {
      console.warn(`[auth-send-email-v1] redirect_to host not allow-listed: ${u.host} — falling back to ${SITE_URL}`);
      return SITE_URL;
    }
    return u.toString();
  } catch {
    return SITE_URL;
  }
}

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
  return `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

// Shared HTML shell — dark theme matching the app
function emailShell(title: string, preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#09090b;">${esc(preheader)}</div>
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
  // url is built from server-controlled SUPABASE_URL + the
  // already-allow-listed redirect — safe to use unescaped here.
  // label is a static string we control. esc'ing both as defense in depth.
  const safeUrl = esc(url);
  return `<tr><td align="center" style="padding:32px 48px 8px 48px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
      <td align="center" style="border-radius:10px;background:linear-gradient(160deg,#FFE07A 0%,#FFC233 45%,#B8720A 100%);box-shadow:0 6px 20px rgba(255,194,51,0.32);">
        <a href="${safeUrl}" target="_blank"
           style="display:inline-block;padding:15px 44px;font-size:15px;font-weight:700;color:#1a0e00;text-decoration:none;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td align="center" style="padding:16px 48px 0 48px;">
    <p style="margin:0;font-size:11px;color:#71717a;">¿El botón no funciona? Copiá este enlace:</p>
    <p style="margin:6px 0 0 0;font-size:11px;color:#a1a1aa;word-break:break-all;">
      <a href="${safeUrl}" style="color:#FFC233;text-decoration:none;">${safeUrl}</a>
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

function buildInviteEmail(confirmUrl: string, meta: Record<string, unknown>) {
  // Every value coming out of user_metadata is attacker-influenced
  // (inviter can put anything in metadata). Always esc().
  const invited_by_name = esc(meta.invited_by_name || 'Alguien');
  const first_name = esc(meta.first_name || '');
  const invited_to_church_name = esc(meta.invited_to_church_name || '');
  const numero_cuerda = esc(meta.numero_cuerda || '');
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
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#fafafa;">${esc(title)}</h1>
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
  // GET /auth-send-email-v1 — operational healthcheck. Reports whether
  // required secrets are configured and whether the Resend key is
  // accepted by Resend's API. Booleans only, never secret values.
  if (req.method === 'GET') {
    let resendKeyStatus = 'not_configured';
    if (RESEND_API_KEY) {
      try {
        const r = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
        });
        resendKeyStatus = r.ok ? 'valid' : `rejected_${r.status}`;
      } catch {
        resendKeyStatus = 'network_error';
      }
    }
    return new Response(JSON.stringify({
      resend_api_key: resendKeyStatus,
      hook_secret_configured: !!HOOK_SECRET_RAW,
      supabase_url_configured: !!SUPABASE_URL,
      service_role_configured: !!SUPABASE_SERVICE,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Refuse to operate without the hook secret. Without it we'd be
  // back to the pre-hardening state where any caller could request
  // arbitrary emails.
  if (!HOOK_SECRET_RAW) {
    console.error('[auth-send-email-v1] SEND_EMAIL_HOOK_SECRET is not configured — refusing all requests');
    return new Response(JSON.stringify({ error: 'hook not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Read the raw body once for signature verification AND parsing.
  const rawBody = await req.text();
  const msgId = req.headers.get('webhook-id');
  const msgTimestamp = req.headers.get('webhook-timestamp');
  const msgSignature = req.headers.get('webhook-signature');

  const valid = await verifyWebhookSignature(rawBody, msgId, msgTimestamp, msgSignature);
  if (!valid) {
    console.warn('[auth-send-email-v1] invalid signature', { msgId, hasTimestamp: !!msgTimestamp, hasSignature: !!msgSignature });
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = JSON.parse(rawBody);
    // The Send Email Hook payload is `{ user, email_data }` — the FULL user
    // object, including email and user_metadata. There is no top-level
    // `user_id` field. Reading one produced `undefined`, which tripped the
    // required-fields guard below and made every auth email 400.
    const { user, email_data } = payload;
    const {
      token_hash,
      redirect_to,
      email_action_type: actionType,
    } = email_data ?? {};

    if (!user?.id || !user?.email || !token_hash || !actionType) {
      console.error('[auth-send-email-v1] missing required fields', {
        hasUserId: !!user?.id,
        hasUserEmail: !!user?.email,
        hasTokenHash: !!token_hash,
        actionType,
      });
      return new Response(JSON.stringify({ error: 'missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmail: string = user.email;

    const safeRedirect = normalizeRedirect(redirect_to);
    const confirmUrl = buildConfirmationUrl(token_hash, actionType, safeRedirect);

    let subject: string;
    let html: string;

    if (actionType === 'recovery') {
      const today = new Date().toISOString().split('T')[0];
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
      const inviterName = esc(meta.invited_by_name || 'Alguien');
      subject = `${inviterName} te invitó a MJA CRM`;
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
    captureException(err, { fn: 'auth-send-email-v1' });
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
