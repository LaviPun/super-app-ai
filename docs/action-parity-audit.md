# Action Parity Audit

**Criterion:** "Whatever the user can do, the agent can do."

---

## Action Parity Audit

### User Actions Found

| Action | Location | Agent Tool | Status |
|--------|----------|------------|--------|
| Publish module | `modules.$moduleId.tsx` → POST /api/publish | POST /api/agent/modules/:moduleId/publish | ✅ Has parity |
| Rollback module | `modules.$moduleId.tsx` → POST /api/rollback | POST /api/agent/modules/:moduleId/rollback | ✅ Has parity |
| Delete module | `modules.$moduleId.tsx` → POST /api/modules/:id/delete | POST /api/agent/modules/:moduleId/delete | ✅ Has parity |
| Modify module (propose options) | `modules.$moduleId.tsx` → POST /api/ai/modify-module | POST /api/agent/modules/:moduleId/modify | ✅ Has parity |
| Modify module (confirm selection) | `modules.$moduleId.tsx` → POST /api/ai/modify-module-confirm | POST /api/agent/modules/:moduleId/modify-confirm | ✅ Has parity |
| Create module from prompt | `modules._index.tsx` → POST /api/ai/create-module | POST /api/agent/generate-options + POST /api/agent/modules | ✅ Has parity |
| Create module from recipe (confirm) | `modules._index.tsx` → POST /api/ai/create-module-from-recipe | POST /api/agent/modules (with spec) | ✅ Has parity |
| Create module from template | `modules._index.tsx` → POST /api/modules/from-template | None (no create-by-templateId or template catalog) | ❌ Missing |
| Update module spec | `ConfigEditor.tsx`, `StyleBuilder.tsx` → POST /api/modules/:id/spec | POST /api/agent/modules/:moduleId/spec | ✅ Has parity |
| Create connector | `connectors._index.tsx` → Form POST /connectors (intent=create) | POST /api/agent/connectors | ✅ Has parity |
| Delete connector | `connectors._index.tsx`, `connectors.$connectorId.tsx` → Form/intent=delete or agent route | POST /api/agent/connectors/:id (delete) | ✅ Has parity |
| Update connector (name, baseUrl) | `connectors.$connectorId.tsx` → POST /api/connectors/:id/update | POST /api/agent/connectors/:id (intent=update) | ✅ Has parity |
| Test connector | `connectors.$connectorId.tsx` → fetch /api/connectors/test | POST /api/agent/connectors/:connectorId/test | ✅ Has parity |
| Add saved endpoint | `connectors.$connectorId.tsx` → POST /api/connectors/:id/endpoints (intent=create) | POST /api/agent/connectors/:connectorId/endpoints (intent=create) | ✅ Has parity |
| Delete saved endpoint | `connectors.$connectorId.tsx` → POST /api/connectors/:id/endpoints (intent=delete) | POST /api/agent/connectors/:connectorId/endpoints (intent=delete) | ✅ Has parity |
| Enable data store | `data._index.tsx` → POST /api/data-stores (intent=enable) | POST /api/agent/data-stores (intent=enable) | ✅ Has parity |
| Disable data store | `data._index.tsx` → POST /api/data-stores (intent=disable) | POST /api/agent/data-stores (intent=disable) | ✅ Has parity |
| Create custom data store | `data._index.tsx` → POST /api/data-stores (intent=create-custom) | POST /api/agent/data-stores (intent=create-custom) | ✅ Has parity |
| Add data store record | `data.$storeKey.tsx` → POST /api/data-stores (intent=add-record) | POST /api/agent/data-stores (intent=add-record) | ✅ Has parity |
| Delete data store record | `data.$storeKey.tsx` → POST /api/data-stores (intent=delete-record) | POST /api/agent/data-stores (intent=delete-record) | ✅ Has parity |
| Create schedule | `flows._index.tsx` → Form POST /flows (intent=create) | POST /api/agent/schedules (intent=create) | ✅ Has parity |
| Delete schedule | `flows._index.tsx` → Form POST /flows (intent=delete) | POST /api/agent/schedules (intent=delete) | ✅ Has parity |
| Toggle schedule (pause/resume) | `flows._index.tsx` → Form POST /flows (intent=toggle) | POST /api/agent/schedules (intent=toggle) | ✅ Has parity |
| Save flow (create or update) | `flows.build.$flowId.tsx` → POST /flows/build/:flowId | POST /api/agent/modules + POST /api/agent/modules/:id/spec | ✅ Has parity |
| Install workflow template | `flows.templates.tsx` → Form POST /flows/templates (templateId) | None (workflowDef model; no agent API) | ❌ Missing |

### Score: 23/25 (92%) — remediated 2026-03-05

*(Counted 25 distinct merchant-facing user actions; 23 have a corresponding agent API.)*

### Implemented (previously missing)

1. **Update connector** — `POST /api/agent/connectors/:connectorId` with `{ intent: “update”, name?, baseUrl?, allowlistDomains? }` now delegates to `ConnectorService.update()`. Logs `CONNECTOR_UPDATED` to ActivityLog.
2. **Connector endpoints CRUD** — New route `api.agent.connectors.$connectorId.endpoints.tsx`: `GET /api/agent/connectors/:connectorId/endpoints` (list) and `POST` with intents `create`, `update`, `delete`. Full parity with UI connector endpoints management.

### Remaining Missing Agent Tools

1. **Create module from template** – User can create a module by templateId via POST `/api/modules/from-template`. Agent can create via full spec (POST `/api/agent/modules`) but has no “create from template id” or template catalog endpoint.
2. **Install workflow template** – User can install a workflow template from `/flows/templates` (creates `workflowDef`). No agent API for workflow templates; flows in the agent API are flow.automation *modules*, not the same as template-installed workflowDefs.

### Recommendations

1. **Add create-module-from-template for agents** – Either expose a `GET /api/agent/templates` catalog + `POST /api/agent/modules/from-template`, or document that agents call `POST /api/agent/modules` with the resolved spec from `@superapp/core`'s `findTemplate`.
2. **Clarify or extend workflow templates for agents** – If workflowDef templates should be agent-usable, add list/install endpoints. Otherwise document that agents use flow.automation modules exclusively.

Score will reach **25/25 (100%)** after implementing both remaining items.
