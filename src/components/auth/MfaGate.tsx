// Modal overlay that decides whether to challenge the current user for
// MFA after they log in.
//
// Decision tree (runs every time SessionProvider produces a user):
//   1. No session → don't render anything (Login screen handles itself).
//   2. Session exists, but Supabase reports MFA assurance is already
//      AAL2 → done, render children.
//   3. Session is AAL1 + user has a TOTP factor:
//        - If this browser is in trusted_devices for the user → skip
//          the challenge, refresh last_seen, render children.
//        - Else if the current IP's geolocation (country + region or
//          city) matches the location of ANY of the user's trusted
//          devices → soft-trust this browser too: mark it as
//          trusted using the existing TOTP enrollment and render
//          children. The user already proved both factors from this
//          region on another device.
//        - Otherwise → show ChallengeView; on verify success, mark
//          the device trusted and render children.
//   4. Session is AAL1 + user has NO TOTP factor:
//        - Admin/general roles → force enrollment (EnrollView, can't
//          dismiss). Most-privileged accounts should not be allowed
//          to skip 2FA.
//        - Other roles → optional. Render children; the user can opt
//          in later from Profile → Seguridad.
//
// IMPORTANT: this component must not gate the /reset or /login routes,
// which are responsible for getting the user OUT of a broken session.
// AdminLayout is where it goes — that's the gated area.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import {
  isCurrentDeviceTrusted,
  isCurrentLocationTrusted,
  markCurrentDeviceTrusted,
  touchCurrentDevice,
} from '@/lib/trusted-devices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showError, showSuccess } from '@/utils/toast';

type Phase =
  | 'checking'        // initial probe of factors + assurance level
  | 'ok'              // no MFA needed (or already AAL2)
  | 'challenge'       // user has TOTP enrolled, show code prompt
  | 'enroll-forced'   // admin/general without TOTP, mandatory enroll
  | 'enroll-optional' // other roles, optional enroll (we just pass through)
  ;

const FORCED_ROLES = new Set(['admin', 'general']);

interface ChallengeProps {
  factorId: string;
  userId: string;
  onSuccess: () => void;
}

const ChallengeView: React.FC<ChallengeProps> = ({ factorId, userId, onSuccess }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chalErr || !chal) { showError(chalErr?.message || 'Error iniciando MFA'); setLoading(false); return; }
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: chal.id,
        code,
      });
      if (verErr) {
        showError('Código incorrecto. Probá de nuevo.');
        setLoading(false);
        return;
      }
      await markCurrentDeviceTrusted(userId);
      showSuccess('Verificación exitosa. Este dispositivo queda confiado.');
      onSuccess();
    } catch (err: any) {
      showError(err?.message || 'Error verificando código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verificación de dos pasos</CardTitle>
          <CardDescription>
            Estás iniciando sesión desde un dispositivo nuevo. Ingresá el
            código de 6 dígitos de tu app autenticadora (Google Authenticator,
            Authy, 1Password, etc).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loading}
              className="text-center tracking-[0.5em] text-2xl"
            />
            <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
              {loading ? 'Verificando...' : 'Verificar'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Después de verificar, este dispositivo queda recordado y no
              te lo va a volver a pedir hasta que limpies los datos del navegador.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

interface EnrollProps {
  userId: string;
  onSuccess: () => void;
  canDismiss: boolean;
}

const EnrollView: React.FC<EnrollProps> = ({ userId, onSuccess, canDismiss }) => {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clean up any half-enrolled unverified factor leftover from a
      // previous attempt before starting a fresh one — Supabase rejects
      // a second enroll() while one is pending.
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const unverified = factors?.all?.find((f: any) => f.status === 'unverified' && f.factor_type === 'totp');
        if (unverified) {
          await supabase.auth.mfa.unenroll({ factorId: unverified.id });
        }
      } catch { /* swallow */ }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MJA CRM' });
      if (cancelled) return;
      if (error || !data) { setInitError(error?.message || 'No se pudo inicializar 2FA'); return; }
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setLoading(true);
    try {
      const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chalErr || !chal) { showError(chalErr?.message || 'Error iniciando MFA'); setLoading(false); return; }
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: chal.id,
        code,
      });
      if (verErr) {
        showError('Código incorrecto. Verificá la hora del teléfono y probá de nuevo.');
        setLoading(false);
        return;
      }
      await markCurrentDeviceTrusted(userId);
      showSuccess('2FA activado. Este dispositivo queda confiado.');
      onSuccess();
    } catch (err: any) {
      showError(err?.message || 'Error verificando código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activá la verificación de dos pasos</CardTitle>
          <CardDescription>
            Tu cuenta tiene permisos sensibles. Para protegerla, necesitamos
            activar 2FA una vez. Escaneá el código QR con Google Authenticator,
            Authy o 1Password e ingresá el código de 6 dígitos que muestre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initError && <p className="text-destructive text-sm">{initError}</p>}
          {qrSvg && (
            <div className="flex justify-center bg-white p-4 rounded">
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>
          )}
          {secret && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">¿No podés escanear el QR?</summary>
              <p className="mt-2">Ingresá este código manualmente en tu app: <code className="font-mono">{secret}</code></p>
            </details>
          )}
          <form onSubmit={submit} className="space-y-4">
            <Input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loading || !factorId}
              className="text-center tracking-[0.5em] text-2xl"
            />
            <Button type="submit" disabled={loading || !factorId || code.length !== 6} className="w-full">
              {loading ? 'Verificando...' : 'Activar 2FA'}
            </Button>
            {canDismiss && (
              <Button
                type="button"
                variant="ghost"
                onClick={onSuccess}
                className="w-full"
                disabled={loading}
              >
                Ahora no
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export const MfaGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, profile } = useSession();
  const [phase, setPhase] = useState<Phase>('checking');
  const [factorId, setFactorId] = useState<string | null>(null);

  // Re-run the decision tree whenever the session or user role changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user?.id) { setPhase('ok'); return; }
      const userId = session.user.id;
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
        if (aal?.currentLevel === 'aal2') {
          // Already MFA-verified for this session. Refresh device touch
          // so the Trusted Devices list shows a recent date.
          touchCurrentDevice(userId);
          setPhase('ok');
          return;
        }

        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        const verifiedTotp = factors?.totp?.find((f: any) => f.status === 'verified');

        if (verifiedTotp) {
          // User has TOTP enrolled. Skip the challenge if EITHER of:
          //   - device-trust matches (this exact browser was verified
          //     before), or
          //   - location-trust matches (any of the user's trusted
          //     devices was last seen in the same country + region as
          //     the current IP — see isCurrentLocationTrusted).
          // Both checks run in parallel so a hot reload doesn't pay
          // the latency of two sequential round-trips. Either passing
          // is enough to skip MFA. If the device is trusted we also
          // refresh its row (last_seen + location). If only the
          // location was trusted, we still register THIS browser as a
          // new trusted device so the next visit doesn't depend on
          // the geolocator being reachable.
          const [trustedDevice, trustedLocation] = await Promise.all([
            isCurrentDeviceTrusted(userId),
            isCurrentLocationTrusted(userId),
          ]);
          if (cancelled) return;
          if (trustedDevice) {
            touchCurrentDevice(userId);
            setPhase('ok');
            return;
          }
          if (trustedLocation) {
            // Same region as an already-verified device — soft-trust
            // this new browser by writing it into trusted_devices,
            // then continue.
            markCurrentDeviceTrusted(userId);
            setPhase('ok');
            return;
          }
          setFactorId(verifiedTotp.id);
          setPhase('challenge');
          return;
        }

        // No TOTP enrolled. Force for admin/general; optional for others.
        const role = (profile as any)?.role;
        if (role && FORCED_ROLES.has(role)) {
          setPhase('enroll-forced');
        } else {
          setPhase('ok'); // optional — user can enable from Profile later
        }
      } catch (probeError) {
        // Fail-OPEN was the previous behavior, but that combined with
        // location-trust meant an attacker with stolen password + a VPN
        // exit node in the user's region could skip MFA entirely whenever
        // the probe hit a transient failure (which the catch swallowed).
        // Fail-CLOSED for users who have MFA enrolled: surface the
        // challenge so they have to prove their second factor. Only
        // fail-open for users with no factor — no second factor to
        // demand — and even there we log loudly so the operator sees
        // the probe failures.
        console.error('[MfaGate] probe failed', probeError);
        if (cancelled) return;
        try {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const verifiedTotp = factors?.totp?.find((f: any) => f.status === 'verified');
          if (verifiedTotp) {
            // Force the challenge — never let a probe failure bypass MFA
            // for a user who has set it up.
            setFactorId(verifiedTotp.id);
            setPhase('challenge');
            return;
          }
        } catch (e2) {
          // Even listFactors failed — at this point we genuinely can't
          // tell whether MFA is required. Choose to render children
          // (consistent with prior behavior) but log the double-failure
          // for ops.
          console.error('[MfaGate] listFactors fallback also failed', e2);
        }
        setPhase('ok');
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, (profile as any)?.role]);

  if (!session?.user?.id || phase === 'ok') return <>{children}</>;
  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (phase === 'challenge' && factorId) {
    return <ChallengeView factorId={factorId} userId={session.user.id} onSuccess={() => setPhase('ok')} />;
  }
  if (phase === 'enroll-forced') {
    return <EnrollView userId={session.user.id} onSuccess={() => setPhase('ok')} canDismiss={false} />;
  }
  return <>{children}</>;
};
