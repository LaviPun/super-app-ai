
---

### docs/phase-plan.md
```md
# Cursor Phase Plan — SuperApp (AI Recipes Shopify App)

This plan is structured for iterative development with strong quality gates:
- SOLID services
- schema-first APIs (Zod validation)
- strict plan gating
- strong observability (logs + jobs + usage)
- safe storefront output (CWV-first)
- no arbitrary code deployment to merchant stores

> Cursor guidance: keep each phase as a PR-sized chunk with tests.
> See [implementation-status.md](./implementation-status.md) for detailed delivery notes.

---

## Phase 0 — Engineering Baseline (CI + standards) ✅
**Goal:** Make the repo safe to scale.

### Deliverables
- [x] CI pipeline: typecheck + tests + build + prisma validate → `.github/workflows/ci.yml`
- [x] Pre-commit hooks (lint-staged + Husky) → `.husky/pre-commit` + root `package.json`
- [x] env validation at boot (Zod-based) → `apps/web/app/env.server.ts`
- [x] consistent API error shape → `services/errors/app-error.server.ts`
- [x] log redaction utilities (no secrets / PII in logs) → `services/observability/redact.server.ts`

### Acceptance criteria
- ✅ `pnpm test` + `pnpm build` succeed on CI
- ✅ Secrets never appear in logs
- ✅ "known error → user-friendly response + requestId" pattern is consistent

---

## Phase 1 — Merchant MVP loop (Generate → Preview → Publish → Rollback) ✅
**Goal:** Merchants can create and deploy modules with confidence.

### Deliverables
- [x] Modules list UI (draft/published, version history) → `routes/_index.tsx`
- [x] Preview experience:
  - [x] compiled operations preview → `routes/modules.$moduleId.tsx`
  - [x] theme preview by publishing to selected theme → `routes/preview.$moduleId.tsx`
- [x] Publish + rollback UX → `routes/api.rollback.tsx` + rollback table in module detail
- [x] Plan gating UI: show required plan + explain block reason → Banner in `modules.$moduleId.tsx`

### Acceptance criteria
- ✅ Publish is idempotent
- ✅ Rollback to previous version works for all supported module types
- ✅ Plus-only modules are blocked on non-Plus shops with clear messaging

---

## Phase 2 — Theme Compatibility Engine v1 (Theme profiling + safe mounting) ✅
**Goal:** Deploy storefront modules safely across themes.

### Deliverables
- [x] Theme asset fetch + extended detection:
  - [x] product form patterns
  - [x] cart drawer/mini-cart patterns
  - [x] predictive search patterns
  - [x] header/footer mounts
- [x] Store `ThemeProfile` per theme
- [x] Mount strategies:
  - [x] Prefer Theme App Extension blocks/embeds
  - [x] Minimal reversible patch only when needed
- [x] "Theme adapter profile" used during compilation/publish decisions

### Acceptance criteria
- ✅ Does not break Dawn-like themes
- ✅ No heavy JS injection by default
- ✅ CWV safety: no render-blocking external scripts

---

## Phase 3 — Real AI Provider Clients + Evaluation Harness ✅
**Goal:** Production-grade AI calls with strict JSON-only output + deep debugging.

### Deliverables
- [x] OpenAI Responses API client (json_schema strict) → `services/ai/clients/openai-responses.client.server.ts`
- [x] Anthropic Messages API client (structured output) → `services/ai/clients/anthropic-messages.client.server.ts`
- [x] Custom OpenAI-compatible endpoint client:
  - [x] try `/v1/responses`
  - [x] fallback `/v1/chat/completions` with json_schema
- [x] Strict JSON enforcement:
  - [x] schema validation
  - [x] retry strategy for invalid JSON
- [x] Metadata logging:
  - [x] status, duration, provider request id, model
  - [x] request/response hashes and sizes (no raw bodies by default)
- [x] Evals harness:
  - [x] golden prompts dataset (14 module types, 80 test cases) → `app/__tests__/evals.test.ts`
  - [x] schema-valid rate tracked → `EvalSummary.schemaValidRate`
  - [x] compiler success rate tracked → `EvalSummary.compilerSuccessRate`
  - [x] non-destructive ops check → `services/recipes/compiler/non-destructive.ts`
- [x] CI regression job runs evals on every PR → `.github/workflows/ci.yml` `evals` job

### Acceptance criteria
- ✅ 99%+ schema-valid on regression prompts
- ✅ provider failures recorded in logs & jobs, with actionable errors
- ✅ no prompts/responses stored unless explicit debug capture mode enabled

---

## Phase 4 — Integrations + Postman-like testing + Mapping ✅
**Goal:** Let merchants connect ERPs and validate integrations safely.

### Deliverables
- [x] Connector CRUD + encryption for secrets → `services/connectors/connector.service.ts`
- [x] Connector test endpoint:
  - [x] SSRF protections (https only, allowlist, private network block)
  - [x] SSRF violations logged via `withApiLogging` → `ApiLog` with `success=false`
  - [x] store sample responses (sanitized) for mapping
- [x] Mapping UI:
  - [x] manual mapping → `routes/connectors._index.tsx`
  - [x] AI-assisted mapping (uses provider clients) → `services/connectors/mapping.service.ts`
  - [x] mapping persists to `Connector.mappingJson`
- [x] Job-based execution for sync runs (via `FlowRunnerService` + `JobService`)
- [x] All connector API routes wrapped with `withApiLogging` → `routes/api.connectors.create.tsx` + `api.connectors.test.tsx`

### Acceptance criteria
- ✅ All connector calls recorded in ApiLog + Job table
- ✅ SSRF attempts blocked and logged
- ✅ mapping persists and is applied consistently

---

## Phase 5 — Automation Engine (Flow-like reliability) ✅
**Goal:** Make workflows robust: retries, idempotency, visibility.

### Deliverables
- [x] Workflow runner:
  - [x] retries + backoff (up to 2× per step; 500ms/1000ms backoff)
  - [x] DLQ for failures (FAILED jobs in DB, replayable)
  - [x] per-step logs + outputs → `FlowStepLog` model
- [x] Trigger sources:
  - [x] Shopify webhooks (orders/create, products/update)
  - [x] schedules → `FlowSchedule` model + `ScheduleService` + `routes/api.cron.tsx` + `routes/flows._index.tsx`
    - _Note: implemented with lightweight DB-based scheduler + external cron service (no BullMQ/Inngest required)_
  - [x] manual triggers → `routes/api.flow.run.tsx`
- [x] Idempotency keys for webhook events → `WebhookEvent` model + `idempotency.server.ts`

### Acceptance criteria
- ✅ Exactly-once behavior per event ID (DB unique constraint on shopDomain+topic+eventId)
- ✅ Replay support with guardrails
- ✅ clear job status and per-step traceability

---

## Phase 6 — Customer Accounts (new customer account pages) ✅
**Goal:** Add modules to customer accounts via UI extensions (sandboxed).

### Deliverables
- [x] Customer account UI extension (`extensions/customer-account-ui/`):
  - [x] **Preact + Polaris web components** (2026-01); 64 KB script limit (see [debug.md](./debug.md))
  - [x] `shopify.extension.toml` with 3 block targets (OrderIndex, OrderStatus, Profile); `customer-account.page.render` should be deployed as a separate extension to avoid target/surface constraints
  - [x] `BlockRenderer` (TEXT / LINK / BADGE / DIVIDER) using `s-*` components; config via global `shopify.query()` from shop metafield
  - [x] Entry points: OrderIndex, OrderStatus, Profile
- [x] Recipe type(s) + compiler writes config metafields → `customerAccount.blocks` type + compiler
- [x] Config API for extension → `routes/api.customer-account.config.tsx`
- [x] Target selection UI with gating (B2B/Plus where applicable)

### Acceptance criteria
- ✅ Only supported targets (4 targets in schema enum; 3 block targets registered in extension, `page.render` reserved for separate extension)
- ✅ No PII in logs
- ✅ Config-driven and safe (no arbitrary HTML/scripts)

---

## Phase 7 — Billing + Quotas + Abuse Prevention ✅
**Goal:** Turn it into a product: usage-based limits and fair access.

### Deliverables
- [x] Shopify Billing plans (FREE/STARTER/GROWTH/PRO) → `services/billing/billing.service.ts`
  - _Note: `test: true` in non-production. Test subscriptions on dev stores may not accurately reflect `currentPeriodEnd`/`trialDays` — verify billing state transitions during QA._
- [x] Quotas:
  - [x] AI requests/tokens → `QuotaService` kind: `aiRequest`
  - [x] publish operations → `QuotaService` kind: `publishOp`
  - [x] workflow runs → `QuotaService` kind: `workflowRun`
  - [x] connector calls → `QuotaService` kind: `connectorCall`
  - [x] total module count → `QuotaService` kind: `moduleCount` (Free: 3, Starter: 20, Growth: 100, Pro: ∞)
- [x] Rate limiting by shop and by plan tier → `rate-limit.server.ts` (in-memory; extend to Redis)

### Acceptance criteria
- ✅ Hard enforcement server-side
- ✅ Clear UX when limits hit
- ✅ audit trail for billing changes (`AppSubscription` model)

---

## Phase 8 — Production Hardening (SLOs, observability, incident readiness) ✅
**Goal:** Operate like a SaaS with predictable reliability.

### Deliverables
- [x] OpenTelemetry traces → `services/observability/otel.server.ts`
  - auto-instrumentation (HTTP, fetch, Prisma)
  - OTLP HTTP exporter (Grafana Tempo / Honeycomb / Jaeger / Datadog ADOT)
  - env-gated: no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set
  - `TraceIdRatioBasedSampler` (10% in production, 100% in dev)
- [x] Sentry error tracking → `services/observability/sentry.server.ts`
  - env-gated: no-op unless `SENTRY_DSN` is set
  - integrated into `ErrorLogService`
- [x] Structured JSON stdout logger → `services/observability/logger.server.ts`
  - JSON lines in production (compatible with Datadog, GCP, AWS CloudWatch, Axiom)
  - human-readable pretty output in development
- [x] Correlation IDs everywhere (requestId/jobId) → `correlation.server.ts` + `x-request-id` headers
- [x] Retention policies configurable per plan + per store:
  - `RetentionPolicy` model + per-shop override fields
  - `scripts/retention.ts` enforces purge on schedule
  - `/internal/stores` UI exposes per-store override editing
- [x] Full runbooks → `docs/runbooks/`
  - `index.md` — severity ladder (SEV-1 to SEV-4) + first-responder checklist
  - `publish-failure.md` — detect → triage → contain → fix → post-mortem
  - `provider-outage.md` — detect → switch provider → verify recovery
  - `webhook-storm.md` — idempotency verification + emergency flow pause
  - `connector-failure.md` — SSRF security response + API key rotation
- [x] Formal SLO definitions → `docs/slos.md`
  - SLO 1: Publish success rate ≥ 99.5% (30-day)
  - SLO 2: Publish latency P95 < 10 s
  - SLO 3: AI generation success rate ≥ 95% + evals ≥ 99% schema-valid
  - SLO 4: Webhook processing latency P95 < 30 s
  - SLO 5: API availability ≥ 99.9%
  - SLO 6: Error rate < 0.5%
  - SQL measurement queries + OTel panel recommendations

### Acceptance criteria
- ✅ OTel traces flow to any OTLP backend when endpoint is configured
- ✅ Sentry captures unhandled errors when DSN is configured
- ✅ Structured logs in production-ready JSON format
- ✅ SLO targets defined with SQL measurement queries and alert thresholds (`docs/slos.md`)
- ✅ Formal runbooks written for all 4 incident types with severity ladder (`docs/runbooks/`)

---

## Storefront UI Style System (theme-safe merchant control)

**Goal:** Give merchants UI control in a theme-safe, non-dev-friendly way: Theme App Extension blocks, config (metafields), Liquid + CSS variables, Style Builder in app. No arbitrary code.

### Phase A (implemented) ✅
- [x] Add optional `style` object to all storefront UI Recipe specs (`theme.banner`, `theme.popup`, `theme.notificationBar`, `proxy.widget`) with shared `StorefrontStyleSchema` (layout, spacing, typography, colors, shape, responsive, accessibility + `customCss`; enums/presets + sanitized free-form CSS).
- [x] Compiler support: `compileStyleVars(style)` → `--sa-*` vars; `compileStyleCss(style, selector)` → scoped CSS; `compileOverlayPositionCss` → overlay; `sanitizeCustomCss` → strips dangerous patterns; `compileCustomCss` → scopes + sanitizes; all theme and proxy.widget compilers output full style.
- [x] Style Builder (Polaris 3-tab component): **Basic** (colors, typography, padding, radius, responsive + overlay/backdrop), **Advanced** (layout mode/anchor/offsets/zIndex/width, shadow, border, line-height, gap, margin, accessibility), **Custom CSS** (textarea, 2000-char limit, sanitization warning, `--sa-*` var reference).
- [x] Overlay/backdrop controls (color + opacity) dynamically shown for any module whose layout mode is `overlay`, `sticky`, or `floating` — not just `theme.popup`.
- [x] Preview service uses style when rendering all storefront module types (banner, notification bar, popup, proxy widget).
- [x] Proxy widget route (`/proxy/:widgetId`) renders `_styleCss` from metafield into a full HTML document.
- [x] `/api/publish` accepts both JSON and form-data (the module page posts form-encoded); routes all `theme.*` types to THEME deploy target.
- [x] Tests (163 total across monorepo): style schema validation; `customCss` limits and safety; sanitizer strips all injection patterns; overlay z-index; proxy.widget with style.

### Phase B (Theme Editor integration) — future
- [ ] Theme App Extension blocks/embeds for banner, notification bar, popup/toast overlay host.
- [ ] Block settings + metafields config.

### Phase C (Advanced layout) — future
- [ ] Snapping anchors + safe offsets.
- [ ] Per-breakpoint overrides.

Positioning: inline placement via Theme Editor block placement; overlays use anchor options and safe offsets (no drag-on-storefront in Phase A).

---

## Post-Phase Features ✅

### Postman-like API Tester + Saved Endpoints ✅
**Goal:** Let merchants test connector APIs and save frequently-used endpoints.
- [x] `ConnectorEndpoint` model (method, path, headers, body per connector)
- [x] API tester UI on connector detail page (send request, view response)
- [x] Save/load/delete endpoints per connector
- [x] Endpoint count shown on connector list

### Module Templates (From Template) ✅
**Goal:** Let merchants skip AI generation and start from proven templates.
- [x] 12 curated templates in `packages/core/src/templates.ts`
- [x] `POST /api/modules/from-template` with quota enforcement
- [x] "Generate with AI" / "From Template" toggle on modules page
- [x] Category filter for template browsing

### Visual Flow Builder ✅
**Goal:** Give merchants a Zapier/Make-style visual editor for building automation flows.
- [x] Custom SVG-based flow canvas (`FlowBuilder.tsx`)
- [x] Trigger selector + step nodes with inline config
- [x] 4 step kinds: HTTP_REQUEST, TAG_CUSTOMER, ADD_ORDER_NOTE, WRITE_TO_STORE
- [x] Round-trip: load existing spec → edit visually → save back as `flow.automation` RecipeSpec

### Data Stores + Custom Pages ✅
**Goal:** App-owned databases so modules/flows can persist and retrieve structured data.
- [x] `DataStore` + `DataStoreRecord` models (multi-tenant)
- [x] 6 predefined stores (Product, Inventory, Order, Analytics, Marketing, Customer)
- [x] Custom store creation
- [x] `WRITE_TO_STORE` flow step kind with auto-provisioning
- [x] Data stores listing and records management pages

### Workflow Engine Spec (Graph-based) ✅
**Goal:** Full Shopify Flow-compatible automation engine with connectors, conditions, branching, and templates.
- [x] Workflow Zod schema: nodes (condition/action/transform/delay/end), edges (next/true/false/error), expression tree
- [x] Connector SDK: TypeScript interfaces (manifest/validate/invoke), auth resolver, structured errors
- [x] Workflow validator: graph reachability, cycle detection, edge completeness, orphan detection
- [x] State machine engine: per-step retries, idempotency keys, deadline, context persistence
- [x] 5 built-in connectors: Shopify Admin, HTTP, Slack, Email, Storage
- [x] 3 workflow templates with install + parameterization + approval checklist (24 items)
- [x] Shopify Flow bridge: dual-mode (local engine + Flow delegation), trigger topics, action handlers
- [x] Prisma models: WorkflowDef, WorkflowRun, WorkflowRunStep, ConnectorToken
- [x] 17 new tests (total 179 across monorepo)

---

## Backlog / future phases

- **Theme app extension: Universal Slot blocks (Universal, Product, Cart) + slot mapping in app UI.** Merchants add app blocks in the Theme Editor; in the app they assign which generated module appears in each slot (Theme Editor cannot show dynamic module lists). See [technical.md](./technical.md) §15 Universal Module Slot & extension architecture.
- **Extension plan (full):** Theme slots → Admin UI extension → Checkout UI extension → Cart Transform Function → Other Functions (discount, delivery, payment, validation) → Post-purchase. Implementation order and config sources documented in technical.md §15.

---

## Working rules (Cursor)
- Every phase must ship:
  - [x] Unit tests for new logic
  - [x] Happy-path and edge-case tests
  - [x] No secrets/PII in logs
- Add new "templates" only as:
  - catalogId + schema + compiler + tests
- Prefer config-driven generic extensions/functions; avoid per-store compiled code
```
