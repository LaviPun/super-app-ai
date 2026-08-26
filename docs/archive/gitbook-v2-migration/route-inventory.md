# Platform V2 — Remix Route Inventory

Source: `apps/web/app/routes/**` at baseline SHA `1b0df9d6442d1f60eb14975edda8f0eccba2907c`.

**Total route modules:** 117

## By concern

### Merchant embedded UI (28)

Polaris surfaces inside Shopify Admin for merchants.

| Route file | Purpose |
|------------|---------|
| `_index.tsx` | Merchant home / dashboard |
| `modules._index.tsx`, `modules.$moduleId.tsx` | Module list and detail |
| `templates.$templateId.tsx` | Template picker detail |
| `flows._index.tsx`, `flows.build.$flowId.tsx`, `flows.templates.tsx` | Flow builder |
| `connectors._index.tsx`, `connectors.$connectorId.tsx` | Connector management |
| `data._index.tsx`, `data.$storeKey.tsx` | Data stores |
| `billing._index.tsx` | Billing |
| `settings._index.tsx` | App settings |
| `preview.$moduleId.tsx` | Module preview |
| `picker._index.tsx` | Resource picker |
| `jobs._index.tsx` | Merchant job history |
| `logs._index.tsx` | Merchant logs |
| `advanced._index.tsx` | Advanced merchant tools |

### Internal admin (37)

Operator console under `/internal/*` (session-gated).

| Route file | Purpose |
|------------|---------|
| `internal.tsx` | Layout shell |
| `internal._index.tsx` | Admin dashboard |
| `internal.login.tsx`, `internal.logout.tsx` | Auth |
| `internal.sso.start.tsx`, `internal.sso.callback.tsx` | SSO |
| `internal.ai-assistant.tsx`, `internal.ai-assistant.chat.stream.tsx`, `internal.ai-assistant.probe.tsx` | AI assistant |
| `internal.model-setup.tsx`, `internal.ai-providers.tsx`, `internal.ai-accounts.tsx` | AI ops |
| `internal.jobs.tsx`, `internal.usage.tsx`, `internal.webhooks.tsx` | Ops consoles |
| `internal.api-logs.tsx`, `internal.api-logs.$logId.tsx`, `internal.api-logs.stream.tsx` | API logs |
| `internal.logs.tsx`, `internal.logs.$logId.tsx` | Error logs |
| `internal.activity.tsx`, `internal.activity.$activityId.tsx` | Activity |
| `internal.trace.$correlationId.tsx` | Trace viewer |
| `internal.stores.tsx`, `internal.stores._index.tsx`, `internal.stores.$storeId.tsx` | Store admin |
| `internal.templates._index.tsx`, `internal.templates.$templateId.tsx`, `internal.templates.$templateId.preview.tsx` | Template admin |
| `internal.categories.tsx`, `internal.plan-tiers.tsx`, `internal.recipe-edit.tsx` | Catalog admin |
| `internal.release-dashboard.tsx`, `internal.metaobject-backfill.tsx` | Release / backfill |
| `internal.settings.tsx`, `internal.audit.tsx`, `internal.advanced.tsx` | Settings / audit |

### API routes — `api.*` (50)

JSON/action endpoints for merchant UI, agent API, and automation.

**Agent API (`api.agent.*`) — 22**

`api.agent.tsx`, `api.agent.config.tsx`, `api.agent.classify.tsx`, `api.agent.validate-spec.tsx`, `api.agent.generate-options.tsx`, `api.agent.flows.tsx`, `api.agent.schedules.tsx`, `api.agent.modules.tsx`, `api.agent.modules.$moduleId.tsx`, `api.agent.modules.$moduleId.spec.tsx`, `api.agent.modules.$moduleId.spec.get.tsx`, `api.agent.modules.$moduleId.hydrate.tsx`, `api.agent.modules.$moduleId.modify.tsx`, `api.agent.modules.$moduleId.modify-confirm.tsx`, `api.agent.modules.$moduleId.publish.tsx`, `api.agent.modules.$moduleId.rollback.tsx`, `api.agent.modules.$moduleId.delete.tsx`, `api.agent.connectors.tsx`, `api.agent.connectors.$connectorId.tsx`, `api.agent.connectors.$connectorId.endpoints.tsx`, `api.agent.connectors.$connectorId.test.tsx`, `api.agent.data-stores.tsx`, `api.agent.data-stores.$storeKey.records.tsx`

**AI generation (`api.ai.*`) — 7**

`api.ai.create-module.tsx`, `api.ai.create-module.stream.tsx`, `api.ai.create-module-from-recipe.tsx`, `api.ai.hydrate-module.tsx`, `api.ai.modify-module.tsx`, `api.ai.modify-module-confirm.tsx`

**Modules / publish / rollback — 8**

`api.modules.$moduleId.spec.tsx`, `api.modules.$moduleId.delete.tsx`, `api.modules.from-template.tsx`, `api.publish.tsx`, `api.rollback.tsx`, `api.preview.tsx`, `api.theme.analyze.tsx`, `api.module-captures.tsx`

**Connectors — 6**

`api.connectors.create.tsx`, `api.connectors.test.tsx`, `api.connectors.suggest-mapping.tsx`, `api.connectors.$connectorId.update.tsx`, `api.connectors.$connectorId.endpoints.tsx`

**Flows / data / misc — 7**

`api.flow.run.tsx`, `api.flow.action.tsx`, `api.data-stores.tsx`, `api.customer-account.config.tsx`, `api.catalog.search.tsx`, `api.activity.tsx`, `api.report-error.tsx`

### Webhooks (8)

| Route file | Topic / role |
|------------|--------------|
| `webhooks.tsx` | Multiplex handler (orders, products, uninstall, scopes) |
| `webhooks.orders.create.tsx` | Order created |
| `webhooks.products.update.tsx` | Product updated |
| `webhooks.app.uninstalled.tsx` | App uninstalled |
| `webhooks.app.scopes_update.tsx` | Scopes update |
| `webhooks.customers.data_request.tsx` | GDPR data request |
| `webhooks.customers.redact.tsx` | GDPR customer redact |
| `webhooks.shop.redact.tsx` | GDPR shop redact |

### Cron (1)

| Route file | Purpose |
|------------|---------|
| `api.cron.tsx` | Scheduled flow runs + internal AI retention jobs |

### Auth / session (1)

| Route file | Purpose |
|------------|---------|
| `auth.$.tsx` | Shopify OAuth catch-all |

### Storefront / app proxy (2)

| Route file | Purpose |
|------------|---------|
| `proxy.$widgetId.tsx` | App proxy widget |
| `proxy.capture.tsx` | Capture proxy |

### Other (1)

| Route file | Purpose |
|------------|---------|
| `favicon[.]ico.ts` | Favicon asset route |

## V2 migration notes

| Concern | V2 target |
|---------|-----------|
| Merchant + internal UI | `apps/frontend` (Next.js embedded) |
| `api.*` + webhooks + cron | `apps/api` (Fastify gateway) |
| Long-running API work | `apps/workers` (BullMQ) |
| `auth.$.tsx` | Fastify OAuth + session validation |
| App proxy | Fastify app-proxy verification + workers |
