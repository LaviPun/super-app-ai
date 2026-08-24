# Publishing contract

This is the authoritative description of what `PublishService.publish()`,
`UnpublishService.unpublish()`, and `RollbackService.rollbackToVersion()` actually
do to a merchant's Shopify store, as implemented on this branch
(`feat/ws-e-publish-integrity`, WS-E). It is written from the code — every claim
below cites the file that backs it. If this doc and the code ever disagree, the
code is right and this doc is stale; file an issue rather than trusting prose.

Source of truth for the write paths:
- `apps/web/app/services/publish/publish.service.ts` — `PublishService`
- `apps/web/app/services/publish/activation.service.ts` — `ActivationService`
- `apps/web/app/services/publish/unpublish.service.ts` — `UnpublishService`
- `apps/web/app/services/publish/rollback.service.ts` — `RollbackService`
- `apps/web/app/services/publish/embed-status.server.ts` — embed advisory
- `apps/web/app/services/publish/publish-preflight.server.ts` — the gate seam
- `packages/core/src/extension-eligibility.ts` — `ACTIVATION_WIRED_FUNCTION_TYPES`

---

## 1. What publish writes per surface

`PublishService.publish(spec, target, opts?)` compiles the module's `RecipeSpec`
via `compileRecipe` and then, for every non-function surface the compiler
produces a payload for, writes ONE handle-keyed metaobject plus appends its GID
to a shop-level `list.metaobject_reference` metafield ("refs list"). Every
metaobject write is an upsert keyed by a deterministic handle
(`superapp-<surface>-<moduleId>`), so republishing a module never creates a
duplicate — it's the same handle every time.

| Surface (compiler payload) | Metaobject type | Handle | Refs-list namespace/key |
|---|---|---|---|
| `themeModulePayload` | `$app:superapp_module` | `superapp-module-<moduleId>` | `superapp.theme` / `module_refs` |
| `adminBlockPayload` | `$app:superapp_admin_block` | `superapp-block-<moduleId>` | `superapp.admin` / `block_refs` |
| `adminActionPayload` | `$app:superapp_admin_action` | `superapp-action-<moduleId>` | `superapp.admin` / `action_refs` |
| `adminDiscountUiPayload` | `$app:superapp_admin_discount_ui` | `superapp-discount-ui-<moduleId>` | `superapp.admin` / `discount_ui_refs` |
| `adminLinkPayload` | `$app:superapp_admin_link` | `superapp-link-<moduleId>` | `superapp.admin` / `link_refs` |
| `adminPrintPayload` | `$app:superapp_admin_print` | `superapp-print-<moduleId>` | `superapp.admin` / `print_refs` |
| `adminSegmentTemplatePayload` | `$app:superapp_admin_segment_template` | `superapp-segment-template-<moduleId>` | `superapp.admin` / `segment_template_refs` |
| `checkoutUpsellPayload` | `$app:superapp_checkout_upsell` | `superapp-checkout-upsell-<moduleId>` | `superapp.checkout` / `upsell_refs` |
| `customerAccountBlockPayload` | `$app:superapp_customer_account_block` | `superapp-ca-block-<moduleId>` | `superapp.customer_account` / `block_refs` |
| `proxyWidgetPayload` | `$app:superapp_proxy_widget` | `superapp-proxy-<widgetId>` | none — looked up by handle at runtime |

These namespace/key constants are exported from `publish.service.ts`
(`THEME_MODULES_NAMESPACE`, `ADMIN_BLOCKS_NAMESPACE`, etc.) and re-imported by
`unpublish.service.ts` — publish and unpublish share the SAME constants so
teardown can never drift from what publish wrote (see §3).

Function modules (`functions.*`) go through a separate path: the compiler emits
a `FUNCTION_CONFIG_UPSERT` op carrying the function's config, which
`PublishService` writes to a `$app:superapp_function_config` metaobject
(handle `superapp-fn-<functionKey>`, namespace `superapp.functions`, ref key
`fn_<functionKey>`) via `writeFunctionConfig`. **The config metaobject alone
deploys nothing** — see §2.

Non-metaobject ops the compiler can also emit and `PublishService` writes:
`SHOP_METAFIELD_SET`/`SHOP_METAFIELD_DELETE` (plain shop metafields),
`METAOBJECT_ENSURE_DEF` (metafield-definition bootstrap), `WEB_PIXEL_UPSERT`
(one shared app web pixel per shop — idempotent update-or-create via
`WebPixelService`), and `THEME_ASSET_UPSERT`/`THEME_ASSET_DELETE` (native
`sections/superapp-*.liquid` push — see §1a).

### 1a. Native theme sections (flag-gated)

`THEME_ASSET_UPSERT`/`THEME_ASSET_DELETE` ops are only emitted when native
section push is requested, and `PublishService` refuses to execute them unless
`isThemeNativeSectionEnabled()` is true — otherwise it throws
`ThemeNativeSectionDisabledError` (`publish.service.ts:117-126`). The
shipping default is the app-block path (theme module metaobject + refs list,
§1 table row one), which never produces these ops — this branch is
unreachable for existing modules until the flag is turned on.

### 1b. Pre-publish Theme Check gate

When native-section push is enabled, every `THEME_ASSET_UPSERT`'s compiled
Liquid is run through `checkCompiledLiquid` before any store write
(`publish.service.ts:225-248`). `error`-severity offenses block the publish
when the gate is configured as blocking (`isThemeCheckGateBlocking()`);
warnings and a degraded/unavailable checker never block.

---

## 2. Function activation objects

Writing the `$app:superapp_function_config` metaobject makes the wasm's
`$app` metafield read return the merchant's configuration — but Shopify only
*executes* a Function if a matching **activation object** exists (a
`DiscountAutomaticApp`, `DeliveryCustomization`, `PaymentCustomization`,
`Validation`, `FulfillmentConstraintRule`, or `CartTransform`). `publish()`
writes both, in the same call, via `ensureFunctionActivation` /
`ActivationService.ensureForFunctionKey` (`publish.service.ts:336-348`).

| functionKey | Activation kind | Shopify object | Create mutation | Extra scope beyond `write_metaobjects` |
|---|---|---|---|---|
| `discountRules` | `discount` | `DiscountAutomaticApp` | `discountAutomaticAppCreate` | `write_discounts` |
| `deliveryCustomization` | `deliveryCustomization` | `DeliveryCustomization` | `deliveryCustomizationCreate` | `write_delivery_customizations` |
| `paymentCustomization` | `paymentCustomization` | `PaymentCustomization` | `paymentCustomizationCreate` | `write_payment_customizations` |
| `cartAndCheckoutValidation` | `validation` | `Validation` | `validationCreate` | `write_validations` |
| `fulfillmentConstraints` | `fulfillmentConstraintRule` | `FulfillmentConstraintRule` | `fulfillmentConstraintRuleCreate` | `write_fulfillment_constraint_rules` |
| `cartTransform` | `cartTransform` | `CartTransform` | `cartTransformCreate` (via `BundleProductService`, not `ActivationService.ensureForFunctionKey`) | `write_cart_transforms`, `write_products` |

Every kind stores its resulting GID in the `FunctionActivation` Prisma table
(`shopId_functionKey` unique), so a repeat publish returns the stored GID
without calling Shopify again (`ActivationService.getStored` /
`ensure*` early-return, `activation.service.ts:310-335`).

**Recovery/adoption, not blind create.** Before creating, each `ensure*`
method pages through the FULL corresponding Shopify connection (or, for
`fulfillmentConstraintRules` — a plain list, not a connection — a single
unpaginated call) looking for an existing object already bound to our
function, and adopts it instead of creating a second one
(`findExistingDiscountNode`, `findExistingDeliveryCustomization`,
`findExistingPaymentCustomization`, `findExistingValidation`, the
`fulfillmentConstraintRules.find()` in `ensureFulfillmentConstraintRule`).
This is the **one-owner-object invariant**: a second activation object bound
to the same function would make the wasm run twice per checkout/discount
evaluation — double-applying a discount, double-evaluating a delivery
customization, etc. Pagination caps at `MAX_*_LOOKUP_PAGES` (20 pages, 20
for validations at 25/page); hitting the cap **without** a verdict throws
`ActivationLookupUnverifiableError` rather than falling through to CREATE
(`activation.service.ts:65-93`). Discount adoption also retitles a matched
node to `"SuperApp Discounts"` if it doesn't already carry that title,
covering the legacy `"SuperApp Bundle Pricing"` title a pre-WS-E path wrote.

**Fail loud, never silently inert.** `ensureFunctionActivation` throws if
`session.shopId` is absent — a function module can never publish "successfully"
with config written but no activation object created
(`publish.service.ts:608-618`).

### `cartTransform`'s different path

`cartTransform` is wired differently from the other `ActivationService` kinds: the compiler no
longer emits a `FUNCTION_CONFIG_UPSERT` for it (there is no
`superapp-fn-cartTransform` metaobject — see
`apps/web/app/services/recipes/compiler/functions.cartTransform.ts`, comment
"the old `superapp-fn-cartTransform` metaobject was a second config source it
never read and is no longer written"). Instead, `publish()` special-cases
`spec.type === 'functions.cartTransform'` and calls
`publishCartTransform` (`publish.service.ts:213-215, 535-586`), which:

1. Resolves each bundle's component SKUs to store variants
   (`BundleProductService.resolveComponents`), requiring at least 2 resolved
   components per bundle.
2. Ensures a parent bundle product exists (`ensureParentBundleProduct`).
3. Runs `activateBundleCartTransformForPlan` — the **same** plan-aware
   activation implementation the blueprint co-deploy path uses — which
   creates/updates the `CartTransform` and writes the `$app:bundle_config`
   metafield the wasm actually reads (the only config source for this
   function).
4. Records the resulting `CartTransform` GID via
   `ActivationService.recordCartTransform` so unpublish/delete can find it
   (`FUNCTION_KEY_ACTIVATION.cartTransform` exists for the delete path only —
   `ActivationService.ensureForFunctionKey('cartTransform')` throws by design;
   see `activation.service.ts:324-329`).

A blueprint co-deploy can hand `publish()` a pre-resolved
`opts.cartTransformBundles` (present-but-empty means "no bundle resolved for
this member" → activation skipped entirely) instead of re-resolving from the
spec.

### The gate seam — `ACTIVATION_WIRED_FUNCTION_TYPES`

`classifyModulePublishability` (`publish-preflight.server.ts:227-256`) refuses
to report a `functions.*` module as publishable unless its type is in
`ACTIVATION_WIRED_FUNCTION_TYPES` (`packages/core/src/extension-eligibility.ts:634-641`)
— even when its wasm is deployed — UNLESS the caller sets
`ctx.activationHandledByCoDeploy` (blueprint co-deploy only; never set on the
single-module publish path). As of this branch the set contains every
function type that has activation wiring:

```
functions.discountRules, functions.deliveryCustomization,
functions.paymentCustomization, functions.cartAndCheckoutValidation,
functions.fulfillmentConstraints, functions.cartTransform
```

`functions.shippingDiscount` and `functions.orderRoutingLocationRule` have
deployed wasm (`DEPLOYED_FUNCTION_EXTENSION_HANDLES` in
`deployed-extensions.server.ts`) but are **not** in this set — they classify
`needs_runtime` until an `ActivationService` kind is added for them. **To
un-gate a new function type:** add its `FUNCTION_KEY_ACTIVATION` entry
(kind + Shopify mutation set, following the pattern in
`activation.service.ts`), add it to `ACTIVATION_WIRED_FUNCTION_TYPES`, and add
its required scope to `FUNCTION_TYPE_REQUIRED_SCOPES` in
`publish-preflight.server.ts` — no other seam needs touching.

---

## 3. Unpublish / delete semantics

`UnpublishService.unpublish(spec, target)` (`unpublish.service.ts`) is the
exact inverse of what `publish()` wrote for that same spec — it re-compiles
the SAME spec with the SAME `compileRecipe`, so teardown is derived from the
identical compile output rather than a hand-maintained mirror that could
drift.

**Ordering: refs BEFORE metaobject (E6).** For every refs-list surface
(§1's table), unpublish removes the GID from the refs-list metafield FIRST,
then deletes the metaobject LAST (`unpublish.service.ts:69-82`). This is the
inverse of a naive teardown order, deliberately: if a storefront/admin read
races the teardown, it can see either "ref present + object present" (normal)
or "ref absent + object present" (harmless — nothing points at it) — never
"ref present + object absent", which is a dangling reference that would
error at read time.

**Function surfaces.** For each `FUNCTION_CONFIG_UPSERT` op in the recompiled
result, `unpublishFunction` deletes the `fn_<functionKey>` shop metafield and
the config metaobject, then calls
`ActivationService.deleteForFunctionKey(functionKey)` to delete the Shopify
activation object (only if a GID is on record — `deleteForFunctionKey`
no-ops when nothing was ever stored, since a recovery-adoption delete is out
of scope for the normal unpublish path). Deletes are idempotent: a
`userErrors` message matching "not found" / "does not exist" / "doesn't
exist" is treated as success, not failure (`isMissingResourceError`,
`activation.service.ts:298-302`).

**Managed bundle-rule preservation.** The `discountRules` function-config
metaobject can carry rules the bundle-pricing path (non-Plus fallback) merged
in alongside the module's own rules, tagged `id: "bundle:*"`. Unpublish
strips only the module's rules and keeps the metaobject, its metafield ref,
and its activation object alive when managed rules remain
(`unpublish.service.ts:127-137`) — deleting them would silently break bundle
pricing for a merchant who never asked to unpublish bundles.

**`cartTransform`** has no `FUNCTION_CONFIG_UPSERT` op (§2) — unpublish keys
off `spec.type === 'functions.cartTransform'` directly and calls
`ActivationService.deleteForFunctionKey('cartTransform')`
(`unpublish.service.ts:107-113`). The parent bundle product is intentionally
**not** deleted (a merchant's past orders may reference it — matches Shopify
guidance against hard-deleting products).

**Shared web pixel guard.** The app writes ONE shared `WebPixel` per shop.
`maybeDeleteWebPixel` only deletes it when this was the LAST published
`analytics.pixel` module for the shop (`prisma.module.count` excluding the
module being unpublished) — unpublishing one pixel module while another is
still published leaves the shared pixel alone
(`unpublish.service.ts:149-164`).

### Route ordering: Shopify first, DB second

Both `api.modules.$moduleId.unpublish.tsx` and
`api.modules.$moduleId.delete.tsx` run Shopify cleanup BEFORE the DB
transition, and only flip the DB if cleanup succeeds:

- **Unpublish** (`api.modules.$moduleId.unpublish.tsx`): runs
  `UnpublishService.unpublish()`, then `ModuleService.markUnpublished()`
  (DB-only: flips every `PUBLISHED` version to `UNPUBLISHED`, module to
  `DRAFT` with `activeVersionId: null`). If cleanup throws, the module stays
  `PUBLISHED` (honest) and the merchant can retry — `UnpublishService` is
  idempotent so a retry never double-deletes.
- **Delete** (`api.modules.$moduleId.delete.tsx` → `ModuleService.unpublishThenDelete`,
  `module.service.ts:317-339`): for a `PUBLISHED` module, runs
  `UnpublishService.unpublish()` against the module's active/published
  version FIRST; only then does `prisma.module.delete()` run. A cleanup
  failure aborts the whole delete — nothing in the DB is removed, and the
  module is retryable. `ModuleService.deleteModule` (DB-only, no Shopify
  call) is documented as "use `unpublishThenDelete` wherever an admin client
  exists" — it exists for contexts with no Shopify session, not as an
  alternate default.

---

## 4. Rollback = republish

`RollbackService.rollbackToVersion(moduleId, version)`
(`rollback.service.ts`) does **not** just flip a DB pointer. It looks up the
target `ModuleVersion`, parses its `specJson` back into a `RecipeSpec`,
resolves the target's theme (for `theme.*` types — throwing if neither the
target version nor the module's current active version recorded a
`targetThemeId`, since rollback must never guess a theme), and runs the
**normal publish pipeline** — `new PublishService(...).publish(spec, target)`
— against that older spec. Only after that publish call resolves
successfully does it call `ModuleService.rollbackToVersion()`, which flips
`activeVersionId` to the target version's row AND sets `module.status` back
to `'PUBLISHED'` (`module.service.ts:281-289`).

Because every write `PublishService` makes is idempotent (handle-keyed
metaobject upserts, `MetafieldsSet`, activation ensure-calls), republishing
an older version converges every Shopify-side surface to that version's
state without needing any separate "undo" logic — rollback IS republish,
followed by a DB flip that only happens on success.

`ModuleService.rollbackToVersion` itself carries the comment "DB pointer flip
ONLY — never call directly for a live rollback; RollbackService republishes
first" — it is not safe to call in isolation from a live rollback flow.

---

## 5. Partial failure — the publish ledger

`PublishService` tracks every Shopify-writing step it completes during the
CURRENT `publish()` call in an in-memory ledger (`this.ledger`, reset at the
top of every call — `publish.service.ts:129-149, 181-182`). Each step runs
through the private `step()` helper, which either records `{ op, detail? }`
on success or, on failure, throws `PublishPartialFailureError` carrying:

- `failedOp` — the step name that threw (e.g. `FUNCTION_CONFIG_UPSERT:discountRules`)
- `completed` — every `PublishOpLedgerEntry` that succeeded before it, in order
- `cause` — the underlying error

The error message states explicitly: *"Republishing is safe — every completed
step is idempotent and a republish converges."* This is the actual recovery
contract, not just messaging — since every write is a handle-keyed upsert or
an idempotent ensure-call, a caller never needs to hand-diagnose which step
failed and manually clean up; **republish is the fix**.

Both merchant-facing publish routes surface this identically via one shared
helper, `publishPartialFailureResponse` in
`publish-error-response.server.ts` — a 502 JSON body with `error`, `code:
'PUBLISH_PARTIAL_FAILURE'`, `failedOp`, `completedOps`, and a `guidance`
string. `api.publish.tsx` (Builder, redirect-based) and
`api.agent.modules.$moduleId.publish.tsx` (module-detail's own
Publish/Republish button, JSON-based) both catch
`PublishPartialFailureError` and call this same helper — one implementation
so the two routes cannot drift in how they report a partial failure.

`internal.ops.tsx`'s `publish` intent runs the SAME `PublishService.publish()`
call before flipping the DB (`internal.ops.tsx:183-205`) — it does not have a
separate, possibly-diverging publish path; an internal-admin publish gets the
same real Shopify writes (and the same partial-failure semantics) as the
merchant-facing routes.

---

## 6. Embed activation — advisory, not blocking

A successful publish of a `theme.*` module writes the metaobject + refs-list
(§1) — but that alone does not make the module render on the storefront. The
merchant must ALSO have the "SuperApp Theme Modules" app embed block enabled
in the theme editor (`extensions/superapp-theme-app-extension`). Without it,
the write succeeds and nothing appears — a gap the merchant has no way to
notice from the publish flow alone.

`embed-status.server.ts` gives publish a read of that embed's live state,
**advisory only**: `getThemeEmbedStatus` never throws — any failure (missing
scope, theme gone, network error) degrades to `'unknown'` rather than ever
turning a real publish success into a reported failure
(`embed-status.server.ts:66-88`). It reads `config/settings_data.json` off
the theme's files and parses `current.blocks` for an entry whose `type`
contains `/blocks/superapp-theme-modules/` (`parseEmbedStatus`,
`embed-status.server.ts:42-58`), returning one of:

- `'enabled'` — block present, not disabled
- `'disabled'` — block present, merchant turned it off
- `'not_added'` — block never enabled on this theme
- `'unknown'` — parse/lookup failed, or content missing

`api.publish.tsx` reads this after a theme-module publish and, when the
status is anything but `'enabled'`, appends `&embed=<status>` to its
success redirect. `api.agent.modules.$moduleId.publish.tsx` returns the same
value as `embedStatus` in its JSON body. `modules.$moduleId.tsx` reads either
source (URL param or fetcher JSON) and shows a nudge banner with a
theme-editor deep link when the status isn't `'enabled'`.

`embedActivationDeepLink(shopDomain)` builds that link using the current
`api_key` + block-handle deep-link form (the older
`shopify://apps/.../{uuid}` form is deprecated):

```
https://<shop>/admin/themes/current/editor?context=apps&template=index&activateAppId=<apiKey>/superapp-theme-modules
```

---

## 7. Internal-ops parity

`internal.ops.tsx`'s `publish` and `rollback` intents call the SAME
`PublishService` / `RollbackService` classes the merchant-facing routes use —
there is no separate internal-only publish implementation. The `publish`
intent explicitly documents why: "this intent used to call ONLY the DB flip
below, so an internal admin could mark a module 'published' with zero
Shopify writes, silently diverging from the merchant `/api/publish` path" —
that gap is closed; real publish runs first, and only a successful Shopify
deploy moves the DB pointer (`internal.ops.tsx:183-220`).

---

## Historical note

An earlier iteration of this workstream (WS-QF) gated function-module
publishability behind symbols named `FUNCTION_ACTIVATION_UNWIRED` and
`functionActivationGap`, with a `ctx.activationHandledByCoDeploy` escape
hatch for blueprint co-deploy. WS-E (this branch) replaced the gate itself
with `ACTIVATION_WIRED_FUNCTION_TYPES` (§2) as each function type's real
activation wiring landed, while preserving the co-deploy escape hatch and its
tests. There is no "progressive publish" or "canary" mechanism in the
publish path — those terms do not describe anything in
`PublishService`/`UnpublishService`/`RollbackService`.
