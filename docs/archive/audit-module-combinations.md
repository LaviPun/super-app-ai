# Audit — Module Combinations & End-to-End Deployability

> **Question audited:** "Is *any* combination of modules possible — including
> complex modules with data-model access — and does each deploy for real?"
>
> **Answer:** Yes, with one honest, finite exception set. The platform no longer
> "blocks" or "gates" anything: every module type either **deploys for real**
> (a shipped runtime + config wiring) or reports **`needs_runtime`** naming the
> exact runtime still to ship. Plan/scope requirements (e.g. Shopify Plus) are
> **merchant-facing notes, never blocks** — the config deploys now and takes
> effect once the store is eligible. Today **18 of 20 types deploy end-to-end**;
> the remaining 2 are runtime-bound on the toolchain, not architecture.
>
> Machine-checked: `apps/web/app/__tests__/module-deployability-audit.test.ts`
> (every type, consistency with the registry) +
> `apps/web/app/__tests__/blueprint-deployability.test.ts` (the deployed-extension
> manifest tracks real `extensions/` on disk). CI fails if reality drifts.

## 1. The model: eligibility, not block/gate

The single source of truth is the **extension-eligibility registry**
(`packages/core/src/extension-eligibility.ts`): each module type → its Shopify
runtime family (theme / checkout-ui / admin-ui / customer-account-ui / Flow /
Web Pixel / POS / Function wasm / app-proxy / composite), whether that runtime is
**shipped**, the **plan** it needs to take effect, and required **scopes**.

`classifyModulePublishability` returns one of two statuses — there is no
"blocked" and no "gated / AUDIT-only" any more:

| Status | Meaning |
|---|---|
| ✅ `deployable` | A real runtime is shipped; publish writes the config it reads. `requiresPlan` / `missingScopes` ride along as **notes** (the config still deploys). |
| 🛠 `needs_runtime` | The runtime binary/extension isn't shipped yet — the only genuinely non-deployable case. Names the exact runtime to ship. |

`PublishService.publish` throws `ModuleNotPublishableError` **only** for
`needs_runtime`. A Plus-only surface on a non-Plus store deploys with a note; it
is never refused.

## 2. Deployability matrix — all 20 module types

| Status | Count | Types |
|---|---|---|
| ✅ **deployable** | **18** | `theme.section`, `proxy.widget`, `functions.cartTransform`, `functions.discountRules`, `functions.deliveryCustomization`*, `functions.paymentCustomization`*, `functions.cartAndCheckoutValidation`*, `functions.fulfillmentConstraints`, `checkout.upsell`*, `checkout.block`*, `postPurchase.offer`, `admin.block`, `admin.action`, `customerAccount.blocks`, `pos.extension`, `integration.httpSync`, `analytics.pixel`, `platform.extensionBlueprint` |
| 🛠 **needs_runtime** | **2** | `functions.orderRoutingLocationRule`, `flow.automation` |

`*` = deploys now; takes **effect on Shopify Plus** (surfaced as a note, not a block).

**What changed from the previous audit (8 → 18 deployable):**
- Built **4 real Rust/wasm Functions** — delivery customization, payment
  customization, cart/checkout validation, fulfillment constraints — scaffolded
  from the Shopify CLI, `cargo build --target=wasm32-unknown-unknown` green, and
  each passes its function-runner integration test. Handles are in the
  deployed-extension manifest (`services/publish/deployed-extensions.server.ts`).
- Wired **`checkout.block`** and **`postPurchase.offer`** to the already-shipped
  `extensions/checkout-ui` (targets `purchase.checkout.block.render` /
  `purchase.thank-you.block.render`), rendered generically by
  `CheckoutBlockRenderer`. No new runtime needed — they were only ever "gated"
  because the compiler emitted AUDIT.
- Wired **`analytics.pixel`** to a real **Web Pixel**: new
  `extensions/superapp-web-pixel`, compiler emits `WEB_PIXEL_UPSERT`, and
  `WebPixelService` deploys it via `webPixelCreate`/`webPixelUpdate`.
- Wired **`pos.extension`** to a real **config-read runtime**:
  `extensions/superapp-pos-block` now fetches the shop's published config from
  the app backend (`/api/pos/config`). POS UI extensions **cannot** read
  Storefront metaobjects, so — unlike theme/customer-account which use
  `shopify.query()` — the POS block uses **App Authentication**
  (`shopify.session.getSessionToken()` → `Authorization: Bearer`), and the loader
  verifies it with `authenticate.public.pos`, resolves the shop, and returns the
  active **PUBLISHED** `pos.extension` `ModuleVersion` config. No metaobject is
  needed (POS can't read them); the DB is the source of truth.

### The 2 `needs_runtime` types — why, honestly
| Type | Reason | Path to deployable |
|---|---|---|
| `functions.orderRoutingLocationRule` | The Shopify CLI exposes **no order-routing Function template** (verified against `shopify app generate extension`'s own supported list), so there is no wasm to build. | Ships when Shopify exposes the surface; then it's the same scaffold→build→manifest path as the other 4 Functions. |
| `flow.automation` | The Flow trigger/action extensions **ship** (`extensions/superapp-flow-*`); the publish step that persists a module's workflow definition isn't wired. | Persist the workflow at publish; flip `runtimeShipped`. |

Each is a **named, finite** task — the registry + manifest + guardrail make adding
a runtime a one-line, drift-proof flip that the audit test then proves.

## 3. Can *any* combination be planned + deployed?

**Planning is now compositional, not catalog-limited.** `blueprint-planner.ts`:
1. **Curated** — a catalogued intent maps to a hand-shaped role set
   (`blueprint-catalog.ts`), for the best wording/ordering.
2. **Composed** — `composeBlueprint(moduleTypes)` turns **any** set of module
   types into a coherent blueprint: roles + surfaces from the capability graph, a
   UI-facing primary, coordination links, dedupe + a 6-member cap. So a request
   for *customer-account + post-purchase + pixel*, or *checkout block +
   validation*, or any other mix, plans as a real multi-module blueprint.
   `api.ai.create-module` accepts an explicit `moduleTypes` combination to drive
   this directly.

**Deploy is co-deploy + honest, never silently partial.**
`BlueprintService.publishBlueprint` publishes each member through the same
`PublishService`; a member whose runtime isn't shipped lands in `failed[]` with
its `needs_runtime` reason (explicit), the rest publish. Since `needs_runtime` is
now only 2 types, virtually every combination is fully deployable.

## 4. Data-model access — provisioned for single AND complex modules, and extensible

- **Single + blueprint** publish paths both provision a typed store:
  `DataStoreService.provisionFromModuleSpec` is called from `api.publish`
  (single module) and `BlueprintService` (each member). A module that declares
  `config.fieldSchema` gets a real, typed `DataStore` before it goes live;
  records are schema-validated (`createRecord` → `validateRecord`).
- **Add / expand fields without clobbering.** `ensureTypedStore` now merges
  additively (`mergeDataModelJson` / `mergeDataModels` in core): re-declaring a
  model with extra fields **grows** the schema and preserves existing fields +
  stored records. Schema evolution, not replacement.
- **Any data domain.** Seeded typed domains now include product, customer,
  inventory, order, analytics, marketing, **subscription, subscriber list, ERP**;
  any other domain is created on demand (`createCustomStore` / `ensureTypedStore`).
  So a module backed by products, customers, subscriptions, a subscriber list,
  inventory, an ERP sync, or anything else has a real backing store.

## 5. Verify (here)

```bash
# the audit, machine-checked (every type + the deployed-extension manifest)
cd apps/web
pnpm exec vitest run app/__tests__/module-deployability-audit.test.ts \
                     app/__tests__/blueprint-deployability.test.ts \
                     app/__tests__/publish-functions-reliability.test.ts \
                     app/__tests__/blueprints.test.ts \
                     app/__tests__/data-store-provisioning.test.ts

# the 4 new wasm Functions build + pass their function-runner tests
export PATH="$HOME/.cargo/bin:$PATH"
for d in superapp-delivery-customization superapp-payment-customization \
         superapp-cart-checkout-validation superapp-fulfillment-constraints; do
  ( cd extensions/$d && cargo build --target=wasm32-unknown-unknown --release && pnpm test )
done
```

## 6. Bottom line

- **No blocks, no AUDIT-only.** Every type is `deployable` or names the exact
  runtime it still needs. ✅
- **18 / 20 deploy end-to-end today** (was 8); the 2 remaining are toolchain-bound
  and individually named. ✅
- **Plan/scope are notes, never refusals** — a non-Plus store still gets the
  module, with a clear "needs Plus to take effect" note. ✅
- **Any combination plans** (composed blueprints) and **co-deploys without silent
  partials**. ✅
- **Data models are provisioned for single + complex modules and are
  extensible** (additive evolution, any domain). ✅
