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

In one terminal, run the Remix dev server:
```bash
pnpm i
pnpm --filter web prisma:migrate
pnpm --filter web dev
```

In a second terminal, run the Shopify CLI tunnel (needed for OAuth + webhooks):
```bash
cd apps/web
shopify app dev
```

The CLI opens a browser and installs the app into your dev store.

> **Note**: Both processes must be running. The Remix server handles requests; the Shopify CLI provides the tunnel and OAuth redirect.

## 7) Required API scopes

The following scopes are configured in `shopify.app.toml` and `SCOPES` env var:

```
write_themes
read_products
write_products
read_orders
write_discounts
write_checkouts
write_app_proxy
write_payment_customizations
write_delivery_customizations
write_cart_transforms
```

If you add new functionality requiring additional scopes, update **both** `shopify.app.toml` and the `SCOPES` env var, then re-install the app on your dev store.

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

Pass rate must be ≥ 80% for schema validity (enforced in CI).
