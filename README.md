# AI Shopify SuperApp (Recipes-based)

A single Shopify app that lets non-developers generate **safe “modules”** (theme changes, functions, checkout UI, app proxy widgets, integrations) using AI.
The AI **never ships arbitrary code** to a merchant store. Instead it produces a **validated RecipeSpec JSON**, compiled into **known-safe deploy operations**.

Merchants can create modules like:
- Storefront UI: banners, popups, notification bars, mini-cart add-ons, search facets (theme-safe patterns)
- Shopify Functions: discount rules, delivery customization, payment customization, validation, cart transform (Plus-gated where required)
- App proxy widgets: store-served widgets injected into storefront with signed app proxy requests
- Integrations: ERP/3rd-party API connectors + mapping
- Automation: n8n/flow-like workflows (webhooks/schedules/manual)
- Customer account UI: modules rendered in the new customer account pages via UI extensions

You (the app owner/dev team) get:
- Internal developer dashboard for provider keys, costs, usage, API logs, jobs, errors
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
- `apps/web` — Remix embedded app (Admin UI + server routes)
- `packages/core` — shared types + recipe schema
- `packages/rate-limit` — rate limiting utilities
- `extensions/*` — Shopify extensions (theme app extension, checkout UI extension, functions) as *generic renderers* reading config
- `docs/*` - Technical docs, merchant docs, internal docs, phase plan

## Local dev
1. Install deps: `pnpm i`
2. Create DB: `pnpm --filter web prisma:migrate`
3. Start: `pnpm --filter web dev`

> Hosting: use Postgres + Redis in production; SQLite is for local development only.

## Docs
- Technical: `docs/technical.md`
- Merchant guide: `docs/app.md`


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
Static app navigation in the Partner Dashboard is deprecated (removed after December 2026). This app uses **App Bridge** navigation via the `s-app-nav` web component in `apps/web/app/root.tsx`. You can delete any existing static menus in **Partner Dashboard → Your app → App setup → Navigation**. The sidebar is driven by the links inside `<s-app-nav>` (Home, Connectors, Billing).



# SuperApp — AI Recipes Shopify App (Monorepo)

A single Shopify app that replaces many apps by letting merchants generate **safe, configurable modules** (storefront UI, Shopify Functions behavior, app proxy widgets, integrations, automations, customer-account UI blocks) using AI.

**Core rule:** AI never deploys arbitrary code. AI outputs **RecipeSpec JSON** which is validated and compiled into safe deploy operations.