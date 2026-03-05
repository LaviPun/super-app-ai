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
2. Describe what you want in plain English **or** pick a pre-built template.
3. SuperApp generates a *Draft module*.
4. You Preview it on a theme you choose.
5. If you like it, Publish. You can rollback any time.

For theme blocks, you add app blocks where you want content; in the app you choose which module appears in each slot.

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

## Connectors testing (Postman-like API Tester)
Each connector has a dedicated **API Tester** page where you can:
- Select HTTP method (GET, POST, PUT, PATCH, DELETE)
- Enter request path, custom headers (JSON), and request body (JSON)
- Send the request and view the full response: status code, response headers, and formatted body
- **Save endpoints**: Save frequently-used requests as named endpoints for quick access later
- Manage saved endpoints from the **Saved Endpoints** tab — load, edit, or delete them
- One connector can have many saved endpoints (e.g., an ERP connector with endpoints for orders, products, inventory, etc.)

## Automations — Visual Flow Builder
SuperApp supports Zapier/Make-style visual flow building:

### Creating a flow
1. Navigate to **Flows** in the sidebar.
2. Click **Create flow visually** to open the visual flow builder.
3. Pick a trigger: `Order Created (Webhook)`, `Product Updated (Webhook)`, or `Manual`.
4. Add steps by clicking **+ Add step**. Available step types:
   - **HTTP Request** — call a connector API (choose connector, method, path, body mapping)
   - **Tag Customer** — apply a tag to the customer who placed the order
   - **Add Order Note** — append a note to the order
   - **Write to Data Store** — save event data into a Data Store (auto-provisions the store if it doesn't exist)
5. Reorder steps with ↑/↓ arrows; remove steps with the × button.
6. Click **Save flow** to persist. The flow is saved as a `flow.automation` module.

### Scheduled flows
Navigate to **Flow Schedules** in the app to create cron-based triggers using standard 5-field cron syntax (UTC). Set `CRON_SECRET` in your environment and call `GET /api/cron` with `X-Cron-Secret: <secret>` from your hosting cron service (Railway, GitHub Actions, etc.) to fire due schedules.

### AI-generated flows
You can also generate flows via the AI builder on the Home page by describing the automation you want. The AI produces a `flow.automation` RecipeSpec that can then be edited in the visual builder.

### Advanced workflows (graph-based engine)
SuperApp includes a more powerful graph-based workflow engine for complex automations:
- **Conditional branching**: If/else logic with typed expressions (e.g., "If order total > 500")
- **Multiple paths**: Different actions for different conditions (true/false branches)
- **Variable transforms**: Compute and store intermediate values
- **Delays**: Wait for a duration or until a specific time
- **Error handling**: Per-step error policies (fail run, continue, route to error path)
- **Retries**: Configurable retry with exponential backoff, jitter, and rate-limit awareness
- **Connectors**: Built-in connectors for Shopify Admin, HTTP requests, Slack, Email, and Data Stores

### Shopify Flow integration
SuperApp can integrate with Shopify Flow in two ways:
1. **SuperApp triggers Flow**: When events happen in SuperApp (module published, data synced), they can start Shopify Flow workflows
2. **Flow calls SuperApp**: Shopify Flow can use SuperApp-provided actions (tag orders, write to data stores, send HTTP requests)

## Styling storefront modules (Style Builder)
For banners, notification bars, popups, and proxy widgets you can use the **Style Builder** on the module page. It has three tabs:

- **Basic** — colors (text, background, button), typography (size, weight, align), padding, border radius, responsive visibility (hide on mobile/desktop). For overlay/sticky/floating modules you also get backdrop color and opacity controls.
- **Advanced** — layout mode (inline/overlay/sticky/floating), anchor position, offsets, width, z-index level, shadow, border width/color, line height, gap, margin, and accessibility (focus ring, reduced motion).
- **Custom CSS** — a textarea (2000 character limit) for additional CSS rules. Dangerous patterns are stripped automatically, and rules are scoped to your module's root selector. You can reference `--sa-*` CSS variables.

Changes are saved as a new draft version; the preview updates instantly to reflect your style. Published theme assets and proxy widgets use CSS variables so styles stay theme-safe and performant.

## Module templates
Instead of describing a module in plain English, you can pick from **12 pre-built templates** across categories:
- Storefront UI (banner, popup, notification bar, proxy widget)
- Functions (discount rules, delivery customization)
- Integrations (ERP sync)
- Flows (order tagging, customer engagement)
- Customer Account (profile block)

On the **Home** page, toggle from "Generate with AI" to "From Template", optionally filter by category, and click **Use template** to create a draft module instantly.

## Data Stores
SuperApp includes app-owned databases so modules and flows can persist and retrieve data:

### Predefined stores
Six built-in stores are available: **Product**, **Inventory**, **Order**, **Analytics**, **Marketing**, **Customer**. Enable the ones you need from the **Data Stores** page.

### Custom stores
Create your own named data stores with a custom schema for specialized data (e.g., loyalty points, custom analytics).

### Records
Each store holds records with a title, optional external ID, and a JSON payload. Records can be:
- Added manually from the Data Store detail page
- Written automatically by flows using the **Write to Data Store** step

### Use cases
- Build custom pages within SuperApp (e.g., analytics dashboard, order tracking)
- Let flows accumulate data over time (e.g., tag statistics, enrichment results)
- Use as a lightweight app-internal database without external infrastructure

## Module categories
- Storefront UI: theme sections/blocks/widgets
- Functions: backend checkout logic (discount/shipping/payment/validation/cart transform)
- Integrations: connect to ERP/3rd-party APIs
- Flows: automation chains with triggers and steps
- Customer Account: blocks on customer account pages


## Plans & quotas

SuperApp offers tiered plans with monthly usage limits:

| Plan | AI Requests | Publish Ops | Workflow Runs | Connector Calls | Modules |
|------|------------|-------------|---------------|-----------------|---------|
| Free | 10/mo | 5/mo | 50/mo | 100/mo | 3 |
| Starter ($19/mo) | 200/mo | 50/mo | 1,000/mo | 5,000/mo | 20 |
| Growth ($79/mo) | 1,000/mo | 500/mo | 10,000/mo | 50,000/mo | 100 |
| Pro ($299/mo) | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

Starter and Growth plans include a 14-day free trial. You can view your current usage and switch plans from the **Billing** page inside the app.

When you reach a limit, SuperApp shows a clear message explaining which quota was hit and which plan to upgrade to. Limits are enforced server-side.

## AI providers
Merchants cannot bring their own AI keys. SuperApp uses the provider configured by the app owner.


## Customer account modules
SuperApp can add modules to the new customer account pages via Customer Account UI extensions. These run in a sandbox and can’t render arbitrary HTML/scripts.


## Logging & privacy
SuperApp records operational metadata for debugging (status codes, timings, counts). It does not store full AI prompts/responses in logs by default.
