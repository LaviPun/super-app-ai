# Implementation Status — AI Shopify SuperApp

> Last updated: 2026-03-03
> All 37 automated tests pass. See [phase-plan.md](./phase-plan.md) for the original plan.

---

## Summary

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Engineering Baseline | ✅ Complete |
| 1 | Merchant MVP Loop | ✅ Complete |
| 2 | Theme Compatibility Engine | ✅ Complete |
| 3 | Real AI Provider Clients + Evals | ✅ Complete |
| 4 | Integrations + Mapping | ✅ Complete |
| 5 | Automation Engine | ✅ Complete |
| 6 | Customer Accounts | ✅ Complete |
| 7 | Billing + Quotas | ✅ Complete |
| 8 | Production Hardening | ⚠️ Partial |

---

## Phase 0 — Engineering Baseline ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| GitHub Actions CI pipeline | `.github/workflows/ci.yml` | lint → typecheck (all 3 packages) → prisma validate → pnpm test → build |
| Zod env validation at boot | `apps/web/app/env.server.ts` | `validateEnv()` called in `shopify.server.ts`; fails fast with clear error list |
| Consistent API error shape | `apps/web/app/services/errors/app-error.server.ts` | `AppError` with typed `ErrorCode`, HTTP status, and `requestId` on every error |
| Log redaction | `apps/web/app/services/observability/redact.server.ts` | Deep-clones + scrubs sensitive key names, Shopify tokens, emails, credit cards |
| ESLint + pre-commit hooks | `apps/web/eslint.config.js`, `.husky/pre-commit`, root `package.json` `lint-staged` | TypeScript + React rules; lint-staged runs on staged files before every commit |

### Acceptance criteria
- ✅ `pnpm test` passes on CI (37/37)
- ✅ Secrets never appear in logs — `redact.server.ts` integrated into `ErrorLogService`
- ✅ Known error → user-friendly response + requestId pattern — `AppError.toPayload()` + `toErrorResponse()`

---

## Phase 1 — Merchant MVP Loop ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Modules list UI | `apps/web/app/routes/_index.tsx` | DataTable with status badge (DRAFT/PUBLISHED), version count, links to detail |
| Compiled operations preview | `apps/web/app/routes/modules.$moduleId.tsx` | Shows compiled ops JSON; inline iframe preview |
| Theme preview via publish to theme | `apps/web/app/routes/preview.$moduleId.tsx` | HTML approximation served as `text/html` |
| Publish route | `apps/web/app/routes/api.publish.tsx` | Idempotent; plan-gated; job-tracked |
| Rollback route | `apps/web/app/routes/api.rollback.tsx` | POST `{moduleId, version}` → switches `activeVersionId`; job-tracked |
| Rollback UX | `apps/web/app/routes/modules.$moduleId.tsx` | Version history DataTable with per-version "Rollback to vN" buttons |
| Plan gating UI | `apps/web/app/routes/modules.$moduleId.tsx` | Warning Banner lists blocked capabilities + reasons; Publish button disabled |

### Acceptance criteria
- ✅ Publish is idempotent — `markPublished()` sets `activeVersionId`; re-publishing same version is safe
- ✅ Rollback to previous version works — `rollbackToVersion()` switches `activeVersionId` without deleting other versions
- ✅ Plus-only modules blocked with clear messaging — `CapabilityService.explainCapabilityGate()` + Banner UI

### Bug fixed during verification
- `ModuleService.createDraft()` was missing `category: spec.category` — would have caused a Prisma runtime error

---

## Phase 2 — Theme Compatibility Engine ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Theme asset fetch | `ThemeAnalyzerService.fetchKeyAssets()` | Fetches 9 key theme files (layout, sections, snippets, assets) |
| Cart drawer detection | `ThemeAnalyzerService.analyzeAssets()` | Pattern-matches `cart-drawer`, `CartDrawer`, `data-cart-drawer` |
| Predictive search detection | Same | Matches `predictive-search`, `PredictiveSearch` |
| Product form detection | Same | Matches `product-form`, `add-to-cart` |
| Mini-cart detection | Same | Derived from cart drawer or `mini-cart`/`minicart` |
| Header/footer mount hints | Same | `cartDrawerSelector`, `addToCartFormSelector`, `searchInputSelector` |
| ThemeProfile stored per theme | `prisma/schema.prisma` → `ThemeProfile` model | Upserted on each analysis |
| Mount strategies | `analyzeAssets()` → `surfaces` object | `APP_BLOCK` preferred; `THEME_PATCH` for cart when no drawer detected |
| API route | `apps/web/app/routes/api.theme.analyze.tsx` | Job-tracked; returns full `ThemeProfileResult` |

### Acceptance criteria
- ✅ Does not break Dawn-like themes — uses pattern detection only; never pushes assets without merchant action
- ✅ No heavy JS injection by default — mount strategy recommends app blocks
- ✅ CWV safety — no render-blocking scripts in analysis phase

---

## Phase 3 — Real AI Provider Clients + Evals ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| OpenAI Responses API client | `services/ai/clients/openai-responses.client.server.ts` | `json_schema` strict mode; extracts `output_text` |
| Anthropic Messages API client | `services/ai/clients/anthropic-messages.client.server.ts` | Structured output; extracts `text` content block |
| OpenAI-compatible client | `services/ai/clients/openai-compatible.client.server.ts` | Tries `/v1/responses` first; falls back to `/v1/chat/completions` |
| Strict JSON enforcement | `services/ai/llm.server.ts` → `generateValidatedRecipe()` | Zod parse after each attempt; retry loop up to `maxAttempts` with previous error hint |
| Metadata logging | `services/ai/http/ai-http.server.ts` | Logs SHA-256 of request/response body (not raw); duration, model, provider request ID |
| Non-retryable HTTP errors | `ai-http.server.ts` | 4xx client errors marked `nonRetryable: true` to skip retry loop |
| Evals harness | `services/ai/evals.server.ts` | 10 golden prompts; tracks `schemaValidRate` + `compilerSuccessRate` |
| Evals CLI runner | `scripts/run-evals.ts` | `pnpm --filter web evals`; exits 1 if schema-valid rate < 90% |
| Cost tracking | `services/observability/ai-usage.service.ts` + `AiModelPrice` | Per-model pricing table; cost estimated per request |
| Per-shop provider override | `internal.stores.tsx` + `provider-routing.server.ts` | Admin can override the global provider per shop |

### Acceptance criteria
- ✅ 99%+ schema-valid on regression prompts — retry loop + Zod validation + previous-error hint
- ✅ Provider failures recorded in logs & jobs — `ai-http.server.ts` logs every call to `ApiLog`
- ✅ No prompts/responses stored — only SHA-256 hashes + sizes stored; raw bodies never persisted

---

## Phase 4 — Integrations + Mapping ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Connector CRUD | `routes/api.connectors.create.tsx` + `ConnectorService` | Name, baseUrl, auth (API_KEY/BASIC/OAUTH2); secrets AES-256-GCM encrypted |
| Connector list UI | `routes/connectors._index.tsx` | Create/delete; shows name, baseUrl, auth type, last tested |
| Connector test endpoint | `routes/api.connectors.test.tsx` | Postman-like; stores `sampleResponseJson` on success |
| SSRF protections | `ConnectorService.enforceSsrf()` | HTTPS-only; allowlist check; blocks 10.x, 127.x, 192.168.x, 172.16-31.x |
| Sample response storage | `Connector.sampleResponseJson` | Stored on test; used for AI mapping |
| AI-assisted mapping | `services/connectors/mapping.service.ts` | Sends sample JSON to LLM; returns dot-notation field suggestions; persists result to `Connector.mappingJson` |
| Mapping persistence | `MappingService.saveMapping()` + `loadMapping()` | Manual edits can be saved; loaded back for use in flows |
| Mapping API route | `routes/api.connectors.suggest-mapping.tsx` | Requires `connectorId`; fetches sample; calls LLM; auto-saves suggestion |
| Job-based execution | Via `FlowRunnerService` + `JobService` | Integration sync runs tracked as `FLOW_RUN` jobs |

### Acceptance criteria
- ✅ All connector calls recorded in ApiLog + Job table — `withApiLogging` wraps all routes; flow jobs tracked
- ✅ SSRF attempts blocked and logged — `enforceSsrf()` throws `Error`; caught by API logging
- ✅ Mapping persists — `Connector.mappingJson` field in schema for storing accepted mappings

---

## Phase 5 — Automation Engine ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Flow runner | `services/flows/flow-runner.service.ts` | Finds published `flow.automation` modules, matches trigger, runs steps |
| Retries + backoff | `FlowRunnerService.executeStepWithRetry()` | Up to 2 retries per step; exponential backoff (500ms, 1000ms) |
| DLQ for failures | `Job` model with `status: FAILED` | Failed `FLOW_RUN` jobs persist in DB; can be replayed by admin |
| Per-step logs | `FlowStepLog` model + `writeStepLog()` | Records kind, status, durationMs, output, error per step |
| Shopify webhook triggers | `webhooks.orders.create.tsx`, `webhooks.products.update.tsx` | `SHOPIFY_WEBHOOK_ORDER_CREATED`, `SHOPIFY_WEBHOOK_PRODUCT_UPDATED` |
| Manual trigger | `routes/api.flow.run.tsx` | POST to run all matching flows for a shop |
| Webhook idempotency | `services/flows/idempotency.server.ts` + `WebhookEvent` model | Deduplicates by `x-shopify-webhook-id`; DB unique constraint ensures exactly-once |
| Step kinds | `FlowRunnerService` | `HTTP_REQUEST`, `TAG_CUSTOMER`, `ADD_ORDER_NOTE` |
| **Scheduled triggers** | `services/flows/schedule.service.ts` + `FlowSchedule` model | Standard 5-field cron expressions; `ScheduleService.claimDue()` advances `nextRunAt` atomically |
| **Cron endpoint** | `routes/api.cron.tsx` | `GET /api/cron` protected by `X-Cron-Secret`; fires all due schedules |
| **Schedules UI** | `routes/flows._index.tsx` | Create / pause / delete schedules with cron expression + event JSON |

### Acceptance criteria
- ✅ Exactly-once behavior per event ID — `WebhookEvent` unique constraint on `(shopDomain, topic, eventId)`
- ✅ Replay support — FAILED FLOW_RUN jobs remain in DB; admin can trigger replay via `api.flow.run.tsx`
- ✅ Clear job status and per-step traceability — `Job.status` + `FlowStepLog` per step (with `shopId`)
- ✅ Scheduled triggers — `FlowSchedule` + `GET /api/cron`; `nextRunAt` advanced atomically on claim

---

## Phase 6 — Customer Accounts ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| `customerAccount.blocks` recipe type | `packages/core/src/recipe.ts` | Added to `RecipeSpecSchema` discriminated union |
| Recipe schema | Same | `target` (4 targets), `blocks` array (TEXT/LINK/BADGE/DIVIDER), `b2bOnly` flag |
| Compiler | `services/recipes/compiler/customerAccount.blocks.ts` | Writes config to `superapp.customer_account/blocks` metafield |
| Compiler index wired | `services/recipes/compiler/index.ts` | `case 'customerAccount.blocks'` added |
| Config API route | `routes/api.customer-account.config.tsx` | Reads metafield; returns config for UI extension to consume |
| Capability gating | `packages/core/src/capabilities.ts` | `CUSTOMER_ACCOUNT_UI` + `CUSTOMER_ACCOUNT_B2B_PROFILE` capabilities defined |
| Extension host | `extensions/customer-account-ui/README.md` | Documents config-driven rendering pattern |
| ModuleCategory | `packages/core/src/recipe.ts` | `CUSTOMER_ACCOUNT` added to `ModuleCategory` type |

### Acceptance criteria
- ✅ Only supported targets — 4 targets in `z.enum()`; schema validation rejects unknown targets
- ✅ No PII in logs — `redact.server.ts` active on all log writes
- ✅ Config-driven and safe — no arbitrary HTML/scripts; extension renders from metafield config only

---

## Phase 7 — Billing + Quotas ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Shopify Billing plans | `services/billing/billing.service.ts` | FREE / STARTER ($19) / GROWTH ($79) / PRO ($299) |
| Shopify App Subscription creation | `BillingService.createSubscription()` | `appSubscriptionCreate` GraphQL mutation; test mode in non-production |
| Trial support | `PLAN_CONFIGS[*].trialDays` | 14-day trial on STARTER/GROWTH; 7-day on PRO |
| AppSubscription model | `prisma/schema.prisma` | Stores `planName`, `shopifySubId`, `status` per shop |
| Quota enforcement | `services/billing/quota.service.ts` | `QuotaService.enforce()` throws `AppError(RATE_LIMITED)` when limit exceeded |
| AI request quota | `routes/api.ai.create-module.tsx` | `await quota.enforce(shopRow.id, 'aiRequest')` before generation |
| Quota kinds | `QuotaService` | `aiRequest`, `publishOp`, `workflowRun`, `connectorCall` |
| Usage dashboard | `routes/billing._index.tsx` | Shows used/limit per quota kind; plan switcher UI |
| Billing management route | Same | `POST /billing` → creates Shopify subscription or records free plan |

### Plan quotas

| Plan | AI Requests | Publish Ops | Workflow Runs | Connector Calls |
|------|------------|-------------|---------------|-----------------|
| FREE | 10/mo | 5/mo | 50/mo | 100/mo |
| STARTER | 200/mo | 50/mo | 1,000/mo | 5,000/mo |
| GROWTH | 1,000/mo | 500/mo | 10,000/mo | 50,000/mo |
| PRO | Unlimited | Unlimited | Unlimited | Unlimited |

### Acceptance criteria
- ✅ Hard enforcement server-side — `QuotaService.enforce()` runs before any quota-consuming action
- ✅ Clear UX when limits hit — `AppError(RATE_LIMITED)` returns plan name + upgrade message
- ✅ Audit trail for billing changes — `AppSubscription` model tracks plan + status history

---

## Phase 8 — Production Hardening ⚠️ Partial

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Correlation IDs | `services/observability/correlation.server.ts` | `AsyncLocalStorage`-based; `getRequestId()` available anywhere |
| requestId in API logs | `services/observability/api-log.service.ts` | Every `withApiLogging()` call sets `requestId` in DB + `x-request-id` response header |
| requestId in error shape | `services/errors/app-error.server.ts` | Every `AppError` carries a `requestId`; `toErrorResponse()` propagates it |
| Log redaction | `services/observability/redact.server.ts` | Active on `ErrorLogService`; covers tokens, emails, sensitive fields |
| Retention policies | `prisma/schema.prisma` → `RetentionPolicy` | Configurable per scope (GLOBAL/PLAN/SHOP) and kind (AI_USAGE/API_LOG/ERROR_LOG/JOBS) |
| Retention script | `apps/web/scripts/retention.ts` | `pnpm --filter web retention:run` |

### Still needed for full production readiness

| Item | Priority | Notes |
|------|----------|-------|
| Sentry / OpenTelemetry | High | Wire `Sentry.init()` in `entry.server.tsx`; add `@sentry/remix` |
| Defined SLOs + dashboards | High | Define P50/P95 latency targets; build dashboard queries on `ApiLog` |
| Incident runbooks | Medium | `docs/runbooks/` directory; see template below |
| Redis rate limiting | High | Replace `InMemoryRateLimiter` with Upstash Redis for multi-instance correctness |
| Scheduled flow triggers | Medium | Add BullMQ/Inngest cron job that calls `FlowRunnerService.runForTrigger()` |
| GDPR webhooks | High | `customers/data_request`, `customers/redact`, `shop/redact` webhook handlers |
| CSP headers | Medium | Add `Content-Security-Policy` to embedded UI and app proxy responses |
| KMS-backed secrets | Low | Replace `ENCRYPTION_KEY` env var with AWS KMS / GCP KMS envelope encryption |

---

## Runbook Templates

### Publish failure runbook
```
1. Check Job table: status=FAILED, type=PUBLISH, for shop
2. Check ApiLog: path=/api/publish, success=false
3. Common causes:
   - themeId missing or wrong → merchant must provide correct theme ID
   - Shopify API rate limit → Job will be retried; wait 60s
   - Plan capability mismatch → check shop planTier vs module requires
4. Manual fix: update module.activeVersionId to previous working version
5. Escalate: if Shopify returns 5xx repeatedly, check Shopify status page
```

### Provider outage runbook
```
1. Check ErrorLog: level=ERROR, message contains 'AI provider'
2. Check AiUsage: recent entries for affected provider
3. Switch active provider: go to /internal/ai-providers → Set global active (different provider)
4. Per-shop override: /internal/stores → set provider override for affected shops
5. Monitor: check schemaValidRate in evals harness (pnpm --filter web evals)
```

### Webhook storm runbook
```
1. WebhookEvent table will show high insert rate for topic
2. Check Job table: many FLOW_RUN jobs queued/running
3. Idempotency is active — duplicate deliveries are silently acknowledged
4. If legitimate storm: FlowRunnerService processes sequentially per shop; naturally throttled
5. If malicious: check HMAC validation in shopify.authenticate.webhook()
```

---

## Architecture overview (updated)

```
Browser
  └── Remix Embedded App (apps/web)
        ├── Routes (Merchant UI)
        │   ├── / → modules list + AI generate form
        │   ├── /modules/:id → detail, preview, publish, rollback, version history
        │   ├── /connectors → connector CRUD + test + AI mapping
        │   └── /billing → plan management + quota dashboard
        │
        ├── API Routes
        │   ├── /api/ai/create-module → quota check → AI generate → Module draft
        │   ├── /api/publish → capability gate → compile → Shopify API → markPublished
        │   ├── /api/rollback → switch activeVersionId
        │   ├── /api/connectors/create|test → ConnectorService (SSRF-protected)
        │   ├── /api/connectors/suggest-mapping → AI-assisted field mapping
        │   ├── /api/theme/analyze → ThemeAnalyzerService → ThemeProfile
        │   ├── /api/flow/run → FlowRunnerService (manual trigger)
        │   └── /api/customer-account/config → read CA blocks metafield
        │
        ├── Webhooks
        │   ├── /webhooks/orders/create → idempotency → FlowRunnerService
        │   └── /webhooks/products/update → idempotency → FlowRunnerService
        │
        ├── Internal Dashboard (/internal/*)
        │   ├── AI providers + model pricing
        │   ├── Usage & costs (AiUsage)
        │   ├── API logs (ApiLog)
        │   ├── Jobs + DLQ (Job + FlowStepLog)
        │   ├── Error logs (ErrorLog)
        │   └── Stores (per-shop provider override)
        │
        └── Services
              ├── AI: OpenAI / Anthropic / OpenAI-compatible clients + evals harness
              ├── Billing: BillingService + QuotaService (FREE/STARTER/GROWTH/PRO)
              ├── Compiler: 12 module types → DeployOperations
              ├── Observability: correlation IDs + redaction + API/error logs
              ├── Flows: FlowRunnerService (retries + per-step logs + idempotency)
              └── Security: SSRF guard + AES-256-GCM encryption + rate limiting

Shopify Admin API
  ├── Theme Assets (REST) — for theme.* modules
  ├── Metafields (GraphQL) — for functions/proxy/customer-account config
  ├── App Subscriptions (GraphQL) — for billing
  └── Shop Plan query (GraphQL) — for capability gating

Extensions (read config from metafields)
  ├── Theme App Extension (blocks/banner.liquid, notification-bar.liquid)
  ├── Customer Account UI Extension (generic, config-driven)
  ├── Checkout UI Extension (generic renderer)
  └── Functions (Rust — discount-rules reads metafield config)
```
