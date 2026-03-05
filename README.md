# AI Shopify SuperApp (Recipes-based)

A single Shopify app that lets non-developers generate **safe “modules”** (theme changes, functions, checkout UI, app proxy widgets, integrations) using AI.
The AI **never ships arbitrary code** to a merchant store. Instead it produces a **validated RecipeSpec JSON**, compiled into **known-safe deploy operations**.

Merchants can create modules like:
- Storefront UI: banners, popups, notification bars, proxy widgets (theme-safe patterns). **Style Builder** (3-tab Polaris UI) lets merchants control colors, typography, spacing, positioning, and responsive options — including overlay/backdrop controls — without code. Styles compile to CSS variables (`--sa-*`) for CWV-friendly output. Proxy widgets also render styled HTML via the `_styleCss` metafield.
- Shopify Functions: discount rules, delivery customization, payment customization, validation, cart transform (Plus-gated where required)
- App proxy widgets: store-served styled widgets injected into storefront with signed app proxy requests
- Integrations: ERP/3rd-party API connectors + mapping, with **Postman-like API tester** and **saved endpoints** per connector
- Automation: visual flow builder (Zapier/Make-style) + cron schedules + webhooks. Flows can write to app-owned **Data Stores**.
- Customer account UI: modules rendered on customer account pages (Order index, Order status, Profile) via a **Preact + Polaris** UI extension; 64 KB script limit (see [docs/debug.md](docs/debug.md))
- **Module Templates**: 30 pre-built templates covering all 14 RecipeSpec types — merchants can generate with AI or start from a template
- **Module Settings Editor**: per-type config/copy editor (heading, body, trigger, frequency, etc.) on the module detail page
- **Modify with AI**: rework/regenerate modules using AI instructions without creating a new module
- **Theme Dropdown**: publish section fetches themes from Shopify and shows a Select dropdown with theme name + role
- **Data Stores**: predefined (Product, Inventory, Order, Analytics, Marketing, Customer) and custom databases for app-owned data
- **Workflow Engine**: graph-based DAG workflow engine with typed expressions, 5 built-in connectors (Shopify, HTTP, Slack, Email, Storage), dual-mode execution (local + Shopify Flow delegation), workflow templates with approval checklist
- **Shopify Flow Integration**: 5 Flow trigger extensions (module published, connector synced, data record created, workflow completed/failed) + 4 Flow action extensions (tag order, write to store, send HTTP, email notification). Send HTTP Request step with URL/method/headers/body/auth (mirrors Flow's native action). Comprehensive flow catalog (50+ triggers, 40+ actions, 15 operators, 18+ connectors)

You (the app owner/dev team) get:
- Internal developer dashboard with sidebar navigation (Polaris Frame + TopBar + Navigation)
  - **Dashboard**: Stat cards (stores, AI calls 24h, API cost 24h, providers), errors/jobs/activities, job success rate, quick links to Plan tiers, Categories, Recipe edit, Settings
  - **AI Providers**: Add/activate providers, model pricing; per-provider display of masked API key (••••xyz1), model, base URL
  - **Usage & Costs**, **Activity Log** (with per-entry View → full detail: actor, action, resource, store, details JSON), **Error Logs**, **API Logs**
  - **Stores**: Per-store AI provider override, retention overrides, **Change plan** (FREE / STARTER / GROWTH / PRO / ENTERPRISE) without Shopify billing
  - **Plan Tiers**: View/edit plan definitions (display name, price, trial days, quotas); Enterprise = "Contact us" (unlimited); Pro = 10× Growth
  - **Categories**: View/edit type category overrides (JSON) and **add new categories**
  - **Recipe edit**: Select store or **"All recipes (templates)"** to view/edit default module templates; Validate + Save (store version or template override)
  - **Templates**: Module templates (link to recipe-edit) and Flow templates section
  - **Jobs**; **Settings** (Appearance, Profile, Contact, App config, **Password management**, **Environment variables**, **Advanced** — store/plan control)
  - Activity logging for all significant actions; advanced filters; toasts; loading states
- Per-store AI provider override + global provider fallback
- Retention policies + purge scripts

## Why “recipes” (and not arbitrary code)
Generating raw Liquid/JS/WASM on the fly is a security & stability nightmare (store breakage + supply-chain risk).
Instead we use:
1) Prompt → AI returns **RecipeSpec** JSON
2) Validate RecipeSpec with Zod (strict)
3) Compile into deploy operations:
   - theme asset upsert/delete
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
- `extensions/*` — Shopify extensions (theme app extension, **customer account UI** [Preact + Polaris, 64 KB], checkout UI extension, functions, **Flow trigger extensions**, **Flow action extensions**) as *generic renderers* reading config
- `docs/*` - Technical docs, merchant docs, internal docs, phase plan

## Local dev
1. Install deps: `pnpm i`
2. Create DB: `pnpm --filter web prisma:migrate`
3. Start: `pnpm --filter web dev`

> Hosting: use Postgres + Redis in production; SQLite is for local development only.

## Docs
- **AI Module reference:** `docs/ai-module-main-doc.md` — canonical allowed values, RecipeSpec, catalog, capabilities, placement, GDPR, analytics (single source of truth; code uses `packages/core/src/allowed-values.ts`).
- Technical: `docs/technical.md`
- Merchant guide: `docs/app.md`
- Implementation status: `docs/implementation-status.md` (includes **AI Module doc alignment**, **AI Patch Plan — Remove Generic Outputs**, Storefront UI Style System, API Tester, Templates, Flow Builder, Data Stores, **Admin app stack & UI fixes**)
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
Static app navigation in the Partner Dashboard is deprecated (removed after December 2026). This app uses **App Bridge** navigation via the `s-app-nav` web component in `apps/web/app/root.tsx`. You can delete any existing static menus in **Partner Dashboard → Your app → App setup → Navigation**. The sidebar is driven by the links inside `<s-app-nav>` (Home, Connectors, Flows, Data Stores, Billing).

## Internal admin navigation
The internal admin dashboard (`/internal`) uses a Polaris `Frame` layout with:
- **Left sidebar**: Dashboard, AI Providers, Usage & Costs, Activity Log, Error Logs, API Logs, Stores, Plan Tiers, Categories, Recipe edit, Templates, Jobs; Settings and Logout (separator)
- **Top header**: Branded logo + Admin user menu
- **Toast notifications**: Success/error feedback on all mutations
- **Settings** includes Password management, Environment variables, and Advanced (store & plan control). `/internal/advanced` redirects to Settings.
- Full route list and behavior: see `docs/internal-admin.md`