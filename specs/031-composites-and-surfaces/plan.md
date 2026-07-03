# Phase 031 — Composites & New Surfaces · Consolidated Build Plan

**Scope.** Seven design pieces, one phase. This plan sequences them, surfaces the two
cross-cutting human decisions they collide on (durable-scheduler strategy; agentic
add-vs-defer), names the field types + publish-time contracts they share, and gives a
per-increment, independently-testable checklist mirroring how Phase #2/#3 shipped
(additive → green → commit).

Source docs (all under `specs/031-composites-and-surfaces/design/`):

| Piece | Doc | One-line |
|---|---|---|
| **R3.1** | `composites-shared-record.md` | **Flagship** — composites as *one authoritative record + N thin surfaces + a checkout-enforcement Function* over a shared `sharedRecord` envelope on `RecipeBlueprint`. |
| **R3.2** | `blueprint-co-deploy.md` | "Publish all N" — wire the facade `publishBlueprint` into a real caller + resolve the bundle triangle (SKU→GID) at publish. |
| **R3.3** | `typed-data-provisioning.md` | Wire the caller-less `ensureTypedStore` into publish so `DataStore.schemaJson` gets set — the typed-record substrate composites need. |
| **R3.4** | `messaging-surface.md` | First-class `messaging.campaign` type: bounded email/slack fan-out over a resolved audience (SMS/push modeled, gated `needs_runtime`). |
| **R3.5** | `durable-scheduler.md` | **DECISION** — wire-DAG vs lean-on-Flow vs own-cron for relative per-entity waits (dunning/expiry/review sequences). |
| **M12** | `sidekick-extension.md` | Sidekick app extension: data + staged-action tools mapping to the existing `/api/agent/*` surface via an HMAC dispatcher. |
| **M13** | `agentic-surface.md` | **DECISION** — add-now (narrow `agentic.catalogProfile` feed) vs defer the agentic-commerce surface. |

---

## ⚠️ THE TWO DECISIONS A HUMAN MUST CONFIRM BEFORE BUILDING DEPENDENT PIECES

Both are recommendation-in-hand. Neither blocks the substrate pieces (R3.3/R3.2/R3.1) —
they gate the *independent* pieces (R3.5, M13). Confirm them before those pieces start,
not before the phase starts.

### DECISION A — Durable scheduler: **wire-DAG vs lean-on-Flow vs own-cron** (R3.5)

**Recommendation: A+ — a scoped hybrid, NOT any of the three pure options.**

The three-way framing has a false premise: **an absolute own-cron already ships and is
live** (`FlowSchedule` + `ScheduleService.claimDue()` CAS-claim + the `api.cron.tsx`
sweep firing `SCHEDULED` through `FlowRunnerService`, `schedule.service.ts:72-101`).
And the **durable-wait primitive** for *relative* per-entity waits is **already built,
tested, and DB-migrated** — `WorkflowEngineService.startRun/resumeRun` park a run as
`WorkflowRun.status='WAITING'` with `resumeAt`/`resumeNodeId`/`workflowJson`, indexed
`@@index([status, resumeAt])` (`workflow-engine.service.ts:404-443`). The *only* holes:
`resumeDueWorkflowRuns` is a comment not a function; `api.cron.tsx` has no resume sweep;
and nothing on the live authoring path ever creates a `WorkflowRun` (the linear runner
has no `DELAY` step).

**Why A+ over the pure options:**
- **Pure A (wire the full DAG engine as the live runner):** biggest blast radius —
  replaces the working linear runner and re-homes 9 live step kinds to harvest one
  feature (durable wait). Rejected; instead reuse the engine *only for the parked
  remainder*.
- **Pure B (lean on Shopify Flow):** loses self-containment/preview/versioning of
  generated timed modules. Spring-26 Flow gained a code editor + ShopifyQL but still has
  **no author-ownable per-entity durable "wait N days on *this* entity then continue"**
  our generator can emit and preview. Flow stays a best-effort notification sink
  (`emitFlowTriggerSafe`), not the engine.
- **Pure C (build a new own-cron):** duplicates the durable table + resume logic that
  already exists and is tested. The absolute-cron half of C already ships and is kept.

**A+ concretely:** (1) add a `DELAY` step kind to the flat-pin `flow.automation` schema +
linear runner; on a long delay it **parks the remaining steps** into a `WorkflowRun`
reusing the built durable machinery; (2) implement `resumeDueWorkflowRuns()` (CAS-claimed,
per-shop auth resolver); (3) add a resume sweep to `api.cron.tsx`; (4) **keep** the
absolute `FlowSchedule` cron for wall-clock recurrence. No Prisma migration (columns +
index already exist).

**Sub-decisions the human confirms alongside A+ (from R3.5 §8):**
- **Cron cadence** sets delay granularity — recommend ≤5 min.
- **Uninstall policy (F12):** on `app/uninstalled`, cancel that shop's `WAITING`
  `WorkflowRun`s so we don't resume into a dead shop — recommend **yes**.
- **v1 mode scope:** ship **`duration`-only** (covers dunning/loyalty/review sequences);
  defer `until`-mode `{{ref}}` (event-relative) to a follow-up.
- **DLQ + rate-limit tables stay unwired** (still zero-caller) — confirm they remain an
  explicit follow-up, not part of R3.5.

### DECISION B — Agentic surface: **add-now vs defer** (M13)

**Recommendation: ADD — but only the narrow, real `agentic.catalogProfile` feed; DEFER
the MCP/UCP stack.**

Ship exactly one new module type whose runtime is an **app-served read-only product
feed** — the *exact* shape the shipped `pos.extension` already uses (publish persists
config → an app route reads the active PUBLISHED version → an external consumer fetches
over HTTP; `pos-config.server.ts:53-70`). Everything that needs an unbuilt runtime — a
hosted Catalog/Cart/Checkout MCP endpoint, agent-profile registration, sponsored
products — is modeled in the vocabulary but gated `needs_runtime` and named in a
merchant-facing note (the same partial-reality pattern `admin.discountUi`/
`integration.httpSync` use). No MCP is faked.

**Why add (not defer entirely):** the strategic signal is strong and this is the one
Phase-#4 surface where a real runtime is *cheap* — we reuse the POS app-served model
end-to-end, ship *something that deploys day one* instead of another AUDIT no-op, with
zero composer resurrection and zero DB migration.

**Why not the full stack:** a hosted MCP endpoint / agent-profile registration /
sponsored products each need infrastructure we do not have (a public MCP server, Dev
Dashboard credentials, a revenue integration). Each is a new spec, not a sub-task.

**The single human call:** *is a product-data syndication feed the right first wedge, or
does the org want to wait for a hosted MCP endpoint so the first agentic module is "an
actual AI shopping endpoint" rather than "a feed an AI can crawl"?* If "feed is a fine
wedge" → build M13 as written. If "MCP or nothing" → **defer entirely** (do not ship a
feed-only surface, because it sets the expectation that we're "in agentic commerce" when
we're only doing syndication).

---

## RECOMMENDED BUILD ORDER

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  SUBSTRATE (must precede the flagship)                                │
   │                                                                        │
   │   1. R3.3  typed-data provisioning  ──┐                               │
   │      (wire ensureTypedStore into       │  both are the shared-record   │
   │       publish; schemaJson goes live)   ├─ substrate R3.1 consumes      │
   │                                        │                               │
   │   2. R3.2  blueprint co-deploy  ───────┘                               │
   │      (publishBlueprint → real caller + bundle-triangle GID resolve)   │
   └───────────────────────────────┬──────────────────────────────────────┘
                                   │
   ┌───────────────────────────────▼──────────────────────────────────────┐
   │   3. R3.1  COMPOSITES-AS-MANIFESTS (flagship)                         │
   │      sharedRecord envelope + binding-driven injection +               │
   │      per-backing provisioning pre-pass; generalizes R3.2's            │
   │      injectResolvedBundle; provisions DATA_STORE records via R3.3     │
   └───────────────────────────────────────────────────────────────────────┘

   ── INDEPENDENT PIECES (parallelizable; not on the flagship critical path) ──

   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │  4. R3.4  messaging.campaign │   │  5. M12  Sidekick extension  │
   │     (email/slack fan-out;    │   │     (data + staged-action    │
   │      SMS/push gated)         │   │      tools over /api/agent)  │
   └──────────────────────────────┘   └──────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────┐
   │  6. R3.5  durable scheduler  ── gated by DECISION A (recommend A+)     │
   │     (DELAY step + resumeDueWorkflowRuns + cron resume sweep)          │
   │     UNBLOCKS loyalty-accrual / subscription-advancement (R3.1 defers   │
   │     these to it) and cross-run messaging paging (R3.4 defers to it)   │
   └──────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────┐
   │  7. M13  agentic.catalogProfile  ── gated by DECISION B (recommend ADD)│
   │     (fully independent; narrow app-served feed)                      │
   └──────────────────────────────────────────────────────────────────────┘
```

### Rationale for the order

- **R3.3 first (substrate).** It flips a fully-built-but-dark validation/typed-form stack
  live with one additive `Base.dataModel` field + one publish-time provision call. R3.1's
  `loyalty-ledger` (`DATA_STORE`-backed) record *requires* `ensureTypedStore` to have a
  caller; wiring it here means the flagship's typed-store backing lands on real machinery
  instead of a caller-less writer. Smallest, lowest-risk, highest-leverage first move.
- **R3.2 second (substrate).** It turns the co-deploy facade (`publishBlueprint` has zero
  callers today) into a real "publish all N" that resolves the bundle triangle (SKU→GID,
  parent BAP, `$app:bundle_config`) at publish. R3.1's flagship *generalizes* R3.2's
  `injectResolvedBundle` into `injectResolvedRecord` and reuses its publish-order
  discipline — so R3.2's concrete bundle path must exist first for R3.1 to abstract over.
- **R3.1 third (flagship).** The largest piece and the one introducing the shared
  primitive (`sharedRecord` + `bindings` + a per-backing provisioning pre-pass). It sits
  on both substrates: it provisions `DATA_STORE` records through R3.3's `ensureTypedStore`
  and it generalizes R3.2's resolver/injection. Building it after both means it targets
  one stable, real seam instead of two half-wired ones. **It explicitly defers**
  loyalty-accrual and subscription-advancement to R3.5.
- **R3.4 + M12 in parallel (independent).** Neither is on the flagship critical path.
  R3.4 adds a first-class type (new discriminated-union variant + a sibling runner riding
  the three live trigger sites). M12 adds a declaration + an HMAC dispatcher over the
  existing `/api/agent/*` services. They touch disjoint files; two people can build them
  at once, any time after the phase starts. R3.4 *soft-depends* on R3.5 only for cross-run
  paging (its first cut sends one bounded batch and records `total`, honestly).
- **R3.5 sixth (gated by Decision A).** It is independent to *build* but it is the
  **unblocker** for the deferred halves of R3.1 (accrual/advancement) and R3.4 (paging).
  Sequencing it after the flagship means the flagship ships its real spine first and R3.5
  lights up the timed follow-ons. Confirm Decision A before starting it.
- **M13 last (gated by Decision B).** Fully independent — greenfield type, no shared
  runtime, no migration. Order-free; placed last only because it is decision-gated.

### Dependency summary

| Piece | Hard deps | Soft deps (reuse, not blockers) |
|---|---|---|
| R3.3 (typed data) | — | — |
| R3.2 (co-deploy) | — (reuses shipped `BundleProductService`/`PublishService`) | — |
| R3.1 (composites) | **R3.3** (`ensureTypedStore` caller for `DATA_STORE` records), **R3.2** (generalizes `injectResolvedBundle`, reuses publish-order) | — |
| R3.4 (messaging) | — (reuses shipped `EmailConnector`/`DataStore`/trigger sites) | **R3.5** (cross-run paging — deferred, not blocking) |
| M12 (Sidekick) | — (reuses `/api/agent/*` services) | — |
| R3.5 (scheduler) | **Decision A** | — |
| M13 (agentic) | **Decision B** | — |

**The unblock arrows (why R3.5 is scheduled even though it's independent to build):**
R3.1 §5c/§5d and R3.4 §8 both mark their timed halves (loyalty accrual, subscription
advancement, cross-run messaging paging) as **R3.5-dependent follow-ups**. R3.5 is the
single durable-background layer all three wait on. It is *not* a hard blocker for R3.1/R3.4
shipping their real spines — only for their deferred extensions.

---

## CROSS-PIECE CONTRACTS (shared types + seams the pieces reuse)

Change these once, coherently. Multiple pieces touch each.

### C1 — The shared-record / entity types (R3.1 owns; R3.2, R3.3 feed it)

R3.1 introduces `packages/core/src/composite-record.ts` with the load-bearing shapes
every composite shares:

- **`CompositeRecord`** = `{ ref, kind ∈ COMPOSITE_KINDS, backing ∈ RECORD_BACKINGS,
  dataModel?, entityMap? }`. `ref` is the blueprint-unique kebab key every member points
  at.
- **`RECORD_BACKINGS`** = `APP_METAFIELD | DATA_STORE | SHOPIFY_CONTRACT | LIVE_CART` —
  a **per-record** enum (not per-phase), so a bundle can be `APP_METAFIELD` while a ledger
  is `DATA_STORE` in the same blueprint. This is the seam that lets R3.1's per-backing
  provisioning dispatch coexist.
- **`MemberBinding`** = `{ memberRole, recordRef, bindingRole ∈ MEMBER_BINDING_ROLES,
  reads[], availabilitySource }`. `MEMBER_BINDING_ROLES` = `authoring | display |
  enforcement | attribution`.

**Contract:**
- `entityMap` (cross-surface reference table, e.g. component→BAP mapping) and `dataModel`
  (scalar fields) are **separate** structures — `dataModel` for scalars only, `entityMap`
  for cross-surface refs. Do not overload one for the other (R3.1 R-4).
- The `dataModel` inside a `CompositeRecord` is the **same `DataModelSchema`** R3.3 pins
  onto `Base` (below). A `DATA_STORE`-backed composite record provisions via R3.3's
  `ensureTypedStore` with that `dataModel`. **One schema type, two entry points.**

### C2 — `RecipeSpec.dataModel` on `Base` (R3.3 owns; R3.1 consumes)

R3.3 adds one additive optional field to the recipe `Base` (shared by all 21 variants,
zero per-variant churn):

```ts
// packages/core/src/data-model.ts — ModuleDataStoreSchema = { label, description?, key?, schema: DataModelSchema }
Base.extend({ …, dataModel: ModuleDataStoreSchema.optional() })
```

**Contract:** `DataModelSchema` (`{ fields: DataField[] }`) is already imported by
`recipe.ts:15` (used for `theme.section.config.fieldSchema`), so the addition costs zero
new imports. R3.1's `CompositeRecord.dataModel` reuses the *same* `DataModelSchema`.
R3.3's `provisionModuleDataStore(shopId, moduleId, spec)` and R3.1's
`resolveCompositeRecord` (for `DATA_STORE` backing) both funnel into the identical
`ensureTypedStore(shopId, key, { label, description, schemaJson })` writer — additive
merge (`mergeSchemaAdditively`), never drop/retype. **Do not write two typed-store
provisioning paths.**

### C3 — Publish-time GID resolution (R3.2 owns; R3.1 generalizes)

The only live cross-reference is the **bundle triangle**: a `functions.cartTransform`
member's `componentSkus` → resolved to real variant GIDs + parent BAP variant + stable
`bundleId`, injected into the `theme.section product-bundle` display member and the
checkout member *before* they compile.

**Contract:**
- R3.2 detects the triangle **structurally** (a member of type `functions.cartTransform`
  with `config.mode === 'BUNDLE'` + `config.bundles`), not via `links[]` — robust to the
  AI mislabeling links.
- R3.2 resolves via the shipped `BundleProductService` (`resolveComponents` →
  `ensureParentBundleProduct` → `resolveBundleWithPricing`), **never reimplemented**.
- R3.1 generalizes R3.2's `injectResolvedBundle(spec, bundle)` into
  `injectResolvedRecord(spec, binding, resolved)` driven by the `bindings` table, and
  keeps `injectResolvedBundle` as a **back-compat shim** delegating to the generalized
  form (R3.1 §3.6). R3.2's `checkout.block` widening (parent variant) must land *inside*
  the shim so both paths cover the same three member shapes.
- **Fail-loud on partial resolution.** A bundle where `< 2` SKUs resolve is a hard error,
  not a silent placeholder (R3.2 §5.2). Both pieces inherit this from `PublishService`'s
  "never report published when nothing wires" discipline.

### C4 — The `$app:bundle_config` dual-writer ordering (R3.2 + R3.1)

Two writers touch bundle config and must not fight:
`BundleProductService.activateCartTransform` writes `$app:bundle_config` (the metafield
the wasm reads); `PublishService.publish` for a cart-transform member writes the
`superapp.functions/fn_cartTransform` **metaobject** (a different object).

**Contract (identical for R3.2 co-deploy and R3.1's provisioning pre-pass):** call
`PublishService.publish(cartTransformSpec, …)` **first**, then
`activateCartTransform(buildBundleRuntimeConfig([resolvedRecord]))` — so the runtime
config with real GIDs is authoritative. This single ordering line is the highest-
consequence correctness point in both pieces (R3.2 §5.4 / RISK 1).

### C5 — The flat-pin seam (R3.4, M13, R3.5 all ride it)

Every new *type* or *step* lands on the flat-pin substrate (composer + `moduleSystemVersion`
pruned in a17a748): a Zod object flat-pinned onto `recipe.config`, surfaced to the LLM for
free via `zodToJsonSchema(RecipeSpecSchema)`, edited via the live `generate._index.tsx`
builder + `SchemaForm`, previewed deterministically by `PreviewService` (no AI preview HTML).

**Contract:**
- R3.4 pins `MessagingPackSchema` **as** `messaging.campaign.config` (the pack *is* the
  config body, like the `pricing`/`recommendation` packs).
- M13 adds no recipe type — it composes existing types through the agent services; its
  only schema is the `SidekickInvokeSchema` envelope + `ToolInputSchemas`.
- R3.5 adds a `DELAY` discriminated-union **member** to `flow.automation.config.steps`
  (additive; existing 9 step kinds untouched).
- M13 pins nothing new but **shares** the classify→generate→validate→publish pipeline;
  extract `generateModuleOptions()` and `publishModule()`/`publish-orchestrator.server.ts`
  as thin refactors so the agent route and Sidekick share one path (byte-identical JSON).

### C6 — The three live trigger sites (R3.4 + R3.5 both hook them)

`webhooks.tsx`, `api.cron.tsx`, and the run-now admin action are the three sites that
fire flows today. **Both R3.4 and R3.5 add work at `api.cron.tsx`** — R3.4 a
`MessagingRunnerService.runForTrigger('SCHEDULED', …)` pass after the flow drain; R3.5 a
`resumeDueWorkflowRuns` resume sweep after `claimDue()`. **Contract:** sequence these two
`api.cron.tsx` edits (they are additive blocks in the same handler); keep each in its own
try/catch so one failing sweep never 500s the whole cron tick.

### C7 — Registry/map totality (R3.4, M13-none, M13-agentic all bump N)

Adding a `RECIPE_SPEC_TYPES` member forces one new key in every total
`Record<ModuleType,…>` map (`MODULE_TYPE_TO_CATEGORY`, `_DEFAULT_REQUIRES`, `_TO_SURFACE`,
eligibility `REGISTRY`) — TS `never`-guards enforce totality, so a miss is a compile
error, not a runtime bug. **Contract:** R3.4 (`messaging.campaign`) and M13
(`agentic.catalogProfile`) each add exactly one key per map + one eligibility entry, and
each **bumps the "N types" count** in the eligibility audit test — that test encodes the
contract; update it deliberately. `messaging.campaign` reuses category `INTEGRATION`
(Decision D1 in R3.4 §8 — recommend reuse, avoids touching every `ModuleCategory`
exhaustiveness site); `agentic.catalogProfile` adds a new `AGENTIC` `CapabilitySurface`
+ `agentic_channel` `ShopifySurface` + `agentic-feed` `ExtensionRuntimeKind` (string-union
extensions, no consumer narrows on absence).

---

## PER-INCREMENT CHECKLIST

Each increment is **additive, independently testable, and committable green** — the
Phase #2/#3 discipline. Every increment ends with: `tsc --noEmit` clean, the named tests
green, and (where a schema changed) a back-compat fixture proving old recipes still
validate + render/compile byte-identical. Commit at each ✅.

### Increment 1 — R3.3 typed-data provisioning (substrate; do first)

- [ ] **1.1 Core schema.** Add `ModuleDataStoreSchema` + `ModuleDataStore` to
  `data-model.ts`; add optional `dataModel` to `Base` in `recipe.ts:105-109`; re-export
  from `index.ts`. **Gate:** `Base`-derived variant parses with + without `dataModel`;
  bad field name (`^[A-Za-z][A-Za-z0-9_]*$`) rejects; `RecipeService.parse` round-trips.
- [ ] **1.2 The seam.** New `provision-data-store.server.ts` —
  `provisionModuleDataStore(shopId, moduleId, spec)`: no-op when undeclared; else
  `ensureTypedStore(shopId, dm.key ?? 'module_<id>', { label, description, schemaJson:
  JSON.stringify(dm.schema) })`. Guard an explicit `dm.key` that collides with a
  `PREDEFINED_STORES` key (R-b). **Gate:** undefined/empty-fields → `null`, no call;
  declared → correct `ensureTypedStore` args; `schemaJson` round-trips through
  `parseDataModel`.
- [ ] **1.3 Publish call site.** In `api.publish.tsx` inside the existing `try`, after
  `publisher.publish(spec, target)` and before `markPublishedWithTransition`, guarded by
  `if (shopRow?.id && spec.dataModel)`; **non-fatal** (log via `logRequestOutcome`, never
  roll back a live deploy); log `DATA_STORE_PROVISIONED` on success. **Gate:** publish
  *with* `dataModel` invokes the seam + logs; *without* skips it; a gated
  (`ModuleNotPublishableError`) module never provisions; a provisioning throw still
  returns the success redirect.
- [ ] **1.4 Activation E2E.** After provisioning, `getStoreByKey` returns a store whose
  `schemaJson` `parseDataModel`s to the model; `createRecord` with an **invalid** payload
  throws `RecordValidationError` (proves validation went no-op → active); valid persists.
- [ ] **Gate (all green before commit):** `tsc --noEmit`; existing
  `data-store-provisioning.test.ts` unchanged/green; no Prisma migration (column exists).
- **Explicit follow-ups (do NOT build here):** F1 route the two untyped runtime
  auto-create paths (`module-capture.service.ts`, `storage.connector.ts`) through the
  typed writer; F2 merchant schema-editor UI; F3 register `SuperAppConnector`.
  **Decision confirmed at build:** ship **spec-carried schema only** (AI authors
  `dataModel`; merchant edits records, already live) — schedule the editor separately.

### Increment 2 — R3.2 blueprint co-deploy (substrate)

- [ ] **2.1 Result shape + injection widening.** In `blueprint.service.ts`: replace the
  `{published, failed}` result with `BlueprintPublishResult` (`published/failed/skipped/
  resolvedBundle`); widen `injectResolvedBundle` with a `checkout.block` branch
  (parent variant), keeping the `theme.section product-bundle` + `checkout.upsell`
  branches. **Gate:** `checkout.block` → `productVariantGid`/`offerTitle` set; existing
  branches regress-green (`blueprint-deployability.test.ts`); unrelated spec by-reference.
- [ ] **2.2 Resolver helper.** New private `resolveBundleForBlueprint(admin, cartTransformSpec)`
  → `resolveComponents` → `ensureParentBundleProduct` → `resolveBundleWithPricing`
  (all shipped; none reimplemented). Fail-loud on `< 2` resolved SKUs. **Gate:** happy
  path returns `ResolvedBundle`; `<2` throws (no `ensureParentBundleProduct`); no bundles
  → `null`; pricing threads through.
- [ ] **2.3 `publishBlueprint` body rewrite.** Materialize members → resolve triangle
  **before** publishing dependents → publish in dependency order (source first) →
  inject → publish theme/checkout. Enforce the **C4 ordering**: `publisher.publish` then
  `activateCartTransform(buildBundleRuntimeConfig([bundle]))` for the cart-transform
  member. Non-atomic/retryable per member. **Gate:** triangle order (cart-transform
  first, dependents get injected real GIDs); `activateCartTransform` called once, after,
  with real `parentVariantId`; resolution failure → source `failed`, dependents
  `skipped`, no dependent publish; partial member failure stays DRAFT; non-bundle
  blueprint publishes both, no injection; idempotent re-run.
- [ ] **2.4 Route + entry points.** New `api.blueprints.$recipeId.publish.tsx` (auth →
  flag gate `isBlueprintsEnabled()` → resolve default `themeId` → `publishBlueprint` →
  return `BlueprintPublishResult`, log `MODULE_PUBLISHED` per member). Add "Publish all N"
  affordance in `generate._index.tsx` (post-`finishBlueprint`) and the
  `modules.$moduleId.tsx` sibling banner. **Gate:** flag off → 403; unknown recipe →
  error; valid → JSON + one log per published member.
- [ ] **Gate:** run `blueprint-co-deploy.test.ts` + `blueprint-deployability.test.ts` +
  `blueprints.test.ts` green; `BLUEPRINTS_ENABLED` dark in prod (identical risk posture
  to the generation half). Update `docs/blueprints.md` co-deploy section (honesty).
- **Decision confirmed at build (R3.2 §8 DECISION 1):** default `themeId` for co-deploy —
  recommend **(b) one theme picker in the "Publish all N" UI, passed to every theme
  member** (explicit, matches merchant mental model, no silent publish to live theme).
- **Explicit follow-ups:** declarative cross-ref graph (arbitrary composite wiring) — the
  §4 follow-up that R3.1 begins; per-member `PublishPolicyService`/feature-flag parity
  with single publish (first cut relies on the shared `PublishService` gate).

### Increment 3 — R3.1 composites-as-manifests (flagship)

> Builds on Inc 1 (`ensureTypedStore` caller live) + Inc 2 (`injectResolvedBundle` +
> publish-order to generalize). Additive: a blueprint with no `sharedRecords` is
> byte-for-byte today's flat bag.

- [ ] **3.1 Core shapes.** New `composite-record.ts` (`CompositeRecordSchema`,
  `MemberBindingSchema`, `COMPOSITE_KINDS`, `RECORD_BACKINGS`, `MEMBER_BINDING_ROLES` —
  C1); re-export from `index.ts`. **Gate:** accepts the §2d bundler example; `.strict()`
  rejects unknown keys; `ref` regex rejects non-kebab.
- [ ] **3.2 Blueprint extension + coherence.** Add optional `sharedRecords[]`/`bindings[]`
  to `RecipeBlueprintSchema`; extend `validateBlueprintCoherence`: every
  `binding.recordRef` ∈ records; every `memberRole` ∈ members; each `product-bundle`
  record has ≥1 `enforcement` binding on a Function member; a `display` binding with
  `availabilitySource:'placeholder'` on a `product-bundle` → **warning** (surfaces the
  Fast Bundle Sold-Out bug). **Gate:** each coherence rule fires; absent `sharedRecords`
  → `ok:true` (back-compat).
- [ ] **3.3 Resolver + generalized injection.** New `resolve-record.server.ts` —
  `resolveCompositeRecord(admin, record)` dispatching on `kind`/`backing`
  (`product-bundle`/`APP_METAFIELD` wraps `BundleProductService`; `cart-drawer`/
  `LIVE_CART` no-op; `loyalty-ledger`/`DATA_STORE` calls **R3.3's `ensureTypedStore`**).
  Generalize `injectResolvedBundle` → `injectResolvedRecord(spec, binding, resolved)`;
  keep `injectResolvedBundle` as a shim (C3). **Gate:** `product-bundle` calls the
  bundle chain in order + stamps `bindingKey`; `LIVE_CART` makes no admin calls;
  `DATA_STORE` invokes `ensureTypedStore` (asserts the dead writer is now live via the
  composite path); a no-binding member returns by identity.
- [ ] **3.4 Persistence + provisioning pre-pass.** Add nullable `Recipe.compositeJson`
  (additive migration, one column); `createDraft` persists `sharedRecords`/`bindings`;
  `publishBlueprint` gains a **record-provisioning pre-pass** before the member loop
  (per `sharedRecord`: `resolveCompositeRecord`, then inject into bound members via the
  `bindings` table), fail-closed on the record (no member publishes if provisioning
  fails), gated per `backing`. **Gate:** round-trip persists/reloads `compositeJson`;
  pre-pass runs before member publish; provisioning failure → zero members PUBLISHED;
  member failure → that member DRAFT, others publish.
- [ ] **3.5 Generation.** Teach the blueprint prompt to emit `sharedRecords`+`bindings`
  for the four `COMPOSITE_KINDS`, with **backing pinned per kind** (not model-chosen):
  product-bundle→`APP_METAFIELD`, cart-drawer→`LIVE_CART`, loyalty-ledger→`DATA_STORE`,
  subscription-contract→`SHOPIFY_CONTRACT`. Members leave record-derived fields as
  placeholders (filled at publish). Re-run `validateBlueprintCoherence` at generation;
  re-prompt once on failure. Non-composite blueprints omit `sharedRecords` (zero
  regression). **Gate:** "bundle these 3, 20% off" → coherent blueprint (1 record + 3
  bound members, snapshot shape).
- [ ] **3.6 Flagship anti-drift assertion.** **Display==enforcement invariant:** for the
  §2d bundler the price the display member computes from the record equals the price the
  `discountRules`/`cartTransform` member enforces from the *same* record. This is the
  test the whole piece exists for. **Gate:** the invariant holds; re-run
  `validateBlueprintCoherence` at `publishBlueprint` entry (cheap, pure) fail-closes a
  hand-edited broken binding.
- **Decision confirmed at build (R3.1 §8 DECISION):** per-record `backing` — ship
  **product-bundle on `APP_METAFIELD`** (reuses the entirely shipped, admin-verified
  bundle path; zero new runtime) and **loyalty-ledger on `DATA_STORE`** (where the typed
  store is the natural home and wiring `ensureTypedStore` is required regardless). The
  `RecordBacking` enum is per-record so the two coexist — confirm this split rather than
  forcing all four composites onto one backing.
- **Explicit follow-ups (marked, not faked — R3.1 §5c/§5d):** loyalty **accrual** engine
  (order-webhook → credit → propagate) and subscription **contract-mirror + cron
  advancement** both need R3.5's durable background layer. Ship the ledger/contract as
  **record + real display/redeem surfaces + typed store only**; do NOT claim automated
  earning or dunning. This is the R-1 scope-creep fence — do not let ledger/contract
  kinds pull the scheduler into R3.1's scope.

### Increment 4 — R3.4 messaging.campaign (independent; parallelizable)

- [ ] **4.1 Enums + type registration.** Add `MESSAGING_*` enums + `MESSAGING_LIMITS` to
  `allowed-values.ts`; add `'messaging.campaign'` to `RECIPE_SPEC_TYPES` + the four total
  maps + `MODULE_TYPE_ORDER` (C7). **Gate:** map-totality; category = `INTEGRATION`;
  surface = `marketing_analytics`.
- [ ] **4.2 Pack + variant.** New `messaging.pack.ts` (`MessagingPackSchema` reusing
  `AudiencePackSchema`/`RuleEnginePackSchema`); add the `messaging.campaign` variant with
  `config: MessagingPackSchema` (flat-pin, C5). **Gate:** valid broadcast/back-in-stock;
  rejects email template w/o subject, `data_store` w/o `storeKey`, primary channel w/o
  template, `literal` w/o recipients; other 21 types still parse.
- [ ] **4.3 Eligibility + compiler.** Add `REGISTRY['messaging.campaign']`
  (`runtime:'app-proxy'`, `runtimeShipped:true`); new `compileMessagingCampaign` →
  one `METAOBJECT_UPSERT` (deployable ⇒ non-AUDIT op, R0.1); wire the compiler case
  (no bare-AUDIT fallthrough). **Gate:** eligibility audit N bumped; compiler emits the
  op, not AUDIT.
- [ ] **4.4 The runner (make-or-break).** New `MessagingRunnerService` mirroring
  `FlowRunnerService`: trigger match → **channel gate** (`MESSAGING_CHANNELS_SHIPPED` —
  sms/push throw loudly, never fake) → resolve audience (`data_store`/`event_recipient`/
  `literal`) → bounded fan-out (`batchSize` ≤ 500) with consent + rule-engine filter →
  `sendOne` via the **same** `EmailConnector`/`SlackConnector.invoke` the live
  `SEND_EMAIL_NOTIFICATION` step makes. **Gate:** trigger match table; N records → N
  invokes with merge-vars; consent/ruleEngine skip; `batchSize` caps + records `total`
  (paging gap visible, not truncated-as-success); `channel:'sms'` throws with **no**
  invoke; connector `{ok:false}` → per-recipient FAILED, run continues.
- [ ] **4.5 Trigger wiring + admin action.** Invoke `MessagingRunnerService.runForTrigger`
  as a **sibling** right after the flow runner at `webhooks.tsx` + `api.cron.tsx`
  (sequence the cron edit with R3.5's — C6); new `api.messaging.send.tsx` ("Send now"/
  "Send test", PUBLISHED-guarded). **No change to `flow.automation`.** **Gate:**
  "Send now" throws on DRAFT; "Send test" forces literal single-recipient.
- [ ] **4.6 Preview + builder.** Deterministic `messagingCampaignPreview` (channel +
  audience summary + rendered template with sample merge vars); ensure the type surfaces
  in `generate._index.tsx` + intent examples. **Gate:** preview renders deterministically.
- **Decisions confirmed at build (R3.4 §8):** D1 category = **reuse `INTEGRATION`**; D2
  runner = **sibling `MessagingRunnerService`** (not a `SEND_CAMPAIGN` flow step — keeps
  messaging first-class, `flow.automation` untouched); D3 SMS/push = **model-now,
  gate-now** (schema accepts, `needs_runtime` gate, zero migration when a connector lands).
- **Biggest risk / explicit follow-up:** **cross-run paging + dedupe** needs R3.5. First
  cut sends one bounded batch, persists `total`+`offset`, re-fires via `SCHEDULED`. **Do
  not claim "sends to your whole list" until paging + a `sent` marker on subscriber
  records land.** Also: PII in step logs → log counts + masked addresses, not raw.

### Increment 5 — M12 Sidekick extension (independent; parallelizable)

- [ ] **5.1 Declaration.** New `extensions/superapp-sidekick/shopify.extension.toml`
  (`type = "sidekick"`, `tools = "tools.json"`, fresh v4 uid, stable-host `runtime_url`)
  + `tools.json` (2 data + 3 staged-action tools); append `[extensions_summary]` to
  `shopify.app.toml`. **Gate (first real gate):** `shopify app config validate` /
  `deploy --dry-run` accepts them — this validates DECISION #1 field names.
- [ ] **5.2 Contract + parity.** New `sidekick-tools.contract.ts` (`SidekickToolName`,
  `ToolInputSchemas`, `SidekickInvokeSchema`). **Gate:** `sidekick-tools-json-parity.test.ts`
  asserts every `tools.json` name ∈ `SidekickToolName` and required-props match (prevents
  declaration/enforcement drift — the classic footgun).
- [ ] **5.3 Prisma model.** Add `SidekickStagedAction` (+ `Shop` relation), additive
  migration. **Gate:** stage writes row with `stagedSpec`+`expiresAt`; confirm on STAGED
  executes → EXECUTED; confirm on EXPIRED/EXECUTED rejected.
- [ ] **5.4 HMAC route + dispatcher.** New `api.sidekick.invoke.tsx` (structural copy of
  `api.flow.action.tsx`: raw body, `x-shopify-hmac-sha256`, `verifySidekickHmac` reusing
  Flow's impl, idempotency via `checkAndMarkWebhookEvent`); new
  `sidekick-dispatcher.server.ts` routing table. Gate behind `SIDEKICK_EXTENSION_ENABLED`
  (default off). **Gate:** valid sig passes, tampered → 401; unknown shop → 404; invalid
  input → 400.
- [ ] **5.5 Data tools.** `dataListModules` (scoped `prisma.module.findMany`); new
  `getModulePerformanceSummary` (aggregates the existing `getModuleMetricsDaily`) + a
  reusable `GET /api/agent/modules/:id/performance` route. **Honesty:** return
  `{available:false}` where ingestion isn't wired — never fabricate zeros. **Gate:**
  aggregation math; `available:false` when no metrics.
- [ ] **5.6 Action tools (stage/confirm).** Extract `generateModuleOptions()` +
  `publishModule()`/`publish-orchestrator.server.ts` as thin refactors (agent route +
  Sidekick share one path); stage phase runs read-only preflight so the card warns early;
  confirm phase executes via `ModuleService.createDraft`/`createNewVersion`/orchestrator.
  **Gate:** stage_create → STAGED w/ preview → confirm → one `createDraft`, idempotent;
  publish blocked-by-plan → card `reasons`; theme module w/o themeId → `needs:themeId`;
  `agent-publish-wrapper-parity.test.ts` proves the refactored route returns identical JSON.
- **Decisions confirmed at build (M12 §8):** DECISION #1 (blocking, do first) — verify
  the live Sidekick contract (toml field names, HMAC-vs-OAuth signing, payload field
  names, card HTML-vs-text) against `shopify app generate extension`; only three seams
  change if reality differs (toml names, `verifySidekickHmac`, `SidekickInvokeSchema`).
  DECISION #2 — how publish executes without a merchant session: recommend the
  offline-token admin client + `publish-orchestrator` refactor; **if unsure, ship the
  `Job{type:PUBLISH, source:'sidekick'}` enqueue fallback first** (fully real today) and
  make the synchronous orchestrator a fast-follow rather than block M12 on the refactor.

### Increment 6 — R3.5 durable scheduler (gated by DECISION A; recommend A+)

> **Confirm DECISION A before starting.** Everything below assumes A+ (scoped hybrid).
> Unblocks R3.1's loyalty-accrual/subscription-advancement and R3.4's cross-run paging.

- [ ] **6.1 `DELAY` step schema.** Add the `DELAY` discriminated-union member to
  `flow.automation.config.steps` (duration mode 60s…90d, or until mode ISO/`{{ref}}`;
  v1 = **duration-only** per Decision A). Extend `FlowStep` runner type. **Gate:**
  duration parses, out-of-bounds rejects; existing 9-step spec still parses.
- [ ] **6.2 Park helper.** New `flow-park.ts` — `computeResumeAt(step, event)` +
  `parkRemainderAsWorkflow(...)` (emits a `wait` head with `inlineThresholdMs:0`, chains
  remainder steps to `end`, snapshots `event` into `variables`); shared
  `remainingStepsToNodes()` reusing `stepToAction`. **Gate:** resumeAt duration/until;
  park shape correct.
- [ ] **6.3 Runner park.** In `executeFlow`, on `DELAY`: short wait → bounded inline
  sleep; long wait → `parkRemainderAsWorkflow` + `WorkflowEngineService.startRun` (returns
  WAITING) + `return`; last-step delay → no park; idempotent `runId`
  (`flowpark_${jobId}_${stepIdx}`, swallow `P2002`); missing `shopId` → fail loudly.
  **Gate:** `[email, DELAY 3d, tag]` → email inline, WAITING row w/ remainder, tag NOT
  inline; short delay inline; redelivery no double-park.
- [ ] **6.4 Resume sweep.** Implement `resumeDueWorkflowRuns` on `WorkflowEngineService`
  (CAS-claim `WAITING`→`RUNNING` guarded by `resumeAt`, per-tenant auth resolver, bounded
  `limit`); add `buildShopAuthResolver(tenantId)` (offline token from `ConnectorToken`/
  `Shop.accessToken`); add the sweep to `api.cron.tsx` after `claimDue()` (own try/catch;
  sequence with R3.4's cron edit — C6). **Gate:** picks due, skips future; two concurrent
  sweeps resume once (CAS); chained DELAY re-parks with later `resumeAt`; `MAX_RESUMES` →
  FAILED; sweep failure caught (warn), no 500.
- [ ] **6.5 Uninstall + builder + tile.** F12: `app/uninstalled` cancels the shop's
  `WAITING` runs (Decision A sub-decision — recommend yes); add a "Delay" step to
  `FlowBuilder.tsx` (duration picker) + a "Waiting (N)" count to `flows._index.tsx`
  (closes the §9b overclaim honestly). **Gate:** uninstall cancels WAITING; builder emits
  the flat-pin `DELAY` shape.
- [ ] **Gate:** no Prisma migration (columns + `[status, resumeAt]` index exist);
  `workflow-durable-wait.test.ts`, `workflow-safety.test.ts`, `flow-compile.test.ts`
  stay green.
- **Decision A sub-decisions confirmed at build:** cron cadence ≤5 min (sets granularity);
  duration-only v1 (defer `until`-mode `{{ref}}`); DLQ + rate-limit tables stay unwired
  (explicit follow-up).
- **Biggest risk (R1):** auth at resume time — a parked remainder loses the request-scoped
  admin; Shopify-touching steps resume via the **offline** token through `shopify.connector`.
  If the token is missing/expired, those steps fail — mitigated by `buildShopAuthResolver`
  + the uninstall-cancel (F12).

### Increment 7 — M13 agentic.catalogProfile (gated by DECISION B; recommend ADD)

> **Confirm DECISION B before starting.** If "MCP or nothing," skip this increment
> entirely (do not ship a feed-only surface). Everything below assumes ADD.

- [ ] **7.1 Core types (additive, totality-enforced).** Add `'agentic.catalogProfile'` to
  `RECIPE_SPEC_TYPES` + the four total maps + `MODULE_TYPE_ORDER` (C7); add `AGENTIC`
  `CapabilitySurface` (+ `inferSurface` branch), `agentic_channel` `ShopifySurface`,
  `agentic-feed` `ExtensionRuntimeKind`; add `AGENTIC_*` config enums + limits; add a
  `CLASSIFICATION_RULES` rule (keywords: ai channel/agentic/chatgpt shopping/product
  feed/…). **Gate:** map-totality (a missing key fails `tsc`); classification routes the
  keywords.
- [ ] **7.2 Recipe variant + eligibility.** Add the `agentic.catalogProfile` variant
  (flat `config`: `artifacts`, `source`, `attributeMap`, `disclosures`, `feedHandle`);
  add the `REGISTRY` entry (`runtime:'agentic-feed'`, `runtimeShipped:true`,
  `requiredScopes:['read_products']`, note naming the deferred trio). **Gate:** §2.4
  example parses; bad `feedHandle`/over-limit/non-GID reject; eligibility →
  `runtimeShipped:true`, `classifyModulePublishability` → `deployable`.
- [ ] **7.3 Compiler.** New `compileAgenticCatalogProfile` — no Shopify write (persisting
  config *is* the deploy, like `pos.extension`); emit an `AUDIT compile.agentic.catalogProfile`
  op + an `agentic.deferred-artifacts` op naming any mcp/agent-profile/sponsored request
  (honesty). No new `DeployOperation` kind. **Gate:** compiler emits the AUDIT op; a
  `mcp-endpoint` request additionally yields the deferred-artifacts op.
- [ ] **7.4 Feed runtime (make-or-break — the real work).** New `feed.server.ts`
  (`readPublishedAgenticFeed`, mirrors `pos-config.server.ts`; null when unconfigured, no
  placeholder); new public loader `agentic.$shop.$handle.feed[.]json.tsx` (unauthenticated
  read-only, product-data-only projection, `attributeMap` resolution, disclosures
  appended, `Cache-Control: max-age=900` + CORS, wrapped in `withApiLogging`). **Gate:**
  reader returns only the PUBLISHED module, `null` for unknown handle; route unconfigured
  → 404 `{configured:false}`; configured → items with mapped attributes + disclosures +
  cache/CORS headers; unknown metafield → attribute omitted (not `null`); **no PII leaks**
  (product fields only).
- [ ] **7.5 Preview.** Deterministic summary card ("Feed: N products · M attributes · K
  disclosures") keyed on `spec.type`. **Gate:** summary computed from config, no AI.
- **Decision B confirmed at build:** ADD the narrow feed; the three `needs_runtime`
  artifacts (`mcp-endpoint`/`agent-profile`/`sponsored-products`) are modeled but a module
  requesting them publishes only the real artifacts + a merchant note — never silently
  "published."
- **Risks:** R1 large-catalog `source:'all'` read cost (bounded pagination + cache;
  nightly precompute is a follow-up); R2 free-form `attributeMap.from` (best-effort, omit
  unresolved; Dev-MCP grounding is a follow-up).

---

## RISKS THAT SPAN PIECES

**X-1 · The two decisions are forks, not details (HIGHEST).** Decision A (scheduler) and
Decision B (agentic) each change *whether and how* a whole increment gets built. Neither
blocks the substrate/flagship, but R3.5 and M13 must not start until confirmed. Mitigation
baked in: both come with a recommendation and both are structured so the rest of the phase
is decision-independent — R3.1/R3.4 ship their real spines regardless, marking the
timed/paging follow-ons as R3.5-dependent rather than building against an unconfirmed
scheduler.

**X-2 · The typed-store writer has two would-be entry points — unify them (HIGH; R3.3 +
R3.1).** R3.3 wires `ensureTypedStore` from the publish route; R3.1's
`resolveCompositeRecord` wires it again for `DATA_STORE`-backed records. If these diverge
(different key convention, different `schemaJson` serialization, one skips the additive
merge), a composite ledger and a plain module store drift. → **One writer, one call
signature** (C2). Build R3.3 first so R3.1 calls the *same* `provisionModuleDataStore`/
`ensureTypedStore` path, not a parallel one. The additive-merge guarantee
(`mergeSchemaAdditively`, existing fields win) must hold on both paths.

**X-3 · The `$app:bundle_config` dual-writer ordering (HIGH; R3.2 + R3.1).** Both
co-deploy (R3.2) and the composite provisioning pre-pass (R3.1) write the bundle runtime
metafield *and* publish a cart-transform member that writes a different metaobject. Wrong
order → the wasm reads stale/placeholder config and the bundle silently misbehaves at
checkout. → C4 pins the sequence (`publish` then `activateCartTransform`); it is the
highest-consequence correctness point in both pieces and the reviewer should scrutinize
both call sites — they must be identical.

**X-4 · Two composites need the unbuilt scheduler — do not let them pull it into scope
(HIGH; R3.1 R-1).** loyalty-accrual and subscription-advancement both need R3.5's durable
layer. If R3.1 tries to ship them "fully," it silently reimplements a scheduler or fakes a
cron. → R3.1 ships ledger/contract as **record + real display/redeem surfaces + typed
store only**, marks accrual/advancement R3.5-dependent, and ships product-bundle +
cart-drawer fully. R3.5 (Inc 6) then lights up the timed halves. This is a scope fence,
enforced by the flagship's own §5c/§5d honesty discipline.

**X-5 · `api.cron.tsx` is a shared, additive-edit surface (MED; R3.4 + R3.5).** R3.4 adds
a `SCHEDULED` messaging pass; R3.5 adds a resume sweep. Parallel edits to the same handler
conflict. → C6: sequence the two edits, each in its own try/catch so one failing sweep
never 500s the tick. Same applies to `webhooks.tsx` (R3.4 sibling runner) but that edit is
R3.4-only.

**X-6 · Registry/map totality bumps + the eligibility audit "N" (MED; R3.4 + M13).** Both
new types add keys to four total maps + one eligibility entry and **must bump the audit
test's type count**. TS `never`-guards catch a missed map key at compile; the audit test's
N is the one thing TS *won't* catch. → Update the audit N deliberately in each increment;
treat it as the contract, not a nuisance.

**X-7 · Two-enforcement-members-one-price double-apply (MED; R3.1 R-2).** The bundler has
*both* a cart-transform and a discount member; pricing already rides the
`$app:bundle_config` metafield the cart-transform reads. The separate `discountRules`
member must not double-apply. → The record is the single source; R3.1 test 3.6 asserts one
effective price; prefer carrying the discount inside the cart-transform merge and use
`discountRules` only for code-stackable discounts.

**X-8 · Bounded fan-out / paging honesty (MED; R3.4).** The messaging runner sends one
bounded batch per run; a large list needs cross-run paging that depends on R3.5. → First
cut records `total`+`offset` so the shortfall is **visible, not truncated-as-success**;
"sends to your whole list" is not claimed until paging + a `sent` dedupe marker land. This
is the make-or-break honesty line for R3.4.

**X-9 · Contract-drift on external surfaces verified only at build (MED; M12 + M13).**
M12's Sidekick toml/HMAC/payload field names and M13's Sidekick-adjacent assumptions are
taken from research + analogy and must be verified against the live CLI/spec at build
(M12 DECISION #1). → Both are structured so only a few seams change if reality differs;
gate each on `shopify app config validate` / `deploy --dry-run` as the first real check.

---

## EXECUTIVE SUMMARY

**The two decisions (confirm before the pieces they gate):**

1. **Durable scheduler — wire-DAG vs lean-on-Flow vs own-cron (R3.5).**
   **Recommend A+, a scoped hybrid**, because the framing is a false trichotomy: an
   absolute own-cron already ships and the durable-wait park/resume primitive is already
   built, tested, and DB-migrated — the only holes are a missing `resumeDueWorkflowRuns`
   function, a missing cron resume sweep, and no `DELAY` step on the live authoring path.
   Pure A (wire the whole DAG engine) has the biggest blast radius; pure B (lean on Flow)
   loses self-containment/preview/versioning of generated timed modules (Spring-26 Flow
   still has no author-ownable per-entity durable wait); pure C duplicates a table+logic
   that already exist. A+ adds a `DELAY` step that parks the remainder into the existing
   `WorkflowRun`, implements the resume sweep, and keeps the absolute cron. Sub-decisions:
   cron cadence ≤5 min, cancel WAITING runs on uninstall, duration-only v1, DLQ/rate-limit
   stay unwired.

2. **Agentic surface — add-now vs defer (M13).**
   **Recommend ADD the narrow `agentic.catalogProfile` feed; DEFER the MCP/UCP stack.**
   It reuses the shipped `pos.extension` app-served model end-to-end (publish persists
   config → an app route serves the active PUBLISHED version → an AI crawler fetches), so
   it ships a *real runtime day one* instead of another AUDIT no-op, with zero composer
   resurrection and zero migration. The unbuilt runtimes (hosted MCP endpoint, agent-profile
   registration, sponsored products) are modeled but gated `needs_runtime` and named in a
   merchant note — never faked. The single call: if the org wants "MCP or nothing," defer
   entirely rather than ship a feed-only surface that overstates our agentic position.

**Build order:** (1) **R3.3** typed-data provisioning + (2) **R3.2** blueprint co-deploy —
the two substrate pieces the flagship needs — then (3) **R3.1** composites-as-manifests
(the flagship, which provisions `DATA_STORE` records via R3.3 and generalizes R3.2's
bundle resolver/injection). (4) **R3.4** messaging and (5) **M12** Sidekick are independent
and parallelizable. (6) **R3.5** scheduler is independent to build but is the unblocker for
R3.1's accrual/advancement and R3.4's paging follow-ons — gated by Decision A. (7) **M13**
agentic is fully independent — gated by Decision B.

**Top 3 risks:** (1) **The two decision forks themselves** — A and B each change whether/how
a whole increment is built; confirm before R3.5 and M13 start (mitigated: substrate +
flagship are decision-independent). (2) **The typed-store writer's two entry points must be
one** — R3.3 (publish route) and R3.1 (`DATA_STORE` composite record) both call
`ensureTypedStore`; a divergence in key/serialization/merge drifts composite ledgers from
plain module stores, so build R3.3 first and have R3.1 reuse the *same* path. (3) **The
`$app:bundle_config` dual-writer ordering** — co-deploy (R3.2) and the composite
provisioning pre-pass (R3.1) both must sequence `PublishService.publish` **before**
`activateCartTransform`, or the wasm reads placeholder config and the bundle silently
misbehaves at checkout; the two call sites must be byte-identical.

**Human decisions needed before implementation:** (a) **Decision A** scheduler strategy
(recommend A+) — gates R3.5; (b) **Decision B** agentic add-vs-defer (recommend ADD narrow
feed) — gates M13; plus the per-piece confirmations folded into their increments: R3.1
per-record backing split (metafield for bundle, DATA_STORE for ledger), R3.2 co-deploy
theme-picker UX, R3.3 spec-carried-schema-only, R3.4 category=INTEGRATION + sibling-runner
+ model-now-gate-now, M12 Sidekick live-contract verification + publish-execution
(offline-admin vs Job-enqueue fallback).
