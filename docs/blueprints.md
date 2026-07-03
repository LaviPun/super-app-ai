# Multi-Module Blueprints

> One merchant request → **either a single module (unchanged) or a "blueprint": a
> named group of coordinated modules.** Added because complex features (a product
> bundle, a discount-reveal popup) need several modules across surfaces
> (function + theme section + checkout), but the pipeline's contract was "one
> request → one `RecipeSpec` of one type." Flag-gated; single-module is the
> default and is untouched.

## Concept
A blueprint is **not** a new module type. Each member is a normal `RecipeSpec`, so
all existing validation / compile / preview / publish paths apply unchanged. A
blueprint just bundles members with roles + human-readable coordination links,
and persists them as one group by **reusing the existing `Recipe` row**
(`Recipe.modules`).

## Flow
```
request → classify (intent) → planBlueprint(intent)
                               ├─ single   → generateValidatedRecipeOptions (today's path)
                               └─ blueprint → generateValidatedBlueprint (fan-out, 1 best recipe per role)
                                              → response.blueprint (alongside single options)
                                              → POST /api/ai/create-blueprint
                                              → BlueprintService.createDraft (Recipe + N draft Modules)
                                              → "Publish all N" (blueprint banner) → POST /api/blueprints/:recipeId/publish
                                              → BlueprintService.publishBlueprint (resolve bundle triangle → co-deploy members)
                                              (or publish members one-at-a-time via the ordinary per-module publish UI)
```

## The "how many modules" decision (deterministic)
- **Catalog:** `apps/web/app/services/ai/blueprint-catalog.ts` — maps an `intent`
  to its ordered module roles. Seeded with the composites the probes exposed:
  - `upsell.bundle_builder` → `bundle-builder-ui` (`theme.section`, kind
    `product-bundle`) + `cart-merge` (`functions.cartTransform`) +
    `checkout-display` (`checkout.block`, optional).
  - `promo.discount_reveal` → `reveal-popup` (`theme.section`, kind `popup`) +
    `discount-rule` (`functions.discountRules`).
- **Planner:** `apps/web/app/services/ai/blueprint-planner.ts` —
  `planBlueprint({ moduleType, intent })` returns `{ kind: 'single' }` for any
  uncatalogued intent (so today's behavior is preserved) or
  `{ kind: 'blueprint', modules: PlannedModule[] }` with each member's surface
  resolved from `@superapp/core` `getCapabilityNode`.
- Extend the catalog to add new composites — no other change needed.

Probe it:
```bash
cd apps/web
pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/blueprint-plan-probe.ts \
  "create a product bundle with cart and checkout support"
# → decision: blueprint, 3 modules (theme.section + functions.cartTransform + checkout.block)
```

## Generation (fan-out)
`generateValidatedBlueprint(prompt, plan, options)` in
`apps/web/app/services/ai/llm.server.ts` generates **one** best-fit validated
recipe per role (`optionCount: 1` to bound cost), injecting a `blueprintContext`
block into each member's prompt ("you are the `<role>` of `<name>`; the blueprint
also contains `<others>`; do your job only"). Reuses the full per-module pipeline
(design-system directive + design-QA gate). Required roles that fail abort the
blueprint; optional roles are skipped. Returns a `RecipeBlueprint`
(`packages/core/src/recipe-blueprint.ts`) validated by `validateBlueprintCoherence`.

## Data model (reuses `Recipe`)
- A blueprint = a `Recipe` row (`title` = name, new nullable `summary` = description)
  with N `Module` children linked via `Module.recipeId`. **No new tables.**
- Migration: `Recipe.summary TEXT` lives in the single baseline
  `prisma/migrations/20260702000000_baseline/migration.sql`. (The originally-cited
  `20260616120000_add_recipe_summary_blueprint` was folded into the baseline and now
  exists only under `migrations-archive/` / `_archived_migrations_pre_baseline/`.)
- `ModuleService.createDraft(shop, spec, { recipeId })` links each member.

## Persistence + deploy (`apps/web/app/services/blueprints/blueprint.service.ts`)
- `createDraft(shop, blueprint)` → `{ recipeId, moduleIds, firstModuleId }`.
- `getBlueprint(shop, recipeId)` / `listBlueprints(shop)` for the UI.
- `publishBlueprint(admin, shop, recipeId, { themeId })` — **R3.2: co-deploy is
  wired.** Its live caller is `POST /api/blueprints/:recipeId/publish` (the "Publish
  all N" button on the module blueprint banner). It publishes every member as a unit
  through the shared per-module `PublishService.publish` (theme members → `THEME`,
  others → `PLATFORM`) and returns `BlueprintPublishResult`
  (`{ recipeId, published[], failed[], skipped[], resolvedBundle }`).
- **Bundle-triangle GID resolution.** When a member is a `functions.cartTransform`
  with `config.mode === 'BUNDLE'` + `config.bundles` (detected *structurally*, not via
  `links`), co-deploy resolves it once via the shipped `BundleProductService`
  (`resolveComponents` → `ensureParentBundleProduct` → `resolveBundleWithPricing`) into
  a `ResolvedBundle` with real component/parent GIDs + a stable `bundleId`, then injects
  it into the dependent members with `injectResolvedBundle` (`theme.section
  product-bundle` → `bundleId`/`components`; `checkout.block`/`checkout.upsell` → parent
  variant) **before** each compiles. So members wire to each other with real GIDs, not
  the placeholders the AI generated. Fails **loud** if `< 2` SKUs resolve (no partial
  placeholder deploy); on resolution failure the source is `failed[]` and every
  dependent is `skipped[]` (kept DRAFT, retryable).
- **Ordering.** The cart-transform source publishes first (source-first
  `orderMembersForCoDeploy`). The `$app:bundle_config` **dual-writer ordering** is
  enforced: `PublishService.publish(cartTransformSpec)` runs *before*
  `BundleProductService.activateCartTransform(...)`, so the wasm reads the resolved
  runtime config (real `parentVariantId`), not the compiler's placeholder metaobject.
- **Non-atomic + idempotent.** Metaobject writes across surfaces can't be
  transactional, so a failed member stays DRAFT (retryable) while others publish;
  re-running is idempotent (handle-keyed writes; `ensureParentBundleProduct` /
  `activateCartTransform` reuse existing resources). A blueprint with no bundle triangle
  (e.g. `promo.discount_reveal`) publishes each member with no injection.
- **Policy parity (follow-up).** Co-deploy relies on the shared `PublishService` gate
  (`classifyModulePublishability`) per member; it does not yet run the full
  `PublishPolicyService` + feature-flag stack that single publish (`api.publish.tsx`)
  runs. A member that single-publish would block is caught by the publishability gate
  and lands in `failed[]`, never reported published.

## Routes + UI
- `api.ai.create-module.stream` (flag on + plan is a blueprint): the **primary** UI
  call site — streams a `blueprint` SSE event alongside the single-module options.
  `api.ai.create-module` (batch) is the fallback and returns a `blueprint` field the
  same way.
- `api.ai.create-blueprint` (new): persists the posted blueprint → ids.
- `api.blueprints.$recipeId.publish` (R3.2, new): flag-gated co-deploy caller —
  resolves a default `themeId` (explicit picker value, else the store's main theme when
  a member is a theme module) → `BlueprintService.publishBlueprint` → returns
  `BlueprintPublishResult` and logs one `MODULE_PUBLISHED` per published member.
- `generate._index.tsx`: an info banner offers **"Create all N modules"**; after
  creation the merchant lands on the first member and co-deploys via "Publish all N".
- `modules._index.tsx`: members show a blueprint badge.
- `modules.$moduleId.tsx`: a banner lists the blueprint's sibling modules and, when any
  member is DRAFT, offers a **"Publish all N"** button (R3.2) that POSTs to the co-deploy
  route with the selected theme; member badges turn green once PUBLISHED.

## Feature flag
`BLUEPRINTS_ENABLED=true` (env; `apps/web/app/env.server.ts` `isBlueprintsEnabled()`).
Default **off** → single-module generation is unchanged.

## Tests / verification
- `apps/web/app/__tests__/blueprints.test.ts` — schema + coherence, planner
  (bundle → 3 modules; discount-reveal → 2; uncatalogued → single),
  `BlueprintService.createDraft` (Recipe + N linked modules, mocked prisma).
- `apps/web/app/__tests__/blueprint-co-deploy.test.ts` (R3.2) — `injectResolvedBundle`
  `checkout.block` widening (+ theme/upsell regression); `isBundleConfig` /
  `orderMembersForCoDeploy` source-first ordering; `publishBlueprint` triangle order,
  the `$app:bundle_config` write-after-publish ordering (C4), resolution-failure skip
  semantics, partial-failure non-atomicity, non-bundle blueprint, themeId enforcement,
  idempotent re-run (mocked `PublishService` / `BundleProductService` / prisma).
- `apps/web/app/__tests__/blueprint-deployability.test.ts` — per-catalog-member
  deployability guardrail + bundle-resolver pure helpers + injection.
- `scripts/blueprint-plan-probe.ts` — real classifier + planner on any prompt.
- Live deploy needs a real Shopify session (publish each member); can't run in CI.

## Out of scope (follow-ups)
- LLM-driven planner for uncatalogued composites (deterministic catalog first).
- Atomic / rollback co-deploy and blueprint-level progressive rollout (co-deploy is
  now wired — R3.2 — but non-atomic; a failed member stays DRAFT and is retryable).
- A **declarative cross-ref graph** so *arbitrary* new composites co-deploy without a
  bespoke bundle path — R3.2 wires the bundle triangle concretely; R3.1 generalizes
  `injectResolvedBundle` into a binding-driven `injectResolvedRecord`.
- Per-member `PublishPolicyService` + feature-flag parity with single publish (co-deploy
  relies on the shared `PublishService` publishability gate today).
- Auto-wiring real data flow between members (we ship human-readable `links` notes).
- Real product-picker for bundle SKUs (admin-config work).
