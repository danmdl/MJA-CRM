// Tiny Sentry client for Supabase Edge Functions.
//
// Why not @sentry/deno? Pulling that into every edge function adds
// ~40 KB of cold-start bundle and a runtime fetch to esm.sh per cold
// boot. The Sentry HTTP envelope format is small enough to send
// directly — this helper is ~100 LOC and has zero dependencies.
//
// Configure with the SENTRY_DSN env var (Supabase Dashboard >
// Edge Functions > Secrets). When unset, captureException is a
// no-op so functions still run in environments without Sentry
// (local dev, branches without the secret set).

const DSN = Deno.env.get('SENTRY_DSN') || '';
const RELEASE = Deno.env.get('SENTRY_RELEASE') || 'unknown';
const ENV = Deno.env.get('SENTRY_ENV') || 'production';

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

const parsed: ParsedDsn | null = (() => {
  if (!DSN) return null;
  try {
    const url = new URL(DSN);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    const host = url.host;
    return {
      envelopeUrl: `${url.protocol}//${host}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
})();

export interface SentryContext {
  /** Which edge function. Required so Sentry's issue grouping is sane. */
  fn: string;
  /** Free-form extra tags — request path, user_id (NEVER email), etc. */
  tags?: Record<string, string>;
  /** Free-form extra data — request body shape, etc. NEVER PII. */
  extra?: Record<string, unknown>;
}

/**
 * Fire-and-forget exception capture. Returns a Promise but callers
 * should NOT await it — Sentry being slow shouldn't slow the response.
 *
 * Safe to call even when SENTRY_DSN isn't configured — it just
 * console.errors and returns.
 */
export const captureException = (err: unknown, ctx: SentryContext): Promise<void> => {
  // Always log to function logs so the operator has SOMETHING even
  // when Sentry is missing or fails to ingest.
  console.error(`[${ctx.fn}]`, err, ctx.tags ?? {});

  if (!parsed) return Promise.resolve();

  const message = err instanceof Error ? err.message : String(err);
  const stacktrace = err instanceof Error && err.stack
    ? err.stack.split('\n').slice(1).map(line => ({ filename: line.trim() }))
    : [];

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    sdk: { name: 'mja.edge-fn.minimal', version: '1.0.0' },
    release: RELEASE,
    environment: ENV,
    server_name: ctx.fn,
    tags: { fn: ctx.fn, ...(ctx.tags || {}) },
    extra: ctx.extra,
    exception: {
      values: [{
        type: err instanceof Error ? err.name : 'Error',
        value: message,
        stacktrace: { frames: stacktrace },
      }],
    },
  };

  const envelope =
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }) + '\n' +
    JSON.stringify({ type: 'event' }) + '\n' +
    JSON.stringify(event) + '\n';

  return fetch(parsed.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': [
        'Sentry sentry_version=7',
        `sentry_key=${parsed.publicKey}`,
        'sentry_client=mja.edge-fn.minimal/1.0.0',
      ].join(', '),
    },
    body: envelope,
  })
    .then(() => undefined)
    .catch((err2) => {
      // Suppress: we already console.errored the original. Logging the
      // Sentry-side failure would risk an infinite loop if Sentry is
      // also where stdout goes.
      console.warn(`[sentry] envelope POST failed: ${err2}`);
    });
};

/**
 * Wrap a Deno.serve handler so any thrown error gets captured AND
 * returns a 500. Use when your handler's existing catch is just
 * logging + a generic 500 — replace it with this.
 */
export const withSentry = (
  fn: string,
  handler: (req: Request) => Promise<Response>,
): ((req: Request) => Promise<Response>) => {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      captureException(err, { fn, tags: { method: req.method, path: new URL(req.url).pathname } });
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};
