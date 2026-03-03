
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
  - [x] golden prompts dataset (10 prompts covering all types) → `services/ai/evals.server.ts`
  - [x] schema-valid rate tracked → `EvalSummary.schemaValidRate`
  - [x] compiler success rate tracked → `EvalSummary.compilerSuccessRate`

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
  - [x] store sample responses (sanitized) for mapping
- [x] Mapping UI:
  - [x] manual mapping → `routes/connectors._index.tsx`
  - [x] AI-assisted mapping (uses provider clients) → `services/connectors/mapping.service.ts`
- [x] Job-based execution for sync runs (via `FlowRunnerService` + `JobService`)

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
  - [ ] schedules (requires BullMQ/Inngest — not yet implemented)
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
- [x] Customer account UI extension host renderer → `extensions/customer-account-ui/README.md`
- [x] Recipe type(s) + compiler writes config metafields → `customerAccount.blocks` type + compiler
- [x] Target selection UI with gating (B2B/Plus where applicable)

### Acceptance criteria
- ✅ Only supported targets (4 targets in schema enum)
- ✅ No PII in logs
- ✅ Config-driven and safe (no arbitrary HTML/scripts)

---

## Phase 7 — Billing + Quotas + Abuse Prevention ✅
**Goal:** Turn it into a product: usage-based limits and fair access.

### Deliverables
- [x] Shopify Billing plans (FREE/STARTER/GROWTH/PRO) → `services/billing/billing.service.ts`
- [x] Quotas:
  - [x] AI requests/tokens → `QuotaService` kind: `aiRequest`
  - [x] publish operations → `QuotaService` kind: `publishOp`
  - [x] workflow runs → `QuotaService` kind: `workflowRun`
  - [x] connector calls → `QuotaService` kind: `connectorCall`
- [x] Rate limiting by shop and by plan tier → `rate-limit.server.ts` (in-memory; extend to Redis)

### Acceptance criteria
- ✅ Hard enforcement server-side
- ✅ Clear UX when limits hit
- ✅ audit trail for billing changes (`AppSubscription` model)

---

## Phase 8 — Production Hardening (SLOs, observability, incident readiness) ⚠️ Partial
**Goal:** Operate like a SaaS with predictable reliability.

### Deliverables
- [ ] Sentry + OpenTelemetry — not implemented; needs `@sentry/remix`
- [x] Correlation IDs everywhere (requestId/jobId) → `correlation.server.ts` + `x-request-id` headers
- [ ] Runbooks — templates in `implementation-status.md`; full runbooks not yet written
  - [ ] publish failures
  - [ ] provider outage
  - [ ] webhook storms
  - [ ] connector failures
- [x] Retention policies configurable per plan + per store → `RetentionPolicy` model

### Acceptance criteria
- ⏳ defined SLOs and dashboards — correlation IDs + ApiLog ready; dashboards TBD
- ⏳ incident process and severity ladder — templates written; formal ladder TBD
- ⏳ measurable MTTR improvements — tooling in place; baseline not yet measured

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
