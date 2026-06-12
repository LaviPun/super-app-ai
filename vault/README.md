# Vault (Gadget app)

Gadget app scaffold for Shopify return sync, theme profile recording, and webhook idempotency ledger.

## Layout

- `api/models/shopifyReturn` — Shopify Return model with shop-scoped access control
- `api/models/shopifyReturnLineItem` — Return line items with shop-scoped access control
- `api/models/shopifyShop` — Shopify shop + `recordThemeProfile` custom action
- `api/models/themeProfile` — Persisted theme JSON profiles per shop/theme
- `api/models/shopifyWebhookEvent` — Webhook ingestion ledger (dedupe by `eventId`)
- `api/lib/shopify/themeProfiles.ts` — `recordThemeProfile` upsert helper
- `api/lib/shopify/webhookLedger.ts` — `recordWebhookEvent` / `markWebhookEventFailed`
- `api/routes/POST-shopify-webhooks.ts` — Webhook ingress route

## Local checks

```bash
cd vault
pnpm install
pnpm test
pnpm typecheck
```

## Gadget sync

This folder is a source scaffold. Link to a Gadget app with `ggt dev` so `.gadget/server` is generated and `gadget-server` resolves for deploy.

## Access control

Shop-scoped Gelly filters live under `accessControl/filters/shopify/`. Only `shopify-app-users` may read/create/update return models; other roles are explicitly denied.
