# Reality Audit — Extension Eligibility + Compiler + Publish

Scope: `packages/core/src/extension-eligibility.ts` registry; compiler dispatch in
`apps/web/app/services/recipes/compiler`; `classifyModulePublishability` +
`publish-preflight`; the live publish path (`api.publish.tsx` → `PublishService.publish`).

Method: traced the live path from `api.publish.tsx` down to what actually writes to
Shopify / the DB, and cross-checked every registry claim against the compiler that runs
for that type. `wired ∈ {live | built-not-wired | stub | absent}`,
`verdict ∈ {required | not-required | already-executed | partial}`,
`action ∈ {keep | wire-up | prune | rebuild | document-honestly}`.

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

Re-run against branch `feat/027-unified-builder`, HEAD `4f056da` (prior audit was pre-`4f056da`,
against `feat/superapp-redesign @ a948f1c`). Each prior finding re-checked at current file:line.

| Prior finding | Status now | Current evidence |
|---|---|---|
| **checkout.block false-published** — `runtimeShipped:true`, compiler routes to bare AUDIT, writes nothing, still flips PUBLISHED | **STILL-OPEN** | Registry `runtimeShipped:true` (extension-eligibility.ts:157-164). Compiler switch still lumps it into the bare-AUDIT fallthrough (compiler/index.ts:49-58) → `{ ops: [{ kind: 'AUDIT' }] }`, **no `checkoutUpsellPayload`**. `compileCheckoutBlock` (checkout.block.ts:12-24) still exists, still sets a real payload, still **never imported/dispatched** (grep for callers = 0). Publish gate passes (`willDeploy:true`), AUDIT is a no-op (publish.service.ts:134-135), `markPublishedWithTransition` flips PUBLISHED (api.publish.tsx:227). |
| **postPurchase.offer false-published** — same shape | **STILL-OPEN** | Registry `runtimeShipped:true` (extension-eligibility.ts:165-171). Same bare-AUDIT fallthrough (compiler/index.ts:50). `compilePostPurchaseOffer` (postPurchase.offer.ts:11-23) exists + orphaned (0 callers). Identical false-publish. |
| **integration.httpSync false-published** — `deployable` but no server-side sync runner | **STILL-OPEN** | Registry `runtimeShipped:true` (extension-eligibility.ts:220-226). Bare-AUDIT fallthrough (compiler/index.ts:52). No executor reads a PUBLISHED httpSync config anywhere outside AI/schema/preview. Passes gate, writes nothing. |
| **platform.extensionBlueprint false-published** — composite "deploys via members" but no decomposition at publish | **STILL-OPEN** | Registry `runtimeShipped:true` (extension-eligibility.ts:252-258). Bare-AUDIT fallthrough (compiler/index.ts:54). `PublishService.publish` performs no member decomposition — composite publish still unimplemented on this path. |
| **flow.automation mislabeled `needs_runtime` though a live linear runtime exists** | **STILL-OPEN (unchanged)** | Registry still `runtimeShipped:false` (extension-eligibility.ts:209-217); still in test's `EXPECTED_NEEDS_RUNTIME` (module-deployability-audit.test.ts:37-38). `FlowRunnerService` still queries `type:'flow.automation', status:'PUBLISHED'` and executes (flow-runner.service.ts:90-99, 144-158). Merchant/agent publish still throws at the gate; internal-ops path can still bypass. |
| **pos.extension "deploys" via a DB-read path, not a compiler write** | **STILL-OPEN / not-a-bug (unchanged)** | Registry `runtimeShipped:true` (extension-eligibility.ts:240-249). Compiler emits bare AUDIT (compiler/index.ts:51), writes no metaobject — but `readPublishedPosConfig` reads the PUBLISHED `ModuleVersion` RecipeSpec from the DB (pos-config.server.ts:11-16, `status:'PUBLISHED'`), which publish *does* persist. So POS renders real config; it works *despite* the AUDIT compiler. Genuinely deployable, just via a non-compiler path. |
| **admin.discountUi ADDED** (`runtimeShipped:false` → needs_runtime, AUDIT-compiles) — count now 22? | **CHANGED (new since prior)** | Real: it was added (registry extension-eligibility.ts:191-197, `runtimeShipped:false`; schema variant recipe.ts). But total is **21**, not 22 — it took `RECIPE_SPEC_TYPES` from 20→21 (allowed-values.ts:530-559, 21 entries). It is honestly `needs_runtime` (discount-details admin extension not built in `extensions/`), gated before publish. |
| **admin.discountUi has NO compiler case → falls to `default: never`** (prior §2b) | **CHANGED → FIXED** | The compiler now has an **explicit `case 'admin.discountUi':`** in the bare-AUDIT group (compiler/index.ts:55-58). It no longer reaches `default: never`. Masked on the merchant path anyway by the `needs_runtime` gate, but the "silently returns the spec cast to CompileResult for un-gated direct callers" hazard is now closed for this type. |
| **Headline count "20 / 18-of-20"** | **CHANGED (still inflated, new numbers)** | Now **21** types; the needs_runtime set is exactly 3 (`functions.orderRoutingLocationRule`, `flow.automation`, `admin.discountUi` — module-deployability-audit.test.ts:33-41), so the test asserts **18 deployable** (line 72-78: `21 − 3`). But "deployable" here means only `isRuntimeShipped`, *not* "compiler writes something" — so the 18 still includes the 3-4 false-published types above. |

**NEW findings this pass:**
- **N1 — The audit test's safety property is still `runtimeShipped`, never "compiler wired."** `module-deployability-audit.test.ts:56-63` asserts the classifier *agrees with the registry*, and lines 72-78 count `isRuntimeShipped`. Neither asserts the compiler dispatch emits a non-AUDIT op/payload. So checkout.block / postPurchase.offer / integration.httpSync / blueprint pass every test while writing nothing. The seam that produced the false-publish is un-tested at HEAD.
- **N2 — `admin-discount-ui-type.test.ts` pins the *gate*, not a compiler.** It asserts `classifyModulePublishability(discountUi).status === 'needs_runtime'` and a real preview (admin-discount-ui-type.test.ts:27-41). Correct, but it only proves the gate blocks publish; it does not exercise the new `admin.discountUi` compiler case (which is a bare AUDIT anyway).
- **N3 — Two orphaned real compilers remain dead code** (`compileCheckoutBlock`, `compilePostPurchaseOffer`); their own doc-comments claim "a real, rendered deploy — not an AUDIT no-op," which is the exact opposite of what the live dispatch does. Doc-vs-reality contradiction persists verbatim.

Net delta: **2 fixed** (admin.discountUi missing-case → now has explicit case [FIXED]; stale "20-type" count → now honestly 21 in the registry/schema/tests [the number moved, the inflation framing did not]) — of which only the compiler-case one is a genuine behavior fix. **6 still-open** (checkout.block, postPurchase.offer, integration.httpSync, platform.extensionBlueprint false-publishes; flow.automation mislabel; the un-tested runtimeShipped↔compiler seam).

---

## 0. Headline count discrepancy

- **Claim:** MEMORY.md and multiple docs say "**20 types**" and "18/20 deploy".
- **Reality:** `RECIPE_SPEC_TYPES` has **21** entries (`packages/core/src/allowed-values.ts:530-559`),
  and `RecipeSpecSchema` has 21 discriminated-union variants (`packages/core/src/recipe.ts`).
  The 21st is `admin.discountUi`, added after the "20" narrative was written. The audit test now
  encodes 18 deployable = 21 − 3 needs_runtime (module-deployability-audit.test.ts:72-78).
- **wired:** live (all 21 are real schema variants) · **verdict:** partial · **action:** document-honestly (the "20" number is stale; "18 deployable" over-counts because it means runtimeShipped, not compiler-wired).

---

## 1. The eligibility registry itself

**Claim (extension-eligibility.ts:1-24):** "single source of truth for HOW every module
type deploys… `deployable` = a real runtime is shipped; `needs_runtime` = runtime not
shipped yet." `listExtensionEligibility()` maps every `RECIPE_SPEC_TYPES` entry.

**Reality:** The registry `REGISTRY` (extension-eligibility.ts:107-259) has an entry for
every one of the 21 types; `getExtensionEligibility` (274-277) and `isRuntimeShipped`
(294-301) are pure functions with no side effects. It is genuinely consulted on the live
path: `classifyModulePublishability` (publish-preflight.server.ts:103-133) delegates to it,
and `PublishService.publish` calls that classifier first (publish.service.ts:55-58).
The registry is **live and load-bearing** as a *gate*. Its weakness is that
`runtimeShipped` is a **hand-maintained static boolean** for non-function runtimes — it
encodes a human's claim about `extensions/`, not a check of it, and several of those
booleans claim `deployable` for types whose compiler writes nothing (see §2).

- **wired:** live · **verdict:** required · **action:** keep (but fix the specific stale booleans below).

---

## 2. Compiler dispatch — the core defect

**Claim:** every type "compiles" to ops the publisher writes; docs frame `checkout.block`
and `postPurchase.offer` compilers as "a real, rendered deploy — not an AUDIT no-op"
(compiler/checkout.block.ts:4-11, compiler/postPurchase.offer.ts:4-10).

**Reality — `compileRecipe` switch (compiler/index.ts:18-64):**

| Group | Types | What the dispatch does |
|---|---|---|
| Real compiler called | theme.section, proxy.widget, all 7 `functions.*`, checkout.upsell, customerAccount.blocks, admin.block, admin.action, analytics.pixel (14) | dispatched to their compiler, which emits real ops/payloads |
| **Bare-AUDIT fallthrough** (index.ts:49-58) | checkout.block, postPurchase.offer, pos.extension, integration.httpSync, flow.automation, platform.extensionBlueprint, **admin.discountUi** (7) | returns **`{ ops: [{ kind: 'AUDIT' }] }` only** — no payload, no config op |

The `AUDIT` op is a **no-op** at publish (publish.service.ts:134-135: `case 'AUDIT': break`).
So a type routed to the bare-AUDIT fallthrough writes **nothing to Shopify** unless it *also*
carries a payload — and the fallthrough carries none.

### 2a. Orphaned real compilers (the sharp bug — STILL OPEN)

`compileCheckoutBlock` (checkout.block.ts:12-24) and `compilePostPurchaseOffer`
(postPurchase.offer.ts:11-23) **exist**, set a real `checkoutUpsellPayload`, and their
doc comments insist they are "a real, rendered deploy." **But they are never imported or
dispatched** — index.ts:1-16 imports 14 compilers; neither of these two is among them, and
lines 49-58 route both types to the bare AUDIT fallthrough that drops the payload. Verified
at HEAD: grep for `compileCheckoutBlock` / `compilePostPurchaseOffer` outside their own
`export function` returns zero callers.

Consequence on the live path: `checkout.block` / `postPurchase.offer` are marked
`runtimeShipped: true` (extension-eligibility.ts:157-171) → classifier returns
`deployable / willDeploy:true` → `PublishService.publish` runs the fallthrough → **no metaobject
is written** → `api.publish.tsx:227 markPublishedWithTransition` still flips the ModuleVersion
to PUBLISHED → merchant is told "published" while the checkout UI extension has nothing to
render. **False-published.**

- **wired:** built-not-wired (compilers exist, dispatch ignores them) · **verdict:** partial · **action:** wire-up (add `case 'checkout.block': return compileCheckoutBlock(...)` and the postPurchase equivalent).

### 2b. `admin.discountUi` — case ADDED (FIXED), still an AUDIT no-op

At HEAD `admin.discountUi` now has an **explicit `case`** in the switch (compiler/index.ts:55-58),
sharing the bare-AUDIT branch. This closes the prior hazard where it fell to `default: never`
and un-gated direct callers (`tournament/verify.ts`, `ai/evals.server.ts`,
`modules.$moduleId.tsx`, `internal.stores.$storeId.tsx`) would get the spec object cast to a
`CompileResult`. On the publish path it stays masked because `admin.discountUi` is
`runtimeShipped:false` (extension-eligibility.ts:191-197) → the classifier throws
`ModuleNotPublishableError` before `compileRecipe` runs. The case itself emits only AUDIT (no
write), which is fine while it's `needs_runtime`.

- **wired:** absent (runtime not shipped) but case now present · **verdict:** required (honest gate) · **action:** keep; wire a real compiler only when the discount-details extension ships.

---

## 3. Per-type reality (all 21)

Legend for "publish writes": what actually lands in Shopify/DB when `PublishService.publish`
runs for that type on the merchant path.

| # | Type | Registry says | Compiler path | Publish writes | wired | verdict | action |
|---|---|---|---|---|---|---|---|
| 1 | theme.section | deployable, theme (shipped) | `compileThemeSection` → `themeModulePayload` | metaobject + `module_refs` list (publish.service.ts:75-77,149-161) | live | already-executed | keep |
| 2 | proxy.widget | deployable, app-proxy | `compileProxyWidget` → `proxyWidgetPayload` (AUDIT op only, but payload set) | `upsertProxyWidgetObject` (publish.service.ts:100-102) | live | already-executed | keep |
| 3 | functions.discountRules | deployable via manifest (`discount-function` shipped) | `compileDiscountRules` → `FUNCTION_CONFIG_UPSERT` | function-config metaobject (publish.service.ts:119-121,191-215) | live | already-executed | keep |
| 4 | functions.cartTransform | deployable (`cart-transform-function` shipped) | `compileCartTransform` → `FUNCTION_CONFIG_UPSERT` | function-config metaobject | live | already-executed | keep |
| 5 | functions.deliveryCustomization | deployable + Plus note (`superapp-delivery-customization` shipped) | `FUNCTION_CONFIG_UPSERT` | function-config | live | already-executed | keep |
| 6 | functions.paymentCustomization | deployable + Plus (`superapp-payment-customization` shipped) | `FUNCTION_CONFIG_UPSERT` | function-config | live | already-executed | keep |
| 7 | functions.cartAndCheckoutValidation | deployable + Plus (`superapp-cart-checkout-validation` shipped) | `FUNCTION_CONFIG_UPSERT` | function-config | live | already-executed | keep |
| 8 | functions.fulfillmentConstraints | deployable (`superapp-fulfillment-constraints` shipped) | `FUNCTION_CONFIG_UPSERT` | function-config | live | already-executed | keep |
| 9 | functions.orderRoutingLocationRule | **needs_runtime** (no CLI template, no handle) | compiler exists but gate throws first | nothing (gate) | built-not-wired | required | document-honestly (honest: no wasm) |
| 10 | checkout.upsell | deployable, checkout-ui + Plus | `compileCheckoutUpsell` → `checkoutUpsellPayload` | `$app:superapp_checkout_upsell` metaobject + `upsell_refs` (publish.service.ts:90-92,217-229) | live | already-executed | keep |
| 11 | **checkout.block** | deployable, checkout-ui (shipped) | **bare AUDIT fallthrough** — `compileCheckoutBlock` orphaned | **nothing** (payload dropped) | built-not-wired | partial | **wire-up** |
| 12 | **postPurchase.offer** | deployable, checkout-ui (all plans) | **bare AUDIT fallthrough** — `compilePostPurchaseOffer` orphaned | **nothing** (payload dropped) | built-not-wired | partial | **wire-up** |
| 13 | admin.block | deployable, admin-ui | `compileAdminBlock` → `adminBlockPayload` | admin-block metaobject + `block_refs` (publish.service.ts:80-82,163-175) | live | already-executed | keep |
| 14 | admin.action | deployable, admin-ui | `compileAdminAction` → `adminActionPayload` | admin-action metaobject + `action_refs` (publish.service.ts:85-87) | live | already-executed | keep |
| 15 | **admin.discountUi** | needs_runtime (discount-details ext not built) | explicit case, bare AUDIT (compiler/index.ts:55-58) — case ADDED this cycle | nothing (gate throws first) | absent | required | keep gate; wire compiler when ext ships |
| 16 | pos.extension | deployable, pos-ui (shipped) | bare AUDIT fallthrough (no metaobject) | **nothing via compiler — but config is read from DB** by `api.pos.config.tsx` → `readPublishedPosConfig` (pos-config.server.ts:11-16, `status:'PUBLISHED'`) | live | already-executed | keep (works *despite* the AUDIT compiler; runtime reads the DB ModuleVersion, not a metaobject) |
| 17 | analytics.pixel | deployable, web-pixel (shipped) | `compileAnalyticsPixel` → `WEB_PIXEL_UPSERT` | `WebPixelService.upsert` (publish.service.ts:127-132) | live | already-executed | keep |
| 18 | integration.httpSync | **deployable**, app-proxy ("runs server-side scheduled/app-proxy sync") | bare AUDIT fallthrough | **nothing**, and **no server-side runner reads a PUBLISHED httpSync config** | stub | partial | rebuild or document-honestly (registry claims a server sync that does not exist) |
| 19 | flow.automation | **needs_runtime** ("workflow-definition publish wiring pending") | bare AUDIT fallthrough | nothing via merchant gate — **but a real executor exists** (see §4) | built-not-wired | partial | wire-up + document-honestly (registry contradicts a shipped runtime) |
| 20 | platform.extensionBlueprint | deployable, composite ("deploys via its members") | bare AUDIT fallthrough | **nothing** — no decomposition into member modules happens inside `PublishService.publish` | stub | partial | rebuild or document-honestly |
| 21 | customerAccount.blocks | deployable, customer-account-ui (shipped) | `compileCustomerAccountBlocks` → `customerAccountBlockPayload` | metaobject + `block_refs` (publish.service.ts:95-97,231-243) | live | already-executed | keep |

**Genuinely already-executed (real write on merchant publish): 13** — #1-8, 10, 13, 14, 17, 21.
**Works but via a non-compiler path (DB read): 1** — #16 pos.extension.
**Marked deployable but writes nothing (false-published risk): 4** — #11 checkout.block, #12 postPurchase.offer, #18 integration.httpSync, #20 blueprint (composite no-op).
**Honestly gated needs_runtime: 2** — #9 orderRouting, #15 discountUi.
**Mislabeled needs_runtime despite a shipped runtime: 1** — #19 flow.automation.

---

## 4. flow.automation — the registry lies in the *pessimistic* direction (STILL OPEN)

**Claim (extension-eligibility.ts:209-217; audit test EXPECTED_NEEDS_RUNTIME includes it,
module-deployability-audit.test.ts:37-38):** `flow.automation` is `needs_runtime` — "workflow
publish wiring pending"; `classifyModulePublishability` therefore throws at publish.

**Reality:** a real Flow runtime is shipped **and wired**:
- `FlowRunnerService.runForTrigger` (flow-runner.service.ts:90-99) queries
  `prisma.module.findMany({ type:'flow.automation', status:'PUBLISHED', activeVersionId:{not:null} })`,
  parses the spec, and executes the steps. `runFlowById` (flow-runner.service.ts:144-158) backs
  an admin "Run now".
- The Flow trigger/action extensions physically ship (`extensions/superapp-flow-*`).

So the executor exists and reads PUBLISHED flow modules. The catch: the merchant publish
path (`api.publish.tsx`) and agent path (`api.agent.modules.$moduleId.publish.tsx:168`) both
call `PublishService.publish` first, which **throws** for `flow.automation` → a flow can
never become PUBLISHED there. An internal-ops path that bypasses `PublishService.publish` can
still flip a flow to PUBLISHED, after which the runner executes it.

Net: the runtime is **live and reachable**, but the eligibility registry mislabels flow as
`needs_runtime`, blocking the merchant/agent paths. The honest fix is to persist the workflow
at publish (the note's own condition) and flip `runtimeShipped:true`, OR keep the label and
admit the runner only serves internally published flows.

- **wired:** built-not-wired (runtime live; registry gate blocks the primary path) · **verdict:** partial · **action:** wire-up (persist workflow in a compiler + flip the flag) or document-honestly.

---

## 5. Preflight / classifier — honest, and the one real safety property that holds

`classifyModulePublishability` (publish-preflight.server.ts:103-133) faithfully mirrors the
registry: `needs_runtime` → `willDeploy:false`; `deployable` → `willDeploy:true`.
`PublishService.publish` throws `ModuleNotPublishableError` when `!willDeploy`
(publish.service.ts:55-58), and `api.publish.tsx:272-284` surfaces it as HTTP 422 without
marking published. **This gate genuinely prevents false-published for the `needs_runtime` set**
(orderRouting, discountUi, flow via merchant path). Its blind spot: it trusts
`runtimeShipped:true` to mean "the compiler writes something," which is false for
checkout.block / postPurchase.offer / integration.httpSync / blueprint — those pass the gate
and write nothing. The gate checks *runtime shipped*, never *compiler wired*; the two have
drifted, and no test at HEAD closes the seam (module-deployability-audit.test.ts only asserts
classifier↔registry agreement + an `isRuntimeShipped` count).

`runPublishPreflight` (publish-preflight.server.ts:27-73) is a separate, real scope check
(queries `currentAppInstallation.accessScopes`) and is wired at api.publish.tsx.

- **wired:** live · **verdict:** required · **action:** keep; add a "compiler emits a real op/payload" assertion to the audit test so runtimeShipped can't claim deployable while the dispatch drops to bare AUDIT.

**Two-layer function manifest** (deployed-extensions.server.ts:22-42): `DEPLOYED_FUNCTION_EXTENSION_HANDLES`
lists 6 shipped wasm handles; `deployedFunctionExtensions()` unions env. Real and matches
`extensions/*/shopify.extension.toml` handles. order-routing has no handle → correctly
`needs_runtime`.
- **wired:** live · **verdict:** required · **action:** keep.

---

## Bottom line

At HEAD 4f056da the `admin.discountUi` compiler case was added (closing the prior `default: never`
hazard) and the type count is now honestly 21, but the four false-published types
(checkout.block, postPurchase.offer, integration.httpSync, platform.extensionBlueprint) still
pass the `runtimeShipped` gate and hit the bare-AUDIT fallthrough that writes nothing, the two
orphaned real compilers remain dead code, flow.automation is still mislabeled `needs_runtime`
despite a live runtime, and no test asserts "deployable ⇒ compiler emits a non-AUDIT write" —
so the root seam (gate trusts a hand-set boolean, never checks the dispatch) is unfixed.
