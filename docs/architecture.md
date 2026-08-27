# Architecture — AI Shopify SuperApp

> For the merchant-facing pitch and setup instructions, see the root [`README.md`](../README.md). For implementation history, see [`implementation-status.md`](./implementation-status.md).

## 1. What the app is

The SuperApp lets a merchant describe a storefront/checkout/automation need in plain language and get a working Shopify surface out of it — a theme section, a checkout upsell, a discount function, a Flow automation — without hand-written code. The AI layer never emits arbitrary code; it emits a structured **RecipeSpec** that the app validates, compiles into Shopify-native operations, and lets the merchant preview before publishing. See [`docs/generation.md`](./generation.md) for the full generation contract.

---

## 2. High-level architecture

The app runs on Railway as a small set of processes sharing one Postgres database and one Redis instance — there is no separate frontend/API/workers split in production (an earlier "Platform V2" effort attempted that split; its code still sits in the repo tree but is not part of the live topology — see [§8](#8-where-things-live--project-structure)).

Processes, each built from `apps/web`'s Dockerfile with a different entrypoint/config:

| Process | Config | Entrypoint | Role |
|---|---|---|---|
| `web` | `apps/web/railway.web.toml` | Remix server (`build/server`) | Serves the embedded admin UI, storefront app-proxy routes, webhooks, and the `/api/agent/*` surface. |
| `worker` | `apps/web/railway.worker.toml` | `pnpm --filter web worker:start` (`scripts/worker.ts`) | Connects to the queue Redis via `@superapp/job-orchestration` and serves `/healthz`. WS-C (#19) wired the async generation/publish engine into this process: when `JOB_EXECUTION_MODE=queue` and `QUEUE_REDIS_URL` is set, `scripts/worker.ts` mounts real BullMQ `Worker`s (`createWebWorkerRuntime`) for every registered queue (`buildWorkerHandlers()` — today that's `ai-generation`, dispatching `AI_GENERATE`/`AI_HYDRATE`, and `publish`, dispatching `PUBLISH`). **`JOB_EXECUTION_MODE` still defaults to `inline`** (`packages/job-orchestration/src/config.ts`) — work runs synchronously in the `web` process unless the flag is explicitly flipped, so this remains a real deploy decision, not a default. See [`docs/operations.md`](./operations.md) for the two-mode behavior and [`docs/internal-admin.md`](./internal-admin.md#dlq-replay--whats-real-today) for what's still *not* covered (the legacy admin-replay job kinds — `CONNECTOR_TEST`/`FLOW_RUN`/`MESSAGING_RUN`/`HTTP_SYNC_RUN` — have no queue consumer of their own). |
| `internal-router` | `apps/web/railway.internal-router.toml` (`Dockerfile.internal-router`) | `pnpm --filter web router:internal` (`scripts/internal-ai-router.ts`) | Standalone service fronting the internal admin AI assistant's provider routing; see [`docs/internal-admin.md`](./internal-admin.md). |

Shared state: Postgres (via Prisma, `apps/web/prisma/schema.prisma`) is the system of record; Redis backs the job queue (`QUEUE_REDIS_URL`/`REDIS_URL`) and rate limiting. See [`docs/runbooks/postgres-migration.md`](./runbooks/postgres-migration.md) for the SQLite→Postgres cutover history (the runbook predates the cutover — the schema's `datasource` block is the current source of truth, see [§8](#8-where-things-live--project-structure)).

`apps/web` also imports a set of shared `packages/*` libraries (job orchestration, observability, network security, data-layer, etc.) that originated alongside the Platform V2 effort but are live dependencies of the current app — they are not dead code, unlike `apps/api`/`apps/frontend`/`apps/workers` themselves (see [§8](#8-where-things-live--project-structure)).

---

## 3. RecipeSpec at a glance

Every generated or template-created module is a **RecipeSpec**: a Zod-validated JSON document describing one Shopify-facing surface (a storefront section, a checkout extension, a Shopify Function, a Flow automation, etc.). The AI pipeline's only job is to produce a RecipeSpec that passes schema validation; a compiler then turns it into concrete Shopify operations (metaobjects, theme assets, function configs). The full type catalog, canonical value sets, and generation pipeline live in [`docs/generation.md`](./generation.md) — this doc does not duplicate that list.

---

## 4. Capability gating & plan tiers

Some Shopify surfaces are plan-gated (for example, checkout UI on Info/Shipping/Payment steps and cart-transform update operations require Shopify Plus). The app resolves the shop's Shopify plan via the Admin API and cross-references it against a capability requirement table before allowing a publish. Gating logic is centralized in `packages/core/src/capabilities.ts`, and internal plan overrides live in the `PlanTierConfig` model. See [`docs/data-models.md`](./data-models.md) for the schema (`Shop`, `AppSubscription`, `PlanTierConfig`) and [`docs/generation.md`](./generation.md) for which RecipeSpec types require which capability.

---

## 5. Security model

- **Auth:** managed installation with token exchange — `apps/web/app/shopify.server.ts` configures `shopifyApp()` with `distribution: AppDistribution.AppStore` and `future.unstable_newEmbeddedAuthStrategy: true`, which removes the OAuth redirect dance for the embedded app (requires `use_legacy_install_flow = false` in the production Shopify app config). Current API version: `2026-07`.
- **Per-shop CSP:** `apps/web/app/entry.server.tsx` calls `applySecurityHeaders()` (`apps/web/app/security-headers.server.ts`) on every server-rendered document response. It derives "is this the `/internal` admin" from the router's own matched routes (not a hand-parsed URL) and, for `/internal`, always sets `Content-Security-Policy: frame-ancestors 'none'`; for every other route it delegates to `shopify-app-remix`'s `addDocumentResponseHeaders`, which sets the per-shop `frame-ancestors` CSP and the App Bridge preload `Link` header required for App Store iframe protection. This only covers responses that actually reach `entry.server.tsx` — redirects and other no-body responses bypass it (`routes/internal.tsx` sets its own `headers()` independently for that case).
- **No arbitrary code deployment.** AI output is RecipeSpec JSON only, strictly Zod-validated.
- Secrets (connector credentials, AI provider keys) are encrypted at rest with AES-256-GCM.
- App Proxy and Flow-action requests are HMAC-verified against Shopify's signature.
- Connector outbound requests are SSRF-protected (HTTPS-only, domain allowlist, private-range blocking).
- Structured logs are redacted before write/export (`redact.server.ts` / `@superapp/observability`'s redaction, wired into error logging and Sentry's `beforeSend`).
- Every request carries a `requestId`/`correlationId` through `AsyncLocalStorage`, joinable across `ApiLog`/`Job`/`ErrorLog`/`AiUsage`/`ActivityLog`.

---

## 6. Data model summary

The app is multi-tenant per Shopify shop domain. Core entities are the module/version pair (`Module`, `ModuleVersion` — immutable recipe snapshots with draft/published lifecycle), the connector layer (`Connector`, `ConnectorEndpoint`, `ConnectorToken`), billing (`AppSubscription`, `PlanTierConfig`), and a family of observability tables (`ApiLog`, `ErrorLog`, `AiUsage`, `Job`, `ActivityLog`, `AuditLog`). See [`docs/data-models.md`](./data-models.md) for the full schema and service-layer reference.

---

## 7. Extension architecture

Generated modules render through Shopify's native extension surfaces: the theme app extension (storefront sections via a generic app block, not one hard-coded block per module kind), checkout UI extensions, the customer-account UI extension, the admin UI extension, POS UI extensions, and Shopify Functions (cart transform, discount, delivery customization, payment customization, cart/checkout validation). The canonical list of which RecipeSpec types map to which extension surface — and each surface's current implementation status — lives in [`docs/generation.md`](./generation.md) § "Canonical value sets"; this section only covers how the pieces fit together at runtime.

**Config delivery is metaobject-based, not metafield-blob-based.** Every published module's config is stored as its own Shopify metaobject entry (`$app:superapp_module` for theme modules, `$app:superapp_admin_block`/`$app:superapp_admin_action` for admin UI, `$app:superapp_checkout_upsell` for checkout, `$app:superapp_customer_account_block` for customer account, `$app:superapp_proxy_widget` for the app-proxy widget route, `$app:superapp_function_config` for Functions), referenced from a per-shop list metafield. This avoids Shopify's per-metafield-value size limit and scales past what a single JSON blob could hold — each module is its own entry rather than one shop growing a single field. `MetaobjectService` (`apps/web/app/services/shopify/metaobject.service.ts`) owns read/write of these entries; `PublishService` (`apps/web/app/services/publish/publish.service.ts`) writes them on publish.

**Theme placement** uses a "universal slot" app block: because Theme Editor block schema options are static (Shopify does not support populating a Theme Editor dropdown from live app data), the app does not try to give merchants a native Theme Editor picker of "which generated module." Instead the app UI itself shows a dropdown of generated modules and lets the merchant assign one to a slot; the theme block reads that assignment (via a slot key or module reference) at render time. Product-scoped and cart-scoped variants of the slot block exist for modules that need product/cart context.

**Checkout, cart-transform, and other Function extensions** each register one extension per Shopify target and read their config from the same `$app:` metaobject-reference pattern at request/run time; if no module is assigned to a target, the extension renders nothing (UI extensions) or applies no changes (Functions). Compiled bundle-size limits (Shopify-enforced, currently 64 KB for UI extensions) constrain how much logic can live in the extension itself, which is why config resolution stays server-side and the extension is a thin renderer.

---

## 8. Where things live — project structure

```
apps/
  web/        — the live app: Remix admin UI, storefront/app-proxy routes, webhooks,
                Agent API, Prisma schema, and the worker/internal-router entrypoints
                described in §2.
  api/        — retired "Platform V2" split; not part of the live Railway topology
                (still builds in CI under the v2-* workflows, not deployed).
  frontend/   — retired "Platform V2" split; same status as apps/api.
  workers/    — retired "Platform V2" split; same status as apps/api (distinct from
                apps/web's own worker process described in §2).
packages/
  core/                — RecipeSpec schema, compiler, allowed-values/capability enums,
                         template libraries, control packs, storefront style system.
  data-layer/          — shared repository abstractions, consumed by apps/web.
  db/                  — job-ledger and migration-contract helpers, consumed by apps/web.
  intent-graph/        — intent classification graph, consumed by apps/web's AI pipeline.
  job-orchestration/   — BullMQ/Cloudflare-queue config + mode resolution, consumed by
                         apps/web's worker process (see §2).
  network-security/    — SSRF policy, redaction, GDPR helpers, consumed by apps/web.
  observability/       — logger, Sentry, PostHog, redaction, consumed by apps/web.
  platform-contracts/  — shared job/health/guardrail contracts, consumed by apps/web.
  rate-limit/          — rate limiting primitives, consumed by apps/web.
  security/            — thin facade re-exporting network-security (Platform V2
                         migration leftover; still present, not a separate live surface).
extensions/
  theme-app-extension/, checkout-ui/, customer-account-ui/, admin-ui/, admin-link/,
  admin-print/, admin-segment-template/, superapp-pos-block/ — UI extension surfaces (§7).
  superapp-discount/, superapp-cart-transform/, superapp-delivery-customization/,
  superapp-payment-customization/, superapp-cart-checkout-validation/,
  superapp-fulfillment-constraints/, superapp-local-pickup/, superapp-pickup-point/,
  superapp-order-routing/, superapp-shipping-discount/ — Shopify Functions.
  superapp-flow-trigger-*/, superapp-flow-action-*/ — Flow connector extensions
                         (see docs/flows.md).
  superapp-web-pixel/, superapp-sidekick-data/, discount-function-settings/ — remaining
                         extension surfaces.
```

`packages/*` under "consumed by apps/web" is confirmed by direct `@superapp/*` imports from `apps/web/app`, not by naming convention alone — re-verify with `grep -rl '@superapp/<pkg>' apps/web/app` if this section is audited later, since packages can be added without being wired in.
