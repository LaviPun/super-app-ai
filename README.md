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
- **Module Settings Editor**: per-type config/copy editor (heading, body, trigger, frequency, etc.) on the module detail page
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
- **AI Module reference:** `docs/ai-module-main-doc.md` — canonical allowed values, RecipeSpec, catalog, capabilities, placement, GDPR, analytics (single source of truth; code uses `packages/core/src/allowed-values.ts`).
- Technical: `docs/technical.md` — Extension architecture (slots, target map, config sources): see §15 Universal Module Slot & extension architecture.
- Merchant guide: `docs/app.md`
- GitBook docs (structured backend/modules/flows/dashboard logic): `docs/gitbook/README.md` with nav in `docs/gitbook/SUMMARY.md`
- Implementation status: `docs/implementation-status.md` (includes **AI Module doc alignment**, **AI Patch Plan — Remove Generic Outputs**, Storefront UI Style System, API Tester, Templates, Flow Builder, Data Stores, **Admin app stack & UI fixes**, **Agent-Native Audit + Remediation**)
- **AI Patch Plan Phases 1–5 ✅:** All phases complete — 3-tier classifier (Tier A keywords + Tier B embedding similarity + Tier C cheap LLM), `theme.floatingWidget` new type, settings packs per module type, profile-driven prompt composition, schema/catalog on attempt 0 for non-direct confidence, drift-check CI. Deferred: multi-intent, Behavior DSL, theme.composed. See `docs/implementation-status.md` § “AI Patch Plan”.
- Phase plan: `docs/phase-plan.md`
- Debug notes (extension bundle, deploy, 64 KB limit, embedded auth, **card corners**, known issues): `docs/debug.md`
- Catalog: `docs/catalog.md` (generated catalog, curated templates, **templateKind mapping for AI retries**)


## Auth/session storage
This app uses Prisma-backed session storage (`@shopify/shopify-app-session-storage-prisma`).


## Cursor rules
This repo includes `.cursor/rules/*.mdc` and `.cursorrules` to guide Cursor AI.


## Internal Developer Dashboard
See `docs/internal-admin.md`.


## Seeding AI model pricing
Run `pnpm --filter web seed:ai-pricing` to add default model pricing rows (then set real API keys and activate a provider).


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
- **Configuration**: AI Providers, Plan Tiers, Categories, Templates, Recipe edit
- **Footer**: Settings, Logout

Cross-record tracing: every API request, job, error log, AI usage row, flow step log, and activity log is tagged with the same `correlationId`/`requestId`. Click "Trace" on any list row to open `/internal/trace/<correlationId>` and see the full request lifecycle as a single timeline with per-source tabs. The API Logs page also exposes an SSE-based **Live tail** toggle.

`/internal/advanced` redirects to Settings. Full route list and behavior: see `docs/internal-admin.md`.