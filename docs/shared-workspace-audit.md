# Shared Workspace Audit

**Criterion:** "Agent and user work in the same data space."

**Scope:** Prisma schema (apps/web/prisma/schema.prisma), agent routes (api.agent.*), user routes (modules.*, connectors.*, data.*, flows.*, api.*), and shared services (ModuleService, ConnectorService, DataStoreService, ScheduleService, ActivityLogService).

---

## Shared Workspace Audit

### Data Store Analysis

| Data Store | User Access | Agent Access | Shared? |
|------------|-------------|--------------|---------|
| Shop | Yes (dashboard, settings, loaders) | Yes (all agent routes resolve shop) | Yes |
| Recipe | Yes (module creation, recipe linkage) | Yes (ModuleService createDraft) | Yes |
| Module | Yes (modules._index, modules.$moduleId, api.publish, api.modules.*.spec) | Yes (api.agent.modules, .modules.$moduleId.*) | Yes |
| ModuleVersion | Yes (via ModuleService) | Yes (via ModuleService: createNewVersion, markPublished, rollback) | Yes |
| Connector | Yes (connectors._index, connectors.$connectorId, api.connectors.*) | Yes (api.agent.connectors, api.agent.connectors.$connectorId) | Yes |
| ConnectorEndpoint | Yes (api.connectors.$connectorId.endpoints) | Yes (connector list/create/delete) | Yes |
| DataStore | Yes (data._index, data.$storeKey, api.data-stores) | Yes (api.agent.data-stores: list, enable, disable, create-custom, records) | Yes |
| DataStoreRecord | Yes (DataStoreService from data.*, api.data-stores) | Yes (api.agent.data-stores: add/update/delete-record) | Yes |
| FlowSchedule | Yes (flows._index via ScheduleService) | Yes (api.agent.schedules: list, create, toggle, delete) | Yes |
| ActivityLog | Yes (logs._index; many routes log via ActivityLogService) | Yes (all agent routes log with actor SYSTEM, source agent_api) | Yes |
| WorkflowDef | Yes (flows.templates create; internal.templates) | No (agent lists “flows” via Module type flow.automation) | No (user-only) |

**Supporting / operational models** (not split by agent vs user; shared infrastructure): Session, AiProvider, AiUsage, ErrorLog, ApiLog, Job, WebhookEvent, FlowStepLog, PlanTierConfig, AppSubscription, RetentionPolicy, ThemeProfile, AppSettings, AuditLog, WorkflowRun, WorkflowRunStep, ConnectorToken, ModuleAsset, ImageIngestionJob, ModuleInstance, ModuleSettingsValues, DataCapture, FunctionRuleSet, FlowAsset, ModuleEvent, ModuleMetricsDaily, AttributionLink.

### Score: 10/11 (91%)

- **11** = tenant-facing “workspace” data stores (Shop, Recipe, Module, ModuleVersion, Connector, ConnectorEndpoint, DataStore, DataStoreRecord, FlowSchedule, ActivityLog, WorkflowDef).
- **10** = those stores that **both** user and agent read or write. The only one not shared is **WorkflowDef** (user/internal only; agent uses Module for flows).
- **0** = agent-only or sandbox data stores.

Alternative view: **100% of agent-accessible data stores are shared with the user** (10/10). No agent sandbox exists.

### Isolated Data (anti-pattern)

- **None.** There are no agent-only tables, no sandbox DB, and no separate “agent workspace.” Agent routes call the same `ModuleService`, `ConnectorService`, `DataStoreService`, `ScheduleService`, and `ActivityLogService` as the UI; they read/write the same Prisma models (Module, ModuleVersion, Connector, DataStore, DataStoreRecord, FlowSchedule, ActivityLog, Shop). No `AgentModule`, `AgentSandbox`, or duplicate tenant tables were found.

### Recommendations

1. **Keep the current design** – Single workspace (same tables, same services) for both agent and user is the desired pattern; no change needed for shared workspace.
2. **Optional: expose WorkflowDef to agents** – If flow templates (WorkflowDef) should be manageable by agents, add read/write under `/api/agent/*` (e.g. list templates, create from template) so WorkflowDef becomes 11/11 shared; otherwise document that “flows” for the agent are Module-based only.
3. **Document shared workspace in API docs** – In `GET /api/agent` or agent API docs, state explicitly that agent and user share the same modules, connectors, data stores, and schedules (no sandbox).
4. **Continue using ActivityLog for both** – Keep a single `ActivityLog` with `actor: SYSTEM` and `details.source: 'agent_api'` for agent actions so one audit trail covers user and agent.
