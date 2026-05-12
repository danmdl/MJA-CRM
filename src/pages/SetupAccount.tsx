"use client";
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logAuthEvent, categorizeAuthError } from '@/lib/auth-logger';
import { validatePasswordFull } from '@/lib/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const SetupAccount = () => {
  const navigate = useNavigate();
  const [verifyError, setVerifyError] = useState('');
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string | null>(null);
  const [hasExistingSession, setHasExistingSession] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check the URL for a token but DON'T consume it yet — only consume on form submit
    // This way the user can refresh, close the tab, and come back, as long as the
    // token hasn't been used yet (24h validity from Supabase).
    const search = window.location.search;
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.replace('#', ''));

    const tHash = searchParams.get('token_hash') || hashParams.get('token_hash');
    const tType = searchParams.get('type') || hashParams.get('type');

    if (tHash && (tType === 'invite' || tType === 'signup' || tType === 'recovery')) {
      setTokenHash(tHash);
      setTokenType(tType);
      if (tType === 'recovery') setIsRecovery(true);
      return;
    }

    // No fresh token — check if there's an existing session.
    // This happens in two scenarios:
    //   1. User arrived via a recovery/invite link that went through PKCE
    //      auto-exchange (?code=xxx). The Supabase client created a session
    //      and cleaned the URL by the time we mount.
    //   2. User has an active session and navigated here manually.
    // In both cases we need to know if it's a recovery or first-time setup.
    // We check the user's profile_completed: if false → first time (invite),
    // if true → recovery (just need new password).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setEmail(session.user.email || '');
        const meta = session.user.user_metadata || {};
        if (meta.first_name) setFirstName(meta.first_name);
        if (meta.last_name) setLastName(meta.last_name);
        setHasExistingSession(true);

        // Check if this is a recovery (profile already completed)
        const { data: profile } = await supabase.from('profiles')
          .select('profile_completed, first_name, last_name')
          .eq('id', session.user.id)
          .single();
        if (profile?.profile_completed) {
          setIsRecovery(true);
          if (profile.first_name) setFirstName(profile.first_name);
          if (profile.last_name) setLastName(profile.last_name);
        }
      } else {
        setVerifyError('Link inválido o expirado. Pedile a tu admin que te envíe una nueva invitación.');
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!isRecovery && !firstName.trim()) { setError('Ingresá tu nombre.'); return; }
    setSubmitting(true);
    // Strength + HaveIBeenPwned check. Runs after local match check so the
    // "passwords don't match" message takes priority for a clearer error.
    const pwCheck = await validatePasswordFull(password);
    if (!pwCheck.ok) {
      setError(pwCheck.reason || 'Contraseña inválida.');
      setSubmitting(false);
      return;
    }
    try {
      // STEP 1: If we have a token from URL, verify it now (this consumes it)
      if (tokenHash && tokenType && !hasExistingSession) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: tokenType as any,
        });
        if (otpError) {
          setError('El link expiró o ya fue usado. Pedile a tu admin que te envíe una nueva invitación.');
          logAuthEvent({
            action: 'expired_link_used',
            level: 'warning',
            error_message: otpError.message,
            error_code: categorizeAuthError(otpError.message),
            context: {
              token_type: tokenType,
              note: 'OTP verification failed — token expired or already consumed',
            },
          });
          setSubmitting(false);
          return;
        }
      }

      // STEP 2: Set the password
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        setError(pwError.message);
        logAuthEvent({
          action: 'reset_failed',
          level: 'error',
          error_message: pwError.message,
          error_code: categorizeAuthError(pwError.message),
          context: { flow: isRecovery ? 'password_reset' : 'first_time_setup' },
        });
        setSubmitting(false);
        return;
      }
      // Password set successfully — USER_UPDATED event will also fire in SessionProvider
      logAuthEvent({
        action: isRecovery ? 'reset_completed' : 'account_setup_completed',
        level: 'info',
        context: { flow: isRecovery ? 'password_reset' : 'first_time_setup' },
      });

      // STEP 3: Update profile only for first-time setup (invite flow), not recovery
      if (!isRecovery) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: profileError } = await supabase.from('profiles').update({
            first_name: firstName.trim(),
            last_name: lastName.trim() || null,
            profile_completed: true,
          }).eq('id', user.id);
          if (profileError) { setError(profileError.message); setSubmitting(false); return; }
        }
      }
      // Done — redirect to app
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error inesperado.');
      setSubmitting(false);
    }
  };

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="w-14 h-14 mx-auto" style={{ filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))' }}>
            <img src="/logo.png" alt="MJA" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold">Link inválido</h1>
          <p className="text-muted-foreground">{verifyError}</p>
          <Button variant="outline" onClick={() => navigate('/login')}>Ir al inicio de sesión</Button>
        </div>
      </div>
    );
  }

  // Don't show the form until we have either a token or an existing session
  if (!tokenHash && !hasExistingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))' }}>
            <img src="/logo.png" alt="MJA" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold">{isRecovery ? 'Cambiar contraseña' : 'Bienvenido/a a MJA CRM'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isRecovery ? 'Ingresá tu nueva contraseña.' : 'Completá tus datos para crear tu cuenta.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-lg p-6">
          {email && (
            <div>
              <label className="text-sm font-medium block mb-1.5">Email</label>
              <Input value={email} disabled className="bg-muted" />
            </div>
          )}

          {!isRecovery && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">Nombre <span className="text-red-500">*</span></label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" disabled={submitting} autoComplete="given-name" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Apellido</label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Pérez" disabled={submitting} autoComplete="family-name" />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5">Crear contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={submitting}
                className="pr-10"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Repetir contraseña <span className="text-red-500">*</span></label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repetí la contraseña"
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creando cuenta...' : 'Crear mi cuenta'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ¿Ya tenés cuenta? <button onClick={() => navigate('/login')} className="text-primary hover:underline">Iniciar sesión</button>
        </p>
      </div>
    </div>
  );
};

export default SetupAccount;
