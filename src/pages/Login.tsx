import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { logAuthEvent, categorizeAuthError, recordFailedAttempt, clearFailedAttempts, getLoginBlockSecondsLeft, MAX_LOGIN_ATTEMPTS } from '@/lib/auth-logger';

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#18181b',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  padding: '9px 13px', fontSize: 13.5, color: '#fafafa',
  outline: 'none', fontFamily: "'Geist', sans-serif",
  boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
};

const Login = () => {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);

  // Detect error params from expired/invalid invite links
  React.useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(search || hash.replace('#', '?'));
    const errorDesc = params.get('error_description') || params.get('error');
    if (errorDesc) {
      const isExpired = errorDesc.includes('expired') || errorDesc.includes('invalid');
      setError(isExpired
        ? 'El link de invitación expiró o es inválido. Pedile a tu admin que te envíe uno nuevo.'
        : errorDesc);
      logAuthEvent({
        action: 'expired_link_used',
        level: 'warning',
        error_message: errorDesc,
        error_code: isExpired ? 'expired_or_invalid_token' : 'link_error',
        context: { raw_error: errorDesc },
      });
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  if (session) return <Navigate to="/" replace />;

  const translateError = (msg: string) => {
    if (msg.includes('Invalid login credentials')) {
      return 'Email o contraseña incorrectos. Si recibiste una invitación y nunca creaste tu contraseña, hacé click en "Olvidé mi contraseña" abajo.';
    }
    if (msg.includes('Email not confirmed')) return 'Tu email no fue confirmado. Revisá tu bandeja de entrada.';
    if (msg.includes('User not found')) return 'No existe una cuenta con ese email.';
    if (msg.includes('rate limit') || msg.includes('too many requests')) return 'Demasiados intentos. Esperá unos minutos.';
    if (msg.includes('email rate limit')) return 'Límite de emails alcanzado. Intentá en unos minutos.';
    if (msg.includes('Token has expired') || msg.includes('token is expired')) return 'El link expiró. Pedí una nueva invitación a tu admin.';
    if (msg.includes('Network')) return 'Error de conexión. Verificá tu internet.';
    return msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Soft block: too many failed attempts in the last 10 min for this email.
    // Tell the user how long until they can try again rather than just
    // returning a generic "wrong password" which would encourage them to
    // keep guessing. Also logs once so we can see brute-force attempts
    // in the auth dashboard even if Supabase's server-side rate limit
    // hasn't kicked in yet.
    const blockSeconds = getLoginBlockSecondsLeft(email);
    if (blockSeconds > 0) {
      const mins = Math.ceil(blockSeconds / 60);
      setError(`Demasiados intentos fallidos para esta cuenta. Esperá ${mins} ${mins === 1 ? 'minuto' : 'minutos'} antes de volver a intentar.`);
      logAuthEvent({
        action: 'login_blocked_client',
        level: 'warning',
        user_email: email,
        context: {
          block_seconds_left: blockSeconds,
          max_attempts: MAX_LOGIN_ATTEMPTS,
          note: 'Client-side soft block: max attempts hit within 10-min window',
        },
      });
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(translateError(error.message));
      const attempts = recordFailedAttempt(email);
      logAuthEvent({
        action: 'login_failed',
        level: attempts >= 5 ? 'error' : 'warning',
        user_email: email,
        error_message: error.message,
        error_code: categorizeAuthError(error.message),
        context: {
          failed_attempts_last_10min: attempts,
          brute_force_suspected: attempts >= 5,
          http_status: (error as any).status,
        },
      });
    } else {
      clearFailedAttempts(email);
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Ingresa tu correo electrónico.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/setup-account`,
    });
    if (error) {
      setError(translateError(error.message));
      logAuthEvent({
        action: 'reset_request_failed',
        level: 'warning',
        user_email: email,
        error_message: error.message,
        error_code: categorizeAuthError(error.message),
      });
    } else {
      setResetSent(true);
      logAuthEvent({
        action: 'reset_requested',
        level: 'info',
        user_email: email,
        context: { note: 'Supabase invalidates previous reset token automatically on new request' },
      });
    }
    setLoading(false);
  };

  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#FFC233';
    e.target.style.boxShadow = '0 0 0 3px rgba(255,194,51,0.15)';
  };

  const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.12)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#09090b',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(255,194,51,0.15) 0%, transparent 70%)',
          'radial-gradient(ellipse 40% 40% at 90% 80%, rgba(59,130,246,0.08) 0%, transparent 60%)',
        ].join(', '),
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', background: '#111113',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
        padding: '36px 40px', width: 380,
        boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(255,194,51,0.18)',
      }}>
        {/* Logo */}
        <div style={{
          width: 56, height: 56,
          margin: '0 auto 14px',
          filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))',
        }}>
          <img src="/logo.png" alt="MJA" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', textAlign: 'center', color: '#fafafa' }}>
          MJA CRM
        </div>
        <div style={{ fontSize: 13, color: '#a1a1aa', marginTop: 4, textAlign: 'center', marginBottom: 28 }}>
          {mode === 'login' ? 'Inicia sesión en tu cuenta' : 'Recuperar contraseña'}
        </div>

        {mode === 'forgot' && resetSent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13.5, color: '#4ade80', marginBottom: 16 }}>
              ✓ Te enviamos un email con el enlace para restablecer tu contraseña.
            </div>
            <button
              onClick={() => { setMode('login'); setResetSent(false); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#FFC233', cursor: 'pointer', fontSize: 13, fontFamily: "'Geist', sans-serif" }}
            >
              ← Volver al inicio de sesión
            </button>
          </div>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#a1a1aa', marginBottom: 6 }}>
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={inputStyle}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
            {error && (
              <div style={{ fontSize: 12.5, color: '#f43f5e', marginBottom: 12, textAlign: 'center' }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', marginTop: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px', borderRadius: 7, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(160deg, #FFE07A 0%, #FFC233 45%, #B8720A 100%)',
              color: '#1a0e00', border: 'none',
              boxShadow: '0 2px 10px rgba(255,194,51,0.4)',
              fontFamily: "'Geist', sans-serif",
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Geist', sans-serif" }}
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#a1a1aa', marginBottom: 6 }}>
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={inputStyle}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#a1a1aa', marginBottom: 6 }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={inputStyle}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
            <div style={{ textAlign: 'right', marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#FFC233', cursor: 'pointer', fontSize: 12, fontFamily: "'Geist', sans-serif" }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {error && (
              <div style={{ fontSize: 12.5, color: '#f43f5e', marginBottom: 12, textAlign: 'center' }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px', borderRadius: 7, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(160deg, #FFE07A 0%, #FFC233 45%, #B8720A 100%)',
              color: '#1a0e00', border: 'none',
              boxShadow: '0 2px 10px rgba(255,194,51,0.4)',
              fontFamily: "'Geist', sans-serif",
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
