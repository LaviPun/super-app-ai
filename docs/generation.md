# AI Module Generator — RecipeSpec Reference

> This is the canonical source for RecipeSpec types, the Shopify-facing enums every generated module draws from, and the generation/catalog/blueprint pipeline that produces them. Other docs link here rather than re-listing these values — see [`docs/README.md`](./README.md) "Maintenance Rules". For process topology and the security model, see [`docs/architecture.md`](./architecture.md).

## 1. Role of the AI module generator + hard rules

The generator consumes merchant intent (natural language or structured UI choices) and outputs **RecipeSpec JSON only** — never Liquid, JavaScript, or any other code the app would execute unvalidated. Every generated spec is:

- Restricted to values drawn from the canonical enums below (surfaces, targets, placement filters, setting types, capabilities) — no ad-hoc strings for Shopify-facing identifiers.
- Schema-validated against `RecipeSpecSchema` (a Zod discriminated union by `type`) before it can be saved or published.
- Capability-gated: each recipe declares `requires: Capability[]`, checked against the shop's plan before publish (see [§9](#9-capabilities-and-plan-gating)).

Hard platform rules that constrain every generated module, regardless of type:

- **Online Store 2.0 only.** Theme App Extensions (app blocks + app embeds) require JSON templates and a host section that supports `@app` blocks; vintage/Liquid-only themes are not supported. The placement picker must only expose placeable templates/sections.
- **No legacy storefront injection.** No ScriptTag, no `checkout.liquid`/Thank-you "additional scripts". Only Theme App Extensions, UI extensions, Shopify Functions, and Web Pixels.
- **Theme app extensions cannot render on checkout pages** and do not have access to `content_for_header`/`content_for_index`/`content_for_layout` or the parent section object (other than `section.id`).
- **Compliance:** the app implements the mandatory `customers/data_request`, `customers/redact`, and `shop/redact` webhooks (HMAC-verified) and supports redacting a shop's/customer's data on request or uninstall.
- **Telemetry respects Customer Privacy consent** — no tracking when consent disallows it.

---

## 2. Output contract: RecipeSpec

A **RecipeSpec** is the only artifact the AI is allowed to generate. It is a discriminated union (`packages/core/src/recipe.ts`) keyed by `type`; the type determines which `config` shape is required. Every RecipeSpec belongs to exactly one **module category**:

`STOREFRONT_UI`, `ADMIN_UI`, `FUNCTION`, `INTEGRATION`, `FLOW`, `CUSTOMER_ACCOUNT` (`MODULE_CATEGORIES`, `packages/core/src/allowed-values.ts:1575`).

The canonical list of type discriminators is `RECIPE_SPEC_TYPES` (`packages/core/src/allowed-values.ts:1587`) — this array, not this document's prose, is the source of truth; re-read it at execution time before trusting the table below. As of this writing:

| Category | Types |
|---|---|
| Storefront UI | `theme.section` (generic, unrestricted — see [§4](#4-module-system-v2-generic-themesection)), `proxy.widget` |
| Checkout / post-purchase | `checkout.upsell`, `checkout.block`, `postPurchase.offer` |
| Customer account | `customerAccount.blocks` |
| Admin / POS / platform | `admin.block`, `admin.action`, `admin.discountUi`, `admin.link`, `admin.print`, `admin.segmentTemplate`, `pos.extension`, `platform.extensionBlueprint` |
| Functions | `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `functions.cartAndCheckoutValidation`, `functions.cartTransform`, `functions.fulfillmentConstraints`, `functions.orderRoutingLocationRule`, `functions.shippingDiscount`, `functions.localPickupDeliveryOption`, `functions.pickupPointDeliveryOption` |
| Integration / automation | `analytics.pixel`, `integration.httpSync`, `flow.automation`, `messaging.campaign`, `agentic.catalogProfile` |

`MODULE_TYPE_TO_CATEGORY` and `MODULE_TYPE_DEFAULT_REQUIRES` (same file, immediately below `RECIPE_SPEC_TYPES`) map each type to its category and default capability requirement — that mapping, not a hand-maintained copy, is what the compiler and publish gate actually read.

Storefront UI types (`theme.section`, `proxy.widget`) additionally accept an optional `style` object validated by `StorefrontStyleSchema` (`packages/core/src/storefront-style.ts`) — preset enums only, no arbitrary CSS except a sanitized, scoped `customCss` escape hatch.

---

## 3. Canonical value sets

Each Shopify-facing surface has its own enum of targets/kinds in `packages/core/src/allowed-values.ts`. This section is a map to those exports, not a transcription of them — the arrays change more often than this doc would stay in sync, so treat the file as the source and this table as an index. "Status" reflects `packages/core/src/extension-eligibility.ts`'s eligibility registry as of this writing (`deployable` = a real runtime is shipped and publish writes working config; `needs_runtime` = the runtime isn't wired yet — publish is blocked, never faked).

| Surface | Key exports (`allowed-values.ts`) | Status |
|---|---|---|
| Theme app extension | `THEME_LIQUID_TEMPLATE_NAMES`, `THEME_PLACEABLE_TEMPLATES`, `THEME_SECTION_GROUPS`, `THEME_EMBED_TARGETS`, `THEME_SETTING_TYPES`, `THEME_DEEP_LINK_MODES`, `THEME_SCHEMA_KNOBS` | `theme.section` deployable (app-block/metaobject path). A `native_section` deploy mode exists but stays `needs_runtime` until its full gate is met — see [`generated-module-design-system` / theme-edit-api-native-sections notes]; not covered further here since it has never had a verified live push. |
| Checkout UI extensions | `CHECKOUT_UI_TARGETS`, `CHECKOUT_UI_PLUS_ONLY_TARGET_PREFIXES`, `CHECKOUT_FIELD_KINDS`, `CHECKOUT_LAYOUT_KINDS`, `CHECKOUT_TONES`, `CHECKOUT_PROTECTED_DATA_LEVELS` | `checkout.upsell` and `checkout.block` deployable (Plus-gated: checkout extensibility requires Shopify Plus). |
| Post-purchase | `POST_PURCHASE_TARGETS` | `postPurchase.offer` deployable (all plans). |
| Customer account UI extension | `CUSTOMER_ACCOUNT_BLOCK_TARGETS`, `CUSTOMER_ACCOUNT_TARGETS`, `CUSTOMER_ACCOUNT_BLOCK_KINDS`, `CUSTOMER_ACCOUNT_FIELD_KINDS`, `CUSTOMER_ACCOUNT_BINDINGS` | `customerAccount.blocks` deployable. |
| Admin UI extension | `ADMIN_SURFACE_KINDS`, `ADMIN_TARGETS`, `ADMIN_BLOCK_TARGETS`, `ADMIN_ACTION_TARGETS`, `ADMIN_PRINT_TARGETS`, `ADMIN_LINK_TARGETS`, `ADMIN_SEGMENT_TEMPLATE_TARGET` | `admin.block`/`admin.action` deployable via the shipped generic admin UI extension. `admin.link`/`admin.print`/`admin.segmentTemplate` deployable via their own shipped extension families. `admin.discountUi` is also deployable — the Spring-2026 discount-details extension (`extensions/discount-function-settings`, `admin.discount-details.function-settings.render`) is shipped; it persists field config to a `superapp_admin/discount_ui_refs` metaobject and writes the buyer's values to the paired discount Function's configuration metafield. |
| POS UI extension | `POS_RENDER_TARGETS`, `POS_EVENT_TARGETS`, `POS_TARGETS`, `POS_BLOCK_KINDS`, `POS_ACTIONS`, `POS_DATA_BINDINGS`, `POS_PRESENTATIONS` | `pos.extension` deployable. |
| Shopify Functions | `FUNCTION_APIS`, `FUNCTION_RUN_TARGETS` | Deployable once both the wasm is shipped AND its Shopify "owner object" activation is wired — see `ACTIVATION_WIRED_FUNCTION_TYPES` in `extension-eligibility.ts`. As of this writing that set covers `functions.discountRules`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `functions.cartAndCheckoutValidation`, `functions.fulfillmentConstraints`, and `functions.cartTransform`. `functions.shippingDiscount` and `functions.orderRoutingLocationRule` have shipped wasm but no activation kind yet (`needs_runtime`). `functions.localPickupDeliveryOption` and `functions.pickupPointDeliveryOption` are gated `needs_runtime` because their Shopify APIs are `unstable`-only. |
| Web pixel | `PIXEL_STANDARD_EVENTS` | `analytics.pixel` deployable (`WEB_PIXEL_UPSERT`). |
| Flow (app as connector) | `FLOW_EXTENSION_KINDS`, `FLOW_AUTOMATION_TRIGGERS`, `FLOW_STEP_KINDS` | `flow.automation` deployable. The compiler persists the flow definition (non-`AUDIT`) and `FlowRunnerService` (a live linear runtime) executes it server-side on Shopify webhooks, `MANUAL`/`SCHEDULED` triggers, and the agent API; long `DELAY`/wait steps park on the durable scheduler and resume via the cron sweep. Shopify Flow trigger/action extensions are shipped. |
| Platform extension blueprint | `BLUEPRINT_SURFACES` | `platform.extensionBlueprint` is a composite with no runtime of its own — see [§6](#6-blueprints--multi-module-generation) and [§10](#10-known-gaps). |

---

## 4. Module System v2: generic `theme.section`

The theme/storefront surface is **not** a fixed catalog of named types. A single generic type, `theme.section`, expresses any storefront section or app-block content:

- `config.kind` is a **free-form recommendation tag** (`'hero'`, `'faq'`, `'popup'`, `'custom'`, anything) — it drives preview/prompt hints only, never a schema constraint.
- `config.fieldSchema` + `config.fields` let the section declare its own typed settings.
- `config.blocks` holds repeatable content items for list/grid sections.
- `config.advancedCustom` is the sanitized escape hatch (`customHtml`/`customJs`; custom CSS lives in `style.customCss`) — scoped, CSP-bound, scripts stripped in the sandboxed preview.
- `config.activation` selects `section` | `global` | `overlay` placement.

The formerly-named types (`theme.banner`, `theme.popup`, `theme.notificationBar`, `theme.contactForm`, `theme.effect`, `theme.floatingWidget`) have all been **fully collapsed** into `theme.section` kinds — confirmed by `RECIPE_SPEC_TYPES` (§2) no longer containing any of them. A per-`kind` renderer registry in `PreviewService` dispatches known kinds to a rich renderer and falls back to a generic one for unknown kinds; the compiler is likewise unified behind `compileThemeSection`/`theme-module.ts`. Safety is unchanged — `RecipeSpec` still validates and the escape hatch runs through the same sanitize/scope/CSP/sandboxed-iframe machinery as before; only the *shape* is open, not the trust model.

**Control Packs (design, largely not wired in).** A follow-on design (`packages/core/src/control-packs/`) proposes composing each module type's settings from reusable "packs" (content, style, trigger, page-targeting, schedule, audience, etc.) instead of one hand-written Zod branch per type, with a schema-driven admin form (`SchemaForm.tsx`) replacing hand-coded settings UI. As of this writing this is **plumbing without payoff**: `AppSettings.moduleSystemVersion` exists in the schema (default `"v1"`) but no code path in `apps/web/app` reads it, so flipping it changes nothing observable. `SchemaForm.tsx` exists but its only live mount is the backend-data record form (`data.$storeKey.tsx`), not module settings. See [§10](#10-known-gaps).

---

## 5. Catalog & templates

Two independent things are both called "the catalog":

**1. The generated catalog** (`packages/core/src/catalog.generator.ts` / `catalog.generated.json` / `catalog.ts`) expands the allowed-values axes (surface × component × intent, plus trigger-aware variants, plus one canonical row per `RECIPE_SPEC_TYPES` entry) into typed, searchable catalog entries (`ModuleCatalogEntry`) used for AI grounding and discovery — not hand-written templates. `generateCatalog()`/`summarizeCatalog()` build it; `findCatalogEntry`/`findTypeEntry`/`filterCatalog` read it at runtime. The generator is strict: it throws rather than silently truncating if the entry count would exceed `DEFAULT_MAX_ENTRIES` (a literal named constant in the file, not a drifting count). Regenerate after changing the manifest: `pnpm --filter @superapp/core build && node packages/core/dist/catalog.generator.js`.

`apps/web/app/services/ai/catalog-details.server.ts` imports `MODULE_TYPE_TO_TEMPLATE_KIND` directly from `@superapp/core` (no local copy), so the AI's retry-context lookup can't drift from the generator.

**2. The curated template library** (`packages/core/src/templates/{modules,blocks,sections}/` plus `coverage.ts`) is a set of hand-authored `TemplateEntry` records, each a complete, Zod-valid `RecipeSpec` with metadata (name, description, category, tags), assembled into `ALL_TEMPLATES` by `templates/index.ts` and exposed as `MODULE_TEMPLATES` (`packages/core/src/templates.ts`, after `modernizeTemplateEntry` applies requires-flag/default injection). `coverage.ts` exists specifically to guarantee every `RECIPE_SPEC_TYPES` entry has at least one template. Merchants use these via `POST /api/modules/from-template { templateId }`; internal admin can override a type's default spec via `AppSettings.templateSpecOverrides` (`/internal/recipe-edit`), which `from-template` prefers when present.

**Correction:** an earlier version of this doc (and the archived `catalog.md`) described the curated library as "144 templates across four `_templates_partN.ts` files." Those files no longer exist — the library was restructured (phase 034) into the `templates/{modules,blocks,sections}/` directories described above. Do not cite a template count here; enumerate the directories at execution time if a count is genuinely needed (e.g. `find packages/core/src/templates -name '*.ts' | xargs grep -c "id:"`), and treat any such count as a snapshot, not a fact to repeat.

**Installability gates.** `getTemplateInstallability()` (`packages/core/src/templates.ts`) enforces a global "advanced-settings readiness" gate for every type, plus a data-save gate for types that must expose a concrete persistence path (`theme.section` kind `contactForm`, `flow.automation`, `integration.httpSync`, `analytics.pixel`). `POST /api/modules/from-template` enforces this before creating a draft.

**Search-augmented generation.** `apps/web/app/services/ai/solution-search.server.ts` ranks `MODULE_TEMPLATES` against a `RequirementSpec` (type match + token/tag overlap + capability-surface intersection) and returns the top matches as (a) grounding text injected into the create prompt and (b) `startFrom` options surfaced to the client — deterministic, no extra LLM hop.

---

## 6. Blueprints / multi-module generation

A **blueprint** lets one merchant request produce a coordinated *group* of modules (e.g. a product bundle needs a theme section + a cart-transform Function + an optional checkout block) instead of the default one-request-one-`RecipeSpec` path. Flag-gated: `BLUEPRINTS_ENABLED` (`apps/web/app/env.server.ts`, `isBlueprintsEnabled()`) defaults to **off** — single-module generation is unchanged when disabled.

A blueprint is not a new RecipeSpec type. Each member is a normal, independently valid `RecipeSpec`; the blueprint just groups them by reusing the existing `Recipe` row (`Recipe.modules`) plus roles/coordination notes. Flow:

```
request → classify(intent) → planBlueprint(intent)
  ├─ single    → generateValidatedRecipeOptions (unchanged default path)
  └─ blueprint → generateValidatedBlueprint (one best recipe per role, fan-out)
                 → POST /api/ai/create-blueprint → BlueprintService.createDraft
                 → POST /api/blueprints/:recipeId/publish → BlueprintService.publishBlueprint
```

`apps/web/app/services/ai/blueprint-catalog.ts` maps a known intent (e.g. `upsell.bundle_builder`, `promo.discount_reveal`) to its ordered module roles; `apps/web/app/services/ai/blueprint-planner.ts`'s `planBlueprint({ moduleType, intent })` returns `{ kind: 'single' }` for any uncatalogued intent (today's behavior, preserved) or a role-resolved blueprint plan. There is no `composeBlueprint` function anywhere in the codebase — see [§10](#10-known-gaps) for why that matters if you're looking for one. `BlueprintService` (`apps/web/app/services/blueprints/blueprint.service.ts`) owns `createDraft`, `getBlueprint`, `listBlueprints`, and `publishBlueprint`; the last co-deploys every member through the shared per-module `PublishService.publish`, resolving a "bundle triangle" (real product/variant GIDs) via `BundleProductService` before compiling when a member is a `functions.cartTransform` with `config.mode === 'BUNDLE'`. Co-deploy is non-atomic and idempotent: a failed member stays `DRAFT` (retryable) while others publish. The publish/activation half of this (owner-object activation, unpublish, rollback) belongs to [`docs/publishing.md`](./publishing.md) — this section only covers what generation produces.

---

## 7. Bundles & cart-transform generation

A generated "product bundle" spans three surfaces that the generator must produce coherently:

- **Product page widget** (`theme.section`, `config.kind: 'product-bundle'`) — an interactive bundle picker that posts every component variant to `/cart/add.js` with a shared `_superapp_bundle_id` line property.
- **Cart transform** (`functions.cartTransform`, backed by `extensions/superapp-cart-transform`) — groups cart lines sharing a `_superapp_bundle_id` and merges them into one native line via `cart.transform.run`'s `linesMerge` operation, reading its config from an `$app:bundle_config` metafield.
- **Checkout block** (optional, `checkout.block`) — a bundle/offer summary card.

The generator's job is limited to producing valid `RecipeSpec`s for these members with matching `bundleId`/SKU references (typically via a blueprint, [§6](#6-blueprints--multi-module-generation)); resolving those references to real Shopify GIDs and activating the cart-transform owner object happens at publish time, not generation time. See [`docs/publishing.md`](./publishing.md) for that half — do not duplicate the activation/orchestration mechanics here.

---

## 8. Module settings & installability gates

Beyond basic schema validity, each type has a set of settings that make a generated module *production-usable* rather than a bare-minimum demo (e.g. a popup needs a trigger, frequency cap, and an exit path; a contact form needs a defined submission path and retained-fields list). These expectations are enforced by four merchant-facing actions on the module-detail page, all reusing the same generation/validation pipeline rather than a parallel system:

- **Fill-missing** (`apps/web/app/services/ai/fill-missing-settings.server.ts`) — diffs the current config against expected controls and proposes only the missing keys via the pure `buildFillMissingDiff` helper, which never overwrites a merchant-set value. Live at `POST /api/ai/fill-settings`.
- **Regenerate** — full re-generation for the same type, preserving explicitly pinned keys.
- **Schema-driven form** — `SchemaForm.tsx` can render `{ jsonSchema, uiSchema, value }` from a hydrated `adminConfigSchemaJson`, but is not wired to it on any module-settings path (see [§10](#10-known-gaps)); the live builder (`generate._index.tsx`) edits `recipe.config` scalars directly.
- **Republish** — idempotent recompile + publish with rollback via the existing rollback route (`computeRepublishDiff` lives in `publish.service.ts`; there is no pre-republish diff preview in the UI as of this writing — it was removed).

`getTemplateInstallability()` ([§5](#5-catalog--templates)) is the enforcement point for curated templates; the fill-missing/regenerate actions are the enforcement point for already-created modules.

---

## 9. Capabilities and plan gating

Each RecipeSpec declares `requires: Capability[]` (`MODULE_TYPE_DEFAULT_REQUIRES`, [§2](#2-output-contract-recipespec)). `Capability` (`packages/core/src/capabilities.ts`) covers both Shopify platform surfaces (`THEME_ASSETS`, `APP_PROXY`, `DISCOUNT_FUNCTION`, `CHECKOUT_UI_INFO_SHIP_PAY`, `CUSTOMER_ACCOUNT_UI`, etc.) and Shopify data-surface flags used for template readiness (`PRODUCT_DATA`, `ORDER_DATA`, `METAOBJECT_DATA`, etc.). `MIN_PLAN_FOR_CAPABILITY` centralizes which capabilities require Shopify Plus — as of this writing that's `CHECKOUT_UI_INFO_SHIP_PAY` and `CART_TRANSFORM_FUNCTION_UPDATE`; everything else has no plan minimum. This check never blocks *deploy* — see `evaluatePlanEligibility` in `extension-eligibility.ts` — it only drives a merchant-facing "needs Shopify Plus" note.

`AppSubscription` and `PlanTierConfig` (the actual plan/billing schema, including internal plan overrides) are documented in [`docs/data-models.md`](./data-models.md); [`docs/architecture.md`](./architecture.md) §4 covers the concept at a glance. This doc owns the `Capability` enum itself and stops there, to avoid the three-way duplication `docs/README.md`'s own maintenance rule already warns against.

---

## 10. Known gaps

Stated plainly, verified against current code, no "planned" euphemisms without an owner:

- **`ConfigEditor.tsx` and `StyleBuilder.tsx` do not exist.** They are not merely unmounted — the files themselves are gone from `apps/web/app`. The live module builder (`generate._index.tsx`) edits `recipe.config` scalars directly instead of rendering a schema-driven form.
- **`composeBlueprint` does not exist.** Blueprint planning is `planBlueprint()` (`apps/web/app/services/ai/blueprint-planner.ts`); there is no function named `composeBlueprint` anywhere in the repo. If you're looking for "the function that assembles a blueprint," `planBlueprint` (planning) plus `BlueprintService.createDraft`/`publishBlueprint` (persistence/publish) is the real split — there is no single compose step.
- **Module System v2's Control Packs are designed, not wired.** `AppSettings.moduleSystemVersion` is a schema field nothing reads; `SchemaForm.tsx`'s only live mount is the backend-data record form, not module settings. Flipping the (unused) version flag changes no observable behavior. Treat `packages/core/src/control-packs/` as a real, unused foundation, not a shipped feature.
- **`platform.extensionBlueprint` is `needs_runtime`, not deployable.** As a standalone module it has no runtime of its own — publishing it directly would flip status to `PUBLISHED` while deploying nothing, so the eligibility registry gates it. Real blueprints ([§6](#6-blueprints--multi-module-generation)) still deploy correctly, through their individually-deployable members. This is the **only** non-function module type gated `needs_runtime` — every other fixed-family type in the registry (`theme.section`, `proxy.widget`, `checkout.upsell`, `checkout.block`, `postPurchase.offer`, `customerAccount.blocks`, `admin.block`, `admin.action`, `admin.discountUi`, `admin.link`, `admin.print`, `admin.segmentTemplate`, `pos.extension`, `analytics.pixel`, `flow.automation`, `integration.httpSync`, `messaging.campaign`, `agentic.catalogProfile`) is `deployable`.
- **`functions.localPickupDeliveryOption` and `functions.pickupPointDeliveryOption` are `needs_runtime`** — both target Shopify APIs that are `unstable`-only.
- **`functions.shippingDiscount` and `functions.orderRoutingLocationRule` have shipped wasm but no activation wiring yet** — gated `needs_runtime` until an `ActivationService` kind exists for them.
- **A previously-documented "false-published" bug for `checkout.block`/`postPurchase.offer`/`integration.httpSync`/`platform.extensionBlueprint` is stale.** An empirical all-type probe (closed against this repo's history) found only `platform.extensionBlueprint` was genuinely false-published; the other three are honestly `deployable` in the current eligibility registry. Don't re-cite the four-type version of this claim — re-check `extension-eligibility.ts` directly if this matters to a decision.
