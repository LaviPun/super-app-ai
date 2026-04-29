# Data Models — Complete Reference

> Last updated: 2026-03-06

This document is the authoritative reference for how data models (data stores) work in this app — covering the database schema, service layer, UI, all API surfaces, and how data flows in and out.

---

## 1. What are data models?

Data models (internally called "data stores") are per-shop key-value stores where records can be written, read, and deleted. They are the app's built-in persistence layer for:
- Custom data that doesn't live in Shopify (e.g. CRM contacts, review cache, campaign data)
- Data synced from Shopify via flows (e.g. order notes, product enrichments)
- Agent-written data (AI actions that persist state across sessions)

Each data store is **scoped to a shop** — stores are never shared across merchants.

---

## 2. Database schema

Two Prisma models back the system:

### `DataStore`
**File:** `apps/web/prisma/schema.prisma`

```prisma
model DataStore {
  id          String   @id @default(cuid())
  shopId      String
  shop        Shop     @relation(fields: [shopId], references: [id])
  key         String   // e.g. "product", "crm_contacts"
  label       String
  description String?
  icon        String?  // icon name hint for UI
  isEnabled   Boolean  @default(true)
  schemaJson  String?  // optional column/field schema (future use)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  records     DataStoreRecord[]

  @@unique([shopId, key])   // key is unique per shop
  @@index([shopId, isEnabled])
}
```

Key points:
- The `@@unique([shopId, key])` constraint means a store key is unique per shop. The same key (e.g. `product`) on two different shops are completely separate stores.
- `isEnabled` is a soft toggle — a disabled store still retains its records; it's just hidden from flows and modules.
- `schemaJson` is reserved for future typed schemas; currently unused by the service layer.

### `DataStoreRecord`
```prisma
model DataStoreRecord {
  id          String   @id @default(cuid())
  dataStoreId String
  dataStore   DataStore @relation(fields: [dataStoreId], references: [id], onDelete: Cascade)
  externalId  String?  // e.g. Shopify product GID, order ID
  title       String?  // human-readable label for the record
  payload     String   // JSON document stored as a string
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Key points:
- `payload` is a raw JSON string (`JSON.stringify` on write, `JSON.parse` on read). Any shape is valid.
- `externalId` is optional; use it to correlate a record with a Shopify resource (e.g. `gid://shopify/Product/123`).
- `title` is optional but recommended for readability in the UI.
- Cascade delete: deleting a `DataStore` row deletes all its `DataStoreRecord` rows.

---

## 3. Predefined stores

Six stores are shipped with the app. They are defined as a constant — not seeded into the database until a merchant enables them.

**File:** `apps/web/app/services/data/data-store.service.ts`

| Key | Label | Purpose |
|-----|-------|---------|
| `product` | Products | Custom attributes and enrichments for products |
| `inventory` | Inventory | Inventory levels, stock movements, warehouse data |
| `order` | Orders | Order data, fulfillment status, processing notes |
| `analytics` | Analytics | Custom events, metrics, aggregated data |
| `marketing` | Marketing | Campaign data, audience segments, performance metrics |
| `customer` | Customers | Customer profiles, preferences, interaction history |

**How enabling works:** calling `enableStore(shopId, key)` does a Prisma `upsert` — if the row doesn't exist it creates it (with label/description from `PREDEFINED_STORES`), otherwise it sets `isEnabled: true`. This means no migration or seeding is needed; the row is created on first enable.

**Extending predefined stores:** To add a new predefined store, add an entry to `PREDEFINED_STORES` in `data-store.service.ts`. No DB migration required.

---

## 4. Custom stores

Merchants can create stores with any key they choose. Rules:
- Key is sanitized server-side: `key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)`
- Key is validated client-side in the UI against `/^[a-z0-9_]+$/` before submission
- Max key length: 40 characters (after sanitization)
- Custom stores are created with `isEnabled: true` by default

Once created, the key **cannot be changed** (it's the unique identifier used by flows, modules, and the agent API).

---

## 5. Service layer

**File:** `apps/web/app/services/data/data-store.service.ts`

| Method | Description |
|--------|-------------|
| `listStores(shopId)` | Returns all stores for a shop with record counts (includes disabled) |
| `enableStore(shopId, key)` | Upserts a store row with `isEnabled: true` |
| `disableStore(shopId, key)` | Sets `isEnabled: false` (records preserved) |
| `createCustomStore(shopId, key, label, description?)` | Creates a new enabled store; sanitizes key |
| `getStoreByKey(shopId, key)` | Fetches a single store row (or null) |
| `listRecordsByDataStoreId(dataStoreId, { page, pageSize })` | Paginated records by store ID; default 50/page, ordered `createdAt DESC` |
| `listRecords(shopId, storeKey, { limit?, offset? })` | Paginated records by shop+key; max 200; parses payload JSON |
| `createRecord(dataStoreId, { externalId?, title?, payload })` | Inserts a record; `payload` is JSON-stringified |
| `updateRecord(recordId, dataStoreId, { title?, externalId?, payload? })` | Partial update; only provided fields are updated |
| `deleteRecord(recordId, dataStoreId)` | Deletes one record by ID + store ID (scoped for safety) |
| `deleteStore(shopId, storeId)` | Hard deletes a store and cascades to all records |

---

## 6. API surfaces

There are three ways to interact with data stores programmatically.

### 6a. Merchant UI API — `POST /api/data-stores`

**File:** `apps/web/app/routes/api.data-stores.tsx`

Used exclusively by the merchant-facing UI (`data._index.tsx`). Requires an authenticated Shopify session.

| `intent` | Required fields | Effect |
|----------|----------------|--------|
| `enable` | `key` | Enables (or creates) a store |
| `disable` | `key` | Disables a store |
| `create-custom` | `key`, `label`, `description?` | Creates a custom store |
| `add-record` | `storeKey`, `title?`, `externalId?`, `payload` | Adds a record to a store |
| `delete-record` | `storeKey`, `recordId` | Deletes a record |

All requests: `Content-Type: application/json`. All responses: `{ ok: true }` or `{ error: string }`.

### 6b. Agent API — `GET|POST /api/agent/data-stores`

**File:** `apps/web/app/routes/api.agent.data-stores.tsx`

Used by the AI agent during tool-call execution. Full CRUD plus delete-store. Logs activity to `ActivityLog`.

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

### 6c. Agent API — `GET /api/agent/data-stores/:storeKey/records`

**File:** `apps/web/app/routes/api.agent.data-stores.$storeKey.records.tsx`

Read-only record listing for a specific store.

```
GET /api/agent/data-stores/:storeKey/records?limit=50&offset=0
→ {
    ok, storeKey, storeId, label, total,
    records: [{ id, externalId, title, payload, createdAt, updatedAt }],
    pagination: { limit, offset, hasMore }
  }
```

- Max `limit`: 200
- Payload is returned as a parsed JSON object (not a raw string)

---

## 7. UI

### Data models index — `/data`

**File:** `apps/web/app/routes/data._index.tsx`

Three-tab layout:

**Tab 0 — All data models**
- Unified `DataTable` of all stores (predefined + custom)
- Columns: Key, Label, Status (badge), Records, Action (View or Enable)
- Clicking View goes to `/data/:storeKey`

**Tab 1 — Suggested & custom**
- Predefined store cards in a 3-column grid — each shows label, description, record count, status badge, and Enable/Disable/View data buttons
- Custom stores table with View, Enable/Disable actions
- "Create custom store" button opens a modal

**Tab 2 — Settings**
- Explains how data enters stores (flows, manual, agent API)
- Documents scheduling via FlowSchedule
- Explains key format constraints

**Revalidation behavior:**
- Polls every 30 seconds to reflect agent writes
- Revalidates on window focus
- Immediately revalidates after any fetcher action completes (enable/disable/create) so the UI updates without waiting for the next poll cycle

### Data store detail — `/data/:storeKey`

**File:** `apps/web/app/routes/data.$storeKey.tsx`

- Paginated record list (50 per page, newest first)
- Add record modal (JSON payload editor)
- View full record modal
- Delete record action
- Back link → `/data` (label: "Data models")

---

## 8. How data gets into stores

### Via flows (WRITE_TO_STORE step)
The recommended way for automated, scheduled, or event-driven data. Create a workflow with a schedule trigger (cron) or a Shopify event trigger, then add a `WRITE_TO_STORE` step. The step writes the event/step payload as a record into the target store by `storeKey`.

### Via manual entry (UI)
Open `/data/:storeKey` and use the "Add record" button. Enter a title and a JSON payload object.

### Via agent API
The AI agent can call `POST /api/agent/data-stores` with `intent: "add-record"` during a tool-call sequence. This is how the agent persists state or stores results mid-conversation.

---

## 9. Scheduling

Data stores have **no built-in sync schedule**. Scheduled data writes are done through workflows:

1. Go to **Advanced features → Workflows**
2. Create a new workflow with a **schedule trigger** (cron expression, e.g. `0 * * * *` for hourly)
3. Add a `WRITE_TO_STORE` step with the target `storeKey`
4. The `FlowSchedule` system (`api.cron`) runs the workflow on schedule and writes records

Per-store cron (`syncScheduleCron` on the `DataStore` model) is **not implemented** — all scheduling goes through `FlowSchedule`.

---

## 10. Key constraints and gotchas

| Constraint | Detail |
|------------|--------|
| Key uniqueness | `[shopId, key]` unique. Two shops can share the same key; it's always scoped. |
| Key immutability | Once set, a store key cannot be renamed. All references in flows and agent API use the key string. |
| Key format | `[a-z0-9_]` only, max 40 chars. Server sanitizes on create; UI validates before submit. |
| Disabled stores | Records are preserved when a store is disabled. The store just won't appear in flow step selectors. |
| Payload type | Stored as JSON string in SQLite. Any valid JSON object is accepted. Max size limited by SQLite row limits (~1GB, practically no concern). |
| Pagination | UI: 50/page. `listRecords` via service/agent API: max 200/request. |
| Cascade delete | Deleting a `DataStore` row hard-deletes all its records. There is no soft-delete on records. |
| No schema enforcement | `schemaJson` column exists but is unused. Records can have any payload shape. |

---

## 11. File map

| Purpose | File |
|---------|------|
| DB schema | `apps/web/prisma/schema.prisma` (models `DataStore`, `DataStoreRecord`) |
| Service layer | `apps/web/app/services/data/data-store.service.ts` |
| Merchant UI API | `apps/web/app/routes/api.data-stores.tsx` |
| Agent API (CRUD) | `apps/web/app/routes/api.agent.data-stores.tsx` |
| Agent API (records list) | `apps/web/app/routes/api.agent.data-stores.$storeKey.records.tsx` |
| UI — index (3 tabs) | `apps/web/app/routes/data._index.tsx` |
| UI — store detail | `apps/web/app/routes/data.$storeKey.tsx` |
