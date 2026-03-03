# Implementation Status — AI Shopify SuperApp

> Last updated: 2026-03-03
> All 163 automated tests pass (145 apps/web + 17 packages/core + 1 packages/rate-limit). See [phase-plan.md](./phase-plan.md) for the original plan.

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
| 8 | Production Hardening | ✅ Complete |
| — | Storefront UI Style System | ✅ Complete |
| — | UI/UX Guidelines Audit | ✅ Complete |

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
| Recipe schema | Same | `target` z.enum with 4 values, `blocks` array (TEXT/LINK/BADGE/DIVIDER), `b2bOnly` flag |
| Compiler | `services/recipes/compiler/customerAccount.blocks.ts` | Writes config to `superapp.customer_account/blocks` metafield |
| Compiler index wired | `services/recipes/compiler/index.ts` | `case 'customerAccount.blocks'` added |
| Config API route | `routes/api.customer-account.config.tsx` | Reads metafield; returns config for UI extension to consume |
| Capability gating | `packages/core/src/capabilities.ts` | `CUSTOMER_ACCOUNT_UI` + `CUSTOMER_ACCOUNT_B2B_PROFILE` capabilities defined |
| Extension host | `extensions/customer-account-ui/` | **Preact + Polaris web components** (2026-01); config-driven; 64 KB script limit (see [debug.md](./debug.md) §5) |
| ModuleCategory | `packages/core/src/recipe.ts` | `CUSTOMER_ACCOUNT` added to `ModuleCategory` type |

### Schema targets vs deployed extension targets

The recipe schema and the deployed extension intentionally cover different scopes:

| Layer | Targets | Purpose |
|-------|---------|---------|
| **Schema** (`recipe.ts` z.enum) | 4 targets: `order-index.block.render`, `order-status.block.render`, `profile.block.render`, `page.render` | Defines what the AI is allowed to generate. Forward-looking — includes `page.render` so merchants can create page-level modules even before we deploy the second extension. |
| **Deployed extension** (`shopify.extension.toml`) | 3 targets: `order-index.block.render`, `order-status.block.render`, `profile.block.render` | What actually renders in the customer account today. `page.render` is **not** registered. |

**Important:** If a module targets `customer-account.page.render`, compilation will succeed and a metafield config will be written, but the current deployed extension will not render it because it does not register that target. To serve `page.render` modules, deploy a separate extension (recommended — Shopify may impose constraints when mixing page-level and block-level targets in one extension). See [debug.md](./debug.md) §2.

### Customer Account UI extension (stack and limits)

- **Stack:** Preact, `@shopify/ui-extensions` 2026.1.x, Polaris web components (`s-stack`, `s-heading`, `s-text`, `s-link`, `s-badge`, `s-separator`). Entry: `import '@shopify/ui-extensions/preact'`; default export `async function extension() { render(<Block />, document.body); }`.
- **Config:** Extension reads shop metafield `superapp.customer_account/blocks` via global `shopify.query()` (Storefront API). `shopify.extension.toml` has `[extensions.capabilities]` with `api_access = true`.
- **64 KB limit:** Shopify enforces a 64 KB compiled script limit for UI extensions (2025-10+). React + `@shopify/ui-extensions-react` exceeded it; migration to Preact + Polaris keeps the bundle under the limit. See [debug.md](./debug.md) §§1, 5.

### Acceptance criteria
- ✅ Schema validates 4 targets; extension renders 3 — `page.render` modules compile but won't display until a dedicated extension is deployed
- ✅ No PII in logs — `redact.server.ts` active on all log writes
- ✅ Config-driven and safe — no arbitrary HTML/scripts; extension renders from metafield config only

---

## Phase 7 — Billing + Quotas ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Shopify Billing plans | `services/billing/billing.service.ts` | FREE / STARTER ($19) / GROWTH ($79) / PRO ($299) |
| Shopify App Subscription creation | `BillingService.createSubscription()` | `appSubscriptionCreate` GraphQL mutation; `test: true` when `NODE_ENV !== 'production'`. **Note:** Test subscriptions behave differently on dev stores — `currentPeriodEnd` and `trialDays` may not reflect real billing cycles. Always treat the subscription status returned by the Shopify Admin API as the source of truth rather than relying on local assumptions during dev. Verify billing state transitions during QA on a dev store before going live. |
| Trial support | `PLAN_CONFIGS[*].trialDays` | 14-day trial on STARTER/GROWTH; 7-day on PRO |
| AppSubscription model | `prisma/schema.prisma` | Stores `planName`, `shopifySubId`, `status` per shop |
| Quota enforcement | `services/billing/quota.service.ts` | `QuotaService.enforce()` throws `AppError(RATE_LIMITED)` when limit exceeded |
| AI request quota | `routes/api.ai.create-module.tsx` | `await quota.enforce(shopRow.id, 'aiRequest')` before generation |
| Quota kinds | `QuotaService` | `aiRequest`, `publishOp`, `workflowRun`, `connectorCall`, `moduleCount` |
| Usage dashboard | `routes/billing._index.tsx` | Shows used/limit per quota kind; plan switcher UI |
| Billing management route | Same | `POST /billing` → creates Shopify subscription or records free plan |

### Plan quotas

| Plan | AI Requests | Publish Ops | Workflow Runs | Connector Calls | Modules |
|------|------------|-------------|---------------|-----------------|---------|
| FREE | 10/mo | 5/mo | 50/mo | 100/mo | 3 |
| STARTER | 200/mo | 50/mo | 1,000/mo | 5,000/mo | 20 |
| GROWTH | 1,000/mo | 500/mo | 10,000/mo | 50,000/mo | 100 |
| PRO | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

### Acceptance criteria
- ✅ Hard enforcement server-side — `QuotaService.enforce()` runs before any quota-consuming action
- ✅ Clear UX when limits hit — `AppError(RATE_LIMITED)` returns plan name + upgrade message
- ✅ Audit trail for billing changes — `AppSubscription` model tracks plan + status history

---

## Phase 8 — Production Hardening ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| OpenTelemetry traces | `services/observability/otel.server.ts` | `NodeSDK` + auto-instrumentation (HTTP, fetch, Prisma); OTLP HTTP exporter; env-gated on `OTEL_EXPORTER_OTLP_ENDPOINT`; `TraceIdRatioBasedSampler` (10% prod / 100% dev) |
| Sentry error tracking | `services/observability/sentry.server.ts` | env-gated on `SENTRY_DSN`; integrated into `ErrorLogService.error()`; no-op when unset |
| Structured JSON logger | `services/observability/logger.server.ts` | JSON lines in production for Datadog/GCP/AWS/Axiom; pretty-print in dev; silent in test |
| Correlation IDs | `services/observability/correlation.server.ts` | `AsyncLocalStorage`-based; `getRequestId()` available anywhere |
| requestId in API logs | `services/observability/api-log.service.ts` | Every `withApiLogging()` call sets `requestId` in DB + `x-request-id` response header |
| requestId in error shape | `services/errors/app-error.server.ts` | Every `AppError` carries a `requestId`; `toErrorResponse()` propagates it |
| Log redaction | `services/observability/redact.server.ts` | Active on `ErrorLogService`; covers tokens, emails, sensitive fields |
| Retention policies | `prisma/schema.prisma` → `RetentionPolicy` + per-shop fields | Configurable per scope (GLOBAL/PLAN/SHOP) and kind (AI_USAGE/API_LOG/ERROR_LOG/JOBS) |
| Retention script | `apps/web/scripts/retention.ts` | `pnpm --filter web retention:run` |
| Per-store retention UI | `routes/internal.stores.tsx` | Internal admin can set per-shop retention day overrides (Default / AI / API / Errors) |

### OTel backends supported (set `OTEL_EXPORTER_OTLP_ENDPOINT`)

| Backend | Endpoint |
|---|---|
| Grafana Tempo | `https://<instance>.grafana.net/otlp` |
| Honeycomb | `https://api.honeycomb.io` + `OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=<key>` |
| Jaeger | `http://localhost:4318` (local) |
| Datadog ADOT | `http://localhost:4317` (via Datadog Agent) |
| Lightstep | `https://ingest.lightstep.com` |

### Also delivered (Phase 8 complete)

| Deliverable | File | Notes |
|---|---|---|
| SLO definitions | `docs/slos.md` | 6 SLOs with targets, SQL measurement queries, OTel panel recommendations, error budget policy |
| Incident runbooks | `docs/runbooks/` | 4 runbooks (publish failure, provider outage, webhook storm, connector failure) + index with SEV-1–4 ladder |
| Connector API logging | `routes/api.connectors.create.tsx` + `api.connectors.test.tsx` | Both wrapped with `withApiLogging`; SSRF violations now recorded as `success=false` ApiLog entries |

### Storefront UI Style System (theme-safe merchant control) ✅

| Deliverable | File | Notes |
|-------------|------|-------|
| Shared style schema | `packages/core/src/storefront-style.ts` | `StorefrontStyleSchema` — layout, spacing, typography, colors, shape, responsive, accessibility + `customCss` (max 2000 chars, sanitized at compile time) |
| Style on all UI recipes | `packages/core/src/recipe.ts` | Optional `style` on `theme.banner`, `theme.popup`, `theme.notificationBar`, **`proxy.widget`** |
| Style compiler helpers | `apps/web/app/services/recipes/compiler/style-compiler.ts` | `compileStyleVars()` → `--sa-*` vars; `compileStyleCss()` → scoped CSS snippet; `compileOverlayPositionCss()` → overlay + offsets; `sanitizeCustomCss()` → strips dangerous patterns; `compileCustomCss()` → scopes and sanitizes merchant CSS |
| Theme compilers use style + customCss | `theme.banner.ts`, `theme.notificationBar.ts`, `theme.popup.ts` | Generated CSS: vars block + base rules + responsive + sanitized custom CSS appended last |
| proxy.widget compiler | `proxy.widget.ts` | Style vars + CSS compiled into metafield `_styleCss` field |
| Style Builder UI (3 tabs) | `apps/web/app/components/StyleBuilder.tsx` | **Basic tab**: colors, typography, padding, radius, responsive; **Advanced tab**: layout mode/anchor/offsets/width/zIndex, shadow, border, line height, gap, margin, accessibility; **Custom CSS tab**: textarea (2000 chars) with sanitization warning and `--sa-*` var reference |
| Spec update API | `apps/web/app/routes/api.modules.$moduleId.spec.tsx` | POST body `{ spec }` or formData `spec` → validates and creates new draft version |
| Preview uses style | `apps/web/app/services/preview/preview.service.ts` | All theme module previews inject CSS vars and rules |
| Tests (163 total across monorepo; 145 in apps/web, +24 from style work) | `packages/core/src/__tests__/storefront-style.test.ts`, `apps/web/app/__tests__/style-compiler.test.ts` | Schema validation; `customCss` length/safety limits; `sanitizeCustomCss` strips all dangerous patterns; `compileCustomCss` scopes + sanitizes; overlay z-index; `proxy.widget` with style |

Positioning: inline modules use Theme Editor block placement; overlay (popup) uses safe anchor presets + pixel offsets. No arbitrary CSS values from presets; `customCss` is scoped and sanitized before output.

### Hardening pass (latest)

| Fix | File | Details |
|-----|------|---------|
| `/api/publish` accepts form posts | `routes/api.publish.tsx` | Module detail page posts `<Form method="post">` (form-encoded), but the route only called `request.json()` — publish silently failed. Now detects `Content-Type` and parses JSON or FormData. |
| `/api/publish` routes all `theme.*` types to THEME target | Same | Previously only `theme.banner` was routed to `{ kind: 'THEME' }`; `theme.popup` and `theme.notificationBar` were incorrectly sent as `PLATFORM`. Now uses `spec.type.startsWith('theme.')`. |
| Proxy widget renders `_styleCss` | `routes/proxy.$widgetId.tsx` | The compiler writes `_styleCss` into the metafield, but the proxy route returned raw HTML with no `<style>`. Now extracts `_styleCss` from the metafield value and injects it into a proper HTML document. |
| Proxy widget preview uses style | `services/preview/preview.service.ts` | `proxyWidget()` had hardcoded CSS. Now calls `styleCss()` like the other storefront renderers. |
| Overlay/backdrop controls for all layout modes | `components/StyleBuilder.tsx` | Backdrop color/opacity and anchor/offset controls were gated to `theme.popup` only. Now shown whenever `layout.mode` is `overlay`, `sticky`, or `floating` — so a notification bar set to sticky mode gets the same controls. |

### Remaining backlog (post-launch hardening)

| Item | Priority | Notes |
|------|----------|-------|
| Redis rate limiting | High | Replace `InMemoryRateLimiter` with Upstash Redis for multi-instance correctness |
| GDPR webhooks | High | `customers/data_request`, `customers/redact`, `shop/redact` handlers |
| CSP headers | Medium | Add `Content-Security-Policy` to embedded UI and app proxy responses. **CSP differs by surface** (embedded admin iframe vs storefront proxy vs customer-account extension) — start strict and adjust based on how each surface is loaded. Starter for proxy HTML: `default-src 'none'; style-src 'unsafe-inline'; img-src https:` (omit `frame-ancestors` unless the proxy is explicitly embedded in an iframe; storefront proxies typically render top-level). |
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
        │   ├── /api/modules/:id/spec → update draft spec (Style Builder)
        │   ├── /api/flow/run → FlowRunnerService (manual trigger)
        │   ├── /api/customer-account/config → read CA blocks metafield
        │   └── /proxy/:widgetId → App Proxy; reads styled metafield + renders HTML with _styleCss
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
        │   └── Stores (per-shop provider override + retention day overrides)
        │
        ├── Scheduled flows
        │   ├── /flows → merchant schedule CRUD UI
        │   └── /api/cron → protected endpoint for external cron service
        │
        └── Services
              ├── AI: OpenAI / Anthropic / OpenAI-compatible clients + evals harness
              ├── Billing: BillingService + QuotaService (FREE/STARTER/GROWTH/PRO)
              ├── Compiler: 12 module types → DeployOperations; style-compiler → --sa-* CSS vars for storefront UI
              ├── Observability: OTel traces + Sentry + JSON logger + correlation IDs + redaction
              ├── Flows: FlowRunnerService (retries + per-step logs + idempotency)
              ├── Security: SSRF guard + AES-256-GCM encryption + rate limiting
              └── Flows: ScheduleService (DB-based cron) + FlowRunnerService + idempotency

Shopify Admin API
  ├── Theme Assets (REST) — for theme.* modules
  ├── Metafields (GraphQL) — for functions/proxy/customer-account config
  ├── App Subscriptions (GraphQL) — for billing
  └── Shop Plan query (GraphQL) — for capability gating

Extensions (read config from metafields)
  ├── Theme App Extension (blocks/banner.liquid, notification-bar.liquid)
  ├── Customer Account UI Extension (Preact + Polaris 2026-01; 64 KB limit; generic, config-driven)
  ├── Checkout UI Extension (generic renderer)
  └── Functions (Rust — discount-rules reads metafield config)
```

---

## UI/UX Guidelines Audit ✅

### What was done

| Area | Change | Files |
|---|---|---|
| Guideline doc | Removed inapplicable Prompt Pack section; rewrote to match actual features; added Customer Account + Internal Dashboard sections | `docs/uiux-guideline.md` |
| Home page | Added loading state (SkeletonBodyText), improved EmptyState with CTA, submit loading indicator | `apps/web/app/routes/_index.tsx` |
| Flows page | Added backAction, EmptyState with CTA, delete confirmation modal, InlineStack for actions | `apps/web/app/routes/flows._index.tsx` |
| Connectors page | Added EmptyState with CTA, delete confirmation modal, help text on form fields | `apps/web/app/routes/connectors._index.tsx` |
| App nav | Added Flows link to embedded app nav | `apps/web/app/root.tsx` |
| Internal dashboard | Redesigned with stat cards (InlineGrid), quick links grid with descriptions | `apps/web/app/routes/internal._index.tsx` |
| Internal sub-pages | Added backAction to all 6 sub-pages (ai-providers, usage, logs, api-logs, stores, jobs) | All `internal.*.tsx` routes |
| Internal logs | Replaced raw text dumps with DataTable (error logs, API logs, jobs, step logs, usage, pricing) | `internal.jobs.tsx`, `internal.usage.tsx`, `internal.logs.tsx`, `internal.api-logs.tsx`, `internal.ai-providers.tsx` |
| Internal usage | Added summary stat cards (requests, cost, tokens in/out) | `internal.usage.tsx` |
| Internal stores | Added Badges for plan tier and subscription status | `internal.stores.tsx` |
| Customer account blocks | Added loading state ("Loading..."), error state (badge/banner), updated hook with error status | All 4 blocks + `useBlockConfig.ts` |

### Acceptance criteria
- ✅ Every sub-page has back navigation to its parent
- ✅ Empty states use EmptyState component with CTA where applicable
- ✅ Destructive actions (delete) have confirmation modals
- ✅ Loading states shown during form submissions
- ✅ Internal admin uses DataTable instead of raw text for logs/data
- ✅ Customer account blocks handle loading/error/hidden states
- ✅ All pages verified in browser (internal admin pages)

---

## Internal Admin Overhaul ✅

### Layout & Navigation
- Created `internal.tsx` Remix layout route with Polaris `Frame`, `TopBar`, and `Navigation`
- Left sidebar with icons: Dashboard, AI Providers, Usage & Costs, Activity Log, Error Logs, API Logs, Stores, Jobs, Logout
- Top header with "SA" branded logo, "Admin SA" user menu with logout option
- Responsive mobile navigation toggle
- Active page highlight in sidebar

### Activity Log System
| Component | Description |
|---|---|
| `ActivityLog` Prisma model | Tracks actor, action, resource, shopId, details (JSON), IP, timestamp. Indexed on createdAt, actor, action, shopId |
| `ActivityLogService` | Service with `log()`, `list()` (with filters), `getDistinctActions()` |
| `internal.activity.tsx` | Full page with advanced filters: Actor, Action, Search, Date From/To. DataTable with colored badges per actor type |
| API endpoints | Activity logging integrated into: `api.publish`, `api.ai.create-module`, `api.rollback`, connectors CRUD, flows CRUD, billing plan changes, AI provider management, store settings |

### Advanced Filters (all internal pages)
| Page | Filters |
|---|---|
| Error Logs | Level (ERROR/WARN/INFO), Search (message/route), Date range |
| API Logs | Actor, Status (success/error), Search (path), Date range |
| Jobs | Status (QUEUED/RUNNING/SUCCESS/FAILED), Type, Search, Date range |
| Stores | Plan tier, Domain search |
| Usage & Costs | Action search, Date range |
| Activity Log | Actor, Action, Search, Date range |

### Toast Notifications
- Internal admin: Toast system via `Frame` layout + `Outlet` context (`showToast`)
- Embedded app: Error banners on form validation failures

### Loading States & Skeletons
- All internal pages: `SkeletonBodyText` during data loading via `useNavigation().state`
- Embedded pages: `SkeletonBodyText` on list loading, `Banner` during AI generation
- Loading spinners on all submit buttons via `loading={isSaving}`

### Files changed
| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `ActivityLog` model with indexes, relation to Shop |
| `services/activity/activity.service.ts` | New service for logging + querying activities |
| `routes/internal.tsx` | New layout with Frame/TopBar/Navigation/Toast |
| `routes/internal._index.tsx` | Redesigned dashboard with 6 stat cards including activities |
| `routes/internal.activity.tsx` | New activity log page with advanced filters |
| `routes/internal.logs.tsx` | Added advanced filters (level, search, date range) |
| `routes/internal.api-logs.tsx` | Added advanced filters (actor, status, search, date range) |
| `routes/internal.jobs.tsx` | Added advanced filters (status, type, search, date range) |
| `routes/internal.stores.tsx` | Added filters (plan, domain search), activity logging |
| `routes/internal.usage.tsx` | Added date range filters, summary stat cards |
| `routes/internal.ai-providers.tsx` | Added activity logging for provider/price actions |
| `routes/_index.tsx` | Enhanced with loading states, AI generation banner |
| `routes/billing._index.tsx` | Added skeletons, activity logging |
| `routes/connectors._index.tsx` | Added activity logging on create/delete |
| `routes/flows._index.tsx` | Added activity logging on create/delete/toggle |
| `routes/api.publish.tsx` | Added activity logging |
| `routes/api.ai.create-module.tsx` | Added activity logging |
| `routes/api.rollback.tsx` | Added activity logging |
| `package.json` | Added `@shopify/polaris-icons` dependency |

---

## Dashboard Settings ✅

### AppSettings Model (Prisma)
Single-row settings table with upsert pattern (`id = "singleton"`).

### Settings Page (`internal.settings.tsx`)
4 sections, each with its own save button:

| Section | Fields |
|---|---|
| **Appearance** | App name, Header/brand color (with live preview bar + color swatch), Logo URL (with image preview), Favicon URL |
| **Profile** | Admin name (with initials avatar fallback), Admin email, Profile picture URL (with live avatar preview) |
| **Contact & Legal** | Company name, Support email, Support URL, Privacy policy URL, Terms of service URL |
| **App Configuration** | Default timezone (12 options), Date format (4 options), Email alerts toggle + recipient emails, Maintenance mode toggle + custom message |

### Dynamic Layout Integration
Settings are loaded in the `internal.tsx` layout loader and applied to:
- **TopBar color**: CSS override via `<style>` tag (`headerColor`)
- **Logo**: Custom SVG with brand color, or user-provided `logoUrl`
- **User menu**: `adminName`, `initials` derived from name, `profilePicUrl` as avatar
- **Logo label**: `appName` used as accessibility label

### Files changed
| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `AppSettings` model (appearance, profile, contact, app config fields) |
| `services/settings/settings.service.ts` | New service with `get()` and `update()` (upsert pattern) |
| `routes/internal.settings.tsx` | New settings page with 4 form sections |
| `routes/internal.tsx` | Layout loads settings; applies header color, app name, profile pic, admin name dynamically; Settings link in sidebar |
