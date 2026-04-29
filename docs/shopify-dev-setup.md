# Shopify development setup (Partner account + Dev store + CLI)

This repo uses a **Remix embedded app** built with `@shopify/shopify-app-remix`.

## 1) Prerequisites
- Node 20+
- pnpm
- Shopify CLI installed (`npm i -g @shopify/cli`)  
- A Shopify Partner account
- A Shopify Dev store created from Partner dashboard

## 2) Create a dev store
1. Log into your Partner dashboard.
2. Create a Dev store.
3. Keep the `your-store.myshopify.com` domain.

## 3) Create / connect the app using Shopify CLI
In `apps/web`:
```bash
shopify app dev
```

Shopify CLI will prompt you to:
- Create a new app in your Partner account, or connect to an existing one
- Select a dev store to install the app to
- Set up a tunnel and update `SHOPIFY_APP_URL`

> **Tip**: After the CLI creates the app, copy the generated `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` into `apps/web/.env`.

## 4) Environment variables

The `apps/web/.env` file is your local configuration. **It already contains real credentials and must never be committed to git** (`.gitignore` covers it).

Open `apps/web/.env` and verify / fill in:

| Variable | Where to get it |
|---|---|
| `SHOPIFY_API_KEY` | Partner Dashboard → App → API credentials (Client ID) |
| `SHOPIFY_API_SECRET` | Partner Dashboard → App → API credentials (Client secret) |
| `SHOPIFY_APP_URL` | Set by `shopify app dev` tunnel for local dev; your domain in production |
| `SCOPES` | Already set in `.env`; must match `shopify.app.toml [access_scopes]` |
| `DATABASE_URL` | `file:./dev.db` for local; Postgres URL for production |
| `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `INTERNAL_ADMIN_PASSWORD` | Any strong password for `/internal/*` dashboard |
| `INTERNAL_ADMIN_SESSION_SECRET` | Any random string ≥ 16 chars |

Optional (SSO for internal dashboard):
- `INTERNAL_SSO_ISSUER`, `INTERNAL_SSO_CLIENT_ID`, `INTERNAL_SSO_CLIENT_SECRET`, `INTERNAL_SSO_REDIRECT_URI`

## 5) OAuth route and embedded auth
The app includes an OAuth splat route at:
- `apps/web/app/routes/auth.$.tsx`

Shopify's Remix package expects a splat auth route that calls `authenticate.admin` to start OAuth and handle the callback.

## 6) Local development

**Option A — Single command (recommended):** From the **repo root**:
```bash
pnpm i
pnpm --filter web prisma:migrate
shopify app dev
```
The root `shopify.app.toml` has `web_directories = ["apps/web"]`, so the CLI finds the Remix app, starts the tunnel (HTTPS), and runs the app. The admin iframe will load the tunnel URL. If the app stays blank, see [docs/debug.md](./debug.md) §6.

**Option B — Two terminals:** If you prefer to run the app and CLI separately:
- Terminal 1: `pnpm --filter web dev`
- Terminal 2: `cd apps/web && shopify app dev`

Set `SHOPIFY_APP_URL` in `apps/web/.env` to the tunnel URL the CLI prints.

> **Note**: The app must be reachable at an **HTTPS** URL (the tunnel) for the admin iframe to load; `http://localhost:3000` is blocked as mixed content.

## 7) Required API scopes

The following scopes are configured in `shopify.app.toml` and `SCOPES` env var:

```
read_themes
read_products
write_products
read_orders
write_orders
read_customers
write_customers
read_checkouts
write_checkouts
read_inventory
read_metaobjects
write_metaobjects
write_discounts
write_app_proxy
write_payment_customizations
write_delivery_customizations
write_cart_transforms
```

If you add new functionality requiring additional scopes, update **both** `shopify.app.toml` and the `SCOPES` env var, then re-install the app on your dev store.

### Theme modules (banner, popup, notification bar, effect)

Theme modules deploy via **app extension + Shopify metaobjects** only (no direct theme file writes). When you publish a theme.banner, theme.popup, theme.notificationBar, or theme.effect module, the app upserts a **`superapp_module` metaobject** per module (one entry per active module) and removes the metaobject when the module is unpublished or deleted. The **SuperApp Theme Modules** app embed (in `extensions/theme-app-extension`) lists active `superapp_module` metaobjects via Liquid and renders them on the storefront. Merchants must add the "SuperApp Theme Modules" app embed in the theme editor (Theme → Customize → App embeds) for published theme modules to appear.

A one-time backfill route at `/internal/metaobject-backfill` migrates legacy `superapp.theme.modules` metafield blobs into the new metaobject layout for stores that were on the previous architecture.

**Planned:** The theme app extension will also support **slot blocks** (Universal Slot, Product Slot, Cart Slot); merchants add these blocks in the Theme Editor; **slot→module assignment is done in the app UI** (dropdown of modules → slot), not in the Theme Editor, because the Theme Editor cannot show dynamic module lists. An App Embed runtime loader for global behaviors may be added when in scope.

## 8) Testing on dev store
- Install app via CLI prompts.
- In the app:
  - Generate a draft module
  - Preview/publish to a **duplicate** (non-live) theme
  - Verify in Theme Editor or storefront
  - Test billing: navigate to `/billing` inside the app

## 9) Running tests
```bash
pnpm --filter web test
```

## 10) Running AI evals
```bash
pnpm --filter web evals
```

Pass rate must be ≥ 90% for schema validity (default `EVAL_THRESHOLD_SCHEMA=0.9`, enforced in CI). Override via env var for staged rollout.

## 11) Deploy (CI / non-interactive)

For CI or non-interactive terminals, use:

```bash
pnpm exec shopify app deploy --allow-updates
```

The `--allow-updates` flag is required when not in an interactive terminal. Customer account UI extension has a **64 KB script limit**; see [docs/debug.md](./debug.md) for bundle size and extension troubleshooting.
