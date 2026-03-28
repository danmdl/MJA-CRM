import { supabase } from '@/integrations/supabase/client';

/**
 * Logs an event (usually an error) to the client_logs table in Supabase.
 * Argentina time is computed server-side via the created_at column.
 */
export async function logEvent({
  level = 'error',
  action,
  payload,
  error,
  context,
}: {
  level?: 'error' | 'warn' | 'info';
  action: string;
  payload?: Record<string, any>;
  error?: any;
  context?: Record<string, any>;
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    // Sanitize payload - remove sensitive fields
    const safePayload = payload ? sanitize(payload) : null;

    const errorMessage = error
      ? (typeof error === 'string' ? error : error?.message || error?.error || JSON.stringify(error))
      : null;

    const errorCode = error?.code || error?.status || null;

    await supabase.from('client_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      level,
      action,
      payload: safePayload,
      error_message: errorMessage,
      error_code: errorCode ? String(errorCode) : null,
      context: {
        ...context,
        url: window.location.pathname,
        userAgent: navigator.userAgent.substring(0, 200),
      },
    });
  } catch {
    // Never let logging crash the app
    console.warn('[clientLogger] Failed to write log');
  }
}

// Remove passwords and tokens from payloads before logging
function sanitize(obj: Record<string, any>): Record<string, any> {
  const REDACTED = '[REDACTED]';
  const sensitiveKeys = ['password', 'token', 'access_token', 'refresh_token', 'key'];
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.some(s => k.toLowerCase().includes(s))) {
      result[k] = REDACTED;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = sanitize(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
