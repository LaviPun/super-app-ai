# Agent-Native Audit — Code Review (Post Agent API Implementation)

**Review date:** 2025-03-05  
**Source of truth:** [agent-native-audit-report.md](./agent-native-audit-report.md)  
**Scope:** New agent API routes, optional follow-ups (modify-module context, delete 404/activity), quality/consistency, docs.

---

## 1. Code Review Summary

### What was completed

- **Rec #1 — Expose agent API surface:** Implemented. Routes under `/api/agent/*` provide a stable JSON API for agent/MCP callers:
  - **GET /api/agent** — capability discovery index (list of endpoints, methods, bodies, returns).
  - **GET /api/agent/modules** — list modules (same data as UI).
  - **GET /api/agent/modules/:moduleId** — get one module with all version specs.
  - **POST /api/agent/modules** — create draft from full RecipeSpec (same backend as `createDraft`).
  - **GET/POST /api/agent/modules/:moduleId/spec** — read current spec; update spec (new DRAFT via `createNewVersion`).
  - **POST /api/agent/modules/:moduleId/publish** — publish (plan gate, pre-publish validation, `PublishService` + `markPublished`).
  - **POST /api/agent/modules/:moduleId/rollback** — rollback (`rollbackToVersion`).
  - **POST /api/agent/modules/:moduleId/delete** — delete module and versions (`deleteModule`).
  - **POST /api/agent/classify** — classify prompt (intent, confidence, intentPacket, routing); read-only.
- **Optional follow-ups (from previous review):**
  - **api.ai.modify-module.tsx:** Plan tier and workspace context were added (lines 37–46): planTier, totalModules, publishedModules, workspaceContext string injected into the modify prompt.
  - **api.modules.$moduleId.delete.tsx:** Already returns 404 when module not found and logs `MODULE_DELETED` via ActivityLogService.

### What’s good

- **Auth:** All agent routes use `shopify.authenticate.admin(request)`; actions are scoped to `session.shop`. No cross-shop access.
- **Backend reuse:** Agent routes call the same services as the UI: `ModuleService`, `RecipeService`, `PublishService`, `ActivityLogService`, `JobService`, `CapabilityService`. No duplicate logic.
- **Validation:** RecipeSpec validated with `RecipeSpecSchema.safeParse` on create and spec update; publish validates themeId for theme modules, version for rollback; classify requires prompt.
- **Error shape:** Consistent `json({ error: string, ... })` with 400/404/415/403/500 as appropriate.
- **Activity logging:** Agent write actions log with `actor: 'SYSTEM'`, `details: { ..., source: 'agent_api' }` (MODULE_CREATED, MODULE_DELETED, MODULE_PUBLISHED, MODULE_ROLLED_BACK, MODULE_SPEC_EDITED).
- **Discovery:** GET /api/agent returns a clear endpoint list with method, path, body, returns, and notes.

### What was fixed during review

- **api.agent.tsx:** The `endpoints` array had a syntax error: it was closed after `delete_module`, and the `classify_intent` entry was outside the array (trailing `],` then a lone object). Fixed by moving `classify_intent` inside the array so the loader returns valid JSON.

### What needs fix or follow-up

| Priority | Item | Location | Recommendation |
|----------|------|----------|----------------|
| **Important** | No tests for agent API | — | Add at least smoke tests or contract tests for GET /api/agent (index), GET/POST agent/modules, and one write (e.g. delete or spec update) so regressions are caught. |
| **Suggestion** | Rate limiting | Agent routes | Other write APIs (`api.publish`, `api.rollback`, `api.ai.*`) use `enforceRateLimit(…)`. Consider adding rate limits for agent routes (e.g. `agent:${session.shop}` or per-endpoint) to avoid abuse. |
| **Suggestion** | API logging | Agent routes | UI-facing APIs use `withApiLogging(…)` for observability. Optionally wrap agent actions in `withApiLogging` with `actor: 'SYSTEM'` and path so agent traffic is visible in logs. |
| **Minor** | spec.get redirect | api.agent.modules.$moduleId.spec.get.tsx | Loader types `request` but doesn’t use it; redirect with `params.moduleId ?? ''` can produce a double slash if moduleId is missing. Low risk; consider validating moduleId and returning 400. |

---

## 2. Agent API — Actions Exposed and Action Parity

The agent API exposes the following **module lifecycle** actions (all backed by the same services as the UI):

| Agent endpoint | Effect | UI equivalent |
|----------------|--------|----------------|
| GET /api/agent/modules | List modules | Modules list |
| GET /api/agent/modules/:id | Get module + versions/specs | Module detail |
| POST /api/agent/modules | Create draft from RecipeSpec | “Create from recipe” / AI create then confirm |
| GET /api/agent/modules/:id/spec | Read current spec | ConfigEditor/StyleBuilder load |
| POST /api/agent/modules/:id/spec | Update spec (new DRAFT) | ConfigEditor/StyleBuilder save |
| POST /api/agent/modules/:id/publish | Publish | Publish flow |
| POST /api/agent/modules/:id/rollback | Rollback | Rollback flow |
| POST /api/agent/modules/:id/delete | Delete module | Danger zone delete |
| POST /api/agent/classify | Classify prompt (read-only) | First step of AI create |

The audit report enumerates **25 user actions** across the app (create module AI/template, publish, rollback, AI modify, update spec, **connectors, data stores, flows, schedules, settings, billing**). The new agent surface covers **module-related actions only** (list, get, create from spec, update spec, publish, rollback, delete, plus classify). Connectors, data stores, flows, schedules, settings, and billing still have no agent-callable API.

**Suggested Action Parity score:** From **0/25** to **8/25 (32%)** — the 8 being: list modules, get module, create module (from spec), update spec, publish, rollback, delete module, classify intent. Mark Top 10 #1 as **Done** with the note that the surface is “module lifecycle only; connectors, data stores, flows, settings, billing not yet exposed.”

---

## 3. Recommended Code / Doc Changes

### Code

1. **Done:** Fix `api.agent.tsx` so `endpoints` is one array including `classify_intent` (syntax fix applied in this review).
2. **Optional:** Add rate limiting and/or `withApiLogging` to agent routes for consistency with `api.publish`, `api.ai.create-module`, etc.
3. **Recommended:** Add tests for the agent API (e.g. GET /api/agent returns 200 and includes `endpoints`; GET /api/agent/modules requires auth; one write endpoint returns expected shape).

### Docs

1. **agent-native-audit-report.md**
   - Update **Action Parity** from 0/25 to **8/25 (32%)** and set status to ⚠️ Partial.
   - In the narrative, state that an agent API exists under `/api/agent/*` and covers module lifecycle (list, get, create, update spec, publish, rollback, delete, classify); other areas (connectors, data stores, flows, settings, billing) are not yet exposed.
   - In **Top 10**, mark #1 “Expose agent API surface” as **Done**, with a note: “Module lifecycle only; GET /api/agent for discovery.”
   - Optionally add a short “Agent API” subsection under Detailed Findings (Action Parity) listing the 8 actions and pointing to GET /api/agent for the contract.

2. **implementation-status.md**
   - In “Doc Additions” or a new “Agent API” bullet, note that `/api/agent` and `/api/agent/modules/*` (and classify) provide a stable JSON surface for agents; same backend as UI; auth via Shopify admin session.

3. **ai-module-main-doc.md**
   - Optional: In the architecture or “Generator rule” section, add one sentence that an Agent API (`GET /api/agent`, `/api/agent/modules`, etc.) exposes module lifecycle and classify for agent/MCP callers.

---

## 4. Suggested Audit Report Edits (Concrete)

Apply these edits to `docs/agent-native-audit-report.md` so the report reflects the new work.

### Overall Score Summary (table)

- **Action Parity:** Change from `0/25 | 0% | ❌` to `8/25 | 32% | ⚠️`.

### Top 10 table

- **#1:** Change from “Expose agent API surface…” to:  
  **Expose agent API surface** – Add MCP tools or stable `/api/agent/*` routes…  
  **Status:** ✅ Done (module lifecycle: list, get, create, update spec, publish, rollback, delete, classify; GET /api/agent for discovery. Connectors, data stores, flows, settings, billing not yet exposed.)

### Executive Summary (paragraph 2)

- Replace “Action parity and agent-callable tools are missing” with:  
  “An **agent API** exists at `/api/agent` and `/api/agent/modules/*` (and `/api/agent/classify`), covering **module lifecycle** (list, get, create from spec, update spec, publish, rollback, delete, plus intent classification). **Action parity** is partial (8/25): connectors, data stores, flows, schedules, settings, and billing do not yet have agent-callable endpoints.”

### Detailed Findings — Action Parity (section 1)

- Replace the “Gap” paragraph with something like:  
  “**Implemented (partial):** Stable agent API at `/api/agent/*`. GET /api/agent returns the endpoint list. Module lifecycle: list, get, create (from RecipeSpec), update spec, publish, rollback, delete, and classify intent. All use the same backend and auth as the UI. **Gap:** The audit enumerates 25 user actions; 8 are covered (module-only). Connectors, data stores, flows, schedules, settings, and billing have no agent endpoints yet.”
- Keep or add: “**Recommendation:** Extend the agent API to cover connectors, data stores, flows, and (as needed) settings/billing, or document that those are out of scope for v1.”

### Success Criteria Checklist

- **“Agent can achieve anything users can through the UI”:** Change to ⚠️ “Partial — module lifecycle yes; connectors, data stores, flows, settings, billing no.”
- **“Every UI action has corresponding agent tool”:** Change from “❌ 0/25” to “⚠️ 8/25 (module lifecycle).”

### Implementation Verification (bottom section)

- Add a line: “**Agent API (Rec #1):** Implemented in `api.agent.tsx`, `api.agent.modules*.tsx`, `api.agent.classify.tsx`; auth, validation, same backend as UI; GET /api/agent for discovery. Optional: rate limiting, withApiLogging, and tests for agent routes.”

---

## 5. Verification Checklist

- [x] Agent index (GET /api/agent): auth, valid JSON, endpoints array includes all 9 entries (list, get, create, update_spec, publish, rollback, delete, classify_intent).
- [x] Agent routes use `shopify.authenticate.admin` and session.shop for scope.
- [x] Agent write routes call ModuleService / PublishService / ActivityLogService same as UI routes.
- [x] RecipeSpec validated with RecipeSpecSchema on create and spec update.
- [x] api.ai.modify-module: plan tier and workspace context injected.
- [x] api.modules.$moduleId.delete: 404 on not found, MODULE_DELETED activity log.
- [ ] Agent API tests: none found; recommend adding.
- [ ] Rate limiting / withApiLogging on agent routes: optional follow-up.
