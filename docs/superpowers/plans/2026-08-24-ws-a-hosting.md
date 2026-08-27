# WS-A Hosting & Data (Railway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `apps/web` off `shopify app dev` + trycloudflare tunnel + laptop SQLite onto Railway: Dockerized web + worker services, managed Postgres + Redis, stable domain, GitHub auto-deploys, backups, monitoring, and a real scheduler for `/api/cron`.

**Architecture:** One Docker image (multi-stage pnpm monorepo build) serves both Railway services — the web service runs `prisma migrate deploy && remix-serve`, the worker service runs a Redis-connected skeleton (`scripts/worker.ts`) that WS-C later fills with BullMQ processors. Prisma flips provider `sqlite → postgresql` with a regenerated baseline migration per `docs/runbooks/postgres-migration.md`; a one-shot script copies the existing `dev.db` rows into Postgres. Shopify config splits into `shopify.app.production.toml` (stable Railway URL, no auto-URL rewriting) and `shopify.app.dev.toml` (new dev app, tunnel URLs stay auto-updated).

**Tech Stack:** Railway (Hobby plan), Docker (node:20-alpine + pnpm/corepack), Prisma 5 + Postgres 16, ioredis + Redis 7, Remix (`remix-serve`), Sentry (`@sentry/node`, already wired), GitHub Actions scheduled workflow (cron), healthchecks.io (dead-man's switch), UptimeRobot (uptime).

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-A section, Decision D1) + `docs/runbooks/postgres-migration.md`.

## Global Constraints

- **Price-sensitive (D1):** minimal topology — one web service, one worker service, one Postgres, one Redis, all in one Railway project on the Hobby plan. No extra environments, no replicas. Estimated ~US$13–22/month total (see cost table at the bottom; estimates, verified against Railway's published 2026 rates: ~$10/GB-RAM-month, ~$20/vCPU-month, ~$0.25/GB-month volumes, $0.05/GB egress, $5/month plan fee that is a usage credit).
- Route handler budget stays **≤ 60s** until WS-C moves generation async (`docs/debug.md` §13/§18 remain accurate; Railway removes the tunnel's ~90–100s hard cut, but do NOT relax handler budgets in this workstream).
- Shopify Admin API target: **2026-07** is WS-D's bump; this plan does not touch `apiVersion`.
- Scope re-consent rollout is **WS-D's**. Task 9 deploys config with the existing scope list; it must not add/remove scopes.
- TDD for all code changes; infra tasks end with a verification command and its expected output. Frequent commits.
- Node 20, pnpm via corepack (`packageManager` field governs); all workspace packages build with `tsc` to `dist/`.
- Never commit secrets. Railway variables and GitHub secrets are the only production secret stores. `apps/web/.env` stays local-only (already gitignored).

## Current-state facts (verified 2026-08-24 at `master@6af6df2`)

- `shopify.app.toml:6` — `application_url = "https://distribution-episode-editors-ordinary.trycloudflare.com"`; `shopify.app.toml:56` — `automatically_update_urls_on_dev = true`; `[auth] redirect_urls = [ ]` (line 141).
- `apps/web/prisma/schema.prisma` — `provider = "sqlite"`; 49 models; **no** `autoincrement()`, `@db.*`, `Bytes`, or `Decimal` usages (schema is Postgres-portable as-is). `Session.userId` is `BigInt` (fine on PG). Live data: `apps/web/prisma/dev.db` — **1 Shop row** (`kushtestinfotech.myshopify.com`, plaintext 38-char accessToken) at plan time (roadmap said ~3; re-count at execution).
- Migrations: `apps/web/prisma/migrations/` (7 sqlite migrations, `migration_lock.toml` says `provider = "sqlite"`); prior archives exist at `prisma/_archived_migrations_pre_baseline/` and `prisma/migrations-archive/` — the archive-and-rebaseline pattern is established.
- No Dockerfile for the web app. Reuse patterns exist: `apps/web/Dockerfile.internal-router` (pnpm filtered install), `apps/web/railway.internal-router.toml` (DOCKERFILE builder + `/healthz` healthcheck), `deploy/railway-internal-router/README.md` (root-directory = repo root, PORT injection, env var tables).
- `apps/web/app/env.server.ts` — Zod `EnvSchema` validates ~20 vars; `validateEnv()` is called from `apps/web/app/shopify.server.ts:11`. ~90 distinct `process.env.*` names are read across `apps/web` + `packages` (enumerated in Task 4's registry).
- `apps/web/app/services/security/rate-limit.server.ts:100` — `buildRateLimiter` already returns a Redis-backed limiter (with in-memory fallback) when `REDIS_URL` is set; nothing else consumes `REDIS_URL` yet. `packages/job-orchestration/src/config.ts:31` resolves `QUEUE_REDIS_URL || REDIS_URL` for BullMQ queue mode; mode defaults to `inline`.
- `/api/cron` (`apps/web/app/routes/api.cron.tsx`) — guarded by `X-Cron-Secret` == `CRON_SECRET`, 503 when unset; **no scheduler calls it today**.
- No `/healthz` route in the Remix app (the internal-router script has one at `apps/web/scripts/internal-ai-router.ts:575`; different process).
- Sentry: `apps/web/app/services/observability/sentry.server.ts` lazily inits from `SENTRY_DSN` with redaction; **no DSN configured anywhere, never verified**.
- `apps/web/app/db.server.ts` — bare `new PrismaClient()` (no datasource URL manipulation; pooling params must ride the `DATABASE_URL` query string).
- `Shop.accessToken` plaintext. Real-token writers (all `accessToken: session.accessToken ?? ''`): `apps/web/app/routes/_index.tsx:37`, `api.support.create.tsx:52`, `billing._index.tsx:22`, `generate._index.tsx:54`, `jobs._index.tsx:64`, `logs._index.tsx:19`, `modules._index.tsx:22`, `settings._index.tsx:25`, `support._index.tsx:16`. Empty-string upserts (`accessToken: ''` — no change needed): `api.ai.create-module.tsx:64`, `api.ai.modify-module.tsx:31`, `api.ai.modify-module-confirm.tsx:35`, `api.ai.create-blueprint.tsx:40`, `api.ai.create-module-from-recipe.tsx:33`, `api.ai.fill-settings.tsx:49`, `api.ai.create-module.stream.tsx:105`, `api.modules.from-template.tsx:96`. Readers of `shop.accessToken` from the DB: `apps/web/app/services/connectors/connector.service.ts:135` (select; used a few lines below), `services/workflows/shopify-flow-bridge.ts:298,310`, `services/data/data-store.service.ts:186,205`, `services/modules/module.service.ts:159,164`, `services/flows/auth-resolver.server.ts:23,31`. Crypto helpers exist: `apps/web/app/services/security/crypto.server.ts` (`encryptJson`/`decryptJson`, AES-256-GCM keyed by `ENCRYPTION_KEY`).
- `apps/web/package.json` — `"start": "remix-serve build/server/index.js"` (binds `PORT`); `prisma` is a **devDependency** (matters for `migrate deploy` in the image); web depends on workspace packages `@superapp/core`, `job-orchestration`, `network-security`, `platform-contracts`, `rate-limit`, `workers` (the last lives at `apps/workers` — V2, slated for deletion in WS-I/D2, but `apps/web/app/services/preview/preview-export.queue.server.ts:8` imports from it today, so the image must still build it).
- `.github/workflows/` — `ci.yml` + v2 workflows; no deploy workflow, no cron workflow.

## File structure (created/modified by this plan)

```
docker-compose.dev.yml                                  # NEW — local Postgres 16 + Redis 7 for dev
apps/web/Dockerfile                                     # REPLACE — supersedes WS-B's single-stage gate image (same path, same deploy.yml build command keeps working); multi-stage pnpm build, shared by web+worker
apps/web/.dockerignore -> /.dockerignore                # MODIFY — at repo root (build context is repo root); WS-B extended it, append-only here
apps/web/docker-start.sh                                # NEW — migrate deploy + remix-serve
apps/web/railway.web.toml                               # NEW — web service config-as-code
apps/web/railway.worker.toml                            # NEW — worker service config-as-code
apps/web/prisma/schema.prisma                           # MODIFY — provider = "postgresql"
apps/web/prisma/migrations/                             # REGENERATED — single Postgres baseline
apps/web/prisma/migrations-archive-sqlite-20260824/     # NEW — old sqlite migrations parked
apps/web/scripts/migrate-sqlite-to-postgres.ts          # NEW — one-shot data copy dev.db → PG
apps/web/scripts/worker.ts                              # NEW — worker service skeleton
apps/web/scripts/sentry-smoke.ts                        # NEW — one-shot Sentry event verifier
apps/web/scripts/encrypt-shop-tokens.ts                 # NEW — re-encrypt existing Shop.accessToken rows
apps/web/app/env.server.ts                              # MODIFY — full env registry + prod fail-fast
apps/web/app/routes/healthz.tsx                         # NEW — DB+Redis health resource route
apps/web/app/services/shops/access-token.server.ts      # NEW — seal/open helpers for Shop.accessToken
apps/web/app/__tests__/env-registry.test.ts             # NEW
apps/web/app/__tests__/healthz.test.ts                  # NEW
apps/web/app/__tests__/access-token-seal.test.ts        # NEW
shopify.app.production.toml                             # NEW — prod app config (existing client_id)
shopify.app.dev.toml                                    # NEW — dev app config (new client_id)
shopify.app.toml                                        # DELETED (after both replacements verified)
.github/workflows/cron.yml                              # NEW — 5-min scheduler for /api/cron
docs/runbooks/postgres-migration.md                     # MODIFY — mark executed, record deltas
```

---

### Task 1: Local Postgres/Redis dev stack + Prisma provider flip + Postgres baseline migration

Executes runbook steps 1–4 (`docs/runbooks/postgres-migration.md`) with one approved deviation: instead of an "additive-only" migration on top of sqlite history, we **archive the sqlite migrations and regenerate a single Postgres baseline** (the established pattern — see `prisma/_archived_migrations_pre_baseline/`). The old migrations are sqlite SQL and can never run on Postgres; nothing destructive touches any database.

**Files:**
- Create: `docker-compose.dev.yml` (repo root)
- Modify: `apps/web/prisma/schema.prisma` (datasource block, lines 5–11)
- Move: `apps/web/prisma/migrations/` → `apps/web/prisma/migrations-archive-sqlite-20260824/`
- Create (generated): `apps/web/prisma/migrations/<ts>_baseline_postgres/migration.sql` + `migration_lock.toml`
- Modify: `apps/web/.env` (`DATABASE_URL` → local Postgres; not committed)

**Interfaces:**
- Produces: local Postgres at `postgresql://superapp:superapp@localhost:5433/superapp` and Redis at `redis://localhost:6380` — every later task's local verification uses these URLs.
- Produces: `provider = "postgresql"` schema + one baseline migration — Tasks 2, 3, 8 depend on `prisma migrate deploy` applying cleanly to an empty Postgres.

- [ ] **Step 1: Baseline validation on the current sqlite state (runbook step 1)**

Run: `pnpm --filter web exec prisma validate && pnpm --filter web exec prisma generate`
Expected: both succeed (proves any later failure comes from our change).

- [ ] **Step 2: Write `docker-compose.dev.yml`**

```yaml
# Local dev datastore stack. Ports offset (+1) to avoid clashing with any
# system Postgres/Redis. Start with: docker compose -f docker-compose.dev.yml up -d
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: superapp
      POSTGRES_PASSWORD: superapp
      POSTGRES_DB: superapp
    volumes:
      - superapp-pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
volumes:
  superapp-pgdata:
```

- [ ] **Step 3: Start the stack and verify**

Run: `docker compose -f docker-compose.dev.yml up -d && docker compose -f docker-compose.dev.yml ps`
Expected: `postgres` and `redis` both `running`. Then `docker exec $(docker compose -f docker-compose.dev.yml ps -q postgres) pg_isready -U superapp` → `accepting connections`.

- [ ] **Step 4: Archive the sqlite migrations**

Run:
```bash
git mv apps/web/prisma/migrations apps/web/prisma/migrations-archive-sqlite-20260824
```

- [ ] **Step 5: Flip the datasource provider**

In `apps/web/prisma/schema.prisma`, replace the datasource block:

```prisma
datasource db {
  // Postgres everywhere since the 2026-08-24 Railway cutover (WS-A).
  // Local dev: docker-compose.dev.yml (postgresql://superapp:superapp@localhost:5433/superapp).
  // History: sqlite era archived at prisma/migrations-archive-sqlite-20260824/;
  // cutover per docs/runbooks/postgres-migration.md.
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 6: Point local `DATABASE_URL` at Postgres**

In `apps/web/.env` set:
```
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public"
```

- [ ] **Step 7: Generate the Postgres baseline migration (runbook steps 3–4)**

Run:
```bash
cd apps/web
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" \
  pnpm exec prisma migrate dev --name baseline_postgres
```
Expected: one new folder `prisma/migrations/<timestamp>_baseline_postgres/` and `migration_lock.toml` now reads `provider = "postgresql"`. Review the generated `migration.sql`: it must contain only `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX` / `ALTER TABLE ... ADD CONSTRAINT` statements — zero `DROP` statements (runbook step 4).

- [ ] **Step 8: Validate + regenerate client**

Run: `pnpm --filter web exec prisma validate && pnpm --filter web exec prisma generate`
Expected: success.

- [ ] **Step 9: Run the web test suite against Postgres**

Run:
```bash
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" pnpm --filter web test
```
Expected: same pass/fail set as on `master` before this change (run `git stash && pnpm --filter web test && git stash pop` first if you need the baseline). If a test fails **only** under Postgres, the failure names the sqlite-specific assumption (date/string/JSON semantics — runbook "Risks" §1); fix that test/code in this task before proceeding, and record the delta in the Task 12 runbook update.

- [ ] **Step 10: Verify `pnpm --filter web dev` still boots**

Run: `pnpm --filter web dev` (Ctrl-C after boot). The `dev` script starts with `prisma db push` which must succeed against local Postgres.
Expected: Vite dev server starts; no Prisma provider errors.

- [ ] **Step 11: Commit**

```bash
git add docker-compose.dev.yml apps/web/prisma
git commit -m "feat(ws-a): flip Prisma to Postgres with regenerated baseline + local dev stack

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SQLite → Postgres data migration script

One-shot, idempotent copy of every row in `apps/web/prisma/dev.db` into a Postgres database. Generic across all 49 models (reads table order out of Prisma's DMMF, resolves FK ordering by fixed-point retry), so the same script performs the production cutover in Task 8.

**Files:**
- Create: `apps/web/scripts/migrate-sqlite-to-postgres.ts`
- Modify: `apps/web/package.json` (add `better-sqlite3` devDependency + `db:copy-sqlite` script)

**Interfaces:**
- Consumes: Task 1's Postgres schema (`prisma migrate deploy`/`migrate dev` already applied to the target).
- Produces: CLI `pnpm --filter web db:copy-sqlite -- --sqlite <path> [--truncate]` where `DATABASE_URL` is the Postgres target. Task 8 runs exactly this against Railway. Exit code 0 + per-table `copied == source` counts on success; non-zero otherwise.

- [ ] **Step 1: Add the dev dependency and script**

Run: `pnpm --filter web add -D better-sqlite3 @types/better-sqlite3`
In `apps/web/package.json` scripts add:
```json
"db:copy-sqlite": "tsx --tsconfig tsconfig.scripts.json scripts/migrate-sqlite-to-postgres.ts"
```

- [ ] **Step 2: Write the script**

`apps/web/scripts/migrate-sqlite-to-postgres.ts`:

```ts
/**
 * One-shot data migration: copies every model's rows from a Prisma SQLite file
 * into the Postgres database at DATABASE_URL. Schema must already be applied
 * (prisma migrate deploy). Idempotent via createMany({ skipDuplicates: true }).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm --filter web db:copy-sqlite -- --sqlite prisma/dev.db
 * Flags:
 *   --sqlite <path>   source db file (required)
 *   --truncate        TRUNCATE all target tables first (local re-runs only; NEVER in prod)
 */
import Database from 'better-sqlite3';
import { Prisma, PrismaClient } from '@prisma/client';

type Row = Record<string, unknown>;

function parseArgs() {
  const args = process.argv.slice(2);
  const sqliteIdx = args.indexOf('--sqlite');
  if (sqliteIdx === -1 || !args[sqliteIdx + 1]) {
    console.error('Missing --sqlite <path>');
    process.exit(1);
  }
  return { sqlitePath: args[sqliteIdx + 1], truncate: args.includes('--truncate') };
}

function coerce(field: Prisma.DMMF.Field, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'DateTime':
      // Prisma/SQLite stores DateTime as epoch-ms integers or ISO strings.
      return typeof value === 'number' ? new Date(value) : new Date(String(value));
    case 'Boolean':
      return value === 1 || value === true || value === '1' || value === 'true';
    case 'BigInt':
      return BigInt(value as number | string);
    case 'Int':
    case 'Float':
      return Number(value);
    default:
      return value; // String / Json-as-String enums etc.
  }
}

async function main() {
  const { sqlitePath, truncate } = parseArgs();
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pg = new PrismaClient();

  // Models in DMMF order; scalar field map per model for coercion.
  const models = Prisma.dmmf.datamodel.models;
  const clientKey = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

  if (truncate) {
    const tables = models.map((m) => `"${m.dbName ?? m.name}"`).join(', ');
    await pg.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    console.log('[copy] target tables truncated');
  }

  type Pending = { model: Prisma.DMMF.Model; rows: Row[] };
  let pending: Pending[] = [];
  const sourceCounts = new Map<string, number>();

  for (const model of models) {
    const table = model.dbName ?? model.name;
    const exists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(table);
    if (!exists) {
      sourceCounts.set(model.name, 0);
      continue;
    }
    const raw = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Row[];
    sourceCounts.set(model.name, raw.length);
    if (raw.length === 0) continue;
    const scalarFields = model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
    const rows = raw.map((r) => {
      const out: Row = {};
      for (const f of scalarFields) {
        if (f.name in r) out[f.name] = coerce(f, r[f.name]);
      }
      return out;
    });
    pending.push({ model, rows });
  }

  // Fixed-point insertion: tables whose FK parents are not yet inserted fail with
  // P2003 and are retried next pass. Terminates when a full pass makes no progress.
  let pass = 0;
  while (pending.length > 0) {
    pass += 1;
    const failed: Pending[] = [];
    for (const item of pending) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pg as any)[clientKey(item.model.name)].createMany({
          data: item.rows,
          skipDuplicates: true,
        });
        console.log(`[copy] pass ${pass}: ${item.model.name} (${item.rows.length} rows) OK`);
      } catch (err) {
        failed.push(item);
        console.log(`[copy] pass ${pass}: ${item.model.name} deferred (${(err as Error).message.split('\n')[0]})`);
      }
    }
    if (failed.length === pending.length) {
      console.error(`[copy] no progress on pass ${pass}; remaining: ${failed.map((f) => f.model.name).join(', ')}`);
      process.exit(1);
    }
    pending = failed;
  }

  // Verify counts.
  let mismatches = 0;
  for (const model of models) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got: number = await (pg as any)[clientKey(model.name)].count();
    const want = sourceCounts.get(model.name) ?? 0;
    const flag = got >= want ? 'OK ' : 'MISMATCH';
    if (got < want) mismatches += 1;
    console.log(`[verify] ${flag} ${model.name}: sqlite=${want} postgres=${got}`);
  }
  await pg.$disconnect();
  sqlite.close();
  if (mismatches > 0) process.exit(1);
  console.log('[copy] done — all tables at or above source counts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run it against local Postgres (this IS the test — real source data, real target)**

Run:
```bash
cd apps/web
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" \
  pnpm run db:copy-sqlite -- --sqlite prisma/dev.db --truncate
```
Expected: exits 0; final lines show `[verify] OK <Model>: sqlite=N postgres=N` for every model with `N > 0` (at plan time: `Shop: sqlite=1 postgres=1`, plus whatever Module/Recipe/Session/AiProvider rows exist) and `[copy] done`.

- [ ] **Step 4: Re-run to prove idempotence**

Run the same command **without** `--truncate`.
Expected: exits 0, all counts unchanged (skipDuplicates absorbs everything).

- [ ] **Step 5: Spot-check a real row**

Run:
```bash
docker exec -i $(docker compose -f docker-compose.dev.yml ps -q postgres) \
  psql -U superapp -d superapp -c "SELECT \"shopDomain\", length(\"accessToken\") FROM \"Shop\";"
```
Expected: the shop domain(s) from dev.db with the same token lengths (e.g. `kushtestinfotech.myshopify.com | 38`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/migrate-sqlite-to-postgres.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(ws-a): generic sqlite→postgres data copy script (DMMF-driven, idempotent)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `/healthz` route (DB + Redis check)

**Files:**
- Create: `apps/web/app/routes/healthz.tsx`
- Test: `apps/web/app/__tests__/healthz.test.ts`

**Interfaces:**
- Produces: `GET /healthz` → `200 {"ok":true,"checks":{"db":"ok","redis":"ok"|"skipped"}}` when healthy; `503` with `"ok":false` when the DB is unreachable or Redis (if configured) fails. Resource route — **no default export**, no auth. Consumed by: Railway healthchecks (Task 7), UptimeRobot (Task 10), Docker verification (Task 5).

- [ ] **Step 1: Write the failing test**

`apps/web/app/__tests__/healthz.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ $queryRaw: queryRaw }),
}));

async function loadRoute() {
  vi.resetModules();
  return import('~/routes/healthz');
}

describe('GET /healthz', () => {
  afterEach(() => {
    queryRaw.mockReset();
    delete process.env.REDIS_URL;
  });

  it('returns 200 with db ok and redis skipped when REDIS_URL unset', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const { loader } = await loadRoute();
    const res = await loader();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, checks: { db: 'ok', redis: 'skipped' } });
  });

  it('returns 503 when the database check throws', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const { loader } = await loadRoute();
    const res = await loader();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks.db).toBe('fail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/healthz.test.ts`
Expected: FAIL — cannot resolve `~/routes/healthz`.

- [ ] **Step 3: Write the route**

`apps/web/app/routes/healthz.tsx`:

```tsx
/**
 * Liveness/readiness probe for Railway healthchecks + external uptime monitors.
 * Resource route (no default export): loader-only, unauthenticated, cheap.
 * DB failure => 503 (service is not usable). Redis failure => 503 only when
 * REDIS_URL is configured; absent Redis reports "skipped" (dev without Redis).
 */
import { json } from '@remix-run/node';
import Redis from 'ioredis';
import { getPrisma } from '~/db.server';

let redisClient: Redis | null | undefined;

function getHealthRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  redisClient = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 })
    : null;
  return redisClient;
}

export async function loader() {
  const checks: { db: 'ok' | 'fail'; redis: 'ok' | 'fail' | 'skipped' } = {
    db: 'fail',
    redis: 'skipped',
  };

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    // stays 'fail'
  }

  const redis = getHealthRedis();
  if (redis) {
    try {
      checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
  }

  const ok = checks.db === 'ok' && checks.redis !== 'fail';
  return json({ ok, checks }, { status: ok ? 200 : 503 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run app/__tests__/healthz.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Live check against the dev stack**

Run: `pnpm --filter web dev` in one shell; in another:
`curl -s http://localhost:3000/healthz` (use the port the dev server prints).
Expected: `{"ok":true,"checks":{"db":"ok","redis":"skipped"}}`. Then with `REDIS_URL=redis://localhost:6380` exported before starting dev, expect `"redis":"ok"`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/healthz.tsx apps/web/app/__tests__/healthz.test.ts
git commit -m "feat(ws-a): /healthz resource route checking Postgres + Redis

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Env/flag registry — every var in the validated schema, fail-fast in production

`validateEnv()` already runs at boot (`shopify.server.ts:11`). This task makes `EnvSchema` the **complete registry** of every variable the web app and worker read, and adds a production-only required list so a misconfigured Railway service refuses to boot instead of limping. Read-sites keep reading `process.env` (Zod validates the same object at boot); no call-site rewrites.

**Env registry (from `grep -rhoE "process\.env\.[A-Z_0-9]+" apps/web/app apps/web/scripts packages`, deduplicated).** Legend: **P** = required in production (fail-fast), O = optional, D = has default.

| Variable | P/O/D | Meaning / consumer |
|---|---|---|
| `NODE_ENV` | D `development` | runtime mode |
| `DATABASE_URL` | **P** (already required) | Prisma Postgres URL incl. pooling params |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` / `SHOPIFY_APP_URL` / `SCOPES` | **P** (already) | `shopify.server.ts` |
| `SHOPIFY_API_VERSION` | O | override read by scripts only (`shopify-api.server.ts` pins 2026-04) |
| `SHOP_CUSTOM_DOMAIN` | O | custom shop domains for shopifyApp |
| `SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS` | O | deployability guardrail allow-list |
| `ENCRYPTION_KEY` | **P** (already) | AES-256-GCM key (crypto.server.ts, Task 11) |
| `INTERNAL_ADMIN_PASSWORD` / `INTERNAL_ADMIN_SESSION_SECRET` | **P** (already) | internal admin auth |
| `INTERNAL_SSO_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` | O (already) | internal SSO |
| `INTERNAL_SSO_ALLOWED_EMAILS` | O — required-with-issuer via WS-QF's superRefine | internal SSO email allowlist |
| `REDIS_URL` | **P** (new) | rate limiter + healthz + worker |
| `QUEUE_REDIS_URL` | O | BullMQ override; falls back to `REDIS_URL` |
| `QUEUE_PREFIX` / `QUEUE_DEFAULT_ATTEMPTS` / `QUEUE_DEFAULT_BACKOFF_MS` / `PLATFORM_V2_ENABLED` | O/D | `packages/job-orchestration/src/config.ts` |
| `JOB_EXECUTION_MODE` | D `inline` | `inline\|queue\|disabled` (stays `inline` until WS-C) |
| `CRON_SECRET` | **P** (new) | `/api/cron` guard — without it the scheduler is dead |
| `SENTRY_DSN` | **P** (new) | error reporting (Task 10 verifies) |
| `SENTRY_RELEASE` / `SENTRY_TRACES_SAMPLE_RATE` | O | sentry.server.ts |
| `LOG_LEVEL` | D `info` | logger |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` / `OTEL_SERVICE_NAME` / `OTEL_TRACES_SAMPLE_RATE` | O/D (already) | otel.server.ts |
| `ANTHROPIC_API_KEY` | **P** (new) | primary LLM |
| `OPENAI_API_KEY` | **P** (new) | fallback LLM |
| `GEMINI_API_KEY` | O | optional third provider |
| `ANTHROPIC_DEFAULT_MODEL` / `OPENAI_DEFAULT_MODEL` / `GEMINI_DEFAULT_MODEL` | O | model overrides |
| `ANTHROPIC_CODE_EXECUTION` / `ANTHROPIC_SKILLS` | O | Anthropic client feature toggles |
| `LLM_PROVIDER` | O | default provider selection (present in `.env`) |
| `AI_COST_ROUTING_ENABLED` | O flag | cheapest-first routing (default off) |
| `JUDGE_POLISH_ENABLED` | O flag | phase-035 judge polish |
| `PREVIEW_EXPORT_QUEUE_ENABLED` | O flag | preview export queue path |
| `SHOPIFY_DOCS_GROUNDING_DISABLED` | O flag | Dev-MCP docs grounding kill switch |
| `SIDEKICK_EXTENSION_ENABLED` | O flag | sidekick surface |
| `BLUEPRINTS_ENABLED` | O flag | multi-module blueprints |
| `THEME_NATIVE_SECTION_ENABLED` | O flag | native-section push (inert w/o exemption) |
| `THEME_CHECK_GATE` | D on | theme-check publish gate |
| `RELEASE_GLOBAL_KILL_SWITCH` | O flag | global publish kill switch |
| `RELEASE_SURFACE_ADMIN_ENABLED`, `_CHECKOUT_`, `_CUSTOMER_ACCOUNT_`, `_FLOW_`, `_FUNCTIONS_`, `_INTEGRATION_`, `_POS_`, `_THEME_ENABLED` | O flags | per-surface release gates (8 vars) |
| `STRICT_PII_REDACTION` / `BILLING_TEST_MODE` | O (already) | redaction / billing mode |
| `DEFAULT_RETENTION_DAYS` | D 30 (already) | retention |
| `ALLOW_MERCHANT_CODE_EXECUTION` | O flag (already) | must stay off by default |
| `INTERNAL_AI_LOCAL_ONLY` | O flag (already) | internal assistant local-only |
| `INTERNAL_AI_ALLOW_HOSTS` | O | assistant outbound host allow-list |
| `INTERNAL_AI_ROUTER_URL` / `_TOKEN` / `_TIMEOUT_MS` / `_SHADOW` / `_DUAL_TARGET_ENABLED` / `_CANARY_SHOPS` / `_CIRCUIT_FAILURE_THRESHOLD` / `_CIRCUIT_COOLDOWN_MS` | O | internal AI router client |
| `INTERNAL_AI_CHAT_TIMEOUT_MS` / `INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS` / `INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS` | O (partly already) | assistant tuning/retention |
| `MODAL_ROUTER_URL` / `_TOKEN` / `_TIMEOUT_MS` | O | Modal proxy chat |
| `SUPPORT_TRIAGE_PROVIDER` / `_MODEL` / `_URL` / `_TIMEOUT_MS` | O | support triage LLM |
| `EMAIL_CONNECTOR_PROVIDER` / `EMAIL_API_URL` / `EMAIL_API_KEY` / `EMAIL_API_KEY_HEADER` / `EMAIL_API_KEY_PREFIX` / `EMAIL_FROM` / `ADMIN_EMAIL` | O (mostly already; add `EMAIL_API_KEY`) | email connector |
| `SLACK_WEBHOOK_URL` | O | slack connector |
| `APP_URL` | O | legacy alias used once; schema-documented, prefer `SHOPIFY_APP_URL` |
| `PORT` | O | injected by Railway / remix-serve |
| Excluded from schema (dev/test/router-process only — documented here deliberately): `EVAL_*`, `RUN_LIVE_EVALS`, `EVAL_LIVE`, `SMOKE_*`, `TOURNAMENT_LIVE`, `DEBUG_AI_CAPTURE*`, `EVAL_PROVIDER_ID`, and all `ROUTER_*` + `INTERNAL_ROUTER_UPSTREAM_URL` (read only by `scripts/internal-ai-router.ts`, a separate Railway service with its own README env table). | — | — |

**Files:**
- Modify: `apps/web/app/env.server.ts`
- Test: `apps/web/app/__tests__/env-registry.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateEnv(): Env` (same signature) now throws in production when any of `REDIS_URL`, `CRON_SECRET`, `SENTRY_DSN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` is missing/empty, on top of the always-required set. Tasks 5–7 rely on this fail-fast when bringing up containers.

- [ ] **Step 1: Write the failing test**

`apps/web/app/__tests__/env-registry.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { _resetEnvForTest, validateEnv } from '~/env.server';

const BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  SHOPIFY_API_KEY: 'key',
  SHOPIFY_API_SECRET: 'secret',
  SHOPIFY_APP_URL: 'https://example.up.railway.app',
  SCOPES: 'read_products',
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  INTERNAL_ADMIN_PASSWORD: 'longpassword',
  INTERNAL_ADMIN_SESSION_SECRET: 'sixteen-characters',
};

const PROD_ONLY: Record<string, string> = {
  REDIS_URL: 'redis://localhost:6380',
  CRON_SECRET: 'cron-secret-value',
  SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-x',
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = saved;
    _resetEnvForTest();
  }
}

describe('env registry', () => {
  afterEach(() => _resetEnvForTest());

  it('accepts the base set outside production', () => {
    withEnv({ ...BASE, NODE_ENV: 'development' }, () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });

  it('fails fast in production when REDIS_URL is missing', () => {
    withEnv(
      { ...BASE, ...PROD_ONLY, NODE_ENV: 'production', REDIS_URL: undefined },
      () => {
        expect(() => validateEnv()).toThrow(/REDIS_URL/);
      },
    );
  });

  it('fails fast in production when SENTRY_DSN and CRON_SECRET are missing', () => {
    withEnv(
      { ...BASE, ...PROD_ONLY, NODE_ENV: 'production', SENTRY_DSN: undefined, CRON_SECRET: undefined },
      () => {
        expect(() => validateEnv()).toThrow(/SENTRY_DSN[\s\S]*CRON_SECRET|CRON_SECRET[\s\S]*SENTRY_DSN/);
      },
    );
  });

  it('accepts a full production set', () => {
    withEnv({ ...BASE, ...PROD_ONLY, NODE_ENV: 'production' }, () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/env-registry.test.ts`
Expected: the two "fails fast" tests FAIL (current schema does not know these vars are prod-required).

- [ ] **Step 3: Extend `EnvSchema` and add the prod-required gate**

In `apps/web/app/env.server.ts`, inside the `z.object({...})`, add (keep existing fields untouched):

```ts
  // Redis / queue (WS-A)
  REDIS_URL: z.string().min(1).optional(),
  QUEUE_REDIS_URL: z.string().min(1).optional(),
  QUEUE_PREFIX: z.string().optional(),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().optional(),
  QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().optional(),
  JOB_EXECUTION_MODE: z.enum(['inline', 'queue', 'disabled']).default('inline'),
  PLATFORM_V2_ENABLED: z.string().optional(),

  // AI providers
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
  GEMINI_DEFAULT_MODEL: z.string().optional(),
  ANTHROPIC_CODE_EXECUTION: z.string().optional(),
  ANTHROPIC_SKILLS: z.string().optional(),
  LLM_PROVIDER: z.string().optional(),

  // Feature flags (string-boolean via parseBooleanEnv at read sites)
  AI_COST_ROUTING_ENABLED: z.string().optional(),
  JUDGE_POLISH_ENABLED: z.string().optional(),
  PREVIEW_EXPORT_QUEUE_ENABLED: z.string().optional(),
  SHOPIFY_DOCS_GROUNDING_DISABLED: z.string().optional(),
  SIDEKICK_EXTENSION_ENABLED: z.string().optional(),
  BLUEPRINTS_ENABLED: z.string().optional(),
  THEME_NATIVE_SECTION_ENABLED: z.string().optional(),
  THEME_CHECK_GATE: z.string().optional(),
  RELEASE_GLOBAL_KILL_SWITCH: z.string().optional(),
  RELEASE_SURFACE_ADMIN_ENABLED: z.string().optional(),
  RELEASE_SURFACE_CHECKOUT_ENABLED: z.string().optional(),
  RELEASE_SURFACE_CUSTOMER_ACCOUNT_ENABLED: z.string().optional(),
  RELEASE_SURFACE_FLOW_ENABLED: z.string().optional(),
  RELEASE_SURFACE_FUNCTIONS_ENABLED: z.string().optional(),
  RELEASE_SURFACE_INTEGRATION_ENABLED: z.string().optional(),
  RELEASE_SURFACE_POS_ENABLED: z.string().optional(),
  RELEASE_SURFACE_THEME_ENABLED: z.string().optional(),

  // Internal AI router client + Modal proxy + triage
  INTERNAL_AI_ALLOW_HOSTS: z.string().optional(),
  INTERNAL_AI_ROUTER_URL: z.string().url().optional(),
  INTERNAL_AI_ROUTER_TOKEN: z.string().optional(),
  INTERNAL_AI_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_ROUTER_SHADOW: z.string().optional(),
  INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED: z.string().optional(),
  INTERNAL_AI_ROUTER_CANARY_SHOPS: z.string().optional(),
  INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  MODAL_ROUTER_URL: z.string().url().optional(),
  MODAL_ROUTER_TOKEN: z.string().optional(),
  MODAL_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  SUPPORT_TRIAGE_PROVIDER: z.string().optional(),
  SUPPORT_TRIAGE_MODEL: z.string().optional(),
  SUPPORT_TRIAGE_URL: z.string().url().optional(),
  SUPPORT_TRIAGE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // Email / Slack connectors (EMAIL_API_KEY was read but never registered)
  EMAIL_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Shopify misc
  SHOPIFY_API_VERSION: z.string().optional(),
  SHOP_CUSTOM_DOMAIN: z.string().optional(),
  SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS: z.string().optional(),
  APP_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().optional(),
```

Then, replace the body of `validateEnv()`'s success path with a prod-required check. Note: the schema object now ends in WS-QF's `.superRefine(...)` — keep it; only the `validateEnv` body is replaced.

```ts
const PROD_REQUIRED = [
  'REDIS_URL',
  'CRON_SECRET',
  'SENTRY_DSN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
] as const;

export function validateEnv(): Env {
  if (_env) return _env;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[env] Boot failed — invalid environment:\n${issues}`);
  }

  if (result.data.NODE_ENV === 'production') {
    const missing = PROD_REQUIRED.filter((k) => {
      const v = result.data[k];
      return v === undefined || v === '';
    });
    if (missing.length > 0) {
      throw new Error(
        `[env] Boot failed — required in production but missing:\n${missing
          .map((k) => `  • ${k}`)
          .join('\n')}`,
      );
    }
  }

  _env = result.data;
  return _env;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run app/__tests__/env-registry.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Run the full web suite (schema widening must not break existing tests)**

Run: `DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" pnpm --filter web test`
Expected: same results as Task 1 Step 9.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/env.server.ts apps/web/app/__tests__/env-registry.test.ts
git commit -m "feat(ws-a): complete env registry in EnvSchema + production fail-fast

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Dockerfile + .dockerignore + start script, verified locally against Postgres

One image for both services. Build context is the **repo root** (monorepo). `prisma` stays a devDependency and the runtime stage keeps the full install — that is deliberate: `prisma migrate deploy` must run at container start, and Railway bills RAM/CPU, not image size. (A later `pnpm deploy --prod` slimming is possible but out of scope.)

**Files:**
- Replace: `apps/web/Dockerfile` — supersedes WS-B's single-stage gate image (same path, same deploy.yml build command keeps working)
- Modify: `.dockerignore` (repo root — the build context root is what matters; WS-B extended it)
- Create: `apps/web/docker-start.sh`

**Interfaces:**
- Consumes: Task 1's Postgres schema/migrations, Task 3's `/healthz`, Task 4's fail-fast env.
- Produces: image whose default CMD serves web on `$PORT` (default 3000) after `prisma migrate deploy`; worker service overrides the start command (Task 6/7) with `pnpm --filter web worker:start` on the same image.

- [ ] **Step 1: Extend the root `.dockerignore`**

MODIFY the existing root `.dockerignore` (WS-B extended it): keep every existing line, and append only the lines not already present from this list:

```
apps/web/build
apps/web/prisma/dev.db
apps/web/prisma/migrations-archive*
apps/web/prisma/_archived_migrations_pre_baseline
docs
specs
vault
.env
**/.env
**/.env.*
__pycache__
*.md
!apps/web/README.md
```

Do NOT remove `**/target` or `.claude`.

- [ ] **Step 2: Write `apps/web/docker-start.sh`**

```sh
#!/bin/sh
# Web-service entrypoint: apply migrations, then serve.
# Fails the deploy (and Railway keeps the previous one) if migrate deploy fails.
set -e
cd /app/apps/web
pnpm exec prisma migrate deploy
exec pnpm exec remix-serve build/server/index.js
```

Run: `chmod +x apps/web/docker-start.sh`

- [ ] **Step 3: Write `apps/web/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Build context: repository root. Build with:
#   docker build -t superapp-web -f apps/web/Dockerfile .
# One image serves both Railway services:
#   web    (default CMD): prisma migrate deploy + remix-serve on $PORT
#   worker (startCommand override): pnpm --filter web worker:start

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first for install-layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/workers/package.json apps/workers/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/data-layer/package.json packages/data-layer/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/intent-graph/package.json packages/intent-graph/package.json
COPY packages/job-orchestration/package.json packages/job-orchestration/package.json
COPY packages/network-security/package.json packages/network-security/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/rate-limit/package.json packages/rate-limit/package.json
COPY packages/security/package.json packages/security/package.json
RUN pnpm install --frozen-lockfile --filter web...

# Sources.
COPY packages packages
COPY apps/workers apps/workers
COPY apps/web apps/web

# Build web's workspace dependencies in topological order, then the app.
RUN pnpm --filter "web^..." build
RUN pnpm --filter web exec prisma generate
RUN pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN chmod +x /app/apps/web/docker-start.sh
EXPOSE 3000
CMD ["/app/apps/web/docker-start.sh"]
```

- [ ] **Step 4: Build the image**

Run: `docker build -t superapp-web -f apps/web/Dockerfile .`
Expected: completes; the `pnpm --filter "web^..." build` layer builds `@superapp/platform-contracts`, `network-security`, `security`, `db`, `core`, `rate-limit`, `job-orchestration`, `@superapp/workers`; `remix vite:build` succeeds; the WS-B `deploy.yml` `docker build -f apps/web/Dockerfile` command is unchanged and must stay green against this replacement. If `pnpm --filter "web^..." build` errors because a filtered package lacks a build script, note which and re-run — every workspace package listed above has `"build": "tsc -p tsconfig.json"` (verified), so a failure means a missing `COPY` line.

- [ ] **Step 5: Prepare a local container env file**

Create `apps/web/.env.docker` (gitignored — verify `git check-ignore apps/web/.env.docker` says so; if not, add `apps/web/.env.docker` to `.gitignore` in this step) by copying `apps/web/.env` and overriding:

```
NODE_ENV=production
DATABASE_URL=postgresql://superapp:superapp@host.docker.internal:5433/superapp?schema=public
REDIS_URL=redis://host.docker.internal:6380
SENTRY_DSN=https://placeholder@o0.ingest.sentry.io/0
CRON_SECRET=local-docker-cron-secret
PORT=3000
```
(`SENTRY_DSN` placeholder satisfies fail-fast; a bogus DSN only no-ops sends. Real DSN arrives in Task 10.)

- [ ] **Step 6: Run the container against the local stack**

Run:
```bash
docker run --rm --name superapp-web -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  --env-file apps/web/.env.docker superapp-web
```
Expected: logs show `prisma migrate deploy` reporting migrations already applied (Task 1 applied them), then remix-serve listening. Then:
`curl -s http://localhost:3000/healthz` → `{"ok":true,"checks":{"db":"ok","redis":"ok"}}`.

- [ ] **Step 7: Prove fail-fast**

Run the same `docker run` with `-e SENTRY_DSN=` appended (empty override).
Expected: container exits non-zero; log contains `[env] Boot failed — required in production but missing:` and `SENTRY_DSN`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/Dockerfile apps/web/docker-start.sh .dockerignore .gitignore
git commit -m "feat(ws-a): production Dockerfile (multi-stage pnpm) + start script for apps/web

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Worker service skeleton (Redis/BullMQ connection, health server)

The worker itself (queues, processors, moving generation async) is **WS-C**. Here: a process that boots on the same image, resolves the queue Redis URL through the existing `@superapp/job-orchestration` config, connects, exposes `/healthz`, and heartbeats — so the Railway worker service exists, deploys, and is observably healthy from day one. `JOB_EXECUTION_MODE` stays `inline` (web executes jobs in-process) until WS-C flips it to `queue`.

**Files:**
- Create: `apps/web/scripts/worker.ts`
- Modify: `apps/web/package.json` (add `worker:start` script)

**Interfaces:**
- Consumes: `loadJobOrchestratorConfig()` / `resolveEffectiveMode()` from `@superapp/job-orchestration` (`packages/job-orchestration/src/config.ts`), `REDIS_URL`/`QUEUE_REDIS_URL` from Task 4's registry.
- Produces: `pnpm --filter web worker:start` — long-running process; HTTP `GET /healthz` on `$PORT` (default 8080) returning `200 {"ok":true,"role":"worker","redis":"ok"}` when Redis pings; exits non-zero at boot if no Redis URL is configured. WS-C replaces the idle loop with BullMQ `Worker` instances but keeps this entrypoint + health contract.

- [ ] **Step 1: Write `apps/web/scripts/worker.ts`**

```ts
/**
 * Railway worker service entrypoint (WS-A skeleton).
 *
 * Boots, connects to the queue Redis (QUEUE_REDIS_URL || REDIS_URL via
 * @superapp/job-orchestration config), serves GET /healthz for Railway's
 * healthcheck, and heartbeats. WS-C mounts real BullMQ Workers here; until
 * then JOB_EXECUTION_MODE stays "inline" and this process only proves the
 * service + Redis wiring.
 */
import http from 'node:http';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';

const config = loadJobOrchestratorConfig();
if (!config.queueRedisUrl) {
  console.error('[worker] FATAL: QUEUE_REDIS_URL or REDIS_URL must be set');
  process.exit(1);
}

// maxRetriesPerRequest: null is the BullMQ-required connection setting; use it
// here so WS-C can hand this exact connection config to bullmq Workers.
const redis = new Redis(config.queueRedisUrl, { maxRetriesPerRequest: null });
let redisStatus: 'ok' | 'fail' = 'fail';

redis.on('ready', () => {
  redisStatus = 'ok';
  console.log('[worker] redis ready', { prefix: config.queuePrefix });
});
redis.on('error', (err) => {
  redisStatus = 'fail';
  console.error('[worker] redis error', err.message);
});

const port = Number(process.env.PORT ?? 8080);
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    const ok = redisStatus === 'ok';
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok, role: 'worker', redis: redisStatus }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(port, '0.0.0.0', () => {
  console.log('[worker] health server listening', {
    port,
    mode: resolveEffectiveMode(config),
    queuePrefix: config.queuePrefix,
  });
});

const heartbeat = setInterval(async () => {
  try {
    await redis.ping();
    redisStatus = 'ok';
  } catch {
    redisStatus = 'fail';
  }
}, 30_000);

function shutdown(signal: string) {
  console.log(`[worker] ${signal} — shutting down`);
  clearInterval(heartbeat);
  server.close(() => {
    void redis.quit().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

- [ ] **Step 2: Add the script to `apps/web/package.json`**

```json
"worker:start": "tsx --tsconfig tsconfig.scripts.json scripts/worker.ts"
```

- [ ] **Step 3: Verify locally (no Redis → fail-fast)**

Run: `cd apps/web && env -u REDIS_URL -u QUEUE_REDIS_URL pnpm run worker:start`
Expected: exits 1 with `[worker] FATAL: QUEUE_REDIS_URL or REDIS_URL must be set`.

- [ ] **Step 4: Verify locally (with Redis)**

Run: `cd apps/web && REDIS_URL=redis://localhost:6380 PORT=8080 pnpm run worker:start` and in another shell `curl -s http://localhost:8080/healthz`.
Expected: `{"ok":true,"role":"worker","redis":"ok"}`. Ctrl-C prints the shutdown line and exits 0.

- [ ] **Step 5: Verify inside the Docker image (worker start command works on the same image)**

Run:
```bash
docker run --rm --add-host=host.docker.internal:host-gateway \
  --env-file apps/web/.env.docker -e PORT=8080 -p 8080:8080 \
  superapp-web pnpm --filter web worker:start
```
Then `curl -s http://localhost:8080/healthz` → `{"ok":true,"role":"worker","redis":"ok"}`. (Rebuild the image first: `docker build -t superapp-web -f apps/web/Dockerfile .` — worker.ts is new.)

- [ ] **Step 6: Rate-limiter Redis wiring sanity check (nothing to change — prove it)**

Run:
```bash
cd apps/web && REDIS_URL=redis://localhost:6380 pnpm exec vitest run app/__tests__ -t "rate" 2>/dev/null; \
node -e "
process.env.REDIS_URL='redis://localhost:6380';
" && echo "buildRateLimiter reads REDIS_URL at module load (rate-limit.server.ts:100) — Redis path active whenever the service env sets REDIS_URL"
```
Expected: `apps/web/app/services/security/rate-limit.server.ts` needs **no code change**: `buildRateLimiter` (line 98–113) already returns `FallbackRateLimiter(RedisRateLimiter, InMemory)` when `REDIS_URL` is set. The registry (Task 4) + Railway variable (Task 7) complete the wiring.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/worker.ts apps/web/package.json
git commit -m "feat(ws-a): worker service skeleton — Redis-connected health-served entrypoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Railway topology — project, Postgres, Redis, web, worker, domain, GitHub auto-deploy, backups

Infrastructure task. Everything below is either an exact `railway` CLI command or a precise dashboard action with a verification command. **Do not provision until executing this plan.** Cost notes inline; all prices are estimates at 2026-08 published rates.

**Files:**
- Create: `apps/web/railway.web.toml`
- Create: `apps/web/railway.worker.toml`

**Interfaces:**
- Consumes: the Docker image contract from Tasks 5–6 (default CMD = web; `pnpm --filter web worker:start` = worker; `/healthz` on both).
- Produces: Railway project `superapp` with services `web`, `worker`, `Postgres`, `Redis`; public domain `https://<generated>.up.railway.app` for `web`; auto-deploy on push to `master`. Tasks 8–10 consume the domain and the `DATABASE_URL`/`REDIS_URL` references. This completes the WS-B deploy stub (deploys are Railway-native on push; WS-B's CI gates merges, Railway's "Wait for CI" ties them together).

- [ ] **Step 1: Write the config-as-code files**

`apps/web/railway.web.toml`:
```toml
# Railway web service — set root directory to repo root and point
# "Config-as-code file path" at this file in the service settings.
[build]
builder = "DOCKERFILE"
dockerfilePath = "apps/web/Dockerfile"

[deploy]
healthcheckPath = "/healthz"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
```

`apps/web/railway.worker.toml`:
```toml
# Railway worker service — same image, worker entrypoint.
[build]
builder = "DOCKERFILE"
dockerfilePath = "apps/web/Dockerfile"

[deploy]
startCommand = "pnpm --filter web worker:start"
healthcheckPath = "/healthz"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
```

Commit:
```bash
git add apps/web/railway.web.toml apps/web/railway.worker.toml
git commit -m "feat(ws-a): Railway config-as-code for web + worker services

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Install CLI + login + create project**

```bash
npm install -g @railway/cli
railway login                      # opens browser
railway init --name superapp       # from the repo root; creates project + links dir
railway status                     # Expected: Project: superapp, Environment: production
```

- [ ] **Step 3: Provision Postgres and Redis**

```bash
railway add --database postgres
railway add --database redis
```
Verification: `railway status` (or dashboard) lists `Postgres` and `Redis` services. Cost note: each runs as a small container — est. **$3–6/mo** (Postgres, ~0.3–0.5 GB RAM + volume at ~$0.25/GB-mo) and **$1–3/mo** (Redis, ~0.1–0.25 GB RAM).

- [ ] **Step 4: Create the `web` service from GitHub**

Dashboard (project `superapp`) → **+ New → GitHub Repo** → authorize the GitHub org if prompted → select `LaviPun/ai-shopify-superapp` → branch `master`. Name the service `web`. Immediately open the new service → **Settings**:
  - **Root Directory**: leave `/` (repo root — the Dockerfile expects it).
  - **Config-as-code file path**: `apps/web/railway.web.toml`.
  - **Deploy triggers**: branch `master`, auto-deploy ON. Enable **"Wait for CI"** so a red `ci.yml` blocks deploys (pairs with WS-B).
Cancel/ignore the first build if it starts before variables exist (it will fail env validation by design).

- [ ] **Step 5: Create the `worker` service from the same repo**

Dashboard → **+ New → GitHub Repo** → same repo/branch → name `worker` → Settings → Config-as-code file path: `apps/web/railway.worker.toml`; Root Directory `/`; auto-deploy `master`; "Wait for CI" ON. Do **not** generate a public domain for the worker (healthcheck uses Railway's internal probe).

- [ ] **Step 5b: Resolve the WS-B deploy.yml hook point**

Update `.github/workflows/deploy.yml`: replace the WS-A HOOK POINT comment block with:

```yaml
      # WS-A (2026-08): deploys are Railway-native (GitHub auto-deploy per
      # service, gated by 'Wait for CI'). This job remains as the image-build
      # gate only: master must always docker-build cleanly on a neutral runner.
```

Commit:
```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy.yml hook point resolved — Railway-native deploys, workflow stays as image-build gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Set variables on `web`**

Generate fresh secrets locally first:
```bash
openssl rand -hex 32   # -> CRON_SECRET value
```
Then (each `--set` may be batched into one command; values in `<>` come from `apps/web/.env` / new generation):
```bash
railway variables --service web \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}?connection_limit=5&pool_timeout=10' \
  --set 'REDIS_URL=${{Redis.REDIS_URL}}' \
  --set 'NODE_ENV=production' \
  --set 'SHOPIFY_API_KEY=<from apps/web/.env>' \
  --set 'SHOPIFY_API_SECRET=<from apps/web/.env>' \
  --set 'SCOPES=<from apps/web/.env — must equal the scopes line in shopify.app.toml:119>' \
  --set 'SHOPIFY_APP_URL=https://PLACEHOLDER.up.railway.app' \
  --set 'ENCRYPTION_KEY=<from apps/web/.env>' \
  --set 'INTERNAL_ADMIN_PASSWORD=<NEW value — rotate, do not reuse the laptop one>' \
  --set 'INTERNAL_ADMIN_SESSION_SECRET=<openssl rand -hex 32>' \
  --set 'CRON_SECRET=<openssl rand -hex 32 output>' \
  --set 'SENTRY_DSN=https://placeholder@o0.ingest.sentry.io/0' \
  --set 'ANTHROPIC_API_KEY=<from apps/web/.env>' \
  --set 'OPENAI_API_KEY=<from apps/web/.env>'
```
(`SHOPIFY_APP_URL` and `SENTRY_DSN` get real values in Steps 8 / Task 10.) Prisma pooling: `connection_limit=5&pool_timeout=10` keeps web+worker ≤ 10 connections total against Railway PG's default `max_connections=100` — no PgBouncer needed at this scale.
Verification: `railway variables --service web` prints the full set.

- [ ] **Step 7: Set variables on `worker`**

```bash
railway variables --service worker \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}?connection_limit=5&pool_timeout=10' \
  --set 'REDIS_URL=${{Redis.REDIS_URL}}' \
  --set 'NODE_ENV=production'
```
(The skeleton only needs Redis; DATABASE_URL is pre-wired for WS-C. `worker.ts` does not call `validateEnv()`, so the web-only secrets are not required here.)

- [ ] **Step 8: Generate the web domain and fix `SHOPIFY_APP_URL`**

```bash
railway domain --service web
```
Expected output: a URL like `https://web-production-XXXX.up.railway.app`. Then:
```bash
railway variables --service web --set 'SHOPIFY_APP_URL=https://web-production-XXXX.up.railway.app'
```
Custom domain: **optional, skip for launch** (railway.app subdomain is fine for an embedded app; a custom domain adds DNS + $0 on Railway but another moving part — revisit post-launch).

- [ ] **Step 9: First deploys**

Trigger: `git push origin master` (or dashboard → each service → **Deploy**). Watch:
```bash
railway logs --service web
railway logs --service worker
```
Expected: web logs show `prisma migrate deploy` applying `<ts>_baseline_postgres`, then remix-serve listening; worker logs show `[worker] redis ready` and `[worker] health server listening`. Both deployments turn green (healthchecks pass). Then:
`curl -s https://web-production-XXXX.up.railway.app/healthz` → `{"ok":true,"checks":{"db":"ok","redis":"ok"}}`.
Note: the app is deployed but Shopify still points at the tunnel — that cutover is Task 9. Nothing breaks in the interim.

- [ ] **Step 10: Enable Postgres backups**

Dashboard → `Postgres` service → **Data** (volume) → **Backups** tab → enable **Daily** backups, retention 7 days (the smallest offered). Verification: the Backups tab shows a schedule and, after 24h, a first snapshot. Cost note: backups bill at volume rates — with ~1 GB data, **< $1/mo** (estimate).

- [ ] **Step 11: Record the topology**

Append the project name, service names, domain, and backup schedule to `docs/runbooks/postgres-migration.md` (full doc update happens in Task 12). Commit that with Task 12.

---

### Task 8: Production data cutover (dev.db → Railway Postgres)

**Files:** none (runs Task 2's script).

**Interfaces:**
- Consumes: Task 2's `db:copy-sqlite` CLI; Railway Postgres from Task 7 (schema already applied by the web service's `migrate deploy` on first boot).

- [ ] **Step 1: Get the public Postgres URL**

```bash
railway variables --service Postgres | grep DATABASE_PUBLIC_URL
```
Expected: `postgresql://postgres:<pw>@<region>.proxy.rlwy.net:<port>/railway` (Railway exposes `DATABASE_PUBLIC_URL` on database services; the internal `DATABASE_URL` is not reachable from a laptop).

- [ ] **Step 2: Freeze writes**

Stop any running `shopify app dev` session (laptop is the only writer today). Confirm no local dev server: `lsof -iTCP -sTCP:LISTEN | grep -E "3000|4000" || echo clear` → `clear`.

- [ ] **Step 3: Run the copy (NO `--truncate` — target holds only migrate-deploy schema, zero rows)**

```bash
cd apps/web
DATABASE_URL='postgresql://postgres:<pw>@<region>.proxy.rlwy.net:<port>/railway' \
  pnpm run db:copy-sqlite -- --sqlite prisma/dev.db
```
Expected: exit 0; `[verify] OK` for every model; `Shop` count matches dev.db (re-count first: `sqlite3 prisma/dev.db "SELECT count(*) FROM Shop;"`).

- [ ] **Step 4: Verify through the app**

- `curl -s https://web-production-XXXX.up.railway.app/healthz` → `"ok":true`.
- Dashboard → Postgres → **Data** tab → `Shop` table shows the migrated shop domain(s).

- [ ] **Step 5: Snapshot the moment**

Dashboard → Postgres → Backups → **Create backup now** (manual pre-cutover snapshot, per runbook rollback plan). Expected: snapshot listed.

---

### Task 9: Shopify config split + stable-URL cutover

Splits the single tunnel-bound `shopify.app.toml` into `production` (existing app, `client_id 675f836397310b8c66a6ca2b5a49923c`, Railway URL, **no** URL auto-rewrite) and `dev` (a NEW Partner app so `shopify app dev`'s URL rewriting can never touch production again). Scope **re-consent rollout is WS-D**: this task deploys the config with the scope list byte-identical to `shopify.app.toml:119`; the re-consent banner merchants see is WS-D's to manage.

**Files:**
- Create: `shopify.app.production.toml` (via CLI, then edited)
- Create: `shopify.app.dev.toml` (via CLI, then edited)
- Delete: `shopify.app.toml`

**Interfaces:**
- Consumes: the Railway domain from Task 7 Step 8.
- Produces: `shopify app deploy --config production` as the only path that changes production URLs/config; `shopify app config use dev && shopify app dev` as the daily dev loop.

- [ ] **Step 1: Link the production config to the EXISTING app**

```bash
shopify app config link --config production
```
Prompts: select the org → **select the existing app "Super App AI"** (client_id `675f8363...`). Result: `shopify.app.production.toml` written from the remote app config.

- [ ] **Step 2: Reconcile `shopify.app.production.toml` against the old file**

Run `git diff --no-index shopify.app.toml shopify.app.production.toml` and edit `shopify.app.production.toml` until it contains everything the old file had (extension_directories allow-list with its comments, all `[[webhooks.subscriptions]]`, `[access_scopes]` incl. `optional_scopes`, `[app_proxy]`, `[sidekick]`, all `[metaobjects.*]` blocks) **with these deltas**:

```toml
application_url = "https://web-production-XXXX.up.railway.app"

[build]
automatically_update_urls_on_dev = false
include_config_on_deploy = true

[auth]
redirect_urls = [
  "https://web-production-XXXX.up.railway.app/auth/callback",
  "https://web-production-XXXX.up.railway.app/auth/shopify/callback",
  "https://web-production-XXXX.up.railway.app/api/auth/callback"
]
```
(The three redirect paths are the `@shopify/shopify-app-remix` defaults for `authPathPrefix: '/auth'`; extras are harmless, missing ones break OAuth.) The `scopes = "..."` line must be **byte-identical** to `shopify.app.toml:119`.

- [ ] **Step 3: Create the dev app + config**

```bash
shopify app config link --config dev
```
Prompts: **"Create this project as a new app"** → name `Super App AI Dev`. Result: `shopify.app.dev.toml` with a new client_id. Edit it to mirror production's sections (extensions, webhooks, scopes, app_proxy, sidekick, metaobjects) but keep:
```toml
[build]
automatically_update_urls_on_dev = true
```
and leave `application_url`/`redirect_urls` as whatever the CLI wrote (they get rewritten every `shopify app dev`).

- [ ] **Step 4: Retire the old file and set the daily default**

```bash
git rm shopify.app.toml
shopify app config use dev
```
Expected: `Using configuration file shopify.app.dev.toml`.

- [ ] **Step 4b: Update repo dependents of the old path**

Repo dependents of the old path: (a) in `apps/web/app/__tests__/sidekick-extension.test.ts:7` change the resolved filename to `shopify.app.production.toml`; run the suite — it must stay green. (b) In root `package.json` lint-staged, change the glob `**/shopify.app.toml` to `**/shopify.app*.toml`, and in `scripts/check-shopify-config.mjs` change the `SENTINELS` key `'shopify.app.toml'` to `'shopify.app.production.toml'` (the dev toml is allowed to be dev-stripped — that is its job). Commit these with Task 9.

- [ ] **Step 5: Preview the production version without releasing**

```bash
shopify app deploy --config production --no-release 2>&1 | tee /tmp/deploy-preview.txt
```
This creates an app version WITHOUT releasing it. Inspect the printed version summary: the config section must show the Railway `application_url`, the three redirect URLs, and the full scope list; the extension list must match the allow-list (24 dirs from `extension_directories`). Expected: `New version created` and NOT released.

- [ ] **Step 6: Release the cutover version**

```bash
shopify app deploy --config production
```
Confirm the release prompt. Expected: `New version released`. NOTE (from `shopify.app.toml:105-118` audit comment): this pushes the restored 19-scope list — existing installs will show the "additional permissions" re-consent banner. That rollout (comms, timing) is **WS-D**; coordinate before running this step if merchants are active.

- [ ] **Step 7: Verify in the Partner Dashboard + live install**

- Partner Dashboard → Apps → Super App AI → Configuration: App URL = Railway domain; redirect URLs = the three above.
- Open the app from the dev store's admin (`kushtestinfotech.myshopify.com` → Apps → Super App AI): embedded app loads over the Railway domain (check the iframe src in devtools), login/OAuth round-trips.
- `curl -s -o /dev/null -w '%{http_code}' https://web-production-XXXX.up.railway.app/` → `302` or `200` (Shopify auth redirect is fine; connection reset/timeouts are not).

- [ ] **Step 8: Verify dev loop still works and cannot touch prod**

```bash
shopify app dev   # uses shopify.app.dev.toml (config use dev)
```
Expected: CLI prints it is updating URLs **for the dev app** (`Super App AI Dev`); Partner Dashboard shows the tunnel URL only on the dev app, production app untouched.

- [ ] **Step 9: Commit**

```bash
git add shopify.app.production.toml shopify.app.dev.toml
git commit -m "feat(ws-a): split Shopify config — production on Railway domain, dev on separate app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Observability — Sentry verified, uptime monitor, cron scheduler + dead-man's switch

Chosen cron mechanism (one, planned fully): **GitHub Actions scheduled workflow** hitting `/api/cron` every 5 minutes with the secret, chained to a **healthchecks.io** dead-man ping. Rationale: $0 (public-repo minutes / negligible private minutes), no extra Railway container, and the dead-man switch catches both GitHub-cron silence and app-side failures. Known limitation: GitHub schedules can lag several minutes under load — acceptable for `FlowSchedule` granularity; the healthchecks.io grace window absorbs it.

**Files:**
- Create: `.github/workflows/cron.yml`
- Create: `apps/web/scripts/sentry-smoke.ts`

**Interfaces:**
- Consumes: `/api/cron` guard (`CRON_SECRET` from Task 7 Step 6), `/healthz` (Task 3), Railway domain (Task 7).
- Produces: GitHub repo secrets `CRON_SECRET`, `HEALTHCHECKS_PING_URL`; live Sentry project; UptimeRobot monitor.

- [ ] **Step 1: Create the Sentry project and set the real DSN**

sentry.io → create org/project (platform: Node) on the free Developer tier (est. **$0/mo**, 5k errors). Copy the DSN, then:
```bash
railway variables --service web --set 'SENTRY_DSN=<real dsn>'
railway variables --service worker --set 'SENTRY_DSN=<real dsn>'
```
(Web redeploys automatically on variable change; confirm it goes green.)

- [ ] **Step 2: Write the smoke script**

`apps/web/scripts/sentry-smoke.ts`:
```ts
/**
 * One-shot Sentry verification: sends a tagged test event through the same
 * redaction-wrapped capture path production uses, then flushes.
 * Run: SENTRY_DSN=... pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/sentry-smoke.ts
 */
import { captureError } from '../app/services/observability/sentry.server';
import * as Sentry from '@sentry/node';

async function main() {
  if (!process.env.SENTRY_DSN) {
    console.error('SENTRY_DSN not set');
    process.exit(1);
  }
  captureError(new Error(`ws-a sentry smoke ${new Date().toISOString()}`), {
    requestId: 'ws-a-smoke',
  });
  const flushed = await Sentry.flush(5000);
  console.log(flushed ? 'event flushed — check Sentry Issues' : 'flush timed out');
  process.exit(flushed ? 0 : 1);
}
void main();
```
Before writing, check the actual exported capture function name: `grep -n "export function" apps/web/app/services/observability/sentry.server.ts` — if it is not `captureError`, use the exported error-capture function it does provide (same call shape: `(error, context)`).

- [ ] **Step 3: Verify events flow end-to-end**

```bash
railway run --service web -- pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/sentry-smoke.ts
```
(`railway run` injects the service's variables into a local process.) Expected: `event flushed — check Sentry Issues`, and the event appears in Sentry within a minute with message `ws-a sentry smoke ...`. This closes the "entry/server hooks exist but unverified" gap.

- [ ] **Step 4: Create the healthchecks.io check**

healthchecks.io (free tier, est. **$0/mo**) → New Check → name `superapp-cron` → Period **5 minutes**, Grace **15 minutes** (absorbs GitHub cron lag) → copy the ping URL. Configure its alert integration (email at minimum).

- [ ] **Step 5: Add GitHub repo secrets**

```bash
gh secret set CRON_SECRET --body '<same value as Railway CRON_SECRET>'
gh secret set CRON_BASE_URL --body 'https://web-production-XXXX.up.railway.app'
gh secret set HEALTHCHECKS_PING_URL --body 'https://hc-ping.com/<uuid>'
```
Verification: `gh secret list` shows all three.

- [ ] **Step 6: Write `.github/workflows/cron.yml`**

```yaml
name: cron
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

permissions: {}

jobs:
  tick:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Fire /api/cron
        run: |
          curl --fail-with-body -sS --max-time 60 \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.CRON_BASE_URL }}/api/cron"
      - name: Dead-man's switch ping
        if: success()
        run: curl -fsS --max-time 10 "${{ secrets.HEALTHCHECKS_PING_URL }}"
```

- [ ] **Step 7: Verify the scheduler**

```bash
git add .github/workflows/cron.yml
git commit -m "feat(ws-a): 5-min cron scheduler for /api/cron with dead-man's switch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin master
gh workflow run cron   # manual first run
gh run watch
```
Expected: run green; `/api/cron` response JSON (in the step log) shows `{"ran":0,...}` (no due schedules is fine — a 401/503 is NOT fine); healthchecks.io shows the check **up**. Then wait ≥10 minutes and confirm a scheduled (non-manual) run also succeeded.

- [ ] **Step 8: Dead-man's switch fires when cron stops (negative test)**

Temporarily pause the check's schedule expectation instead of breaking prod: healthchecks.io → the check → verify "Last ping" updates every ~5 min. Then in GitHub → Actions → cron workflow → **Disable workflow** for 25 minutes. Expected: healthchecks.io flips to **down** and sends the alert email. Re-enable the workflow; check returns to up.

- [ ] **Step 9: UptimeRobot monitor on /healthz**

uptimerobot.com (free tier, 5-min interval, est. **$0/mo**) → Add Monitor → type HTTP(s) → URL `https://web-production-XXXX.up.railway.app/healthz` → interval 5 min → alert contact = owner email. Expected: monitor shows **Up** within one cycle. (Railway's own healthcheck restarts unhealthy deploys; UptimeRobot covers the edge/domain path and alerts a human.)

---

### Task 11: Encrypt `Shop.accessToken` at rest

Versioned sealing (`enc1:` prefix) using the existing AES-256-GCM helpers, with plaintext passthrough on read so the deploy order can be code-first, re-encrypt-second, with zero downtime. Explicit non-goal: `Session.accessToken` (line 199 of schema.prisma) stays plaintext — it is owned by `@shopify/shopify-app-session-storage-prisma` (writes bypass our code); flag it to WS-D as a follow-up rather than forking the storage adapter here.

**Files:**
- Create: `apps/web/app/services/shops/access-token.server.ts`
- Create: `apps/web/scripts/encrypt-shop-tokens.ts`
- Modify (writers, all the `session.accessToken ?? ''` sites listed in Current-state facts): `apps/web/app/routes/_index.tsx:37`, `api.support.create.tsx:52`, `billing._index.tsx:22`, `generate._index.tsx:54`, `jobs._index.tsx:64`, `logs._index.tsx:19`, `modules._index.tsx:22`, `settings._index.tsx:25`, `support._index.tsx:16`
- Modify (readers): `apps/web/app/services/connectors/connector.service.ts` (~line 135ff), `services/workflows/shopify-flow-bridge.ts:310`, `services/data/data-store.service.ts:205`, `services/modules/module.service.ts:164`, `services/flows/auth-resolver.server.ts:31`
- Test: `apps/web/app/__tests__/access-token-seal.test.ts`

**Interfaces:**
- Consumes: `encryptJson`/`decryptJson` from `~/services/security/crypto.server` (exact signatures: `encryptJson(value: unknown): string`, `decryptJson<T>(ciphertextB64: string): T`).
- Produces: `sealAccessToken(token: string): string` and `openAccessToken(stored: string | null | undefined): string` from `~/services/shops/access-token.server` — any future code touching `Shop.accessToken` MUST go through these.

- [ ] **Step 1: Write the failing test**

`apps/web/app/__tests__/access-token-seal.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('Shop access token sealing', () => {
  it('seals to an enc1: ciphertext that round-trips', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    const sealed = sealAccessToken('shpua_test_token_1234567890');
    expect(sealed.startsWith('enc1:')).toBe(true);
    expect(sealed).not.toContain('shpua_test_token');
    expect(openAccessToken(sealed)).toBe('shpua_test_token_1234567890');
  });

  it('is idempotent on already-sealed values', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    const once = sealAccessToken('shpua_abc');
    expect(sealAccessToken(once)).toBe(once);
    expect(openAccessToken(once)).toBe('shpua_abc');
  });

  it('passes through legacy plaintext and empty strings', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    expect(openAccessToken('shpua_legacy_plain')).toBe('shpua_legacy_plain');
    expect(openAccessToken('')).toBe('');
    expect(openAccessToken(null)).toBe('');
    expect(sealAccessToken('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/access-token-seal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

`apps/web/app/services/shops/access-token.server.ts`:
```ts
/**
 * At-rest encryption for Shop.accessToken (WS-A).
 *
 * Sealed format: "enc1:" + base64(iv|tag|ciphertext) via crypto.server.ts
 * (AES-256-GCM, ENCRYPTION_KEY). openAccessToken passes legacy plaintext
 * through unchanged so code can deploy before scripts/encrypt-shop-tokens.ts
 * re-encrypts existing rows. Every read/write of Shop.accessToken MUST go
 * through these helpers. (Session.accessToken is the Shopify session-storage
 * adapter's column and is intentionally NOT covered — WS-D follow-up.)
 */
import { decryptJson, encryptJson } from '~/services/security/crypto.server';

const SEAL_PREFIX = 'enc1:';

export function sealAccessToken(token: string): string {
  if (!token) return '';
  if (token.startsWith(SEAL_PREFIX)) return token; // idempotent
  return SEAL_PREFIX + encryptJson(token);
}

export function openAccessToken(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith(SEAL_PREFIX)) return stored; // legacy plaintext
  return decryptJson<string>(stored.slice(SEAL_PREFIX.length));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run app/__tests__/access-token-seal.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Update the 9 writer sites**

In each file listed above, add `import { sealAccessToken } from '~/services/shops/access-token.server';` and change the data line, e.g. `apps/web/app/routes/_index.tsx:37`:
```ts
data: { shopDomain: session.shop, accessToken: sealAccessToken(session.accessToken ?? ''), planTier: 'FREE' },
```
Apply identically at all nine sites (the `api.ai.*`/`api.modules.from-template` sites write `accessToken: ''` and need **no** change — `sealAccessToken('')` would be `''` anyway).
Verify none missed: `grep -rn "accessToken: session" apps/web/app --include='*.tsx' --include='*.ts' | grep -v sealAccessToken` → no output.

- [ ] **Step 6: Update the 5 reader sites**

Wrap each DB-sourced token with `openAccessToken(...)` at point of use (import the helper in each file):
- `connector.service.ts`: where the selected `shop.accessToken` is consumed (a few lines after the `include` at :135) → `openAccessToken(record.shop.accessToken)`.
- `shopify-flow-bridge.ts:310`: `{ type: 'shopify', shop: shopDomain, accessToken: openAccessToken(shopRow.accessToken) }`.
- `data-store.service.ts:205`: `emitFlowTriggerSafe(store.shop.shopDomain, openAccessToken(store.shop.accessToken), ...)`.
- `module.service.ts:164`: `openAccessToken(publishedModule.shop.accessToken)`.
- `auth-resolver.server.ts:31`: `return { type: 'shopify', shop: shop.shopDomain, accessToken: openAccessToken(shop.accessToken) };` (the `!shop.accessToken` emptiness check at :23 still works — sealed values are non-empty).
Verify none missed: `grep -rn "\.accessToken" apps/web/app/services --include='*.ts' | grep -v test | grep -v openAccessToken | grep -v "accessToken:"` and review each remaining hit — every read of a `Shop`-model token must be wrapped (parameter names like `accessToken: string` in `shopify-flow-bridge.ts:138,210` receive already-opened values and stay as-is).

- [ ] **Step 7: Run the full web suite**

Run: `DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" pnpm --filter web test`
Expected: same pass set as Task 4 Step 5, plus the new seal test.

- [ ] **Step 8: Write the re-encryption script**

`apps/web/scripts/encrypt-shop-tokens.ts`:
```ts
/**
 * One-shot, idempotent: seals every plaintext Shop.accessToken in place.
 * Run: DATABASE_URL=... ENCRYPTION_KEY=... pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/encrypt-shop-tokens.ts
 */
import { PrismaClient } from '@prisma/client';
import { openAccessToken, sealAccessToken } from '../app/services/shops/access-token.server';

async function main() {
  const prisma = new PrismaClient();
  const shops = await prisma.shop.findMany({ select: { id: true, shopDomain: true, accessToken: true } });
  let sealed = 0;
  let skipped = 0;
  for (const shop of shops) {
    if (!shop.accessToken || shop.accessToken.startsWith('enc1:')) {
      skipped += 1;
      continue;
    }
    const next = sealAccessToken(shop.accessToken);
    if (openAccessToken(next) !== shop.accessToken) {
      throw new Error(`round-trip mismatch for ${shop.shopDomain} — aborting before write`);
    }
    await prisma.shop.update({ where: { id: shop.id }, data: { accessToken: next } });
    sealed += 1;
    console.log(`[seal] ${shop.shopDomain}: sealed`);
  }
  console.log(`[seal] done — sealed=${sealed} skipped=${skipped}`);
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Local rehearsal**

```bash
cd apps/web
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" \
  pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/encrypt-shop-tokens.ts
```
Expected: `[seal] kushtestinfotech.myshopify.com: sealed`, `done — sealed=1 skipped=0`; second run prints `sealed=0 skipped=1`. Then boot the dev server and load `/modules` for that shop — the app works (readers decrypt).

- [ ] **Step 10: Commit, deploy, then re-encrypt production**

```bash
git add apps/web/app/services/shops/access-token.server.ts \
        apps/web/scripts/encrypt-shop-tokens.ts \
        apps/web/app/__tests__/access-token-seal.test.ts \
        apps/web/app/routes apps/web/app/services
git commit -m "feat(ws-a): encrypt Shop.accessToken at rest (enc1 sealing + legacy passthrough)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin master
```
After the Railway deploy is green:
```bash
railway run --service web -- pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/encrypt-shop-tokens.ts
```
Expected: `sealed=N skipped=M`, then verify: dashboard → Postgres → Data → `Shop` → `accessToken` values all start with `enc1:`, and the embedded app still functions (open it, publish nothing, just browse `/modules`).

---

### Task 12: Decommission the tunnel + truth-up the docs

**Files:**
- Modify: `docs/runbooks/postgres-migration.md`
- Modify: `apps/web/.env` (local only, not committed)

**Interfaces:** none — checklist task.

- [ ] **Step 1: Sweep for tunnel assumptions**

Run: `grep -rn "trycloudflare" --include='*' . 2>/dev/null | grep -v node_modules | grep -v migrations-archive`
Expected hits and dispositions:
- `apps/web/.env` → update `SHOPIFY_APP_URL` note: for local dev the CLI injects the tunnel URL per-run; the committed source of truth for prod is `shopify.app.production.toml`. Leave whatever the last `shopify app dev` wrote — it only affects local runs of the dev app.
- `docs/debug.md` → keep §13/§18 (tunnel-timeout scars) but append one line to each: "Historical: production moved to Railway (WS-A, 2026-08-24); the ≤60s handler budget REMAINS in force until WS-C moves generation async."
- `docs/gitbook/06-internal-admin/internal-ai-assistant.md`, `docs/superpowers/plans/2026-07-13-basic-plan-bundle-pricing.md` → historical docs; leave (WS-J owns the docs rewrite).
- `shopify.app.toml` must NOT appear (deleted in Task 9). If it does, Task 9 is incomplete — stop and finish it.

- [ ] **Step 2: Confirm no prod config auto-rewrites URLs**

Run: `grep -n "automatically_update_urls_on_dev" shopify.app.production.toml shopify.app.dev.toml`
Expected: `false` in production, `true` in dev, and nothing else.

- [ ] **Step 3: Laptop is no longer load-bearing**

Checklist (record answers in the runbook update below):
- `shopify app dev` not running; UptimeRobot still shows `/healthz` Up. ✔ means serving is Railway-only.
- Reboot-safety: Railway healthcheck + `restartPolicyType = "ON_FAILURE"` cover crashes; cron runs from GitHub; backups run daily on Railway. No laptop process remains in any production path.
- `apps/web/prisma/dev.db` is now a historical artifact: do NOT delete in this WS (it is the rollback source until the 7-day burn-in passes — WS-S). Add a line to `.dockerignore` (already done, Task 5) and leave it.

- [ ] **Step 4: Update the runbook**

Prepend to `docs/runbooks/postgres-migration.md`:
```markdown
> **EXECUTED 2026-08-24 (WS-A).** Production runs Postgres on Railway; local dev
> runs Postgres via `docker-compose.dev.yml`. SQLite is retired (dev.db kept as
> rollback artifact until WS-S burn-in). Deviation from the plan below: sqlite
> migrations were archived (`prisma/migrations-archive-sqlite-20260824/`) and a
> single Postgres baseline was regenerated, rather than an additive migration on
> sqlite history. Data copy: `apps/web/scripts/migrate-sqlite-to-postgres.ts`.
> Topology: Railway project `superapp` — services web, worker, Postgres (daily
> backups, 7-day retention), Redis; domain https://web-production-XXXX.up.railway.app.
> Postgres-vs-sqlite test deltas found during cutover: <record here or "none">.
```
Also update the "Local development (default)" section: local default is now the compose Postgres URL, not `file:./dev.db`.

- [ ] **Step 5: Handler-budget note stays accurate**

Run: `grep -rn "60s\|60 s" docs/debug.md | head`
Confirm the ≤60s guidance is still stated as in-force (per Step 1's appended lines) — Railway's edge allows longer requests than the tunnel did, but WS-C owns relaxing budgets. No code change.

- [ ] **Step 6: Final full verification sweep**

```bash
DATABASE_URL="postgresql://superapp:superapp@localhost:5433/superapp?schema=public" pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
curl -s https://web-production-XXXX.up.railway.app/healthz
```
Expected: tests/typecheck/lint at parity with pre-WS-A `master` (or better); healthz `"ok":true`.

- [ ] **Step 7: Commit**

```bash
git add docs/runbooks/postgres-migration.md docs/debug.md
git commit -m "docs(ws-a): runbook executed, tunnel decommissioned, budgets reaffirmed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin master
```

---

## Estimated monthly cost (minimal topology, Railway Hobby plan)

All figures are **estimates** at Railway's published 2026-08 usage rates (~$10/GB-RAM-month, ~$20/vCPU-month, ~$0.25/GB-month volume storage, $0.05/GB egress; Hobby's $5/month is a fee that doubles as a usage credit). Actuals depend on real RAM/CPU draw — check the project's Usage page after the first week.

| Component | Sizing assumption | Est. monthly |
|---|---|---|
| Railway Hobby plan fee | includes $5 usage credit | $5 (credit) |
| `web` service | ~0.5 GB RAM avg, low CPU (Remix, 3 shops) | ~$5–8 |
| `worker` service | skeleton, ~0.2–0.3 GB RAM, idle CPU | ~$2–3 |
| Postgres | ~0.3–0.5 GB RAM + ~1 GB volume | ~$4–6 |
| Redis | ~0.1–0.25 GB RAM | ~$1–3 |
| Daily backups | ~1 GB at volume rates | <$1 |
| Egress | low traffic at $0.05/GB | <$1 |
| GitHub Actions cron | scheduled curl every 5 min | $0 |
| healthchecks.io + UptimeRobot + Sentry | free tiers | $0 |
| **Total** | after the $5 credit nets against usage | **~$13–22/mo** |

## Self-review notes

- Scope coverage vs the WS-A brief: Dockerfile (T5), Prisma→Postgres incl. runbook execution + data script + backups (T1/T2/T7/T8), env/flag registry (T4), Redis + worker skeleton (T6), Railway topology + healthz + domains + GitHub deploys (T3/T7), cutover + config split (T9), observability + cron + dead-man switch (T10), token encryption (T11), decommission (T9/T12). WS-B deploy stub: satisfied by Railway GitHub auto-deploy + "Wait for CI" (T7 Steps 4–5).
- Known deferrals, stated in-plan: `Session.accessToken` encryption (WS-D), `JOB_EXECUTION_MODE=queue` + real BullMQ workers (WS-C), scope re-consent rollout (WS-D), custom domain (optional post-launch), image slimming via `pnpm deploy` (optional).
- Names used consistently: `sealAccessToken`/`openAccessToken`, `db:copy-sqlite`, `worker:start`, `/healthz`, `enc1:`, `railway.web.toml`/`railway.worker.toml`.

## Cross-review reconciliation (2026-08-24)

Edits applied from the cross-plan review:

- **B1** — `apps/web/Dockerfile` marked REPLACE (supersedes WS-B's single-stage gate image) in the file-structure table and Task 5 Files list; Task 5 Step 4 expected output now requires WS-B's `deploy.yml` docker-build command to stay green against the replacement.
- **B2** — Task 5 Step 1 changed from a full rewrite of the root `.dockerignore` to an append-only MODIFY of WS-B's file (never remove `**/target` or `.claude`).
- **B3** — Task 7 gained Step 5b: resolve the WS-B `deploy.yml` WS-A HOOK POINT comment (Railway-native deploys; workflow stays as the image-build gate) with its commit.
- **B4.1** — Task 9 gained Step 4b: retarget `sidekick-extension.test.ts:7`, the lint-staged `**/shopify.app.toml` glob (→ `**/shopify.app*.toml`), and the `check-shopify-config.mjs` `SENTINELS` key to `shopify.app.production.toml`.
- **B8** — Task 4 env registry gained the `INTERNAL_SSO_ALLOWED_EMAILS` row (required-with-issuer via WS-QF's superRefine); Step 3 notes the schema object now ends in WS-QF's `.superRefine(...)` and must keep it.
