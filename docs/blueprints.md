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
                                              → (members stay DRAFT; publish one-at-a-time via the ordinary per-module publish UI —
                                                 coordinated co-deploy `publishBlueprint` is built but has ZERO callers)
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
- `publishBlueprint(admin, shop, recipeId, { themeId })` is **implemented but
  built-not-wired — it has ZERO callers** (no route, UI button, or job invokes it),
  so coordinated co-deploy does not run today. As designed it would loop the existing
  per-module `PublishService.publish` (theme members → `THEME`, others → `PLATFORM`),
  best-effort and non-atomic, reporting `{ published[], failed[] }`. `injectResolvedBundle`
  (the bundle-GID resolver it would call) is likewise test-only, so bundle members would
  deploy with placeholder GIDs until it is wired. Until a "Publish all N" action exists,
  members publish one-at-a-time via the ordinary per-module publish UI.

## Routes + UI
- `api.ai.create-module.stream` (flag on + plan is a blueprint): the **primary** UI
  call site — streams a `blueprint` SSE event alongside the single-module options.
  `api.ai.create-module` (batch) is the fallback and returns a `blueprint` field the
  same way.
- `api.ai.create-blueprint` (new): persists the posted blueprint → ids.
- `generate._index.tsx`: an info banner offers **"Create all N modules"**; accept
  POSTs to `/api/ai/create-blueprint` and navigates to `/modules?recipe=<id>`.
- `modules._index.tsx`: members show a blueprint badge.
- `modules.$moduleId.tsx`: a banner lists the blueprint's sibling modules.

## Feature flag
`BLUEPRINTS_ENABLED=true` (env; `apps/web/app/env.server.ts` `isBlueprintsEnabled()`).
Default **off** → single-module generation is unchanged.

## Tests / verification
- `apps/web/app/__tests__/blueprints.test.ts` — schema + coherence, planner
  (bundle → 3 modules; discount-reveal → 2; uncatalogued → single),
  `BlueprintService.createDraft` (Recipe + N linked modules, mocked prisma).
- `scripts/blueprint-plan-probe.ts` — real classifier + planner on any prompt.
- Live deploy needs a real Shopify session (publish each member); can't run in CI.

## Out of scope (follow-ups)
- LLM-driven planner for uncatalogued composites (deterministic catalog first).
- Co-deploy itself (`publishBlueprint` is built but unwired), then atomic / rollback
  co-deploy and blueprint-level progressive rollout.
- Auto-wiring real data flow between members (we ship human-readable `links` notes).
- Real product-picker for bundle SKUs (admin-config work).
