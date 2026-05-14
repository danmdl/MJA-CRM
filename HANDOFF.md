# MJA-CRM — Resume-here handoff

**Date**: 2026-05-14
**Last commit**: `d81b897` on `main`
**Score**: 8/10 — most of original PENDING.md burnt down; 4 manual checks + 2 deferred extractions + 1 perf-cliff follow-up + 1 coverage gap remain.

Paste this into a fresh Claude session to resume the work.

---

## What's already done — DO NOT redo

PRs #46–#55 closed all of: P1 (clustering only), P2, P3, P4, Q2, Q4, Q5, R1, R2, R3, V5.
Partial: Q1 first pass (2803→2652 LOC), Q3 (1223→1050 LOC).

`PENDING.md` in the repo is the source of truth for state. Read it first.

---

## What's left, in suggested order

### 1. Browser-only manual checks (V1–V4) — 15 min
- V1: `/admin/churches/MJACENTRAL/team` loads
- V2: old UUID URL redirects to slug in the URL bar
- V3: sidebar links use slug for admin / pastor / referente / conector roles
- V4: Vercel runtime logs clean for the last 5 min after these clicks
> Claude can't do these. You have to do them.

### 2. Activate Sentry on edge fns (F1) — 10 min
- Set `SENTRY_DSN` (and optionally `SENTRY_RELEASE`, `SENTRY_ENV`) in Supabase Dashboard → Edge Functions → Secrets.
- Run `supabase functions deploy <name>` for: `add-contact-log`, `admin-user-actions`, `auth-send-email-v1`, `get-dashboard-stats`, `invite-user`, `invite-user-v2`, `update-contact`, `update-permissions`.
- The captureException calls are already in the source on `main` (PR #53). They no-op until both steps above are done.

### 3. Smoke-test the recent UX changes (F2–F4) — 30 min
- F2: Import a real .csv and a real .xlsx in Semillero. Export the Reportes builder. Run CSV Column Merger on .xlsx in → .xlsx out. (PR #52 replaced xlsx with ExcelJS.)
- F3: Mapa → Contactos view at a high-density church. Verify clusters appear, expand on zoom, click opens InfoWindow. (PR #54)
- F4: Procesos kanban → drag a card between columns + scroll a column with >50 cards. (PR #54)

### 4. Q1 finish — extract the SemilleroPage `<table>` block — ~1 day
- File: `src/pages/admin/churches/[churchId]/SemilleroPage.tsx` (2652 LOC).
- Target: pull the 800-LOC `<table>...</table>` block (lines ~1399–2171 in current main) into `semillero/SemilleroTable.tsx`.
- **Why deferred**: ~50 props needed. Tight coupling to selectedIds shift-click, sort state, column resize, filter dropdowns, suggestion column, assign flows, dup pill, WhatsApp button.
- **Approach when you resume**: extract two custom hooks first — `useSemilleroSelection` (selectedIds + lastClickedIdx + shift-click range select) and `useSemilleroTableState` (colWidths + sort + filter state). Then the table component takes those hook return values + the row data as props. Verify every interaction path manually after.

### 5. Q3 finish — RouteEditor map-lifecycle hook — ~half day
- File: `src/pages/admin/churches/[churchId]/RouteEditorPage.tsx` (1050 LOC).
- Target: extract `mapInstance` / `customMarkers` / `customPolyline` / `directionsRenderer` refs + the route-calculation handlers into `route-editor/useMapRenderer.ts`.
- **Why deferred**: refs are touched by 5+ event handlers across the file. Wrong order of effect cleanup leaves orphaned DOM nodes / leaked markers.
- **Approach**: model the hook as `useMapRenderer({ container, stops, polylineMode })` returning `{ recalculate, focusStop }`. Move `refreshMarkers` + `refreshPolyline` + `calculateRoute` inside. Keep `useEditDialogState` separate.

### 6. P1.2 — viewport queries for the contact map — ~half day
- File: `src/pages/admin/churches/[churchId]/MapaPage.tsx`.
- Target: listen to `bounds_changed` on the map, debounce 300ms, refetch contacts within the visible rectangle (Supabase `.gte('lat', sw.lat()).lte('lat', ne.lat())` etc.).
- **Why not done in PR #54**: clustering alone took the cliff from ~2k to ~50k contacts. Viewport queries are the next step beyond that, only relevant once a church passes 50k.

### 7. R4 — lift hooks/utils coverage — ongoing
- `pnpm test:coverage` is wired (PR #51). Baseline: 40.55% line. `lib/` is ~60%, `hooks/` + `utils/` near 0%.
- Target: add tests for the hooks first (`use-church-by-slug`, `use-church-uuid`, `use-permissions`, `use-session`). They're the most-used and least-tested layer.

---

## How to verify the repo state in a new session

```bash
cd /home/user/MJA-CRM
git log --oneline -15           # should show PRs #46–#55
pnpm test                       # 175/175 pass
pnpm run build                  # clean
npx tsc --noEmit -p tsconfig.app.json   # zero errors
cat PENDING.md                  # full state
```

If any of those fail, something drifted on `main` after 2026-05-14.
