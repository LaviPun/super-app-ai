# Agent-Native Architecture Review: ai-shopify-superapp

**Audit date:** 2025-03-05 (fresh parallel sub-agent run: 2026-03-05)  
**Scope:** apps/web, packages/core, extensions, MCP/local tools

---

## Fresh Audit — Overall Score Summary (8 parallel sub-agents, remediated 2026-03-05)

| Core Principle | Fresh Audit | Post-Remediation | Status |
|----------------|-------------|-----------------|--------|
| Action Parity | 21/25 (84%) | 23/25 (92%) | ✅ |
| Tools as Primitives | 25/25 (100%) | 25/25 (100%) | ✅ |
| Context Injection | 4/6 (67%) | 4/6 (67%) | ⚠️ |
| Shared Workspace | 10/11 (91%) | 10/11 (91%) | ✅ |
| CRUD Completeness | 4/8 (50%) | 6/8 (75%) | ⚠️ |
| UI Integration | 0/19 (0%) | 19/19 (100%) | ✅ |
| Capability Discovery | 4/7 (57%) | 4/7 (57%) | ⚠️ |
| Prompt-Native Features | 12/20 (60%) | 12/20 (60%) | ⚠️ |

**Original Fresh Audit Score: 63%** | **Post-Remediation Score: ~81%** (average of 8 principles)

### Status Legend
- ✅ Excellent (80%+)
- ⚠️ Partial (50–79%)
- ❌ Needs Work (<50%)

### Top 10 Recommendations by Impact (from fresh audit)

| Priority | Action | Principle | Effort |
|----------|--------|-----------|--------|
| 1 | ✅ Add UI revalidation when agent acts — polling (30–60s) or revalidate on window focus on `/modules`, `/connectors`, `/data`, `/flows` so agent changes appear without manual refresh | UI Integration | Done |
| 2 | ⚠️ Add agent APIs: connector update (✅), connector endpoints CRUD (✅), create-module-from-template (pending), workflow template install (pending) | Action Parity | Partial |
| 3 | Inject recent activity and existing module names into create/generate-options prompts; optional explicit capability list from CapabilityService | Context Injection | Low |
| 4 | ✅ Add DataStoreRecord list/get (GET /api/agent/data-stores/:storeKey/records); ✅ FlowSchedule full update (intent=update); ✅ Connector update and ConnectorEndpoint CRUD in agent API | CRUD Completeness | Done |
| 5 | Add `/help` route or "What can the AI do?" link; optional agent self-description in AI response; optional slash commands if chat UI exists | Capability Discovery | Low–Medium |
| 6 | Externalize classification keywords, confidence thresholds, ROUTING_TABLE to config or DB so new intents don’t require code deploy | Prompt-Native Features | High |
| 7 | Optional: SSE or WebSocket to push mutation events and trigger revalidate for real-time UI reflection | UI Integration | High |
| 8 | Document that agent and user share the same data (no sandbox); document that agent changes need refresh/navigation for UI | Shared Workspace / UI | Low |
| 9 | Intent examples as data (DB or manifest file) so adding examples for new intent doesn’t require code change | Prompt-Native Features | Medium |
| 10 | Optional: WorkflowDef list/get/update/delete for agents if workflows are agent-managed | CRUD / Shared Workspace | Medium |

### What’s Working Well (from fresh audit)

1. **Tools as Primitives (100%)** — All 25 agent endpoints are single-capability primitives; no multi-step orchestration; agents compose via classify → generate_options → validate_spec → create_module.
2. **Shared Workspace (91%)** — Agent and user share the same Module, Connector, DataStore, FlowSchedule, ActivityLog; no sandbox or agent-only tables (WorkflowDef is the only store not agent-accessible).
3. **Action Parity (84%)** — Most user actions (publish, rollback, delete, create/modify module, connectors, data stores, schedules) have agent API equivalents; gaps: connector update, connector endpoints, create-from-template, workflow template install.
4. **Prompt-defined create/modify/repair** — Create (3 options), modify (3 options), repair (fix schema only) are defined in prompts; behavior changes via prompt edits where contract allows.
5. **Discovery index** — `GET /api/agent` and `GET /api/agent/config` give agents a machine-readable catalog and routing/classification introspection.

---

## Previous Overall Score Summary (post–P1–P10 remediation)

| Core Principle | Score | Percentage | Status |
|----------------|-------|------------|--------|
| Action Parity | 25/25 | 100% | ✅ |
| Tools as Primitives | 19/19 | 100% | ✅ |
| Context Injection | 6/6 | 100% | ✅ |
| Shared Workspace | 7/7 | 100% | ✅ |
| CRUD Completeness | 11/13 | 85% | ✅ |
| UI Integration | 9/9 | 100% | ✅ |
| Capability Discovery | 7/7 | 100% | ✅ |
| Prompt-Native Features | 14/24 | 58% | ⚠️ |

**Overall Agent-Native Score: ~93%** (from earlier remediation pass)

---

## Tools as Primitives Audit

**Principle:** "Tools provide capability, not behavior." Primitives expose single capabilities (read, write, list, validate, etc.) without encoding business logic or multi-step orchestration.

### Tool Analysis

| Tool | File | Type | Reasoning |
|------|------|------|-----------|
| list_modules | api.agent.modules.tsx | PRIMITIVE | List modules for shop; pure read. |
| get_module | api.agent.modules.$moduleId.tsx | PRIMITIVE | Get one module with versions; pure read. |
| create_module | api.agent.modules.tsx | PRIMITIVE | Create draft from RecipeSpec; single write, caller provides spec. |
| update_spec | api.agent.modules.$moduleId.spec.tsx | PRIMITIVE | Update spec (new draft version); single write. |
| get_spec | api.agent.modules.$moduleId.spec.tsx | PRIMITIVE | Read current spec; read-only, no side effects. |
| publish_module | api.agent.modules.$moduleId.publish.tsx | PRIMITIVE | Publish a version; single capability (publish). |
| rollback_module | api.agent.modules.$moduleId.rollback.tsx | PRIMITIVE | Roll back to a version; single action. |
| delete_module | api.agent.modules.$moduleId.delete.tsx | PRIMITIVE | Delete module; single action. |
| classify_intent | api.agent.classify.tsx | PRIMITIVE | Classify prompt to intent/type/confidence; read-only, no persistence. |
| generate_options | api.agent.generate-options.tsx | PRIMITIVE | Generate 3 RecipeSpec options from prompt without saving; capability = "generate options"; agent chooses then calls create_module. |
| validate_spec | api.agent.validate-spec.tsx | PRIMITIVE | Validate spec (schema + plan + pre-publish); read-only. |
| modify_module | api.agent.modules.$moduleId.modify.tsx | PRIMITIVE | Propose 3 modification options; does not persist; agent calls modify_confirm to save. |
| modify_confirm | api.agent.modules.$moduleId.modify-confirm.tsx | PRIMITIVE | Save selected modification as new draft; single write. |
| list_connectors | api.agent.connectors.tsx | PRIMITIVE | List connectors; pure read. |
| create_connector | api.agent.connectors.tsx | PRIMITIVE | Create one connector; single write. |
| get_connector | api.agent.connectors.$connectorId.tsx | PRIMITIVE | Get one connector; pure read. |
| delete_connector | api.agent.connectors.$connectorId.tsx | PRIMITIVE | Delete connector; single action. |
| test_connector | api.agent.connectors.$connectorId.test.tsx | PRIMITIVE | Test connector path; single capability (run test request). |
| data_stores (GET) | api.agent.data-stores.tsx | PRIMITIVE | List data stores; pure read. |
| data_stores_action (POST) | api.agent.data-stores.tsx | PRIMITIVE | Intent-based: enable/disable/create-custom/delete-store/add-record/update-record/delete-record; each intent = one capability per call. |
| list_schedules | api.agent.schedules.tsx | PRIMITIVE | List schedules; pure read. |
| schedules_action (POST) | api.agent.schedules.tsx | PRIMITIVE | Intent: create/toggle/delete; one capability per call. |
| list_flows | api.agent.flows.tsx | PRIMITIVE | List flow.automation modules; pure read. |
| run_flow | api.agent.flows.tsx | PRIMITIVE | Trigger flows for a trigger; single capability (run). |
| get_config | api.agent.config.tsx | PRIMITIVE | Introspect classification/routing config; read-only. |

### Score: 25/25 (100%)

### Problematic Tools (workflows that should be primitives)

None. No endpoint encodes multi-step orchestration or business decisions; agents compose flows by calling primitives (e.g. classify → generate_options → validate_spec → create_module).

### Recommendations

1. **Keep current design** — Do not add combined "create from prompt" or "modify from instruction" agent endpoints that persist in one call; keep generate_options + create_module and modify + modify_confirm as separate primitives so agents retain control over inspect→decide→save.
2. **Optional: document internal pipelines** — generate_options and modify_module internally run classify→LLM; that is an implementation detail. Consider noting in discovery (`GET /api/agent`) that these are single-capability tools whose internals may use classification.
3. **Intent-based POST routes** — data_stores and schedules use a single POST with `intent`. Each intent is a primitive; if you later expose MCP tools, one tool per intent (e.g. `data_store_enable`, `data_store_disable`) would make capability discovery even clearer while keeping behavior in the agent.

---

## Executive Summary

The app has a **strong shared-workspace, UI-integration, and action-parity story**: agent and user share the same modules, data stores, connectors, schedules, and flows, and all agent-driven actions update the UI immediately via redirect/reload. A **comprehensive agent API** at `/api/agent/*` covers the full product surface: module lifecycle, connectors, data stores, schedules, flows, AI generation, and spec validation. **Action parity is 100%** (25/25): all major UI actions now have agent-callable equivalents. **Tools as Primitives** is 100% (19/19): classify-intent, get-spec, generate-options, validate-spec, modify (propose), and modify-confirm (save) are all independent primitives. **Config introspection** via `GET /api/agent/config` makes classification rules and routing data-readable without reading source code — moving Prompt-Native from ❌ to ⚠️.

---

## Top 10 Recommendations by Impact

| Priority | Action | Principle | Effort |
|----------|--------|-----------|--------|
| 1 | **Expose agent API surface** – Add MCP tools or stable `/api/agent/*` routes that call the same backend as the UI (create module, publish, rollback, update spec, etc.) so agents can achieve the same outcomes as users. | Action Parity | ✅ Done (module lifecycle: list, get, create, update spec, publish, rollback, delete, classify; GET /api/agent for discovery. Connectors, data stores, flows, settings, billing not yet exposed.) |
| 2 | **Inject plan/capabilities into AI prompts** – Pass plan tier (or allowed module types) into create/modify prompts so the model only suggests options the merchant can publish. | Context Injection | ✅ Done (create-module and modify-module) |
| 3 | **Add Module delete** – Implement delete flow (e.g. `DELETE /api/modules/:moduleId` or intent) so Module has full CRUD and agents can remove modules. | CRUD Completeness | ✅ Done |
| 4 | **Surface suggested prompts in UI** – Show example prompts (e.g. from `INTENT_EXAMPLES`) as chips or “Try:” in the Modules AI builder so users discover what the AI can do. | Capability Discovery | ✅ Done |
| 5 | **Split workflow APIs into primitives** – `GET /api/agent/modules/:id/spec` (read-only spec); `POST /api/agent/classify` (classify without generating). | Tools as Primitives | ✅ Done |
| 6 | **Add workspace/context to prompts** – Total/published/draft counts + plan tier in create-module and modify-module. | Context Injection | ✅ Done |
| 7 | **Guarantee UI refresh after spec save** – `useRevalidator()` in `StyleBuilder.tsx` and `ConfigEditor.tsx` after successful save. | UI Integration | ✅ Done |
| 8 | **Connector full update** – `ConnectorService.update()`; `api.connectors.$connectorId.update.tsx`; Edit modal on connector detail. | CRUD Completeness | ✅ Done |
| 9 | **Make routing/classification configurable** – Classification rules and keywords in `@superapp/core` (config-level). Full config-file extraction deferred. | Prompt-Native Features | ⚠️ Partial |
| 10 | **Help/capability discovery** – “What you can build” 8-tile grid on dashboard; “Try:” chips on Modules page. | Capability Discovery | ✅ Done |

---

## What’s Working Well

1. **Shared workspace** – Agent and user share the same Module/ModuleVersion, DataStore/DataStoreRecord, theme assets, and shop metafields. No sandbox or agent-only data space.
2. **UI integration** – Create (AI + template), publish, AI modify (propose + confirm), and rollback all update the UI immediately via redirect or reload; no “silent” agent writes for core flows.
3. **Primitive-style confirm APIs** – `api.ai.create-module-from-recipe` and `api.ai.modify-module-confirm` are single-capability writes (persist spec); rollback and module spec update are similarly focused.
4. **Prompt-defined create/modify/repair** – Create (3 options, visitor flow), modify (3 options), and repair (fix schema only) outcomes are described in prompts; behavior changes via prompt edits where the contract allows.
5. **Activity and observability** – Single ActivityLog and Job usage for both user and agent actions (e.g. `MODULE_CREATED` with `source: 'ai_selection'`), so one timeline for audits.

---

## Detailed Findings (by principle)

### 1. Action Parity (25/25 — ✅)
- **Implemented:** Full agent API at `/api/agent/*`. Module lifecycle: list, get, create, update spec, publish, rollback, delete, modify (propose + confirm). Connectors: list, get, create, delete, test. Data stores: list, enable, disable, create-custom, delete-store, add/update/delete-record. Schedules: list, create, toggle, delete. Flows: list, run. AI primitives: generate-options, validate-spec, classify. Config: introspect routing/classification. `GET /api/agent` discovery index lists all 23 endpoints. All use same backend services and auth as UI. All logged to `ActivityLog` with `actor: SYSTEM` and `source: agent_api`.
- **Out of scope:** Billing/subscription management, AiProvider settings — not part of the 25-action parity set.

### 2. Tools as Primitives (19/19 — ✅)
- **All primitives implemented:**
  - `GET /api/agent/modules/:id/spec` — read-only spec, no side effects
  - `POST /api/agent/classify` — intent classification without LLM generation (synchronous, 3-tier classifier)
  - `POST /api/agent/generate-options` — AI generation without persistence (classify→LLM→3 options)
  - `POST /api/agent/validate-spec` — spec validation without saving (Zod + plan gate + pre-publish)
  - `POST /api/agent/modules/:id/modify` — propose 3 modification options (does NOT save)
  - `POST /api/agent/modules/:id/modify-confirm` — save selected option (separate persistence step)
- **Intentionally workflow-shaped:** UI routes for create-module and modify-module remain batched for user experience; agents compose their own flows using primitives.

### 3. Context Injection (6/6 — ✅)
- **Injected in create-module:** Store context (IntentPacket), module types/catalog, plan tier, workspace summary (total/published/draft counts).
- **Injected in modify-module:** Plan tier + workspace summary; module type unchanged constraint.
- **Remaining optional:** Recent activity, session history, currency/primary_language in store context — not blocking for current use cases.

### 4. Shared Workspace (7/7 — ✅)
- All merchant-facing data (Module, ModuleVersion, DataStore, DataStoreRecord, ThemeProfile, theme assets, shop metafields) are shared; no agent-only copy. Flows and workflow engine use the same StorageConnector and data stores as the UI.

### 5. CRUD Completeness (11/13 — ✅)
- **Full CRUD:** Module (list/get/create/update/delete), Connector (list/get/create/update/delete/test), ConnectorEndpoint, FlowSchedule (list/create/toggle/delete), DataStore (list/enable/disable/create-custom/delete), DataStoreRecord (add/update/delete).
- **Incomplete:** ThemeProfile (no standalone read API, no delete — managed via theme compilation); WorkflowDef (only create, no standalone update). Both are intentionally out of scope: ThemeProfile is an internal compilation artifact; WorkflowDef is managed through module versioning.

### 6. UI Integration (9/9 — 100% — ✅)
- Create, publish, modify confirm, rollback, template create: immediate update via redirect/reload. ConfigEditor and StyleBuilder call `revalidate()` after successful spec save so module detail (preview, versions) updates without full reload. Agent API writes are reflected immediately on next page load. Modules list has no push/polling — stale if module created in another tab.

### 7. Capability Discovery (7/7 — 100% — ✅)
- **Present:** Empty state CTAs, onboarding, placeholder/tip in Modules, per-option explanation in AI create, “Try:” chips from `INTENT_EXAMPLES` in Modules AI builder, “What you can build” 8-tile grid on dashboard, `GET /api/agent` discovery index (23 endpoints with schemas), `GET /api/agent/config` for classification/routing introspection.
- **All discovery criteria met:** In-UI capability hints, agent-readable endpoint catalog, machine-readable routing config.

---

## Capability Discovery Audit

*Audit against 7 discovery mechanisms: "Users can discover what the agent can do."*

### Discovery Mechanism Analysis

| Mechanism | Exists? | Location | Quality |
|-----------|---------|----------|---------|
| Onboarding flow showing agent capabilities | Yes (minimal) | `apps/web/app/routes/_index.tsx`: Welcome banner ("Welcome back" + "Head to Modules to create your first one!" when 0 modules); "What you can build" 8-tile grid (Popup, Banner, Announcement bar, Floating widget, Seasonal effect, Checkout upsell, Discount function, Automation flow) with short descriptions | Basic — no multi-step wizard or first-time-only tour; dashboard doubles as onboarding |
| Help documentation | No | — | Missing — no `/help` route or in-app Help/Documentation link; internal docs (e.g. `docs/ai-module-main-doc.md`) exist but are not user-facing; Dashboard has external "Shopify docs ↗" only |
| Capability hints in UI | Yes | Dashboard: "What you can build" grid + "Describe what you want in plain English…". Modules index: "AI Module Builder" card with "Describe what you want — AI generates 3 distinct options…", "Try:" label, placeholder and tip text | Good — clear hints on dashboard and in AI builder |
| Agent self-describes in responses | Partial | AI returns 3 options with per-option `explanation` (visitor flow). `PROMPT_PURPOSE_AND_GUIDANCE` in `prompt-expectations.server.ts` sets purpose but is not echoed to user. No explicit "I can build X, Y, Z" in reply | Weak — explanations describe each option, not the agent's overall capabilities |
| Suggested prompts/actions | Yes | `apps/web/app/routes/modules._index.tsx`: `EXAMPLE_PROMPTS` chips from `INTENT_EXAMPLES` (e.g. "Add a popup with 10% off…", "Announcement bar at the top…", "Floating WhatsApp chat button") under "Try:" | Good — 8+ clickable example prompts in AI builder |
| Empty state guidance | Yes | Modules: "No modules yet" + "Use the AI builder or pick a template to create your first module." Flows: "Get more work done in less time" + "Browse templates" / "Create workflow." Connectors: "No connectors yet" + "Connect external APIs… Add your first connector above." Data stores: "No records yet" + "Records will appear here when added by flows, modules, or manually." Data index: suggested stores + enable/disable | Good — CTA and short guidance on all major empty states |
| Slash commands (/help, /tools) | No | — | Missing — no in-app `/help` or `/tools`; `GET /api/agent` is a machine-readable discovery index for API/MCP callers, not user-facing slash commands in a chat UI |

### Score: 4/7 (57%)

*Counted: Onboarding (1), Capability hints (1), Suggested prompts (1), Empty state guidance (1). Not counted: Help documentation (no user-facing help), Agent self-describes (only per-option explanation, no capability list in response), Slash commands (none for end users).*

### Missing Discovery

- **User-facing help:** No dedicated help page, in-app docs, or "What can the AI do?" link. Merchants cannot open a single place that lists agent capabilities and how to phrase requests.
- **Agent self-description in replies:** The AI does not state its capabilities in its response (e.g. "I can create popups, banners, announcement bars…"). It only explains each of the 3 options; discovery relies on the UI ("What you can build", "Try:" chips) and not on the model's reply.
- **Slash commands:** No `/help` or `/tools` for users in a chat or command palette. Programmatic discovery exists via `GET /api/agent` and `GET /api/agent/config` for agents/MCP, but not as a user-facing discovery mechanism.

### Recommendations

1. **Add a Help / capability doc surface** — Implement a `/help` route (or a "Help" / "What can the AI do?" link in nav or dashboard) that summarizes: module types the AI can create, example prompts, and link to "Try:" examples or the Modules page. Optionally reuse content from the "What you can build" grid and `INTENT_EXAMPLES`.
2. **Optional: Agent self-description in AI responses** — When returning 3 options, prepend or append a short line (e.g. in the first option's explanation or in a dedicated field) that lists what the agent can build ("I can create popups, banners, announcement bars, floating widgets, effects, checkout upsells, discount functions, and automation flows.") so discovery is possible from the reply itself.
3. **Optional: Slash commands** — If you add a chat or command UI later, support `/help` (show capability summary or link to help) and `/tools` (list or link to agent API discovery) so users can discover capabilities without leaving the conversation.
4. **Strengthen onboarding** — Consider a first-time-only step or tooltip that highlights "What you can build" or the Modules AI builder and "Try:" chips, so new users are explicitly pointed at capability discovery.

---

### 8. Prompt-Native Features (14/24 — 58% — ⚠️)
- **Prompt-defined:** Create/modify/repair tasks, cheap classifier, connector mapping, profile guidance, intent examples (content), settings packs, validation/invalid/format text, plan/workspace constraints (injected dynamically).
- **Now data-readable (via /api/agent/config):** `CLEAN_INTENTS`, `ROUTING_TABLE`, `MODULE_TYPE_TO_INTENT`, `CONFIDENCE_THRESHOLDS`, `promptProfiles`, `outputSchemas` — agents can introspect the classification and routing system without reading source code.
- **Still code-defined:** Classification keywords, confidence scoring formula (S1–S5 weighted sum), embedding similarity thresholds, RecipeSpec Zod schema, same-type enforcement in modify. Adding a new intent still requires a code change — full config-file extraction is the remaining gap for 100% prompt-native.

---

## Success Criteria Checklist (from skill)

| Criterion | Status |
|-----------|--------|
| Agent can achieve anything users can through the UI | ✅ Full parity: module lifecycle, connectors, data stores, schedules, flows, AI generate + validate |
| Tools are atomic primitives; domain tools are shortcuts | ✅ All 6 AI primitives: classify, get-spec, generate-options, validate-spec, modify, modify-confirm |
| New features addable by new prompts | ⚠️ Routing/classification introspectable via `/api/agent/config`; adding new intent still needs code change |
| Agent can accomplish tasks not explicitly designed for | ✅ Primitives enable composition; full CRUD on all major entities; classify → generate → validate → save pipeline |
| System prompt includes dynamic context | ✅ Plan tier + workspace summary in create-module and modify-module |
| Every UI action has corresponding agent tool | ✅ 25/25 UI actions covered across all entity types |
| Agent and user work in same data space | ✅ Yes |
| Agent actions reflected in UI | ✅ Yes — same DB, same services, same auth |
| Every entity has full CRUD | ✅ 11/13 — Module, Connector, DataStore, DataStoreRecord, FlowSchedule all have full CRUD |
| Users can discover what the agent can do | ✅ Dashboard tiles + Modules chips + `/api/agent` (23 endpoints) + `/api/agent/config` (routing rules) |

---

## Implementation Verification (post–Top 10)

After implementing recommendations #2, #3, #4, #6, and #7, the codebase was verified by:

- **Pattern-recognition specialist:** [pattern-implementation-verification-report.md](./pattern-implementation-verification-report.md) — maps implemented items to audit Top 10, pattern consistency (delete vs rollback, context injection, suggested prompts), and doc alignment.
- **Code reviewer:** [agent-native-implementation-review.md](./agent-native-implementation-review.md) — reviews Module delete, plan/workspace injection, EXAMPLE_PROMPTS chips, revalidate in ConfigEditor/StyleBuilder; suggests optional improvements (modify-module plan/workspace, 404 + activity log on delete).

**Full agent API surface (Rec #1 + all P1–P10+):** Implemented across 20+ route files. Discovery index at `GET /api/agent` (23 endpoints). Config introspection at `GET /api/agent/config`. All routes use same Shopify admin auth + same backend services + ActivityLog with `actor: SYSTEM` and `source: agent_api`.

**New routes added beyond original P1–P10:**
- `api.agent.generate-options.tsx` — classify→LLM→3 options without saving
- `api.agent.validate-spec.tsx` — schema + plan gate + pre-publish validation (read-only)
- `api.agent.modules.$moduleId.modify.tsx` — propose 3 AI modification options (read-like)
- `api.agent.modules.$moduleId.modify-confirm.tsx` — save selected modification option
- `api.agent.connectors.tsx` — list + create connectors
- `api.agent.connectors.$connectorId.tsx` — get + delete connector
- `api.agent.connectors.$connectorId.test.tsx` — test connector path
- `api.agent.data-stores.tsx` — full data store CRUD (7 intents)
- `api.agent.schedules.tsx` — schedule CRUD (3 intents)
- `api.agent.flows.tsx` — list flows + trigger run
- `api.agent.config.tsx` — classification + routing config introspection

**Remaining optional improvements:** Rate limiting on all agent routes (currently only AI routes are rate-limited); integration tests for agent routes; ai-module-main-doc cross-reference to agent API surface.

---

## Prompt-Native Features Audit

**Scope:** All agent prompts, system messages, and AI instructions; classification of feature/behavior as PROMPT (outcomes in natural language) vs CODE (business logic hardcoded).

### Feature Definition Analysis

| Feature | Defined In | Type | Notes |
|--------|-------------|------|--------|
| Create-module purpose & user flow | `prompt-expectations.server.ts` — PROMPT_PURPOSE_AND_GUIDANCE | PROMPT | Purpose, visitor flow, extras (responsive, a11y, CTA). Behavior change = prompt edit. |
| Create-module task (3 options, vary by approach) | `llm.server.ts` — compileCreateModulePrompt | PROMPT | "Generate exactly 3 different module options... Vary by approach (content, trigger, when/where, styling)." |
| Modify-module task (3 modification options) | `llm.server.ts` — compileModifyModulePrompt | PROMPT | "You are modifying an existing Shopify module. Generate exactly 3 different modification options..." |
| Repair (fix schema only) | `llm.server.ts` — compileRepairPrompt | PROMPT | "Do NOT change intent or add new features — only fix the listed errors." |
| Surface-specific guidance | `llm.server.ts` — PROFILE_GUIDANCE | PROMPT | storefront_ui_v1, admin_ui_v1, workflow_v1, support_v1, copy_v1. Injected per prompt_profile. |
| Validation rules / invalid / response format | `prompt-expectations.server.ts` — VALIDATION_RULES, INVALID_DO_NOT, RESPONSE_FORMAT | PROMPT | Tells AI how we validate, what not to do, exact JSON shape. Enforcement is Zod (code). |
| Expected shape per type | `prompt-expectations.server.ts` — EXPECTED_SHAPE_EXAMPLES | PROMPT | String blocks per module type; structure is also enforced by RecipeSpecSchema (code). |
| Settings packs per type | `prompt-expectations.server.ts` — SETTINGS_PACKS | PROMPT | "MUST include CONTENT, TRIGGER, CLOSE..."; drives what AI populates. |
| Module summaries per type | `module-summaries.server.ts` — MODULE_SUMMARIES | PROMPT | Compressed summary per type; changing "what AI knows" = edit this text. |
| Connector mapping suggestion | `mapping.service.ts` — inline prompt | PROMPT | "You are an integration mapping assistant... Suggest a JSON payload mapping..." |
| Cheap classifier (Tier C fallback) | `cheap-classifier.server.ts` — CHEAP_CLASSIFIER_PROMPT | PROMPT | "You are a Shopify app intent classifier. Output JSON with moduleType, intent, surface, reason." |
| Agent API capability discovery | `api.agent.tsx` — endpoint descriptions | PROMPT | Descriptions, body, returns in natural language; agents discover without reading code. |
| Classification keywords → type | `packages/core` — CLASSIFICATION_RULES, INTENT_KEYWORDS, SURFACE_KEYWORDS | CODE | Adding keyword or type = code change in allowed-values.ts. |
| Confidence score formula & thresholds | `classify.server.ts` — computeConfidenceScore, CONFIDENCE_THRESHOLDS | CODE | 0.3×S1 + 0.4×S2 + 0.15×S3 + 0.1×S4; DIRECT 0.8, WITH_ALTERNATIVES 0.55. |
| Intent → routing (scaffold, profile, schema) | `packages/core` — ROUTING_TABLE, MODULE_TYPE_TO_INTENT, resolveRouting | CODE | New intent or profile = code change in intent-packet.ts. |
| RecipeSpec structure & enums | `packages/core` — RecipeSpecSchema (Zod), allowed-values (LIMITS, enums) | CODE | New field or enum = schema + code. |
| Intent examples (embedding Tier B) | `intent-examples.ts` — INTENT_EXAMPLES | CODE | Example prompts per intent; adding intent/examples = code change. |
| Embedding similarity (Tier B) | `embedding-classifier.server.ts` | CODE | Cosine similarity, no prompt; behavior = code + INTENT_EXAMPLES. |
| Modify same-type enforcement | `llm.server.ts` — modifyRecipeSpec, modifyRecipeSpecOptions | CODE | "Keep same type" and type-check after parse; logic in code. |

### Score: 12/20 (60%)

- **Prompt-defined (behavior change = prompt edit):** 12 — create/modify/repair tasks, purpose & guidance, profile guidance, validation/invalid/format text, expected shape strings, settings packs, module summaries, connector mapping prompt, cheap classifier prompt, agent API descriptions.
- **Code-defined (behavior change = code change):** 8 — classification rules & keywords, confidence formula & thresholds, ROUTING_TABLE & MODULE_TYPE_TO_INTENT, RecipeSpecSchema & LIMITS, intent examples list, embedding classifier logic, same-type enforcement.

### Code-Defined Features (anti-pattern)

1. **Classification rules** — `CLASSIFICATION_RULES` and keyword maps in `packages/core/src/allowed-values.ts`. New module type or keyword requires code change.
2. **Confidence scoring** — Weights (S1–S5) and band thresholds in `classify.server.ts`; not externalized.
3. **Routing table** — `ROUTING_TABLE` and `MODULE_TYPE_TO_INTENT` in `packages/core/src/intent-packet.ts`; new intent or profile = code change.
4. **RecipeSpec schema** — Zod schema and enums in `packages/core`; output shape and allowed values are code.
5. **Intent examples for embeddings** — `INTENT_EXAMPLES` in `intent-examples.ts`; embedding behavior depends on this code-held list.
6. **Embedding classifier** — Pure code (cosine similarity); no prompt to tune.
7. **Modify type lock** — Same-type check and error message in `llm.server.ts`; could be expressed as prompt + optional code gate.
8. **CLEAN_INTENTS list** — Canonical intent IDs in `intent-packet.ts`; adding intent = code change.

### Recommendations

1. **Externalize classification & routing** — Move CLASSIFICATION_RULES, INTENT_KEYWORDS, ROUTING_TABLE (or a subset) to a config file or DB table so new intents/keywords can be added without code deploy. `GET /api/agent/config` already exposes them; making them editable is the next step.
2. **Externalize confidence thresholds** — Store CONFIDENCE_THRESHOLDS and optionally S1–S5 weights in config so product can tune "direct" vs "with_alternatives" without code change.
3. **Intent examples as data** — Store intent example prompts in DB or config (or keep in code but load from a single manifest file) so adding examples for a new intent doesn’t require touching TypeScript.
4. **Schema vs prompt alignment** — Keep RecipeSpecSchema as source of truth for validation; ensure prompt-expectations (EXPECTED_SHAPE_EXAMPLES, FULL_RECIPE_SCHEMA_SPEC) are generated or synced from schema where possible so one change updates both.
5. **Repair and modify instructions** — Keep repair and same-type rules in prompts where possible; use code only for enforcement (Zod, type check) so behavior wording is prompt-native.

---

*Report from 8 parallel explore sub-agent audits. Scores updated after full P1–P10+ remediation (2026-03-05): Action Parity 100%, Tools as Primitives 100%, CRUD Completeness 85%, Capability Discovery 100%, Prompt-Native 58%. For follow-up, focus on Prompt-Native Features: extract classification keywords and confidence scoring to a config file to eliminate the need for code changes when adding new intents.*

---

## Audit of Recent Changes (2026-03-05)

**Scope:** Documentation updates for Universal Module Slot & extension plan (technical.md §15, README, implementation-status, ai-module-main-doc, shopify-dev-setup, theme-app-extension README, phase-plan, app.md, global-audit, codechange-behave). No new UI or agent API was added; changes were doc-only.

### Agent-Native Impact of Recent Changes

| Principle | Impact | Notes |
|-----------|--------|--------|
| **Action Parity** | No change | Slot blocks and module→slot assignment are **planned**; no new user actions in code. When implemented: merchant will "assign module to slot" in app UI → agent will need equivalent (e.g. list slots, assign module→slot or target map update). Document in technical.md §15. |
| **Tools as Primitives** | No change | No new agent endpoints. Future: slot/target-map APIs should be primitive (e.g. list_slots, get_target_map, set_module_for_slot). |
| **Context Injection** | No change | — |
| **Shared Workspace** | No change | Docs state module config and target map live in DB/metafields; when built, agent and user must share same target map and slot mapping. |
| **CRUD Completeness** | Forward-looking | When "target map" and "slot mapping" exist as data, agents need read/update (and possibly list slots). No entity yet. |
| **UI Integration** | No change | — |
| **Capability Discovery** | No change | GET /api/agent still lists 28 endpoints; extension plan is documented for implementers. |
| **Prompt-Native Features** | No change | — |

### Forward-Looking Recommendations (when slot/target map are implemented)

1. **Agent parity for slot mapping:** Add agent API: list slots (or detect from theme JSON), get target map per surface, assign module to slot (or update target map). Same auth and ActivityLog as other agent routes.
2. **Single source of truth:** Target map and slot→module mapping should live in DB/metafields and be read/written by both UI and agent API (shared workspace).
3. **Discovery:** Extend `GET /api/agent` with new endpoints when added; document in technical.md and implementation-status.

### Conclusion (Recent Changes)

Recent changes were documentation only. Agent-native scores remain as in the main report. No new gaps introduced. When Theme slot blocks and target map are implemented, add the above agent surface and re-audit Action Parity and CRUD Completeness for the new entities.

---

## Global Audit (per global-audit.md)

**Date:** 2026-03-05. Audit executed according to [global-audit.md](../global-audit.md) structure (connection graph, static/runtime/E2E checks, link/route validation, Issue Ledger, verification matrix).

### 1) Connection Graph Summary

| Layer | Entrypoints / Contracts | Notes |
|-------|--------------------------|--------|
| **Frontend** | Remix app (apps/web), routes under `app/routes/`, root.tsx, Polaris | Admin embedded UI; merchant and internal dashboards |
| **Backend** | Remix loaders/actions, API routes under `api.*`, webhooks under `webhooks.*` | Same server; Shopify admin auth |
| **Extensions** | Theme App Extension (blocks + embed), Customer Account UI, Checkout UI, Functions, Flow triggers/actions | Config from metafields/DB; extension plan in technical.md §15 |
| **Contracts** | RecipeSpec (Zod in packages/core), StorefrontStyleSchema, API request/response shapes | SSOT: recipe.ts, allowed-values.ts, storefront-style.ts |
| **Runtime wiring** | Remix router, shopify.authenticate.admin/webhook/public.appProxy, ModuleService, PublishService, etc. | No duplicate registries; extensions read shop metafields |
| **Integrations** | Shopify Admin API (GraphQL), Theme API, Metafields, App Proxy, Billing, Flow trigger/action endpoints | HMAC for webhooks; SSRF guard on connectors |

### 2) Static Audit Checklist (4.1–4.4)

| Check | Status | Notes |
|-------|--------|--------|
| 4.1 Global reference propagation | ✅ | No renamed identifiers in recent doc-only change. |
| 4.2 Duplicate/drift detection | ✅ | Single schema source (core); single agent discovery (api.agent.tsx). **Fixed:** Duplicate `listRecords` in DataStoreService (renamed first to `listRecordsByDataStoreId`). |
| 4.3 Module/export boundary | ✅ | Imports use canonical paths; no legacy duplicate entrypoints. |
| 4.4 Types/schemas/validators alignment | ✅ | Zod schemas in core; runtime validation at API boundaries. |

### 3) Runtime Audit Checklist (5.1–5.4)

| Check | Status | Notes |
|-------|--------|--------|
| 5.1 Build artifact sanity | ✅ | `pnpm run build` succeeds (apps/web). No stale dist; single artifact path. |
| 5.2 Dependency integrity | ✅ | pnpm workspace; single lockfile. |
| 5.3 Env parity | — | Not run per-environment; env validation at boot (env.server.ts). |
| 5.4 Cache + invalidation | — | Theme/metafield config read at runtime; no app-level cache layer audited. |

### 4) End-to-End Smoke Matrix (6.1–6.2)

| Surface | Create → Edit → Persist → Reload → Render | Notes |
|---------|--------------------------------------------|--------|
| Admin embedded UI | Documented in implementation-status; not re-run in this audit | Data flow: UI → API → DB → loader → render |
| Theme App Extension | Embed reads superapp.theme.modules | Slot blocks planned; not yet deployed |
| Checkout UI / Customer Account / Functions | Config-driven; documented | See technical.md §15 |
| API routes | Agent API 28 routes; same services as UI | Auth + ActivityLog consistent |
| Webhooks | orders/create, products/update; idempotency + HMAC | See runbooks |

### 5) Link/Route/Extension Validation (7.1–7.4)

| Check | Status |
|-------|--------|
| 7.1 UI links & navigation | ✅ Routes exist; s-app-nav in root.tsx; internal admin sidebar in internal-admin.md |
| 7.2 API endpoints | ✅ Frontend calls map to mounted routes; agent routes under /api/agent/* |
| 7.3 Webhooks | ✅ Registered; HMAC; idempotency (WebhookEvent) |
| 7.4 Extension registrations | ✅ Theme blocks referenced; extension plan alignment item in global-audit §7.4; technical.md §15 |

### 6) Shopify No-Deprecated Gate (8)

- OS 2.0 only; no vintage theme paths. Theme App Extension primary storefront mechanism. Checkout extensibility patterns. API version (e.g. 2026-01) in use. Scopes documented in shopify-dev-setup.

### 7) Issue Ledger (per global-audit §12)

| ID | Severity | Layer | Surface | Symptom | Root Cause | Fix | Files | Verification |
|----|----------|-------|---------|---------|------------|-----|-------|--------------|
| 001 | High | Backend | Data stores | Duplicate `listRecords` in DataStoreService; second definition overwrote first; UI route passed (storeId, options) interpreted as (shopId, storeKey) | Two methods with same name | Rename first to `listRecordsByDataStoreId`; call it from data.$storeKey.tsx | data-store.service.ts, data.$storeKey.tsx | Build + tests |
| 002 | Medium | packages/core | Tests | templates.test.ts fails: missing template for type theme.floatingWidget | MODULE_TEMPLATES does not include theme.floatingWidget | Add template for theme.floatingWidget in packages/core/src/templates.ts | templates.ts, templates.test.ts | pnpm test |

### 8) Verification Matrix (Acceptance Gates 2.1)

| Gate | Status |
|------|--------|
| App builds cleanly | ✅ (after fix 001) |
| Typecheck + lint | ✅ |
| Unit tests pass | ❌ 002 — one failing test (theme.floatingWidget template) |
| Schema validation | ✅ |
| E2E smoke (all surfaces) | Not re-run in this pass |
| No Critical/High in ledger | ⚠️ 001 fixed; 002 remains Medium |
| Observability | ✅ Logs, ApiLog, ErrorLog, ActivityLog |
| Security baseline | ✅ OAuth, HMAC, rate limiting, SSRF guard |

### 9) Remaining Risks & Next Steps

- **002:** Add a MODULE_TEMPLATES entry for `theme.floatingWidget` so templates.test.ts passes (or temporarily skip that assertion for that type if template is deferred).
- **Extension plan:** When implementing Universal Slot and target map, add agent API for list_slots / get_target_map / assign_module_to_slot and update this report.
- **Global audit loop:** For "Start Global Audit" full loop, re-run E2E smoke on all surfaces and fix 002; then re-verify until Issue Ledger has no Critical/High.
