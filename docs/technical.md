# Technical documentation — AI Shopify SuperApp

> For full implementation status see [implementation-status.md](./implementation-status.md).

## 1. Problem & approach
Merchants want *one* app that can act like many apps: banners, discounts, checkout widgets, integrations, etc.
The hard part is doing this safely and scalably.

This system uses a **Recipes architecture**:
1. Merchant describes what they want.
2. AI produces a **RecipeSpec JSON** (no raw code).
3. Server validates RecipeSpec with Zod (strict schema).
4. Compiler produces **DeployOperations** (assets/metafields/etc).
5. Merchant previews on a selected theme, then publishes.
6. Every publish creates an immutable version; rollback switches active version.

---

## 2. High-level architecture

### Admin UI (Embedded)
- Remix + React + Polaris
- Merchant can: generate module → preview → publish → rollback → manage connectors → manage billing

### API / Services
| Service | File | Responsibility |
|---|---|---|
| `RecipeService` | `services/recipes/recipe.service.ts` | Parse/validate RecipeSpec JSON |
| `Compiler` | `services/recipes/compiler/index.ts` | Recipe → DeployOperations (12 module types) |
| `PublishService` | `services/publish/publish.service.ts` | Apply operations via Shopify Admin API |
| `CapabilityService` | `services/shopify/capability.service.ts` | Plan gating (Basic vs Plus) |
| `ModuleService` | `services/modules/module.service.ts` | Versioning + rollback |
| `ConnectorService` | `services/connectors/connector.service.ts` | Third-party API connections; SSRF-protected |
| `MappingService` | `services/connectors/mapping.service.ts` | AI-assisted field mapping from sample responses |
| `FlowRunnerService` | `services/flows/flow-runner.service.ts` | Step execution; retries; per-step logs |
| `BillingService` | `services/billing/billing.service.ts` | Shopify App Subscriptions (FREE/STARTER/GROWTH/PRO) |
| `QuotaService` | `services/billing/quota.service.ts` | Monthly quota enforcement per kind |
| `ThemeAnalyzerService` | `services/theme/theme-analyzer.service.ts` | Fetch theme assets; detect patterns; suggest mount strategy |
| Style compiler | `services/recipes/compiler/style-compiler.ts` | `compileStyleVars` / `compileStyleCss` / `compileOverlayPositionCss` / `sanitizeCustomCss` / `compileCustomCss` — storefront UI style → `--sa-*` CSS vars (theme-safe presets + scoped custom CSS) |
| `PreviewService` | `services/preview/preview.service.ts` | HTML preview for all storefront modules (banner, popup, notification bar, proxy widget); applies style vars |
| Proxy widget route | `routes/proxy.$widgetId.tsx` | App Proxy endpoint; reads `_styleCss` from metafield and renders styled HTML |
| `AiUsageService` | `services/observability/ai-usage.service.ts` | Track tokens, cost, model per shop |

---

## 3. Module types (RecipeSpec)

| Type | Category | Capabilities required |
|---|---|---|
| `theme.banner` | STOREFRONT_UI | THEME_ASSETS |
| `theme.popup` | STOREFRONT_UI | THEME_ASSETS |
| `theme.notificationBar` | STOREFRONT_UI | THEME_ASSETS |
| `proxy.widget` | STOREFRONT_UI | APP_PROXY |
| `functions.discountRules` | FUNCTION | DISCOUNT_FUNCTION |
| `functions.deliveryCustomization` | FUNCTION | SHIPPING_FUNCTION |
| `functions.paymentCustomization` | FUNCTION | PAYMENT_CUSTOMIZATION_FUNCTION |
| `functions.cartAndCheckoutValidation` | FUNCTION | VALIDATION_FUNCTION |
| `functions.cartTransform` | FUNCTION | CART_TRANSFORM_FUNCTION_UPDATE (Plus) |
| `checkout.upsell` | STOREFRONT_UI | CHECKOUT_UI_INFO_SHIP_PAY (Plus) |
| `customerAccount.blocks` | CUSTOMER_ACCOUNT | CUSTOMER_ACCOUNT_UI |
| `integration.httpSync` | INTEGRATION | — |
| `flow.automation` | FLOW | — |
| `platform.extensionBlueprint` | ADMIN_UI | — |

---

## 4. Capability gating

Some platform capabilities are plan-specific. The app checks the shop plan using Admin GraphQL (`shop.plan.displayName`) and blocks publish if required capabilities aren't available.

```
Gated capabilities (Shopify Plus only):
  CHECKOUT_UI_INFO_SHIP_PAY — checkout UI on Info/Shipping/Payment steps
  CART_TRANSFORM_FUNCTION_UPDATE — cart transform update operations
  CUSTOMER_ACCOUNT_B2B_PROFILE — B2B profile targets in customer account UI
```

Keep gating centralized in `packages/core/src/capabilities.ts`.

**Customer account UI extension:** The `customerAccount.blocks` module type is rendered by the extension in `extensions/customer-account-ui/`. That extension uses **Preact + Polaris web components** (2026-01) and reads config from the shop metafield via `shopify.query()`. Shopify enforces a **64 KB** compiled script limit; see [debug.md](./debug.md) and [implementation-status.md](./implementation-status.md) (Phase 6) for stack details and troubleshooting.

---

## 5. Data model (multi-tenant)

| Model | Purpose |
|---|---|
| `Shop` | One row per shop domain; holds plan tier, AI provider override |
| `Module` | Logical module (type, category, name, status) |
| `ModuleVersion` | Immutable recipe snapshots (DRAFT/PUBLISHED) |
| `Connector` | External API connection; secrets AES-256-GCM encrypted |
| `WebhookEvent` | Idempotency dedup table; unique on (shopDomain, topic, eventId) |
| `FlowStepLog` | Per-step execution record for automation runs |
| `AuditLog` | Append-only audit trail |
| `AiProvider` | LLM provider configs (key encrypted) |
| `AiUsage` | Token counts, cost, model per request |
| `AiModelPrice` | Per-model pricing for cost estimation |
| `ApiLog` | All significant API calls with requestId + duration |
| `ErrorLog` | Structured error events (auto-redacted) |
| `Job` | Long-running task lifecycle (QUEUED/RUNNING/SUCCESS/FAILED) |
| `ThemeProfile` | Theme detection results per (shop, themeId) |
| `AppSubscription` | Active billing plan per shop |
| `RetentionPolicy` | Configurable data retention per scope and kind |

---

## 6. Security model

- **No arbitrary code deployment.** Only RecipeSpec JSON is AI-generated.
- Strict Zod schema validation + `zodToJsonSchema` for provider structured output enforcement.
- Secrets encrypted at rest using AES-256-GCM (`crypto.server.ts`).
- App Proxy requests validated with Shopify HMAC via `authenticate.public.appProxy`.
- Rate limiting: `InMemoryRateLimiter` (30 req/60s default); replace with Redis (Upstash) in production.
- Monthly quota enforcement via `QuotaService` (server-side; throws `AppError(RATE_LIMITED)`).
- SSRF protections in `ConnectorService`: HTTPS-only, domain allowlist, private network range blocking.
- Log redaction in `redact.server.ts`: Shopify tokens (`shpat_*`), Bearer tokens, emails, credit cards, sensitive key names.
- Correlation IDs: every request gets a `requestId` via `AsyncLocalStorage`; propagated to `ApiLog` + response header `x-request-id`.

---

## 7. AI provider pipeline

```
generateValidatedRecipe(prompt)
  └── resolveProviderIdForShop()   — shop override → global active
  └── ConfiguredLlmClient
        └── postJsonWithRetries()  — timeout, retry 429/5xx, SHA-256 logging
              └── [OpenAI / Anthropic / Custom]
  └── RecipeSpecSchema.parse()     — Zod validation
  └── retry loop (up to maxAttempts) with previousError hint
  └── AiUsageService.record()      — tokens, cost, model
```

**Evals:** `pnpm --filter web evals` — runs 10 golden prompts against the configured provider and reports `schemaValidRate` + `compilerSuccessRate`. Exits 1 if rate < 90%.

---

## 8. Automation engine

```
Shopify Webhook (orders/create, products/update)
  └── authenticate.webhook()
  └── checkAndMarkWebhookEvent()   — dedup by x-shopify-webhook-id
  └── FlowRunnerService.runForTrigger()
        └── find published flow.automation modules for shop
        └── for each matching flow:
              └── JobService.create(FLOW_RUN)
              └── for each step:
                    └── executeStepWithRetry()   — up to 2 retries, exponential backoff
                    └── writeStepLog()           — status/duration/output/error
              └── JobService.succeed() or fail()
```

Failed jobs stay in DB (`status=FAILED`) as the DLQ. Replay via `POST /api/flow/run` or future admin UI.

---

## 9. Billing & quotas

Plans: FREE → STARTER ($19/mo) → GROWTH ($79/mo) → PRO ($299/mo)

All plans except FREE use Shopify App Subscriptions (recurring charges via `appSubscriptionCreate`). Merchants are redirected to a Shopify confirmation URL.

Quota enforcement runs **before** any consuming action (`aiRequest` before AI generation, etc.). Monthly usage is counted from the DB (`AiUsage.requestCount`, `Job` counts). Exceeding limits returns a `422 RATE_LIMITED` response with the current plan name and upgrade message.

---

## 10. Performance (storefront)

- Prefer Theme App Extension app blocks (config from metafields, no extra HTTP calls on storefront).
- App proxy responses are small and have `cache-control: public, max-age=60`.
- No third-party JS injected by default.
- Theme asset uploads use minimal Liquid; lazy-load images.
- `ThemeAnalyzerService` recommends `APP_BLOCK` mount strategy to avoid theme patches.

---

## 10b. Storefront UI style system

All storefront UI recipes (`theme.banner`, `theme.popup`, `theme.notificationBar`, `proxy.widget`) accept an optional `style` object (validated by `StorefrontStyleSchema`). The style uses preset enums for safety — no arbitrary CSS values except `customCss` (sanitized + scoped at compile time).

**Compile pipeline:**
```
spec.style
  → normalizeStyle()          — merge with DEFAULT_STOREFRONT_STYLE
  → compileStyleVars()        — produces --sa-text, --sa-bg, --sa-pad, etc.
  → compileStyleCss()         — applies vars to root selector
  → compileOverlayPositionCss() — overlay host + panel (popup/sticky/floating)
  → compileCustomCss()        — sanitize + scope merchant free-form CSS
```

**Publish route (`/api/publish`):** Accepts both `application/json` and `application/x-www-form-urlencoded` (form posts from the module detail page). All `theme.*` modules are routed to `{ kind: 'THEME' }` deploy target.

**Proxy widget route (`/proxy/:widgetId`):** Reads the compiled `_styleCss` from the shop metafield and injects it into a `<style>` block in the returned HTML document.

**Overlay/backdrop controls:** The Style Builder shows backdrop color, backdrop opacity, anchor, and offset controls whenever the layout mode is `overlay`, `sticky`, or `floating` — not just for `theme.popup`.

---

## 11. Adding a new module type

1. Add a new union member to `RecipeSpecSchema` in `packages/core/src/recipe.ts`.
2. Implement `compileX()` in `apps/web/app/services/recipes/compiler/yourType.ts` returning `CompileResult`.
3. Register in `compiler/index.ts` switch.
4. Add capability requirements in `capabilities.ts` if needed.
5. (Optionally) add preview rendering in `PreviewService`.
6. Rebuild core: `pnpm --filter @superapp/core build`.
7. Add golden prompt to `services/ai/evals.server.ts` → `GOLDEN_PROMPTS`.

---

## 12. Production hardening checklist

- [ ] Move to Postgres + Prisma migrations (`prisma migrate deploy`)
- [ ] Add Redis rate limiting (Upstash) to replace `InMemoryRateLimiter`
- [x] ~~Add BullMQ/Inngest for scheduled flow triggers~~ — Implemented with lightweight DB-based scheduler (`ScheduleService` + `FlowSchedule` model + `GET /api/cron`)
- [x] Sentry integration — `sentry.server.ts` provides `captureException`/`captureMessage` interface; env-gated on `SENTRY_DSN` (install `@sentry/node` to activate)
- [ ] Add CSP headers on embedded UI and app proxy HTML responses
- [ ] Implement GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`)
- [ ] KMS-backed envelope encryption for secrets (AWS KMS / GCP KMS)
- [x] Define SLOs and build dashboards — `docs/slos.md` (6 SLOs with SQL measurement queries + OTel panel recommendations)
- [x] Write incident runbooks — `docs/runbooks/` (4 runbooks + severity ladder + first-responder checklist)

---

## 13. Local dev

```bash
pnpm i                                       # install all deps
cd apps/web && pnpm exec prisma migrate dev  # create SQLite DB
pnpm --filter web dev                        # start dev server
pnpm test                                    # run all tests (163 across monorepo)
pnpm --filter web evals                      # run AI evals harness
```

---

## 14. Observability & retention

| Signal | Table | Retention |
|---|---|---|
| API calls | `ApiLog` | Per `RetentionPolicy` (default 30 days) |
| Errors | `ErrorLog` | Per `RetentionPolicy` |
| AI token usage | `AiUsage` | Per `RetentionPolicy` |
| Jobs | `Job` + `FlowStepLog` | Per `RetentionPolicy` |

Run purge script: `pnpm --filter web retention:run`

All writes to `ErrorLog` are automatically redacted (`redact.server.ts`). `ApiLog` stores no request/response bodies — only path, status, duration, requestId, and SHA-256 hashes for AI calls.
