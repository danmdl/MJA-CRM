# MJA CRM — Architecture cheat sheet

Living doc. Update when something here stops being true. Aimed at a dev or AI
agent who needs to orient quickly without reading the whole codebase.

## Stack

- **Frontend**: React 18 + Vite + TypeScript, shadcn/ui on top of Radix.
  Routing via react-router. Server state via TanStack Query. Client state
  is plain `useState` plus a `SessionProvider` context for the auth
  profile.
- **Backend**: Supabase (Postgres + PostgREST + Auth + Storage + Edge
  Functions). The frontend talks to PostgREST directly, authenticated
  by the JWT issued by Supabase Auth. Most authorization lives in
  Row Level Security policies, not application code.
- **Deploy**: Vercel auto-deploys `main` on every push. There is no
  staging environment — local `pnpm preview` is the closest thing.
- **Error reporting**: Sentry (minimal init), dynamically imported from
  `main.tsx` so it lands in its own chunk. `client_logs` table also
  receives in-app errors via `auth-logger.ts` for an in-product audit.

## Core data model

```
churches ── zonas ── barrios
   │           │
   │           └── cuerdas (territorial groups, can have a PostGIS polygon)
   │                  │
   │                  └── cells (small groups / "células", attached to a cuerda)
   │
   ├── profiles (users with a role + church_id + optional numero_cuerda)
   └── contacts (the seed pool — every person being followed up)
```

`contacts` is the hot table (8.9K rows today, target ~500K). Most pages
revolve around querying, filtering and assigning contacts.

`activity_logs` records who did what (login, create, update, delete,
assign). `client_logs` records errors and auth events from the browser.
Together they're the audit trail used by Logs and Historial pages.

## Role hierarchy (lowest → highest privilege)

```
anfitrion → conector → consolidador → encargado_de_celula → referente →
supervisor → pastor → general → admin
```

Defined in `src/lib/permissions.ts`. Granular boolean flags live in the
`permissions` table, one row per role, consumed via `usePermissions()`.
Always gate UI on the hook, not on raw role checks, so admins can
toggle features for whole roles from the Permissions dashboard.

## Folder map (only the bits that matter)

```
src/
  pages/
    admin/
      churches/[churchId]/         <- per-church admin section
        SemilleroPage.tsx          <- THE hot page (~3K LOC even after splits)
        semillero/                 <- extracted sub-components from Semillero
        TerritoriosPage.tsx        <- Google Maps + cuerda polygon editor
        ProcesosPage.tsx           <- pipeline / Kanban for contacts
        ...
      LogsPage.tsx                 <- global activity + errors feed
  components/
    admin/                          <- domain components (lots of dialogs)
    ui/                             <- shadcn primitives
    layout/                         <- Sidebar + ChurchDetailsLayout
  lib/
    permissions.ts                  <- usePermissions hook + role hierarchy
    territory-utils.ts              <- geo helpers (point-in-polygon, etc)
    phone-validation.ts             <- Argentine phone normalizer
    pagination.ts                   <- shared "fetch all pages past 1k" helper
    google-maps.ts                  <- single source of truth for Google Maps load
  hooks/
    use-session.tsx                 <- SessionContext (session + profile)
    use-outbox-reminder.ts          <- daily toast for pending external sends
  integrations/supabase/client.ts   <- supabase-js client singleton
  components/SessionProvider.tsx    <- top-level auth boot
supabase/
  functions/                        <- edge functions (Deno)
  migrations/                       <- empty for now; migrations live in
                                       Supabase MCP. See "Schema migrations"
```

## How requests authenticate

1. User logs in via `Login.tsx` → Supabase Auth issues a JWT.
2. The JWT is stored in localStorage by supabase-js.
3. `SessionProvider` listens for auth state and exposes `session` +
   `profile` to the tree.
4. Every PostgREST call carries the JWT in `Authorization: Bearer …`.
5. Row Level Security uses `auth.uid()` inside policy expressions.

Edge functions add a second check: they call
`supabase.auth.getUser(token)` to validate the JWT and then look up
the caller's `profiles.role` before running any privileged work.

## Permissions are TWO layers

1. **Tabular permissions** (`permissions` table, by role): boolean
   flags like `can_assign_contacts`, `edit_delete_contacts`,
   `see_all_churches`. Cached client-side via TanStack Query, polled
   every 5 min.
2. **RLS policies** on every protected table: enforce ownership /
   church scoping at the DB layer. Frontend role checks are UX, not
   security — assume RLS is the last word.

## Performance posture

- **Page loads are lazy**: every route uses `React.lazy()` via
  `lazyRetry()` in `App.tsx`, with `ChunkErrorBoundary` retrying on
  stale-hash 404s.
- **Heavy dialogs in SemilleroPage are also lazy** (CsvImporter,
  ContactProfileDialog, BulkWhatsAppDialog, AddContactDialog,
  DuplicateMergeDialog) — they only download on first open.
- **Vendor chunks**: `vendor-react`, `vendor-radix`, `vendor-sentry`,
  `vendor-xlsx`, `vendor-papaparse`, `vendor-date`. Configured in
  `vite.config.ts`. Caches stay valid across deploys until those deps
  bump.
- **Bundle analyzer**: `pnpm analyze` regenerates
  `dist/bundle-stats.html`. Run before/after to track regressions.

## Common gotchas

- **`@radix-ui` + React chunking**: if you split radix into its own
  chunk WITHOUT pinning react/react-dom/scheduler into their own
  chunk, Rollup hoists React into vendor-radix and the main bundle
  gets a second React copy → context Provider/Consumer mismatch →
  blank screen. The current chunk config prevents this; don't remove
  `vendor-react` from `manualChunks`.
- **PostgREST count: 'exact'**: triggers a full COUNT(*) over the
  filtered set. Fine for badges (last-24h messages) but NOT for
  dashboard tiles at scale — use `'planned'` for those, which returns
  the planner's estimate.
- **`update-permissions` edge function**: admin-only. JWT validated
  + role check inside. Don't reintroduce the unauthenticated
  "anyone-can-toggle-pastor-permissions" version that lived here for
  months.
- **Drift between repo and deployed edge functions**: `update-contact`
  drifted before — the deployed version is the source of truth when
  in doubt. Use `mcp__supabase__get_edge_function` to compare.

## Schema migrations

Live in the Supabase MCP, not in git (yet). When applying a migration,
prefer named ones via `mcp__supabase__apply_migration`. There's a
list of every applied migration in `list_migrations`.

Before adding columns to `contacts`, remember the table has 13
triggers — read them via `pg_trigger` to make sure your new column
doesn't trip an existing sync. Especially:

- `auto_assign_responsable_on_contact`
- `sync_contact_cuerda_with_responsable`
- `clear_cell_on_cuerda_change`
- `normalize_conector_trigger`

## Testing

- **Unit tests** via Vitest in `src/**/*.test.ts`. Run with
  `pnpm test`. Coverage is partial; the most-broken-most-often
  modules (`phone-validation`, `normalize`, `territory-utils`) have
  the most tests.
- **No E2E tests yet**. Smoke-test critical flows manually after big
  refactors: login → enter a church → semillero list loads → open a
  contact → assign to a cell.
- **Pre-push hook (opt-in)**: run `bash scripts/install-git-hooks.sh`
  once per clone to enforce `pnpm test && pnpm run build` on every
  `git push`.

## When you change something in `SemilleroPage.tsx`

It's still ~2900 LOC. The component owns:
- Pool of contacts (TanStack Query)
- Filter state (cuerda, responsable, sexo, duplicates, etc)
- Selection state + bulk actions
- The 5 lazy dialogs
- The auto-assign + suggest-cell logic

If a row's onClick handler grows complex, extract that handler — don't
extract the whole row component. The row reads ~15 pieces of state
and turning that into props will explode the prop list and re-render
behavior. Memoize the lookups instead (`teamMemberById`, `profileById`).

When in doubt: run the build, watch the chunk sizes, and check
`dist/bundle-stats.html` to spot accidental imports.
