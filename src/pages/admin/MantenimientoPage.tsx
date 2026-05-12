"use client";
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/utils/toast';
import { AlertTriangle, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const ART_TZ = 'America/Argentina/Buenos_Aires';

interface BannerRow {
  id: number;
  enabled: boolean;
  message: string;
  updated_at: string;
  updated_by: string | null;
}

const MantenimientoPage = () => {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: banner, isLoading } = useQuery<BannerRow | null>({
    queryKey: ['app-banner-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_banner')
        .select('id, enabled, message, updated_at, updated_by')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data as BannerRow) || null;
    },
  });

  // Editable copies kept in local state so the admin can draft changes
  // before saving. Initialized from the fetched row when it arrives.
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (banner) {
      setEnabled(banner.enabled);
      setMessage(banner.message);
    }
  }, [banner?.id, banner?.updated_at, banner]);

  const hasUnsavedChanges = banner
    ? (banner.enabled !== enabled || banner.message !== message)
    : false;

  const handleSave = async () => {
    if (!session?.user?.id) {
      showError('Sesión no válida.');
      return;
    }
    if (!message.trim()) {
      showError('El mensaje no puede estar vacío.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('app_banner')
      .update({
        enabled,
        message: message.trim(),
        updated_at: new Date().toISOString(),
        updated_by: session.user.id,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) {
      showError(`No se pudo guardar: ${error.message}`);
      return;
    }
    showSuccess('Mensaje de mantenimiento actualizado.');
    // Refresh BOTH the admin form's query and the live banner's query so
    // the change shows up across the app immediately.
    queryClient.invalidateQueries({ queryKey: ['app-banner-admin'] });
    queryClient.invalidateQueries({ queryKey: ['app-banner'] });
  };

  const lastUpdated = banner?.updated_at
    ? format(toZonedTime(new Date(banner.updated_at), ART_TZ), "dd/MM/yyyy 'a las' HH:mm")
    : '—';

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <h1 className="text-2xl font-bold">Mantenimiento</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anuncio global</CardTitle>
          <CardDescription>
            Mostrá un cartel visible en todas las páginas del admin. Útil para
            avisar de mantenimientos programados, bugs conocidos o cambios
            recientes. Cada usuario puede descartarlo, pero si edita este
            mensaje, el cartel aparece de nuevo para todos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="banner-toggle" className="text-base">
                    Mostrar anuncio
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cuando está activado, todos los usuarios autenticados ven el cartel.
                  </p>
                </div>
                <Button
                  id="banner-toggle"
                  variant={enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEnabled(v => !v)}
                  className={enabled ? 'bg-amber-500 hover:bg-amber-600 text-black' : ''}
                >
                  {enabled ? 'Activado' : 'Desactivado'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="banner-message">Mensaje</Label>
                <Textarea
                  id="banner-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Ej: Mantenimiento programado el sábado a las 02:00."
                />
                <p className="text-xs text-muted-foreground">
                  Texto plano. Los saltos de línea se respetan.
                </p>
              </div>

              <div className="rounded-md border bg-amber-500/15 border-amber-500/40 p-3">
                <p className="text-xs text-amber-200/70 mb-1">Vista previa</p>
                <div className="flex items-start gap-2 text-sm text-amber-100">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  <p className="whitespace-pre-line">
                    {message || <span className="italic opacity-50">El mensaje aparece acá</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Última actualización: {lastUpdated}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges || !message.trim()}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MantenimientoPage;
