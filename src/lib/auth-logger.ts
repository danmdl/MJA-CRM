/**
 * auth-logger.ts
 * Shared helpers for logging auth events to client_logs.
 * All inserts are fire-and-forget — they never throw or block the auth flow.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Device info ──────────────────────────────────────────────────────────────

export const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  return {
    userAgent: ua,
    device:  /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    browser: /Edg\//i.test(ua)     ? 'Edge'
           : /Chrome/i.test(ua)    ? 'Chrome'
           : /Firefox/i.test(ua)   ? 'Firefox'
           : /Safari/i.test(ua)    ? 'Safari'
           : 'Unknown',
    os: /Windows/i.test(ua)         ? 'Windows'
      : /Android/i.test(ua)         ? 'Android'
      : /iPhone|iPad/i.test(ua)     ? 'iOS'
      : /Mac OS X/i.test(ua)        ? 'macOS'
      : /Linux/i.test(ua)           ? 'Linux'
      : 'Unknown',
  };
};

// ─── Error categorization ─────────────────────────────────────────────────────

export const categorizeAuthError = (msg: string): string => {
  if (msg.includes('Invalid login credentials'))  return 'wrong_credentials';
  if (msg.includes('Email not confirmed'))         return 'email_not_confirmed';
  if (msg.includes('User not found'))              return 'user_not_found';
  if (msg.includes('Too many requests') ||
      msg.includes('rate limit') ||
      msg.includes('too many'))                    return 'rate_limited';
  if (msg.includes('expired') ||
      msg.includes('invalid') ||
      msg.includes('Token has'))                   return 'expired_or_invalid_token';
  if (msg.includes('Network') ||
      msg.includes('fetch'))                       return 'network_error';
  return 'unknown';
};

// ─── Failed-attempts tracker (localStorage, per email, 10-min window) ─────────

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export const recordFailedAttempt = (email: string): number => {
  const key = `_login_fails_${email.toLowerCase()}`;
  const now  = Date.now();
  const prev = JSON.parse(localStorage.getItem(key) || '[]') as number[];
  const recent = prev.filter(t => now - t < WINDOW_MS);
  recent.push(now);
  localStorage.setItem(key, JSON.stringify(recent));
  return recent.length; // how many failures in the last 10 min
};

export const clearFailedAttempts = (email: string): void => {
  localStorage.removeItem(`_login_fails_${email.toLowerCase()}`);
};

export const getFailedAttempts = (email: string): number => {
  const key = `_login_fails_${email.toLowerCase()}`;
  const now  = Date.now();
  const prev = JSON.parse(localStorage.getItem(key) || '[]') as number[];
  return prev.filter(t => now - t < WINDOW_MS).length;
};

// ─── Core log inserter ────────────────────────────────────────────────────────

interface AuthLogEntry {
  action: string;
  level?: 'info' | 'warning' | 'error';
  user_email?: string;
  user_id?: string;
  error_message?: string;
  error_code?: string;
  context?: Record<string, any>;
}

export const logAuthEvent = (entry: AuthLogEntry): void => {
  supabase.from('client_logs').insert({
    level:         entry.level ?? 'info',
    action:        entry.action,
    user_email:    entry.user_email,
    user_id:       entry.user_id ?? null,
    error_message: entry.error_message ?? null,
    error_code:    entry.error_code ?? null,
    context: {
      ...getDeviceInfo(),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      ...(entry.context ?? {}),
    },
  }).then(() => {});
};
