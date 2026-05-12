// Profile-page card for managing 2FA.
//
// Three states it renders:
//   - No TOTP factor yet: "Activar 2FA" button → opens enroll dialog
//   - TOTP factor verified: shows enrolled status + a "Desactivar" button
//   - Either case: a list of trusted devices with revoke buttons
//
// The enroll dialog is the same flow as MfaGate's forced enroll, just
// invoked voluntarily here. Trust persistence is identical: after
// verifying a fresh enroll, the current device is added to
// trusted_devices so the user isn't prompted again on this browser.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { showError, showSuccess } from '@/utils/toast';
import { markCurrentDeviceTrusted, getOrCreateDeviceId, sha256Hex } from '@/lib/trusted-devices';

interface TrustedDeviceRow {
  id: string;
  device_name: string | null;
  last_seen_at: string;
  created_at: string;
  device_id_hash: string;
}

const MfaSettingsCard: React.FC = () => {
  const { session } = useSession();
  const [hasFactor, setHasFactor] = useState<boolean | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [devices, setDevices] = useState<TrustedDeviceRow[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState<string | null>(null);

  const refresh = async () => {
    if (!session?.user?.id) return;
    try {
      const [{ data: factors }, { data: rows }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.from('trusted_devices').select('*').eq('user_id', session.user.id).order('last_seen_at', { ascending: false }),
      ]);
      const verified = factors?.totp?.find((f: any) => f.status === 'verified');
      setHasFactor(!!verified);
      setFactorId(verified?.id ?? null);
      setDevices((rows as any) || []);
      const hash = await sha256Hex(getOrCreateDeviceId());
      setCurrentHash(hash);
    } catch (err: any) {
      console.error('[MfaSettingsCard] refresh failed', err);
    }
  };

  useEffect(() => { refresh(); }, [session?.user?.id]);

  const disableFactor = async () => {
    if (!factorId) return;
    if (!confirm('¿Desactivar 2FA? Si tu rol es admin o general, lo vas a tener que volver a activar la próxima vez que entres.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { showError(error.message); return; }
    showSuccess('2FA desactivado.');
    refresh();
  };

  const revokeDevice = async (id: string) => {
    if (!confirm('¿Revocar este dispositivo? La próxima vez que se use va a pedir el código de 2FA.')) return;
    const { error } = await supabase.from('trusted_devices').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    showSuccess('Dispositivo revocado.');
    refresh();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Verificación de dos pasos (2FA)</CardTitle>
          <CardDescription>
            {hasFactor === null
              ? 'Cargando...'
              : hasFactor
                ? 'Tu cuenta está protegida con un código de 6 dígitos que cambia cada 30 segundos. Solo te pide el código cuando entrás desde un dispositivo nuevo.'
                : 'Agregá una capa extra de seguridad a tu cuenta usando una app autenticadora (Google Authenticator, Authy, 1Password).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasFactor && devices.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Dispositivos confiados</h4>
              <ul className="space-y-2">
                {devices.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 p-2 border rounded">
                    <div className="text-sm">
                      <div className="font-medium">
                        {d.device_name || 'Dispositivo desconocido'}
                        {currentHash && d.device_id_hash === currentHash && (
                          <span className="ml-2 text-xs text-primary">(este)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Último uso: {new Date(d.last_seen_at).toLocaleString('es-AR')}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revokeDevice(d.id)}>
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          {!hasFactor && (
            <Button onClick={() => setEnrollOpen(true)} disabled={hasFactor === null}>
              Activar 2FA
            </Button>
          )}
          {hasFactor && (
            <Button variant="outline" onClick={disableFactor}>
              Desactivar 2FA
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activar 2FA</DialogTitle>
            <DialogDescription>
              Escaneá el QR con Google Authenticator, Authy o 1Password e ingresá el código de 6 dígitos.
            </DialogDescription>
          </DialogHeader>
          <EnrollInline onSuccess={async () => {
            if (session?.user?.id) await markCurrentDeviceTrusted(session.user.id);
            setEnrollOpen(false);
            refresh();
            showSuccess('2FA activado. Este dispositivo queda confiado.');
          }} />
        </DialogContent>
      </Dialog>
    </>
  );
};

// Inlined version of the enroll flow used inside the dialog. Mirrors
// MfaGate's EnrollView but without the canDismiss footer (dialog has
// its own close button) and without the full-screen wrapper.
const EnrollInline: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const unverified = factors?.all?.find((f: any) => f.status === 'unverified' && f.factor_type === 'totp');
        if (unverified) await supabase.auth.mfa.unenroll({ factorId: unverified.id });
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
      if (verErr) { showError('Código incorrecto. Probá de nuevo.'); setLoading(false); return; }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {initError && <p className="text-destructive text-sm">{initError}</p>}
      {qrSvg && (
        <div className="flex justify-center bg-white p-4 rounded">
          <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>
      )}
      {secret && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">¿No podés escanear el QR?</summary>
          <p className="mt-2">Ingresá este código manualmente: <code className="font-mono">{secret}</code></p>
        </details>
      )}
      <form onSubmit={submit} className="space-y-3">
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
          {loading ? 'Verificando...' : 'Verificar y activar'}
        </Button>
      </form>
    </div>
  );
};

export default MfaSettingsCard;
