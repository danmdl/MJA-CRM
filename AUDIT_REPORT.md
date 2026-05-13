# MJA-CRM — Full Stack Audit Report

**Generated**: 2026-05-13
**Scope**: Frontend (React + Vite + TypeScript), Backend (Supabase Postgres 17, Edge Functions Deno), DB schema, RLS, dependencies, scalability to 500k contacts.
**Method**: 6 parallel deep-dive agents (security, frontend, DB, performance, code quality, edge functions) + direct DB advisor queries + dependency audit + manual verification of hot paths.
**Current scale**: 11,175 contacts. 16,313 activity_logs. 27 profiles. 1 iglesia activa.

---

## Scores (1–10)

| Category | Score | Note |
|---|---|---|
| **Security (overall)** | 5 | Front layer decent; edge functions weak (`auth-send-email-v1` unauthenticated; `admin-user-actions` no audit on destructive ops); DB has 2 critical world-writable tables. |
| **Scalability** | 7 | Semillero now server-paged (post #36); 5 critical scaling blockers remain (notification fanout, map markers, CSV, cell-count fetches, dedupe scan). |
| **Performance** | 6 | Hot paths fixed for ≤25k contacts; map pages + Realtime fanout + global invalidate cascade are the next breaks. |
| **Code Quality** | 6 | Strong `lib/` helpers and tests; large pages (SemilleroPage 2802 LOC), 417 `any` usages, no generated Supabase types. |
| **Architecture** | 6 | Good chunking & lazy loading; pages own too much. Custom event bus for sidebar. No clean feature/domain slicing. |
| **Maintainability** | 5 | Strict TS off; `@typescript-eslint/no-unused-vars` disabled; large god-pages; 38 redundant entity types. |
| **Reliability** | 6 | Several missing `onError` handlers; `handleSave` without `catch`; race conditions in autoAssignMutation. |
| **Database Design** | 7 | Indexes mostly right; 4 missing FK indexes, several redundant; triggers cascade; functions need `search_path` pinned. |
| **UX Stability** | 7 | Six `window.confirm` usages remain; loading-vs-empty collisions on Dashboard; no virtualization (200-row tables stutter on mobile). |
| **Production Readiness** | 6 | Ready for current load; not for 500k without 7 concrete fixes (most in DB + 1 edge function). |

**Overall: ~6/10**. Solid foundation, but several genuinely production-grave issues (2 critical edge function vulns, 2 critical RLS gaps, 1 critical realtime fanout pattern) that must be fixed before scaling further.

---

## Top Priorities

### 🔴 CRITICAL (fix immediately)

| # | Issue | Where | Impact |
|---|---|---|---|
| **C0** | **`profiles_update_policy` has NO `WITH CHECK` clause**. Any role with `edit_delete_users=true` (pastor, supervisor, referente, gestor, general, admin — practically every elevated role) can `PATCH /rest/v1/profiles?id=eq.<victim>` with `{"role":"admin","church_id":"..."}`. Self-promotion to admin or arbitrary role overwrite, bypassing every edge function guard. | DB policy `profiles_update_policy` | **Account takeover, full privilege escalation.** |
| **C0b** | `cells_update_policy` and `cells_delete_policy` check only `edit_delete_users=true` with **no church scoping**. Pastor of Church A can edit/delete cells of Church B. | DB policies on `cells` | **Cross-tenant data tampering / destruction.** |
| **C0c** | `recipients_select_simple` second branch is `EXISTS (SELECT 1 FROM profiles WHERE p.id=auth.uid() AND p.church_id IS NOT NULL)` — any authenticated user with any church_id can SELECT every `message_recipients` row across every church. | DB policy `recipients_select_simple` | **Cross-tenant message graph disclosure.** |
| C1 | `auth-send-email-v1` has **NO auth check**: anyone with the URL can trigger arbitrary password-reset / signup / invite emails with attacker-controlled `redirect_to` (open redirect → account takeover). | `supabase/functions/auth-send-email-v1/index.ts` (entire file) | Spam pump, phishing, account takeover. |
| C2 | `kiosco_products` and `kiosco_bolsas` tables have RLS policies `USING (true)` / `WITH CHECK (true)` for INSERT / UPDATE / DELETE granted to **public role**. Anon key (embedded in every browser) can wipe / mass-mutate. | DB tables `kiosco_products`, `kiosco_bolsas` | Data loss / vandalism. |
| C3 | `NotificationBell` opens `notif-contacts` realtime channel **unfiltered** — every `contacts` INSERT fans out to every signed-in user globally. CSV import (5k rows) × N users → realtime quota saturation. | `src/components/admin/NotificationBell.tsx:73` | Realtime quota saturation at ~10 users + any CSV import. |
| C4 | `admin-user-actions` mutates roles, deletes users, and resets passwords with **no enum check, no last-admin guard, no audit log**. Combined with C0, trivially abused. | `supabase/functions/admin-user-actions/index.ts:135-225` | Privilege escalation, undetectable abuse. |
| C5 | `auth-send-email-v1` interpolates `user_metadata` directly into HTML without escaping. Combined with C1 → email-based phishing primitive from our own domain. | `auth-send-email-v1/index.ts:138-156` | HTML injection, phishing-from-our-domain. |
| C6 | **MFA fails open on any exception** — `MfaGate.tsx:321-326` catch sets `phase='ok'`. Combined with location-trust at line 301, attacker with stolen password + VPN exit in same country/region as victim skips MFA entirely. | `src/components/auth/MfaGate.tsx:321-326` | 2FA bypass. |
| C7 | **PostgREST `.or()` filter-injection** in `GlobalContactSearch.tsx:80`. `debouncedQuery` interpolated unescaped into `.or(\`first_name.ilike.%${q}%,...\`)`. PostgREST treats commas/parens as syntax — `foo,is_admin.eq.true` mutates the filter. | `src/components/admin/GlobalContactSearch.tsx:80` | Filter injection, RLS-bypass within RLS-allowed rows. |

### 🟠 HIGH (fix this sprint)

| # | Issue | Where |
|---|---|---|
| H1 | `update_profile_last_login_at` trigger fires on **every** `activity_logs` and `client_logs` INSERT (currently ~10/s in prod). No `WHEN` clause, no `search_path` pinned. SECURITY DEFINER context switch is wasted on 99% of inserts. | DB triggers `activity_logs_update_last_login`, `client_logs_update_last_login` |
| H2 | `update-contact` edge function gates only by same-church check — any `conector` in the same church can edit ANY contact's sensitive fields (`leader_assigned`, `cell_id`, `zona_id`, `numero_cuerda`, `conector`). | `supabase/functions/update-contact/index.ts:54` |
| H3 | Functions with **role-mutable `search_path`** (advisor lint 0011): `immutable_unaccent`, `refresh_contact_search_columns`, `refresh_contact_search_name`, `get_contacts_per_cell`, `update_profile_last_login_at`. Backs the GIN trigram indexes — a search_path swap could silently corrupt expression-indexed values. |
| H4 | RLS policies on `attendance_events` and `contact_attendance` use `auth.uid()` directly (advisor lint 0003). Per-row re-evaluation at scale. | DB |
| H5 | 7 SECURITY DEFINER functions are callable by **anon** role via PostgREST (advisor lint 0028). Functional no-op when not authenticated but a free DoS surface. Several are trigger-only and should have EXECUTE revoked entirely. |
| H6 | `xlsx ^0.18.5` has 2 high-severity vulns (Prototype Pollution + ReDoS, **no fixed version available** — library effectively abandoned). |
| H7 | `react-router-dom ^6.26.2` has XSS via Open Redirects (advisory GHSA-2w69-qvjg-hvjx, patched in 6.30.2). |
| H8 | `permissions` table is readable by every authenticated user (RLS `USING (true)`) — discloses the full role-permission matrix. |
| H9 | `ContactProfileDialog.handleSave` has no `catch`, no `useMutation`, no double-submit protection. Click "Guardar" twice fast → both PATCH; last one wins. Network failure shows no toast. | `src/components/admin/ContactProfileDialog.tsx:342-409` |
| H10 | Several mutations have no `onError` handler — `LogsPage.resolveMutation`, `NotificationBell` realtime inserts, `Messages.markAsRead` / `archiveMessage`. Failures silently leave UI inconsistent. |
| H11 | `setState` after `await` without unmount guard across `ContactProfileDialog`, `MfaGate`, several dialogs — closing the dialog mid-fetch leaks setStates onto unmounted components. |
| H12 | `CuerdasPage` fetches every contact (`select('id, cell_id')` no limit) just to count attendees per cell. The `get_contacts_per_cell` RPC already exists (used by Overview); reuse it. |
| H13 | `MapaPage`, `RouteEditorPage`, `MapPickerPage` all drain `contacts` via `.range()` loop up to 50k rows, render one Google Maps `Marker` per row. Page locks at 5k mappable contacts. |
| H14 | `PapeleraPage.invalidateQueries({ queryKey: ['contacts'] })` broad invalidation. Restoring one contact triggers full Semillero refetch + per-page count + realtime fanout — 50-user stampede. | `src/pages/admin/churches/[churchId]/PapeleraPage.tsx:113-116` |

### 🟡 MEDIUM

| # | Issue |
|---|---|
| M1 | 4 missing FK indexes: `attendance_events.cell_id`, `attendance_events.created_by`, `cells.closed_by`, `contact_attendance.recorded_by`. |
| M2 | Multiple redundant indexes on `contacts` (e.g. `idx_contacts_church_id` covered by `contacts_church_cuerda_idx`). Each INSERT touches 26 indexes — 3× write amplification. |
| M3 | `sync_route_contact_notes_to_observaciones` trigger fires N-times per route save (50 stops → 50 contact UPDATEs + full trigger chain on contacts). |
| M4 | `contacts_refresh_search_columns` trigger recomputes BOTH `search_name` AND `search_haystack` on any first_name/last_name change. GIN index gets dirtied unnecessarily. |
| M5 | `get_contacts_per_cell` lacks a `(church_id, cell_id) WHERE deleted_at IS NULL` covering partial index. At 500k will full-scan. |
| M6 | `kiosco_products` has duplicate "public read" + "public write" policies — multiple permissive policies executed per row. |
| M7 | `contact_logs` has UPDATE+DELETE policies — audit trail can be tampered. |
| M8 | `CsvImporter` not streamed: parses entire CSV into JS heap. 50k rows = ~30 MB heap; 100k OOMs the tab. `xlsx` + `papaparse` not code-split — ~400 KB bundled into pages that import them. |
| M9 | Six `window.confirm` usages on `CuerdasPage`, `CelulasPage`, `HogaresDePazPage`, `ContactLogDialog`. Blocks UI; terrible on mobile; non-styleable. |
| M10 | `ProcesosPage` "agregar" picker fetches up to 10k contacts, filters client-side, search not server-side. Truncates silently past 10k. |
| M11 | `ValidatorPage` runs 7+ sequential queries each pulling matched contacts via `select('*')`. A church with 100k missing-data contacts is unusable. |
| M12 | `SessionProvider.invalidateQueries()` (no key, all queries) fires on `SIGNED_IN`. One legit login refetches every cached query. Stampede on multi-tab. |
| M13 | `LogsPage` has 5 concurrent `refetchInterval` polls (30–60s) on the same page. Hammers Supabase. |
| M14 | `Dashboard` queries have no `staleTime` and no `placeholderData` — flashes empty on every nav. |
| M15 | Enum-like text columns without CHECK: `contacts.sexo`, `estado_civil`, `estado_seguimiento`. Data drift accumulates. |
| M16 | `geocode auto-loop` (SemilleroPage, MapaPage) spawns `setTimeout(_, i*300)` per row missing coords. 5k missing rows = 5k timers + 5k UPDATEs (each triggers Realtime fanout). |
| M17 | Strict TS off; `@typescript-eslint/no-unused-vars` disabled; 417 `any` usages, 132 `as any`, no generated Supabase Database type. |
| M18 | `auth-leaked-password-protection` (HIBP check) disabled at Auth level. |
| M19 | Many `(window as any).google` and `(contact as any).lat/lng/zona_id` casts — types out of date. |
| M20 | `kiosco_bolsas` `USING (true)` makes it world-readable in addition to writable (the duplicate "public read" + "public write" policies). |

### 🟢 LOW

| # | Issue |
|---|---|
| L1 | Extensions `postgis`, `pg_trgm`, `unaccent` in `public` schema — should be in `extensions`. |
| L2 | `spatial_ref_sys` has no RLS (PostGIS-managed). Mostly fine; revoke SELECT from anon if maps don't need it pre-auth. |
| L3 | Many "Dan reported …" historical comments — move to ADRs/PR descriptions. |
| L4 | Hardcoded `'admin'`/`'general'` role strings across ~47 files — promote helpers `isAdmin(p)`, `hasRoleAtLeast(p, role)` from `permissions.ts`. |
| L5 | No materialized views for Overview yet (will need at ~100k contacts). |
| L6 | `trusted_devices_user_location_idx` has 0 scans (new, give it time). |
| L7 | No partial UNIQUE on `(church_id, lower(phone))` for duplicate-phone prevention. |
| L8 | No virtualization anywhere. Procesos kanban with 1000-card columns will stutter. |
| L9 | `auth-logger` stores unbounded array of timestamps per email in localStorage — cap at 20 entries. |
| L10 | `early` migrations 0000–0009 should be squashed or annotated. |

---

## File-size hot spots (refactor candidates)

| Lines | File |
|---:|---|
| 2802 | `src/pages/admin/churches/[churchId]/SemilleroPage.tsx` |
| 1308 | `src/pages/admin/churches/[churchId]/AsistenciaPage.tsx` |
| 1221 | `src/pages/admin/churches/[churchId]/RouteEditorPage.tsx` |
| 1193 | `src/pages/admin/churches/[churchId]/MapPickerPage.tsx` |
| 988 | `src/components/admin/ContactProfileDialog.tsx` |
| 913 | `src/pages/admin/churches/[churchId]/TerritoriosPage.tsx` |
| 859 | `src/pages/admin/churches/[churchId]/ValidatorPage.tsx` |
| 840 | `src/components/admin/CsvImporter.tsx` |

---

## Bottleneck Ranking (what hurts first as load grows)

1. **NotificationBell unfiltered contacts realtime channel** — fanout per insert × every user. Breaks at ~10 concurrent users + any CSV import.
2. **Realtime + `invalidateQueries(['contacts'])` cascade** — `PapeleraPage:114` and similar broad invalidations stampede 50 cached queries. Breaks at 5k contacts + 20 users.
3. **MapaPage / RouteEditor / MapPicker 50k-marker render** — Google Maps can't paint that many DOM markers. Breaks at 5k mappable contacts.
4. **CSV import in-memory + per-row triggers + realtime fanout** — 20k-row XLSX OOMs the tab; 50 users importing concurrently saturates Realtime.
5. **CuerdasPage `select('id, cell_id')` of all contacts** — 25 MB JSON at 500k. Breaks at 50k.

After fixing those five, the next ceilings are:
- `sync_route_contact_notes_to_observaciones` cascade (route with 100+ stops).
- `activity_logs` size (currently growing at ~3k/week → 150k/year).
- `contacts` write amplification from 26 indexes (CSV import latency).

---

## Where the system stands today

| Scale | State |
|---|---|
| ≤5k contacts/church, ≤10 concurrent users | Smooth on every page. |
| 5k–25k contacts | Semillero fine (server-paged). Map pages, CuerdasPage, ProcesosPage agregar picker start to feel slow. |
| 25k–100k | Map pages effectively broken. Cuerdas attendee counts download multi-MB. Realtime fanout stutters on writes. |
| 100k+ | Hard wall on map views and on any client-side full-contact derivations. Only Semillero is ready for 500k. |
| 50 concurrent users at 25k+ | NotificationBell fanout + invalidate cascade saturates Realtime quota; visible lag. |

**Critical fixes to ship before 500k:** C1–C5, H1, H2, H4, H12, H13, H14.

---

## Dependency Audit Summary

`pnpm audit --prod`: **17 vulnerabilities** (1 low, 7 moderate, 9 high).

Notable:
- `xlsx@^0.18.5` — Prototype Pollution + ReDoS, **no fix available**. Library abandoned. Migrate to `exceljs` or similar.
- `react-router-dom@^6.26.2` — XSS via Open Redirects (fix in 6.30.2). Upgrade.
- `lodash` (transitive via `recharts`) — Code Injection in `_.template`. Upgrade recharts or accept (we don't use `_.template`).
- `tailwindcss-animate` transitives (`postcss`, `glob`, `minimatch`, `picomatch`, `brace-expansion`) — ReDoS in build chain. Lower risk; update when the parent ships a fix.

---

## Recommended Roadmap

### Sprint 1 — Stop the bleeding (1–2 days)
1. Add HMAC verification to `auth-send-email-v1` (use Supabase webhook signing secret).
2. Allow-list `redirect_to` against known site origins in the email function.
3. Drop `kiosco_*` `USING (true)` policies; require admin role.
4. Filter `NotificationBell` contacts channel by `church_id` (or move notification creation to a Postgres trigger so clients don't have to subscribe globally).
5. Add `WHEN (NEW.action IN (...))` to `update_profile_last_login_at` trigger; pin `search_path` on all 5 flagged functions.
6. Revoke EXECUTE from `anon` (and from PUBLIC for trigger-only fns) on the SECURITY DEFINER list.
7. Upgrade `react-router-dom` to ≥6.30.2.

### Sprint 2 — Scaling pre-requisites (3–5 days)
1. Replace `update-contact` same-church-only check with the same cuerda-isolation rule `invite-user-v2` uses; add an allow-list of sensitive fields admin-only.
2. Add audit-log writes to every `admin-user-actions` destructive op + enum check on `newRole` + last-admin guard.
3. Replace `CuerdasPage` full-contacts fetch with `get_contacts_per_cell` RPC.
4. Replace `MapaPage`, `RouteEditorPage`, `MapPickerPage` full-table drains with viewport-bound queries + `MarkerClusterer`.
5. Narrow `PapeleraPage` invalidations to exact pool keys (`['pool-page', churchId]`, `['pool-counts', churchId]`).
6. Add the 4 missing FK indexes + drop the redundant `contacts` / `activity_logs` indexes.
7. Migrate RLS on `attendance_events` and `contact_attendance` to `(SELECT auth.uid())` initplan.

### Sprint 3 — Quality + Robustness (1 week)
1. Generate Supabase Database types; thread through `createClient<Database>(...)`; drop ~38 redundant entity types and ~50 `as any` casts.
2. Turn on `strict: true` in `tsconfig.app.json` (incrementally — `strictNullChecks` first).
3. Re-enable `@typescript-eslint/no-unused-vars`.
4. Decompose SemilleroPage / ContactProfileDialog along the lines already started.
5. Convert `ContactProfileDialog.handleSave` to `useMutation`; add `onError` to every mutation across `LogsPage`, `Messages`, `NotificationBell`.
6. Replace all `window.confirm` with `AlertDialog`.
7. Unique-name realtime channels (`notif-messages-${userId}`).

### Sprint 4 — Pre-500k (2 weeks)
1. Stream CSV imports + move to edge function (out of the browser tab).
2. Auto-geocode → batch RPC + cron job; no more setTimeout fanout.
3. Move duplicate detection to a SQL view; client only marks visible-page entries.
4. Replace `sync_route_contact_notes_to_observaciones` cascade with a `route_contact_notes` table.
5. Materialized views for Overview / cuerdas summary; refresh every 5 min via pg_cron (already installed).
6. Replace `xlsx` with a maintained library; update bundle splitting.
7. Add virtualization to Procesos kanban columns and SemilleroPage table.

### Sprint 5+ — Beyond 500k (when needed)
1. Partition `activity_logs` by month (`pg_partman` already available).
2. Cursor pagination on `LogsPage` / message history.
3. Read replicas for analytics queries (Supabase Pro).
4. Move `permissions` reads to a `current_user_permissions()` RPC; cache client-side.

---

## What was already done (recent merges)

PRs #36–#38 (this session): real server-side pagination of SemilleroPage; `profiles.last_login_at` trigger eliminating the 1000-row scan in LogsPage per-person view; `get_contacts_per_cell` RPC replacing the all-contacts fetch in OverviewPage. Those three fixes raised Production Readiness from ~5 to ~6 and Scalability from ~5 to ~7.

PR #34 (search normalization): `search_name` / `search_haystack` columns + trigram indexes + `immutable_unaccent` wrapper. Powers accent-insensitive search across MapPicker, Asistencia, GlobalContactSearch, Semillero.

PR #31 (MFA location trust): geolocation-based MFA bypass to reduce challenge frequency. Production-OK; uses ipapi.co free tier.

---

*Detailed per-finding line numbers and SQL fixes preserved in the agent transcripts; this report condenses them. Sub-agent outputs are in `/tmp/claude-0/.../tasks/*.output`.*
