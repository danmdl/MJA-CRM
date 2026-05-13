# MJA-CRM — Pending Work Report

**Generated**: 2026-05-13 (post slug feature PR #43)
**Working tree**: clean, on `main @ 41a5831`
**Prod state**: 4 PRs landed today (#39 critical security, #40 edge function hardening, #41 + #42 perf, #43 slug feature)

This report tracks **what's still pending** after the audit-response sprint. The full historical audit lives in `AUDIT_REPORT.md` — this is the forward-looking companion.

---

## Verification debt (do first)

| # | Item | Where | Why |
|---|------|-------|-----|
| V1 | Manual check: `/admin/churches/MJACENTRAL/team` loads | Browser | PR #43 just merged, untested in prod |
| V2 | Manual check: old UUID URL redirects to slug | Browser | Same |
| V3 | Sidebar links use slug across all roles (admin / pastor / referente / conector) | Browser | Each role sees a different subset |
| V4 | Vercel runtime logs (last 5 min, error/fatal) clean | Vercel dashboard | Standard post-deploy gate |
| V5 | Set `SEND_EMAIL_HOOK_SECRET` env var in Supabase Edge Functions dashboard | Supabase | Was flagged in PR #40 — without it, auth-send-email-v1 rejects everything |

---

## Sprint 4 backlog (carried forward)

The Sprint 3/4 plan was "ship critical security + scaling first, then refactor." Security is done. Refactor + scaling-hardening still pending.

### 🟧 Performance / scaling — high impact

| # | Item | Where | Current state | Estimated impact |
|---|------|-------|--------------|------------------|
| P1 | **Google Maps marker clustering + viewport queries** | `MapaPage.tsx`, `RouteEditorPage.tsx`, `MapPickerPage.tsx` | Every contact = 1 DOM marker. No clustering. No bounds filter. | Hard cap at ~2k markers before browser jank. Once a church hits 5k+ contacts, the map page becomes unusable. |
| P2 | **Procesos kanban virtualization** | `ProcesosPage.tsx` (734 LOC) | All cards rendered in DOM. | Smooth scroll caps at ~500 cards per column. `@tanstack/react-virtual` is not installed. |
| P3 | **CSV import streaming** | `src/lib/csv-import-engine.ts` | `Papa.parse` returns the full array, then we batch-insert. | 50k-row imports peak ~200 MB heap on mobile Safari. `step:` callback would keep it flat. |
| P4 | **Bundle size — `xlsx` is 429 KB / gzip 143 KB** | `package.json` | Lazy-loaded (good), but xlsx without paid license has known CVEs and is unmaintained. SheetJS-CE / exceljs are drop-in alternatives. | Bundle + CVE exposure. |

### 🟦 Code quality / maintainability — medium impact

| # | Item | Where | Current state |
|---|------|-------|--------------|
| Q1 | **Decompose `SemilleroPage.tsx` — 2803 LOC** | `src/pages/admin/churches/[churchId]/SemilleroPage.tsx` | One file, ~30 hooks, ~15 panels, ~6 dialogs. Largest chunk in the app (92.65 KB / gzip 25 KB). Touching it carries high regression risk. |
| Q2 | **Decompose `AsistenciaPage.tsx` — 1309 LOC** | Same dir | Similar shape — tabs, dialogs, lots of inline state. |
| Q3 | **Decompose `RouteEditorPage.tsx` — 1223 LOC** | Same dir | Map + drawer + list all in one file. |
| Q4 | **TypeScript strict mode** | `tsconfig.app.json` | `"strict": false`, `"noImplicitAny": false`. Lots of `any`. Generated DB types depend on this. |
| Q5 | **Generated Supabase Database types** | `src/integrations/supabase/client.ts` | `createClient()` is untyped — every `.from('table')` returns `any`. `supabase gen types typescript` would fix this. Blocked by Q4 (lots of red squiggles when enabled). |

### 🟩 Reliability / monitoring — low-touch but valuable

| # | Item | Current state |
|---|------|--------------|
| R1 | **Sentry coverage of edge functions** | Frontend Sentry installed. Edge functions log to `activity_logs` but no APM. Adding `Sentry.init` to the 8 functions would surface 500s/timeouts. |
| R2 | **Test coverage report** | 168 tests pass, but no `coverage` script in `package.json`. We don't know what % is covered. |
| R3 | **Smoke test for the slug redirect** | No integration test for `/admin/churches/<uuid>/team → /admin/churches/<slug>/team`. The unit tests cover `isUuid` + `normalizeSlug` but not the layout redirect. |

---

## Suggested order

1. **V1–V5** — 15 min of clicking + setting the secret. Don't ship anything else until V5 is set.
2. **P1 (map clustering)** — biggest user-visible scaling cliff. Probably 1 day.
3. **P2 (kanban virtualization)** — half-day. Affects the highest-traffic working surface (Procesos).
4. **P3 (CSV streaming)** — half-day. Affects only admins doing imports.
5. **Q1 (split SemilleroPage)** — 1–2 days. Stops being the hot lap for every new feature.
6. **P4 (replace xlsx)** — 2 hours if exceljs covers the export shape we need.
7. **Q4/Q5 (strict + types)** — 1 day, but needs Q1 done first or the cascade of `any → unknown` errors lands in the monolith.

---

## What's NOT pending (no action needed)

- All 10 CRITICAL findings from the original audit — closed and verified
- All HIGH findings except H13 (map clustering — see P1) — closed
- 6 DB migrations applied to prod
- 3 edge functions deployed to prod (auth-send-email-v1 v3, admin-user-actions v44, update-contact v11)
- Slug feature shipped end-to-end (DB + frontend + admin UI + 168 tests green)
