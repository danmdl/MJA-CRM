"use client";
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { AlertTriangle, X } from 'lucide-react';

interface AppBannerRow {
  id: number;
  enabled: boolean;
  message: string;
  updated_at: string;
}

// Per-user dismissal lives in localStorage keyed by the banner's updated_at
// timestamp. When an admin edits the message, updated_at changes and every
// user sees the new banner again — they have to dismiss the new version
// explicitly. This stops a stale "dismissed" state from hiding a fresh
// announcement.
const DISMISS_KEY = (updatedAt: string) => `mja.appBanner.dismissed:${updatedAt}`;

export const AppBanner = () => {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  const { data: banner } = useQuery<AppBannerRow | null>({
    queryKey: ['app-banner'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_banner')
        .select('id, enabled, message, updated_at')
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-100"
    >
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-start gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
        <p className="flex-1 leading-snug whitespace-pre-line">{banner.message}</p>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-amber-200/70 hover:text-amber-100 transition-colors"
          aria-label="Cerrar anuncio"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AppBanner;
