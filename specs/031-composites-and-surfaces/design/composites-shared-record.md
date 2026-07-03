# R3.1 — Composites as Manifests over a Shared Record

**Phase #4 · Piece 1 (flagship).** Model the four irreducible composites (product
bundle, cart-drawer, loyalty ledger, subscription contract) as **one authoritative
record + N thin render surfaces + a checkout-time enforcement Function**, all
referencing the same entity id.

Worked example throughout: the **BUNDLER** — PDP `theme.section` builder +
`functions.cartTransform` + `functions.discountRules`, all bound to one bundle
record via a shared component→BAP mapping + pricing-tier contract.

> **Substrate constraint (honored).** The control-pack *composer* and
> `moduleSystemVersion` were pruned (a17a748). The authoring path is
> **flat-pin `RecipeSpec.config` + the live `generate._index.tsx` builder +
> `SchemaForm`**. This spec does **not** resurrect the composer. It adds a
> shared-record primitive *alongside* the existing flat blueprint, reusing the
> already-real `Recipe`/`Module` grouping, `BundleProductService`, and the
> shipped `cartTransform`/`discountRules` Functions.

---

## 1. Current state (file:line)

### 1a. What exists and is real (build ON this)

| Capability | Evidence | State |
|---|---|---|
| **Blueprint = named group of flat `RecipeSpec` members** | `packages/core/src/recipe-blueprint.ts:35-41` (`RecipeBlueprintSchema` = `{name, summary, modules[], links?}`); each `modules[].recipe` is a full `RecipeSpec` | live behind `BLUEPRINTS_ENABLED` (generation half only) |
| **Blueprint persistence reuses `Recipe` row** | `apps/web/app/services/blueprints/blueprint.service.ts:61-89` (`createDraft` → one `Recipe` + N `Module`s linked by `recipeId`) | live |
| **`Recipe`/`Module`/`ModuleVersion` grouping** | `apps/web/prisma/schema.prisma:58-101` (`Module.recipeId → Recipe.id`); `ModuleVersion.specJson` holds the `RecipeSpec` | live |
| **Bundle wiring at publish** | `apps/web/app/services/bundles/bundle-product.service.ts` — resolves component SKUs→variant GIDs, ensures parent BAP product, activates cart-transform, writes `$app:bundle_config` metafield (`:279-312`) | live (admin-verified) |
| **`injectResolvedBundle` cross-member fan-out** | `blueprint.service.ts:25-43` — stamps a `ResolvedBundle` into `theme.section(kind:product-bundle)` **and** `checkout.upsell` members | **built, test-only caller** |
| **Pricing lowered into cartTransform runtime** | `bundle-product.service.ts:127-141` (`resolveBundleWithPricing` → `lowerPricingToCartTransform`); config written to `$app:bundle_config` (`:279-296`) | live |
| **Shipped Functions** | `functions.cartTransform` (`recipe.ts:284-303`), `functions.discountRules` (`recipe.ts:203-...`); compiler cases at `apps/web/app/services/recipes/compiler/index.ts:27,35` | live wasm handles |
| **Typed data-model primitive** | `packages/core/src/data-model.ts` (`DataModelSchema`, `parseDataModel`, `validateRecord`); `DataStore.schemaJson` (`schema.prisma:546-558`) | schema live; **writer has no publish caller** (M8) |
| **`platform.extensionBlueprint` type** | `recipe.ts:553-561` (config = `{surface, goal, suggestedFiles}`); compiler AUDIT-only (`compiler/index.ts:58`) | placeholder / AUDIT |

### 1b. The gap (what a flat blueprint CANNOT express — Fast Bundle `mapping_note`)

`recipe-blueprint.ts` gives us a **bag of independent `RecipeSpec`s with prose
links** (`BlueprintLinkSchema:28-33` is explicitly *"not auto-wired yet"*). It has
no notion of:

1. **A single authoritative record** the members share. Today the bundle identity
   lives implicitly, re-derived at publish by `bundleIdFromTitle`
   (`bundle-product.service.ts:83-90`) and injected member-by-member. The three
   surfaces can drift (the classic *display ≠ enforcement* bundler failure, and the
   Fast Bundle "Sold Out reads the dummy BAP" bug — `fast-bundle.md:98,109,128`).
2. **A shared data contract** — component→BAP mapping + pricing tiers authored
   **once** and consumed by PDP preview (client calc), cart-transform (merge), and
   discount (price). Today pricing is pinned on the `functions.cartTransform` member
   and *separately* would need re-pinning on the `discountRules` member.
3. **Conditional extension emission by presentation mode** (single-BAP / multi-BAP /
   cart-transform — `fast-bundle.md:71-74,127`): the *set of members* must branch on
   one merchant knob. A flat blueprint has a fixed member list.
4. **Inventory-source correctness** — the display surface's availability must bind to
   **real component inventory**, not the placeholder (`fast-bundle.md:128`).

The surface-matrix names this exactly: *"a single authoritative record (deal / cart /
ledger / contract) + multiple thin render surfaces + a background/enforcement layer …
what it needs is (a) a shared-state provisioning primitive that all member surfaces
read, and (b) a checkout-time enforcement member (Function) that reproduces what the
storefront displayed"* (`surface-matrix.md:97`).

---

## 2. Target shape (exact types + example)

### 2a. Core idea

Add a **`sharedRecord`** envelope to `RecipeBlueprint` — an authoritative,
schema-typed entity that all members reference by a single `recordRef`. The blueprint
becomes: **one record + N members that bind to fields of that record**. Members stay
normal `RecipeSpec`s (all existing compile/publish paths unchanged); what's new is a
**binding layer** that says *"member X reads fields a,b,c of the shared record and
plays role Y."*

This is additive: a blueprint with no `sharedRecord` is exactly today's flat bag.

### 2b. New Zod shapes

**New file:** `packages/core/src/composite-record.ts`

```ts
import { z } from 'zod';
import { DataModelSchema } from './data-model.js';

/** The four irreducible composite archetypes (surface-matrix §67-97). */
export const COMPOSITE_KINDS = [
  'product-bundle',       // bundle: BAP + cart-transform + discount
  'cart-drawer',          // smart-cart: live cart is the record; rewards/gifts
  'loyalty-ledger',       // points ledger keyed to customer_id
  'subscription-contract' // selling-plan / contract advanced by cron (partial — see §5)
] as const;
export type CompositeKind = (typeof COMPOSITE_KINDS)[number];

/**
 * Where the authoritative record physically lives. Determines the provisioning
 * primitive at publish and the read path at runtime.
 *  - APP_METAFIELD: a `$app:<key>` json metafield on an app-owned owner
 *    (the bundle path today — `bundle-product.service.ts:315`). Read by Functions.
 *  - DATA_STORE: a typed `DataStore` row (`data-model.ts`) — first-party rows
 *    (loyalty ledger, subscriber list). Read by app-served surfaces (proxy/admin).
 *  - SHOPIFY_CONTRACT: a native Shopify subscription contract + selling-plan group
 *    (subscriptions). Mirrored, not owned. (partial — §5.)
 *  - LIVE_CART: no persisted record; the live Shopify cart IS the state
 *    (cart-drawer). No provisioning.
 */
export const RECORD_BACKINGS = [
  'APP_METAFIELD', 'DATA_STORE', 'SHOPIFY_CONTRACT', 'LIVE_CART',
] as const;
export type RecordBacking = (typeof RECORD_BACKINGS)[number];

/**
 * The authoritative record. `dataModel` (reused from data-model.ts) types its
 * scalar fields; `entityMap` types the cross-surface reference table (the
 * component→BAP mapping for bundles). Kept minimal + additive.
 */
export const CompositeRecordSchema = z.object({
  /** Stable, blueprint-unique key. Every member references this. */
  ref: z.string().min(1).max(48).regex(/^[a-z][a-z0-9-]*$/,
    'recordRef must be kebab-case.'),
  kind: z.enum(COMPOSITE_KINDS),
  backing: z.enum(RECORD_BACKINGS),
  /** Typed scalar fields of the record (pricing knobs, labels, thresholds). */
  dataModel: DataModelSchema.optional(),
  /**
   * The cross-surface reference table. For a bundle: the component→BAP mapping.
   * Rows are resolved at publish (SKU → variant GID) by the resolver for `kind`.
   * `bindingKey` is the stable id stamped on runtime lines
   * (`_superapp_bundle_id`, `_superapp_ledger_id`, …).
   */
  entityMap: z.object({
    bindingKey: z.string().min(1).max(60),
    /** Author-time rows; publish resolves `ref` (SKU/handle) → live GID. */
    entries: z.array(z.object({
      ref: z.string().min(1).max(120),  // SKU / product handle / customer tag
      role: z.string().min(1).max(40),  // 'component' | 'parent-bap' | 'gift' …
      qty: z.number().int().min(1).max(999).optional(),
    })).max(100).default([]),
  }).optional(),
}).strict();
export type CompositeRecord = z.infer<typeof CompositeRecordSchema>;

/** How a blueprint member binds to the shared record. */
export const MEMBER_BINDING_ROLES = [
  'authoring',    // the admin/theme surface that edits the record
  'display',      // storefront render surface (reads record, shows price/avail)
  'enforcement',  // checkout-time Function (reproduces display authoritatively)
  'attribution',  // pixel/analytics keyed to bindingKey
] as const;
export type MemberBindingRole = (typeof MEMBER_BINDING_ROLES)[number];

export const MemberBindingSchema = z.object({
  /** The blueprint member's stable role (matches BlueprintModule.role). */
  memberRole: z.string().min(1).max(60),
  recordRef: z.string().min(1).max(48),
  bindingRole: z.enum(MEMBER_BINDING_ROLES),
  /**
   * Fields of the record this member consumes. Load-bearing for the
   * inventory-source-correctness rule: a `display` member declaring
   * `availabilitySource: 'components'` binds Sold-Out to real component
   * inventory, never the placeholder (fast-bundle.md:128).
   */
  reads: z.array(z.string().min(1).max(60)).max(30).default([]),
  availabilitySource: z.enum(['components', 'placeholder', 'none']).default('none'),
}).strict();
export type MemberBinding = z.infer<typeof MemberBindingSchema>;
```

### 2c. Extend `RecipeBlueprint` (additive, back-compat)

`packages/core/src/recipe-blueprint.ts` — extend the existing schema (both new
fields optional):

```ts
import { CompositeRecordSchema, MemberBindingSchema } from './composite-record.js';

export const RecipeBlueprintSchema = z.object({
  name: z.string().min(3).max(80),
  summary: z.string().min(1).max(280),
  modules: z.array(BlueprintModuleSchema).min(1).max(6),
  links: z.array(BlueprintLinkSchema).optional(),
  // NEW — R3.1. Absent ⇒ today's flat bag (100% back-compat).
  sharedRecords: z.array(CompositeRecordSchema).max(4).optional(),
  bindings: z.array(MemberBindingSchema).max(24).optional(),
});
```

### 2d. Worked example — the bundler as a shared-record blueprint

```jsonc
{
  "name": "Summer Skincare Bundle",
  "summary": "Buy the 3-step routine together and save 20%.",
  "sharedRecords": [{
    "ref": "skincare-bundle",
    "kind": "product-bundle",
    "backing": "APP_METAFIELD",           // $app:bundle_config (existing path)
    "dataModel": { "fields": [
      { "name": "presentationMode", "type": "select",
        "options": ["single-bap", "multi-bap", "cart-transform"], "required": true },
      { "name": "discountPercentage", "type": "number", "required": true }
    ]},
    "entityMap": {
      "bindingKey": "_superapp_bundle_id",
      "entries": [
        { "ref": "CLEANSER-01", "role": "component", "qty": 1 },
        { "ref": "SERUM-01",    "role": "component", "qty": 1 },
        { "ref": "MOIST-01",    "role": "component", "qty": 1 }
      ]
    }
  }],
  "modules": [
    { "role": "bundle-builder-ui", "explanation": "PDP bundle widget.",
      "recipe": { "type": "theme.section", "config": { "kind": "product-bundle", /*…*/ } } },
    { "role": "cart-merge", "explanation": "Merge components into one line.",
      "recipe": { "type": "functions.cartTransform",
                  "config": { "mode": "BUNDLE", "bundles": [ /* filled at publish */ ] } } },
    { "role": "bundle-price", "explanation": "Hold the tier price to checkout.",
      "recipe": { "type": "functions.discountRules",
                  "config": { "rules": [ /* lowered from pricing */ ] } } }
  ],
  "bindings": [
    { "memberRole": "bundle-builder-ui", "recordRef": "skincare-bundle",
      "bindingRole": "display",
      "reads": ["discountPercentage", "presentationMode"],
      "availabilitySource": "components" },          // ← fixes the Sold-Out bug
    { "memberRole": "cart-merge", "recordRef": "skincare-bundle",
      "bindingRole": "enforcement", "reads": ["presentationMode"] },
    { "memberRole": "bundle-price", "recordRef": "skincare-bundle",
      "bindingRole": "enforcement", "reads": ["discountPercentage"] }
  ]
}
```

The `entityMap` (component→BAP mapping) and `discountPercentage` are authored
**once** on the record; all three members reference `skincare-bundle`. That is the
thing the flat blueprint cannot express.

---

## 3. Files to change

| # | File | Change | Kind |
|---|---|---|---|
| 3.1 | **`packages/core/src/composite-record.ts`** (new) | The Zod shapes in §2b. | BUILD |
| 3.2 | `packages/core/src/recipe-blueprint.ts:35-41` | Add optional `sharedRecords`/`bindings` (§2c). | BUILD (additive) |
| 3.3 | `packages/core/src/recipe-blueprint.ts:53-84` (`validateBlueprintCoherence`) | Add coherence rules: every `binding.recordRef` ∈ `sharedRecords[].ref`; every `binding.memberRole` ∈ member roles; each `product-bundle` record has ≥1 `enforcement` binding on a Function member; a `display` member with `availabilitySource:'placeholder'` on a `product-bundle` record emits a **warning** (the Fast Bundle bug). | BUILD |
| 3.4 | `packages/core/src/index.ts` | Re-export `composite-record.ts`. | BUILD |
| 3.5 | **`apps/web/app/services/composites/resolve-record.server.ts`** (new) | `resolveCompositeRecord(admin, record): ResolvedCompositeRecord` — dispatch on `kind`. For `product-bundle`, wraps the existing `BundleProductService` (resolve SKUs, ensure parent BAP, build `entityMap` GIDs). | BUILD (thin wrapper) |
| 3.6 | `apps/web/app/services/blueprints/blueprint.service.ts:25-43` (`injectResolvedBundle`) | Generalize to `injectResolvedRecord(spec, binding, resolved)` driven by the `bindings` table instead of hardcoded `type`/`kind` sniffing. Keep `injectResolvedBundle` as a back-compat shim. | REFACTOR |
| 3.7 | `apps/web/app/services/blueprints/blueprint.service.ts:121-167` (`publishBlueprint`) | Insert a **record-provisioning pre-pass** before the member loop: for each `sharedRecord`, call `resolveCompositeRecord`, then inject the resolved record into each bound member via the `bindings` table. Gate provisioning per `backing`. | WIRE |
| 3.8 | `apps/web/app/services/blueprints/blueprint.service.ts:61-89` (`createDraft`) | Persist `sharedRecords`/`bindings` as a JSON blob on the `Recipe` (new nullable column `Recipe.compositeJson`) so publish can re-read them. | BUILD |
| 3.9 | `apps/web/prisma/schema.prisma:58-72` (`Recipe`) | Add `compositeJson String?` (nullable, additive). Migration only adds a column. | BUILD |
| 3.10 | Generation prompt (blueprint path, `apps/web/app/services/ai/` blueprint prompt + `api.ai.create-module.stream`) | Teach the model to emit `sharedRecords`+`bindings` for the four composite kinds; keep it OPTIONAL so non-composite blueprints are unaffected. | BUILD (§4) |
| 3.11 | `apps/web/app/services/recipes/compiler/index.ts:58` | No change to the `platform.extensionBlueprint` AUDIT case — the composite is expressed as member `RecipeSpec`s, **not** as a new compiler type. (Explicit non-change; see §5 decision.) | — |

---

## 4. Generation wiring

**Path:** the streaming blueprint generation route
(`api.ai.create-module.stream`, primary; batch `create-module` fallback —
`generate._index.tsx:459,499`), behind `BLUEPRINTS_ENABLED`.

1. **Classifier already routes composite intents** ("bundle", "loyalty", …) to
   blueprint generation. Extend the blueprint prompt so that when the plan is one of
   the four `COMPOSITE_KINDS`, the model additionally emits:
   - one `sharedRecords[]` entry (kind + backing chosen by a fixed table below),
   - a `bindings[]` row per member,
   - members whose configs leave record-derived fields as **placeholders** (e.g.
     `cartTransform.bundles: []`) — they are *filled at publish* from the resolved
     record, never hand-authored by the model.

2. **Backing is deterministic per kind** (do not let the model choose — pin it in
   the prompt + re-assert in `validateBlueprintCoherence`):

   | kind | backing | enforcement member |
   |---|---|---|
   | product-bundle | `APP_METAFIELD` | `functions.cartTransform` (+ `functions.discountRules`) |
   | cart-drawer | `LIVE_CART` | `functions.discountRules` (+ optional `cartTransform` for gift lines) |
   | loyalty-ledger | `DATA_STORE` | `functions.discountRules` (mint code) — *partial, §5* |
   | subscription-contract | `SHOPIFY_CONTRACT` | none at checkout; cron-advanced — *partial, §5* |

3. **Coherence gate at generation time.** After the model returns, run
   `validateBlueprintCoherence` (extended, 3.3). On failure, re-prompt once with the
   issues (same pattern the existing blueprint path uses). This keeps display and
   enforcement provably referencing the same record before anything persists.

4. **Fallback / non-composite.** If the model omits `sharedRecords`, generation
   proceeds exactly as today (flat blueprint) — zero regression.

---

## 5. Runtime / compile / render / publish wiring — the make-or-break section

This section says, per backing, **what is real today, what this piece wires, and
what is an explicit follow-up** (honesty discipline — no faked runtimes).

### 5a. `product-bundle` (APP_METAFIELD) — FULLY WIREABLE ON REAL RUNTIME

This is the flagship and it lands end-to-end on shipped machinery.

**Provision (publish, `publishBlueprint` pre-pass, new):**
1. `resolveCompositeRecord` → `BundleProductService.resolveComponents(entityMap.entries.refs)`
   (`bundle-product.service.ts:200`) resolves SKUs → variant GIDs.
2. `ensureParentBundleProduct` (`:241`) creates/updates the parent BAP (idempotent by
   handle). This is the **placeholder product** the record maps to.
3. `resolveBundleWithPricing` (`:127`) lowers the record's pricing → `price`/`tiers`.
4. `buildBundleRuntimeConfig` (`:100`) → `activateCartTransform` (`:279`) writes
   `$app:bundle_config` — **the authoritative runtime record the Function reads.**

**Fan-out to members (new, via `bindings`):**
- `display` member (`theme.section`, kind `product-bundle`) ← inject `bindingKey` +
  resolved component variants + `availabilitySource:'components'`. Generalize the
  existing `injectResolvedBundle` (`blueprint.service.ts:28-33`).
- `enforcement` member (`functions.cartTransform`) ← its `config.bundles` filled from
  `buildBundleRuntimeConfig`. Compiles via the **shipped** `cartTransform` case
  (`compiler/index.ts:35`).
- second `enforcement` member (`functions.discountRules`) ← the lowered `price`/`tiers`
  are *already* carried into the metafield the cart-transform wasm reads
  (`bundle-product.service.ts:71-79,109-110`), so the discount survives to checkout on
  the existing path.

**Render:** the PDP widget renders through the live `theme.section` +
`PreviewService`/`superapp-modules.js` pipeline (already real). The
`availabilitySource:'components'` binding is consumed by the widget's availability
read — **binds Sold-Out to real component inventory, fixing the Fast Bundle bug**
(`fast-bundle.md:98,128`).

**Enforce:** at checkout the shipped cart-transform wasm merges the components into
one line stamped with `bindingKey`, and the lowered pricing prices it —
display-computed price == enforced price, because both derive from the **one record**.

> ✅ **Net: `product-bundle` is fully buildable now.** Every runtime it needs
> (`cartTransform`, `discountRules`, BAP product, `$app:bundle_config`, theme render)
> is already shipped and admin-verified. This piece adds the record model + the
> provisioning pre-pass + binding-driven injection — no new runtime.

### 5b. `cart-drawer` (LIVE_CART) — WIREABLE, no provisioning

- **No record to provision** — the live Shopify cart *is* the state
  (`surface-matrix.md:84`). `backing: LIVE_CART` ⇒ `resolveCompositeRecord` is a
  no-op; there is nothing to write.
- **display** = the drawer `theme.section`/app-embed; **enforcement** =
  `functions.discountRules` (threshold rewards / free-shipping) on the shipped
  discount runtime; optional `cartTransform` for real-inventory gift lines.
- `entityMap` here holds gift/reward product refs (resolved to variant GIDs at
  publish and injected into the discount member).
- ✅ Buildable on shipped runtime. The only shared "record" is the reward table +
  thresholds, carried on the record's `dataModel` and lowered into the discount member.

### 5c. `loyalty-ledger` (DATA_STORE) — PARTIAL: record real, accrual is follow-up

- **Record provisioning IS wireable now**: `backing: DATA_STORE` ⇒ at publish call
  `ensureTypedStore` (the `DataStore.schemaJson` writer, currently caller-less — M8 /
  R3.3) with the record's `dataModel`. This **wires the typed-store writer this piece
  needs anyway** and gives the ledger a typed home keyed to `customer_id`.
- **display** = proxy/theme launcher + `customerAccount.blocks` (both real render
  surfaces); **enforcement** = `functions.discountRules` minting a redemption.
- ⚠️ **EXPLICIT FOLLOW-UP (do not fake):** the **accrual engine** (order-webhook →
  credit balance → propagate) needs the durable background layer that is *not built*
  (`flow-automation.md:19` `resumeDueWorkflowRuns` is a comment; M6). This piece
  **models** the ledger record + surfaces + typed store, and **marks accrual/expiry as
  R3.5-dependent**. We ship the read/display/redeem spine on real runtime; we do
  **not** claim automated earning.

### 5d. `subscription-contract` (SHOPIFY_CONTRACT) — PARTIAL: authoring real, advancement is follow-up

- **display** = Subscribe-&-Save `theme.section` (selling-plan selection) +
  `customerAccount.blocks` portal — both real surfaces; the record `ref` binds them to
  one contract id.
- ⚠️ **EXPLICIT FOLLOW-UP:** persisting/mirroring a real Shopify **subscription
  contract + selling-plan group**, and the **cron dunning/prepaid/win-back** that
  advances it, require (a) contract-mirror provisioning we do not have and (b) the
  same durable scheduler (M6). This piece **models the record + binds the surfaces to
  one contract id**; it explicitly scopes contract creation and cron advancement to
  R3.5 + a subscription-specific follow-up. **No cron is faked.**

### 5e. Publish atomicity

`publishBlueprint` is already best-effort, non-atomic per member
(`blueprint.service.ts:114-119`). The record pre-pass adds one ordering guarantee:
**provision the shared record before any member publishes**, so every member injects
against a resolved record. If provisioning fails, no member publishes (fail-closed on
the record; members stay DRAFT, retryable). This is stricter than today and safe.

---

## 6. Back-compat

- **`sharedRecords`/`bindings` are optional.** A blueprint without them is byte-for-byte
  today's flat bag; `validateBlueprintCoherence` short-circuits when absent.
- **`injectResolvedBundle` retained** as a shim delegating to the generalized
  `injectResolvedRecord`, so the existing test-only caller and any current path keep
  working.
- **`Recipe.compositeJson` is nullable/additive** — a migration that only adds a
  column; existing rows read `null` ⇒ flat behavior.
- **No new compiler type / no new `RecipeSpec` member type.** The composite is
  expressed with existing member types (`theme.section`, `functions.*`), so every
  compile/preview/publish/eligibility path is unchanged. `platform.extensionBlueprint`
  stays AUDIT-only (untouched).
- **`$app:bundle_config` serialization unchanged** — the record path funnels into the
  exact existing `buildBundleRuntimeConfig` shape; a pricing-free bundle still
  serializes byte-identically (`bundle-product.service.ts:96-98`).
- **Single-module generation untouched** — everything here is inside the
  `BLUEPRINTS_ENABLED` path.

---

## 7. Test plan

**Pure / core (`packages/core`), no shop:**
1. `CompositeRecordSchema` accepts the §2d example; `.strict()` rejects unknown keys;
   `ref` regex rejects non-kebab.
2. `validateBlueprintCoherence`:
   - binding `recordRef` not in `sharedRecords` → issue.
   - binding `memberRole` not a member role → issue.
   - `product-bundle` record with no `enforcement` binding on a Function member → issue.
   - `display` binding with `availabilitySource:'placeholder'` on `product-bundle` →
     **warning** (assert the Fast Bundle bug is surfaced, not silently allowed).
   - absent `sharedRecords` → `ok:true` (back-compat).
3. `injectResolvedRecord`: given a `ResolvedCompositeRecord` + a `display` binding,
   the `theme.section` member gets `bindingKey` + component variants; a member with no
   binding is returned by identity (same reference).

**Service (`apps/web`), mocked admin:**
4. `resolveCompositeRecord(product-bundle)` calls `resolveComponents` →
   `ensureParentBundleProduct` → `resolveBundleWithPricing` → `buildBundleRuntimeConfig`
   in order; asserts `entityMap` refs map to resolved GIDs and `bindingKey` is stamped.
5. `resolveCompositeRecord(cart-drawer / LIVE_CART)` is a no-op (no admin calls).
6. `resolveCompositeRecord(loyalty-ledger / DATA_STORE)` calls `ensureTypedStore` with
   the record's `dataModel` (asserts the previously-dead typed-store writer is now
   invoked).
7. `publishBlueprint` with a `sharedRecords` blueprint: record pre-pass runs **before**
   member publish; a provisioning failure ⇒ **zero** members flip PUBLISHED
   (fail-closed); a member failure ⇒ that member stays DRAFT, others publish
   (unchanged best-effort).

**Coherence / regression:**
8. Round-trip: persist a composite blueprint via `createDraft` (asserts
   `Recipe.compositeJson` written), reload via `getBlueprint`, re-parse `compositeJson`
   → equals input.
9. **Display==enforcement invariant (the flagship assertion):** for the §2d bundler,
   the price the display member would compute from the record equals the price the
   `discountRules`/`cartTransform` member enforces from the same record (both read
   `discountPercentage`/lowered tiers from the one record). This is the anti-drift test
   the whole piece exists for.
10. Generation: a "bundle these 3 products, 20% off" prompt yields a blueprint whose
    `validateBlueprintCoherence` passes with one `product-bundle` record + three bound
    members (snapshot the shape, not exact copy).

---

## 8. Risks + decisions the human must make

### Risks
- **R-1 (Scope creep into the scheduler).** loyalty accrual + subscription advancement
  both need the unbuilt durable scheduler (M6). Mitigation: this piece **models** those
  records + binds their real display/redeem surfaces, and **explicitly defers** the
  background engine to R3.5. Do not let the ledger/contract kinds pull the scheduler
  into scope — ship product-bundle + cart-drawer fully, ledger/contract as
  record+surfaces only.
- **R-2 (Two enforcement members, one price).** The bundler has *both* a cart-transform
  and a discount member. Today pricing rides the `$app:bundle_config` metafield the
  cart-transform reads (`bundle-product.service.ts:71-79`); the separate
  `discountRules` member must not double-apply. Mitigation: the record is the single
  source; test #9 asserts one effective price. Prefer carrying the discount **inside**
  the cart-transform merge (existing path) and using the `discountRules` member only
  when the merchant needs a code-stackable discount.
- **R-3 (Coherence is generation-time only).** If a member is later hand-edited in the
  builder, the binding could drift from the record. Mitigation: re-run
  `validateBlueprintCoherence` at `publishBlueprint` entry (cheap, pure) and fail-closed
  on a broken binding.
- **R-4 (`DataModel` reuse for `entityMap` scalars).** `data-model.ts` types scalar
  fields but not the reference table; `entityMap` is a *separate* structure. Risk of
  two overlapping "schema" concepts. Mitigation: keep `dataModel` for scalars only,
  `entityMap` for cross-surface refs — documented boundary in §2b.

### DECISION the human must make (the single biggest one)

**Where does the authoritative record physically live for `product-bundle` — the
`$app` metafield (today's path) or a typed `DataStore` row?**

- **Option A — `APP_METAFIELD` (recommended).** Reuses the *entirely shipped,
  admin-verified* bundle path (`bundle-product.service.ts` + `$app:bundle_config` + the
  cart-transform wasm). Zero new runtime. The record model is a thin authoring layer
  over machinery that already works end-to-end. Downside: the record is bundle-shaped;
  the `DataStore` typed-form/CRUD UI does not manage it.
- **Option B — `DATA_STORE`.** Unifies all four composites under one typed-store
  primitive (M8/R3.3), giving the record a first-party typed CRUD UI and one read
  path. Downside: the bundle Function reads a **metafield**, not a `DataStore`, so
  Option B still has to *project* the row into `$app:bundle_config` at publish — i.e.
  it adds a layer without removing the metafield. More elegant, more work, and it puts
  the flagship on a not-yet-wired writer.

**Recommendation:** ship **product-bundle on Option A** (metafield) and
**loyalty-ledger on `DATA_STORE`** (where the typed store is the natural home and
wiring `ensureTypedStore` is required regardless). Let `RecordBacking` be per-record so
the two coexist — which is exactly why `backing` is a first-class enum on the record
(§2b). The human must confirm this split rather than forcing all four composites onto
one backing.
