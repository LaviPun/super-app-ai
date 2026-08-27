# AI Shopify SuperApp

A single Shopify embedded app that lets non-developers generate safe **modules** (storefront UI, Shopify Functions, app proxy widgets, integrations, automations, customer account UI) from natural-language prompts — **without ever shipping arbitrary code to merchant stores**.

The AI never deploys raw Liquid, JavaScript, or WASM. Instead it produces a **validated RecipeSpec JSON** which is compiled into a fixed set of known-safe deploy operations (metafields, metaobjects, extension config, app proxy config). This gives predictable output, clear plan gating, CWV-friendly storefronts, and a single audit surface.

For what changed recently, see [`CHANGELOG.md`](CHANGELOG.md) (grouped by launch-program workstream).

---

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Key concepts and features](#key-concepts-and-features)
- [Security](#security)
- [Operations and deployment](#operations-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Glossary](#glossary)
- [Security hard rules](#security-hard-rules)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

### The problem space

Most "no-code Shopify customization" tools fall into one of two camps:

1. **App-per-feature stores.** Merchants install dozens of small apps, each with its own dashboard, billing line, theme injection, and performance cost. Theme files get edited; uninstalls leave orphan code; Core Web Vitals suffer.
2. **AI code generators.** A prompt becomes raw Liquid / JavaScript that is pushed into the merchant's theme or app proxy. This is unsafe (theme corruption, XSS, exfiltration, supply-chain risk) and unreviewable for Shopify app review.

This repository takes a third approach. A single Shopify embedded app exposes a small, well-typed set of module surfaces. Merchants describe what they want; an AI returns a **RecipeSpec** — a strict JSON document. The app validates it with Zod, compiles it into deploy operations (metafields, metaobject entries, app proxy config), and renders the result via **generic, config-driven Shopify extensions**. No per-store code is ever generated, compiled, or deployed.

### Who this is for

- **Shopify merchants** on Basic, Shopify, Advanced, or Plus plans who want to add banners, popups, upsells, discount rules, automations, customer account widgets, integrations, etc. without hiring a developer.
- **App operators** (the team running this codebase) who need a single dashboard to manage AI providers, plan tiers, per-store overrides, usage and cost, logs, jobs, traces, webhooks, audit trail, retention, and the internal prompt router.
- **AI / MCP agents** acting on a merchant's behalf — every merchant capability is also exposed under a stable JSON Agent API surface at `/api/agent/*`.

### Why "recipes" and not raw code

Generating raw Liquid/JS/WASM and pushing it into merchant stores is a security and stability nightmare (theme breakage, XSS, exfiltration, supply-chain risk). Shopify app review also requires deterministic, reviewable behavior. So:

1. Prompt → AI returns **RecipeSpec** JSON.
2. RecipeSpec is validated with **Zod** (strict, closed schema).
3. Compiler turns the RecipeSpec into a small, finite set of **deploy operations**:
   - shop metafield / metaobject set / delete (config)
   - app proxy config
   - extension-driven rendering (no direct theme file writes)
4. Merchant previews, publishes, and can roll back. Every publish creates an immutable version row.

This yields **predictable output**, **clear plan gating** (Basic vs Plus), **safer storefront performance**, and a **single audit surface** for compliance and incident response.

### What "superapp" means here

A merchant installs **one** app and gets:

- Storefront UI via a generic, config-driven `theme.section` type (any section/app-block shape, not a fixed catalog — see [`docs/generation.md`](docs/generation.md) §4) plus app proxy widgets
- Shopify Functions (discount rules, delivery / payment / shipping customization, cart and checkout validation, cart transform, fulfillment constraints, local pickup, pickup point, order routing — Plus-gated where required)
- Customer account UI (Preact + Polaris, 64 KB script budget)
- Admin blocks, admin actions, and an admin discount-configuration UI on product, order, and customer detail pages
- Integrations (a handful of built-in connectors plus a connector SDK and Postman-style tester)
- Automation (visual DAG flow builder, cron schedules, Shopify Flow triggers and actions, app-owned data stores) — see [`docs/flows.md`](docs/flows.md) for what's actually wired versus designed
- A curated library of hand-authored templates covering every RecipeSpec type — see [`docs/generation.md`](docs/generation.md) §5 (do not cite a template count; the library is restructured periodically and any count is a snapshot, not a fact)
- A stable Agent API surface so the same operations can be driven by an LLM agent or MCP client

App operators get an **Internal Admin** dashboard for AI provider config, plan tiers, recipe edit, usage / cost, logs, jobs, traces, webhooks, audit log, and an internal Qwen3-based AI assistant.

---

## Architecture

```
Prompt
  └─> Prompt Router (Qwen3 ~4B)        # decides how much context to attach
        └─> Module Generator (OpenAI / Claude)
              └─> RecipeSpec JSON (strict)
                    └─> Zod validation
                          └─> Compiler  ──> DeployOperations
                                └─> Publish (Shopify Admin API)
                                      └─> Versioned + rollbackable
```

The trust boundary is enforced by `packages/core/src/recipe.ts` (the `RecipeSpecSchema` Zod schema) and the compiler in `apps/web/app/services/recipes/compiler/`. Nothing crosses the boundary unless it parses cleanly. Anything outside the closed set of `RECIPE_SPEC_TYPES` (in `packages/core/src/allowed-values.ts`) is rejected.

In production the app runs on **Railway** as a small set of processes (`web`, `worker`, `internal-router`) built from the same `apps/web` Docker image, sharing one Postgres database and one Redis instance — **there is no separate frontend/API/workers split in production.** An earlier "Platform V2" effort attempted that split (`apps/api`, `apps/frontend`, `apps/workers`); that code still sits in the repo tree and still builds under separate `v2-*` CI workflows, but none of it is part of the live topology.

Full reference, including the two AI-model layers (merchant generation vs. internal routing), storefront rendering, and the retired-vs-live inventory: [`docs/architecture.md`](docs/architecture.md).

---

## Project structure

```
ai-shopify-superapp/
├── apps/
│   ├── web/          # THE live app: Remix embedded admin UI, storefront/app-proxy
│   │                  # routes, webhooks, Agent API, Prisma schema, worker + internal-
│   │                  # router entrypoints. Everything below apps/web is what runs.
│   ├── api/           # Retired "Platform V2" split — builds in CI (v2-* workflows),
│   │                  # not part of the live Railway topology.
│   ├── frontend/       # Retired "Platform V2" split — same status as apps/api.
│   └── workers/        # Retired "Platform V2" split — same status as apps/api (distinct
│                        # from apps/web's own worker process).
├── packages/            # 10 shared packages — core, data-layer, db, intent-graph,
│                         # job-orchestration, network-security, observability,
│                         # platform-contracts, rate-limit, security. Most are live
│                         # dependencies of apps/web; see docs/architecture.md §8 for
│                         # which package backs which subsystem.
├── extensions/           # ~30 generic Shopify extensions (theme app extension, checkout
│                          # UI, customer account UI, admin UI/link/print, Shopify
│                          # Functions, Flow triggers/actions, POS, web pixel). None
│                          # generate per-store code — all read config from app-owned
│                          # metaobjects/metafields at render time.
├── deploy/
│   ├── railway-internal-router/   # Railway operator runbook for the internal AI router
│   └── modal-qwen-router/         # Optional Modal HTTPS edge proxy
├── docs/                 # Technical docs — see "Documentation" below
├── scripts/               # Repo-level scripts (e.g. the Liquid budget build/check)
├── shopify.app.toml               # Dev-facing Shopify app config (CLI tunnel URLs)
├── shopify.app.production.toml    # Production Shopify app config (stable Railway URL)
├── docker-compose.dev.yml         # Local Postgres + Redis for development
├── pnpm-workspace.yaml
├── DESIGN.md                      # Design system source of truth
├── CHANGELOG.md                   # Merged changes by launch-program workstream
├── .cursorrules                   # AI-assistant hard rules
└── README.md
```

The `apps/api`/`apps/frontend`/`apps/workers` split above is real code that exists and still builds, but is explicitly **not deployed** — see [`docs/architecture.md`](docs/architecture.md) §2 and §8 for the file-by-file live-vs-retired inventory (do not re-derive it here; that section is the audited source of truth and can drift independently of this file).

---

## Tech stack

| Area | Stack |
|------|-------|
| App framework | **Remix 2** (`@remix-run/*` 2.17.x, Vite 6) |
| UI | **React 18**, **Shopify Polaris 12** + Polaris web components, `@xyflow/react` for the flow builder |
| Language | **TypeScript 5** |
| Validation | **Zod 3** (at every trust boundary) |
| Database | **Prisma 5** — **Postgres** in both production and local dev (via `docker-compose.dev.yml`); see [Getting started](#getting-started) |
| Sessions | `@shopify/shopify-app-session-storage-prisma` |
| Shopify SDKs | `@shopify/shopify-app-remix`, `@shopify/shopify-api`, Shopify CLI — Admin API pinned to `2026-07` (`shopify.app.toml`) |
| AI providers | OpenAI Responses API, Anthropic Messages API, custom OpenAI-compatible, Qwen3 (Ollama / vLLM) — see [`docs/ai-providers.md`](docs/ai-providers.md) |
| Observability | OpenTelemetry SDK, Sentry, structured logs with redaction, request-correlation IDs |
| Testing | **Vitest 3**, Playwright (internal admin E2E) — see [`docs/testing.md`](docs/testing.md) |
| Tooling | pnpm 9 workspaces, ESLint, Husky + lint-staged, Prisma CLI |
| Deploy target | **Railway** (production) — see [`docs/operations.md`](docs/operations.md) |

App distribution is `AppDistribution.AppStore` (`apps/web/app/shopify.server.ts`).

---

## Prerequisites

- **Node** **24.x** (pinned in [`.nvmrc`](.nvmrc); **Node 20.20+** also supported via `engines.node` in `package.json`)
- **pnpm** **9.15.x** (pinned via `packageManager` in root `package.json`; enable with `corepack enable`)
- **Shopify CLI** (`npm i -g @shopify/cli`)
- A **Shopify Partner account** and a **dev store**
- **Docker** (for local Postgres + Redis via `docker-compose.dev.yml`) — or point `DATABASE_URL` at any Postgres instance you already run
- For local AI router (optional): **Ollama** (`qwen3:4b-instruct`) or a vLLM/OpenAI-compatible endpoint

```bash
# Recommended: use the pinned Node version before install/dev
nvm use          # reads .nvmrc → 24
corepack enable  # once per machine, for pinned pnpm
pnpm install
```

---

## Getting started

```bash
# 1. Clone
git clone <repo-url>
cd ai-shopify-superapp

# 2. Install workspace dependencies
pnpm install

# 3. Start local Postgres + Redis
docker compose -f docker-compose.dev.yml up -d
# postgres → localhost:5433 (user/pass/db: superapp), redis → localhost:6380

# 4. Configure environment
cp apps/web/.env.example apps/web/.env
# Set DATABASE_URL to the local Postgres above — see the note below, .env.example's
# committed default currently still shows a SQLite-style path.
# Fill in the rest of the values; see "Environment variables" below.

# 5. (Optional) Seed default AI model pricing rows
pnpm --filter web seed:ai-pricing

# 6. Start the merchant app (port 3000)
pnpm shopify:dev
# or, without the Shopify CLI tunnel:
pnpm --filter web dev
```

`pnpm --filter web dev` itself runs `prisma db push --skip-generate && prisma generate` before starting Remix, so no separate migrate step is needed for a fresh local database once `DATABASE_URL` points at Postgres.

> **Note on `.env.example`:** its committed `DATABASE_URL` default (`file:./dev.db`) predates the WS-A Postgres cutover and has not been updated to match — set it explicitly to `postgresql://superapp:superapp@localhost:5433/superapp` (or your own Postgres URL) rather than trusting the file's default. Production uses Postgres exclusively (`apps/web/prisma/schema.prisma`'s `datasource` block); see [`docs/runbooks/postgres-migration.md`](docs/runbooks/postgres-migration.md) for the cutover history.

For the full Shopify CLI / Partner Dashboard / dev store walkthrough see [`docs/shopify-dev-setup.md`](docs/shopify-dev-setup.md).

### Port topology

| Port | Purpose | Command |
|------|---------|---------|
| **3000** | Merchant-facing embedded app (matches Shopify CLI tunnel) | `pnpm shopify:dev` or `pnpm --filter web dev` |
| **4000** | Internal admin only (separate Remix instance) | `pnpm --filter web dev:internal` |
| **8787** | Reference internal AI router (when run locally) | `pnpm --filter web router:internal` |
| **11434** | Ollama (if you use it as the router backend) | external (`ollama serve`) |
| **5433** | Local Postgres (`docker-compose.dev.yml`) | `docker compose -f docker-compose.dev.yml up -d` |
| **6380** | Local Redis (`docker-compose.dev.yml`) | same |

The Internal Admin lives under `/internal/*` on the merchant app, but `dev:internal` lets operators run a separate process on port 4000 if they want to keep merchant traffic isolated. Both processes share the same database and code; only the host and port differ.

### Local Shopify session

`apps/web/app/shopify.server.ts` boots `shopifyApp({...})` from `@shopify/shopify-app-remix`. Sessions are stored in the Prisma `Session` table via `@shopify/shopify-app-session-storage-prisma`. Because embedded apps run inside Shopify's iframe, you usually need to run `pnpm shopify:dev` (which provides a proper tunnel and Partner Dashboard wiring) — running `pnpm --filter web dev` directly works for non-embedded routes only (`/api/*`, `/internal/*`, `/proxy/*`).

---

## Environment variables

The canonical reference is [`apps/web/.env.example`](apps/web/.env.example). The boot-time Zod check in `apps/web/app/env.server.ts` will fail fast if required vars are missing or malformed (for example, if `ENCRYPTION_KEY` is not a 32-byte base64 string). This section is intentionally short — see the `.env.example` file itself for the full, current list; a hand-copied matrix here would drift the moment a var is added or renamed.

A handful need explanation beyond their name:

| Variable | Why it needs a note |
|----------|----------------------|
| `DATABASE_URL` | Postgres connection string. `.env.example`'s committed default is stale (SQLite-style) — see the callout in [Getting started](#getting-started). |
| `ENCRYPTION_KEY` | 32-byte base64 key used for AES-256-GCM encryption of connector tokens/provider keys at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `SCOPES` | Must match `shopify.app.toml [access_scopes]` exactly, even when running `dev:internal`. |
| `INTERNAL_ADMIN_SESSION_SECRET` | ≥ 16 chars; signs the `__superapp_internal` internal-admin cookie. |
| `LLM_PROVIDER` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Merchant-generation providers are credentials-first — see [`docs/ai-providers.md`](docs/ai-providers.md) for the fallback chain and pitfalls. |
| `INTERNAL_AI_ROUTER_*` | Internal prompt-router tuning (canary shops, shadow mode, circuit breaker). See [`docs/ai-providers.md`](docs/ai-providers.md) and [`docs/internal-admin.md`](docs/internal-admin.md). |
| `CRON_SECRET` | Required if `/api/cron` is exposed; shared secret gating the cron dispatch endpoint. |

> Never commit `.env` files. `.gitignore` already excludes them; secrets/PII must also never appear in logs (enforced by `apps/web/app/services/observability/redact.server.ts`).

---

## Development

The repo uses pnpm workspaces. Most commands are scoped per-package via `pnpm --filter <name>`.

### Root scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run `dev` in every workspace package (rarely what you want — usually `dev:web`) |
| `pnpm dev:web` | Run only the Remix app |
| `pnpm shopify:dev` | `shopify app dev` (tunnel + Partner Dashboard wiring) — needed for embedded auth or extensions |
| `pnpm build` | Build every workspace package |
| `pnpm test` | Run tests in every workspace package (CI parity) — see [`docs/testing.md`](docs/testing.md) |
| `pnpm lint` | Lint every workspace package |
| `pnpm prepare` | Husky install (one-time) |

### `apps/web` scripts (most common)

| Command | What it does |
|---------|--------------|
| `pnpm --filter web dev` | `prisma db push` + `generate`, then Remix on port 3000 |
| `pnpm --filter web dev:internal` | Remix on **4000** + internal AI router on **8787** together |
| `pnpm --filter web build` | Production Remix build |
| `pnpm --filter web start` | Run the production build |
| `pnpm --filter web typecheck` | `tsc --noEmit` |
| `pnpm --filter web lint` | ESLint (`--max-warnings 100`) |
| `pnpm --filter web test` | Vitest run |
| `pnpm --filter web prisma:migrate` | `prisma migrate dev` — after editing `schema.prisma` |
| `pnpm --filter web seed:ai-pricing` | Seed default AI model pricing rows |
| `pnpm --filter web retention:run` | Run the retention purge script |
| `pnpm --filter web router:internal` | Start the reference internal AI router locally |

The full script list (evals, tournament, smoke, e2e, worker) is in `apps/web/package.json` — see [`docs/testing.md`](docs/testing.md) for the test-specific ones, verified against that file rather than hand-copied here.

### Testing extensions locally

`pnpm shopify:dev` runs `shopify app dev`, which starts the Remix app plus a tunnel and registers every extension in `extensions/` with the Partner Dashboard for the configured dev store. Theme app extension blocks need to be added inside the Theme Editor of the dev store; checkout, customer account, and admin UI extensions appear in their respective surfaces once enabled. Shopify Functions need to be associated with the merchant store via the Shopify CLI flow.

---

## Testing

Full reference — test categories, verified local-run commands, CI gates, the eval harness, and how to add a test for a new module type: **[`docs/testing.md`](docs/testing.md)**. Quick start:

```bash
pnpm test                 # everything
pnpm --filter web test    # just the web app
pnpm --filter web evals   # deterministic AI regression suite (StubLlmClient, no network)
```

---

## Key concepts and features

The full reference for each of these lives in a dedicated doc — this section is pointers, not a restatement, to avoid the two docs drifting apart.

| Concept | One-line summary | Full reference |
|---------|-------------------|----------------|
| **RecipeSpec** | The single trust boundary for AI output — a strict, closed Zod schema in `packages/core/src/recipe.ts`. Anything outside it is rejected. | [`docs/generation.md`](docs/generation.md) |
| **`theme.section`** | The storefront type is generic and config-driven, not a fixed list of named types (`theme.banner`/`theme.popup`/etc. were fully collapsed into it) — `config.kind` is a free-form hint, not a schema constraint. | [`docs/generation.md`](docs/generation.md) §4 |
| **Capability matrix** | Modules declare required capabilities; `packages/core/src/capabilities.ts` maps each to a minimum Shopify plan tier, enforced uniformly at validate-spec and publish time. | [`docs/architecture.md`](docs/architecture.md) §4 |
| **Compiler** | Pure `RecipeSpec → DeployOperations` functions, one per type, dispatched by `apps/web/app/services/recipes/compiler/index.ts`. No Shopify calls inside the compiler itself. | [`docs/generation.md`](docs/generation.md) |
| **Versioning and rollback** | Every publish creates an immutable `ModuleVersion` row; `Module.activeVersion` flips on publish, and rollback flips it back. | [`docs/publishing.md`](docs/publishing.md) |
| **Publish / unpublish / rollback** | What `PublishService`, `UnpublishService`, and `RollbackService` actually do to a merchant's store, including the per-op ledger and partial-failure handling. | [`docs/publishing.md`](docs/publishing.md) |
| **Theme placement via universal slots** | The Theme Editor can't enumerate dynamic module lists, so theme app extensions expose generic "slot" blocks; module assignment happens inside the app. | [`docs/generation.md`](docs/generation.md), [`docs/architecture.md`](docs/architecture.md) §7 |
| **Module templates** | A curated library of hand-authored, Zod-valid `RecipeSpec` templates, one per RecipeSpec type at minimum. | [`docs/generation.md`](docs/generation.md) §5 |
| **Connectors** | Built-in connectors (Shopify, HTTP, Slack, Email, Storage) plus a connector SDK; every outbound call is SSRF-guarded. | [`docs/architecture.md`](docs/architecture.md) |
| **Flow / workflow engine** | The `flow.automation` module type and the graph-based `WorkflowEngineService` — including where the designed and implemented systems diverge. | [`docs/flows.md`](docs/flows.md) |
| **Data stores** | Predefined stores (Product, Inventory, Order, Analytics, Marketing, Customer) plus custom app-owned stores, CRUD-able from the UI, flows, and the Agent API — including schema-validated ("typed") stores. | [`docs/data-models.md`](docs/data-models.md) |
| **Agent API** | The full `/api/agent/*` surface mirrors what the merchant UI can do. Discovery index: `GET /api/agent`. | [`docs/data-models.md`](docs/data-models.md) §4, [`docs/generation.md`](docs/generation.md) |
| **AI providers** | Two model layers — frontier models (OpenAI/Anthropic) for merchant generation, small self-hosted Qwen3 for internal routing/assistant — plus the fallback chain. | [`docs/ai-providers.md`](docs/ai-providers.md) |
| **Internal admin** | Operator dashboard at `/internal/*`: AI providers, stores, usage, logs, jobs, traces, the internal AI assistant, model setup. | [`docs/internal-admin.md`](docs/internal-admin.md) |

---

## Security

Full reference (auth strategy, per-shop CSP, SSRF protections, secret redaction, encryption at rest, correlation-id tracing): [`docs/architecture.md`](docs/architecture.md) §5.

High-level summary:

- **No arbitrary code deployment.** The AI outputs RecipeSpec JSON only, strictly Zod-validated; the compiler emits deploy operations from a finite, pre-defined set.
- **SSRF protections and allowlists** on every outbound connector call and Flow-action request (`apps/web/app/services/connectors/connector.service.ts`).
- **Secret redaction in logs** before anything leaves the process (`apps/web/app/services/observability/redact.server.ts`).
- **Encryption at rest** (AES-256-GCM) for connector tokens, provider keys, and SSO secrets (`apps/web/app/services/security/crypto.server.ts`).
- **Correlation IDs** propagate through every log, job, and AI usage row, joined in the Internal Admin trace view at `/internal/trace/:correlationId`.
- **Internal admin route protection** via `requireInternalAdmin` — a signed, `HttpOnly`/`Secure` cookie guard on every `/internal/*` route, with optional OIDC SSO.

---

## Operations and deployment

Full reference (topology, deploy flow, observability, SLOs, runbook index): **[`docs/operations.md`](docs/operations.md)**.

- **Production** runs on Railway: three processes (`web`, `worker`, `internal-router`) built from the same `apps/web` Docker image, sharing one Postgres database and one Redis instance. See [`docs/operations.md`](docs/operations.md) §1–2.
- **CI** is a single GitHub Actions workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml), triggering on push/PR to `master` plus a nightly schedule — see [`docs/testing.md`](docs/testing.md) §3 for the full job graph and gates.
- **Retention** purges old `AiUsage`/`ApiLog`/`ErrorLog`/`Job` rows per shop's configured window (`pnpm --filter web retention:run`); schedule it under Railway's cron facility or a managed cron service.
- **Webhooks**: compliance topics (`customers/data_request`, `customers/redact`, `shop/redact`), app lifecycle, and domain events are declared in `shopify.app.toml`; each handler is idempotency-guarded (see `apps/web/app/services/flows/idempotency.server.ts`).
- **Internal AI router** can also run standalone via Docker (`apps/web/Dockerfile.internal-router`) or the optional Modal edge proxy in [`deploy/modal-qwen-router/`](deploy/modal-qwen-router/) — see [`deploy/railway-internal-router/`](deploy/railway-internal-router/) for the Railway operator runbook.

---

## Troubleshooting

For known bugs, root causes, and fixes, see the append-only ledger: **[`docs/debug.md`](docs/debug.md)**. It also marks entries `SUPERSEDED` when the underlying constraint (e.g. the old Cloudflare production tunnel) was retired — check there before assuming an old limit still applies.

A couple of setup-time gotchas worth calling out here:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Boot fails with an `ENCRYPTION_KEY` validation error | Key is not 32-byte base64 | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `/internal/...` keeps redirecting to `/internal/login` | Cookie `__superapp_internal` not set / not trusted | Confirm `INTERNAL_ADMIN_SESSION_SECRET` matches between processes; in prod the cookie is `Secure`, so plain-HTTP origins won't work |
| Embedded merchant UI loops the install flow | `SCOPES` doesn't match `shopify.app.toml [access_scopes]` | Align both, then reinstall via `pnpm shopify:dev` |
| Storefront block doesn't render | Theme app extension app embed not enabled, or slot has no module assigned | Enable the app embed in the Theme Editor; assign a module to the slot in the app |
| Internal prompt router calls always fall back to deterministic | Circuit is open, or the shop isn't in `INTERNAL_AI_ROUTER_CANARY_SHOPS` | Wait out `INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS`, add the shop to canary, or unset the canary var to allow all shops |
| Internal prompt router responds `401` | Missing/bad `INTERNAL_AI_ROUTER_TOKEN`, or `ROUTER_REQUIRE_AUTH` is on | Confirm token parity between the Remix app and the router (`apps/web/scripts/internal-ai-router.ts`) |
| Internal prompt router responds `429` | Per-tenant rate limit hit (`ROUTER_TENANT_RATE_*`, `ROUTER_TENANT_MAX_ACTIVE_REQUESTS`) | Reduce concurrency, or raise the limit in the router's env — local/Docker `.env`, or the Railway internal-router service's env in production |
| Webhook handler runs twice on retry | Idempotency guard not applied | Use `apps/web/app/services/flows/idempotency.server.ts` — return early when it returns `false` |
| Plan gate blocks publish unexpectedly | Module declares a capability with a higher `MIN_PLAN_FOR_CAPABILITY` than the shop's tier (`packages/core/src/capabilities.ts`) | Either downgrade the spec (drop the capability) or upgrade the shop's plan tier |
| Connector test/dispatch fails with an SSRF error | Target URL not in the connector's allowlist, uses plain HTTP, or resolves to a private/metadata IP | Add the host to the connector's allowlist; use HTTPS; private/metadata-range IPs are blocked by design (`assertSafeTargetUrl`, `packages/network-security/src/ssrf.ts`) |
| Tests fail with `ENCRYPTION_KEY` missing | `apps/web/vitest.config.ts`'s `test.env` only auto-injects `INTERNAL_ADMIN_SESSION_SECRET` — `ENCRYPTION_KEY` is not set there | Export it in your shell before running tests (matches how `.github/workflows/ci.yml`'s workflow-level `env:` block supplies it in CI) |

---

## Glossary

- **RecipeSpec** — strict Zod-validated JSON document the AI must produce. Single trust boundary between AI output and deploy operations. Schema lives in `packages/core/src/recipe.ts`.
- **Module** — a published RecipeSpec instance. Has versions and an active version pointer.
- **Module Version** — immutable snapshot of a spec; rollback flips the active pointer.
- **Capability** — declared requirement (e.g. `THEME_ASSETS`, `DISCOUNT_FUNCTION`). Mapped to a minimum Shopify plan tier in `packages/core/src/capabilities.ts`.
- **Plan tier** — `BASIC | SHOPIFY | ADVANCED | PLUS`. Determines which capabilities are allowed.
- **Slot** — generic theme app extension block. Merchants drop slots into the Theme Editor; module assignment happens in the app.
- **Connector** — an external API integration (HTTP, Slack, Email, Storage, or custom via SDK). Each has its own allowlist and SSRF-guarded calls.
- **Data Store** — app-owned database table (predefined or custom). CRUD-able via UI, flows, and Agent API.
- **Internal router** — small Qwen3-based service that decides how much structured context to attach before the main RecipeSpec LLM call. Self-hosted via local process, Docker, or Railway.
- **Correlation ID** — request-scoped id propagated through every log, job, and AI usage row. Powers the unified trace view at `/internal/trace/:correlationId`.
- **Activation** — the live Shopify object (discount node, delivery/payment customization, etc.) that makes a deployed Function actually execute; tracked in `FunctionActivation`. See [`docs/publishing.md`](docs/publishing.md).

---

## Security hard rules

These rules are enforced project-wide and live in [`.cursorrules`](.cursorrules):

1. **No arbitrary merchant-provided code is deployed.** AI must output **RecipeSpec JSON only**.
2. Follow **SOLID**; keep services pure and testable.
3. Prefer **Zod schema validation** at every trust boundary.
4. **No heavy frontend dependencies.** Storefront outputs must be **CWV-friendly**.
5. For network calls, enforce **SSRF protections and allowlists**.
6. Comments only for complex logic; no narration of obvious code.
7. **No secrets or PII in logs** (enforced by the redaction utilities).
8. Every phase must ship unit tests, happy-path + edge-case coverage.
9. New "templates" must include `catalogId + schema + compiler + tests`.
10. Prefer **config-driven generic extensions / functions**; avoid per-store compiled code.
11. **Update docs and README** alongside any code change. Follow [`codechange-behave.md`](codechange-behave.md) for change propagation and [`global-audit.md`](global-audit.md) for audit.

---

## Contributing

- Use **pnpm 9** (`packageManager` is pinned).
- Husky + lint-staged run on every commit (ESLint on changed `apps/web/app/**/*.{ts,tsx}` plus `typecheck` across workspaces).
- Match the design system in [`DESIGN.md`](DESIGN.md) — Polaris-first; only fall back to custom primitives when Polaris truly can't express the behavior. In QA mode, flag any code that does not match `DESIGN.md`.
- Follow the change-propagation checklist in [`codechange-behave.md`](codechange-behave.md): every code change updates the relevant docs, the README if user-visible behavior shifts, and `CHANGELOG.md`.
- Sessions and connectors must validate inputs with Zod before touching network or DB.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, Prisma validate, build, tests, and the AI regression suite on every PR — see [`docs/testing.md`](docs/testing.md).

---

## Documentation

The full documentation set lives under [`docs/`](docs/) — see **[`docs/README.md`](docs/README.md)** for the maintained index (canonical docs, planning/status, product/design, audit artifacts). Highlights:

| Doc | Purpose |
|-----|---------|
| [`CHANGELOG.md`](CHANGELOG.md) | Merged changes grouped by launch-program workstream |
| [`docs/architecture.md`](docs/architecture.md) | Process topology, security model, extension architecture, data model summary |
| [`docs/generation.md`](docs/generation.md) | RecipeSpec, canonical value sets, catalog/templates, capability gating |
| [`docs/data-models.md`](docs/data-models.md) | Prisma schema, service-layer conventions, data stores, Agent API |
| [`docs/publishing.md`](docs/publishing.md) | Publish / unpublish / rollback contract |
| [`docs/flows.md`](docs/flows.md) | The `flow.automation` module type and workflow engine reality |
| [`docs/ai-providers.md`](docs/ai-providers.md) | AI provider integration, module-gen vs. internal routing split |
| [`docs/internal-admin.md`](docs/internal-admin.md) | Internal operator dashboard |
| [`docs/operations.md`](docs/operations.md) | Topology, deploy flow, observability, SLOs, runbook index |
| [`docs/testing.md`](docs/testing.md) | Test categories, commands, CI gates, eval harness |
| [`docs/debug.md`](docs/debug.md) | Recurring bugs and known fixes (append-only ledger) |
| [`docs/shopify-dev-setup.md`](docs/shopify-dev-setup.md) | Partner account + dev store + CLI walkthrough |
| [`docs/app.md`](docs/app.md) | Merchant-facing product guide |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Shipped work, stabilization notes, implementation history |
| [`docs/runbooks/`](docs/runbooks/) | Operational runbooks |
| [`docs/audit/`](docs/audit/) | Dated doc-vs-reality audits and the drift ledger |
| [`docs/archive/`](docs/archive/) | Superseded docs, kept for history |
| [`DESIGN.md`](DESIGN.md) | Design system source of truth (typography, color, spacing, motion) |
| [`codechange-behave.md`](codechange-behave.md) | Change-propagation checklist |
| [`global-audit.md`](global-audit.md) | Audit checklist |

---

## License

No `LICENSE` file is currently present in the repository. This project is treated as **private / unlicensed** until an explicit license is added. Contact the project owner before reusing or redistributing any part of this codebase.
