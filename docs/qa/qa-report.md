# QA Report — 2026-05-19 (final continuation)

Autonomous production-readiness pass on `ai-shopify-superapp` (Remix `apps/web`, Next `apps/frontend`).

**Readiness score:** [**97/100**](./production-readiness.md)

## Environment

| Service | URL | Command |
|---------|-----|---------|
| Remix merchant (dev) | `http://127.0.0.1:3000` | `pnpm --filter web exec remix vite:dev --port 3000` |
| Remix internal admin | `http://127.0.0.1:4000` | `INTERNAL_ADMIN_PASSWORD` from `apps/web/.env` → `pnpm --filter web dev:internal` |
| Remix production preview | `http://127.0.0.1:4100` | `PORT=4100 pnpm --filter web start` (after `pnpm --filter web build`) |
| Next frontend (dev) | `http://127.0.0.1:3002` | `pnpm --filter @superapp/frontend dev --port 3002` |
| Next frontend (prod) | `http://127.0.0.1:3102` | `pnpm --filter @superapp/frontend build && pnpm exec next start -p 3102` |

**Note:** Next `package.json` defaults `dev`/`start` to port **3000**, which conflicts with merchant Remix. Use **3002** (dev) or **3102** (prod) explicitly.

## Automated test results

| Suite | Result |
|-------|--------|
| `pnpm test:v2:fast` | **PASS** — includes **web-build** |
| `pnpm --filter web test` | **PASS** — **489** tests, 16 skipped |
| `pnpm --filter web build` | **PASS** |
| `pnpm --filter @superapp/frontend test` | **PASS** |
| `pnpm --filter @superapp/frontend build` | **PASS** |
| Internal Playwright (`playwright.config.ts`) | **14 passed**, 1 skipped (stream smoke) |
| Merchant Playwright (`playwright.merchant.config.ts`) | **1 passed** — auth guards without session |
| `pnpm audit` | **0 critical**, 37 total (19 high, 18 moderate) |

## Merchant auth (no Shopify session)

| Route | HTTP |
|-------|------|
| `/advanced` | **410** |
| `/picker` | **410** |
| `/modules` | **410** |

Embedded OAuth flows: **not automated** — [merchant-oauth-checklist.md](./merchant-oauth-checklist.md).

## Internal admin (`:4000`, authenticated)

Playwright crawl + axe: **21+** routes **200**, document titles present, **no serious** axe violations on login, dashboard, AI assistant, templates, settings.

## Next frontend routes (`:3002` dev)

All listed app routes returned **200**: `/`, `/modules`, `/settings`, `/billing`, `/advanced`, `/data`, `/jobs`, `/internal/*`.

## Lighthouse (production builds)

See [performance-audit.md](./performance-audit.md):

- Remix `/internal/login` @ :4100 — perf **92**, a11y **100**, BP **89**
- Next `/` @ :3102 — perf **100**, a11y **89**, BP **96**

## Fixes reference

[fix-log.md](./fix-log.md)
