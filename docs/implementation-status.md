# Implementation Status — AI Shopify SuperApp

> Last updated: 2026-03-05
> All 163 automated tests pass (145 apps/web + 17 packages/core + 1 packages/rate-limit). See [phase-plan.md](./phase-plan.md) for the original plan.
> **AI Module doc alignment:** Single source of truth from [ai-module-main-doc.md](./ai-module-main-doc.md); see section below.

---

## Summary

| Phase | Title | Status |
|-------|-------|--------|
| — | AI Module — Full Doc Alignment | ✅ Complete |
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
| — | Postman-like API Tester + Saved Endpoints | ✅ Complete |
| — | Module Templates (From Template) | ✅ Complete |
| — | Visual Flow Builder | ✅ Complete |
| — | Data Stores + Custom Pages | ✅ Complete |
| — | Workflow Engine Spec (Graph-based) | ✅ Complete |
| — | Admin Dashboard: Categories, Plan Tiers, Recipe Edit, Store Plan | ✅ Complete |
| — | **AI Patch Plan — Remove Generic Outputs** | ✅ Phases 1–5 Complete |

---

## AI Patch Plan — Remove Generic Outputs ✅ Phases 1–5 Complete

Audit and fixes so the AI produces **no generic outputs** unless truly the best safe fallback, with **maximum creativity** (UI, config, behavior/animations) within documented restrictions (OS 2.0 only, no deprecated injection, no arbitrary merchant code, strict RecipeSpec validation). See also [technical.md](./technical.md) § 7a.

### Root causes — status

| Cause | Location | Status |
|-------|----------|--------|
| Classifier returns keyword bucket instead of clean intent ID | `classify.server.ts` | ✅ Fixed — `intent` = `intentId` (canonical); `intentGroup` = keyword bucket for analytics |
| Effect/widget map to non-routed intents | `intent-packet.ts` | ✅ Fixed — `theme.effect → utility.effect`, `proxy.widget → utility.floating_widget`; both in CLEAN_INTENTS + ROUTING_TABLE |
| Unknown intent always → promo popup | `resolveRouting()` | ✅ Fixed — fallback is `platform.extensionBlueprint` (not promo popup) |
| Routing fallback in intent-packet.server.ts | `intent-packet.server.ts` | ✅ Fixed — falls back to `classification.moduleType` not hardcoded 'promo.popup' |
| Schema/catalog only on retry | `llm.server.ts` | ✅ Fixed — when `confidenceScore < 0.8` (not direct), full schema + style + catalog included on attempt 0 |
| Stub client when no provider | `getLlmClient()` | ✅ Fixed — throws `AiProviderNotConfiguredError`; setup CTA surfaced in API response |
| Routing output_schema vs validator | ROUTING_TABLE | ✅ Documented — `StorefrontModuleSpecV1` is implemented as RecipeSpec (see technical.md) |
| theme.effect schema too small | `recipe.ts`, `allowed-values.ts` | ✅ Fixed — expanded to 7 fields: effectKind, intensity, speed, startTrigger, durationSeconds, overlayPlacement, reducedMotion |
| Catalog mapping missing effect | `catalog-details.server.ts` | ✅ Fixed — `theme.effect: 'effect'`, `proxy.widget: 'widget'`, `theme.floatingWidget: 'widget'` in TYPE_TO_TEMPLATE_KIND |
| No invariant tests | `packages/core/src/__tests__/intent-packet.test.ts` | ✅ Added — covers CLEAN_INTENTS completeness, ROUTING_TABLE completeness, blueprint fallback, utility.effect + utility.floating_widget |
| No theme.floatingWidget module type | `allowed-values.ts`, `recipe.ts`, summaries, expectations | ✅ Added — full `theme.floatingWidget` type (variant, anchor, onClick, message, url, hideOnMobile/Desktop) |
| AI produces minimal configs (no settings packs) | `prompt-expectations.server.ts`, `llm.server.ts` | ✅ Fixed — `getSettingsPack()` per module type always injected; covers popup/banner/bar/effect/floatingWidget/widget |
| Confidence scoring only Tier A | `classify.server.ts` | ✅ Fixed — Tier B (embedding similarity via `embedding-classifier.server.ts` + `intent-examples.ts`) integrated into S2 weight; Tier C (cheap LLM) in `cheap-classifier.server.ts` |
| No profile-driven prompt | `llm.server.ts` | ✅ Fixed — `PROFILE_GUIDANCE` map per `prompt_profile`; routing profile passed from IntentPacket → prompt |
| No drift-check CI | `apps/web/app/__tests__/ai-drift-check.test.ts` | ✅ Added — all types have summaries, expectations, full schema specs; routing invariants; theme.floatingWidget coverage |

### Phase summary

- **Phase 1:** ✅ Complete — classifier intent ID, effect/widget mapping+routing, blueprint fallback, catalog mapping, theme.effect schema expansion, schema/catalog on first attempt for low confidence, invariant tests.
- **Phase 2:** ✅ Complete — Tier B (embedding similarity; `embedding-classifier.server.ts` + `intent-examples.ts`; requires `OPENAI_API_KEY`), Tier C (cheap LLM classifier; `cheap-classifier.server.ts`; fires when confidence < 0.55). Multi-intent detection deferred (Phase 2.3).
- **Phase 3:** ✅ Complete — Settings packs injected per type (`getSettingsPack()`); `theme.floatingWidget` new type; Behavior/Animation DSL deferred (Phase 3.3 — very large, tracked separately).
- **Phase 4:** ✅ Complete — Profile-driven prompt guidance per `prompt_profile`; schema/catalog on attempt 0 for non-direct confidence; settings pack always injected.
- **Phase 5:** ✅ Complete (drift-check CI test at `ai-drift-check.test.ts`). Doc auto-generation deferred (Phase 5.1 — build script).

### Remaining deferred items (tracked separately)

| Item | Why deferred |
|------|-------------|
| Phase 2.3 multi-intent prompts | Requires planner step + multi-option grouping — medium feature |
| Phase 3.3 Behavior/Animation DSL | Very large — requires new schema types and safe execution sandbox |
| Phase 3.2.3 theme.composed | Very large — requires component primitive library |
| Phase 5.1 autogenerate doc fragments | Build script — low priority |

---

## AI Module — Full Doc Alignment ✅

Aligned with [ai-module-main-doc.md](./ai-module-main-doc.md). Single source of truth for allowed values; DB and features match doc 24.4 and related sections.

| Deliverable | File | Notes |
|-------------|------|-------|
| Allowed Values Manifest | `packages/core/src/allowed-values.ts` | Full doc §4+§14+§18: THEME_LIQUID_TEMPLATE_NAMES, THEME_SECTION_SCHEMA_ATTRIBUTES, POST_PURCHASE_TARGETS, ADMIN_SURFACE_KINDS, RECIPE_BLOCK_TYPES, RECIPE_INTENTS, RECIPE_SURFACES, CUSTOMER_ACCOUNT_BLOCK_TARGETS; LIMITS extended (bundles, offerTitle, label, goal, suggestedFiles, checkoutBlockMessage, integration path min); STOREFRONT_* style enums; single source for recipe + storefront-style |
| Catalog generator from manifest | `packages/core/src/catalog.generator.ts` | Surfaces, intents, components, triggers from manifest; no static lists |
| RecipeSpec placement + limits | `packages/core/src/recipe.ts` | `placement` (enabled_on/disabled_on), LIMITS, manifest enums for customer/checkout/admin/POS/pixel |
| New RecipeSpec types | `packages/core/src/recipe.ts` | checkout.block, postPurchase.offer, admin.block, pos.extension, analytics.pixel |
| Theme compilers placement | `theme.banner.ts`, `theme.popup.ts`, `theme.notificationBar.ts` | Section schema emits enabled_on/disabled_on from spec.placement |
| Classify + prompts from manifest | `classify.server.ts`, `prompt-expectations.server.ts` | CLASSIFICATION_RULES, INTENT_KEYWORDS, SURFACE_KEYWORDS, LIMITS from core |
| Prisma schema doc 24.4 | `apps/web/prisma/schema.prisma` | Recipe, ModuleAsset, ImageIngestionJob, ModuleInstance, ModuleSettingsValues, DataCapture, FunctionRuleSet, FlowAsset, ModuleEvent, ModuleMetricsDaily, AttributionLink; Shop.timezone; Module/ModuleVersion extended |
| Pre-publish validator | `apps/web/app/services/publish/pre-publish-validator.server.ts` | Theme placement, checkout target + Plus, bundle size (doc §27.2); used in api.publish |
| Picker UI (Screens 1–6) | `apps/web/app/routes/picker._index.tsx` | Goal, placement (template + section group) from manifest; step flow skeleton |
| GDPR webhooks | `webhooks.customers.data-request`, `webhooks.customers.redact`, `webhooks.shop.redact` | HMAC via authenticate.webhook; data request log; customer/shop redact (doc §2.4) |
| Analytics ingestion + read | `apps/web/app/services/analytics/module-events.server.ts` | ingestModuleEvent(), getModuleMetricsDaily(), getRecentModuleEvents() for doc 24.4.2 |

### Doc Additions: IntentPacket, Routing, Validator+Repair, Confidence (doc §15)

| Deliverable | File | Notes |
|-------------|------|-------|
| **Phase 1** IntentPacket schema + Clean Intent List | `packages/core/src/intent-packet.ts` | Zod IntentPacketSchema; CLEAN_INTENTS, SURFACES, MODULE_ARCHETYPES; doc 15.5, 15.11, 15.13 |
| Routing table + resolver | `packages/core/src/intent-packet.ts` | ROUTING_TABLE, MODULE_TYPE_TO_INTENT, resolveRouting(intentOrModuleType); doc 15.15 |
| IntentPacket builder | `apps/web/app/services/ai/intent-packet.server.ts` | buildIntentPacket(text, classification, options); used in create-module API |
| Create-module uses IntentPacket | `apps/web/app/routes/api.ai.create-module.tsx` | Builds packet, passes intentPacketJson to LLM prompt; returns intentPacket (intent, confidence, routing, band, alternatives) |
| **Phase 3** Validator + repair loop | `apps/web/app/services/ai/llm.server.ts` | compileRepairPrompt(), validateAndRepairRecipe(); on option validation failure, one repair attempt per option (doc 15.9) |
| **Phase 2** Confidence scoring | `apps/web/app/services/ai/classify.server.ts` | confidenceScore 0–1 (S1 keyword + S3/S4 placeholders), alternatives[], reasons[]; CONFIDENCE_THRESHOLDS (0.8, 0.55) |
| Confidence band in API | `api.ai.create-module` response | confidenceBand: direct \| with_alternatives \| fallback; alternatives and reasons for UI |

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
| Root object schema wrapper | `services/ai/recipe-json-schema.server.ts` | RecipeSpec union wrapped in `{ recipe: <union> }` to satisfy OpenAI root `type: "object"` requirement |
| 3-option generation | `services/ai/llm.server.ts` → `generateValidatedRecipeOptions()` | Returns 3 Zod-validated recipe options with explanations; merchant selects one |
| 3-option modification | `services/ai/llm.server.ts` → `modifyRecipeSpecOptions()` | Returns 3 modified recipe options; merchant picks one to save as new version |
| Hybrid two-stage prompt | `classify.server.ts` + `module-summaries.server.ts` | Stage 1: keyword classifier (0 tokens); Stage 2: compressed per-type summary (~200-400 tokens) |
| On-demand catalog context | `catalog-details.server.ts` | Filtered catalog subset (10-20 entries) appended on retry if Zod validation fails |
| Propose + confirm API | `api.ai.create-module.tsx` + `api.ai.create-module-from-recipe.tsx` | Propose returns 3 options; confirm creates module from selected recipe |
| Modify propose + confirm | `api.ai.modify-module.tsx` + `api.ai.modify-module-confirm.tsx` | Propose returns 3 modification options; confirm saves selected as new version |
| Prompt design (purpose + flow + tech + extras) | `prompt-expectations.server.ts` + `modules._index.tsx` | Purpose block, user-flow guidance, technical frame (schema), edge-case hints; UI placeholder nudges merchants to describe who/when/what |
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

### Prompt design (AI module generation)
We structure the AI prompt using four principles that improve success in real-world prompt-based builders:

1. **Clear purpose** — State what we're building (Shopify storefront modules), who it's for (store visitors), and that output must be valid RecipeSpec so it deploys. Implemented in `PROMPT_PURPOSE_AND_GUIDANCE` in `prompt-expectations.server.ts`.
2. **User-focused flow** — Ask the AI to infer a clear visitor flow (who sees it, when, what they can do) when the merchant's request is vague; vary the 3 options by flow; describe the flow in each option's explanation. Same file.
3. **Lightweight tech hints** — Provide the exact expected JSON shape, validation rules, and "invalid / do not" as a "technical frame" so the model can scaffold correctly without implementation detail. `getPromptExpectations()`.
4. **Edge cases / extras** — Mention responsive, accessibility, and one clear CTA; if the request mentions a coupon/code, note copyability. Nudges the first version toward usable. In the purpose/guidance block and in the UI help text.

The modules page placeholder and help text nudge merchants to describe purpose + flow + extras (e.g. "who sees it, when, what they can do") so the user request we send is higher quality.

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
        │   ├── / → dashboard with stats, charts, quick links
        │   ├── /modules → AI builder + template picker + module list (tabbed)
        │   ├── /modules/:id → detail, preview, publish, rollback, version history, style builder
        │   ├── /connectors → connector CRUD + stats + test links
        │   ├── /connectors/:id → Postman-like API tester + saved endpoints
        │   ├── /flows → schedules + visual flow modules list
        │   ├── /flows/build/:flowId → visual flow builder (trigger + step canvas)
        │   ├── /data → predefined + custom data stores management
        │   ├── /data/:storeKey → data store records (view, add, delete)
        │   ├── /billing → plan management + quota dashboard
        │   ├── /logs → merchant activity + jobs + usage overview
        │   └── /settings → merchant settings (retention, preferences)
        │
        ├── API Routes
        │   ├── /api/ai/create-module → quota check → AI generate → Module draft
        │   ├── /api/modules/from-template → quota check → template lookup → Module draft
        │   ├── /api/publish → capability gate → compile → Shopify API → markPublished
        │   ├── /api/rollback → switch activeVersionId
        │   ├── /api/connectors/create|test → ConnectorService (SSRF-protected)
        │   ├── /api/connectors/:id/endpoints → ConnectorEndpoint CRUD (saved endpoints)
        │   ├── /api/connectors/suggest-mapping → AI-assisted field mapping
        │   ├── /api/data-stores → enable/disable/create-custom/add-record/delete-record
        │   ├── /api/theme/analyze → ThemeAnalyzerService → ThemeProfile
        │   ├── /api/modules/:id/spec → update draft spec (Style Builder + Flow Builder)
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
        │   ├── Stores (per-shop provider override + retention day overrides)
        │   ├── Activity log (all merchant/system/admin actions)
        │   └── Settings (appearance, profile, contact, app config)
        │
        ├── Scheduled flows
        │   ├── /flows → merchant schedule CRUD + visual flow builder entry
        │   └── /api/cron → protected endpoint for external cron service
        │
        └── Services
              ├── AI: OpenAI / Anthropic / OpenAI-compatible clients + evals harness
              ├── Billing: BillingService + QuotaService (FREE/STARTER/GROWTH/PRO)
              ├── Compiler: 14 module types → DeployOperations; style-compiler → --sa-* CSS vars for storefront UI
              ├── Observability: OTel traces + Sentry + JSON logger + correlation IDs + redaction
              ├── Flows: FlowRunnerService (4 step kinds + retries + per-step logs + idempotency)
              ├── Data: DataStoreService (predefined + custom stores, records CRUD)
              ├── Templates: MODULE_TEMPLATES (12 curated) + catalog.generated.json (12k IDs)
              ├── Security: SSRF guard + AES-256-GCM encryption + rate limiting
              └── Scheduling: ScheduleService (DB-based cron) + FlowRunnerService + idempotency

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

## Admin app — stack, tooling & UI fixes

### Stack & tooling (apps/web)

| Area | Change | Notes |
|------|--------|--------|
| Vite | 5 → 6 | ESM-only; removes CJS deprecation warning. `vite.config.ts` and `vitest.config.ts` use `fileURLToPath(import.meta.url)` for `__dirname` (ESM-safe). |
| Vitest | 2 → 3 | Compatible with Vite 6. |
| React Router v7 future flags | `vite.config.ts` → `remix({ future: { v3_fetcherPersist, v3_lazyRouteDiscovery, v3_relativeSplatPath, v3_singleFetch, v3_throwAbortReason } })` | Opt-in to RR v7 behavior; no app code changes required. |
| notFound (SSR) | `internal.activity.$activityId.tsx` | Replaced `import { notFound } from '@remix-run/node'` with `throw new Response(null, { status: 404 })` so Vite 6 ESM SSR does not fail on CJS named export. |

### UI robustness (cache reset / embedded app)

| Area | Change | Files |
|------|--------|--------|
| UTF-8 | `<meta charSet="utf-8" />` first in `<head>` | `root.tsx` — avoids checkmark/Unicode mojibake (e.g. âœ") when styles load late. |
| Plan list checkmarks | `&#10003;` instead of literal `✓` | `billing._index.tsx` — safe regardless of encoding. |
| Card & Banner corners | Polaris **new Card** renders `.Polaris-ShadowBevel` (not LegacyCard). Forced `border-radius: 12px !important` on `.Polaris-ShadowBevel`, `.Polaris-LegacyCard`, `.Polaris-Banner` | `app.css` + inline `<style>` in `root.tsx` — Polaris uses 0 radius on small viewports by default. |
| TextField / Button | Fallback `border-radius` in app.css | `.Polaris-TextField__Backdrop`, `.Polaris-Button` — round when Polaris vars load late. |
| Dashboard job success bar | Inline fallback colors + app.css `.Dashboard-jobSuccessBar-fill` | `_index.tsx`, `app.css` — bar remains visible after cache reset. |

See also: [debug.md](./debug.md) (§8 card corners, §7 embedded auth).

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

---

## Admin Dashboard Enhancements ✅

### What was built
- **Store plan override** — On `/internal/stores`, admin can set a store’s plan (FREE, STARTER, GROWTH, PRO) without Shopify billing. `BillingService.setPlanForShop(shopId, plan)` upserts `AppSubscription` and syncs `Shop.planTier`. Activity: `STORE_PLAN_CHANGED`.
- **Recipe edit** — `/internal/recipe-edit`: select store and module, edit RecipeSpec JSON. Buttons: **Validate** (Zod only) and **Save as new version**. Backend validates with `RecipeSpecSchema.safeParse`; save uses `ModuleService.getModuleByShopId` / `createNewVersionByShopId`. Activity: `MODULE_SPEC_EDITED`.
- **Plan tier configuration** — `PlanTierConfig` model; `/internal/plan-tiers` to view/edit display name, price, trial days, quotas JSON. `PlanConfigService`: `getPlanConfig`, `getAllPlanConfigs`, `updatePlanTier`, `seedPlanTiersIfEmpty`. Billing and Quota services read from DB with fallback to code `PLAN_CONFIGS`.
- **Type category configuration** — `AppSettings.categoryOverrides` (JSON); `/internal/categories` lists categories from `TEMPLATE_CATEGORIES` and allows editing overrides (display name, enabled) as JSON.
- **Advanced** — `/internal/advanced`: Store & plan control (link to Stores), placeholder for future flags.

### Backend validation
- Recipe save and Validate use `RecipeSpecSchema.safeParse`; errors returned as Zod `flatten()`.
- Plan tier updates validate quotas (numbers, -1 for unlimited) before persisting.
- Category overrides JSON validated before saving.

### Files changed
| File | Change |
|---|---|
| `prisma/schema.prisma` | `PlanTierConfig` model; `AppSettings.categoryOverrides` |
| `prisma/migrations/*` | Add PlanTierConfig table; add categoryOverrides column |
| `services/billing/billing.service.ts` | `setPlanForShop()`; `createSubscription` / `getPlanConfig` use `getPlanConfigFromDb` |
| `services/billing/plan-config.service.ts` | New: getPlanConfig, getAllPlanConfigs, updatePlanTier, seedPlanTiersIfEmpty |
| `services/billing/quota.service.ts` | Use `getPlanConfig()` from plan-config.service |
| `services/modules/module.service.ts` | `getModuleByShopId`, `createNewVersionByShopId` |
| `services/settings/settings.service.ts` | `categoryOverrides` in get/update |
| `services/activity/activity.service.ts` | `MODULE_SPEC_EDITED`, `STORE_PLAN_CHANGED` |
| `routes/internal.stores.tsx` | Form intent `set_plan`; Change plan dropdown + Set plan button |
| `routes/internal.recipe-edit.tsx` | New: store/module picker, spec textarea, Validate/Save with session toast |
| `routes/internal.plan-tiers.tsx` | New: list plan configs, edit displayName/price/trialDays/quotas JSON |
| `routes/internal.categories.tsx` | New: list categories, edit categoryOverrides JSON |
| `routes/internal.advanced.tsx` | New: Store & plan control section, link to Stores |
| `routes/internal.tsx` | Nav: Plan Tiers, Categories, Recipe edit, Advanced |
| `routes/billing._index.tsx` | Loader uses `getAllPlanConfigs()` for plans list |
| `docs/internal-admin.md` | New routes and Backend validation section |

### Follow-up (Enterprise, Templates, Activity detail, Settings merge)

| Change | Details |
|--------|---------|
| **Enterprise plan** | `BillingPlan` and `PLAN_CONFIGS` include ENTERPRISE (price -1 = "Contact us", all quotas unlimited). Pro set to 10× Growth quotas. Plan-tiers UI allows price -1; Stores "Change plan" includes Enterprise. |
| **Categories: add new** | Internal categories page has "Add new category" form (ID, display name, enabled); custom categories stored in `categoryOverrides` and shown in "All categories (code + custom)". |
| **Recipe edit: All recipes** | Store dropdown includes "All recipes (templates)" (`__templates__`); lists `MODULE_TEMPLATES`; save writes to `AppSettings.templateSpecOverrides`. `api.modules.from-template` uses overridden spec when present. |
| **Advanced → Settings** | Advanced nav item removed; content moved to Settings (Advanced section: Store & plan control, other controls). `/internal/advanced` redirects to `/internal/settings`. |
| **Stores UI** | Plan dropdown is native `<select>` so submitted value is correct; Set plan/Save buttons use `size="slim"` and layout wraps to prevent overflow. |
| **Activity detail** | `ActivityLogService.getById()`; route `internal.activity.$activityId` shows Time, Actor, Action, Resource, Store, IP, Details JSON. Activity list has "View" column. |
| **AI Providers** | `getApiKeyMasked(id)` returns masked key (e.g. ••••••••xyz1). Provider cards show API key (masked), Model, Base URL. |
| **Dashboard** | API cost 24h, job success rate with ProgressBar, quick links (Stores, Usage, AI providers, Error logs, Jobs, Activity, Plan tiers, Categories, Recipe edit, Settings). |
| **Settings** | Password management card (INTERNAL_ADMIN_PASSWORD / SSO); Environment variables card (.env.example reference). |
| **Templates** | New route `/internal/templates`: Module templates (link to recipe-edit with templates) + Flow templates section. Nav item "Templates" added. |
| **Schema/migrations** | `AppSettings.templateSpecOverrides`; migration `20260303130000_add_template_spec_overrides`. |

Key files (follow-up): `plan-config.service.ts`, `billing.service.ts`, `internal.stores.tsx`, `internal.plan-tiers.tsx`, `internal.categories.tsx`, `internal.recipe-edit.tsx`, `internal.settings.tsx`, `internal.activity.$activityId.tsx`, `internal.ai-providers.tsx`, `internal._index.tsx`, `internal.templates._index.tsx`, `api.modules.from-template.tsx`, `activity.service.ts`, `settings.service.ts`, `internal/ai-provider.service.ts`, `internal.tsx` (nav), Prisma schema.

---

## Embedded App UI Overhaul ✅

### Dashboard (`_index.tsx`)
Complete redesign from simple module list to a full-featured merchant dashboard:
- **Welcome banner** with store name and plan info
- **6 stat cards**: Total modules, Published, Drafts, Connectors, Schedules, Plan
- **7-day bar chart** (inline SVG): Modules created over last 7 days with day labels
- **Job success rate**: Percentage with ProgressBar visualization (30-day window)
- **Modules by type**: Badge breakdown of module types
- **Recent jobs**: Last 5 jobs table with status badges
- **AI Module Builder**: Redesigned with "AI-powered" badge, highlight-tone generation banner
- **Modules list**: Added Category column, status summary ("X live · Y draft"), View buttons
- **Quick links**: 3-card grid linking to Connectors, Flows, Billing with descriptions

### Settings Page (`settings._index.tsx`)
New merchant-facing settings page:
- **Account overview**: Store domain, plan/subscription status, resource counts (modules, connectors, schedules)
- **Data retention**: 4-field form (Default, AI usage, API logs, Error logs) with inherit pattern
- **Preferences**: Extensible section with coming-soon banner for future settings
- **Danger zone**: Disabled destructive actions (delete all modules, purge logs)

### Module Detail (`modules.$moduleId.tsx`)
Enhanced with better visual hierarchy:
- **4 info cards** (Type, Category, Versions, Plan tier) in a top grid
- **Status badges** in page title metadata
- **Link to billing** from plan gate warnings
- **Styled code blocks** with background + rounded corners for compiled ops and spec JSON
- **Better publish section** with status-aware button text ("Publish to store" vs "Re-publish")

### Connectors (`connectors._index.tsx`)
- Added **3 stat cards** (Total, Tested, Untested) with color-coded values
- **2-column form layout** for add connector form
- **Status badges** replacing raw text (Tested date vs "Untested")
- **SSRF badge** indicator

### Flows (`flows._index.tsx`)
- Added **3 stat cards** (Total, Active, Paused)
- **Info banner** explaining cron scheduling
- **2-column form layout** for create schedule
- **Code-formatted** cron expressions in table

### Billing (`billing._index.tsx`)
- **Progress bars** for each usage quota with color-coded thresholds (green/yellow/red)
- **Plan comparison cards** in 3-column grid with feature lists, current plan badge
- **Full-width upgrade buttons** with plan-aware text

### Navigation
Updated embedded app navigation (`root.tsx`):
Home → Modules → Connectors → Flows → Logs & Usage → Billing → Settings

### Dashboard & Page Separation (latest)

**Dashboard (`_index.tsx`)** — simplified to a clean overview:
- Welcome banner, 6-metric stat cards (modules, published, drafts, connectors, schedules, plan)
- 7-day module creation bar chart and 30-day job success rate with progress bar
- Recent jobs table (last 5) with quick "View all" link to Logs
- Quick navigation cards to Modules, Connectors, Flows, and Logs & Usage

**Modules page (`modules._index.tsx`)** — dedicated page for module management:
- AI Module Builder (moved from dashboard) with prompt form and loading state
- Stats row (total, published, drafts) and type breakdown badges
- Tabbed module list (All / Published / Drafts) with DataTable and filter tabs

**Logs & Usage page (`logs._index.tsx`)** — comprehensive merchant activity and usage:
- Three tabs: **Overview**, **Jobs**, **Activity**
- **Overview tab**: success rate banner, key metrics (success rate, total jobs, AI requests, AI cost), 7-day success/fail charts, success rate by job type with progress bars, plan usage & limits section with progress bars and warnings, AI token statistics
- **Jobs tab**: last 20 jobs with type, status, duration, and error details
- **Activity tab**: recent activity log showing actor, action, and resource
- Usage limits display real-time quota consumption vs plan limits

### Files changed
| File | Change |
|---|---|
| `routes/_index.tsx` | Simplified to clean dashboard with stats, charts, quick links |
| `routes/modules._index.tsx` | New dedicated modules page with AI builder and tabbed list |
| `routes/logs._index.tsx` | New merchant logs & usage page with 3 tabs |
| `routes/settings._index.tsx` | Merchant settings page |
| `routes/modules.$moduleId.tsx` | Enhanced with info cards, styled code blocks, better hierarchy |
| `routes/connectors._index.tsx` | Added stats cards, 2-col layout, status badges |
| `routes/flows._index.tsx` | Added stats cards, info banner, 2-col layout |
| `routes/billing._index.tsx` | Usage progress bars, plan comparison cards |
| `root.tsx` | Updated nav: added Modules and Logs & Usage links |

---

## Postman-like API Tester + Saved Endpoints ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| ConnectorEndpoint model | `prisma/schema.prisma` | `connectorId`, `name`, `path`, `method`, `defaultHeaders`, `defaultBody`, cascade delete |
| Endpoint CRUD API | `routes/api.connectors.$connectorId.endpoints.tsx` | GET (list), POST with intent create/update/delete |
| Connector detail page | `routes/connectors.$connectorId.tsx` | Full Postman-like UI: method selector, path input, headers (JSON), body editor, response viewer |
| Response viewer | Same | Status badge, headers collapsible, formatted JSON body, timing |
| Save as endpoint | Same | Modal to name and save current request config as reusable endpoint |
| Saved endpoints tab | Same | DataTable: name, method badge, path, last status, Test/Delete actions |
| Connector list update | `routes/connectors._index.tsx` | Added endpoint count column, "Test API" link per connector |

### Acceptance criteria
- ✅ All HTTP methods supported (GET, POST, PUT, PATCH, DELETE)
- ✅ One connector can have multiple saved endpoints (one ERP → many APIs)
- ✅ SSRF protections maintained (test runs server-side via ConnectorService)
- ✅ Response displayed with status, headers, and formatted body

---

## Module Templates (From Template) ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Template registry | `packages/core/src/templates.ts` | 12 pre-built templates across all categories (banner, popup, notification bar, discount rules, flows, customer account, etc.) |
| Template exports | `packages/core/src/index.ts` | `MODULE_TEMPLATES`, `findTemplate`, `getTemplatesByCategory` |
| Create from template API | `routes/api.modules.from-template.tsx` | POST with `templateId` → quota check → createDraft → redirect to module detail |
| Modules index UI | `routes/modules._index.tsx` | Toggle: "Generate with AI" / "From Template"; template grid with category filter, use-template buttons |
| Activity logging | Same | `MODULE_CREATED_FROM_TEMPLATE` action logged |

### Templates included

| Template | Type | Category |
|----------|------|----------|
| Promotional Banner | theme.banner | STOREFRONT_UI |
| Exit Intent Popup | theme.popup | STOREFRONT_UI |
| Welcome Popup | theme.popup | STOREFRONT_UI |
| Announcement Bar | theme.notificationBar | STOREFRONT_UI |
| VIP Customer Discount | functions.discountRules | FUNCTION |
| Bulk Order Discount | functions.discountRules | FUNCTION |
| Tag Customer on Order | flow.automation | FLOW |
| Add Order Note | flow.automation | FLOW |
| Customer Account Profile Block | customerAccount.blocks | CUSTOMER_ACCOUNT |
| App Proxy Widget | proxy.widget | STOREFRONT_UI |
| Checkout Upsell | checkout.upsell | STOREFRONT_UI |
| Hide Shipping Method | functions.deliveryCustomization | FUNCTION |

### Acceptance criteria
- ✅ Two creation paths: AI generate and from template
- ✅ Template creates draft module with pre-filled spec (no AI call)
- ✅ Category filter for template browsing
- ✅ Quota enforcement (moduleCount) same as AI create

---

## Visual Flow Builder ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| FlowBuilder component | `components/FlowBuilder.tsx` | Visual node-and-arrow editor: trigger node, step nodes, add/remove/reorder, node config inline |
| Flow build route | `routes/flows.build.$flowId.tsx` | New flow or edit existing; loads connectors for HTTP steps; saves via createDraft or createNewVersion |
| Flows index update | `routes/flows._index.tsx` | "Create flow visually" button; flow modules table with "Edit visually" per flow |
| Step kinds | FlowBuilder | HTTP_REQUEST (with connector picker, method, path), TAG_CUSTOMER, ADD_ORDER_NOTE, WRITE_TO_STORE |
| Trigger picker | FlowBuilder | MANUAL, Order Created, Product Updated |
| Spec round-trip | flows.build route | Load spec → render nodes; save nodes → write spec via `/api/modules/:id/spec` |

### Acceptance criteria
- ✅ Visual flowchart-style editor (trigger → step → step)
- ✅ Dual creation: manually build in visual builder or AI-generated (edit existing flow.automation visually)
- ✅ Same `flow.automation` spec used — no change to FlowRunnerService
- ✅ Add, remove, reorder steps; configure each step inline

---

## Data Stores + Custom Pages ✅

### What was built

| Deliverable | File | Notes |
|---|---|---|
| DataStore model | `prisma/schema.prisma` | `shopId`, `key` (unique per shop), `label`, `description`, `isEnabled`, `schemaJson` |
| DataStoreRecord model | Same | `dataStoreId`, `externalId`, `title`, `payload` (JSON), indexed by store + createdAt |
| DataStoreService | `services/data/data-store.service.ts` | CRUD for stores and records; predefined store definitions; enable/disable/create-custom |
| Data stores API | `routes/api.data-stores.tsx` | enable, disable, create-custom, add-record, delete-record intents |
| Data stores listing | `routes/data._index.tsx` | Predefined stores grid (Product, Inventory, Order, Analytics, Marketing, Customer) with enable/disable; custom stores table with create modal |
| Data store detail | `routes/data.$storeKey.tsx` | Records table with title, external ID, payload preview, pagination; add/view/delete records |
| WRITE_TO_STORE step | `packages/core/src/recipe.ts` | New step kind in flow.automation: `storeKey`, `titleExpr`, `payloadMapping` |
| WRITE_TO_STORE executor | `services/flows/flow-runner.service.ts` | Auto-creates store if needed; resolves title expressions `{{path.to.field}}`; maps payload; creates record |
| Navigation | `root.tsx` | Added "Data" to app nav |

### Predefined data stores

| Key | Label | Description |
|-----|-------|-------------|
| product | Products | Product data, custom attributes, enrichments |
| inventory | Inventory | Inventory levels, stock movements, warehouse data |
| order | Orders | Order data, fulfillment status, processing notes |
| analytics | Analytics | Custom events, metrics, aggregated data |
| marketing | Marketing | Campaign data, audience segments, performance |
| customer | Customers | Customer profiles, preferences, interaction history |

### Acceptance criteria
- ✅ Merchants can enable predefined stores or create custom ones
- ✅ Records viewable with formatted JSON payload
- ✅ Flow steps can write to data stores (WRITE_TO_STORE)
- ✅ Auto-create store if referenced in a flow but not yet enabled
- ✅ Multi-tenant: all stores scoped by shopId

---

## Workflow Engine Spec (Graph-based Automation) ✅

### What was built

A full Shopify Flow-compatible graph-based workflow engine with connectors, conditions, branching, templates, and dual-mode execution (local engine + Shopify Flow delegation).

#### Core Schema (`packages/core/`)

| Deliverable | File | Notes |
|---|---|---|
| Workflow schema (Zod) | `src/workflow.ts` | Full DAG-based workflow: nodes (condition/action/transform/delay/end), edges (next/true/false/error), typed expression tree, retry policy, error handlers, settings |
| Connector SDK | `src/connector-sdk.ts` | TypeScript interfaces: `Connector` (manifest/validate/invoke), `AuthContext` (oauth/api_key/shopify/none), `InvokeRequest`/`InvokeResponse`/`InvokeError`, error helpers |
| Workflow validator | `src/workflow-validator.ts` | Graph reachability (BFS), cycle detection (Kahn's algorithm), edge completeness (condition true/false), orphan nodes, end-node guards |
| Workflow templates | `src/workflow-templates.ts` | `WorkflowTemplateBundle` (metadata + workflow JSON), input prompts, safety declarations, approval checklist (24 items across 6 categories), `installTemplate()` helper, 3 built-in templates |

#### Expression Evaluator (`apps/web/`)

| Deliverable | File | Notes |
|---|---|---|
| Expression evaluator | `services/workflows/expression-evaluator.ts` | Resolves `$ref` context paths, `$tmpl` string templates, recursive arrays/objects. `evalExpression()` supports: and/or/not, eq/neq/gt/gte/lt/lte, in/contains/exists |

#### Workflow Engine (`apps/web/`)

| Deliverable | File | Notes |
|---|---|---|
| State machine executor | `services/workflows/workflow-engine.service.ts` | Full lifecycle: QUEUED→RUNNING→SUCCEEDED/FAILED/TIMED_OUT. Per-node execution with retry, idempotency keys, context persistence, step logging, deadline enforcement |
| Shopify Flow bridge | `services/workflows/shopify-flow-bridge.ts` | Dual-mode: local execution or Shopify Flow delegation. Trigger topics, action definitions, `emitFlowTrigger()`, `handleFlowAction()` |

#### Built-in Connectors (`apps/web/services/workflows/connectors/`)

| Connector | File | Operations |
|---|---|---|
| **Shopify** | `shopify.connector.ts` | `order.addTags`, `order.addNote`, `customer.addTags`, `metafield.set` — GraphQL mutations with rate-limit handling |
| **HTTP** | `http.connector.ts` | `request` — generic HTTPS calls with SSRF protection (private network blocking) |
| **Slack** | `slack.connector.ts` | `message.post` (OAuth), `webhook.send` (Incoming Webhook URL) |
| **Email** | `email.connector.ts` | `send` (transactional), `sendInternal` (admin notification) — via SendGrid/Postmark/SES |
| **Storage** | `storage.connector.ts` | `write`, `read`, `delete` — bridges to SuperApp DataStore system |

All connectors implement: `manifest()` (capabilities + schemas), `validate()` (input checks), `invoke()` (runtime execution with structured errors + retry hints).

#### Connector Registry

| Deliverable | File | Notes |
|---|---|---|
| Registry | `services/workflows/connectors/index.ts` | `getConnectorRegistry()`, `registerConnector()`, `getConnector()`, `listConnectors()` |

#### Database Models

| Model | Purpose |
|---|---|
| `WorkflowDef` | Versioned workflow definitions per tenant (shopId + workflowId + version unique) |
| `WorkflowRun` | Run execution records (status lifecycle, context snapshots, timing) |
| `WorkflowRunStep` | Per-step execution log (status, attempt, duration, redacted inputs/results, errors) |
| `ConnectorToken` | Encrypted auth tokens per tenant per provider (oauth/api_key/shopify) |

#### Templates

| Template | Description | Category |
|---|---|---|
| High-Value Order Tagger | Tags orders above threshold + conditional branching | Orders, Operations |
| Order → ERP Sync | HTTP POST to ERP + store sync result | Orders, Integrations |
| Fraud Review Router | Risk level condition → tag + note for manual review | Orders, Fraud |

#### Approval Checklist (24 items)

| Category | Count | Examples |
|---|---|---|
| Validity | 6 | One trigger, reachable graph, acyclic, condition edges, no orphans |
| Safety | 4 | Data domains declared, PII minimized, no embedded secrets |
| Connector | 5 | Scopes listed, input/output schemas, idempotency support |
| Reliability | 4 | Timeouts, retry policy, idempotency keys |
| UX | 3 | Clear name/description, minimal inputs, defaults |
| Observability | 3 | Run logs, correlationId, error codes |

### Tests

17 new tests in `packages/core/src/__tests__/workflow.test.ts`:
- WorkflowSchema validation (valid, invalid ID, empty nodes, missing condition, missing action, transform, delay)
- WorkflowValidator (missing edges, orphan nodes, end-node edges, template validation)
- WorkflowTemplates (count, lookup, install with inputs, install with defaults, schema validity, structural validity)

### Shopify Flow Integration Model

| Direction | Mechanism | Status |
|---|---|---|
| SuperApp → Flow (triggers) | `emitFlowTrigger()` emits events to start Flow workflows | Stub (requires deployed Flow trigger extension) |
| Flow → SuperApp (actions) | `handleFlowAction()` routes action webhooks to connectors | Implemented (4 actions: tag order, write to store, send HTTP, send notification) |
| Templates → Flow | SuperApp templates exportable as Shopify Flow templates via CLI | Architecture defined |
| Dual-mode execution | `startRun(workflow, payload, { executionMode: 'local' | 'shopify_flow' })` | Implemented |

### Acceptance criteria
- ✅ Full graph-based workflow schema with Zod validation (nodes, edges, conditions, branching)
- ✅ Typed expression tree (no eval) — safe condition evaluation
- ✅ 5 built-in connectors with manifest/validate/invoke + structured errors
- ✅ State machine engine with per-step retries, idempotency keys, deadline enforcement
- ✅ Dual-mode: local execution or Shopify Flow delegation
- ✅ Workflow validator (reachability, cycles, edge completeness, orphans)
- ✅ 3 workflow templates with install + parameterization
- ✅ 24-item approval checklist for template safety
- ✅ Prisma models for workflow definitions, runs, steps, and connector tokens
- ✅ 17 new tests passing; total 179 across monorepo (34 core + 145 web)

---

## Shopify Flow Integration (Full)

### Send HTTP Request Step

| Deliverable | File | Notes |
|---|---|---|
| Recipe schema | `packages/core/src/recipe.ts` | New `SEND_HTTP_REQUEST` step kind: url, method (GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD), headers, body, authType (none/basic/bearer/custom_header), authConfig |
| FlowBuilder UI | `apps/web/app/components/FlowBuilder.tsx` | Full form: URL, method dropdown, auth type selector with conditional fields (username/password, bearer token, custom header name/value), JSON headers, body textarea |
| Execution | `apps/web/app/services/flows/flow-runner.service.ts` | SSRF-protected execution: HTTPS-only, private network blocking, 30s timeout, auth header injection based on authType |

### Extended Triggers

The flow.automation trigger enum now includes 13 trigger types:

| Trigger | Source |
|---|---|
| MANUAL | App |
| SHOPIFY_WEBHOOK_ORDER_CREATED | Shopify |
| SHOPIFY_WEBHOOK_PRODUCT_UPDATED | Shopify |
| SHOPIFY_WEBHOOK_CUSTOMER_CREATED | Shopify |
| SHOPIFY_WEBHOOK_FULFILLMENT_CREATED | Shopify |
| SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED | Shopify |
| SHOPIFY_WEBHOOK_COLLECTION_CREATED | Shopify |
| SCHEDULED | Scheduling |
| SUPERAPP_MODULE_PUBLISHED | SuperApp |
| SUPERAPP_CONNECTOR_SYNCED | SuperApp |
| SUPERAPP_DATA_RECORD_CREATED | SuperApp |
| SUPERAPP_WORKFLOW_COMPLETED | SuperApp |
| SUPERAPP_WORKFLOW_FAILED | SuperApp |

### Extended Step Kinds

| Step Kind | Description |
|---|---|
| HTTP_REQUEST | Connector-based HTTP (existing) |
| SEND_HTTP_REQUEST | Direct HTTP with URL/auth/headers/body (new, mirrors Shopify Flow) |
| TAG_CUSTOMER | Tag a customer |
| TAG_ORDER | Tag an order |
| ADD_ORDER_NOTE | Add note to order |
| WRITE_TO_STORE | Write to SuperApp data store |
| SEND_EMAIL_NOTIFICATION | Send email |
| SEND_SLACK_MESSAGE | Send Slack message |
| CONDITION | Conditional branching (field/operator/value with then/else) |

### Flow Catalog

| Deliverable | File | Notes |
|---|---|---|
| Flow catalog | `packages/core/src/flow-catalog.ts` | Comprehensive catalog of 50+ triggers, 15 condition operators, 40+ actions, 18+ connectors (Shopify native, SuperApp, third-party) |
| Exported from | `packages/core/src/index.ts` | `FLOW_TRIGGERS`, `FLOW_CONDITION_OPERATORS`, `FLOW_CONDITION_DATA_TYPES`, `FLOW_ACTIONS`, `FLOW_CONNECTORS` + helper functions |

Reference links:
- Concepts: [Variables](https://help.shopify.com/en/manual/shopify-flow/getting-started/concepts/variables), [Admin API](https://help.shopify.com/en/manual/shopify-flow/getting-started/concepts/admin-api), [Advanced workflows](https://help.shopify.com/en/manual/shopify-flow/getting-started/concepts/advanced-workflows), [Metafields](https://help.shopify.com/en/manual/shopify-flow/getting-started/concepts/metafields), [Protected data](https://help.shopify.com/en/manual/shopify-flow/getting-started/concepts/protected-data)
- Reference: [Triggers](https://help.shopify.com/en/manual/shopify-flow/reference/triggers), [Conditions](https://help.shopify.com/en/manual/shopify-flow/reference/conditions), [Actions](https://help.shopify.com/en/manual/shopify-flow/reference/actions), [Connectors](https://help.shopify.com/en/manual/shopify-flow/reference/connectors), [Send HTTP request](https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-http-request)
- Develop & manage: [Develop](https://help.shopify.com/en/manual/shopify-flow/develop), [Reference](https://help.shopify.com/en/manual/shopify-flow/reference), [Manage](https://help.shopify.com/en/manual/shopify-flow/manage)

### Flow Trigger Extensions (SuperApp → Shopify Flow)

| Extension | Handle | Payload Fields |
|---|---|---|
| Module published | `superapp-module-published` | Module ID, Module Name, Module Type, Shop Domain |
| Connector synced | `superapp-connector-synced` | Connector ID, Connector Name, Sync Status, Shop Domain |
| Data record created | `superapp-data-record-created` | Store Key, Record ID, Record Title, Shop Domain |
| Workflow completed | `superapp-workflow-completed` | Workflow ID, Workflow Name, Run ID, Shop Domain |
| Workflow failed | `superapp-workflow-failed` | Workflow ID, Workflow Name, Run ID, Error Message, Shop Domain |

Trigger emission: `emitFlowTrigger(shop, accessToken, topic, payload)` calls the `flowTriggerReceive` GraphQL mutation with the extension handle and payload (< 50 KB).

### Flow Action Extensions (Shopify Flow → SuperApp)

| Extension | Handle | Input Fields |
|---|---|---|
| Tag order | `superapp-tag-order` | order_reference, Tags |
| Write to data store | `superapp-write-to-store` | Store Key, Title, Payload |
| Send HTTP request | `superapp-send-http` | URL, Method, Body |
| Send email notification | `superapp-send-notification` | To, Subject, Body |

Runtime endpoint: `POST /api/flow/action` — verifies HMAC (`x-shopify-hmac-sha256`), resolves handle to action ID, delegates to `handleFlowAction()`.

---

## AI Module Enhancements

### What was built

| Deliverable | File | Notes |
|---|---|---|
| Template type audit + 3 new templates | `packages/core/src/templates.ts` | Added `functions.cartTransform`, `integration.httpSync`, `platform.extensionBlueprint` templates; all 31 templates now cover every RecipeSpec type (including theme.effect) |
| theme.effect type + compiler | `packages/core/src/recipe.ts`, `allowed-values.ts`, `apps/web/.../compiler/theme.effect.ts` | New storefront type for decoration overlays (snowfall, confetti); classification keywords; full-viewport overlay compiler with reducedMotion and prefers-reduced-motion support |
| Template integrity tests | `packages/core/src/__tests__/templates.test.ts` | 8 tests: type matching, category matching, unique IDs, Zod validation, full type coverage, findTemplate |
| Technical details modal | `routes/modules.$moduleId.tsx` | Replaced inline Compiled Ops + RecipeSpec cards with a single "Technical details" button opening a tabbed modal |
| Theme dropdown | `routes/modules.$moduleId.tsx`, `services/shopify/theme.service.ts` | `ThemeService.listThemes()` fetches themes from Shopify REST API; publish section shows Select dropdown with theme name + role instead of manual ID input |
| Config/Copy editor | `components/ConfigEditor.tsx`, `routes/modules.$moduleId.tsx` | Dynamic per `spec.type` editor for module name + config fields (heading, body, trigger, frequency, etc.) using same spec update API |
| Modify with AI | `routes/api.ai.modify-module.tsx`, `services/ai/llm.server.ts` | `modifyRecipeSpec()` sends current spec + instruction to AI; enforces same type; creates new version. Modal UI on module detail page |
| Dynamic style builder | `components/StyleBuilder.tsx` | `STYLE_CONFIG` per-type map controls which Basic/Advanced sections render; text role labels, conditional backdrop/overlay/layout/spacing/border controls |

### Acceptance criteria
- All 30 curated templates pass Zod validation and have matching type/spec.type
- Every RecipeSpec type has at least one template
- Technical details shown in modal with Compiled Ops and RecipeSpec tabs
- Theme dropdown shows real themes from Shopify with name + role labels
- Config editor renders type-specific fields and saves via existing spec API
- AI modify creates new draft version preserving module type
- Style builder shows/hides sections based on module type

---

### Shopify Flow Integration Model (Updated)

| Direction | Mechanism | Status |
|---|---|---|
| SuperApp → Flow (triggers) | `emitFlowTrigger()` emits events via `flowTriggerReceive` mutation | **Implemented** (5 trigger extensions deployed) |
| Flow → SuperApp (actions) | `POST /api/flow/action` with HMAC verification → `handleFlowAction()` | **Implemented** (4 action extensions, HMAC verified) |
| Templates → Flow | SuperApp templates exportable as Shopify Flow templates via CLI | Architecture defined |
| Dual-mode execution | `startRun(workflow, payload, { executionMode: 'local' \| 'shopify_flow' })` | Implemented |
| Flow catalog | `FLOW_TRIGGERS`, `FLOW_ACTIONS`, `FLOW_CONNECTORS`, `FLOW_CONDITION_OPERATORS` | **Implemented** |
