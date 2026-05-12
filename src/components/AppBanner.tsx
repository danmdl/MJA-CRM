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
  resurface_minutes: number | null;
  updated_at: string;
}

// Per-user dismissal lives in localStorage keyed by the banner's updated_at
// timestamp. The stored value is the ISO timestamp of WHEN the user
// dismissed, so we can resurface the banner after `resurface_minutes`.
// When an admin edits the message/variant/interval, updated_at changes,
// the key changes too, and every user sees the new banner — even if they
// had a permanent dismiss on the previous version.
const DISMISS_KEY = (updatedAt: string) => `mja.appBanner.dismissed:${updatedAt}`;

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

// Decide whether a stored dismissal is still in force given the current
// resurface window. Returns true when the banner should STAY hidden.
const isDismissalActive = (
  dismissedAtIso: string | null,
  resurfaceMinutes: number,
): boolean => {
  if (!dismissedAtIso) return false;
  if (resurfaceMinutes <= 0) return true; // 0 = permanent dismiss
  const dismissedAt = new Date(dismissedAtIso).getTime();
  if (Number.isNaN(dismissedAt)) return false;
  const elapsedMs = Date.now() - dismissedAt;
  return elapsedMs < resurfaceMinutes * 60_000;
};

export const AppBanner = () => {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState(false);
  // Tick state used purely to force a re-evaluation of the dismissal
  // window every minute, so a banner with a 15-minute resurface
  // interval actually re-appears at minute 15 without the user
  // having to refresh the page.
  const [tick, setTick] = useState(0);

  const { data: banner } = useQuery<AppBannerRow | null>({
    queryKey: ['app-banner'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_banner')
        .select('id, enabled, message, variant, resurface_minutes, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) return null;
      return (data as AppBannerRow) || null;
    },
    enabled: !!session,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Re-check the dismissal window every minute. Cheap timer; cleared
  // on unmount.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Refresh the local dismissed flag whenever the banner changes OR the
  // tick elapses. Reading from localStorage is fast.
  useEffect(() => {
    if (!banner) { setDismissed(false); return; }
    let storedAt: string | null = null;
    try {
      storedAt = localStorage.getItem(DISMISS_KEY(banner.updated_at));
    } catch { /* private browsing / quota — treat as not dismissed */ }
    setDismissed(isDismissalActive(storedAt, banner.resurface_minutes ?? 0));
  }, [banner?.updated_at, banner?.resurface_minutes, tick, banner]);

  if (!banner?.enabled || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      // Store the timestamp of dismissal so we can resurface later.
      localStorage.setItem(DISMISS_KEY(banner.updated_at), new Date().toISOString());
    } catch { /* ignore quota errors */ }
  };

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
