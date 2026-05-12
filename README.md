# MJA CRM

CRM interno para gestión de iglesias. React + Vite + TypeScript + Supabase + shadcn/ui.

Deploy producción: [mjatu.casa](https://mjatu.casa) (auto-deploy desde `main` vía Vercel).

## Setup local

```bash
pnpm install            # NO USAR npm. Rompe el lockfile.
cp .env.example .env    # llenar con las credenciales del proyecto
pnpm dev                # arranca en localhost:8080
```

## Scripts

| Comando | Para qué |
|---------|----------|
| `pnpm dev` | Dev server con HMR |
| `pnpm build` | Build de producción a `dist/` |
| `pnpm preview` | Sirve el build local en :4173 |
| `pnpm test` | Vitest (unit tests en `src/**/*.test.ts`) |
| `pnpm lint` | ESLint sobre todo `src/` |
| `pnpm analyze` | Genera `dist/bundle-stats.html` (treemap del bundle) |

## Antes de pushear

`pnpm test` (69/69 verde) + `pnpm run build`. Para enforzarlo automáticamente:

```bash
bash scripts/install-git-hooks.sh    # instala pre-push hook en .git/hooks
```

## Arquitectura

Lectura corta para orientarse: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Cubre stack, modelo de datos, jerarquía de roles, mapa de carpetas, flujo de auth y gotchas conocidos (incluyendo la trampa de chunking React/Radix).

## Vars de entorno

Ver `.env.example`. Las claves se inyectan en build-time vía Vite (`import.meta.env.VITE_*`). El service-role key de Supabase nunca debe estar en `.env` del frontend — solo en edge functions.

## Stack

- Frontend: React 18, Vite, TypeScript, TanStack Query, shadcn/ui (Radix)
- Backend: Supabase (Postgres + PostgREST + Auth + Storage + Edge Functions)
- Errores: Sentry (dynamic import en main.tsx, solo en PROD)
- Deploy: Vercel desde `main`
