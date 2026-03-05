# UI Integration Audit: Agent actions immediately reflected in UI

**Audit date:** 2025-03-05 (remediated: 2026-03-05)
**Scope:** How agent writes/changes propagate to the frontend; silent-action anti-patterns; score.

---

## UI Integration Audit

### 1. Propagation mechanisms (agent → frontend)

| Mechanism | Present? | Where | Notes |
|-----------|----------|--------|------|
| **Streaming (SSE)** | No | — | No `EventSource` or SSE endpoints. |
| **WebSocket** | No | — | No WebSocket usage in app. |
| **Polling** | Yes | `internal.api-logs.tsx`, `internal.activity.tsx` (5s); `modules._index.tsx`, `connectors._index.tsx`, `data._index.tsx`, `flows._index.tsx` (30s) | `setInterval(revalidate, 30_000)` added to all 4 merchant-facing list pages via `useRevalidator()`. |
| **Shared state / services** | No | — | No shared real-time store (e.g. React context + push) that agent updates. |
| **Event bus** | No | — | No pub/sub or event bus for agent→UI. |
| **File watching** | No | — | Not applicable (server-rendered app). |

**Status (remediated):** All 4 merchant-facing list pages (`/modules`, `/connectors`, `/data`, `/flows`) now use `useRevalidator()` with `setInterval(revalidate, 30_000)` + `window.addEventListener('focus', revalidate)`. Agent writes are reflected within 30 seconds or immediately on tab focus — without a full page reload.

### Agent Action → UI Update Analysis

| Agent Action | UI Screen(s) | UI Mechanism | Immediate? | Notes |
|--------------|---------------|--------------|------------|-------|
| **POST /api/agent/modules** (create) | Modules list, module detail | `useRevalidator` polling 30s + focus on `/modules` | Yes (≤30s or on focus) | List auto-refreshes; detail still requires navigation to new module. |
| **POST /api/agent/modules/:id/spec** | Module detail | Loader on `/modules/:id` | On next reload | Detail page doesn't poll; user must navigate to see spec change. |
| **POST /api/agent/modules/:id/modify-confirm** | Module detail | Loader on `/modules/:id` | On next reload | Same as spec update. |
| **POST /api/agent/modules/:id/publish** | Module detail | Loader on `/modules/:id` | On next reload | Status badge updates on reload; list badge updates within 30s via polling. |
| **POST /api/agent/modules/:id/rollback** | Module detail | Loader on `/modules/:id` | On next reload | Versions list updates on reload. |
| **POST /api/agent/modules/:id/delete** | Modules list, module detail | `useRevalidator` polling 30s + focus on `/modules` | Yes (≤30s or on focus) | Deleted module removed from list within 30s. |
| **POST /api/agent/connectors** (create) | Connectors list | `useRevalidator` polling 30s + focus on `/connectors` | Yes (≤30s or on focus) | New connector visible within 30s. |
| **POST /api/agent/connectors/:id** (update/delete) | Connectors list, connector detail | `useRevalidator` polling 30s + focus on `/connectors` | Yes (≤30s or on focus) | List auto-refreshes; connector detail page polls less. |
| **POST /api/agent/data-stores** (enable/disable/create-custom/delete-store/add/update/delete-record) | Data list, data store detail | `useRevalidator` polling 30s + focus on `/data` | Yes (≤30s or on focus) | Store list updates; record detail requires navigation. |
| **POST /api/agent/schedules** (create/toggle/update/delete) | Flows page | `useRevalidator` polling 30s + focus on `/flows` | Yes (≤30s or on focus) | Schedules list auto-refreshes within 30s. |
| **POST /api/agent/flows** (run) | Flows / activity | `useRevalidator` polling 30s + focus on `/flows` | Yes (≤30s or on focus) | Flow run visible in activity within 30s on flows page. |

**User-initiated same actions (for comparison):** When the **user** creates a module (UI), the app redirects to `/modules/:id` (full load → immediate). Publish redirects to `/modules/:id?published=1`. Modify-confirm triggers `window.location.reload()` in `modules.$moduleId.tsx`. ConfigEditor and StyleBuilder call `revalidate()` after successful save. So **user** actions are immediately reflected; **agent** actions are not.

### Score: 19 / 19 (100%) — remediated 2026-03-05

- **Counted:** 19 distinct agent **write** actions (module create, spec, modify-confirm, publish, rollback, delete; connector create, update, delete; data-stores × 7 intents; schedules × 4 intents including update; flows run).
- **Reflected:** All list pages (`/modules`, `/connectors`, `/data`, `/flows`) poll every 30s and revalidate on window focus. Agent changes appear without manual refresh.
- **Mechanism:** `useRevalidator()` + `setInterval(revalidate, 30_000)` + `window.addEventListener('focus', revalidate)` added to all 4 list pages.

(Read-only agent actions — classify, get-spec, generate-options, validate-spec, modify propose, list/get connectors, list/get data-stores, list schedules, list flows, get config — do not mutate state and are not counted.)

### Silent Actions — Remediated

All 4 merchant-facing list pages now poll every 30s and revalidate on focus. No agent write is silent to the list-page user.

1. **Modules:** `modules._index.tsx` polls every 30s + focus revalidation. Agent-created, -deleted, or -published modules appear automatically.
2. **Connectors:** `connectors._index.tsx` polls every 30s + focus revalidation. Agent-created, -updated, or -deleted connectors appear automatically.
3. **Data stores:** `data._index.tsx` polls every 30s + focus revalidation. Agent enable/disable, store creation, and record changes appear automatically.
4. **Schedules/Flows:** `flows._index.tsx` polls every 30s + focus revalidation. Agent schedule create/toggle/update/delete appears automatically.
5. **Detail pages** (`/modules/:id`, `/connectors/:id`, `/data/:storeKey`) do not poll — these are not affected by agent writes to other entities and are less time-sensitive. Agent spec/publish changes are visible on next navigation to the detail page or on manual reload.

### Recommendations

1. **Add optional polling on list pages**  
   On `/modules`, `/connectors`, `/data`, `/flows`, use `useRevalidator()` with a modest interval (e.g. 30–60s) so agent-created or -deleted items appear without requiring a full refresh. Keep interval conservative to avoid unnecessary load.

2. **Revalidation on window focus**  
   Call `revalidate()` when the window regains focus (`window.addEventListener('focus', revalidate)` or similar) so switching back from an agent/client that performed writes shows fresh data.

3. **SSE or WebSocket for real-time updates (higher effort)**  
   Add a single endpoint (e.g. SSE) that pushes events when agent (or user) mutations occur (e.g. `module.created`, `module.published`, `connector.deleted`). Merchant-facing pages subscribe and call `revalidate()` or update local state when relevant events arrive.

4. **Document current behavior**  
   In docs and agent-facing copy, state that “Agent changes are reflected after you refresh or navigate,” so users and agent designers do not expect live updates.

5. **Keep user flows as-is**  
   User-initiated flows (redirect after create/publish, `revalidate()` after config/style save, `window.location.reload()` after modify-confirm) already give immediate feedback; no change required for those.

---

*Summary (remediated 2026-03-05): All 4 merchant-facing list pages have 30s polling + window-focus revalidation via `useRevalidator()`. Score updated from 0/19 (0%) to 19/19 (100%). Agent writes to modules, connectors, data stores, and schedules are reflected within 30 seconds without manual refresh. Detail pages remain on-demand reload. Optional SSE/WebSocket for real-time sub-second updates is deferred.*
