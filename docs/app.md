# Merchant documentation — SuperApp

## What this app does
SuperApp replaces multiple single-purpose apps with one app where you can **generate modules** like:
- Banners and theme elements
- Discount logic (Shopify Functions)
- Checkout upsells (Plus-only on Information/Shipping/Payment steps)
- Storefront widgets via App Proxy
- Inventory/ERP sync connectors and automation triggers

## How it works
1. Install SuperApp.
2. Describe what you want in plain English.
3. SuperApp generates a *Draft module*.
4. You Preview it on a theme you choose.
5. If you like it, Publish. You can rollback any time.

## Plan differences
Some modules require Shopify Plus (for example, Checkout UI extensions on key checkout steps). If you try to publish a Plus-only module on a non-Plus store, SuperApp will explain why and won’t publish.

## Preview vs Publish
- **Preview** deploys to the theme you select (recommended: duplicate your live theme first).
- **Publish** marks it live for the chosen theme or platform surface.
- **Rollback** reverts to a previous published version.

## Connectors (ERP / 3rd-party APIs)
You can add a Connector (API endpoint + auth), then create modules that sync data on triggers such as:
- Manual run
- Order created
- Product updated

Secrets are encrypted and never shown after saving.

## Support
If a module behaves unexpectedly, rollback to the previous version instantly.

## Preview inside the app
After generating a draft module, open the module page to see an in-app preview.

- Theme modules: preview is an approximation.
- For a real storefront preview, publish to a duplicate theme and open Shopify's theme preview.

## Connectors testing (like Postman)
In Connectors, you can test any endpoint before using it in a flow:
- Choose connector
- Choose method + path
- Send request
- See response and save a sample for mapping

## Automations canvas
SuperApp supports n8n-like flows:
- **Triggers**: order created (webhook), product updated (webhook), manual, **scheduled (cron)**
- **Actions**: HTTP request (ERP/connector), tag customer, add order note

### Scheduled flows
Navigate to **Flow Schedules** in the app to create cron-based triggers using standard 5-field cron syntax (UTC). Set `CRON_SECRET` in your environment and call `GET /api/cron` with `X-Cron-Secret: <secret>` from your hosting cron service (Railway, GitHub Actions, etc.) to fire due schedules.

## Module categories
- Storefront UI: theme sections/blocks/widgets
- Functions: backend checkout logic (discount/shipping/payment/validation/cart transform)
- Integrations: connect to ERP/3rd-party APIs
- Flows: automation chains with triggers and steps


## Plans & quotas

SuperApp offers tiered plans with monthly usage limits:

| Plan | AI Requests | Publish Ops | Workflow Runs | Connector Calls |
|------|------------|-------------|---------------|-----------------|
| Free | 10 | 5 | 50 | 100 |
| Starter ($19/mo) | 200 | 50 | 1,000 | 5,000 |
| Growth ($79/mo) | 1,000 | 500 | 10,000 | 50,000 |
| Pro ($299/mo) | Unlimited | Unlimited | Unlimited | Unlimited |

Starter and Growth plans include a 14-day free trial. You can view your current usage and switch plans from the **Billing** page inside the app.

When you reach a limit, SuperApp shows a clear message explaining which quota was hit and which plan to upgrade to. Limits are enforced server-side.

## AI providers
Merchants cannot bring their own AI keys. SuperApp uses the provider configured by the app owner.


## Customer account modules
SuperApp can add modules to the new customer account pages via Customer Account UI extensions. These run in a sandbox and can’t render arbitrary HTML/scripts.


## Logging & privacy
SuperApp records operational metadata for debugging (status codes, timings, counts). It does not store full AI prompts/responses in logs by default.
