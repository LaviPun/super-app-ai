# AI Shopify SuperApp (Recipes-based)

A single Shopify app that lets non-developers generate **safe “modules”** (theme changes, functions, checkout UI, app proxy widgets, integrations) using AI.
The AI **never ships arbitrary code** to a merchant store. Instead it produces a **validated RecipeSpec JSON**, compiled into **known-safe deploy operations**.

Merchants can create modules like:
- Storefront UI: banners, popups, notification bars, proxy widgets (theme-safe patterns). Theme placement can use **universal slot blocks**: merchants add app blocks (slots) in the Theme Editor; in the app they assign which generated module appears in each slot (dropdown in app UI; the Theme Editor cannot show dynamic module lists). **Style Builder** (3-tab Polaris UI) lets merchants control colors, typography, spacing, positioning, and responsive options — including overlay/backdrop controls — without code. Styles compile to CSS variables (`--sa-*`) for CWV-friendly output. Proxy widgets also render styled HTML via the `_styleCss` metafield.
- Shopify Functions: discount rules, delivery customization, payment customization, validation, cart transform (Plus-gated where required)
- App proxy widgets: store-served styled widgets injected into storefront with signed app proxy requests
- Integrations: ERP/3rd-party API connectors + mapping, with **Postman-like API tester** and **saved endpoints** per connector
- Automation: visual flow builder (Zapier/Make-style) + cron schedules + webhooks. Flows can write to app-owned **Data Stores**.
- Customer account UI: modules rendered on customer account pages (Order index, Order status, Profile) via a **Preact + Polaris** UI extension; 64 KB script limit (see [docs/debug.md](docs/debug.md))
- **Module Templates**: 100 pre-built templates covering all 14 RecipeSpec types — merchants can generate with AI or start from a template
- **Template Readiness + Data Flags**: template installability now enforces required Shopify data-surface flags (`CUSTOMER_DATA`, `PRODUCT_DATA`, `COLLECTION_DATA`, `METAFIELD_DATA`, `METAOBJECT_DATA`, `ORDER_DATA`, `CART_DATA`, `CHECKOUT_DATA`, `FUNCTION_DATA`) and reports precise readiness blockers
- **Module Settings Editor**: per-type config/copy editor (heading, body, trigger, frequency, etc.) on the module detail page
- **Flagship Template Settings**: internal template detail now exposes full-access editing for `requires`, `config`, `style`, and `placement` (advanced JSON remains available as fallback)
- **Surface-Aware Preview**: internal template preview supports `generic`, `product`, `collection`, `cart`, `checkout`, `postPurchase`, and `customer` fixture contexts to validate product/workflow behavior
- **Modify with AI**: rework/regenerate modules using AI instructions without creating a new module
- **Theme Dropdown**: publish section fetches themes from Shopify and shows a single Select dropdown with theme name and "(Live)" for the live theme; only valid store themes are listed. Theme ID is validated server-side before publish (400 if not found). "Refresh themes" re-syncs the list; no manual theme ID input
- **Data Stores**: predefined (Product, Inventory, Order, Analytics, Marketing, Customer) and custom databases for app-owned data
- **Workflow Engine**: graph-based DAG workflow engine with typed expressions, 5 built-in connectors (Shopify, HTTP, Slack, Email, Storage), dual-mode execution (local + Shopify Flow delegation), workflow templates with approval checklist
- **Shopify Flow Integration**: 5 Flow trigger extensions (module published, connector synced, data record created, workflow completed/failed) + 4 Flow action extensions (tag order, write to store, send HTTP, email notification). Send HTTP Request step with URL/method/headers/body/auth (mirrors Flow's native action). Comprehensive flow catalog (50+ triggers, 40+ actions, 15 operators, 18+ connectors)

You (the app owner/dev team) get:
- Internal developer dashboard with sidebar navigation (Polaris Frame + TopBar + Navigation)
  - **Dashboard**: Stat cards (stores, AI calls 24h, API cost 24h, providers), errors/jobs/activities, job success rate, quick links to Plan tiers, Categories, Recipe edit, Settings
  - **AI Providers**: Add/activate providers, model pricing; per-provider display of masked API key (••••xyz1), model, base URL; for Claude (ANTHROPIC): optional Agent Skills (e.g. pptx, xlsx) and code execution
  - **Usage & Costs** (now includes prompt preview + account/limit audit context), **Activity Log** (with per-entry View → full detail: actor, action, resource, store, details JSON), **Error Logs**, **API Logs**
  - **AI Accounts & Limits**: per-provider account owner metadata, account ID/email, daily limit, alert limit, current balance, and live spend vs limits
  - **Stores**: Per-store AI provider override, retention overrides, **Change plan** (FREE / STARTER / GROWTH / PRO / ENTERPRISE) without Shopify billing
  - **Plan Tiers**: View/edit plan definitions (display name, price, trial days, quotas); Enterprise = "Contact us" (unlimited); Pro = 10× Growth
  - **Categories**: View/edit type category overrides (JSON) and **add new categories**
  - **Recipe edit**: Select store or **"All recipes (templates)"** to view/edit default module templates; Validate + Save (store version or template override)
  - **Templates**: Module templates (link to recipe-edit) and Flow templates section
  - **Jobs**; **Settings** (Appearance, Profile, Contact, App config, **AI & API keys** (link to AI Providers), **Password management**, **Environment variables**, **Advanced** — store/plan control)
  - Activity logging for all significant actions; advanced filters; toasts; loading states
- Per-store AI provider override + global provider fallback
- Retention policies + purge scripts

## Why “recipes” (and not arbitrary code)
Generating raw Liquid/JS/WASM on the fly is a security & stability nightmare (store breakage + supply-chain risk).
Instead we use:
1) Prompt → AI returns **RecipeSpec** JSON
2) Validate RecipeSpec with Zod (strict)
3) Compile into deploy operations:
   - no theme file writes — app uses extensions + metafields only; theme.* modules that would write to the theme are not supported for publish
   - shop metafields set/delete (configuration)
   - app proxy config
4) Merchant previews + publishes, with versioning + rollback
This repo uses:
- A **Recipe DSL** (JSON) with Zod validation
- A **Compiler** that turns recipes into deploy operations (assets/metafields/discount nodes/etc.)
- A **Capability Matrix** that gates modules for Basic vs Plus (and other plan tiers)

This yields:
- predictable output
- clear plan gating
- safer storefront performance (CWV-friendly)

---

## Monorepo layout
- `apps/web` — Remix embedded app (Admin UI + server routes). **Stack:** Remix 2, Vite 6, React Router v7 future flags, Polaris 12 (Card = ShadowBevel; rounded corners enforced in `app.css` + root inline style). See [docs/debug.md](docs/debug.md) for auth, card corners, and other known issues.
- `packages/core` — shared types, recipe schema, workflow engine spec, connector SDK
- `packages/rate-limit` — rate limiting utilities
- `extensions/*` — Shopify extensions per **extension plan**: Theme (Universal Slot, Product Slot, Cart Slot, App Embed), **customer account UI** [Preact + Polaris, 64 KB], Checkout UI, Cart Transform, other Functions, Post-purchase, Admin UI — generic renderers reading config (metafields/DB)
- `docs/*` - Technical docs, merchant docs, internal docs, phase plan

## Local dev
1. Install deps: `pnpm i`
2. Create DB: `pnpm --filter web prisma:migrate`
3. Start: `pnpm --filter web dev`

> Hosting: use Postgres + Redis in production; SQLite is for local development only.

## Agent API

A full `/api/agent/*` surface lets MCP/agent callers do everything the merchant UI can do.

- **`GET /api/agent`** — discovery index listing **31 endpoints** with schemas, descriptions, body params, and return shapes
- **`GET /api/agent/config`** — machine-readable classification config (`CLEAN_INTENTS`, `ROUTING_TABLE`, `CONFIDENCE_THRESHOLDS`) for agents that need to understand routing without reading source code

Covered surfaces: module lifecycle (create, get-spec, update-spec, modify, modify-confirm, publish, rollback, delete), AI primitives (classify, generate-options, validate-spec), connectors (list, get, create, update, delete, test, endpoint CRUD), data stores (enable/disable, custom stores, record CRUD, records list with pagination), schedules (list, create, update, toggle, delete), flows (list, run).

All agent routes use Shopify admin auth. Every mutating action is logged to `ActivityLog` with `actor: SYSTEM, source: agent_api`.

**UI integration:** All 4 merchant-facing list pages (`/modules`, `/connectors`, `/data`, `/flows`) poll every 30s and revalidate on window focus — agent writes appear automatically without a manual refresh.

## Docs

| Doc | Purpose |
|-----|---------|
| [`docs/gitbook/README.md`](docs/gitbook/README.md) + [`docs/gitbook/SUMMARY.md`](docs/gitbook/SUMMARY.md) | GitBook-style outline (welcome, guides, architecture, reference, ops, planning) |
| [`docs/ai-module-main-doc.md`](docs/ai-module-main-doc.md) | RecipeSpec and capabilities — primary spec for modules |
| [`docs/technical.md`](docs/technical.md) | Architecture, security, §15 Universal Module Slot & extensions |
| [`docs/app.md`](docs/app.md) | Merchant guide |
| [`docs/internal-admin.md`](docs/internal-admin.md) | Internal admin dashboard |
| [`docs/module-settings-modernization.md`](docs/module-settings-modernization.md) | Module settings patterns (defaults, popups, contact flows) |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Shipped work and stabilization (includes AI Patch Plan status) |
| [`docs/phase-plan.md`](docs/phase-plan.md) | Roadmap and backlog |
| [`docs/debug.md`](docs/debug.md) | Extension limits, embedded auth, known issues |
| [`docs/catalog.md`](docs/catalog.md) | Template catalog and AI retry mapping |
| [`docs/archive/README.md`](docs/archive/README.md) | Archived artifacts and notes |

Standalone audit-only markdown files were removed; narrative audit history stays in [`implementation-status.md`](docs/implementation-status.md).


## Auth/session storage
This app uses Prisma-backed session storage (`@shopify/shopify-app-session-storage-prisma`).


## Cursor rules
This repo includes `.cursor/rules/*.mdc` and `.cursorrules` to guide Cursor AI.


## Internal Developer Dashboard
See `docs/internal-admin.md`.


## Seeding AI model pricing
Run `pnpm --filter web seed:ai-pricing` to add default model pricing rows (then set real API keys and activate a provider).

## Internal Prompt Router (reference service)

To run a lightweight internal `/route` service for prompt-context gating:

1. Start the router:
   - `pnpm --filter web router:internal`
2. Configure app env to call it:
   - `INTERNAL_AI_ROUTER_URL=http://127.0.0.1:8787`
   - `INTERNAL_AI_ROUTER_TOKEN=<long-random-token>`

Optional Remix-side controls (prompt router client):

| Variable | Purpose |
|----------|---------|
| `ROUTER_CONFIDENCE_MAX_DELTA` | Max deviation from deterministic baseline confidence after internal router parse (default `0.15`). |
| `INTERNAL_AI_ROUTER_TIMEOUT_MS` | Client timeout calling `/route` (default `3000`). |
| `INTERNAL_AI_ROUTER_SHADOW` | If `1`/`true`/`yes`, still calls `/route` for metrics but **uses deterministic decision** for prompts. |
| `INTERNAL_AI_ROUTER_CANARY_SHOPS` | Comma-separated `shop.myshopify.com` values; when set, **only** those shops use the router (others stay deterministic). Requires routes to pass `shopDomain`. |
| `INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD` | Consecutive failures before opening circuit (default `5`). |
| `INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS` | Cooldown while circuit stays open (default `30000`). |
| `INTERNAL_AI_ROUTER_DEBUG_LOG` | If `1`, logs sparse JSON debug lines for router events (avoid in prod). |
| `INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED` | Enables DB-driven dual-target resolution (`/internal/model-setup`). Default off to keep legacy behavior unchanged. |

Optional internal-router service tenant controls (`apps/web/scripts/internal-ai-router.ts`):

| Variable | Purpose |
|----------|---------|
| `ROUTER_TENANT_MAX_ACTIVE_REQUESTS` | Max in-flight requests per `shopDomain` in router service (default `1`). |
| `ROUTER_TENANT_RATE_MAX_REQUESTS` | Max requests per tenant per window (default `30`). |
| `ROUTER_TENANT_RATE_WINDOW_MS` | Window for tenant rate cap (default `60000`). |

Modal edge proxy (optional): see [`deploy/modal-qwen-router/README.md`](deploy/modal-qwen-router/README.md).

Router script: `apps/web/scripts/internal-ai-router.ts`

### Dual-target switching (Internal Admin)

Internal Admin now includes **Setup the Model** at `/internal/model-setup` for runtime switching:

- Runtime targets: `localMachine` and `modalRemote`
- Active target + optional fallback target selector
- Target-specific endpoint/token/backend/model/timeout settings
- Probe actions: `/healthz` and `/route` schema-contract check
- Safe controls: shadow mode, canary shops, circuit settings
- Rollback: one-click restore to previous target (re-enters shadow mode)

Backward compatibility remains: if no DB-backed setup exists yet, the app still respects `INTERNAL_AI_ROUTER_*` env vars.

Optional target-specific env fallback keys (used when dual-target is enabled and target values are missing in DB):

- `LOCAL_ROUTER_URL`, `LOCAL_ROUTER_TOKEN`, `LOCAL_ROUTER_TIMEOUT_MS`
- `MODAL_ROUTER_URL`, `MODAL_ROUTER_TOKEN`, `MODAL_ROUTER_TIMEOUT_MS`

### Premium storefront prompt quality (DesignReferenceV1)

Storefront module generation now supports a premium UI/UX reference source:

- Configure **Design reference URL** in Internal Admin `Setup the Model`.
- Prompt resolution order:
  1. configured `designReferenceUrl`
  2. fallback `https://bummer.in`
- The provider prompt gets:
  - `DesignReferenceV1` block (tone, palette, typography, component style, UX principles)
  - `UI_DESIGNER_PASS` refinement directives
  - `FRONTEND_DEVELOPER_PASS` implementation-quality directives
  - premium output guardrails (non-generic, conversion-focused, high-polish constraints)

This only affects storefront module prompt quality guidance; schema validation and fallback behavior remain unchanged.

### Router backends

Default model IDs target **Qwen3-4B-class** first-layer routing; adjust tags to match what you pulled locally.

- **Ollama** (default):
  - `ROUTER_BACKEND=ollama`
  - `ROUTER_OLLAMA_BASE_URL=http://127.0.0.1:11434`
  - `ROUTER_OLLAMA_MODEL=qwen3:4b-instruct-q4_K_M` (example tag — use `ollama list` / library names you actually installed)
- **vLLM / OpenAI-compatible**:
  - `ROUTER_BACKEND=openai`
  - `ROUTER_OPENAI_BASE_URL=http://127.0.0.1:8000/v1`
  - `ROUTER_OPENAI_MODEL=Qwen/Qwen3-4B-Instruct`
  - `ROUTER_OPENAI_API_KEY=<optional>`

### Security defaults

- Bearer token auth (`INTERNAL_AI_ROUTER_TOKEN`)
- Production-safe auth default: when `NODE_ENV=production`, `/route` requires bearer auth.
  - Optional override: `ROUTER_REQUIRE_AUTH=1|0` (default auto: on in prod, optional in local).
- strict JSON schema validation
- max request body limit (default 8KB)
- per-IP in-memory rate limiting
- short model timeout and deterministic fallback
- prompt-injection guardrails (suspicious prompts are downgraded to safe `needsClarification` decisions)

### Production SLO starter targets (first-layer router)

- Route success rate (2xx from `/route`): `>= 99.5%` over 30-day window.
- Router p95 latency: `< 1.5s` (including model call + guard merge).
- Fallback rate (`modelDecision == null`): `< 5%` sustained; alert if above for 15m.
- Circuit-open events (Remix-side breaker): alert on repeated opens within 10m.
- Auth failures (401) and rate limits (429): monitor for abuse spikes; page only on sustained anomalies.

### Health check + Docker

- Health endpoint: `GET /healthz` (returns `{ ok: true, service, backend }`)
- Reference Dockerfile: `apps/web/Dockerfile.internal-router`

Build and run:

- `docker build -f apps/web/Dockerfile.internal-router -t internal-ai-router .`
- `docker run --rm -p 8787:8787 -e INTERNAL_AI_ROUTER_TOKEN=<token> -e ROUTER_BACKEND=ollama -e ROUTER_OLLAMA_BASE_URL=http://host.docker.internal:11434 internal-ai-router`

### Kubernetes one-command deploy

Manifests are provided under `deploy/internal-ai-router/`:

- `Deployment` + `Service`
- `readiness/liveness/startup` probes on `/healthz`
- `ConfigMap` defaults
- `Secret` template for auth token/API key

Steps:

1. Build + push your image and update `deploy/internal-ai-router/deployment.yaml` image.
2. Set `INTERNAL_AI_ROUTER_TOKEN` in `deploy/internal-ai-router/secret.template.yaml`.
3. Deploy:
   - `kubectl apply -k deploy/internal-ai-router`

Point app traffic to the in-cluster service:

- `INTERNAL_AI_ROUTER_URL=http://internal-ai-router.internal-ai-router.svc.cluster.local:8787`
- `INTERNAL_AI_ROUTER_TOKEN=<same token from secret>`


## Shopify dev setup
See `docs/shopify-dev-setup.md`.

## App navigation
Static app navigation in the Partner Dashboard is deprecated (removed after December 2026). This app uses **App Bridge** navigation via the `s-app-nav` web component in `apps/web/app/root.tsx`. You can delete any existing static menus in **Partner Dashboard → Your app → App setup → Navigation**. The sidebar is driven by the links inside `<s-app-nav>`:
- **Home**
- **AI modules**
- **Advanced features** (hub for Connectors, Flows, Schedules, Workflows, API tester)
- **Data models** (data stores)
- **Billing**
- **Settings**

## Internal admin navigation
The internal admin dashboard (`/internal`) uses a Polaris `Frame` layout with:
- **Overview**: Dashboard
- **Monitoring**: Activity Log, Error Logs, API Logs, **Audit Log**, **Webhooks**
- **Data**: Stores, Usage & Costs, AI Accounts, Jobs
- **Configuration**: AI Providers, AI Assistant, Plan Tiers, Categories, Templates, Recipe edit
- **Footer**: Settings, Logout

Cross-record tracing: every API request, job, error log, AI usage row, flow step log, and activity log is tagged with the same `correlationId`/`requestId`. Click "Trace" on any list row to open `/internal/trace/<correlationId>` and see the full request lifecycle as a single timeline with per-source tabs. The API Logs page also exposes an SSE-based **Live tail** toggle.

`/internal/advanced` redirects to Settings. Full route list and behavior: see `docs/internal-admin.md`.

Internal SSO requires an explicit comma-separated `INTERNAL_SSO_ALLOWED_EMAILS` operator allowlist; password login redirects are constrained to `/internal` paths.