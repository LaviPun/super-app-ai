# Runbook: Live-store publish integrity probe

**Type:** One-time owner-run verification sequence (not an incident runbook)
**Owner:** requires `shopify app deploy` access for this app, a dev store with this
branch's app installed, and admin GraphiQL access on that store.

**STATUS: Not yet executed — requires a dev store + this branch (`feat/ws-e-publish-integrity`)
deployed.** Nothing below has been run against a live app or dev store. This
doc is the step list Task 17 specified, converted to a runbook so it can be
executed and its results recorded once a dev store and deploy are available.
Do not treat any step below as verified until this STATUS line is updated with
a real execution date and result.

---

## Why this exists

WS-E (six function activations, `UnpublishService`, `RollbackService`, the
publish ledger, the embed-activation advisory — see
[`docs/publishing.md`](../publishing.md) for the code-level contract) is
code-complete and unit-tested, but nothing in that test suite exercises a real
Shopify store: activation objects, discount nodes, cart-transform merges, and
theme-embed rendering only exist once real GraphQL mutations run against a
real shop. This probe is that missing leg — it publishes real modules on a
dev store and checks the actual Shopify objects and storefront/checkout
behavior they produce.

**Precondition:** Tasks 1–15 merged (function activations, unpublish, rollback,
ledger, embed check — all present on this branch); `shopify app deploy` run
with the new scopes from Tasks 6–7 (`write_validations`,
`write_fulfillment_constraint_rules`) plus the current extension set;
merchant re-consent completed on the dev store (the app must show the "update
permissions" banner on next open, per
[`docs/runbooks/scope-reconsent.md`](./scope-reconsent.md) — **the 21-scope
list in that runbook must be granted before any of the function-activation
steps below (Steps 2, 4, 5, 6) will work live**; a shop still on the pre-WS-E
scope grant will see `ACCESS_DENIED` on the activation mutations, which looks
like a bug but is actually a missing-consent state). Ideally WS-A's stable
tunnel URL is in place; otherwise the tunnel must stay up for the whole probe
(all 7 steps), since a dropped tunnel mid-step reads as a failure that isn't
one.

---

## Step 1 — Deploy + baseline

```bash
shopify app deploy --config dev
```

Confirm the CLI's version-summary output lists every function extension —
expect the handles in `DEPLOYED_FUNCTION_EXTENSION_HANDLES`
(`apps/web/app/services/publish/deployed-extensions.server.ts`): `cart-transform-function`,
`discount-function`, `superapp-delivery-customization`,
`superapp-payment-customization`, `superapp-cart-checkout-validation`,
`superapp-fulfillment-constraints`, `superapp-shipping-discount`,
`superapp-order-routing`.

Open the app on the dev store. Expected: Shopify shows the "update
permissions" re-consent banner (validations + fulfillment-constraint scopes,
per `scope-reconsent.md`). Approve it.

**Record:** CLI output (or a summary of which handles appeared), whether the
re-consent banner appeared and was approved.

Once this probe is green end-to-end, run the closing production release:

```bash
shopify app deploy --config production
```

---

## Step 2 — Handle-casing verdict (finding 8)

In the app, publish a `functions.discountRules` module (create from a
discount template → Publish). Then, via the Dev CLI GraphiQL
(`shopify app dev` console) or any admin GraphQL client, run BOTH:

```graphql
query A { metaobjectByHandle(handle: { type: "$app:superapp_function_config", handle: "superapp-fn-discountRules" }) { id handle } }
query B { metaobjectByHandle(handle: { type: "$app:superapp_function_config", handle: "superapp-fn-discountrules" }) { id handle } }
```

**Expected outcome A (handles survive as-written):** query A returns the
object with `handle: "superapp-fn-discountRules"`; query B returns `null`.
Verdict: **no fix needed** — record the verdict below and move on.

**Expected outcome B (Shopify lowercased it):** query A returns `null`; query
B returns the object, with its `handle` field reading
`"superapp-fn-discountrules"`. Verdict: every camelCase-keyed function read is
broken (the wasm's `$app` metafield read resolves to `null` config for every
function type). This is a code-fix outcome, **not covered by this doc-only
task** — do not attempt the fix as part of running this probe. If outcome B is
observed, stop, do not apply any code change under this runbook, and report
the finding so it can be scoped as its own task (the fix is fully specified in
`.superpowers/sdd/2026-08-24-ws-e-publish-integrity/task-17-brief.md` Step 2,
including the exact `metaobject.service.ts`/`unpublish.service.ts` normalization
and the nine `extensions/*/src/*.graphql` files it touches, plus the pin test
at `apps/web/app/__tests__/function-handle-casing.test.ts`).

**Record:** which query returned the object, the exact `handle` string
observed, and the verdict (A or B).

---

## Step 3 — `theme.section` end-to-end

Publish a `theme.section` module to the main theme.

Expected sequence:
1. Publish succeeds; the response redirect carries `embed=not_added` (a fresh
   store has never enabled the embed) — a banner with the theme-editor deep
   link (`embedActivationDeepLink`, `apps/web/app/services/publish/embed-status.server.ts`)
   appears on the module-detail page.
2. Click the deep link → the theme editor opens with the "SuperApp Theme
   Modules" embed pending activation.
3. Enable it + Save.
4. Open the storefront → the module renders.
5. Click **Unpublish** on the module (`/api/modules/:id/unpublish`) → the
   storefront no longer renders it.
6. In GraphiQL: `metaobjectByHandle(handle: { type: "$app:superapp_module", handle: "superapp-module-<id>" })`
   returns `null`.
7. The `superapp.theme` / `module_refs` shop metafield no longer contains that
   module's GID.

**Record:** observed `embed=` param value, whether the deep link landed on the
correct embed toggle, storefront render before/after unpublish, and the two
GraphQL/metafield residue checks (steps 6–7) — this is the "unpublish leaves
no residue" check for the theme surface.

---

## Step 4 — `discountRules` end-to-end

With the Step 2 module published, in GraphiQL:

```graphql
query { discountNodes(first: 50) { nodes { id discount { __typename ... on DiscountAutomaticApp { title } } } } }
```

Expected: exactly one `DiscountAutomaticApp` node titled `"SuperApp
Discounts"`. If a legacy `"SuperApp Bundle Pricing"` node predated the probe,
confirm it was adopted/retitled to `"SuperApp Discounts"` (per
`ActivationService.ensureDiscount`'s adoption+retitle path in
`docs/publishing.md` §2), not duplicated alongside a second node.

On the storefront, build a cart matching the module's discount rule →
confirm the discount line appears in cart and at checkout.

Republish the module (no spec changes) → confirm the `discountNodes` count is
unchanged (idempotent — the stored `FunctionActivation` GID short-circuits a
second create).

Unpublish → confirm the discount no longer applies at checkout, and that the
`DiscountAutomaticApp` node was deleted — UNLESS the module had managed
bundle-pricing rules merged into its config (`docs/publishing.md` §3,
"managed bundle-rule preservation"), in which case the node is expected to
survive; note which case ran.

**Record:** the `discountNodes` query result before/after publish, the
checkout discount-line observation, the republish idempotency check, and the
unpublish outcome (deleted vs. preserved-for-managed-rules, with which case
applied).

---

## Step 5 — Remaining function surfaces (spot check)

Publish one module each for: `deliveryCustomization` (requires a **Shopify
Plus** dev store — if the dev store isn't Plus, record the `userErrors`
behavior instead of a live checkout effect), `paymentCustomization`,
`cartAndCheckoutValidation`, `fulfillmentConstraints`.

For each, expected sequence: publish succeeds → the corresponding admin list
query shows our object → the behavior manifests at checkout → unpublish
removes the object.

| Module type | List query | Storefront/checkout effect |
|---|---|---|
| `deliveryCustomization` | `deliveryCustomizations` | Delivery options renamed/reordered |
| `paymentCustomization` | `paymentCustomizations` | Payment methods filtered |
| `cartAndCheckoutValidation` | `validations` | Invalid cart blocked with the configured message |
| `fulfillmentConstraints` | `fulfillmentConstraintRules` | Constraint visible in Fulfillment settings |

**Record:** per module type — plan-gate outcome (Plus or not, and any
`userErrors` seen), the list-query result, the checkout/admin-surface
observation, and the unpublish/object-removal result.

---

## Step 6 — `cartTransform` end-to-end

Publish a `functions.cartTransform` bundle module with two real dev-store
SKUs.

Expected sequence:
1. A `superapp-bundle-*` parent product exists.
2. `cartTransforms(first: 5)` shows one transform bound to this shop.
3. Adding both bundle components to cart merges them into the bundle line at
   the configured price.
4. Unpublish → the transform is deleted; the cart no longer merges the
   components.
5. Confirm NO `superapp-fn-cartTransform` metaobject was ever created (per
   `docs/publishing.md` §2, the compiler stopped emitting this — see
   `apps/web/app/services/recipes/compiler/functions.cartTransform.ts`):
   `metaobjectByHandle(handle: { type: "$app:superapp_function_config", handle: "superapp-fn-cartTransform" })`
   returns `null` — and check the lowercase variant too, per whichever verdict
   Step 2 established.

**Record:** the parent product, the `cartTransforms` query result, the cart
merge behavior, the post-unpublish state, and both `metaobjectByHandle`
null-checks.

---

## Step 7 — Record results

Once Steps 1–6 have actually run against a live dev store, append a dated
"live probe" section to [`docs/publishing.md`](../publishing.md) with the
observed outputs for each step (not a restatement of the expectations above —
the actual query results, error messages, and screenshots/notes from the run).
Only write that section once the verification actually happened — do not
pre-date or pre-write a "verified" claim, matching the discipline in
`scope-reconsent.md`.

If Step 2 found outcome B (Shopify lowercased the handle), the resulting
code-fix task is separate from this runbook — link to wherever that task is
tracked rather than describing the fix as done here.

---

## Owner-run vs blocked/conditional — quick reference

| Step | What it is | Blocker / where |
|---|---|---|
| 1. `shopify app deploy --config dev` + re-consent | CLI + owner action | Live dev store, Partner/CLI access |
| 2. Handle-casing verdict | Owner action (GraphiQL) | Live dev store — **STOP, do not code-fix under this runbook if outcome B** |
| 3. `theme.section` end-to-end | Owner action | Live dev store, theme editor, storefront |
| 4. `discountRules` end-to-end | Owner action | Live dev store, checkout |
| 5. Remaining function surfaces | Owner action | Live dev store; `deliveryCustomization` needs Shopify Plus |
| 6. `cartTransform` end-to-end | Owner action | Live dev store, two real SKUs |
| 7. Record results in `docs/publishing.md` | Doc edit | This repo, only after Steps 1–6 actually ran |
| Closing `shopify app deploy --config production` | CLI | Only after the probe is green |

---

Cross-reference: [`docs/runbooks/scope-reconsent.md`](./scope-reconsent.md) for
the 21-scope re-consent rollout this probe depends on, and
[`docs/publishing.md`](../publishing.md) for the code-level contract every
expected outcome above is derived from. Style follows
[`docs/runbooks/app-pricing-setup.md`](./app-pricing-setup.md) /
`scope-reconsent.md` (status header, owner-run vs blocked/conditional table,
explicit "don't fabricate success" discipline).
