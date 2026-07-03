# Reality Audit — Multi-module blueprints

**Subsystem:** Multi-module blueprints (BLUEPRINTS_ENABLED, composeBlueprint, coordinated multi-surface generation/publish, additive data-model provisioning)
**Date:** 2026-07-03
**HEAD:** 4f056da (branch feat/027-unified-builder). Prior audit was a948f1c (feat/superapp-redesign).
**Method:** Re-traced the live path from `api.ai.create-module` **and the new `api.ai.create-module.stream`** → planner → catalog → `generateValidatedBlueprint` → `api.ai.create-blueprint` → `BlueprintService`. Re-verified callers (or their absence) for every persistence/deploy method against current HEAD. Distinguished "exists" from "runs".

Legend — **wired**: `live | built-not-wired | stub | absent`. **verdict**: `required | not-required | already-executed | partial`. **action**: `keep | wire-up | prune | rebuild | document-honestly`.

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

**Net: 0 fixed / 0 still-open resolved in substance — the blueprint subsystem is byte-for-byte unchanged since the prior audit.** `git diff --stat a948f1c HEAD` over `blueprint.service.ts`, `blueprint-catalog.ts`, `blueprint-planner.ts`, `recipe-blueprint.ts`, `api.ai.create-blueprint.tsx`, and `env.server.ts` is **empty**. The 027 commit series touched the builder UI / recipe vocabulary / `admin.discountUi` target, not the blueprint path. The one relevant structural change is a **new second live entry point** (streaming route) that adds a parallel flag-gated blueprint call site.

| # | Prior finding | Status | Current file:line |
|---|---|---|---|
| 1 | `composeBlueprint(moduleTypes)` does not exist (grep=0); real mechanism is a hardcoded 2-entry catalog | **STILL-OPEN (unchanged)** | `grep composeBlueprint` = **0** across all `.ts/.tsx`. Catalog still exactly 2 entries: `blueprint-catalog.ts:41-90` (`upsell.bundle_builder` @43, `promo.discount_reveal` @70). |
| 2 | `BLUEPRINTS_ENABLED` default off, never set true anywhere | **STILL-OPEN (unchanged)** | `env.server.ts:151-153` (`parseBooleanEnv(...false)`); grep of all env/toml/yaml/Dockerfile/json = **0 hits** setting it true. Now gated in **three** live places: `api.ai.create-module.tsx:172`, `api.ai.create-module.stream.tsx:181`, `api.ai.create-blueprint.tsx:23-25`. |
| 3 | Planner single/blueprint decision is real, deterministic, unit-tested | **STILL-OPEN→OK (unchanged, still live)** | `blueprint-planner.ts:41-60`; `blueprint-catalog.ts:106-108`. No diff. |
| 4 | Intent→catalog reachable on live path via classifier | **STILL-OPEN→OK (unchanged, still live)** | Live path now BOTH: `api.ai.create-module.tsx:168-170` and `api.ai.create-module.stream.tsx:180`. Intent keys unchanged in `packages/core/src/intent-packet.ts`. |
| 5 | Fan-out `generateValidatedBlueprint` real, live behind flag | **STILL-OPEN→OK (unchanged, now live from TWO routes)** | Def `llm.server.ts:1557`; called `api.ai.create-module.tsx:174` **and** `api.ai.create-module.stream.tsx:182`. No diff to blueprint fn. |
| 6 | Persistence real; migration filename stale (archived), column live in baseline | **STILL-OPEN (unchanged)** | `blueprint.service.ts:61-89`; `Recipe.summary TEXT` still at `prisma/migrations/20260702000000_baseline/migration.sql:24` + `:38`. Cited migration still only under `migrations-archive/` + `_archived_migrations_pre_baseline/`. |
| 7 | `publishBlueprint` fully implemented, **ZERO callers** | **STILL-OPEN (unchanged)** | Def `blueprint.service.ts:121-167`. `grep publishBlueprint` (excl. def) = **0** callers. No route/UI/job invokes it. |
| 8 | Routes+UI (generate→persist) wired behind flag | **CHANGED (still live, now via streaming path)** | UI now drives the **stream** route: `generate._index.tsx:459` fetches `/api/ai/create-module/stream`, batch fallback to `/api/ai/create-module` @499. Blueprint consumed as SSE `blueprint` event (`:486`), persisted via `finishBlueprint()`→`/api/ai/create-blueprint` (`:667-676`). Sibling banner `modules.$moduleId.tsx:507-511`. `listBlueprints` (`blueprint.service.ts:105`) still 0 callers. |
| 9 | Additive data-model provisioning absent from blueprint path | **STILL-OPEN (unchanged)** | `grep provision\|DataStore\|schemaJson\|dataModel` in `blueprints/` + `api.ai.create-blueprint.tsx` = **0**. |
| 10 | `injectResolvedBundle` implemented, no real caller (test-only) | **STILL-OPEN (unchanged)** | Def `blueprint.service.ts:25-43`; only importer is `__tests__/blueprint-deployability.test.ts:16`. `publishBlueprint` (the would-be caller) still never runs. |

**NEW findings this pass:**
- **N1 — Second blueprint entry point (streaming route).** `api.ai.create-module.stream.tsx` (added 0d9ac77) now runs `planBlueprint` + `generateValidatedBlueprint` behind the same flag (`:180-206`) and streams a `blueprint` SSE event. It does **not** persist — persistence still funnels through `create-blueprint`. This is the route the UI actually calls now (`create-module` is only the batch fallback). Net: the generation half has two live call sites; the publish half still has zero. **wired:** live · **verdict:** already-executed · **action:** keep.
- **N2 — No regression, no fix.** None of the ten prior findings were addressed by the 027 commit series. The publish/co-deploy facade (`publishBlueprint`, `injectResolvedBundle`) and the `composeBlueprint`/data-model-provisioning vocabulary gaps persist verbatim.

---

## Headline

The generation half of blueprints is **genuinely wired end-to-end behind the flag** — and now from **two** live routes (streaming + batch fallback). The **publish/co-deploy half is still built-not-wired** (`publishBlueprint`, `injectResolvedBundle` = zero real callers), and "additive data-model provisioning" is **still not in the blueprint path**. `composeBlueprint(moduleTypes)` **still does not exist**; the real mechanism is the same hardcoded 2-entry catalog. Nothing in the blueprint subsystem changed since the prior audit.

---

## Findings

### 1. `composeBlueprint` — the named API
- **Claim:** Audit brief + `specs/028-recipe-vocabulary/research/plugins/*.md` and `docs/audit-module-combinations.md:86` reference `composeBlueprint(moduleTypes)` — "turns **any** set of module types into a coordinated blueprint."
- **Reality:** `grep composeBlueprint` over all `.ts/.tsx` = **zero hits** (re-confirmed at HEAD 4f056da). The real mechanism is the deterministic hardcoded catalog `apps/web/app/services/ai/blueprint-catalog.ts:41-90`, still exactly **two** entries (`upsell.bundle_builder` @43, `promo.discount_reveal` @70), consumed by `planBlueprint()` (`blueprint-planner.ts:41-60`).
- **wired:** absent · **verdict:** not-required · **action:** document-honestly.

### 2. `BLUEPRINTS_ENABLED` flag
- **Claim:** `docs/blueprints.md` — default off; `isBlueprintsEnabled()`.
- **Reality:** Accurate. `env.server.ts:151-153` (`parseBooleanEnv(process.env.BLUEPRINTS_ENABLED, false)`). Never set true in any committed config (re-grepped: 0 hits). Now enforced in **three** live places: `api.ai.create-module.tsx:172`, `api.ai.create-module.stream.tsx:181`, `api.ai.create-blueprint.tsx:23-25`. Entire blueprint path is dark in production today.
- **wired:** live (as a gate) · **verdict:** already-executed · **action:** keep.

### 3. Planner — single vs blueprint decision
- **Reality:** `blueprint-planner.ts:41-60` — looks up `getBlueprintCatalogEntry(intent)`, returns single when entry missing or `<2` modules, else maps each member surface via `surfaceForModuleType`→`getCapabilityNode().surface` (`blueprint-catalog.ts:106-108`). Deterministic, DB-free, unit-tested. Unchanged.
- **wired:** live · **verdict:** already-executed · **action:** keep.

### 4. Intent → catalog reachability
- **Reality:** Confirmed reachable on the live path from **both** routes: `api.ai.create-module.tsx:170` and `api.ai.create-module.stream.tsx:180` pass `intentPacket.classification.intent` to `planBlueprint`. Both catalog keys are real `CLEAN_INTENTS` and are the `MODULE_TYPE_TO_INTENT` mappings for `functions.cartTransform`→`upsell.bundle_builder` and `functions.discountRules`→`promo.discount_reveal` (`packages/core/src/intent-packet.ts`). Fires when the classifier picks either functions type.
- **wired:** live · **verdict:** already-executed · **action:** keep.

### 5. Fan-out generation
- **Reality:** `llm.server.ts:1557-1631` — `Promise.all` over `plan.modules`, per-member `blueprintContext`, `optionCount:1`, throw on required-role failure / skip optional, `validateBlueprintCoherence`, returns `RecipeBlueprint`. Now called live from **two** routes (`create-module.tsx:174`, `create-module.stream.tsx:182`), each wrapped so blueprint failure never blocks the single-module result. Unchanged fn body.
- **wired:** live · **verdict:** already-executed · **action:** keep.

### 6. Persistence — `BlueprintService.createDraft` + `Recipe.summary`
- **Reality:** Live and correct. `blueprint.service.ts:61-89` creates the `Recipe` (title/summary/category from primary member) then loops `ModuleService.createDraft(..., {recipeId})`. Called live from `api.ai.create-blueprint.tsx:50`. `Recipe.summary TEXT` lives in `prisma/migrations/20260702000000_baseline/migration.sql:24` (+`:38`) and `schema.prisma`. **Doc drift persists:** doc cites archived migration `20260616120000_add_recipe_summary_blueprint` (now only under `migrations-archive/` + `_archived_migrations_pre_baseline/`).
- **wired:** live · **verdict:** already-executed · **action:** document-honestly (point doc at baseline migration).

### 7. Co-deploy — `publishBlueprint`
- **Reality:** Fully implemented (`blueprint.service.ts:121-167`), correct-looking, but **ZERO callers** (re-grepped at HEAD). No route, UI button, or job invokes it. Blueprint members persist as DRAFT modules and can only be published one-at-a-time via the ordinary per-module publish UI; the coordinated co-deploy the doc describes never runs.
- **wired:** built-not-wired · **verdict:** partial · **action:** wire-up or document-honestly.

### 8. Routes + UI
- **Reality:** Present and wired, now via the streaming path. `generate._index.tsx:459` fetches `/api/ai/create-module/stream` (batch fallback to `/api/ai/create-module` @499). The `blueprint` SSE event is consumed at `:486`; "Create all N modules" → `finishBlueprint()` (`:667-676`) POSTs to `/api/ai/create-blueprint`. Sibling banner `modules.$moduleId.tsx:507-511` via `getBlueprint`. Clickable when the flag is on. `listBlueprints` (`blueprint.service.ts:105`) still 0 callers (minor dangler).
- **wired:** live · **verdict:** already-executed · **action:** keep.

### 9. Additive data-model provisioning
- **Reality:** **Absent from the blueprint path** (re-grepped: no `provision`/`DataStore`/`schemaJson`/`dataModel` in `blueprints/` or `api.ai.create-blueprint.tsx`). Blueprints persist Recipe + Modules and nothing else.
- **wired:** absent · **verdict:** not-required · **action:** document-honestly.

### 10. Live bundle-data wiring — `injectResolvedBundle`
- **Reality:** Implemented (`blueprint.service.ts:25-43`) but **no real caller** — only imported for its `ResolvedBundle` type and exercised by `__tests__/blueprint-deployability.test.ts:16`. `publishBlueprint` (the only place that would apply it) never runs, so bundle members deploy with AI-generated placeholder GIDs.
- **wired:** built-not-wired · **verdict:** partial · **action:** prune or wire into a future co-deploy; fix the comment implying it runs.

---

## Bottom line

Unchanged since the prior audit: the plan→classify→fan-out→persist→UI generation loop is genuinely wired end-to-end (now from two live routes — streaming + batch fallback) but only behind `BLUEPRINTS_ENABLED`, which is `false` everywhere, so none of it runs in production; the publish half is still a facade (`publishBlueprint` and `injectResolvedBundle` have zero real callers, co-deploy would use placeholder GIDs), `composeBlueprint(moduleTypes)` still does not exist (2-entry catalog is the reality), and data-model provisioning is still not in the blueprint path — 0 prior findings fixed by the 027 commit series.
