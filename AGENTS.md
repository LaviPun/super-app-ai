## Cursor Cloud specific instructions

### Node.js version
This project requires **Node.js 20** (matches CI). Node 22 causes `Unexpected identifier 'assert'` errors at runtime due to breaking changes in ESM import assertions. Use `nvm use 20` before running any commands.

### Quick reference
- **Package manager**: pnpm 9.12.2 (`pnpm-lock.yaml`)
- **Database**: SQLite (file-based, `apps/web/dev.db`) — no external DB server needed
- **Dev server**: `pnpm --filter web dev` (runs Prisma db push + generate + Remix Vite dev on port 3000)
- **Lint**: `pnpm --filter web lint` (ESLint, max 250 warnings)
- **Tests**: `pnpm test` (Vitest across all packages)
- **Typecheck**: `pnpm --filter web typecheck`
- **Build**: `pnpm --filter web build`

### Environment setup
Copy `apps/web/.env.example` to `apps/web/.env` and fill in values. Required variables beyond the example:
- `SCOPES` — must be set (e.g. `read_products`); the env validator (`app/env.server.ts`) will reject boot without it
- `INTERNAL_ADMIN_PASSWORD` — minimum 8 characters
- `INTERNAL_ADMIN_SESSION_SECRET` — minimum 16 characters

CI-safe placeholder values (from `.github/workflows/ci.yml`) work for tests and local dev.

### Workspace packages
`@superapp/core` and `@superapp/rate-limit` must be built (`pnpm -r build` or individual `--filter` builds) before the web app can start. They compile TypeScript to `dist/`.

### Internal admin (no Shopify required)
The internal admin dashboard at `/internal/login` works without Shopify OAuth. Use the password from `INTERNAL_ADMIN_PASSWORD` env var to log in.

### Known test issues
- Live eval tests (`evals.live.test.ts`) are skipped unless `RUN_LIVE_EVALS=1` and a provider API key are set.

### Shopify CLI
Full Shopify embedded app testing (OAuth, extensions, webhooks) requires Shopify CLI (`npm install -g @shopify/cli`) and a Shopify Partner account with a dev store. This is not needed for running the internal admin dashboard, tests, or lint.
