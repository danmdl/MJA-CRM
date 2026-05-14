# MJA-CRM — Pending Work Report

**Last updated**: 2026-05-14 (after the do-ALL sweep — PRs #46–#55)
**Working tree**: clean, on `main`

Forward-looking companion to `AUDIT_REPORT.md`. The Sprint 4 backlog from
the post-slug audit was burnt down in PRs #46–#55; this is what's still
pending.

---

## Verification debt (do first)

| # | Item | Where | Notes |
|---|------|-------|-------|
| V1 | Manual check: `/admin/churches/MJACENTRAL/team` loads | Browser | PR #43; cannot be automated |
| V2 | Manual check: old UUID URL redirects to slug | Browser | Covered by unit smoke test (R3, PR #51) but production behavior still untested |
| V3 | Sidebar links use slug across all roles (admin / pastor / referente / conector) | Browser | Each role sees a different subset |
| V4 | Vercel runtime logs (last 5 min, error/fatal) clean | Vercel dashboard | Standard post-deploy gate |

V5 (`SEND_EMAIL_HOOK_SECRET`) was verified set in the dashboard via
edge-function logs returning 400, not 503 — closed in PR #51.

---

## Manual follow-ups created by recent PRs

These are configuration / deploy steps that the merged PRs left pending:

| # | Item | Why |
|---|------|-----|
| F1 | Set `SENTRY_DSN` in Supabase Dashboard → Edge Functions → Secrets, then `supabase functions deploy <name>` for the 8 edge functions | PR #53 wired `captureException` into every catch but it's a no-op until the secret is set + functions are redeployed |
| F2 | Verify CSV imports + xlsx export against a real file | PR #52 swapped xlsx → ExcelJS. Build + tests green; behavior needs a real-world spreadsheet round-trip |
| F3 | Verify map clustering on Mapa (Contactos view) at a high-density church | PR #54 added the clusterer; UX hasn't been smoke-tested in prod |
| F4 | Verify Procesos kanban DnD + scrolling on a column with > 50 cards | PR #54 added virtualization; threshold is hit by real churches |

---

## What's still partial

| # | Item | State | Why deferred |
|---|------|-------|--------------|
| Q1 | `SemilleroPage.tsx` is 2652 LOC (was 2803) | First pass shipped in PR #48: helpers + pagination + AssignConfirmDialog extracted. The 800-LOC `<table>` block remains inline | Pulling the table out cleanly needs a 50-prop view component or a context refactor — high LOC churn for a "view only" extraction. Needs careful manual verification (shift-click range select, sort, column resize, filter dropdowns, suggestion column, assign flows). Better as its own focused PR with a dedicated test pass |
| Q3 | `RouteEditorPage.tsx` is 1050 LOC (was 1223) | PRs #50 (helpers + filter) and #55 (RouteEditDialog extract) shipped. The map-lifecycle refs + route-calculation handlers stay inline | Those handlers are tightly coupled to `mapInstance` / `customMarkers` / `customPolyline` / `directionsRenderer` refs. Pulling them into a `useMapRenderer` hook is real refactor work, not a flat extraction |

For Q1 the practical next move is a `useSemilleroSelection` + `useSemilleroTableState` hook split that lets a smaller `<SemilleroTable>` component take a tight props interface — but only after a focused PR with browser verification.

---

## Genuinely not started

### 🟧 Performance / scaling

| # | Item | Where | Notes |
|---|------|-------|-------|
| P1.2 | **Viewport queries** for the contact map | `MapaPage.tsx` | PR #54 added clustering, which is the main user-visible win. Viewport queries (`bounds_changed` → debounced refetch within the visible rectangle) are the next step, needed once a church goes past ~50k contacts |

### 🟩 Reliability / monitoring

| # | Item | Notes |
|---|------|-------|
| R4 | **Lift `hooks/` and `utils/` coverage** | PR #51 added `pnpm test:coverage`. Baseline is 40.55% line, with `lib/` ~60% and `hooks/` + `utils/` near 0%. The hooks are the next coverage target |

---

## What's NOT pending (closed since last revision of this file)

- **P1** map clustering (PR #54) — clusterer wired into Mapa + MapPicker contact view
- **P2** Procesos kanban virtualization (PR #54) — `@tanstack/react-virtual` with a < 50 threshold
- **P3** CSV import streaming (PR #52) — Papa.parse `chunk` callback, no more `readAsText` of the whole file
- **P4** xlsx → ExcelJS (PR #52) — CVE-prone dependency removed; behavior behind a thin adapter
- **Q1** (first pass, PR #48) — SemilleroPage helpers + pagination + confirm dialog
- **Q2** (PR #49) — AsistenciaPage 1309 → 301 LOC, under the 800-LOC target
- **Q3** (PRs #50, #55) — RouteEditor helpers + filter + EditDialog extracted
- **Q4** (PR #46) — `noImplicitAny: true` in `tsconfig.app.json`
- **Q5** (PR #47) — generated `Database` types threaded through `createClient<Database>(...)`. Surfaced one real bug (HogaresDePaz writing `activity_logs` without `entity_id`)
- **R1** (PR #53) — Sentry helper + `captureException` wired into every edge function's top-level catch. **Pending activation: F1 above**
- **R2** (PR #51) — `pnpm test:coverage` + provider configured
- **R3** (PR #51) — `computeSlugRedirect` extracted + 7 unit tests covering the redirect math
- **V5** (PR #51) — verified `SEND_EMAIL_HOOK_SECRET` already set in the dashboard
- All 10 CRITICAL findings from the original audit
- All HIGH findings except the now-shipped H13 (map clustering)
- 6 DB migrations applied to prod
- Slug feature shipped end-to-end
