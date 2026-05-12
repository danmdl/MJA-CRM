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
import {
  AlertTriangle, Info, AlertOctagon, Save, Loader2, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { BannerVariant } from '@/components/AppBanner';

const ART_TZ = 'America/Argentina/Buenos_Aires';

interface BannerRow {
  id: number;
  enabled: boolean;
  message: string;
  variant: BannerVariant | null;
  updated_at: string;
  updated_by: string | null;
}

// Mirror of the variant styles in AppBanner so the live preview matches
// exactly what the user will see. Kept inline rather than imported to
// avoid coupling the admin page to the runtime banner implementation
// (and because the lists are short).
const VARIANT_OPTIONS: {
  key: BannerVariant;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
  container: string;
  iconColor: string;
}[] = [
  {
    key: 'info',
    label: 'Info',
    description: 'Anuncios neutros: nueva funcionalidad, recordatorios.',
    icon: Info,
    container: 'bg-blue-500/15 border-blue-500/40 text-blue-100',
    iconColor: 'text-blue-400',
  },
  {
    key: 'warning',
    label: 'Aviso',
    description: 'Mantenimiento programado, lentitud temporal, cosas que pueden fallar.',
    icon: AlertTriangle,
    container: 'bg-amber-500/15 border-amber-500/40 text-amber-100',
    iconColor: 'text-amber-400',
  },
  {
    key: 'critical',
    label: 'Crítico',
    description: 'Cosas urgentes: app caída, datos en riesgo, acción inmediata necesaria.',
    icon: AlertOctagon,
    container: 'bg-red-500/20 border-red-500/50 text-red-100',
    iconColor: 'text-red-400',
  },
];

const MantenimientoPage = () => {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: banner, isLoading } = useQuery<BannerRow | null>({
    queryKey: ['app-banner-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_banner')
        .select('id, enabled, message, variant, updated_at, updated_by')
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
  const [variant, setVariant] = useState<BannerVariant>('warning');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (banner) {
      setEnabled(banner.enabled);
      setMessage(banner.message);
      setVariant((banner.variant as BannerVariant) || 'warning');
    }
  }, [banner?.id, banner?.updated_at, banner]);

  const hasUnsavedChanges = banner
    ? (banner.enabled !== enabled
        || banner.message !== message
        || (banner.variant || 'warning') !== variant)
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
        variant,
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

  const selectedVariant = VARIANT_OPTIONS.find(v => v.key === variant)!;
  const PreviewIcon = selectedVariant.icon;

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
            mensaje o el tipo, el cartel aparece de nuevo para todos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              {/* Enable / disable */}
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

              {/* Variant picker */}
              <div className="space-y-2">
                <Label>Tipo de anuncio</Label>
                <p className="text-xs text-muted-foreground">
                  Define el color y el ícono. Elegí según la gravedad del aviso.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                  {VARIANT_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const selected = variant === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setVariant(opt.key)}
                        className={`text-left rounded-md border p-3 transition-colors ${
                          selected
                            ? `${opt.container} border-current ring-2 ring-current/30`
                            : 'border-border hover:border-foreground/30 bg-card text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 ${selected ? opt.iconColor : 'text-muted-foreground'}`} />
                          <span className="font-medium text-sm">{opt.label}</span>
                        </div>
                        <p className={`text-xs ${selected ? '' : 'text-muted-foreground'}`}>
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
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

              {/* Live preview — replicates the real banner exactly */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className={`rounded-md border-b-2 ${selectedVariant.container} shadow-md`}>
                  <div className="px-4 sm:px-6 py-3 flex items-center gap-3 text-sm sm:text-base">
                    <PreviewIcon className={`h-5 w-5 shrink-0 ${selectedVariant.iconColor}`} />
                    <p className="flex-1 leading-snug whitespace-pre-line text-center font-medium">
                      {message || <span className="italic opacity-50">El mensaje aparece acá</span>}
                    </p>
                    <X className={`h-4 w-4 shrink-0 ${selectedVariant.iconColor} opacity-50`} />
                  </div>
                </div>
              </div>

              {/* Footer */}
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
