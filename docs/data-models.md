# Data Models — Complete Reference

> Last updated: 2026-08-27

This document is the authoritative reference for the app's persistence layer: the Postgres/Prisma datasource, the core Prisma models other docs link to (`Shop`, `Module`/`ModuleVersion`, `AppSubscription`, `FunctionActivation`, `Job`, `ApiLog`, `AiUsage`), general service-layer conventions, and the merchant-facing **Data Stores** feature (`DataStore`/`DataStoreRecord`) — a specific subsystem built on top of the same datasource. [`docs/architecture.md`](./architecture.md) §6 ("Data model summary") points here for the full schema.

---

## 1. Datasource

**File:** `apps/web/prisma/schema.prisma`

```prisma
datasource db {
  // Postgres everywhere since the 2026-08-24 Railway cutover (WS-A).
  // Local dev: docker-compose.dev.yml (postgresql://superapp:superapp@localhost:5433/superapp).
  // History: sqlite era archived at prisma/migrations-archive-sqlite-20260824/;
  // cutover per docs/runbooks/postgres-migration.md.
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- The app was SQLite-only before the WS-A Railway cutover (2026-08-24). That history is archived, not deleted: pre-cutover migrations live at `apps/web/prisma/migrations-archive-sqlite-20260824/`, and the cutover procedure itself is documented in [`docs/runbooks/postgres-migration.md`](./runbooks/postgres-migration.md).
- Local development runs Postgres via `docker-compose.dev.yml`, not an embedded SQLite file.
- This closes the corresponding row in [`docs/audit/drift-ledger.md`](./audit/drift-ledger.md) ("Persistence layer is production-grade") — already marked **RESOLVED** there, citing the same cutover commit.

---

## 2. Core models

The schema defines many Prisma models; this section covers the ones other canonical docs (`architecture.md`, `generation.md`, `publishing.md`, `ai-providers.md`) link back to. For the full list, read `apps/web/prisma/schema.prisma` directly — it is the source of truth, not this summary.

### `Shop`

The tenant root. Every per-shop model relates back to it (`shopId` foreign key), almost always with `onDelete: Cascade`.

| Field | Notes |
|-------|-------|
| `shopDomain` | Unique; the tenant key used across the app. |
| `accessToken` | Shopify Admin API token for this shop. |
| `planTier` | Free-text plan label, default `"UNKNOWN"`; reconciled from Shopify via `AppSubscription`. |
| `shopGid` | `gid://shopify/Shop/…`, used for Partner API `activeSubscription` lookups. |
| `aiProviderOverrideId` | Optional per-shop override of the default `AiProvider`. |
| `retentionDaysDefault` / `retentionDaysAi` / `retentionDaysApi` / `retentionDaysErrors` | Per-category log retention windows (defaults to 30 days if category-specific value is unset). |

### `Module` & `ModuleVersion`

The generated-content unit and its immutable version history. See [`docs/generation.md`](./generation.md) for the RecipeSpec these versions store.

- `Module` is the stable identity: `type`, `category`, `name`, `status` (default `"DRAFT"`), and `activeVersionId` (a unique pointer to the currently-published `ModuleVersion`).
- `ModuleVersion` is an immutable snapshot: `specJson` (the RecipeSpec), `compiledJson`, and — from the AI hydrate step — `adminConfigSchemaJson`, `adminDefaultsJson`, `themeEditorSettingsJson`, `uiTokensJson`, `validationReportJson`, `implementationPlanJson`, `previewHtmlJson`. `@@unique([moduleId, version])` enforces monotonic versioning.
- A `Module` optionally belongs to a `Recipe` (the blueprint/multi-module grouping — see [`docs/generation.md`](./generation.md) §6).

### `AppSubscription` & `PlanTierConfig`

Billing state. The app no longer creates in-app charges — merchants approve a plan on Shopify's hosted App Pricing page, and `PlanSyncService.syncShop()` (`apps/web/app/services/billing/plan-sync.service.ts`) reconciles the plan of record from the Partner API onto `AppSubscription` (never trusting the callback URL's `plan_handle` param). See [`docs/runbooks/app-pricing-setup.md`](./runbooks/app-pricing-setup.md) for the Partner Dashboard setup.

- `AppSubscription` is one row per shop (`shopId @unique`): `planName`, `planHandle` (the App Pricing plan handle — `free|starter|growth|pro`; `null` means an internal override or legacy state), `status` (`ACTIVE | CANCELLED | EXPIRED`), `lastSyncedAt` (last successful Partner API reconcile), `trialEndsAt`, `currentPeriodEnd`.
- `PlanTierConfig` holds the quota/price definition per named tier (`FREE | STARTER | GROWTH | PRO`): `price` (USD/month), `trialDays`, `quotasJson`.

### `FunctionActivation`

Landed by WS-E. Represents the Shopify object that makes a deployed Function actually execute — the automatic discount, delivery/payment customization, validation, fulfillment constraint rule, or cart transform node created when a Function-backed module is published.

| Field | Notes |
|-------|-------|
| `functionKey` | The compiler's `FUNCTION_CONFIG_UPSERT` key, e.g. `"discountRules"`. |
| `kind` | `ActivationKind` — which Shopify activation object this is. |
| `activationGid` | The live Shopify GID (`gid://shopify/DiscountAutomaticNode\|DeliveryCustomization\|…`). |

`@@unique([shopId, functionKey])` — one activation per shop per function key; republishing updates the row in place, unpublishing deletes it.

### `Job`

The generic background-work queue row (distinct from the BullMQ queue itself — see the "Dual job-queue generations" project memory for why the two must stay separately named).

`type` (`AI_GENERATE | PUBLISH | CONNECTOR_TEST | FLOW_RUN | THEME_ANALYZE`), `status` (`QUEUED | RUNNING | SUCCESS | FAILED`), `attempts`, `payload`/`result`/`error` (JSON-as-string), plus `requestId`/`correlationId` for trace assembly (see [§3](#3-service-layer-conventions)).

### `ApiLog`

One row per inbound HTTP request. `actor` (`INTERNAL | MERCHANT | WEBHOOK | APP_PROXY`), `method`, `path`, `status` (`0` while in progress, else the HTTP status), `durationMs`, `success`, plus `requestId`/`correlationId`. `finishedAt` is `null` while the request is still running.

### `AiUsage`

One row per billable LLM call. `action` (e.g. `RECIPE_GENERATION`, `MAPPING_SUGGESTION`), `tokensIn`/`tokensOut`, `costCents` (`Float`, not `Int` — a schema comment explains why: integer cents rounded cheap-model calls like a sub-cent `gpt-5-mini` call to `$0`, hiding real spend in aggregate totals), `requestCount` (default `1`, for fan-out billing), plus `providerId`/`shopId` relations and `correlationId`.

---

## 3. Service layer conventions

Patterns that recur across the service layer (`apps/web/app/services/**/*.server.ts`), not specific to any one model:

- **Prisma client singleton.** `apps/web/app/db.server.ts` exports `getPrisma()`, which reuses a `global.__prisma__` instance outside production (avoids exhausting connections across Remix dev hot-reloads) and constructs a fresh `PrismaClient` in production.
- **Tenant scoping.** Nearly every model carries `shopId` and a `Shop` relation; service methods take `shopId` as an explicit parameter rather than relying on a global session, and most queries filter or `findFirst`-guard on it (e.g. `DataStoreService.deleteStore(shopId, storeId)` re-checks ownership before deleting).
- **JSON-as-string fields.** Despite running on Postgres (which has native `jsonb`), the schema keeps structured data as `String` columns (`specJson`, `payload`, `meta`, `quotasJson`, `schemaJson`, …) — services `JSON.parse`/`JSON.stringify` at the boundary rather than the ORM handling it natively.
- **Safe persistence of user-controlled JSON.** `persistJsonSafely()` (`apps/web/app/services/observability/redact.server.ts`) is the standard way to stringify a payload before writing it to a log or record column: it redacts known-sensitive keys (`accessToken`, `secret`, tokens, emails, credit-card-like numbers, `Authorization` headers), and — when strict PII redaction is enabled and the caller flags contact PII — drops those keys entirely rather than just masking them.
- **Trace correlation.** `requestId` and `correlationId` columns are propagated across `ApiLog`, `Job`, `AiUsage`, `ErrorLog`, and `FlowStepLog` so a single merchant-facing operation (e.g. one publish click that spawns a background job that calls the LLM) can be reconstructed end-to-end from any one of those rows.
- **Soft toggle vs. hard delete.** Some models use a soft `isEnabled` boolean that preserves child rows when "disabled" (`DataStore.isEnabled`); others use `onDelete: Cascade` for a genuine hard delete (e.g. deleting a `Shop` cascades through nearly every per-tenant table). Read the specific model before assuming either behavior.
- **Idempotent "ensure" upserts.** Where a caller may re-declare the same logical resource repeatedly (e.g. a module re-declaring its data store on every publish), the service exposes an `ensure*`-style upsert instead of a plain `create` — see `DataStoreService.ensureTypedStore()` in [§4b](#4b-service-layer).

---

## 4. UI / Agent API behavior

The app exposes two parallel API surfaces per resource: a session-authenticated merchant UI API, and a JSON-only Agent API for AI/MCP callers. For:

- **RecipeSpec generation and hydration endpoints** (`/api/ai/create-module`, `/api/ai/hydrate-module`) — see [`docs/generation.md`](./generation.md), which owns the RecipeSpec contract these endpoints produce.
- **The full cross-resource Agent API endpoint index** (all `/api/agent/*` routes across modules, connectors, flows, schedules, AI primitives, and config) — see the discovery route itself, `apps/web/app/routes/api.agent.tsx`, and the endpoint count in [`docs/implementation-status.md`](./implementation-status.md) ("Agent API surface"). This doc does not re-list that full index.
- **The Data Stores Agent/UI API specifically** — documented in full below ([§4a](#4a-api-surfaces)), since data stores are this doc's own subject matter per the [`docs/README.md`](./README.md) canonical table.

### 4a. What are data stores?

Data stores are per-shop key-value stores where records can be written, read, and deleted — the app's general-purpose persistence layer for data that doesn't otherwise live in Shopify:
- Custom data (e.g. CRM contacts, review cache, campaign data)
- Data synced from Shopify via flows (e.g. order notes, product enrichments)
- Agent-written data (AI actions that persist state across sessions)

Each store is **scoped to a shop** — stores are never shared across merchants.

**Predefined stores.** Six stores ship as a constant (`PREDEFINED_STORES` in `apps/web/app/services/data/data-store.service.ts`) and are not seeded into the database until a merchant enables them: `product`, `inventory`, `order`, `analytics`, `marketing`, `customer`. `enableStore(shopId, key)` upserts the row (creating it with the predefined label/description on first enable, otherwise just flipping `isEnabled: true`) — no migration or seeding step is needed.

**Custom stores.** Merchants can create a store with any key. The key is sanitized server-side (`key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)`) and validated client-side against `/^[a-z0-9_]+$/` before submission. Once created, the key **cannot be changed** — it's the identifier flows, modules, and the Agent API reference.

**Typed stores (schema-validated).** `DataStore.schemaJson` is not a dead reservation — `DataStoreService.ensureTypedStore()` upserts a store and additively merges an incoming `schemaJson` into any existing one (new fields are appended; existing fields are never dropped or retyped, so records written under an older schema stay valid). When a store has a `schemaJson`, `createRecord()` parses it (`parseDataModel()`) and validates the incoming payload against it (`validateRecord()`, both from `@superapp/core`) — a failing payload throws `RecordValidationError`, not a silent write. Stores without a `schemaJson` accept any JSON payload shape, same as before.

### 4b. Service layer

**File:** `apps/web/app/services/data/data-store.service.ts`

| Method | Description |
|--------|-------------|
| `listStores(shopId)` | Returns all stores for a shop with record counts (includes disabled) |
| `enableStore(shopId, key)` | Upserts a store row with `isEnabled: true` |
| `disableStore(shopId, key)` | Sets `isEnabled: false` (records preserved) |
| `createCustomStore(shopId, key, label, description?)` | Creates a new enabled store; sanitizes key |
| `ensureTypedStore(shopId, key, { label, description?, schemaJson? })` | Idempotent publish-time upsert; additively merges `schemaJson` (see [§4a](#4a-what-are-data-stores)) |
| `getStoreByKey(shopId, key)` | Fetches a single store row (or null) |
| `listRecordsByDataStoreId(dataStoreId, { page, pageSize })` | Paginated records by store ID; default 50/page, ordered `createdAt DESC` |
| `listRecords(shopId, storeKey, { limit?, offset? })` | Paginated records by shop+key; max 200; parses payload JSON |
| `createRecord(dataStoreId, { externalId?, title?, payload, piiFlags?, customerId? })` | Validates against `schemaJson` if present, then inserts via `persistJsonSafely()`; best-effort emits a Shopify Flow trigger (`DATA_RECORD_CREATED`) |
| `updateRecord(recordId, dataStoreId, { title?, externalId?, payload?, piiFlags? })` | Partial update; only provided fields are updated; `payload` goes through `persistJsonSafely()` too |
| `deleteRecord(recordId, dataStoreId)` | Deletes one record by ID + store ID (scoped for safety) |
| `deleteStore(shopId, storeId)` | Hard deletes a store and cascades to all records |

### 4c. API surfaces

Three ways to interact with data stores programmatically.

**Merchant UI API — `POST /api/data-stores`** (`apps/web/app/routes/api.data-stores.tsx`). Used exclusively by the merchant-facing UI (`data._index.tsx`); requires an authenticated Shopify session.

| `intent` | Required fields | Effect |
|----------|----------------|--------|
| `enable` | `key` | Enables (or creates) a store |
| `disable` | `key` | Disables a store |
| `create-custom` | `key`, `label`, `description?` | Creates a custom store |
| `add-record` | `storeKey`, `title?`, `externalId?`, `payload` | Adds a record to a store |
| `delete-record` | `storeKey`, `recordId` | Deletes a record |

All requests: `Content-Type: application/json`. All responses: `{ ok: true }` or `{ error: string }`.

**Agent API — `GET|POST /api/agent/data-stores`** (`apps/web/app/routes/api.agent.data-stores.tsx`). Used by the AI agent during tool-call execution. Full CRUD plus delete-store; logs activity to `ActivityLog`.

```
GET  /api/agent/data-stores
  → { ok, stores: [{ id, key, label, isEnabled, recordCount, ... }] }

POST /api/agent/data-stores
  Body: { intent, ...fields }
```

| `intent` | Required fields | Returns |
|----------|----------------|---------|
| `enable` | `key` | `{ ok, intent, key }` |
| `disable` | `key` | `{ ok, intent, key }` |
| `create-custom` | `key`, `label`, `description?` | `{ ok, intent, storeId, key }` |
| `delete-store` | `storeId` | `{ ok, intent, storeId, deleted: true }` |
| `add-record` | `storeKey`, `title?`, `externalId?`, `payload` | `{ ok, intent, recordId }` |
| `update-record` | `storeKey`, `recordId`, `title?`, `externalId?`, `payload?` | `{ ok, intent, recordId }` |
| `delete-record` | `storeKey`, `recordId` | `{ ok, intent, recordId, deleted: true }` |

**Agent API — `GET /api/agent/data-stores/:storeKey/records`** (`apps/web/app/routes/api.agent.data-stores.$storeKey.records.tsx`). Read-only record listing for a specific store.

```
GET /api/agent/data-stores/:storeKey/records?limit=50&offset=0
→ {
    ok, storeKey, storeId, label, total,
    records: [{ id, externalId, title, payload, createdAt, updatedAt }],
    pagination: { limit, offset, hasMore }
  }
```

Max `limit`: 200. Payload is returned as a parsed JSON object (not a raw string).

### 4d. Merchant UI

**Data models index — `/data`** (`apps/web/app/routes/data._index.tsx`). Three-tab layout:

- **Tab 0 — All data models.** Unified `DataTable` of all stores (predefined + custom). Columns: Key, Label, Status (badge), Records, Action (View or Enable). Clicking View goes to `/data/:storeKey`.
- **Tab 1 — Suggested & custom.** Predefined store cards in a 3-column grid — each shows label, description, record count, status badge, and Enable/Disable/View data buttons. Custom stores table with View, Enable/Disable actions. "Create custom store" button opens a modal.
- **Tab 2 — Settings.** Explains how data enters stores (flows, manual, agent API), documents scheduling via `FlowSchedule`, explains key format constraints.

Revalidation: polls every 30 seconds to reflect agent writes, revalidates on window focus, and immediately revalidates after any fetcher action completes (enable/disable/create) so the UI updates without waiting for the next poll cycle.

**Data store detail — `/data/:storeKey`** (`apps/web/app/routes/data.$storeKey.tsx`). Paginated record list (50 per page, newest first); add-record modal (JSON payload editor); view-full-record modal; delete-record action; back link → `/data` (label: "Data models").

### 4e. How data gets into stores

- **Via flows (`WRITE_TO_STORE` step).** The recommended path for automated, scheduled, or event-driven data — a workflow with a schedule trigger (cron) or a Shopify event trigger, plus a `WRITE_TO_STORE` step that writes the event/step payload into the target store by `storeKey`.
- **Via manual entry (UI).** `/data/:storeKey` → "Add record" → title + JSON payload object.
- **Via the Agent API.** `POST /api/agent/data-stores` with `intent: "add-record"` — how the agent persists state or stores results mid-conversation.

### 4f. Scheduling

Data stores have **no built-in sync schedule**. Scheduled data writes go through workflows: Advanced features → Workflows → create a workflow with a schedule trigger (cron expression, e.g. `0 * * * *` for hourly) → add a `WRITE_TO_STORE` step targeting the `storeKey`. The `FlowSchedule` system (`api.cron`) runs the workflow on schedule and writes records. Per-store cron (a `syncScheduleCron` field on `DataStore`) is **not implemented** — all scheduling goes through `FlowSchedule`.

### 4g. Key constraints and gotchas

| Constraint | Detail |
|------------|--------|
| Key uniqueness | `[shopId, key]` unique. Two shops can share the same key; it's always scoped. |
| Key immutability | Once set, a store key cannot be renamed. All references in flows and the Agent API use the key string. |
| Key format | `[a-z0-9_]` only, max 40 chars. Server sanitizes on create; UI validates before submit. |
| Disabled stores | Records are preserved when a store is disabled. The store just won't appear in flow step selectors. |
| Payload type | Stored as a JSON string in Postgres (`payload String`, not `jsonb`) — see [§3](#3-service-layer-conventions). Any valid JSON object is accepted unless the store has a `schemaJson` (see [§4a](#4a-what-are-data-stores)). |
| Pagination | UI: 50/page. `listRecords` via service/Agent API: max 200/request. |
| Cascade delete | Deleting a `DataStore` row hard-deletes all its records. There is no soft-delete on records. |
| Schema validation | `schemaJson` is optional; when set (via `ensureTypedStore`), `createRecord()` validates the payload against it and throws `RecordValidationError` on mismatch. When unset, any payload shape is accepted. |

---

## 5. File map

| Purpose | File |
|---------|------|
| Full Prisma schema (all models, datasource) | `apps/web/prisma/schema.prisma` |
| Prisma client singleton | `apps/web/app/db.server.ts` |
| PII/secret redaction for persisted JSON | `apps/web/app/services/observability/redact.server.ts` |
| Data stores service layer | `apps/web/app/services/data/data-store.service.ts` |
| Data stores merchant UI API | `apps/web/app/routes/api.data-stores.tsx` |
| Data stores Agent API (CRUD) | `apps/web/app/routes/api.agent.data-stores.tsx` |
| Data stores Agent API (records list) | `apps/web/app/routes/api.agent.data-stores.$storeKey.records.tsx` |
| Data stores UI — index (3 tabs) | `apps/web/app/routes/data._index.tsx` |
| Data stores UI — store detail | `apps/web/app/routes/data.$storeKey.tsx` |
| Postgres cutover runbook | `docs/runbooks/postgres-migration.md` |
