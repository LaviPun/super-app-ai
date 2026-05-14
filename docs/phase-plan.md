
<!-- /autoplan restore point: /Users/lavipun/.gstack/projects/LaviPun-super-app-ai/master-autoplan-restore-20260501-141829.md -->

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
- [x] 144 curated templates (IDs UAO-001 through ORT-142) across `packages/core/src/_templates_part{1..4}.ts` (14 categories × 9 + 16 coverage extras)
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

## CEO Review Decisions (2026-04-29)

Mode and approach selected in this review cycle:
- **Implementation approach:** Platform-First Extension Runtime
- **Review mode:** SELECTIVE EXPANSION

### Added to active scope (approved)
- [ ] Introduce a **Unified Capability Graph + Preflight Simulator** for cross-surface publish safety (Theme/Admin/Checkout/Functions).
- [ ] Introduce a **Progressive Publish Pipeline** with staged rollout controls and auto-rollback hooks.
- [ ] Define one canonical **Release State Machine** across generate/preview/publish/stage/verify/promote/rollback transitions.
- [ ] Add a centralized **Failure Class Matrix** mapping detection signal, user impact, auto-rescue action, and runbook linkage.
- [ ] Add **Contract Drift Tests** across RecipeSpec schemas, compiler outputs, extension config readers, and preflight validators.
- [ ] Add a centralized **Surface Capability Allowlist** policy for target/surface/action authorization boundaries.
- [ ] Define explicit **Rollback Budget + Promotion Abort Criteria** (error-rate, latency, sample-size, and time-window gates).
- [ ] Add an **Idempotency Scope Matrix** (event/release/step/connector-call levels) with conflict-resolution policy.
- [ ] Add a decision-grade **Release Dashboard Spec** for promote/rollback go-no-go gates.
- [ ] Define explicit **Feature Flag Topology** (global kill switch, shop override, surface toggle, precedence rules).
- [ ] Add lightweight **RACI ownership** for publish pipeline, capability policy, rollback authority, and runbook updates.
- [ ] Add **per-safeguard exit criteria checklists** so each control has a verifiable "done" gate.

### Deferred (explicitly approved)
- [ ] **Merchant Outcome Analytics Layer** (conversion/AOV/time-saved attribution) moved to future work after platform safety foundations.

### Guardrails for implementation
- Keep release behavior deterministic: no invalid state transitions; every transition is observable and auditable.
- No silent failures: each failure class must emit machine-detectable signals and operator-readable context.
- Capability checks must be policy-driven and consistent across all extension surfaces.
- Rollout and rollback decisions must be threshold-driven, not ad-hoc.
- Idempotency semantics must be explicit at each boundary; retries/replays cannot produce duplicate side effects.
- Incident containment must follow flag precedence rules, not ad-hoc toggle selection.

### Execution sequencing (approved reorder)
1. Capability Graph + Surface Capability Allowlist
2. Canonical Release State Machine + Feature Flag Topology
3. Rollback Budget/Abort Criteria + Release Dashboard Spec
4. Progressive Publish Pipeline (staged rollout + auto-rollback)
5. Contract Drift Tests + Idempotency Scope Matrix + Exit Criteria validation
6. Continue broad surface expansion backlog after safety gates pass

### Engineering review lock-in (2026-04-29)

The implementation posture for this cycle is explicitly **reduced scope, complete safety depth**:

- Build the minimum safety slice first (no parallel policy engine, no broad expansion in this cycle).
- Reuse the existing runtime gate path as the single enforcement entrypoint.
- Enforce release transitions in one domain service with persisted transition history.
- Define rollout/abort defaults in plan artifacts now (not deferred to implementation guesswork).

#### In-scope now (must build in this cycle)
- [ ] Policy snapshot compiler + invalidation (`shop + surface + revision`) for deterministic and fast publish/preflight checks.
- [ ] Release transition audit trail (actor/source/idempotency key/from->to/result/error class).
- [ ] Eval gate expansion (allowed-values compliance, forbidden-surface rejection, regression guardrails).
- [ ] Telemetry cardinality budget policy (bounded dimensions + sampling/downsampling windows).

#### Explicitly not in scope for this cycle
- [ ] New standalone capability evaluator service separate from existing gate path.
- [ ] Dashboard-heavy expansion work before safety controls and test gates are complete.

---

## Backlog / future phases

- **Theme app extension: Universal Slot blocks (Universal, Product, Cart) + slot mapping in app UI.** Merchants add app blocks in the Theme Editor; in the app they assign which generated module appears in each slot (Theme Editor cannot show dynamic module lists). See [technical.md](./technical.md) §15 Universal Module Slot & extension architecture.
- **Extension plan (full):** Theme slots → Admin UI extension → Checkout UI extension → Cart Transform Function → Other Functions (discount, delivery, payment, validation) → Post-purchase. Implementation order and config sources documented in technical.md §15.

### CEO + Eng review safety controls (moved from `implementation-status.md` 2026-04-29)

The following strategic safety/release-engineering controls were captured during the CEO + Eng review on 2026-04-29 and remain open. They are tracked here as the source of truth so `implementation-status.md` stays focused on what has shipped. Owners and target sprints live in the **Tracking board** in `implementation-status.md` § "CEO + Eng Review Controls Sync (2026-04-29)".

- [ ] Unified Capability Graph + Preflight Simulator across Theme/Admin/Checkout/Functions.
- [ ] Progressive Publish Pipeline with staged rollout and auto-rollback hooks.
- [ ] Canonical release state machine (`generate -> preview -> publish -> stage -> verify -> promote/rollback`).
- [ ] Failure class matrix (detection signal, user impact, auto-rescue action, runbook link).
- [ ] Contract drift test suite (schema/compiler/config/preflight boundary checks).
- [ ] Surface capability allowlist policy (target/surface/action authorization boundaries).
- [ ] Rollback budget + promotion abort criteria (error, latency, sample-size, time-window gates).
- [ ] Idempotency scope matrix (event/release/step/connector-call) with conflict policy.
- [ ] Decision-grade release dashboard spec for promote/rollback go-no-go.
- [ ] Feature flag topology and precedence (global kill switch, shop override, surface toggle).
- [ ] Lightweight RACI for publish authority, policy ownership, and runbook updates.
- [ ] Per-safeguard exit criteria checklists for verifiable "done" gates.

### Explicitly deferred

- [ ] Merchant Outcome Analytics Layer (conversion/AOV/time-saved attribution) — revisit after Capability Graph + Progressive Publish Pipeline are live (target: post-Sprint 4 review, or once 30-day rollback abort rate < 1%).

### Definition-of-done evidence checklist (apply to each control row)

- [ ] Linked implementation PR(s) with merged commit SHA(s)
- [ ] Unit/integration test evidence (test names or CI job link)
- [ ] Rollout safety evidence (flag path + abort threshold config)
- [ ] Observability evidence (dashboard/panel or alert link)
- [ ] Runbook or operator procedure update link
- [ ] Post-deploy verification note (what was verified, when, by whom)

### Execution closeout checklist (for this control bundle)

- [ ] All tracking-board `Status` values moved from `Planned` to final state (`Done` or `Deferred`).
- [ ] All `Evidence link` cells replaced from `TBD` with concrete links.
- [ ] `phase-plan.md` and `implementation-status.md` remain in sync on scope and sequence.
- [ ] Deferred analytics item has explicit revisit trigger (date/metric/milestone).

---

## Working rules (Cursor)
- Every phase must ship:
  - [x] Unit tests for new logic
  - [x] Happy-path and edge-case tests
  - [x] No secrets/PII in logs
- Add new "templates" only as:
  - catalogId + schema + compiler + tests
- Prefer config-driven generic extensions/functions; avoid per-store compiled code

---

## /autoplan — Multi-phase Review (2026-05-01)

### Phase 0 intake

- Base branch detected: `master` (via `origin/HEAD` → `master`)
- Plan path: `docs/phase-plan.md`
- Restore snapshot: `/Users/lavipun/.gstack/projects/LaviPun-super-app-ai/master-autoplan-restore-20260501-141829.md`
- **Focus (git context):** internal AI assistant hardening — shared `assistant-chat-target-probe.server.ts`, `internal.ai-assistant` + `internal.model-setup` loader probes, `internal-ai-router.ts` Ollama passthrough, K8s configmap + deploy docs, `implementation-status` / `internal-admin` alignment
- UI scope: **yes** (internal admin assistant + model setup surfaces)
- DX scope: **yes** (router scripts, deploy READMEs, env conventions)
- Codex CLI: **exec unavailable** this run (`codex exec` failed with `refresh_token_reused` / token refresh despite short-lived auth probe success). Dual-voice Codex sections tagged **N/A**; primary analysis Claude-only.

### Premise gate (CEO) — 2026-05-01

Explicit premises accepted for this automation run (aligned with repo intent and recent ship):

1. **Probe-before-chat:** Validating chat endpoints before enabling send protects operators from confusing 502/timeout loops when base URLs are router-only or mis-typed.
2. **Single module:** `validateAssistantChatTarget` shared between **Setup the Model** and **AI Assistant** prevents divergent health logic.
3. **Passthrough is optional glue:** The Node reference router’s `/api/chat` → Ollama forwarding is a developer ergonomic; production charts should still aim explicit inference URLs where possible.

### Phase 1 — CEO Review (strategy) — 2026-05-01

#### Step 0A — Premise challenge

- **P1 (support burden):** Better probes shift failures left but increase HTTP traffic on every loader visit — acceptable on internal routes only; ensure merchant surfaces do not inherit noisy probing.
- **P2 (product story):** Internal tooling maturity does not directly raise merchant ARPU; keep messaging in `implementation-status` scoped as operator/developer productivity, not merchant-facing features.

#### Step 0B — Leverage map (internal AI slice)

| Sub-problem | Existing code |
|-------------|---------------|
| Chat URL validation, timeouts, router-only detection | `apps/web/app/services/ai/assistant-chat-target-probe.server.ts` |
| Runtime target schema | `apps/web/app/schemas/router-runtime-config.server.ts` |
| Assistant UI + loader guards | `apps/web/app/routes/internal.ai-assistant.tsx` |
| Model setup + same probes | `apps/web/app/routes/internal.model-setup.tsx` |
| Reference local router | `apps/web/scripts/internal-ai-router.ts` |
| Internal assistant orchestration | `apps/web/app/services/ai/internal-assistant.server.ts` |

#### Step 0C — Dream state (internal AI)

```
NOW:  Operators can see router-only vs chat-ready; send blocked with guidance to model setup.
NEXT: Single dashboard card for “inference path health” across dev/stage/prod with the same probe contract.
12-MO: Optional — none of this blocks merchant RecipeSpec safety work; keep internal tools decoupled from publish path.
```

#### Step 0C-bis — Alternatives

| Approach | Tradeoff |
|----------|----------|
| A) Inline fetch in each route | Rejected (duplication) — current shared module is correct |
| B) Only static URL validation (no live probe) | Fewer moving parts but false confidence when only `/route` works |
| C) Shared probe module + explicit UX states | **Chosen** — matches shipped direction |

#### CEO dual voices — 2026-05-01

**CLAUDE SUBAGENT (CEO):** Treat internal AI as hygiene layer: ship small, testable increments; do not couple to progressive publish matrices until a concrete incident ties them.

**CODEX SAYS (CEO):** Unavailable — `codex exec` auth refresh failed (`refresh_token_reused`).

#### CEO consensus table — 2026-05-01

```
CEO DUAL VOICES — CONSENSUS TABLE (2026-05-01):
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   yes     N/A     partial
  2. Right problem to solve?           yes     N/A     partial
  3. Scope calibration correct?       yes     N/A     partial
  4. Alternatives sufficiently explored? yes N/A     partial
  5. Competitive/market risks covered? n/a (internal) N/A partial
  6. 6-month trajectory sound?       yes     N/A     partial
═══════════════════════════════════════════════════════════════
```

#### NOT in scope (CEO) — 2026-05-01

- Merchant storefront AI generation pipeline changes (unless shared clients alter — not in current diff).
- Replacing Modal edge proxy architecture — docs-only clarification sufficient.

#### CEO completion — 2026-05-01

| Item | Result |
|------|--------|
| Premise challenge | Probes + shared module justified; watch internal-only scope |
| NOT in scope | Merchant core publish path, Modal rewrite |
| Dual voices | Claude yes / Codex unavailable |

**Phase 1 (2026-05-01) complete.**

---

### Phase 2 — Design Review — 2026-05-01

- **Scope:** Internal admin **AI Assistant** and **Setup the Model** — health bar, router-only amber state, blocked send.
- **DESIGN.md:** Polarisonly policy; internal shell already tokenized — new work should stay dense status + clear CTAs to `/internal/model-setup`.
- **Interaction states:** Loading (probes in flight), success (chat ok), warning (router-only), error (unreachable / 401) — must stay explicit; current implementation aligns; document any new banner copy in `internal-admin.md` when behavior changes.

#### Design litmus — 2026-05-01

| Check | Score | Note |
|-------|-------|------|
| Scannable hierarchy | 7/10 | Health + model name + CTA to setup is correct order |
| States | 8/10 | Blocked send + guidance is better than silent failure |
| A11y | 6/10 | Ensure focus order when send disabled — re-verify if UI refactors |

**CODEX (design):** N/A (auth)

**Phase 2 (2026-05-01) complete.**

---

### Phase 3 — Eng Review — 2026-05-01

#### Architecture (ASCII)

```
internal.model-setup / internal.ai-assistant (loaders)
  -> validateAssistantChatTarget (fetch + classify router-only)
       -> fetchWithTimeout (SSRF still bounded by URL from DB/config)
  -> internal-assistant.server (chat orchestration)
Reference: internal-ai-router.ts
  -> POST /route (existing)
  -> GET /api/tags, POST /api/chat -> ROUTER_OLLAMA_BASE_URL (passthrough)
```

#### Test review

See artifact: `~/.gstack/projects/LaviPun-super-app-ai/lavipun-master-eng-review-test-plan-20260501-autoplan.md`

#### Eng dual voices

**CLAUDE SUBAGENT (eng):** Keep probe timeouts strict; add route-level tests if loader branching grows; router script stays thin — no business logic in the proxy.

**CODEX SAYS (eng):** Unavailable (auth).

#### Eng consensus table — 2026-05-01

```
ENG DUAL VOICES — CONSENSUS TABLE (2026-05-01):
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               yes     N/A     partial
  2. Test coverage sufficient?         good unit gaps optional N/A partial
  3. Performance risks addressed?        yes     N/A     partial
  4. Security threats covered?         SSRF patterns unchanged N/A partial
  5. Error paths handled?              yes     N/A     partial
  6. Deployment risk manageable?       yes     N/A     partial
═══════════════════════════════════════════════════════════════
```

**Phase 3 (2026-05-01) complete.**

---

### Phase 3.5 — DX Review — 2026-05-01

- **Persona:** Platform maintainer wiring local Ollama + internal admin.
- **TTHW:** Still dominated by Shopify CLI + DB + env — internal router passthrough reduces one failure mode (single port for route + chat).
- **Docs anchor:** `docs/internal-admin.md` “Internal AI Assistant setup” + deploy READMEs for Modal vs K8s.

#### DX scorecard — snapshot

| Dimension | Score | Note |
|-----------|-------|------|
| Getting started | 6.5/10 | Router passthrough docs help; keep env tables in sync |
| Error messages | 7/10 | Probe messages user-facing in UI — keep actionable |
| Docs completeness | 7.5/10 | implementation-status changelog tracks ship |

**CODEX (DX):** N/A (auth)

**Phase 3.5 (2026-05-01) complete.**

---

### Cross-phase themes — 2026-05-01

1. **Codex operational dependency:** Dual-voice review requires `codex login` repair when refresh tokens invalidate — track as tooling hygiene.
2. **Truth in URLs:** Router-only vs full chat must stay visually obvious — regression tests + docs when defaults change (e.g. Qwen3 tags).

### Decision Audit Trail — append rows (2026-05-01)

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|----------|--------|
| 8 | CEO | Keep internal AI decoupled from merchant publish critical path | Mechanical | P3 pragmatic | Avoids coupling risk | Merge internal state into rollout matrices |
| 9 | Eng | Centralize chat probe in `assistant-chat-target-probe.server.ts` | Mechanical | P4 DRY | Single validation surface | Duplicate per route |
| 10 | Eng | Document loader test gap as optional follow-up | Taste | P1 completeness vs effort | Unit tests cover core | Mandatory e2e now |
| 11 | DX | Prefer `internal-admin.md` + deploy README for env topology | Mechanical | P5 explicit | Operators read runbooks | Hide Modal limitation |

### Decision Audit Trail — append rows (2026-05-14, admin AI chat hardening)

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|----------|--------|
| 12 | Eng | Enforce `releaseGateSchemaFailRateMax` / `releaseGateFallbackRateMax` with a 200-call in-memory rolling buffer per target; trip forces shadow mode in-memory and emits `ROUTER_RELEASE_GATE_TRIPPED` | Mechanical | P2 safety-by-default | Persisted gates that did nothing were a footgun; in-memory trip avoids writing under load | Persist trip state to DB on every route call |
| 13 | Eng | Surface `parseError` from `getRouterRuntimeConfig` and render banner on `/internal/model-setup` + chip on `/internal/ai-assistant` | Mechanical | P5 explicit | Silent decryption fallback after `ENCRYPTION_KEY` rotation was masking outages | Auto-rewrite config on parse error |
| 14 | Eng | Tighten `assertSafeTargetUrl` (exact-match `http://` localhosts; reject link-local + cloud metadata for `https://`); add `INTERNAL_AI_ALLOW_HOSTS` allowlist | Mechanical | P2 safety-by-default | Closes `http://localhost.attacker.example` and IMDS exfiltration paths; allowlist preserves K8s internal SSL use case | Permanently block all private-range hostnames with no escape hatch |
| 15 | Eng | Ignore `ROUTER_REQUIRE_AUTH=0` in production with stderr WARN | Mechanical | P2 safety-by-default | Prevents a single env flip from disabling `/route` auth in prod | Honor the override unconditionally |
| 16 | Eng | Hard-delete session via `intent: 'deleteSession'`; preserve `InternalAiToolAudit` rows via `ON DELETE SET NULL` | Mechanical | P4 audit integrity | Operator-requested cleanup must not erase compliance trail | Cascade audits with sessions |
| 17 | Ops | Daily cron purge of `InternalAiToolAudit` older than `INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS` (default 90), guarded by 24h in-memory marker | Mechanical | P3 pragmatic | Bounded growth without a dedicated job scheduler; existing cron loader is sufficient | Stand up a new scheduler service |
| 18 | UX | SSE `:keepalive` comment every 15s; empty model reply persists as `status='error'`; `AI_ASSISTANT_QUERY` fires on every attempt with `attempt: <n>` | Mechanical | P5 explicit | Proxies were closing idle streams; placeholder reply masked failures; retry counts were invisible | Keep placeholder "No response generated." reply text |
| 19 | UX | `applyImportSession` dedupes by `clientRequestId` and returns `{ inserted, skipped }` | Mechanical | P4 idempotency | Re-importing the same JSON twice should be a no-op | Insert duplicates and let the operator clean up |
| 20 | DX | Auto-reprobe `/internal/ai-assistant/probe` every 20s while chat is blocked + manual Recheck | Mechanical | P3 pragmatic | Manual page reload was the only recovery path for transient probe failures | Block-and-refresh-page UX |

### Phase 4 — Final Approval Gate — 2026-05-01

- **Summary:** Accept shared probe module, loader guards, and router passthrough documentation as the right incremental shape for internal AI; dual-voice Codex unavailable until CLI auth fixed.
- **Auto-decision (6 principles):** **Approve as-is** — no user challenges; taste rows non-blocking.
- **Gate:** **A) Approved** for the 2026-05-01 review slice.

### GSTACK REVIEW REPORT — addendum (2026-05-01)

| Review | Runs | Status | Findings |
|--------|------|--------|----------|
| CEO (2026-05-01) | 1 | clean for scope | Internal AI premises accepted; no merchant-scope creep |
| Design (2026-05-01) | 1 | clean for scope | State hierarchy acceptable; a11y watch on disable-send |
| Eng (2026-05-01) | 1 | clean | Test plan artifact written; optional loader integration tests |
| DX (2026-05-01) | 1 | clean | Docs path aligned with implementation-status |
| Codex dual voice | 0 | unavailable | `codex exec` refresh_token failure |

---

## /autoplan — Historical Multi-phase Review (2026-04-29)

### Phase 0 intake

- Base branch detected: `master` (via `origin/HEAD`)
- Plan path: `docs/phase-plan.md`
- Restore snapshot (historical): `/Users/lavipun/.gstack/projects/LaviPun-super-app-ai/master-autoplan-restore-20260429-184341.md`
- UI scope detected: yes (many UI references across phases)
- DX scope detected: yes (API/webhook/agent routes and developer-facing workflows)
- Context reads: `CLAUDE.md`, recent `git log`, `git diff master --stat`
- Design doc artifact for this branch: none found under `~/.gstack/projects/LaviPun-super-app-ai/`

### External reviewers

- Codex dual-voice attempts failed with auth refresh errors (`refresh_token_reused`, `token_expired`). Treat Codex outputs as unavailable for this run and tag consensus tables accordingly.
- Claude independent CEO critique ran via subagent review (product lens reviewer).

### Premise gate (CEO)

User skipped the interactive premise confirmation prompt in-session. Proceeding with explicit documented assumptions:

- Primary bet for this cycle remains release safety and cross-surface correctness for RecipeSpec-driven deployments.
- Instrumentation for merchant outcomes stays deferred, but success must still be measurable via publish reliability and rollback abort signals.

---

## Phase 1 — CEO Review (strategy and scope)

### Step 0A — Premise challenge

Named premises:

1. **Safety-first sequencing:** Capability graph + staged progressive publish reduces merchant-incident blast radius before broad surface expansion.
2. **Deterministic governance:** Canonical release state machine + explicit rollback budgets prevents ad-hoc operator judgment under pressure.
3. **Contract discipline:** Contract drift tests keep RecipeSpec, compiler outputs, extension readers, and validators aligned as the real system boundary.
4. **Defer analytics:** Merchant outcome analytics can wait until safety foundations reduce incident frequency enough for signal-to-noise.

Challenges (what could be wrong):

- P1 (outcome linkage): The plan leans into internal control-plane maturity without always naming the external merchant symptom each control reduces.
- P2 (time-to-value risk): A heavy governance bundle can feel like “platform tax” if defaults are not aggressively opinionated and fast.

### Step 0B — Existing code leverage map (sub-problem -> existing code)

- **Plan tier gating and capability explanation:** `apps/web/app/services/shopify/capability.service.ts`
- **Publish policy evaluation + snapshot keying (short TTL):** `apps/web/app/services/publish/publish-policy.service.ts`
- **Rollout decision thresholds (sample size, error rate, latency):** `apps/web/app/services/releases/rollout-policy.service.ts`
- **Release transition audit logging:** `apps/web/app/services/releases/release-transition.service.ts`
- **Publish execution and metafield/metaobject deployment:** `apps/web/app/services/publish/publish.service.ts`
- **Telemetry cardinality clamp for publish/rollout details:** `apps/web/app/services/observability/telemetry-budget.server.ts`

### Step 0C — Dream state diagram (ASCII)

```
CURRENT (now)
  Merchant edits module -> publish API -> Metafield/Metaobject writes
  + separate monitoring (logs, jobs, some evals)

THIS PLAN (near-term)
  Policy snapshot + capability allowlist
    -> Preflight / simulator
      -> Staged progressive publish
        -> Measured promote/abort (rollout policy)
          -> Audited transitions + rollback rescue paths

12-MONTH IDEAL
  Outcome loop closes:
    safety signals -> faster publish confidence -> higher activation
    and fewer manual operator decisions (good defaults, rare escalations)
```

### Step 0C-bis — Alternatives table

| Approach | Effort (CC-time order of magnitude) | Main risk | Best when |
|---|---:|---|---|
| A) Full control plane now (graph + state machine + progressive + matrices) | high | Organisational and implementation coupling | You already have frequent cross-surface incidents |
| B) Minimal safety slice: policy snapshot + release audit + contract drift + eval gate expansion | low-medium | May defer “simulator” depth | You need reliable gates this month without a big platform program |
| C) Contract-first everywhere before automation | medium | Slower user-visible progress | Schema/compiler drift is the dominant failure mode |

Auto-decision (6 principles): **B as the default execution path for this cycle**, with explicit expansion triggers if incident data says A is required.

### Step 0D — Mode analysis (SELECTIVE EXPANSION)

- Keep the safety direction.
- Do not try to land every matrix and dashboard spec in one pass unless each has an exit criterion tied to a shipping milestone.

### Step 0E — Temporal interrogation

- **Hour 1:** Policy snapshot correctness on a single shop, single module, one surface.
- **Hour 6+:** Staged publish with measured windows, and prove rollback paths do not duplicate side effects.

### Step 0F — Mode selection confirm

- **Mode:** SELECTIVE EXPANSION (matches the plan’s own 2026-04-29 lock-in section)

### Step 0.5 — CEO dual voices

#### CLAUDE SUBAGENT (CEO — strategic independence)

- Premise risk: safety-first is coherent, but needs explicit merchant-visible failure reduction targets.
- Scope risk: many governance artifacts can couple; ship the minimum slice with crisp interfaces.
- Alternative: narrower progressive publish on one surface first, then generalize.
- Competitive risk: “safe but heavy” can lose mid-market unless defaults feel instant.

#### CODEX SAYS (CEO — strategy challenge)

Codex auth failed; no output.

#### CEO DUAL VOICES — CONSENSUS TABLE

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   mostly  N/A     partial
  2. Right problem to solve?           yes     N/A     partial
  3. Scope calibration correct?         tighten N/A     partial
  4. Alternatives sufficiently explored? partly N/A     partial
  5. Competitive/market risks covered? partly N/A     partial
  6. 6-month trajectory sound?         risk    N/A     partial
═══════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (→ taste decision).
Missing voice = N/A (not CONFIRMED). Single critical finding from one voice = flagged regardless.
```

### Sections 1-10 — CEO review highlights (compressed per /autoplan; examined across backlog controls)

- **Problem framing:** Treat “merchant trust hours saved” and “failed publish minutes avoided” as explicit north-star metrics alongside internal SLOs.
- **Scope:** The plan already lists an “in-scope now” slice under engineering lock-in — keep that discipline.

### Error & Rescue Registry (CEO)

| Failure signal | User impact | Auto-rescue | Escalation |
|---|---|---|---|
| Capability mismatch at publish | Publish blocked, confusing errors | Clear tier explanation + safe UI disable paths | Support runbook for entitlement mismatches |
| Rollout abort thresholds trip | Staged rollout stops | Hold/promote guidance from policy defaults | Incident bridge if abort persists across windows |

### Failure Modes Registry (CEO)

| Mode | Example | Mitigation in plan |
|---|---|---|
| Scope coupling | Simultaneous matrix work blocks shipping | Sequence with exit criteria and parallel lanes only when modules do not touch |
| Decision latency | Manual go/no-go without defaults | Keep `RolloutPolicyService` defaults and document when to override |

### NOT in scope (CEO) — explicit deferrals

- **Merchant Outcome Analytics Layer** (already deferred) — keep the trigger: ship after safety gates show stable publish/rollback.

### What already exists (CEO)

- Plan tier refresh and gating hooks in `CapabilityService`
- Rollout evaluation defaults in `RolloutPolicyService`
- Release transition logging in `ReleaseTransitionService`

### Dream state delta (12-month)

- From “we can publish” to “we can publish with measured risk and fast recovery,” with a tight feedback loop to merchant value.

### CEO completion summary (table)

```
+====================================================================+
|              CEO REVIEW — COMPLETION SUMMARY                        |
+====================================================================+
| Premise challenge    | safety-first justified; add merchant KPIs   |
| Alternatives         | B (minimal safety slice) default            |
| Dream state          | safety + speed + outcome loop                 |
| NOT in scope         | analytics (explicit)                          |
| What already exists  | policy/rollout/audit/capability services      |
| Dual voices          | Claude yes, Codex unavailable (auth)          |
+====================================================================+
```

**Phase 1 complete.** Codex: auth failed. Claude subagent: 8 issues. Consensus: partial (Codex N/A). Passing to Phase 2.

---

## Phase 2 — Design Review (UI plan)

### Step 0 — Design scope

- **Initial design completeness:** 4/10 for the open safety controls, because the plan names systems but not the operator/merchant UI states for each transition.
- **Design system:** `DESIGN.md` exists in repo; this plan should reference it for any new internal surfaces (notably any release dashboard or promote/abort UI).

### Step 0.5 — Design dual voices

#### CLAUDE SUBAGENT (design — independent review)

- Add explicit information hierarchy for any “promote/rollback” operator view: what is primary, what is diagnostic.
- Specify empty/loading/error for: policy evaluation, staged rollout in progress, abort, and idempotent replays.
- Call out mobile constraints for on-call review on a phone (touch targets, density).

#### CODEX SAYS (design — UX challenge)

Codex unavailable (auth).

#### Design litmus scorecard (autoplan consensus)

```
DESIGN OUTSIDE VOICES — LITMUS SCORECARD:
═══════════════════════════════════════════════════════════════
  Check                                    Claude  Codex  Consensus
  ─────────────────────────────────────── ─────── ─────── ─────────
  1. Brand unmistakable in first screen?   n/a   N/A     not spec'd
  2. One strong visual anchor?             n/a   N/A     not spec'd
  3. Scannable by headlines only?          risk  N/A     partial
  4. Each section has one job?             risk  N/A     partial
  5. Cards actually necessary?             n/a   N/A     not spec'd
  6. Motion improves hierarchy?            n/a   N/A     not spec'd
  7. Premium without decorative shadows?   n/a   N/A     not spec'd
  Hard rejections triggered:               none  N/A     none
═══════════════════════════════════════════════════════════════
```

### Pass 1-7 — Dimension scores (0-10) and fixes to add in later UI specs

- **Information architecture:** 4/10 -> target 8/10 by defining a single “Release status” page map (primary: current state, secondary: evidence, tertiary: history).
- **Interaction states:** 3/10 -> 9/10 with a state table (below).
- **User journey:** 4/10 -> 8/10 with a short storyboard for on-call and merchant experiences.
- **AI slop risk:** 6/10 (doc is not “generic marketing,” but still risks generic dashboard layout) -> prefer dense app UI patterns from `DESIGN.md`.
- **Design system alignment:** 5/10 -> 8/10 by binding components to existing app UI patterns and tokens.
- **Responsive + a11y:** 4/10 -> 8/10 with table density rules, keyboard focus order for promote/abort, and minimum hit targets.
- **Unresolved decisions:** track in Phase 4 gate if UI ships before semantics lock.

#### Interaction state table (starter)

```
FEATURE                          | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL
---------------------------------|---------|-------|-------|---------|-------
Publish policy evaluation        | spinner | n/a   | red   | ok      | warning
Staged rollout window active     | prog    | n/a   | red   | ok      | degrade
Promote vs abort decision        | calc    | n/a   | red   | ok      | hold
Release transition history       | skeleton| empty | red   | ok      | paging
```

### NOT in scope (design)

- Pixel-perfect mocks for internal dashboards (defer unless dashboard ships this cycle).

### What already exists (design)

- Merchant-facing module UX patterns across Remix routes (examples include modules pages and internal dashboards referenced elsewhere in repo docs).

### Design completion summary

```
+====================================================================+
|        DESIGN PLAN REVIEW — COMPLETION SUMMARY                     |
+====================================================================+
| Initial score            | 4/10 (internal UX underspecified)       |
| Overall score (targets)  | 8/10 (after adding state+journey tables)|
| Unresolved decisions     | dashboard fidelity vs schedule          |
| Decisions made           | state table stub added here             |
| Approved mockups         | none generated (design binary not run)    |
+====================================================================+
```

**Phase 2 complete.** Codex unavailable. Claude subagent: 6 issues. Consensus: partial. Passing to Phase 3.

---

## Phase 3 — Eng Review (architecture, tests, performance)

### Step 0 — Scope challenge (grounded in code)

What exists today:

- Publish writes are centralized in `PublishService` with explicit metafield/metaobject operations.
- Publish gating is centralized in `PublishPolicyService` with snapshot keys and a short TTL cache.
- Rollout thresholds exist as defaults in `RolloutPolicyService`.
- Transition auditing exists via `ReleaseTransitionService` writing `auditLog` rows.

Gap vs plan:

- The plan’s richer release lifecycle (`stage`, `verify`, `promote`) needs a single domain-level orchestrator so routes do not duplicate transitions.

### Step 0.5 — Eng dual voices

#### CLAUDE SUBAGENT (eng — independent review)

- Consolidate publish orchestration behind one service boundary per transition type.
- Ensure idempotency keys cover publish attempts and staged rollout steps without double-writing metaobjects.
- Expand tests around policy caching boundaries (TTL) and rollout abort paths.

#### CODEX SAYS (eng — architecture challenge)

Codex unavailable (auth).

#### ENG DUAL VOICES — CONSENSUS TABLE

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               mostly  N/A     partial
  2. Test coverage sufficient?         gaps    N/A     partial
  3. Performance risks addressed?      mostly  N/A     partial
  4. Security threats covered?           partial N/A     partial
  5. Error paths handled?               partial N/A     partial
  6. Deployment risk manageable?        yes     N/A     partial
═══════════════════════════════════════════════════════════════
```

### Section 1 — Architecture (ASCII dependency graph)

```
Routes (publish/preview/agent)
  -> PublishPolicyService (gate)
    -> PublishService (side effects)
      -> MetafieldService / MetaobjectService
  -> ReleaseTransitionService (audit)
  -> RolloutPolicyService (promote/abort/hold)
Observability:
  applyTelemetryBudget -> bounded detail keys
```

### Section 2 — Code quality notes

- Policy caching is process-local (`Map`) — fine for single-node correctness, but treat as non-authoritative across instances; snapshot keys still help explain decisions in logs.

### Section 3 — Test review (diagram + gaps)

```
CODE PATHS                                              USER FLOWS
[+] PublishPolicyService.evaluate                       [+] Merchant publish blocked by tier
  ├── plan tier blocked path                             ├── [GAP] verify messaging maps to UI
  ├── theme target mismatch                              ├── [GAP] reject non-theme to THEME
  └── snapshot caching / TTL                             └── [GAP] cross-instance consistency assumptions

[+] RolloutPolicyService.evaluate                       [+] Operator promote vs abort
  ├── HOLD insufficient sample                           ├── [GAP] prove metrics inputs are trusted
  ├── ABORT error/latency                                └── [GAP] ensure no double-promote

[+] ReleaseTransitionService.logTransition              [+] Audit trail readability
  └── audit payload shape                                └── [GAP] redaction + PII boundaries

COVERAGE: partial — treat missing branches above as test gaps for this cycle.
```

### Test plan artifact

- Written to: `/Users/lavipun/.gstack/projects/LaviPun-super-app-ai/lavipun-master-eng-review-test-plan-20260429-autoplan.md`

### Section 4 — Performance notes

- Publish paths already batch via compiler ops loop; watch N+1 patterns in metaobject list reads (`getModuleGidList`) during high churn.

### Failure modes registry (engineering)

| Codepath | Production failure | Test | Handling | User-visible |
|---|---|---|---|---|
| Policy mismatch | Wrong target publish | add route tests | block with reasons | merchant error banner |
| Rollout abort | False abort due to bad metrics | metrics fixture tests | hold vs abort clarity | operator confusion risk |

### NOT in scope (engineering)

- Redis-backed policy cache (unless multi-instance publish/auth requires it).

### What already exists (engineering)

- Concrete implementations listed in Step 0.

### Eng completion summary

```
+====================================================================+
|              ENG REVIEW — COMPLETION SUMMARY                        |
+====================================================================+
| Architecture diagram        | yes                                   |
| Test diagram + gaps         | yes                                   |
| Test plan artifact          | written (path above)                  |
| Critical gaps flagged       | metrics trust + cross-instance cache|
| Dual voices                 | Claude yes, Codex unavailable         |
+====================================================================+
```

**Phase 3 complete.** Codex unavailable. Passing to Phase 3.5.

---

## Phase 3.5 — DX Review (developer-facing surfaces)

### Auto classification

- **Primary type:** embedded Shopify app platform + HTTP APIs + internal admin UX for operators.

### Step 0A-D auto selections (/autoplan)

- **Persona:** solo founder-style Shopify app developer integrating modules and webhooks (matches README positioning).
- **Benchmark tier target:** Competitive (2-5 minutes) for local dev bootstrap.
- **Magical moment:** first successful module publish with visible storefront evidence (preview -> publish).
- **Mode:** DX POLISH

### DX dual voices

#### CLAUDE SUBAGENT (DX — independent review)

- Local setup friction dominates TTHW; keep docs copy-paste-complete for Shopify CLI flows.
- Error messages should include shop context safely without leaking secrets.

#### CODEX SAYS (DX — developer experience challenge)

Codex unavailable (auth).

#### DX DUAL VOICES — CONSENSUS TABLE

```
DX DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Getting started < 5 min?           maybe   N/A     partial
  2. API/CLI naming guessable?          ok      N/A     partial
  3. Error messages actionable?         mixed   N/A     partial
  4. Docs findable & complete?          mixed   N/A     partial
  5. Upgrade path safe?                mixed   N/A     partial
  6. Dev environment friction-free?     mixed   N/A     partial
═══════════════════════════════════════════════════════════════
```

### Developer journey map (9-stage table)

```
STAGE        | DEVELOPER DOES                         | FRICTION RISK | STATUS
-------------|----------------------------------------|---------------|-------
Discover     | Read README + docs                     | med           | ok
Install      | pnpm install + Shopify prerequisites     | med           | tighten docs
Configure    | env + Shopify CLI partner setup          | high          | checklist
Hello world  | dev server + install app on dev store   | high          | scripted path
Integrate    | exercise publish routes + webhooks      | med           | examples
Debug        | logs + api logs UI                      | low           | ok
Upgrade      | prisma migrate + extension deploy       | med           | migration notes
Operate      | internal dashboards                     | med           | clarify roles
Measure      | usage + eval harness                    | low           | ok
```

### DX scorecard (0-10)

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Score |
|----------------------|-------|
| Getting Started      | 6.5   |
| API/CLI/SDK          | 7.0   |
| Error Messages       | 6.8   |
| Documentation        | 7.2   |
| Upgrade Path         | 6.6   |
| Dev Environment      | 6.4   |
| Community            | 5.5   |
| DX Measurement       | 6.0   |
| Overall DX           | 6.7   |
| TTHW (estimate)      | 18-30m -> target <10m |
+====================================================================+
```

### DX implementation checklist (plan additions)

- [ ] Single “first hour” checklist: toolchain versions, Shopify CLI login, dev tunnel, env vars, prisma migrate, seed optional fixtures.
- [ ] Copy-paste curl examples for critical routes with redacted tokens.
- [ ] Explicit troubleshooting tree for OAuth/app install failures.

### NOT in scope (DX)

- Building a public developer marketplace portal (not implied by plan).

### What already exists (DX)

- Broad docs set under `docs/` plus Remix route surfaces for internal ops.

**Phase 3.5 complete.** Codex unavailable.

---

## Cross-phase themes

- **Truth of metrics:** Progressive publish needs trustworthy signals or operators lose faith (`RolloutPolicyService` thresholds become theater).
- **Complexity coupling:** Many matrices are valuable but must ship as independently testable modules.

---

## Decision Audit Trail

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|----------|--------|
| 1 | CEO | Default minimal safety slice (B) | Mechanical | P1 completeness vs scope | Ships gates early without coupling everything | Full control-plane big bang now |
| 2 | CEO | Treat Codex as unavailable | Mechanical | P6 pragmatic | Auth failure blocks dual voice | Retry Codex indefinitely |
| 3 | CEO | Keep analytics deferred | Mechanical | P1 completeness | Plan already defers; tie revisit to abort rate | Expand analytics now |
| 4 | Design | Add explicit IA + state tables for ops UI | Taste | P5 explicit | Prevents ambiguous dashboards | Fancy marketing-first layouts |
| 5 | Eng | Orchestrate transitions in one domain service | Taste | P5 explicit | Avoid duplicate transitions across routes | Scatter logic in routes |
| 6 | Eng | Treat policy cache as non-authoritative across instances | Mechanical | P4 DRY truth | `Map` cache is process local | Assume global consistency |
| 7 | DX | Target Competitive TTHW with checklist-driven onboarding | Taste | P1 completeness | Faster adoption without fake promises | Promise <2 min without evidence |

---

## Phase 4 — Final Approval Gate (/autoplan)

### Plan Summary

This cycle should tighten Shopify publish safety using existing enforcement seams (`PublishPolicyService`, rollout thresholds, audit logs, telemetry budgeting) while specifying operator UX states and closing test gaps around gated publishes and staged rollouts.

### Decisions Made

- Total rows logged: 7
- Auto-decided: 7
- Taste decisions: 2 (design IA, DX onboarding tier target)
- User challenges: 0

### User Challenges

None identified without Codex dual agreement.

### Your Choices (taste)

1. **Operator dashboard density vs simplicity:** Prefer dense admin-app patterns aligned to `DESIGN.md` over marketing-style dashboards.
2. **TTHW target:** Aim from ~18-30 minutes toward <10 minutes via checklist-driven setup, not fake “one command” claims.

### Auto-Decided

See Decision Audit Trail above.

### Review Scores (high level)

- CEO: partial dual voice (Codex unavailable)
- Design: partial dual voice
- Eng: partial dual voice
- DX: partial dual voice

### Cross-Phase Themes

See section above.

### Deferred to TODOS.md

No automatic writes performed in this pass (avoid bulk TODO prompts). Candidate items:

- Redis-safe policy caching if multi-instance publish becomes real.
- Metrics provenance hardening for rollout abort decisions.

### Gate options (/autoplan)

Choose one:

- A) Approve as-is (accept recommendations)
- B) Approve with overrides (specify which taste decisions to change)
- B2) Approve with user challenge responses (none listed)
- C) Interrogate (ask about any specific decision)
- D) Revise (edit plan further, then rerun affected phases)
- E) Reject (restart planning)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope and strategy | >=1 | issues_open | SELECTIVE_EXPANSION; tighten merchant-visible outcomes |
| Codex Review | `/codex review` | Independent second opinion | 0 | unavailable | Codex auth failure (`refresh_token_reused`) |
| Eng Review | `/plan-eng-review` | Architecture and tests | >=1 | issues_open | Gate services exist; integrate orchestration + tests |
| Design Review | `/plan-design-review` | UI and UX gaps | >=1 | issues_open | Operator UX states need specification against DESIGN.md |
| DX Review | `/plan-devex-review` | Developer onboarding | >=1 | issues_open | TTHW toward `<10m` via checklist-driven setup |

- **UNRESOLVED:** Premise confirmation prompt skipped in-session; assumptions documented explicitly above.
- **VERDICT:** Partial clearance — proceed implementation with scoped sequencing; dual-voice Codex unavailable until `codex login` is repaired.

```
