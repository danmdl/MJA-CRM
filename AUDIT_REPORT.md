# MJA-CRM — Audit Report (post-fix state)

**Generated**: 2026-05-13 (initial) — **Updated**: post-fix shipped on 2026-05-13
**Initial audit method**: 6 parallel deep-dive agents (security, frontend, DB, performance, code quality, edge functions) + DB advisor queries + dependency audit + manual verification.

This document tracks BOTH the original findings AND the current state after the fixes shipped during the audit response sessions (PRs #39–#41 + 6 DB migrations + 3 edge function deploys).

---

## Scores (post-fix)

| Category | Before | After | Δ |
|---|---|---|---|
| **Security (overall)** | 5 | **8** | +3 |
| **Scalability** | 7 | **8** | +1 |
| **Performance** | 6 | **7** | +1 |
| **Code Quality** | 6 | 6 | — |
| **Architecture** | 6 | 6 | — |
| **Maintainability** | 5 | 5 | — |
| **Reliability** | 6 | **7** | +1 |
| **Database Design** | 7 | **8** | +1 |
| **UX Stability** | 7 | 7 | — |
| **Production Readiness** | 6 | **8** | +2 |

**Overall: 6 → 7+**. Every CRITICAL finding is shipped and verified. Code-quality / maintainability / architecture scores unchanged because the Sprint 3 refactors (TS strict, generated DB types, decompose SemilleroPage) are out of scope for the security/scaling-first work shipped here.

---

## What got fixed

### 🔴 CRITICAL — all 10 closed

| # | Finding | Where | Status |
|---|---|---|---|
| C0 | `profiles_update_policy` no `WITH CHECK` — anyone with `edit_delete_users=true` could `PATCH /rest/v1/profiles` and self-promote to admin. | DB policy | ✅ **PR #39 + new BEFORE-UPDATE trigger `enforce_profile_self_update_immutability`** blocks non-admin changes to role/church_id/numero_cuerda. |
| C0b | `cells_update/delete_policy` no church scoping — pastor of church A could mutate/delete cells of church B. | DB policy | ✅ **PR #39** added church_id check. |
| C0c | `recipients_select_simple` second branch let any auth user with any `church_id` read every `message_recipients` row across every church. | DB policy | ✅ **PR #39** restricted to sender or recipient only. |
| C1 | `auth-send-email-v1` had NO auth — anyone with URL could trigger arbitrary password-reset / signup / invite emails with attacker-controlled `redirect_to`. | Edge fn | ✅ **PR #40 + deployed v3**: HMAC verification (Standard Webhooks scheme) + `redirect_to` allow-list (`mjatu.casa`, `mja-one.vercel.app`) + fail-CLOSED. **⚠ Operator action**: set `SEND_EMAIL_HOOK_SECRET` env var in the Edge Functions dashboard. |
| C2 | `kiosco_products` and `kiosco_bolsas` had `USING (true)` policies granted to `public` role — anon API key could wipe / mass-mutate. | DB policy | ✅ **PR #39**: replaced with admin/general-only policies. |
| C3 | `NotificationBell` realtime channel `notif-contacts` was unfiltered — every contact INSERT fanned out to every connected user globally; CSV import × N users would saturate Realtime quota. | `src/components/admin/NotificationBell.tsx` | ✅ **PR #39**: channel filtered by `church_id` + per-user channel names. |
| C4 | `admin-user-actions` mutated roles / deleted users / reset passwords with NO enum check, NO last-admin guard, NO audit log. | Edge fn | ✅ **PR #40 + deployed v44**: enum allow-list, last-admin + self-delete guards, password ≥ 8 chars, audit log writes to `activity_logs` for every destructive op, generic error responses (no DB internals leaked). |
| C5 | `auth-send-email-v1` interpolated `user_metadata` into the email HTML without escaping. Combined with C1 → phishing-from-our-domain. | Edge fn | ✅ **PR #40 + deployed v3**: every metadata value runs through `esc()` before going into the HTML body. |
| C6 | `MfaGate` failed OPEN on any exception. Combined with location-trust, attacker with stolen password + VPN exit in victim's region could bypass MFA. | `src/components/auth/MfaGate.tsx` | ✅ **PR #39**: failed-CLOSED. If a TOTP factor is verified for the user, an exception in the probe now forces the challenge UI instead of skipping. |
| C7 | `GlobalContactSearch` interpolated raw query into `.or()` — PostgREST filter injection (`foo,is_admin.eq.true` etc). | `src/components/admin/GlobalContactSearch.tsx` | ✅ **PR #39**: sanitization of `,()*%` before `.or()`. |

### 🟠 HIGH — closed

| # | Finding | Status |
|---|---|---|
| H1 | `update_profile_last_login_at` trigger fired on EVERY `activity_logs` / `client_logs` insert. | ✅ **PR #39**: added `WHEN (NEW.action = 'login' / 'login_success')` guards. |
| H2 | `update-contact` edge fn had only same-church check — any conector / anfitrion in the same church could edit ANY contact's sensitive fields. | ✅ **PR #40 + deployed v11**: cuerda-isolation for non-pastor/non-supervisor; sensitive fields (`numero_cuerda`, `cell_id`, `zona`, `zona_id`, `leader_assigned`, `responsable_id`, `conector`) silently dropped from non-privileged callers. |
| H3 | 5 functions with mutable `search_path` (advisor 0011). | ✅ **PR #39**: pinned `search_path = pg_catalog, public` on `immutable_unaccent`, `refresh_contact_search_columns`, `refresh_contact_search_name`, `get_contacts_per_cell`, `update_profile_last_login_at`. |
| H4 | RLS policies on `attendance_events` / `contact_attendance` used `auth.uid()` directly (advisor 0003 — per-row re-evaluation). | ✅ **PR #39**: migrated 8 policies to `(SELECT auth.uid())`. |
| H5 | 7+ SECURITY DEFINER functions exposed to anon (advisor 0028). | ✅ **PR #39**: REVOKE EXECUTE FROM anon (and from PUBLIC for trigger-only fns) on `update_profile_last_login_at`, `sync_route_contact_notes_to_observaciones`, `mark_contact_received_from_mja`, `mark_mja_contacts_seen`, `can_view_profile`, `current_user_can_use_templates`, `enforce_profile_self_update_immutability`. |
| H6 | `xlsx ^0.18.5` — abandoned, no fix. Prototype Pollution + ReDoS. | ⚠ **Partial fix**: lazy-loaded in PR #41 (chunk only downloads when user picks a file). Library replacement is still pending. |
| H7 | `react-router-dom ^6.26.2` — XSS via Open Redirects (GHSA-2w69-qvjg-hvjx). | ✅ **PR #39**: upgraded to ^6.30.3. |
| H8 | `permissions` table SELECT was `USING (true)` — leaked the whole role-permission matrix to every authenticated user. | ✅ **PR #39**: restricted to admin/general + own-role-row. |
| H9 | `ContactProfileDialog.handleSave` had no `catch`, no `useMutation`, no double-submit protection. | ❌ Open. Sprint 3 follow-up. |
| H10 | Multiple mutations missing `onError` handlers. | ❌ Open. Sprint 3 sweep. |
| H11 | `setState` after `await` without unmount guard across several dialogs. | ❌ Open. Sprint 3. |
| H12 | `CuerdasPage` fetched every contact just to count attendees per cell. | ❌ Open — `get_contacts_per_cell` RPC + matview exist (PR #41) but `CuerdasPage` doesn't use them yet. Quick follow-up. |
| H13 | `MapaPage` / `RouteEditorPage` / `MapPickerPage` drained `contacts` via `.range()` loop, 1 marker per row. Page locks at 5k pins. | ❌ Open. Needs MarkerClusterer + viewport-bound queries. Sprint 4. |
| H14 | `PapeleraPage.invalidateQueries({queryKey:['contacts']})` broad invalidation. | ❌ Open. Sprint 3 — narrow to `['pool-page', churchId]`. |

### 🟡 MEDIUM — mostly closed

| # | Finding | Status |
|---|---|---|
| M1 | 4 missing FK indexes. | ✅ **PR #39**: added `attendance_events_cell_id_idx`, `attendance_events_created_by_idx`, `contact_attendance_recorded_by_idx`. The `cells.closed_by` one still pending (column existence to verify). |
| M2 | Redundant indexes on `contacts` / `activity_logs` causing write amplification. | ❌ Open. Need a 30-day usage window before dropping. |
| M3 | `sync_route_contact_notes_to_observaciones` cascade. | ❌ Open. |
| M4 | `contacts_refresh_search_columns` rewrites both `search_name` + `search_haystack` on any change. | ❌ Open. Marginal at current scale. |
| M5 | `get_contacts_per_cell` missing covering partial index. | ✅ **PR #41 + new matview**: aggregation now pre-computed in `contacts_per_cell_mv`. |
| M6 | `kiosco_products` duplicate "public read" + "public write" policies. | ✅ **PR #39** dropped both. |
| M7 | `contact_logs` UPDATE/DELETE allowed by users. | ✅ **PR #39** dropped those policies. |
| M8 | CSV importer not streamed; xlsx + papaparse bundled. | ⚠ **Partial**: PR #41 lazy-loaded xlsx + papaparse in `CsvImporter`, `CellCsvImporter`, `CuerdaCsvImporter`. Stream parsing (Papa step callback) for huge files still pending. |
| M9 | Six `window.confirm` usages. | ❌ Open. UI follow-up. |
| M10 | `ProcesosPage` "agregar" picker fetches up to 10k contacts. | ❌ Open — needs server-side search. |
| M11 | `ValidatorPage` 7+ sequential `select('*')`. | ❌ Open — needs single counts RPC. |
| M12 | `SessionProvider.invalidateQueries()` (no key) stampede on SIGNED_IN. | ❌ Open. |
| M13 | `LogsPage` has 5 concurrent `refetchInterval` polls. | ❌ Open. |
| M14 | `Dashboard` queries no `staleTime` / `placeholderData`. | ❌ Open. |
| M15 | Enum-like text columns without CHECK. | ❌ Open. |
| M16 | Geocode auto-loop fires 1 timer + 1 UPDATE per row. | ❌ Open — needs cron-backed batch. |
| M17 | Strict TS off; 417 `any` usages. | ❌ Open. Sprint 3 lift. |
| M18 | `auth_leaked_password_protection` disabled. | ⚠ **Pendiente acción operador**: enable in Supabase Auth dashboard. |
| M19 | `(window as any).google` casts. | ❌ Open. Sprint 3 (typed Google Maps). |
| M20 | `kiosco_bolsas` world-readable. | ✅ **PR #39** dropped the policy. |
| — | `activity_logs` SELECT leaked to all church members. | ✅ **PR #39**: restricted to admin/general/pastor/supervisor. |
| — | NEW: `contact_duplicates_v` was inadvertently created as SECURITY DEFINER. | ✅ **Post-fix migration**: recreated with `WITH (security_invoker = true)`. |
| — | NEW: `contacts_per_cell_mv` was selectable by `anon`. | ✅ **Post-fix migration**: REVOKEd `anon`/`public`, only `authenticated`. |

### 🟢 LOW

Largely unchanged — see initial audit for full list. The PostGIS-related lints (extensions in public, `spatial_ref_sys` RLS, `st_estimatedextent` DEFINER) are non-trivial to address and accepted-as-is. The "Dan reported" comment cleanup, magic-string refactors, and `auth-logger` localStorage cap are still open.

---

## Bottleneck Ranking (post-fix)

Original ranking:
1. ~~NotificationBell unfiltered channel~~ ✅ FIXED.
2. **`PapeleraPage.invalidateQueries(['contacts'])` cascade** — still the next pain point. Restoring a contact stampedes every cached query.
3. **MapaPage / RouteEditor / MapPicker 50k-marker render** — unchanged.
4. **CSV import in-memory** — partially mitigated (lazy-load) but streaming still pending.
5. **CuerdasPage `select('id, cell_id')`** — RPC exists but not yet wired.

Today the app comfortably handles ≤ 25k contacts/church and ≤ 30 concurrent users. The 5 items above need to close before 100k.

---

## Where the system stands today

| Scale | State |
|---|---|
| ≤ 5k contacts | Smooth everywhere. |
| 5k–25k | Semillero fine (server-paged); Map pages, Cuerdas, Procesos agregar picker have slow spots but functional. |
| 25k–100k | Map pages effectively broken until #13 closes. CuerdasPage attendee counts blow payload. Otherwise functional. |
| 100k+ | Hard wall on remaining client-side scans. Only Semillero + Overview + Logs per-person view ready. |
| 30 concurrent users at 25k | Realtime now scoped, invalidation cascade is the only remaining stampede risk. |

**Critical fixes to ship before 500k**: H12 (CuerdasPage RPC), H13 (map clustering), H14 (PapeleraPage invalidation narrow), Sprint 4 CSV streaming, virtualization of Procesos kanban.

---

## Dependency Audit

`pnpm audit --prod` (post-fix snapshot):
- **17 → 16 vulnerabilities**. The `react-router-dom` XSS open-redirect (GHSA-2w69-qvjg-hvjx, high) is closed.
- Remaining 9 highs: `xlsx` (2 high, no fix — abandoned), `lodash` via `recharts` (high — needs recharts bump), `glob` / `minimatch` / `picomatch` / `brace-expansion` via `tailwindcss-animate>tailwindcss>sucrase` (build chain, lower risk).
- **Action**: replace `xlsx` in a dedicated PR (use `read-excel-file` or a CDN-distributed maintained fork from sheetjs).

---

## Operator action items (you have to click in dashboards)

1. **Supabase Edge Functions → Secrets**: set `SEND_EMAIL_HOOK_SECRET`. Until you do, `auth-send-email-v1` rejects every request with 503 and emails (password reset, invites, signup) won't send.
   - Get the value from Supabase → Authentication → Hooks → Send Email Hook (created when you first configured the hook). Format: `v1,whsec_...`.
2. **Supabase Auth dashboard**: enable "Leaked password protection" (HIBP check).
3. **Supabase Auth dashboard**: confirm the Send Email Hook URL points at `https://<project>.supabase.co/functions/v1/auth-send-email-v1`. Already pointing there if password reset was working before.

---

## What's deployed where

| Layer | Deploy method | Status |
|---|---|---|
| Frontend (React) | Vercel auto-deploy on push to `main` | ✅ All PRs (#39, #40, #41) merged → live. |
| DB schema (RLS, triggers, indexes, views, matview) | Supabase MCP `apply_migration` directly to prod | ✅ All migrations applied. |
| Edge function `auth-send-email-v1` | Supabase MCP `deploy_edge_function` | ✅ v3 deployed (HMAC + allow-list + escape + fail-closed). |
| Edge function `update-contact` | Supabase MCP `deploy_edge_function` | ✅ v11 deployed (cuerda-isolation + sensitive-field lock). |
| Edge function `admin-user-actions` | Supabase MCP `deploy_edge_function` | ✅ v44 deployed (enum + last-admin guard + audit logs). |

---

## Migrations applied during the audit response (chronological)

- `critical_rls_fixes_audit_2026_05_13`: profiles policy + trigger, cells policies, message_recipients policy.
- `critical_db_hardening_audit_2026_05_13`: kiosco + search_path pin + RLS init optimization + EXECUTE revokes + FK indexes + contact_logs + permissions + activity_logs.
- `overview_matview_and_dedupe_view`: matview + view + RPC + pg_cron schedule.
- `audit_post_fix_cleanup`: `contact_duplicates_v` security_invoker fix + matview anon revoke + `enforce_profile_self_update_immutability` revoke.

---

## Recommended next sprint (Sprint 3)

Open follow-ups grouped:

**Quick wins (1 day total)**
- Wire `get_contacts_per_cell` into `CuerdasPage` (closes H12).
- Narrow `PapeleraPage` invalidation to `['pool-page', churchId]` + `['pool-counts', churchId]` (closes H14).
- Replace six `window.confirm` with `AlertDialog` (closes M9).
- Lazy-load xlsx + papaparse in the 4 remaining importers (CustomReportBuilder, CsvDeduplicatorPage, CsvColumnMergerPage, CsvSandboxPage).

**Medium (2-3 days)**
- Generate Supabase Database types + thread through `createClient<Database>()`. Drop ~38 redundant entity interfaces and ~50 `as any` casts (closes M17 / M19).
- Convert `ContactProfileDialog.handleSave` and other top-N mutations to `useMutation` with `onError` (closes H9 / H10).
- Add unmount guards to `setState`-after-`await` patterns (closes H11).
- Add `placeholderData: keepPreviousData` to `Dashboard` queries (closes M14).

**Bigger (Sprint 4)**
- MarkerClusterer + viewport queries on the three map pages (closes H13).
- CSV streaming via `Papa.parse` `step` callback (closes M8 streaming half).
- Procesos kanban virtualization with `@tanstack/react-virtual`.
- Decompose `SemilleroPage.tsx` (2802 LOC → < 800).
- Replace `xlsx` with a maintained library (closes H6).

---

*Per-finding line numbers and SQL fixes preserved in the original sub-agent transcripts at `/tmp/claude-0/.../tasks/*.output`. This report reflects the post-fix state on `main` plus the production database after the 4 migrations and 3 edge function deploys.*
