import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

// __BUILD_ID__ is injected at build time by vite.config.ts. It's a string
// (the build's Date.now() at compile time) and is unique per deploy. The
// loaded JS bundle keeps this value in memory; the live HTML on the
// server has a DIFFERENT bundle with a DIFFERENT __BUILD_ID__. Comparing
// the two tells us when the tab is running stale code.
declare const __BUILD_ID__: string;

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min, conservative

/**
 * Polls the live index.html for the bundle hash that the server is
 * currently serving and compares it to the bundle hash this tab was
 * loaded with. When they diverge, we show a sticky toast asking the
 * user to reload — without it, a referente whose tab was opened before
 * a deploy can be stuck on yesterday's code indefinitely (which is
 * exactly the bug Dan saw: pre-pagination Semillero capping counts at
 * 1000 even though the deployed code paginates correctly).
 *
 * We extract the bundle hash from the script tag in index.html rather
 * than fetching a separate version endpoint:
 *   - It's the same source of truth Vercel rewrites point at.
 *   - It updates automatically on every deploy (Vite changes the hash).
 *   - No build-step changes, no extra file to publish.
 *
 * The check fires:
 *   - On mount (catches "tab opened yesterday, user just came back").
 *   - Every 5 minutes while the tab is open.
 *   - When the tab regains visibility after being hidden.
 */
export function useVersionCheck() {
  // Don't show the toast more than once per session — once the user
  // dismisses it, badgering them every 5 min is rude. They'll reload
  // when they're ready.
  const notifiedRef = useRef(false);
  // Cache the very first script src we see, so we have a baseline to
  // compare against on subsequent polls. We capture this on mount
  // instead of relying on __BUILD_ID__ alone because if multiple deploys
  // happen between our first check and a later one, we want to compare
  // "what we first saw" vs "what's there now", not "what we were
  // compiled with" vs "what's there now" — the latter would notify on
  // every deploy regardless of whether the user already reloaded.
  const baselineSrcRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchHtmlSrc = async (): Promise<string | null> => {
      try {
        // cache: no-store ensures we get the live HTML, not a cached
        // copy. The vercel.json header for index.html is no-cache, but
        // some browser/extension layers can still hold a stale copy.
        const res = await fetch('/index.html?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        const html = await res.text();
        // The Vite-built script tag looks like:
        //   <script type="module" crossorigin src="/assets/index-[HASH].js"></script>
        // We just want the src to compare. The first script tag with
        // /assets/index-...js is what we're after; we ignore other
        // chunks since the entry chunk's hash always changes when any
        // upstream chunk changes (Vite chains chunk hashes).
        const match = html.match(/<script[^>]+src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    };

    const check = async () => {
      if (cancelled || notifiedRef.current) return;
      const liveSrc = await fetchHtmlSrc();
      if (!liveSrc) return;
      if (baselineSrcRef.current === null) {
        baselineSrcRef.current = liveSrc;
        return;
      }
      if (liveSrc !== baselineSrcRef.current) {
        notifiedRef.current = true;
        toast('Hay una versión nueva disponible', {
          description: 'Tocá actualizar para ver los últimos cambios.',
          duration: Infinity,
          action: {
            label: 'Actualizar',
            onClick: () => {
              // Force a hard reload — simple location.reload() can serve
              // from bfcache on some browsers. Setting href to itself
              // with a cache-buster query is the most reliable way to
              // get a fresh full-page navigation.
              const url = new URL(window.location.href);
              url.searchParams.set('_v', String(Date.now()));
              window.location.href = url.toString();
            },
          },
        });
      }
    };

    // Fast-path: at boot, compare the entry chunk this tab is running
    // against the entry chunk in the live HTML. If they already differ
    // at mount, this tab is running stale code from a deploy that no
    // longer exists on the CDN — every lazy chunk it tries to fetch
    // is going to 404. Toast-and-wait is too gentle for that case
    // (the user can't navigate to anything until they manually reload).
    // Force a hard navigation with a cache-buster instead, immediately.
    const fastCheck = async () => {
      if (cancelled) return;
      const liveSrc = await fetchHtmlSrc();
      if (!liveSrc) return;
      // The bundle currently running embeds its own entry script tag in
      // the loaded document. Find it the same way fetchHtmlSrc does so
      // we're comparing like with like.
      const ownScripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
      const ownEntry = ownScripts
        .map(s => s.getAttribute('src') || '')
        .find(src => /^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(src));
      // Seed the baseline either way so the periodic poll doesn't re-fire.
      baselineSrcRef.current = liveSrc;
      if (ownEntry && ownEntry !== liveSrc) {
        // Stale tab. Hard navigate to /reset, which wipes service
        // workers + caches + localStorage and bounces to /login.
        // _v cache-buster guards against the SW serving a stale
        // /reset response too.
        notifiedRef.current = true;
        window.location.href = '/reset?_v=' + Date.now();
      }
    };
    const fastTimer = window.setTimeout(fastCheck, 50);

    // Slow-path: 3s after boot and every 5 min thereafter. This catches
    // deploys that happen WHILE the tab is open (entry chunk on the
    // server changes mid-session) — those still get the gentler toast.
    const initialTimer = window.setTimeout(check, 3000);
    const intervalTimer = window.setInterval(check, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(fastTimer);
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
