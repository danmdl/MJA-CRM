"use client";
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

const SetupAccount = () => {
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      // Read token from URL — Supabase invite links have either:
      // - hash: #access_token=xxx&type=invite (legacy)
      // - search: ?token_hash=xxx&type=invite (new) or ?code=xxx (PKCE)
      const hash = window.location.hash;
      const search = window.location.search;
      const hashParams = new URLSearchParams(hash.replace('#', ''));
      const searchParams = new URLSearchParams(search);

      // Try PKCE flow first (most common with current Supabase)
      const code = searchParams.get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setVerifyError('El link de invitación expiró o es inválido. Pedile a tu admin que te envíe uno nuevo.');
          setVerifying(false);
          return;
        }
        if (data.user) {
          setEmail(data.user.email || '');
          // Pre-fill names from user_metadata if available (set during invite)
          const meta = data.user.user_metadata || {};
          if (meta.first_name) setFirstName(meta.first_name);
          if (meta.last_name) setLastName(meta.last_name);
        }
        setVerifying(false);
        return;
      }

      // Try token_hash flow (newer email templates)
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const type = searchParams.get('type') || hashParams.get('type');
      if (tokenHash && (type === 'invite' || type === 'signup' || type === 'recovery')) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
        if (error) {
          setVerifyError('El link de invitación expiró o es inválido. Pedile a tu admin que te envíe uno nuevo.');
          setVerifying(false);
          return;
        }
        if (data.user) {
          setEmail(data.user.email || '');
          const meta = data.user.user_metadata || {};
          if (meta.first_name) setFirstName(meta.first_name);
          if (meta.last_name) setLastName(meta.last_name);
        }
        setVerifying(false);
        return;
      }

      // Try legacy hash flow (#access_token=xxx)
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          setVerifyError('El link de invitación expiró o es inválido. Pedile a tu admin que te envíe uno nuevo.');
          setVerifying(false);
          return;
        }
        if (data.user) {
          setEmail(data.user.email || '');
          const meta = data.user.user_metadata || {};
          if (meta.first_name) setFirstName(meta.first_name);
          if (meta.last_name) setLastName(meta.last_name);
        }
        setVerifying(false);
        return;
      }

      // No token in URL — check if there's already a session (came back via existing session)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setEmail(session.user.email || '');
        const meta = session.user.user_metadata || {};
        if (meta.first_name) setFirstName(meta.first_name);
        if (meta.last_name) setLastName(meta.last_name);
        setVerifying(false);
        return;
      }

      // Nothing — invalid URL
      setVerifyError('Link inválido. Pedile a tu admin que te envíe una nueva invitación.');
      setVerifying(false);
    };
    verify();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!firstName.trim()) { setError('Ingresá tu nombre.'); return; }
    setSubmitting(true);
    try {
      // Set the password
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) { setError(pwError.message); setSubmitting(false); return; }
      // Update profile with name + mark as completed
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase.from('profiles').update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          profile_completed: true,
        }).eq('id', user.id);
        if (profileError) { setError(profileError.message); setSubmitting(false); return; }
      }
      // Done — redirect to app
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error inesperado.');
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verificando invitación...</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))' }}>
            <img src="/logo.png" alt="MJA" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold">Bienvenido/a a MJA CRM</h1>
          <p className="text-muted-foreground text-sm mt-1">Completá tus datos para crear tu cuenta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-lg p-6">
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <Input value={email} disabled className="bg-muted" />
          </div>

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
