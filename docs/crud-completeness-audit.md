# CRUD Completeness Audit

## Scope

- **Entities:** Prisma models and API resources (agent-facing or UI-backed).
- **Operations:** Create, Read (list and/or get), Update, Delete.
- **Surface:** Agent API (`/api/agent/*`) and other app APIs (e.g. `/api/connectors/*`, `/api/data-stores`, `/api/modules/*`). If an operation exists in any authenticated API, it counts.

---

## Entity CRUD Analysis

| Entity | Create | Read | Update | Delete | Score |
|--------|--------|------|--------|--------|-------|
| **Module** | ✅ POST /api/agent/modules | ✅ GET /api/agent/modules, GET /api/agent/modules/:id | ✅ POST /api/agent/modules/:id/spec, modify-confirm | ✅ POST /api/agent/modules/:id/delete | 100% |
| **Connector** | ✅ POST /api/agent/connectors | ✅ GET /api/agent/connectors, GET /api/agent/connectors/:id | ✅ POST /api/connectors/:id/update | ✅ POST /api/agent/connectors/:id (action delete) | 100% |
| **ConnectorEndpoint** | ✅ POST /api/connectors/:id/endpoints (intent create) | ✅ GET /api/connectors/:id/endpoints, GET connector includes endpoints | ✅ POST endpoints (intent update) | ✅ POST endpoints (intent delete) | 100% |
| **DataStore** | ✅ POST /api/agent/data-stores (create-custom, enable) | ✅ GET /api/agent/data-stores | ✅ enable/disable (partial) | ✅ delete-store | 100% |
| **DataStoreRecord** | ✅ add-record (agent + api) | ✅ GET /api/agent/data-stores/:storeKey/records (pagination) | ✅ update-record (agent) | ✅ delete-record (agent + api) | 100% |
| **FlowSchedule** | ✅ POST /api/agent/schedules (intent create) | ✅ GET /api/agent/schedules | ✅ intent update (name, cronExpr, eventJson + recomputes nextRunAt) | ✅ delete | 100% |
| **Recipe** | ❌ No direct API (created implicitly with modules) | ❌ No list/get | ❌ No update | ❌ No delete | 0% |
| **WorkflowDef** | ✅ Created in flows.templates (flow build) | ❌ No agent/API list or get | ❌ No update | ❌ No delete | 25% |
| **ModuleVersion** | Via Module (POST spec) | Via GET module (versions array), GET spec | Via POST spec (new draft) | With Module delete | N/A (sub-resource) |
| **Shop** | On first auth (billing._index, etc.) | Many loaders | settings, internal | N/A | N/A (system) |
| **Session** | OAuth flow | Session store | N/A | Logout | N/A (system) |
| **AuditLog / AiUsage / ErrorLog / ApiLog / Job / FlowStepLog** | Append-only / internal | Internal/admin | N/A | N/A | N/A (system) |
| **ThemeProfile / AppSettings / PlanTierConfig / AppSubscription / RetentionPolicy / ConnectorToken** | Internal or admin | Internal/settings | Some | N/A | N/A (config/system) |
| **ActivityLog** | Logged by services | internal.activity | N/A | N/A | N/A (audit) |
| **Operational (ModuleAsset, ImageIngestionJob, ModuleInstance, DataCapture, etc.)** | Via module/flow lifecycle | Internal/analytics | N/A | Cascade with parent | N/A (operational) |

---

## Overall Score: **6 / 8** entities with full CRUD (**75%**) — remediated 2026-03-05

- **Counted entities:** Module, Connector, ConnectorEndpoint, DataStore, DataStoreRecord, FlowSchedule, Recipe, WorkflowDef (8 resource-like entities).
- **Full CRUD (6/8):** Module, Connector, ConnectorEndpoint, DataStore, DataStoreRecord, FlowSchedule.
- **Incomplete:** Recipe, WorkflowDef.

---

## Incomplete Entities (missing operations)

1. **Recipe** — **Create, Read, Update, Delete:** No direct CRUD. Recipes are created/linked when creating modules; no list/get/update/delete. Treat as internal/sub-resource of Module unless first-class CRUD is needed.
2. **WorkflowDef** — **Read, Update, Delete:** Only create path exists (flow build in `flows.templates`). No agent or API to list, get, update, or delete workflow definitions. Add list/get (and optionally update/delete) under agent or flows API if workflows are first-class.

## Remediated Entities (2026-03-05)

- **DataStoreRecord — Read:** Added `GET /api/agent/data-stores/:storeKey/records` with pagination (`limit` max 200, `offset`). `DataStoreService.listRecords()` returns store metadata + records array + total count. Documented in `GET /api/agent` discovery index.
- **FlowSchedule — Full Update:** Added `intent: 'update'` to `POST /api/agent/schedules` accepting `scheduleId`, `name?`, `cronExpr?`, `eventJson?`. `ScheduleService.update()` validates cronExpr, recomputes `nextRunAt` if active. Logs `SCHEDULE_UPDATED` to ActivityLog.

---

## Recommendations

1. **DataStoreRecord Read:** Implement and expose list (and optionally get-by-id) for records:
   - Agent: extend GET /api/agent/data-stores to support e.g. `?storeKey=X` and return records, or add `GET /api/agent/data-stores/:storeKey/records` with pagination.
   - Document in `GET /api/agent` discovery.
2. **FlowSchedule Update:** Add full update (name, cronExpr, eventJson) in ScheduleService and expose via POST /api/agent/schedules with `intent: 'update'`, and add to agent discovery.
3. **Connector Update in agent:** Document or proxy update in the agent surface (e.g. add `update_connector` to `GET /api/agent` and/or POST /api/agent/connectors/:id with `intent: 'update'`) so agents can discover and use it without calling a different path.
4. **Recipe:** Either (a) treat as sub-resource and exclude from “entity CRUD” expectations, or (b) add minimal read (list recipes for shop, get one) and document.
5. **WorkflowDef:** If workflows are user/agent-managed, add list/get (and optionally update/delete) under /api/agent/flows or a dedicated workflow API and document in agent discovery.
6. **ConnectorEndpoint in agent:** Endpoint CRUD is only at /api/connectors/:id/endpoints. Consider exposing create/update/delete under /api/agent/connectors/:id/endpoints (or document the existing API in agent discovery) for agent parity.
