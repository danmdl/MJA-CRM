"use client";
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';

export type BannerVariant = 'info' | 'warning' | 'critical';

interface AppBannerRow {
  id: number;
  enabled: boolean;
  message: string;
  variant: BannerVariant | null;
  updated_at: string;
}

// Per-user dismissal lives in localStorage keyed by the banner's updated_at
// timestamp. When an admin edits the message or variant, updated_at changes
// and every user sees the new banner again — they have to dismiss the new
// version explicitly. This stops a stale "dismissed" state from hiding a
// fresh announcement.
const DISMISS_KEY = (updatedAt: string) => `mja.appBanner.dismissed:${updatedAt}`;

// Style + icon for each variant. Tailwind classes are listed verbatim so
// the JIT compiler doesn't tree-shake them away.
const VARIANT_STYLES: Record<BannerVariant, {
  container: string;
  icon: typeof AlertTriangle;
  iconColor: string;
  dismissColor: string;
}> = {
  info: {
    container: 'bg-blue-500/15 border-blue-500/40 text-blue-100',
    icon: Info,
    iconColor: 'text-blue-400',
    dismissColor: 'text-blue-200/70 hover:text-blue-100',
  },
  warning: {
    container: 'bg-amber-500/15 border-amber-500/40 text-amber-100',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    dismissColor: 'text-amber-200/70 hover:text-amber-100',
  },
  critical: {
    container: 'bg-red-500/20 border-red-500/50 text-red-100',
    icon: AlertOctagon,
    iconColor: 'text-red-400',
    dismissColor: 'text-red-200/70 hover:text-red-100',
  },
};

export const AppBanner = () => {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  const { data: banner } = useQuery<AppBannerRow | null>({
    queryKey: ['app-banner'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_banner')
        .select('id, enabled, message, variant, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) {
        // Don't blow up the app if the table is unreachable — just hide
        // the banner. Maintenance UX shouldn't take the app down.
        return null;
      }
      return (data as AppBannerRow) || null;
    },
    // Authenticated-only read per RLS, so don't even attempt until logged in.
    enabled: !!session,
    // 30s feels right: short enough that a brand new banner appears
    // promptly for users already in the app, long enough not to hammer
    // PostgREST. The cached row is tiny so the cost is negligible.
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Reset the local dismissed flag whenever the banner content changes so
  // a refreshed announcement always re-appears.
  useEffect(() => {
    if (!banner) { setDismissed(false); return; }
    try {
      const stored = localStorage.getItem(DISMISS_KEY(banner.updated_at));
      setDismissed(stored === '1');
    } catch {
      setDismissed(false);
    }
  }, [banner?.updated_at, banner]);

  if (!banner?.enabled || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY(banner.updated_at), '1');
    } catch { /* ignore quota errors */ }
  };

  // Fall back to warning style for old rows that predate the variant
  // column (shouldn't happen post-migration but guards against typos).
  const variant: BannerVariant = (banner.variant && VARIANT_STYLES[banner.variant])
    ? banner.variant
    : 'warning';
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full border-b-2 ${style.container} shadow-md`}
    >
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 text-sm sm:text-base">
        <Icon className={`h-5 w-5 shrink-0 ${style.iconColor}`} />
        <p className="flex-1 leading-snug whitespace-pre-line text-center font-medium">
          {banner.message}
        </p>
        <button
          onClick={handleDismiss}
          className={`shrink-0 transition-colors ${style.dismissColor}`}
          aria-label="Cerrar anuncio"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AppBanner;
