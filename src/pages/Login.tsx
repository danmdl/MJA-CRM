import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';

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

  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
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
          Inicia sesión en tu cuenta
        </div>

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

          <div style={{ marginBottom: 14 }}>
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

          {error && (
            <div style={{ fontSize: 12.5, color: '#f43f5e', marginBottom: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', marginTop: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px', borderRadius: 7, fontSize: 14, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              background: '#FFC233', color: 'white', border: 'none',
              boxShadow: '0 0 14px rgba(255,194,51,0.35)',
              fontFamily: "'Geist', sans-serif",
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
