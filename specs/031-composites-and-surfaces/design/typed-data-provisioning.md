# R3.3 — Typed Data-Model Provisioning (wire `ensureTypedStore` into publish)

**Phase #4 · Piece R3.3 / gap M8.** Design doc — an engineer builds directly from this.

**One-line problem.** `DataStoreService.ensureTypedStore` is the *only* writer of
`DataStore.schemaJson` and has **zero non-test callers**, so `schemaJson` is never
set on the live path → `parseDataModel(null) → null → validateRecord(null, …)` is a
permanent no-op even though the whole CRUD / grid / CSV / print / capture layer is
live. This piece wires a module that **declares a typed data model** to provision
its store at publish time (`schemaJson` set → typed record forms + write-time
validation activate). This is the shared-record substrate composites (R3.1) need.

**Design constraints honored.** The control-pack composer + `moduleSystemVersion`
were pruned (a17a748). The authoring path is flat-pin `RecipeSpec.config` + the live
`generate._index.tsx` builder + `SchemaForm`. We add **one additive optional field**
to the recipe `Base` (isomorphic, already-imported `DataModelSchema`), one provision
step in the publish path, and route the two untyped runtime auto-create paths through
the typed writer. Nothing here resurrects the composer. Where a runtime does not
exist we mark it an explicit follow-up rather than fake it.

---

## 1. Current state (file:line)

### 1a. The writer with no caller
- `apps/web/app/services/data/data-store.service.ts:109-143` — `ensureTypedStore(shopId, key, { label, description?, schemaJson? })`. Idempotent upsert; when `schemaJson` supplied and a store already exists, merges additively via `mergeSchemaAdditively` (`:34-47`, existing fields always win); omitting `schemaJson` never clobbers. **This is the only function that writes `schemaJson`.** Repo-wide grep for `ensureTypedStore` = 2 files: this definition + `apps/web/app/__tests__/data-store-provisioning.test.ts:24,53,67`. No route/service/publish/blueprint caller.
- `apps/web/app/services/data/data-store.service.ts:184-192` — `createRecord` gate: `model = parseDataModel(store?.schemaJson ?? null)`; `if (model) { validateRecord(...) → throw RecordValidationError }`. Correct logic, precondition (a populated `schemaJson`) never met on the live path.

### 1b. The validation machinery (all built, all correct, all pure/isomorphic)
- `packages/core/src/data-model.ts` — `DataModelSchema` (`:31-34`, `{ fields: DataField[] }`, ≤60 fields), `parseDataModel` (`:37-45`), `dataModelToZod` (`:48-63`), `validateRecord` (`:74-79`), `dataModelToForm` (`:91-121`, → SchemaForm `{ jsonSchema, uiSchema, defaults }`).
- `DataFieldSchema` (`:17-28`): `name` (`^[A-Za-z][A-Za-z0-9_]*$`, ≤60), `label?`, `type` ∈ `text|textarea|number|boolean|date|url|email|select`, `required`, `options?` (for `select`), `piiFlag`, `help?`.
- Already imported by the recipe: `packages/core/src/recipe.ts:15` (`import { DataModelSchema }`) and used at `:132` for `theme.section.config.fieldSchema`. **So `DataModelSchema` is already in the recipe's dependency graph — the additive field costs zero new imports.**

### 1c. The publish path (where we wire in)
- `apps/web/app/routes/api.publish.tsx:49-291` — the action. `shopRow` resolved at `:83` (`prisma.shop.findUnique({ where: { shopDomain } })` → `shopRow.id` = the `DataStore.shopId` FK). `spec` parsed at `:92`. `module.id` available. `PublishService.publish(spec, target)` called at `:225`, inside the `try` (`:222-268`), *after* preflight/policy/feature-flag/validation gates all pass.
- `apps/web/app/services/publish/publish.service.ts:52-145` — `PublishService.publish(spec, target)`. Constructed with only `admin` (`:50`). Does **not** have a Prisma/shopId handle today. Compiler ops loop at `:105-142`.
- `apps/web/app/services/recipes/compiler/index.ts:20-68` — `compileRecipe`; `CompileResult` (`compiler/types.ts:102-117`) is the surface-payload contract.

### 1d. The two untyped runtime auto-create paths (follow-up, §5c)
- `apps/web/app/services/data/module-capture.service.ts:127-134` — `createCustomStore(...)` on capture ingestion → no `schemaJson`.
- `apps/web/app/services/workflows/connectors/storage.connector.ts` — `write` op "Auto-provisions the store if it doesn't exist" → `enableStore` / `createCustomStore`, no `schemaJson`.

### 1e. Prisma shape (unchanged — no migration)
- `apps/web/prisma/schema.prisma` `model DataStore`: `schemaJson String?` already exists; `@@unique([shopId, key])`. `shopId` FK → `Shop.id`. **No schema migration required.**

---

## 2. Target shape (exact types + example)

### 2a. Recipe additive field — `RecipeSpec.dataModel` (on `Base`)

A module optionally declares ONE typed store keyed to the module. Put it on `Base`
(shared by every variant) so any surface type can persist first-party records — this
is exactly the "one authoritative record + N thin render surfaces" shape R3.1 wants.

`packages/core/src/recipe.ts`, extend `Base` (`:105-109`):

```ts
// packages/core/src/data-model.ts — ADD (exported), sits next to DataModelSchema
export const ModuleDataStoreSchema = z.object({
  /** Store label shown in the merchant Data Stores UI. */
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  /**
   * Optional stable key override. When omitted, publish derives `module_<moduleId>`.
   * Normalized by ensureTypedStore (lowercased, non-[a-z0-9_] → '_', ≤40 chars).
   */
  key: z.string().min(1).max(40).optional(),
  /** The typed field schema. Reuses the DataField system 1:1. */
  schema: DataModelSchema,   // { fields: DataField[] }
});
export type ModuleDataStore = z.infer<typeof ModuleDataStoreSchema>;
```

```ts
// packages/core/src/recipe.ts — Base (currently :105-109)
import { DataModelSchema, ModuleDataStoreSchema } from './data-model.js'; // extend existing import at :15
const Base = z.object({
  name: z.string().min(LIMITS.nameMin).max(LIMITS.nameMax),
  category: z.custom<ModuleCategory>(),
  requires: z.array(z.custom<Capability>()).default([]),
  /** Optional module-owned typed data store (Module System v2 backend data). */
  dataModel: ModuleDataStoreSchema.optional(),   // ← the only addition
});
```

Because every variant is `Base.extend({...})`, `dataModel` is now legal & optional on
all 21 types with no per-variant edits and no discriminated-union churn.

### 2b. Example spec (a reviews module that persists first-party reviews)

```jsonc
{
  "type": "proxy.widget",
  "name": "Product Reviews",
  "category": "engagement",
  "requires": ["APP_PROXY"],
  "config": { /* …existing widget config… */ },
  "dataModel": {
    "label": "Product Reviews",
    "description": "Customer-submitted product reviews.",
    "schema": {
      "fields": [
        { "name": "productId", "type": "text",     "required": true,  "label": "Product GID" },
        { "name": "rating",    "type": "number",   "required": true,  "label": "Rating (1-5)" },
        { "name": "author",    "type": "text",     "required": true,  "piiFlag": true },
        { "name": "email",     "type": "email",    "required": false, "piiFlag": true },
        { "name": "body",      "type": "textarea", "required": false, "label": "Review" },
        { "name": "status",    "type": "select",   "required": true,  "options": ["pending","approved","rejected"] }
      ]
    }
  }
}
```

### 2c. What activates once `schemaJson` is set (all already-live, zero new code)
- Typed add/edit form: `data.$storeKey.tsx:37` already calls `dataModelToForm(model)`.
- Write-time validation: `createRecord` (`data-store.service.ts:188-192`) already gates on `parseDataModel(store.schemaJson)`.
- Internal admin schema display: `internal.data-stores.$key.tsx:52-56` already reads `schemaJson`.

The store key is `module_<moduleId>` by default (matching the `SuperAppConnector`
convention documented at `superapp.connector.ts:47`), so a later `flow.automation`
wire-up addresses the same store by the same key.

---

## 3. Files to change

| # | File | Change | Kind |
|---|------|--------|------|
| 1 | `packages/core/src/data-model.ts` | Add `ModuleDataStoreSchema` + `ModuleDataStore` type; export both. | additive |
| 2 | `packages/core/src/recipe.ts:15,105-109` | Import `ModuleDataStoreSchema`; add optional `dataModel` to `Base`. | additive |
| 3 | `packages/core/src/index.ts` | Re-export `ModuleDataStoreSchema`, `ModuleDataStore` (if barrel re-exports data-model symbols; confirm & mirror existing pattern). | additive |
| 4 | `apps/web/app/services/publish/provision-data-store.server.ts` **(new)** | `provisionModuleDataStore(shopId, moduleId, spec)` — the wiring seam. Isolated, unit-testable, no `admin` dependency. | new |
| 5 | `apps/web/app/routes/api.publish.tsx:222-235` | After a successful `publisher.publish(...)`, call `provisionModuleDataStore(shopRow.id, module.id, spec)` **guarded by `if (shopRow?.id && spec.dataModel)`**. | additive |
| 6 | `apps/web/app/__tests__/provision-data-store.test.ts` **(new)** | Unit-test the new seam (see §7). | new |
| 7 | `apps/web/app/__tests__/recipe-datamodel.test.ts` **(new)** or extend an existing recipe test | Assert `Base` accepts/omits `dataModel`; round-trips through `RecipeService.parse`. | new |

**Deliberately NOT changed in this piece** (marked follow-up, §5c): `PublishService`
signature (kept `admin`-only — the provision step lives in the route, not the
service, so `PublishService` stays a pure Shopify-write unit with no Prisma handle);
`module-capture.service.ts`; `storage.connector.ts`.

---

## 4. Generation wiring

The generator already emits `RecipeSpec.config` scalars via the live builder. `dataModel`
is additive and optional, so **no generation change is required for correctness** —
existing modules simply omit it. To let the model *produce* a data model:

1. **Prompt / schema exposure.** The generation JSON Schema is derived from
   `RecipeSpecSchema` (per the flat-pin path). Adding `dataModel` to `Base`
   automatically surfaces it in that derived schema — verify the JSON-Schema builder
   walks `Base` fields (it does for `name`/`category`/`requires`). If the builder
   special-cases per-variant `config` only, add `dataModel` to its allow-list next to
   `name`/`requires`. **No new prompt file; one optional field in the existing schema.**
2. **Authoring UI (optional, follow-up-friendly).** `generate._index.tsx` reads
   `recipe.config` directly. A "Backend data" section can render `dataModel.schema`
   via the SAME `SchemaForm` using `dataModelToForm` — but a merchant-facing schema
   *editor* is out of scope for R3.3. For this piece, `dataModel` is
   **AI-authored / spec-carried**; the merchant edits records (already live), not the
   schema. Mark a schema-editor UI as a **follow-up** (do not fake a half editor).
3. **Back-compat for old drafts.** Specs without `dataModel` parse unchanged (field is
   `.optional()`, no `.default`), so re-publishing a pre-existing module is a no-op on
   the data-store side.

---

## 5. Runtime / compile / render / publish wiring — the make-or-break section

### 5a. The new seam (isolated, testable, no `admin` coupling)

```ts
// apps/web/app/services/publish/provision-data-store.server.ts  (NEW)
import type { RecipeSpec } from '@superapp/core';
import { DataStoreService } from '~/services/data/data-store.service';

/**
 * Provision a module's declared typed data store at publish time.
 * Idempotent + additive: re-publishing EXPANDS the schema (existing fields kept),
 * never drops/retypes — so records written under the old schema stay valid
 * (see DataStoreService.mergeSchemaAdditively).
 *
 * No-op when the spec declares no data model.
 * Returns the store key (or null when nothing was provisioned) for logging.
 */
export async function provisionModuleDataStore(
  shopId: string,
  moduleId: string,
  spec: RecipeSpec,
): Promise<{ storeKey: string } | null> {
  const dm = spec.dataModel;
  if (!dm || !dm.schema?.fields?.length) return null;

  const key = dm.key ?? `module_${moduleId}`;
  const svc = new DataStoreService();
  const store = await svc.ensureTypedStore(shopId, key, {
    label: dm.label,
    description: dm.description,
    schemaJson: JSON.stringify(dm.schema),   // { fields: [...] } — parseDataModel-compatible
  });
  return { storeKey: store.key };
}
```

Notes that make this correct:
- **`JSON.stringify(dm.schema)` is exactly what `parseDataModel` expects** — `parseDataModel` does `JSON.parse` then `DataModelSchema.safeParse`, and `dm.schema` *is* a `DataModel`. Round-trips cleanly.
- **`ensureTypedStore` already normalizes the key** (`data-store.service.ts:115`, lowercase + `[^a-z0-9_]→_` + ≤40), so `module_<cuid>` is safe; no double-normalization needed.
- **Additive merge is already implemented** (`:34-47`); republish appends new fields, never clobbers — the guarantee composites depend on.

### 5b. The call site (publish route)

`apps/web/app/routes/api.publish.tsx`, inside the existing `try` (`:222-268`),
immediately after `await publisher.publish(spec, target);` (`:225`) and before
`markPublishedWithTransition` (`:227`):

```ts
await publisher.publish(spec, target);

// R3.3: provision the module's typed data store (schemaJson set → typed forms +
// write-time validation activate). Additive/idempotent; no-op when undeclared.
if (shopRow?.id && spec.dataModel) {
  try {
    const provisioned = await provisionModuleDataStore(shopRow.id, module.id, spec);
    if (provisioned) {
      await new ActivityLogService().log({
        actor: 'MERCHANT', action: 'DATA_STORE_PROVISIONED',
        resource: `datastore:${provisioned.storeKey}`, shopId: shopRow.id,
        details: { moduleId: module.id, storeKey: provisioned.storeKey },
      });
    }
  } catch (e) {
    // Non-fatal: the module is published; provisioning failure must not roll back a
    // successful surface deploy. Surface it in logs, let the merchant retry via republish.
    await logRequestOutcome({
      shopId: shopRow.id, pathOrIntent: '/api/publish', success: false,
      details: { error: `data-store provisioning failed: ${e instanceof Error ? e.message : String(e)}`, moduleId: module.id },
    });
  }
}

await moduleService.markPublishedWithTransition({ /* …unchanged… */ });
```

**Placement rationale (the load-bearing decision):**
- **After `publish`, before `markPublished`.** Provisioning is DB-only (own Postgres),
  cannot fail the Shopify deploy, and is idempotent — so ordering vs the surface
  metaobject writes is immaterial for correctness. Placing it *after* `publish` means a
  gated/blocked module (`ModuleNotPublishableError` thrown at `publish.service.ts:56`)
  never provisions a store for a module that deploys nothing — preserving the WS5/026
  "never report published when nothing deploys" discipline.
- **Provisioning failure is non-fatal.** The surface already deployed; rolling back the
  live extension because a local DB upsert failed would be worse than a missing store
  (which a republish fixes). We log loudly and continue. This matches the existing
  best-effort pattern (`createRecord`'s `void emitFlowTriggerSafe`, `:204-211`).
- **No `PublishService` signature change.** The route already holds `shopRow`, `module`,
  and `spec`; the seam needs only those. Keeping `PublishService` `admin`-only avoids
  threading Prisma into the Shopify-write unit and keeps blast radius to the route + a
  new pure module.

### 5c. Render path — already live, nothing to build
Once `schemaJson` is populated, every consumer is already wired (§2c):
`data.$storeKey.tsx:26-37` (grid + `dataModelToForm`), `createRecord` validation gate,
CSV/print export, internal-admin schema view. **This is the entire payoff of R3.3: a
one-field spec addition + a one-call provision step flips a fully-built but dark
validation/typed-form stack to live.**

### 5d. Explicit follow-ups (do NOT fake in this piece)
- **F1 — Route the two untyped auto-create paths through `ensureTypedStore`.**
  `module-capture.service.ts:127-134` and `storage.connector.ts` still create *untyped*
  stores at runtime. For a module that both persists via capture/flow AND declares a
  `dataModel`, publish-time provisioning already sets the schema first, so a later
  runtime `createCustomStore` on the same key is a no-op on schema (the store exists).
  The residual gap is ordering (runtime write *before* first publish) — narrow, and
  out of scope for R3.3. Follow-up: have these paths call `getStoreByKey` and, when a
  module owns the key, defer to the typed store. **Marked, not built here.**
- **F2 — Merchant schema-editor UI** in `generate._index.tsx` (author `dataModel.schema`
  in the builder). R3.3 ships AI/spec-carried schemas; the editor is additive later.
- **F3 — Register `SuperAppConnector`** (`connectors/index.ts`) so flows address
  `module_<id>` stores. Separate piece (audit P8); this doc only establishes the key
  convention it will rely on.

---

## 6. Back-compat

- **Additive schema.** `dataModel` is `.optional()` with **no `.default`** → absent
  from every existing spec; `RecipeService.parse` of old drafts is unchanged; the
  discriminated union is untouched (field lives on `Base`, not per-variant).
- **No DB migration.** `DataStore.schemaJson String?` already exists.
- **Idempotent republish.** `ensureTypedStore` + `mergeSchemaAdditively` guarantee
  re-publish expands (never drops/retypes) → records valid under the old schema stay
  valid. Removing a field from a later spec does **not** delete the column (existing
  fields always win) — intentional, prevents orphaning data.
- **Untyped stores keep working.** Stores created by capture/flow with `schemaJson =
  null` still validate as no-op (`parseDataModel(null) → null`), exactly as today.
- **Preflight/gate order preserved.** Provision runs only after a *successful* deploy,
  so gated/blocked modules never leave a stray store. Non-fatal failure never flips a
  successful publish to failed.

---

## 7. Test plan

**Unit — `apps/web/app/__tests__/provision-data-store.test.ts` (new)**
1. `spec.dataModel` undefined → returns `null`, `ensureTypedStore` NOT called.
2. `spec.dataModel` with empty `schema.fields` → returns `null`, no call.
3. Declared model, no `key` → calls `ensureTypedStore(shopId, 'module_<id>', { label, description, schemaJson })` with `schemaJson === JSON.stringify(dm.schema)`. Assert the JSON round-trips through `parseDataModel` to the original field set.
4. Declared model with explicit `key` → uses that key (pre-normalization).
5. `ensureTypedStore` throws → `provisionModuleDataStore` propagates (route owns the try/catch; the seam itself does not swallow). Verify the route-level test covers the non-fatal swallow.

**Unit — recipe schema (`recipe-datamodel.test.ts` new, or extend existing recipe test)**
6. `Base`-derived variant parses with a valid `dataModel`.
7. Parses with `dataModel` omitted (back-compat).
8. Rejects `dataModel.schema.fields[].name` violating `^[A-Za-z][A-Za-z0-9_]*$` (delegated to `DataFieldSchema`).
9. `RecipeService.parse(JSON.stringify(spec))` preserves `dataModel` (no strip).

**Integration — publish route (extend the publish route test if one exists; else a focused mock test)**
10. Publish a spec **with** `dataModel` → after `publisher.publish` resolves, `provisionModuleDataStore` invoked with `shopRow.id` + `module.id`; `DATA_STORE_PROVISIONED` activity logged.
11. Publish a spec **without** `dataModel` → provision NOT invoked (guard `spec.dataModel`).
12. `publisher.publish` throws `ModuleNotPublishableError` → provision NOT invoked (still inside the same failure path; nothing provisioned for a non-deploying module).
13. Provisioning throws → publish still returns the `redirect(...?published=1)` (non-fatal); failure logged via `logRequestOutcome`.

**End-to-end activation (already-live consumers — assert the payoff)**
14. After provisioning, `getStoreByKey(shopId, 'module_<id>')` returns a store whose `schemaJson` `parseDataModel`s to the declared model.
15. `createRecord` on that store with an **invalid** payload throws `RecordValidationError` (proves validation went from no-op → active).
16. `createRecord` with a **valid** payload succeeds and persists.

**Existing tests to keep green:** `data-store-provisioning.test.ts` (unchanged —
`ensureTypedStore` signature/behavior untouched).

---

## 8. Risks + DECISION the human must make

**Risks**
- **R-a (low): generation JSON-Schema builder may not walk `Base` fields.** If the
  derived schema is assembled per-variant from `config` only, `dataModel` won't be
  exposed to the model. *Mitigation:* verify the builder includes `name`/`requires`
  (Base fields) — if so, `dataModel` rides along; if it's an explicit allow-list, add
  `dataModel`. Correctness is unaffected regardless (additive/optional); only
  AI-authorability depends on it.
- **R-b (low): key collision / reuse.** Default `module_<moduleId>` is unique per
  module; an explicit `dataModel.key` could collide with a predefined store
  (`product`, `order`, …) and additively merge into it. *Mitigation:* in
  `provisionModuleDataStore`, reject a `dm.key` that matches a `PREDEFINED_STORES` key
  (or force the `module_` prefix). Cheap guard; include in seam.
- **R-c (low): schema shrink.** A later spec dropping a field does not remove the
  column (by design). Merchants expecting "publish is truth" may be surprised.
  *Mitigation:* documented as intentional (data-safety); a destructive "reset schema"
  is a separate explicit action, never implicit on publish.
- **R-d (contained): provisioning-vs-deploy partial success.** Deploy succeeds,
  provision fails → published module with no typed store until republish. *Mitigation:*
  non-fatal + logged + idempotent republish; acceptable because the store is
  merchant-recoverable and the alternative (rolling back a live extension) is worse.

**DECISION (single biggest, human must make): where does the schema come from —
AI/spec-carried only, or also merchant-editable in the builder?**
R3.3 as specced ships **spec-carried** (AI authors `dataModel`; merchant edits
*records*, which is already live). A merchant-facing **schema editor** in
`generate._index.tsx` (F2) is a real, separable follow-up. Confirm we ship
spec-carried-only for R3.3 (recommended: it unblocks composites' shared-record
substrate immediately without new UI), and schedule the editor separately — rather
than expanding R3.3 to include an editor and delaying the substrate composites need.
