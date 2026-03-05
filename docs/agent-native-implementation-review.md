# Agent-Native Audit Implementation — Code Review

**Review date:** 2025-03-05  
**Scope:** Module delete, plan/workspace injection, suggested prompts, revalidate after spec save, docs.

---

## 1. Code Review Summary

### What’s good

- **Module delete:** Implemented end-to-end. Route `api.modules.$moduleId.delete.tsx` uses `shopify.authenticate.admin`, validates `moduleId`, and calls `ModuleService.deleteModule(shopDomain, moduleId)`. Service looks up module by shop + id (ownership enforced), then `prisma.module.delete`; `ModuleVersion` has `onDelete: Cascade` in schema so versions are removed. Delete is linked from module detail in a “Danger zone” with confirmation and `Form` posting to `/api/modules/${moduleId}/delete`.
- **Plan tier + workspace in create-module:** Plan tier is resolved (shop row or `refreshPlanTier`) and injected as a constraint so the model only suggests publishable types. Workspace is injected as counts only: total modules, published, drafts; no PII. Text is: `"Workspace: N module(s) total (X published, Y draft). Avoid names..."`.
- **Suggested prompts:** `EXAMPLE_PROMPTS` in `modules._index.tsx` is built from `INTENT_EXAMPLES` (eight keys). Chips are visible (“Try:” + wrap of buttons) and wired: `onClick={() => setPrompt(ex)}` populates the prompt textarea.
- **Revalidate after spec save:** In both `ConfigEditor.tsx` and `StyleBuilder.tsx`, `revalidate()` is called only when `fetcher.data?.ok && fetcher.state === 'idle'`. No double-revalidate: the effect runs once per successful save; dependencies are stable so the same success doesn’t re-trigger.
- **Docs:** `implementation-status.md` and `ai-module-main-doc.md` are the main references; audit report is the single place that tracks agent-native scores.

### What’s missing or to improve

- **modify-module:** Plan tier and workspace are **not** injected in `api.ai.modify-module.tsx`. Create-module has them; modify does not. For consistency and so the model doesn’t suggest changes that require capabilities the plan doesn’t have, add plan tier (and optionally a short workspace line) to the modify prompt.
- **Module delete:** Two small improvements: (1) When the module is not found, the route could return 404 instead of 500 (e.g. catch “Module not found” and return 404). (2) Consider logging an activity (e.g. `MODULE_DELETED`) for audit, consistent with other destructive actions.
- **Suggested prompts:** The current set of 8 intents is a reasonable subset. `INTENT_EXAMPLES` has more keys (e.g. `promo.banner`, `engage.exit_intent`); no change required, but you could add 1–2 more chips if you want broader discovery.
- **Audit report:** The report still lists “Module (no delete)” and “INTENT_EXAMPLES not shown”, and Context Injection / UI Integration still show the old “missing” items. These should be updated to reflect implemented work and revised scores.

---

## 2. Specific Fixes or Doc Updates

### Code (optional but recommended)

| Item | File | Change |
|------|------|--------|
| 404 on delete when not found | `api.modules.$moduleId.delete.tsx` | In `catch`, if `e instanceof Error && e.message === 'Module not found'` return `json({ error: 'Module not found' }, { status: 404 })` instead of 500. |
| Activity log on delete | `api.modules.$moduleId.delete.tsx` | After successful `deleteModule`, call `ActivityLogService.log(...)` with action e.g. `MODULE_DELETED`, resource moduleId, shopId. |
| Plan/workspace in modify | `api.ai.modify-module.tsx` | Resolve plan tier (same as create-module). Optionally add one line of workspace (e.g. “Workspace: N modules.”). Append to the instruction or system context passed to `modifyRecipeSpecOptions` (or the prompt builder used inside it). |

### Docs (recommended)

| Doc | Update |
|-----|--------|
| `docs/agent-native-audit-report.md` | Mark recommendation #3 (Module delete) and #4 (suggested prompts) and #7 (revalidate) as implemented; update CRUD Completeness, Context Injection, Capability Discovery, and UI Integration scores and status text as below. |
| `docs/implementation-status.md` | In “Architecture overview” or a short “Agent-Native” subsection, note: Module delete (`DELETE`-style flow via POST `/api/modules/:id/delete`), plan tier + workspace injection in create-module, suggested prompt chips on Modules page, and revalidate after spec save in ConfigEditor/StyleBuilder. |
| `docs/ai-module-main-doc.md` | If there is a “Context / plan” or “Agent” section, add one sentence that create-module injects plan tier and workspace counts into the prompt; modify-module does not yet (or add once implemented). |

---

## 3. Suggested Score/Status Updates for Audit Report

Apply these in `docs/agent-native-audit-report.md` so the report reflects current state.

### CRUD Completeness (was 2/13 — 15% — ❌)

- **Change:** Module now has delete (route + service + UI). So “full CRUD” count becomes 3: ConnectorEndpoint, FlowSchedule, **Module**.
- **Suggested:** Score **3/13** (~23%). In “Incomplete” list, remove “Module (no delete)” and “ModuleVersion (no delete)” for Module (versions cascade with module delete). In Top 10 table, mark #3 “Add Module delete” as **Done** or add an “Implemented” note.

### Context Injection (was 2/6 — 33% — ❌)

- **Change:** Create-module now injects plan tier and workspace summary (counts only).
- **Suggested:** Score **4/6** (67%) or **5/6** if you’re strict (e.g. “existing module names” still missing). Update “Missing” to: “Existing module names (optional), recent activity, session history.” Add to “Injected”: “Plan tier and allowed capabilities; workspace summary (N modules, M drafts).” In Top 10, mark #2 and #6 as **Done** for create-module; note #6 partial if modify-module is not updated.

### Capability Discovery (was 2/7 — 29% — ❌)

- **Change:** Suggested prompts from INTENT_EXAMPLES are shown as chips in the Modules AI builder.
- **Suggested:** Score **3/7** (~43%). In “Missing”, remove “suggested prompts in UI (INTENT_EXAMPLES not shown)”. In Top 10, mark #4 “Surface suggested prompts in UI” as **Done**.

### UI Integration (was 8/9 — 89% — ✅)

- **Change:** ConfigEditor and StyleBuilder call `revalidate()` after successful spec save.
- **Suggested:** Keep **8/9** or move to **9/9** and status ✅. In the narrative, replace “recommend explicit revalidate() after spec save” with “ConfigEditor and StyleBuilder call revalidate() after successful spec save.” In Top 10, mark #7 as **Done**.

### Success Criteria Checklist

- **“Every entity has full CRUD”:** Still ❌ (2→3 entities with full CRUD).
- **“Users can discover what the agent can do”:** Change to ⚠️ (e.g. “Suggested prompts in Modules; in-app help/docs still missing”).

---

## 4. Verification Checklist

- [x] Module delete: auth, validation, cascade (schema), error handling, UI link and action.
- [x] Create-module: plan tier and workspace injected; no PII; counts only.
- [x] Modify-module: gap confirmed (no plan/workspace).
- [x] Suggested prompts: chips visible and wired to prompt input; EXAMPLE_PROMPTS from INTENT_EXAMPLES.
- [x] Revalidate: only on success + idle; no double revalidate.
- [ ] Audit report updated with “implemented” items and new scores (recommended).
- [ ] implementation-status / ai-module-main-doc mention plan/workspace and module delete (recommended).
