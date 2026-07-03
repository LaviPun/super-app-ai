# Phase 030 — Compositional Control-Packs · Consolidated Build Plan

**Scope.** Five design pieces, one phase. This plan sequences them, resolves the
one cross-cutting human decision they collide on (R2.4 composer wire-vs-prune),
names the field types they share, and gives a per-increment, independently-testable
checklist mirroring how Phase #2 shipped (additive → tested → green → commit).

Source docs (all under `specs/030-control-packs/design/`):

| Piece | Doc | One-line |
|---|---|---|
| **R2.1** | `rule-builder.md` | Merchant condition primitive + `targeting.rule-engine` pack + **storefront evaluator** (the flagship). |
| **R2.2** | `discount-packs.md` | `pricing` pack (tiers/BOGO/gift, mixed kinds) + deterministic lowering into the shipped discount/cart-transform Functions. |
| **R2.3** | `recommendation-source.md` | `recommendation` pack (strategy select) + static/dynamic resolver split. |
| **R2.4** | `composer-decision.md` | **DECISION** — wire or prune the built-not-wired `composeConfig`/v2-flag composer. |
| **R2.5** | `per-type-enums.md` | Enabler so a pack field's enum option-set is supplied by the module type (proof case: `layout` on `theme.section`). |

---

## ⚠️ R2.4 — THE DECISION THAT GATES EVERYTHING (confirm before building)

**Two of the five docs disagree about the composer, and the disagreement is
load-bearing.** A human must pick one before R2.5 (and the UI half of R2.1) can be
built on a stable foundation.

### The recommendation: **PRUNE (Option B)** with a surgical carve-out.

Delete `moduleSystemVersion`, `composeConfig`/`composeConfigSchema`, the
`module-manifests`/`presets` layers, the `admin-form.server.ts` bridge, the grouped
`config-adapter.ts`, and the app-wide-unmounted `ConfigEditor`/`StyleBuilder`.
**Keep** every pack *schema*, `SchemaForm.tsx` (live via `data.$storeKey.tsx`), the
three load-bearing pinned packs (`audience`/`schedule`/`advancedCustom`), and the
live `generate._index.tsx` builder as the single authoring path.

### Why prune (the decisive evidence)

- **Nothing downstream reads the composer's output.** Every live consumer — theme
  compiler (`theme-module.ts:37` passes `config` through *verbatim*), `PreviewService`,
  and the storefront Liquid/JS runtime — reads **flat** `config.*` keys
  (`config.title`, `config.trigger`, `config.countdownEnabled`). The composer emits
  a **grouped** shape (`config.content.heading`, `config.trigger.mode`) that reaches
  no compiler, preview, or Liquid path. `config-adapter.ts` exists *only* to
  translate between the two — which is proof the two representations are incompatible
  and the flat one is authoritative. Two representations of the same data is the
  defect; deleting one is the fix.
- **Wiring is not "mount a component."** It is a rewrite of the entire compile→render
  chain **plus** the generation JSON Schema **plus** a back-compat migration of every
  persisted recipe (flat→grouped) — to buy a form the always-on `GenControls`/
  `GenConfigControls` builder already delivers. Zero user benefit, high blast radius.
- **The flag is inert.** `moduleSystemVersion` is read by exactly one dead branch
  (`modules.$moduleId.tsx:211`); generation never reads it. Pruning it changes
  nothing observable.

### The critical consequence for the OTHER docs

**`per-type-enums.md` (R2.5) is written against the WRONG substrate.** Its primary
design (§2b, §4 Path A) extends `composeConfig`, adds a `ModuleManifest.enums`
catalog, and wires per-type enums into generation via `overlayComposedEnums` calling
`composeConfig(...)` inside `recipe-json-schema.server.ts`. **If we prune, that path
is deleted.** R2.5 must be re-based onto the flat-pin mechanism (see "R2.5 rebase"
below). Its own §8 risk #1 already anticipates this: it says the enum **must** wire
into `recipe-json-schema.server.ts` independently of the composer/v2 flag — prune
simply makes that the *only* path, not the parallel one.

Similarly, `rule-builder.md` §3 already assumes the live path is **hand-pin the pack
schema into the recipe branch** (mirroring `audience`), *not* the composer — it calls
the composer "built-not-wired." R2.1/R2.2/R2.3 are already prune-compatible. **Only
R2.5 needs a rebase.**

### If the human chooses WIRE instead

Then R2.4 becomes a large flagship-sized effort (compile→render rewrite + recipe
migration), R2.5's `composeConfig` path is kept as-authored, and the build order
below changes: R2.4 moves to the *front* and blocks R2.5. **This is why the decision
must come first.** The rest of this plan assumes **PRUNE**.

### Open sub-decisions inside PRUNE (confirm alongside)

1. **`adminConfig` / `adminConfigSchemaJson`** — the AI-hydrated admin config
   (`api.ai.hydrate-module.tsx:99`) is still generated + persisted but its only
   renderer (`ConfigEditor`) is being deleted. Decide: (a) route it into
   `GenConfigControls` as a generic renderer, or (b) stop generating it in hydrate.
   Do **not** silently keep generating-and-dropping it. *(Recommend a follow-up
   ticket; out of R2.4's deletion scope but must be tracked.)*
2. **Confirm no e2e/fixture test sets `moduleSystemVersion='v2'`** before dropping the
   Prisma column (grep tests; expected: none).
3. **Keep `ControlPack.uiSchema` hints** on the interface — they cost nothing and
   R2.1's rule-builder UI will want them; only the *consumer* (`composeConfig`→
   `admin-form`) is deleted, not the data.

---

## Recommended BUILD ORDER

```
   ┌─────────────────────────────────────────────────────────────┐
   │  0. HUMAN DECISION: R2.4 wire-vs-prune  (recommend PRUNE)    │
   └───────────────────────────┬─────────────────────────────────┘
                               │ (prune confirmed)
   ┌───────────────────────────▼─────────────────────────────────┐
   │  1. R2.4 PRUNE — collapse to the flat-pin substrate          │  ← unblocks a clean base
   └───────────────────────────┬─────────────────────────────────┘
                               │
   ┌───────────────────────────▼─────────────────────────────────┐
   │  2. R2.5 (REBASED) — per-type-enum enabler on flat pins      │  ← proves the enum mechanism
   │     ships the `layout` proof case end-to-end                 │     R2.3 later reuses
   └───────────────────────────┬─────────────────────────────────┘
                               │
   ┌───────────────────────────▼─────────────────────────────────┐
   │  3. R2.1 RULE-BUILDER (flagship) — pack + shared evaluator +  │  ← biggest piece; the
   │     Liquid gate + client evaluator + preview                 │     evaluator is shared infra
   └───────────────────────────┬─────────────────────────────────┘
                               │
        ┌──────────────────────┴───────────────────────┐
        ▼                                               ▼
   ┌──────────────────────────┐          ┌──────────────────────────────┐
   │ 4a. R2.2 PRICING PACK    │          │ 4b. R2.3 RECOMMENDATION PACK │   ← independent leaves;
   │  (discount/cart-transform│          │  (strategy + resolver split) │      parallelizable
   │   lowering)              │          │  reuses R2.5 typeEnum         │
   └──────────────────────────┘          └──────────────────────────────┘
```

### Rationale for the order

- **R2.4 first (prune):** it *removes* code and collapses two competing substrates
  into one. Every later piece pins a Zod sub-schema onto flat `recipe.config`; doing
  the prune first means R2.1/R2.2/R2.3/R2.5 all target a single, unambiguous seam and
  no one writes code against the dead composer. Cheapest, highest-leverage, lowest-risk
  first move.
- **R2.5 second (the enabler):** `per-type-enums.md` explicitly frames itself as *"the
  enabler, not the vocabulary"* and notes R2.3's `recommendation.source`/`optionType`/
  `widgetKind` "reuse it later with zero new plumbing." Landing the `typeEnum`
  mechanism (rebased onto flat pins) before R2.3 means R2.3 can express per-type
  strategy option-sets for free instead of hardcoding. Small, additive, one proof case.
- **R2.1 third (flagship):** the largest piece and the one that introduces genuinely
  **shared runtime infrastructure** — the `evaluateRuleEngine` pure evaluator, the
  Liquid server-gate pattern, and the `superapp-modules.js` client evaluator. R2.2's
  gate-vs-targeting split and R2.3's `hideCartProducts`/audience interplay both benefit
  from the rule-engine existing first, and the storefront-JS extensions (a shared,
  merge-conflict-prone file) are best touched by the flagship before the leaves pile on.
- **R2.2 + R2.3 last, in parallel:** both are additive leaf packs (`pricing`,
  `recommendation`) pinned onto config with their own resolver/lowering code. They
  touch mostly disjoint files (R2.2 → `compiler/functions.*` + `compiler/pricing/`;
  R2.3 → `proxy.recommend` + `recommendations/` + checkout hook). They can be built by
  two people at once **after** R2.5 (enum reuse) and R2.1 (shared evaluator/JS seam)
  are green. Only shared touch-point is `superapp-modules.js` and
  `superapp-module.liquid` — sequence those two edits, not the whole pieces.

### Dependency summary

| Piece | Hard deps | Soft deps (reuse, not blockers) |
|---|---|---|
| R2.4 (prune) | Human decision | — |
| R2.5 (enums) | **R2.4 decision** (rebase target) | — |
| R2.1 (rules) | R2.4 substrate | — |
| R2.2 (pricing) | R2.4 substrate | R2.1 (evaluator/JS seam) |
| R2.3 (recs) | R2.4 substrate | **R2.5** (typeEnum for `optionType`/strategy), R2.1 (shared JS/Liquid seam) |

---

## CROSS-PIECE CONTRACTS (shared field types the pieces reuse)

These are the seams multiple pieces touch. Change them once, coherently.

### C1 — The flat-pin mechanism (the substrate all packs share)

After R2.4-prune, **every** new pack lands identically: a Zod object pinned as an
`.optional()` nested key onto a recipe branch's flat `config`, exactly like the three
existing pins (`audience`/`schedule`/`advancedCustom` at `recipe.ts:8-10,139-142`).

- R2.1 pins `ruleEngine: RuleEnginePackSchema.optional()`
- R2.2 pins `pricing: PricingPackSchema.optional()` (on the two `functions.*` branches)
- R2.3 pins `recommendation: RecommendationPackSchema.optional()` (on `theme.section`
  + `checkout.upsell`/`checkout.block`/`postPurchase.offer`)
- R2.5 pins `layout: LayoutArchetypeConfigSchema.optional()` (on `theme.section`)

**Contract:** pin location is the recipe branch's `config` object; the pack schema
flows into the LLM structured-output JSON Schema *for free* via
`zodToJsonSchema(RecipeSpecSchema)` (`recipe-json-schema.server.ts`). No pack goes
through `composeConfig` (deleted).

### C2 — `CONDITION_OPERATORS` (shared operator enum)

Already exists at `allowed-values.ts:458-471` (12 operators, from the dormant flow
engine). **R2.1 reuses it verbatim** — do not invent a parallel operator vocabulary.
R2.2's `gate`/prerequisites and R2.3's `excludeTags` are coarser predicates and do
**not** reuse it; only R2.1's rule rows do. Deliberately **no `regex` operator**
(storefront safety — no user-supplied RegExp).

### C3 — Product / collection / variant GID string types

Reused across R2.2 and R2.3:

- `ProductVariant` GID: `gid://shopify/ProductVariant/\d+` — R2.3 `manualVariantGids`,
  legacy `productVariantGid` on checkout configs.
- `Product` GID: `gid://shopify/Product/\d+` — R2.3 `seedProductGid`, R2.2
  `prerequisiteProductIds`, R2.2 BOGO `buy/get.productIds`.
- `Collection` GID: `gid://shopify/Collection/\d+` — R2.3 `collectionGid`, R2.2
  `prerequisiteCollectionIds`, R2.1 `cart.containsCollectionId` value.

**Contract:** standardize the three regexes once (R2.3 defines them in
`recommendation.pack.ts`; R2.2 should import or mirror the *identical* patterns).
Recommend hoisting the three GID regexes to `allowed-values.ts` (or a
`packages/core/src/gid.ts`) when the **second** consumer (R2.2) lands, so pricing and
recommendation validate GIDs identically. **Do not** let each pack hand-roll a
slightly different GID regex.

### C4 — `THRESHOLD_BASIS` = `['quantity','cart-value']`

R2.2-internal (tiers/gift), but note it overlaps conceptually with R2.1 cart
attributes (`cart.subtotal`, `cart.itemCount`). Keep them separate enums (different
axes) but be aware a merchant reads "quantity threshold" the same way in both — align
labels in the prompt guidance.

### C5 — The per-type `typeEnum` field type (R2.5, reused by R2.3)

R2.5 introduces `EnumOption`/`TypeEnumField` and (rebased) a **flat-pin** way to
resolve per-type option-sets. R2.3's `strategy` select and the `optionType`/
`widgetKind` follow-ons are the intended reuse. **Contract:** R2.3 should express its
`strategy` enum as a `typeEnum` field *if* R2.5 lands first (recommended order);
otherwise as a plain `z.enum(RECOMMENDATION_STRATEGIES)` and refactor later. Landing
R2.5 first avoids that refactor.

### C6 — Storefront runtime seams (shared, merge-sensitive files)

Three files are touched by multiple pieces — **sequence these edits, do not merge in
parallel:**

- `extensions/theme-app-extension/snippets/superapp-module.liquid` — R2.1 adds a
  top-of-snippet rule gate; R2.3 adds a `product-recommendations` branch. R2.1 first.
- `extensions/theme-app-extension/assets/superapp-modules.js` — R2.1 adds
  `gateModules()`/`evaluateRules`; R2.3 adds `initRecs()`. R2.1 first (it establishes
  the page-init sweep pattern R2.3 hooks into).
- `apps/web/app/services/preview/preview.service.ts` — R2.1 (rule "hidden" state),
  R2.3 (strategy-labelled placeholder), R2.5 (`superapp-layout--` modifier class).
  All additive `?.`-guarded reads; low conflict but coordinate.

### C7 — `recipe-json-schema.server.ts` (generation contract)

Every pack's fields must reach the LLM structured-output schema. Post-prune the
mechanism is uniform: fields on `recipe.config` flow through `zodToJsonSchema` for
free. **One shared risk lives here** (see Risks §X-2): `normalizeForStructuredOutput`
force-marks every property `required`, which can push the model to emit an *optional*
pack even when irrelevant. R2.2 flags this explicitly (T-BC3); R2.5's overlay concern
collapses into it post-prune. Fix once, verify for all four packs.

---

## PER-INCREMENT CHECKLIST

Each increment is **additive, independently testable, and committable green** — the
Phase #2 discipline. Every increment ends with: `tsc --noEmit` clean, the named tests
green, and (where a schema changed) a back-compat fixture proving old recipes still
validate + render byte-identical. Commit at each ✅.

### Increment 0 — R2.4 PRUNE (do first)

- [ ] **0.1 Delete dead composition machinery.** Delete `ConfigEditor.tsx`,
  `StyleBuilder.tsx`, `admin-form.server.ts`, `config-adapter.ts`; delete
  `composeConfig`/`composeConfigSchema` (`compose.ts`), `module-manifests.ts`,
  `presets.ts`. Remove their exports from `control-packs/index.ts:8,9`.
- [ ] **0.2 Remove the flag.** Strip `moduleSystemVersion` from
  `settings.service.ts:31,45,71,103,196`, `internal.settings.tsx:150-152,588-607`,
  and the dead loader branch `modules.$moduleId.tsx:209-222` (drop `engine`/`v2Form`;
  audit `adminConfig` per open sub-decision #1).
- [ ] **0.3 Prisma migration** dropping `AppSettings.moduleSystemVersion` (roll-forward
  only; value is inert). Ship code-that-stops-reading first or same release.
- [ ] **0.4 Rewrite `control-packs.test.ts`** — delete composeConfig/manifest/preset
  assertions; keep per-pack schema parse/default/reject assertions.
- [ ] **Gate (must all be green before commit):** `tsc --noEmit` clean; export-absence
  test (`composeConfig`/`hasManifest`/`getPresetsForType` undefined on `@superapp/core`);
  CI grep gate `grep -rn "moduleSystemVersion" apps packages` → 0; back-compat: a legacy
  flat `theme.section` fixture still `RecipeSpecSchema.parse`s; compiler passes flat
  config through verbatim; `data.$storeKey.tsx` still renders `SchemaForm`.

### Increment 1 — R2.5 per-type-enum enabler (REBASED onto flat pins)

> **Rebase note:** ignore `per-type-enums.md`'s `composeConfig`/`ModuleManifest.enums`/
> `overlayComposedEnums` plumbing (deleted in Inc 0). Keep its *value*: `EnumOption`,
> `TypeEnumField`, the `layout-archetype` proof pack, the compiler/preview
> `superapp-layout--<archetype>` modifier class, and the make-or-break "enum must
> change pixels" chain. Resolve per-type option-sets via a small helper keyed off the
> recipe **type** at generation time (a `describeTypeEnums(type)` / per-type option map
> living beside the pack), and pin `layout: LayoutArchetypeConfigSchema.optional()`
> onto `theme.section.config` (loose `z.string()` at the recipe-union level, tight
> per-type enum enforced in the generation JSON Schema).

- [ ] **1.1 Types.** Add `EnumOption`, `TypeEnumField` to `control-packs/types.ts`
  (drop the `PackSchemaFactory`/`ModuleManifest.enums` pieces that assumed the composer).
- [ ] **1.2 Proof pack.** New `packs/layout-archetype.pack.ts` (namespace `layout`);
  register in `registry.ts`; export from `index.ts`.
- [ ] **1.3 Recipe pin.** Add `layout: LayoutArchetypeConfigSchema.optional()` to
  `theme.section.config` (loose string in the union).
- [ ] **1.4 Generation (live path only).** Make the per-type `layout` enum a hard
  constraint in `recipe-json-schema.server.ts` for `theme.section` (independent of any
  flag). Prose fallback: one `describeTypeEnums` line.
- [ ] **1.5 Runtime make-or-break.** Emit `superapp-layout--<archetype>` modifier class
  from `config.layout.layout` in the section renderer/`style-compiler.ts`; ship the CSS
  (`--grid`/`--masonry`/`--carousel`/`--stacked`); mirror in `preview.service.ts`.
- [ ] **Gate:** per-type enum accepts `grid`, rejects `sidebar`; a *second* type's
  option-set diverges (the whole point); back-compat golden — a pre-change
  `theme.section` (no `layout`) parses and compiles **byte-identical** (empty modifier
  class); non-`theme.section` types' JSON Schema unchanged.

### Increment 2 — R2.1 rule-builder (flagship; sub-increments)

- [ ] **2.1 Enums.** Add `RULE_OBJECTS`, `RULE_ATTRIBUTES`,
  `RULE_ATTRIBUTE_VALUE_TYPES`, `RULE_MATCH_ACTIONS`, `RULE_LIMITS` to
  `allowed-values.ts`. Reuse `CONDITION_OPERATORS` (C2). **Gate:** unit — the
  `(object,attribute)` map is the resolver dispatch table.
- [ ] **2.2 Pack + schema.** New `packs/rule-engine.pack.ts` (`RuleConditionSchema`
  with the unknown-pair + valueless-operator `superRefine`, `RuleGroupSchema`,
  `RuleEnginePackSchema`); register + export; add `'rule-engine'` to `theme.section`
  advanced packs; add `FieldWidget` incl. `'rule-builder'`. **Gate:** schema
  parse/default/reject tests (defaults = always-show; unknown pair fails; valueless-op
  guard).
- [ ] **2.3 Recipe pin.** `ruleEngine: RuleEnginePackSchema.optional()` on
  `theme.section.config` **and** `proxy.widget.config`. **Gate:** back-compat — recipe
  without `ruleEngine` parses; `.catchall` tolerates.
- [ ] **2.4 Shared pure evaluator.** New `packages/core/src/rule-engine/evaluate.ts`
  (`evalRow`, `evaluateRuleEngine`, `compare` — no `eval`, no `RegExp`). Used by
  preview + tests. **Gate:** ≥12-case fixture table (AND/OR/HIDE-inversion/empty/
  unresolved-behavioral).
- [ ] **2.5 Generation prose.** Add the display-rules authoring contract + allowlist to
  the create-module prompt (`requirement-spec.server.ts` already surfaces the
  namespace). **Gate:** prompt-expectations — "returning customers only" → one-row
  ruleEngine; unconstrained → **no** ruleEngine (over-emission guard).
- [ ] **2.6 Server render gate.** New `snippets/superapp-rule-eval.liquid` +
  top-of-`superapp-module.liquid` gate emitting `data-sa-rules` / `data-sa-rule-server`
  (pass|fail|defer). v1 resolves only the cheap high-value server objects inline;
  correctness lives client-side; server only ever hides earlier, never shows what the
  client would hide. **Gate:** Liquid snapshots — absent/disabled → **no** `data-sa-*`
  (back-compat lock); server-resolvable fail → suppressed; behavioral → `hidden` +
  `defer` + payload.
- [ ] **2.7 Client evaluator.** `evaluateRules` + `gateModules()` in
  `superapp-modules.js`; popup `open()` gains a rule check alongside `isSuppressed`.
  **Gate:** jsdom — defer module with passing client rules revealed; failing removed;
  malformed JSON no-throw; **client/TS parity test** on the shared fixture (the
  anti-drift contract).
- [ ] **2.8 Preview + proxy.** `preview.service.ts` renders a "hidden by rules" state
  via the shared evaluator; optional `proxy.widget` server-side gate. **Gate:** preview
  reflects `matchAction`; app-proxy `hide` renders no HTML.

### Increment 3 — R2.2 pricing (parallelizable with Inc 4)

- [ ] **3.1 Pack + schema.** New `packs/pricing.pack.ts` (`DISCOUNT_KINDS`,
  `DiscountSchema`, `TierSchema`/`TiersSchema` with mixed-kind rows + single-preselect
  refine, `BogoSchema`, `GiftSchema`, `PricingPackSchema` with model-body superRefine,
  `MECHANISMS`); register + export; centralize limits/GID regexes per C3. **Gate:**
  T-S1..T-S5 (mixed-kinds accepted; missing body fails; double-preselect fails;
  percentage>100 fails; defaults).
- [ ] **3.2 Recipe pin.** `pricing: PricingPackSchema.optional()` on
  `functions.discountRules.config` and `functions.cartTransform.config` (root +
  per-bundle). Keep legacy `rules[]`/`bundles[]` untouched. **Gate:** T-BC1/T-BC2 —
  legacy fixtures parse; **T-BC3** — widened branch JSON Schema does **not** force
  `pricing` required (the shared C7 risk).
- [ ] **3.3 Lowering layer.** New `compiler/pricing/lower.ts`
  (`lowerPricingToDiscountRules` — tiers → one rule per row, **highest-threshold-first**;
  `lowerPricingToCartTransform`; `pricingToStorefrontJson`). **Gate:** T-L1..T-L7,
  esp. **T-L2** (four tiers, four kinds, one set — the flagship parity assertion).
- [ ] **3.4 Compiler wiring.** `functions.discountRules.ts`/`functions.cartTransform.ts`
  call the lowering when `config.pricing` present (`pricing` wins, derives `rules`);
  absent → byte-identical legacy. **Gate:** T-C1/T-C2 (one FUNCTION_CONFIG_UPSERT + one
  AUDIT; mechanism-mismatch warning).
- [ ] **3.5 Prose guidance** + intent-example (§2.5 tiered + one BOGO). **Gate:**
  generation emits `pricing` for bundle/discount prompts, not for plain popups.
- [ ] **Flag, do not block on:** wasm handler must learn new `apply` keys
  (`fixedPrice`/`cheapestFree`/`freeShipping`/`buyXGetY`/`freeGift`) — ship-safe first
  (unknown keys ignored), **feature real only when handler lands** (same PR or fast-follow).

### Increment 4 — R2.3 recommendation (parallelizable with Inc 3)

- [ ] **4.1 Enums.** `RECOMMENDATION_STRATEGIES` + `STATIC_RECOMMENDATION_STRATEGIES`
  in `allowed-values.ts`. **Gate:** the 4 dynamic = full \ static (the split invariant).
- [ ] **4.2 Pack + schema.** New `packs/recommendation.pack.ts` (strategy enum —
  **as a `typeEnum` if R2.5 landed**, else plain; per-strategy config; mandatory
  `fallback`; GID regexes per C3; superRefine for manual/collection requirements);
  register + export. **Gate:** pack unit tests (defaults; manual-without-gids fails;
  collection-without-gid fails; bad GID fails; limit bounds).
- [ ] **4.3 Recipe pin.** `recommendation: RecommendationPackSchema.optional()` on
  `theme.section` + `checkout.upsell`/`checkout.block`/`postPurchase.offer`; keep
  legacy `productVariantGid`. **Gate:** back-compat — legacy `productVariantGid`-only
  parses; both together parse; registry count now 11.
- [ ] **4.4 Static resolver (Liquid).** New `snippets/superapp-recommendations.liquid`
  + `product-recommendations` branch + generic-kind opt-in when `mod_cfg.recommendation`
  present. **Gate:** Liquid snapshot — static strategies render inline; absent → no new
  code path.
- [ ] **4.5 Client + dynamic.** `initRecs()` in `superapp-modules.js` (native
  `/recommendations/products.json` + `/cart.js` service-free; proxy for dynamic);
  `fallback` handling. New `proxy.recommend.tsx` + `recommendations/recommendation.service.ts`.
  **Gate:** **resolver-class invariant** — every static strategy returns `[]` from the
  service (the "renders without a service" fence); `buy-it-again` w/o customerId → `[]`.
- [ ] **4.6 Checkout + preview + generation.** `useCheckoutConfig.ts` resolves static
  strategies via Storefront API, dynamic → fallback; `preview.service.ts` strategy-labelled
  placeholder; prompt-expectations block + upsell-blueprint default `recommendation`.
  **Gate:** checkout back-compat (bare `productVariantGid` unchanged); preview labels
  strategy.

---

## RISKS THAT SPAN PIECES

**X-1 · The R2.4 decision is a fork, not a detail (HIGHEST).** If the human picks
WIRE instead of PRUNE, R2.5's substrate flips, the build order reorders (R2.4 to
front, blocking R2.5), and R2.1/R2.2/R2.3's "hand-pin onto flat config" assumption
becomes a coexistence problem. *Everything downstream assumes PRUNE.* → **Confirm
before Increment 0.** Mitigation baked in: R2.1/R2.2/R2.3 are already written against
flat pins, so only R2.5 needs rebasing under PRUNE — a bounded, single-piece change.

**X-2 · `normalizeForStructuredOutput` forces optional pack fields to `required`
(HIGH; hits R2.2, R2.3, R2.5).** The generation JSON Schema builder force-marks every
property `required`; an *optional* pinned pack (`pricing`/`recommendation`/`layout`/
`ruleEngine`) may become required in the emitted schema, pushing the model to emit it
even when irrelevant (a "10% off" prompt forced to emit `pricing`; a plain popup forced
to emit `recommendation`). This is **one bug that affects four packs** because they all
ride the same C7 seam. → Fix once in `recipe-json-schema.server.ts` (nullable-allow or
scoped normalization), verify per pack with an over-emission test (R2.1 §7.17, R2.2
T-BC3 are the templates). **Do not** solve it four times; solve it in R2.5 (first pack
to hit it) and reuse.

**X-3 · Server/client evaluator drift (HIGH; R2.1, echoes into R2.3).** R2.1's
`evaluateRuleEngine` exists twice — TS (`rule-engine/evaluate.ts`) and hand-ported
vanilla in `superapp-modules.js`. Any new operator must be added in both. R2.3's
`initRecs` client resolver is a second consumer of the same "storefront JS is a
separate runtime that can't import TS" constraint. → Shared **fixture parity test**
(§7.7) is the contract; consider generating the vanilla file from TS in a later pass.
Sequence the two `superapp-modules.js` edits (C6) so the parity harness lands with R2.1
before R2.3 piles on.

**X-4 · Three storefront files are shared merge surfaces (MED; R2.1+R2.3+R2.5).**
`superapp-module.liquid`, `superapp-modules.js`, `preview.service.ts` are each edited
by multiple pieces (C6). Parallel edits will conflict. → R2.1 goes first and
establishes the patterns (rule gate, page-init sweep); R2.3 hooks into them; R2.5's
preview edit is a one-line modifier class. Coordinate these three files even when the
pieces otherwise run in parallel.

**X-5 · GID regex fragmentation (MED; R2.2+R2.3).** Two packs validate Product/
Collection/Variant GIDs; if each hand-rolls its own regex they drift (one accepts a
GID the other rejects, breaking blueprints that share IDs). → Hoist the three regexes
to a shared location (C3) when R2.2 (the second consumer) lands.

**X-6 · Wasm/runtime handlers lag the schema (MED; R2.2 acute, R2.1 latent).** R2.2's
new discount `apply` keys are inert until the wasm crate parses them — merchants can
author mixed-kind tiers that silently price as plain percentage. R2.1's rule evaluator
is JS (ships with the extension, no lag) but its *server* Liquid gate is a
progressive-enhancement subset (correctness deferred to client). → Both are ship-safe
(unknown keys ignored / client authoritative), but track "feature real at checkout"
separately from "schema+compiler merged." Locate the wasm crate before advertising R2.2
mixed kinds as enforced.

**X-7 · "Compositional control-packs" misread as "control-packs deleted" (LOW;
R2.4).** The phase is *named* for compositional control-packs, and R2.4 deletes the
composer. Commit messages + this plan must state plainly: **packs stay; the
composer/flag go; composition now means pinning Zod sub-schemas onto flat `config`.**
The three live pins + four new packs are the composition mechanism going forward.

---

## EXECUTIVE SUMMARY

**Build order:** (0) confirm the R2.4 decision → (1) **R2.4 PRUNE** the dead composer
to collapse two competing config substrates into one flat-pin seam → (2) **R2.5**
per-type-enum enabler (rebased onto flat pins; ships the `layout` proof case) → (3)
**R2.1** rule-builder flagship (pack + shared evaluator + Liquid/JS storefront gate) →
(4) **R2.2 pricing** and **R2.3 recommendation** in parallel as additive leaf packs.
R2.4 is first because it removes code and unifies the substrate; R2.5 precedes R2.3 so
the strategy select reuses the enum mechanism for free; R2.1 precedes the leaves because
it lays down the shared evaluator and the merge-sensitive storefront JS/Liquid seams.

**Composer recommendation: PRUNE (Option B).** Delete `moduleSystemVersion`,
`composeConfig`/manifests/presets, the `admin-form` bridge, the grouped
`config-adapter`, and the app-wide-unmounted `ConfigEditor`/`StyleBuilder`; keep the
pack *schemas*, `SchemaForm.tsx`, and `generate._index.tsx` as the single authoring
path. The decisive evidence is the render chain: every live consumer reads **flat**
`config` keys, the composer's grouped output is read by nothing, and `config-adapter.ts`
exists only to bridge the two — so wiring would mean rewriting compile→render *and*
migrating every persisted recipe for zero user gain. **This is the one decision a human
must confirm before Increment 0, because R2.5 is currently authored against the
composer and must be rebased onto flat pins under PRUNE** (or, under WIRE, R2.4 becomes
a flagship-sized effort that moves to the front and blocks R2.5).

**Top 3 risks:** (1) **The R2.4 fork itself** — PRUNE vs WIRE changes the substrate,
the order, and R2.5's design; confirm first. (2) **The `required`-normalization bug in
`recipe-json-schema.server.ts`** — one seam forces four optional packs
(`pricing`/`recommendation`/`layout`/`ruleEngine`) to be emitted even when irrelevant;
fix once, verify per pack. (3) **Server/client rule-evaluator drift** — R2.1's
evaluator exists in both TS and hand-ported vanilla JS (and R2.3 adds a second
storefront-JS resolver on the same shared, merge-sensitive files); a fixture parity
test is the anti-drift contract and R2.1 must land it before the leaves pile on.

**Human decisions needed before implementation:** (a) **R2.4 wire-vs-prune** (recommend
PRUNE) — gates everything; (b) the fate of `adminConfig`/`adminConfigSchemaJson` after
`ConfigEditor` is deleted (route into `GenConfigControls` or stop generating — don't
silently drop); (c) confirm no fixture/e2e test relies on `moduleSystemVersion='v2'`
before dropping the Prisma column; (d) confirm the wasm discount/cart-transform handler
plan for R2.2's new `apply` keys (same-PR vs fast-follow); (e) confirm R2.1 scope =
module-level show/hide gate only (Rebuy-style ordered slot-fill belongs to R2.3/phase #4).
