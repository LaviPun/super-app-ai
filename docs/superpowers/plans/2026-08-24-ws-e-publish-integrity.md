# WS-E Publish Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Published" mean published — every `functions.*` publish creates the Shopify owner object that actually executes the function, unpublish/delete/rollback clean up everything they touched, partial failures are visible and republish-convergent, and a live-store probe proves each surface end-to-end.

**Architecture:** A new `ActivationService` (per-shop, GID-persisted in a `FunctionActivation` table) is invoked by `PublishService` whenever a `FUNCTION_CONFIG_UPSERT` op runs, creating/adopting/updating the per-type activation object (`discountAutomaticAppCreate`, `deliveryCustomizationCreate`, `paymentCustomizationCreate`, `validationCreate`, `fulfillmentConstraintRuleCreate`, `cartTransformCreate`). A new `UnpublishService` inverts `compileRecipe` output (refs-list removal, metaobject delete, activation delete, web-pixel delete). Rollback becomes recompile-and-republish of the target version. The fake progressive-publish canary is deleted. The `needs_runtime` gate WS-QF installs is reverted type-by-type, only in the task that wires that type.

**Tech Stack:** Remix (apps/web), Prisma, Vitest, Shopify Admin GraphQL **2026-07** (all GraphQL in this plan was validated against the 2026-07 schema via the Shopify Dev MCP validator), Shopify Functions (Rust/wasm, already shipped in `extensions/`).

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-E section, Decision D6, findings [Deploy-1..11]) — the nine-domain audit of 2026-08-24 at `master@6af6df2`.

## Dependencies (plan header — read before executing)

- **Runs after WS-QF.** WS-QF (D6 step 1) gates unwired function types `needs_runtime`. Task 1 of this plan reconciles WS-QF's landed gate (`FUNCTION_ACTIVATION_UNWIRED` + `functionActivationGap` — see Task 1 for the exact migration contract) into the canonical `ACTIVATION_WIRED_FUNCTION_TYPES` seam rather than adding a second gate.
- **Ideally after WS-A** (stable `application_url` on Railway) for Task 17's live-store probe — checkout/function behavior does not depend on the app URL, but the theme-editor/deep-link steps are much less flaky off a stable domain. Tasks 1–16 have no WS-A dependency.
- **Ordering with WS-I (D2):** nothing in this plan touches the V2 apps; no salvage needed here.

## Global Constraints

- Shopify Admin API target: **2026-07** (program constraint; new GraphQL documents in this plan are 2026-07-validated — `functionId` args are deprecated there, use `functionHandle`).
- Merchant UI: Polaris web components only (`s-banner`, `s-button` etc.); minimal copy here — WS-F owns polish.
- No silent failures anywhere (D8): every non-deploying path throws or returns a reasoned refusal; never report "published"/"unpublished"/"rolled back" unless Shopify state actually changed.
- Scope additions (`write_validations`, `write_fulfillment_constraint_rules`) require `shopify app deploy` + merchant re-consent before they work on a live store — each scope-adding task carries that note; CI/unit tests do not depend on live scopes.
- TDD, bite-sized tasks, frequent commits; run `cd apps/web && npx vitest run <file>` for the test steps; CI (WS-B) must stay green at every merge.
- All file paths below are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp`.

## Verified ground truth (2026-08-24, `master@6af6df2`)

Facts every task below relies on — re-verified against code, do not re-derive:

- `PublishService.publish` (apps/web/app/services/publish/publish.service.ts:93) writes the `$app:superapp_function_config` metaobject (`FUNCTION_CONFIG_UPSERT` → `writeFunctionConfig`, lines 233–235, 361–408) and **never creates any activation object**. The only activation writers in the repo are `BundleProductService.activateCartTransform` / `ensureAutomaticBundleDiscount` (apps/web/app/services/bundles/bundle-product.service.ts:346, 408), reachable only from `BlueprintService.publishBlueprint` (flag `BLUEPRINTS_ENABLED`, default **false** — apps/web/app/env.server.ts:151).
- Compiler function keys (apps/web/app/services/recipes/compiler/functions.*.ts): `discountRules`, `cartTransform`, `deliveryCustomization`, `paymentCustomization`, `cartAndCheckoutValidation`, `fulfillmentConstraints`, `shippingDiscount`, `orderRoutingLocationRule`, `localPickupDeliveryOption`, `pickupPointDeliveryOption`.
- Function-config metaobject handles are camelCase: `superapp-fn-${functionKey}` (apps/web/app/services/shopify/metaobject.service.ts:248) and the wasm input queries hard-code the same camelCase handles (e.g. `extensions/superapp-discount/src/cart_lines_discounts_generate_run.graphql:35` → `superapp-fn-discountRules`). Whether Shopify normalizes handles to lowercase is **empirically unverified** → Task 17 probes it; conditional fix included there.
- No unpublish route exists; `ModuleService.deleteModule` (module.service.ts:287) deletes DB rows only; `api.modules.$moduleId.delete.tsx` / `api.agent.modules.$moduleId.delete.tsx` / the inline delete in `modules.$moduleId.tsx:297` never touch Shopify — a published module's metaobject + refs-list GID render forever.
- `ModuleService.rollbackToVersion` (module.service.ts:277–285) flips `activeVersionId` only (it also sets `status: 'PUBLISHED'` — module.service.ts:283) — no Shopify write. Call sites: `api.rollback.tsx:39`, `api.agent.modules.$moduleId.rollback.tsx:48`, `internal.ops.tsx:221`, plus the auto-"canary" aborts in `api.publish.tsx:277` and `api.agent.modules.$moduleId.publish.tsx:193`.
- `ProgressivePublishService` (apps/web/app/services/releases/progressive-publish.server.ts) is theater: `startCanary()` returns a constant "5%" decision, `evaluateRamp()` reads 30-minute API-log metrics — nothing is ever actually staged; the ABORT branch triggers the DB-only rollback above (drift-maker).
- `DEPLOYED_FUNCTION_EXTENSION_HANDLES` (apps/web/app/services/publish/deployed-extensions.server.ts:22 — NOTE: file lives under `services/publish/`, not `services/shopify/`) omits `superapp-shipping-discount` and `superapp-order-routing`, both of which ARE in `shopify.app.toml` `extension_directories` with `type = "function"` (verified in their `shopify.extension.toml`s).
- Current app scopes (shopify.app.toml) include `write_discounts`, `write_delivery_customizations`, `write_payment_customizations`, `write_cart_transforms`, `write_pixels` but **NOT** `write_validations` or `write_fulfillment_constraint_rules` (validator-reported requirements for `validationCreate` / `fulfillmentConstraintRuleCreate`).
- App embed block: `extensions/theme-app-extension/blocks/superapp-theme-modules.liquid` (`target: "body"`, handle `superapp-theme-modules`); a fresh store renders nothing until it is enabled. Per current docs, deep link = `https://{shop}/admin/themes/current/editor?context=apps&template={template}&activateAppId={api_key}/{handle}` (the `{uuid}` form is deprecated; `api_key` = `client_id` = `SHOPIFY_API_KEY`). Embed state is detectable in the theme's `config/settings_data.json` (`current.blocks[*].type` contains `/blocks/{handle}/`, with a `disabled` flag).
- `shopify.unauthenticated.admin(shopDomain)` is available (`apps/web/app/shopify.server.ts:43`, used by `internal.support.$ticketId.tsx:181`) for admin-less contexts (internal ops rollback).
- `PublishService` construction sites (all must learn `shopId`): `api.publish.tsx:225`, `api.agent.modules.$moduleId.publish.tsx:167`, `blueprint.service.ts:448`, `publish-worker.adapter.server.ts:73` (payload already carries `shopId`).

## Decisions of record for this plan

| # | Decision |
|---|----------|
| E1 | **One activation object per shop per function kind**, GID stored in a new `FunctionActivation` table (`@@unique([shopId, functionKey])`). Republish = ensure (adopt/update), never duplicate. |
| E2 | **All creates use `functionHandle`** (2026-07 deprecates `functionId` args/inputs across `DiscountAutomaticAppInput`, `DeliveryCustomizationInput`, `fulfillmentConstraintRuleCreate`; `cartTransformCreate`/`validationCreate` already take handles). A `shopifyFunctions` lookup is kept only for recovery matching where list nodes expose `functionId` (delivery/payment). |
| E3 | **The discount function gets exactly ONE `DiscountAutomaticApp` node per shop**, canonical title `SuperApp Discounts`. Two nodes on the same function would run the wasm twice and double-apply discounts. The legacy `SuperApp Bundle Pricing` node (created by `ensureAutomaticBundleDiscount`) is adopted and retitled; `BundleProductService.ensureAutomaticBundleDiscount` is removed in favor of `ActivationService` (Task 3). |
| E4 | **Progressive-publish theater is REMOVED entirely** (not reduced to a healthcheck): `ProgressivePublishService` + `startCanary`/`evaluateRamp` call sites + `progressiveStage/progressiveDecision` job-payload fields are deleted. The honest post-publish check that replaces "verification" is the embed-status check (Task 15) for theme modules and the live probe (Task 17) for functions. `RolloutPolicyService`/`release-metrics` stay (used by the internal release dashboard). |
| E5 | **Bundles (finding 7): wire `BundleProductService` into the single-module `functions.cartTransform` publish path** (the smaller option) instead of turning `BLUEPRINTS_ENABLED` on. The compiler's `superapp-fn-cartTransform` metaobject — which the live wasm never reads (it reads `$app:bundle_config` on the CartTransform object) — is removed in the same task (Task 8). |
| E6 | **Unpublish inverts the compile**: `UnpublishService` compiles the published spec with the same target and cleans up exactly the surfaces the compile says exist — publish and unpublish can never drift because they read the same compiler output. |
| E7 | Version-status vocabulary for unpublish: module → `DRAFT`, `activeVersionId` → `null`, previously `PUBLISHED` versions → `UNPUBLISHED` (new status string; nothing enumerates version statuses exhaustively — verified `ReleaseTransitionService.assertPublishTransition` only checks publish-direction transitions). |

## File Structure (created / modified)

```
packages/core/src/extension-eligibility.ts            [M] ACTIVATION_WIRED_FUNCTION_TYPES seam (grows per task)
apps/web/prisma/schema.prisma                         [M] FunctionActivation model (+Shop back-relation)
apps/web/app/services/publish/activation.service.ts   [C] ActivationService — all activation GraphQL + GID persistence
apps/web/app/services/publish/publish.service.ts      [M] ensureFunctionActivation hook, ops ledger, shopId in session
apps/web/app/services/publish/publish-preflight.server.ts [M] activation gate check + per-type required scopes
apps/web/app/services/publish/deployed-extensions.server.ts [M] +shipping-discount, +order-routing
apps/web/app/services/publish/unpublish.service.ts    [C] UnpublishService — compile-inverting cleanup
apps/web/app/services/publish/rollback.service.ts     [C] RollbackService — recompile+republish, DB flip on success
apps/web/app/services/publish/embed-status.server.ts  [C] embed detection + deep link
apps/web/app/services/shopify/metaobject.service.ts   [M] getMetaobjectIdByHandle
apps/web/app/services/shopify/web-pixel.service.ts    [M] delete()
apps/web/app/services/bundles/bundle-product.service.ts [M] remove ensureAutomaticBundleDiscount (moved to ActivationService)
apps/web/app/services/blueprints/blueprint.service.ts [M] use ActivationService for the bundle discount node
apps/web/app/services/recipes/compiler/functions.cartTransform.ts [M] drop dead FUNCTION_CONFIG_UPSERT
apps/web/app/services/modules/module.service.ts       [M] markUnpublished; rollbackToVersion → DB-flip helper only
apps/web/app/routes/api.publish.tsx                   [M] remove canary; shopId; ledger; embed status in redirect
apps/web/app/routes/api.agent.modules.$moduleId.publish.tsx [M] remove canary; shopId
apps/web/app/routes/api.rollback.tsx                  [M] RollbackService
apps/web/app/routes/api.agent.modules.$moduleId.rollback.tsx [M] RollbackService
apps/web/app/routes/internal.ops.tsx                  [M] RollbackService via unauthenticated admin
apps/web/app/routes/api.modules.$moduleId.unpublish.tsx [C] unpublish route
apps/web/app/routes/api.modules.$moduleId.delete.tsx  [M] unpublish-before-delete
apps/web/app/routes/api.agent.modules.$moduleId.delete.tsx [M] unpublish-before-delete
apps/web/app/routes/modules.$moduleId.tsx             [M] unpublish-before-delete (inline action), unpublish button, embed banner
apps/web/app/__tests__/activation.service.test.ts     [C]
apps/web/app/__tests__/unpublish.service.test.ts      [C]
apps/web/app/__tests__/rollback.service.test.ts       [C]
apps/web/app/__tests__/publish-ledger.test.ts         [C]
apps/web/app/__tests__/embed-status.test.ts           [C]
apps/web/app/__tests__/deployed-manifest-consistency.test.ts [C]
apps/web/app/__tests__/publish-functions-reliability.test.ts [M] per-type un-gate expectations
docs/publishing.md                                    [M] (or create) activation/unpublish/rollback contract — folded into Task 17
```

Shared test helper used throughout (define once in Task 3's test file, copy into later test files — each test file stays self-contained):

```ts
// Mock admin whose graphql() dispatches on operation-name substring.
// calls[] records every (opName, variables) pair for exact-sequence assertions.
type GqlCall = { op: string; variables?: Record<string, unknown> };
function mockAdmin(respond: (op: string, variables?: Record<string, unknown>) => unknown) {
  const calls: GqlCall[] = [];
  const admin = {
    graphql: vi.fn(async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      const m = query.match(/\b(?:query|mutation)\s+(\w+)/);
      const op = m?.[1] ?? 'unknown';
      calls.push({ op, variables: opts?.variables });
      const body = respond(op, opts?.variables);
      return { json: async () => body } as Response;
    }),
  };
  return { admin: admin as never, calls };
}
```

---

### Task 1: Canonical activation gate seam (`ACTIVATION_WIRED_FUNCTION_TYPES`)

Reconcile WS-QF's D6-step-1 gate into the seam every later task un-gates through. After this task, **every** `functions.*` type classifies `needs_runtime` (even with its wasm deployed) until a later task adds it to the wired set.

WS-QF landed: `FUNCTION_ACTIVATION_UNWIRED` + `functionActivationGap()` in `packages/core/src/extension-eligibility.ts`, a `ctx.activationHandledByCoDeploy` flag on `ModulePublishabilityContext`, `PublishService.publish(spec, target, opts?)`, and pins in `module-deployability-audit` / `blueprint-deployability` / `publish-functions-reliability`. This task: (1) delete `FUNCTION_ACTIVATION_UNWIRED`/`functionActivationGap`, introduce `ACTIVATION_WIRED_FUNCTION_TYPES` (initially empty ⇒ all `functions.*` gated, a strict superset of WS-QF's six); (2) the preflight gate condition is `type.startsWith('functions.') && !ACTIVATION_WIRED_FUNCTION_TYPES.has(type) && !ctx.activationHandledByCoDeploy` — keep the co-deploy exemption; Task 8 removes it in the same commit that deletes the blueprint's redundant `activateCartTransform`; (3) update WS-QF's pinned tests to the new symbol, preserving their co-deploy assertions.

**Files:**
- Modify: `packages/core/src/extension-eligibility.ts`
- Modify: `apps/web/app/services/publish/publish-preflight.server.ts` (classify branch)
- Modify: `apps/web/app/__tests__/publish-functions-reliability.test.ts`
- Check/Modify: `apps/web/app/__tests__/blueprint-deployability.test.ts`, `apps/web/app/__tests__/module-deployability-audit.test.ts` (WS-QF should already have adjusted these; verify)

**Interfaces:**
- Produces: `export const ACTIVATION_WIRED_FUNCTION_TYPES: Set<string>` from `@superapp/core` (re-exported via the package index like the other eligibility exports — check `packages/core/src/index.ts` exports `extension-eligibility` symbols and add this one). Tasks 3–8 append entries; Tasks 3–8 tests read it.

- [ ] **Step 1: Write the failing test** — append to `apps/web/app/__tests__/publish-functions-reliability.test.ts`:

```ts
import { ACTIVATION_WIRED_FUNCTION_TYPES } from '@superapp/core';

describe('WS-E activation gate (D6 step 2 seam)', () => {
  it('a functions.* type with a deployed wasm but no wired activation is needs_runtime', () => {
    for (const type of [
      'functions.discountRules',
      'functions.cartTransform',
      'functions.deliveryCustomization',
      'functions.paymentCustomization',
      'functions.cartAndCheckoutValidation',
      'functions.fulfillmentConstraints',
    ]) {
      if (ACTIVATION_WIRED_FUNCTION_TYPES.has(type)) continue; // un-gated by a later WS-E task
      const spec = specForType(type);
      if (!spec) continue;
      const result = classifyModulePublishability(spec, {
        deployedExtensions: Object.values(FUNCTION_EXTENSION_HANDLES),
      });
      expect(result.status, type).toBe('needs_runtime');
      expect(result.reasons.join(' '), type).toMatch(/activation/i);
    }
  });

  it('a wired type with a deployed wasm is deployable', () => {
    for (const type of ACTIVATION_WIRED_FUNCTION_TYPES) {
      const spec = specForType(type);
      if (!spec) continue;
      const result = classifyModulePublishability(spec, {
        deployedExtensions: Object.values(FUNCTION_EXTENSION_HANDLES),
      });
      expect(result.status, type).toBe('deployable');
    }
  });
});
```

- [ ] **Step 2: Run it** — `cd apps/web && npx vitest run app/__tests__/publish-functions-reliability.test.ts`
Expected: FAIL (`ACTIVATION_WIRED_FUNCTION_TYPES` not exported — WS-QF's constant is `FUNCTION_ACTIVATION_UNWIRED`, deleted in Step 3).

- [ ] **Step 3: Implement the seam** — in `packages/core/src/extension-eligibility.ts` (near `FUNCTION_RUNTIME_HANDLES`, line ~112):

```ts
/**
 * WS-E activation gate (D6 step 2). A `functions.*` type whose wasm IS deployed is
 * still not publishable until the publish path creates its Shopify activation
 * object — the owner object (automatic discount / delivery customization / payment
 * customization / validation / fulfillment constraint rule / cart transform) that
 * makes Shopify actually execute the function. WS-QF gated all function types
 * (D6 step 1); each WS-E task adds exactly one type here in the same commit that
 * wires its ActivationService support. NEVER add a type without its activation.
 */
export const ACTIVATION_WIRED_FUNCTION_TYPES: Set<string> = new Set<string>([]);
```

WS-QF landed the gate as `FUNCTION_ACTIVATION_UNWIRED`/`functionActivationGap` (see the migration contract in this task's preamble): delete those symbols and refactor to THIS shape (registry entries stay `deployable`-when-shipped; the gate is applied in `classifyModulePublishability`; the `ctx.activationHandledByCoDeploy` exemption is kept until Task 8 retires it), preserving WS-QF's test expectations incl. their co-deploy assertions. In `apps/web/app/services/publish/publish-preflight.server.ts`, after the `if (!shipped)` block (line ~214), add:

```ts
// WS-E (D6 step 2): wasm deployed but activation-object wiring not shipped for
// this type yet → honest needs_runtime. Un-gated type-by-type as ActivationService
// support lands (ACTIVATION_WIRED_FUNCTION_TYPES). Co-deploy exemption kept from
// WS-QF until Task 8 retires it.
if (type.startsWith('functions.') && !ACTIVATION_WIRED_FUNCTION_TYPES.has(type) && !ctx.activationHandledByCoDeploy) {
  return ModulePublishPreflightResultSchema.parse({
    moduleType: type,
    status: 'needs_runtime',
    reasons: [
      `${type} compiles and its wasm is deployed, but publish does not yet create the Shopify ` +
        `activation object that makes the function run. Blocked (honest) until activation wiring ships.`,
    ],
    ...(eligibility.functionHandle ? { requiresExtension: eligibility.functionHandle } : {}),
    willDeploy: false,
  });
}
```

with `import { ACTIVATION_WIRED_FUNCTION_TYPES } from '@superapp/core';` added to the existing import block.

- [ ] **Step 4: Fix knock-on tests** — run the full suite slice: `npx vitest run app/__tests__/publish-functions-reliability.test.ts app/__tests__/blueprint-deployability.test.ts app/__tests__/module-deployability-audit.test.ts app/__tests__/publish-preflight.test.ts`. The old `blocks a function type whose extension is not deployed` test's "ok" half now expects `needs_runtime` (gate) — update its second assertion to `expect(ok.status).toBe('needs_runtime')` with a comment pointing at this plan (it flips back to `deployable` in Task 3 when `functions.discountRules` is wired). If `blueprint-deployability.test.ts` asserts blueprint member types are `deployable` and WS-QF didn't already relax it, change that assertion to `['deployable', 'needs_runtime']` membership with a `TODO(WS-E Task 8)` comment.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/extension-eligibility.ts packages/core/src/index.ts apps/web/app/services/publish/publish-preflight.server.ts apps/web/app/__tests__
git commit -m "feat(ws-e): canonical ACTIVATION_WIRED_FUNCTION_TYPES gate seam (all functions.* gated)"
```

---

### Task 2: Deployed-manifest ↔ `extension_directories` consistency check

**Files:**
- Create: `apps/web/app/__tests__/deployed-manifest-consistency.test.ts`
- Modify: `apps/web/app/services/publish/deployed-extensions.server.ts`

**Interfaces:**
- Produces: `DEPLOYED_FUNCTION_EXTENSION_HANDLES` gains `'superapp-shipping-discount'`, `'superapp-order-routing'`. (Safe: `functions.shippingDiscount` / `functions.orderRoutingLocationRule` remain gated by Task 1's activation set, so nothing un-gates by accident — the registry note in `extension-eligibility.ts:198` about shipping-discount's deployed-handle dependency becomes satisfied, and the activation gate is now the single remaining honest blocker for those types.)

- [ ] **Step 1: Write the failing test:**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPLOYED_FUNCTION_EXTENSION_HANDLES } from '~/services/publish/deployed-extensions.server';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // apps/web/app/__tests__ → repo root

/** Handles of type="function" extensions actually listed in shopify.app.production.toml extension_directories. */
function functionHandlesFromAppToml(): string[] {
  const appToml = readFileSync(join(REPO_ROOT, 'shopify.app.production.toml'), 'utf8');
  const dirs = [...appToml.matchAll(/^\s*"(extensions\/[^"]+)",?\s*$/gm)].map((m) => m[1]!);
  const handles: string[] = [];
  for (const dir of dirs) {
    const extToml = readFileSync(join(REPO_ROOT, dir, 'shopify.extension.toml'), 'utf8');
    if (!/^type\s*=\s*"function"/m.test(extToml)) continue;
    const h = extToml.match(/^handle\s*=\s*"([^"]+)"/m)?.[1];
    if (h) handles.push(h);
  }
  return handles.sort();
}

describe('deployed-function manifest ↔ shopify.app.production.toml consistency (WS-E finding 6)', () => {
  it('every deploy-listed function extension is in the manifest, and vice versa', () => {
    const fromToml = functionHandlesFromAppToml();
    const fromManifest = [...DEPLOYED_FUNCTION_EXTENSION_HANDLES].sort();
    // Set equality both ways so drift in EITHER direction fails the build.
    expect(fromManifest).toEqual(fromToml);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run app/__tests__/deployed-manifest-consistency.test.ts`
Expected: FAIL — toml side contains `superapp-shipping-discount`, `superapp-order-routing`; manifest doesn't.

- [ ] **Step 3: Reconcile** — decision per function: both DO deploy (they are in `extension_directories`, on a stable dated `api_version`, built wasm), so manifest them. In `deployed-extensions.server.ts` extend the array:

```ts
export const DEPLOYED_FUNCTION_EXTENSION_HANDLES = [
  'cart-transform-function',
  'discount-function',
  'superapp-delivery-customization',
  'superapp-payment-customization',
  'superapp-cart-checkout-validation',
  'superapp-fulfillment-constraints',
  // Deployed via extension_directories (shopify.app.production.toml) — pinned by
  // __tests__/deployed-manifest-consistency.test.ts. Their MODULE TYPES stay
  // needs_runtime via ACTIVATION_WIRED_FUNCTION_TYPES until activation is wired.
  'superapp-shipping-discount',
  'superapp-order-routing',
] as const;
```

- [ ] **Step 4: Run** the new test + `app/__tests__/blueprint-deployability.test.ts` + `app/__tests__/module-deployability-audit.test.ts`. Expected: PASS (the blueprint guardrail test's rule #1 — "every handle is a real extensions dir with type=function" — holds for both new handles).

- [ ] **Step 5: Commit** — `git commit -m "feat(ws-e): manifest<->extension_directories consistency test; manifest shipping-discount + order-routing"`

---

### Task 3: `ActivationService` core + Prisma table + discount activation + un-gate `functions.discountRules`

The biggest task: shared plumbing, the discount kind (including adopting the legacy bundle-pricing node, E3), the `PublishService` hook, and the first gate revert.

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/app/services/publish/activation.service.ts`
- Modify: `apps/web/app/services/publish/publish.service.ts`
- Modify: `apps/web/app/services/bundles/bundle-product.service.ts` (delete `ensureAutomaticBundleDiscount`, `DISCOUNT_NODES_QUERY`, `SHOPIFY_FUNCTIONS_QUERY`, `DISCOUNT_AUTOMATIC_APP_CREATE`, `DISCOUNT_FUNCTION_HANDLE`)
- Modify: `apps/web/app/services/blueprints/blueprint.service.ts` (call `ActivationService` instead)
- Modify: `packages/core/src/extension-eligibility.ts` (add `'functions.discountRules'` to the wired set)
- Modify: publisher call sites for `shopId`: `apps/web/app/routes/api.publish.tsx:225`, `apps/web/app/routes/api.agent.modules.$moduleId.publish.tsx:167`, `apps/web/app/services/blueprints/blueprint.service.ts:448`, `apps/web/app/services/publish/publish-worker.adapter.server.ts:73`
- Create: `apps/web/app/__tests__/activation.service.test.ts`
- Modify: `apps/web/app/__tests__/publish-functions-reliability.test.ts`, `apps/web/app/__tests__/bundle-product.service.test.ts`

**Interfaces:**
- Consumes: `ACTIVATION_WIRED_FUNCTION_TYPES` (Task 1).
- Produces (used by Tasks 4–10):

```ts
export type ActivationKind =
  | 'discount'
  | 'deliveryCustomization'
  | 'paymentCustomization'
  | 'validation'
  | 'fulfillmentConstraintRule'
  | 'cartTransform';

/** functionKey (compiler FUNCTION_CONFIG_UPSERT key) → activation wiring. Grows per task. */
export const FUNCTION_KEY_ACTIVATION: Record<string, { kind: ActivationKind; functionHandle: string }>;

export class ActivationService {
  constructor(admin: AdminApiContext['admin'], shopId: string);
  /** Idempotent ensure. Returns the activation GID, or null when functionKey has no mapping. */
  ensureForFunctionKey(functionKey: string): Promise<string | null>;
  /** Idempotent delete (missing remote object == success). */
  deleteForFunctionKey(functionKey: string): Promise<void>;
}
```

- `PublishService` constructor becomes `constructor(admin, session?: { shop?: string; accessToken?: string; shopId?: string })`; publishing a mapped functionKey without `shopId` **throws** (no silent skip).

- [ ] **Step 1: Prisma model** — in `apps/web/prisma/schema.prisma` add (and add `functionActivations FunctionActivation[]` to `model Shop`):

```prisma
/// WS-E: the Shopify activation object (automatic discount, delivery/payment
/// customization, validation, fulfillment constraint rule, cart transform) that
/// makes a deployed Function actually execute. One per shop per functionKey;
/// republish updates in place, unpublish deletes.
model FunctionActivation {
  id            String   @id @default(cuid())
  shopId        String
  shop          Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  functionKey   String   // compiler FUNCTION_CONFIG_UPSERT key, e.g. "discountRules"
  kind          String   // ActivationKind
  activationGid String   // gid://shopify/DiscountAutomaticNode|DeliveryCustomization|... 
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([shopId, functionKey])
}
```

Run: `cd apps/web && npx prisma migrate dev --name function_activation && npx prisma generate`

- [ ] **Step 2: Write the failing tests** — `apps/web/app/__tests__/activation.service.test.ts`. Include the `mockAdmin` helper from the plan header, plus a Prisma stub (follow the repo's existing pattern of mocking `~/db.server` — see how other tests `vi.mock('~/db.server', ...)`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, { functionKey: string; kind: string; activationGid: string }>();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    functionActivation: {
      findUnique: async ({ where }: any) =>
        db.get(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`) ?? null,
      upsert: async ({ where, create }: any) => {
        db.set(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`, create);
        return create;
      },
      delete: async ({ where }: any) => {
        db.delete(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`);
      },
    },
  }),
}));

import { ActivationService, FUNCTION_KEY_ACTIVATION } from '~/services/publish/activation.service';

// <mockAdmin helper from plan header here>

beforeEach(() => db.clear());

describe('ActivationService — discount kind', () => {
  it('creates the automatic app discount node on first ensure and stores its GID', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup')
        return { data: { discountNodes: { nodes: [] } } };
      if (op === 'SuperAppDiscountActivationCreate')
        return { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/1' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://shopify/DiscountAutomaticNode/1');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationCreate',
    ]);
    // Create used functionHandle (2026-07: functionId is deprecated) + PRODUCT class.
    const v = calls[1]!.variables!.discount as Record<string, unknown>;
    expect(v.functionHandle).toBe('discount-function');
    expect(v.discountClasses).toEqual(['PRODUCT']);
    expect(v.title).toBe('SuperApp Discounts');
  });

  it('second ensure with a stored GID makes NO Shopify calls (idempotent republish)', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://x/1' });
    const { admin, calls } = mockAdmin(() => { throw new Error('no call expected'); });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://x/1');
    expect(calls).toHaveLength(0);
  });

  it('adopts + retitles the legacy "SuperApp Bundle Pricing" node instead of creating a duplicate', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup')
        return { data: { discountNodes: { nodes: [
          { id: 'gid://shopify/DiscountAutomaticNode/9', discount: { __typename: 'DiscountAutomaticApp', title: 'SuperApp Bundle Pricing' } },
        ] } } };
      if (op === 'SuperAppDiscountActivationUpdate')
        return { data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/9' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://shopify/DiscountAutomaticNode/9');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationUpdate', // retitle to canonical — ONE node per shop, ever (E3)
    ]);
  });

  it('deleteForFunctionKey deletes the node and the row; a missing remote node is success', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://x/1' });
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationDelete')
        return { data: { discountAutomaticDelete: { deletedAutomaticDiscountId: null, userErrors: [{ field: null, message: 'Discount not found' }] } } };
      throw new Error(`unexpected op ${op}`);
    });
    await new ActivationService(admin, 'shop_1').deleteForFunctionKey('discountRules');
    expect(calls.map((c) => c.op)).toEqual(['SuperAppDiscountActivationDelete']);
    expect(db.size).toBe(0);
  });

  it('unmapped functionKey → ensure returns null, delete is a no-op', async () => {
    const { admin, calls } = mockAdmin(() => { throw new Error('no call expected'); });
    const svc = new ActivationService(admin, 'shop_1');
    expect(await svc.ensureForFunctionKey('shippingDiscount')).toBeNull();
    await svc.deleteForFunctionKey('shippingDiscount');
    expect(calls).toHaveLength(0);
    expect(FUNCTION_KEY_ACTIVATION.shippingDiscount).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run app/__tests__/activation.service.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement `activation.service.ts`:**

```ts
import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';

export type ActivationKind =
  | 'discount'
  | 'deliveryCustomization'
  | 'paymentCustomization'
  | 'validation'
  | 'fulfillmentConstraintRule'
  | 'cartTransform';

/**
 * functionKey → activation wiring. GROWN ONE ENTRY PER WS-E TASK, in the same
 * commit that implements the kind + un-gates the module type. Keys match the
 * compiler's FUNCTION_CONFIG_UPSERT functionKey values; handles match
 * extensions/[*]/shopify.extension.toml (pinned by deployed-manifest test).
 */
export const FUNCTION_KEY_ACTIVATION: Record<string, { kind: ActivationKind; functionHandle: string }> = {
  discountRules: { kind: 'discount', functionHandle: 'discount-function' },
};

const DISCOUNT_TITLE = 'SuperApp Discounts';
/** Pre-WS-E title written by the removed BundleProductService.ensureAutomaticBundleDiscount. */
const LEGACY_BUNDLE_DISCOUNT_TITLE = 'SuperApp Bundle Pricing';

// All documents below validated against Admin GraphQL 2026-07 (Shopify Dev MCP).
const DISCOUNT_NODES_LOOKUP = `#graphql
  query SuperAppDiscountActivationLookup {
    discountNodes(first: 50) {
      nodes { id discount { __typename ... on DiscountAutomaticApp { title } } }
    }
  }
`;
const DISCOUNT_CREATE = `#graphql
  mutation SuperAppDiscountActivationCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;
const DISCOUNT_UPDATE = `#graphql
  mutation SuperAppDiscountActivationUpdate($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;
const DISCOUNT_DELETE = `#graphql
  mutation SuperAppDiscountActivationDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;

type StoredActivation = { functionKey: string; kind: string; activationGid: string };

/** userError messages that mean "already gone" — deletes treat them as success. */
function isMissingResourceError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('not found') || m.includes('does not exist') || m.includes("doesn't exist");
}

export class ActivationService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly shopId: string,
  ) {}

  async ensureForFunctionKey(functionKey: string): Promise<string | null> {
    const mapping = FUNCTION_KEY_ACTIVATION[functionKey];
    if (!mapping) return null;
    switch (mapping.kind) {
      case 'discount':
        return this.ensureDiscount(functionKey, mapping.functionHandle);
      default: {
        // A mapping was added without its ensure implementation — plan violation.
        throw new Error(`ActivationService: kind "${mapping.kind}" has no ensure implementation`);
      }
    }
  }

  async deleteForFunctionKey(functionKey: string): Promise<void> {
    const mapping = FUNCTION_KEY_ACTIVATION[functionKey];
    if (!mapping) return;
    const stored = await this.getStored(functionKey);
    if (!stored) return; // nothing recorded → nothing to delete (recovery deletes are Task 10's probe concern)
    switch (mapping.kind) {
      case 'discount':
        await this.deleteWith(DISCOUNT_DELETE, stored.activationGid, 'discountAutomaticDelete');
        break;
      default:
        throw new Error(`ActivationService: kind "${mapping.kind}" has no delete implementation`);
    }
    await this.clearStored(functionKey);
  }

  // ── discount ──────────────────────────────────────────────────────────────

  private async ensureDiscount(functionKey: string, functionHandle: string): Promise<string> {
    const stored = await this.getStored(functionKey);
    if (stored) return stored.activationGid;

    // Recovery/adoption: exactly ONE automatic-app-discount node per shop for this
    // function — a second node would run the wasm twice and double-apply discounts.
    const lookup = await this.graphqlJson<{
      discountNodes: { nodes: Array<{ id: string; discount: { __typename: string; title?: string } }> };
    }>(DISCOUNT_NODES_LOOKUP);
    const found = (lookup.data?.discountNodes?.nodes ?? []).find(
      (n) =>
        n.discount.__typename === 'DiscountAutomaticApp' &&
        (n.discount.title === DISCOUNT_TITLE || n.discount.title === LEGACY_BUNDLE_DISCOUNT_TITLE),
    );
    if (found) {
      if ((lookupTitle(found) ?? '') !== DISCOUNT_TITLE) {
        const upd = await this.graphqlJson<{
          discountAutomaticAppUpdate: { automaticAppDiscount?: { discountId: string }; userErrors: Array<{ message: string }> };
        }>(DISCOUNT_UPDATE, { id: found.id, discount: { title: DISCOUNT_TITLE } });
        const err = upd.data?.discountAutomaticAppUpdate?.userErrors?.[0];
        if (err) throw new Error(`discountAutomaticAppUpdate failed: ${err.message}`);
      }
      await this.store(functionKey, 'discount', found.id);
      return found.id;
    }

    const created = await this.graphqlJson<{
      discountAutomaticAppCreate: { automaticAppDiscount?: { discountId: string }; userErrors: Array<{ message: string }> };
    }>(DISCOUNT_CREATE, {
      discount: {
        title: DISCOUNT_TITLE,
        // 2026-07: functionId input is deprecated — bind by handle.
        functionHandle,
        // superapp-discount targets cart.lines.discounts.generate.run → per-line PRODUCT discounts.
        discountClasses: ['PRODUCT'],
        startsAt: new Date().toISOString(),
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    });
    const err = created.data?.discountAutomaticAppCreate?.userErrors?.[0];
    if (err) throw new Error(`discountAutomaticAppCreate failed: ${err.message}`);
    const id = created.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId;
    if (!id) throw new Error('discountAutomaticAppCreate returned no id');
    await this.store(functionKey, 'discount', id);
    return id;
  }

  // ── shared plumbing ───────────────────────────────────────────────────────

  private async deleteWith(document: string, gid: string, mutationField: string): Promise<void> {
    const json = await this.graphqlJson<Record<string, { userErrors?: Array<{ message: string }> }>>(document, { id: gid });
    const err = json.data?.[mutationField]?.userErrors?.[0];
    if (err && !isMissingResourceError(err.message)) {
      throw new Error(`${mutationField} failed: ${err.message}`);
    }
  }

  private async getStored(functionKey: string): Promise<StoredActivation | null> {
    return getPrisma().functionActivation.findUnique({
      where: { shopId_functionKey: { shopId: this.shopId, functionKey } },
    });
  }

  private async store(functionKey: string, kind: ActivationKind, activationGid: string): Promise<void> {
    await getPrisma().functionActivation.upsert({
      where: { shopId_functionKey: { shopId: this.shopId, functionKey } },
      create: { shopId: this.shopId, functionKey, kind, activationGid },
      update: { kind, activationGid },
    });
  }

  private async clearStored(functionKey: string): Promise<void> {
    await getPrisma().functionActivation
      .delete({ where: { shopId_functionKey: { shopId: this.shopId, functionKey } } })
      .catch(() => {}); // row already gone == fine
  }

  private async graphqlJson<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: Array<{ message?: string }> }> {
    const res = await this.admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    // Top-level errors leave data undefined — throwing here prevents "no existing
    // node" misreads that would create duplicates (same discipline as
    // BundleProductService.graphqlJson / MetaobjectService.graphqlJson).
    if (json?.errors?.length) {
      throw new Error(json.errors.map((e) => e?.message ?? 'Unknown GraphQL error').join('; '));
    }
    return json;
  }
}

function lookupTitle(node: { discount: { title?: string } }): string | undefined {
  return node.discount.title;
}
```

- [ ] **Step 5: Run** the activation tests. Expected: PASS.

- [ ] **Step 6: Wire `PublishService`** — in `publish.service.ts`: change the constructor's session type to `{ shop?: string; accessToken?: string; shopId?: string }`. The constructor keeps WS-QF's `opts` parameter on `publish()`; `activationHandledByCoDeploy` continues to be forwarded into the preflight context until Task 8 retires it. Change the `FUNCTION_CONFIG_UPSERT` case (line ~233) to:

```ts
case 'FUNCTION_CONFIG_UPSERT':
  await this.writeFunctionConfig(mo, op.functionKey, op.config);
  // WS-E: the config metaobject alone deploys NOTHING — ensure the Shopify
  // activation object that makes the function execute. Runs even when the
  // config diff is a no-op (a prior partial failure may have written config
  // without activation). Throws without shopId: fail loudly, never publish a
  // function silently inert.
  await this.ensureFunctionActivation(op.functionKey);
  break;
```

and add the private method + import (`import { ActivationService, FUNCTION_KEY_ACTIVATION } from '~/services/publish/activation.service';`):

```ts
private async ensureFunctionActivation(functionKey: string): Promise<void> {
  if (!FUNCTION_KEY_ACTIVATION[functionKey]) return;
  const shopId = this.session?.shopId;
  if (!shopId) {
    throw new Error(
      `Publishing functions.${functionKey} requires session.shopId for activation wiring — ` +
        `pass { shopId } to PublishService (WS-E).`,
    );
  }
  await new ActivationService(this.admin, shopId).ensureForFunctionKey(functionKey);
}
```

Update the four construction sites:
- `api.publish.tsx:225` → `new PublishService(admin, { shop: session.shop, shopId: shopRow?.id })`
- `api.agent.modules.$moduleId.publish.tsx:167` → same pattern (that route already loads its shop row; if it doesn't, add `const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });` mirroring api.publish.tsx:84)
- `blueprint.service.ts:448` → the method already knows `shopDomain`; resolve `shopId` once at the top of `publishBlueprint` (`prisma.shop.findUnique({ where: { shopDomain } })`) and pass `{ shopId: shop?.id }`
- `publish-worker.adapter.server.ts:73` → `new PublishService(admin, { shopId: payload.shopId })`

- [ ] **Step 7: Add a publish-path test** — append to `activation.service.test.ts`:

```ts
import { PublishService } from '~/services/publish/publish.service';

describe('PublishService → activation hook', () => {
  it('throws (never silently inert) when a mapped functionKey publishes without shopId', async () => {
    const { admin } = mockAdmin(() => ({ data: {} }));
    const svc = new PublishService(admin); // no session.shopId
    await expect(
      // minimal discountRules spec — reuse the template like publish-functions-reliability does
      (async () => {
        const { MODULE_TEMPLATES } = await import('@superapp/core');
        const spec = MODULE_TEMPLATES.find((t) => t.spec.type === 'functions.discountRules')!.spec;
        await svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' });
      })(),
    ).rejects.toThrow(/shopId/);
  });
});
```

(If the mocked graphql responses needed for the metaobject writes before the throw get fiddly, assert the throw happens before by making `mockAdmin` return `{ data: { metaobjectUpsert: { metaobject: { id: 'gid://m/1' } }, metafieldDefinitionCreate: { userErrors: [] }, metafieldsSet: { metafields: [] }, shop: { id: 'gid://shopify/Shop/1' }, metaobjectByHandle: null } }` for every op — the service reads whichever key it needs.)

- [ ] **Step 8: Migrate the bundle-discount writer (E3)** — delete `ensureAutomaticBundleDiscount`, `DISCOUNT_NODES_QUERY`, `SHOPIFY_FUNCTIONS_QUERY`, `DISCOUNT_AUTOMATIC_APP_CREATE`, and `DISCOUNT_FUNCTION_HANDLE` from `bundle-product.service.ts`. In `blueprint.service.ts:476` replace `await bundleSvc.ensureAutomaticBundleDiscount();` with:

```ts
await new ActivationService(admin, shopId).ensureForFunctionKey('discountRules');
```

(`shopId` from Step 6's lookup; import ActivationService.) Update `bundle-product.service.test.ts`: move/rewrite its `ensureAutomaticBundleDiscount` cases as `ActivationService` discount cases (the adoption test in Step 2 already covers the critical path — delete redundant ones, keep any distinct edge, e.g. top-level-GraphQL-error handling).

- [ ] **Step 9: Un-gate `functions.discountRules`** — in `extension-eligibility.ts`: `new Set<string>(['functions.discountRules'])`. In `publish-functions-reliability.test.ts` restore the Task-1-modified assertion: with the handle deployed, `functions.discountRules` is `deployable` again (the Task 1 gate tests skip wired types automatically).

- [ ] **Step 10: Run the affected suites** — `npx vitest run app/__tests__/activation.service.test.ts app/__tests__/publish-functions-reliability.test.ts app/__tests__/bundle-product.service.test.ts app/__tests__/blueprint-co-deploy.test.ts app/__tests__/publish-contract-drift.test.ts`. Expected: PASS. Then the whole suite: `npx vitest run`. Fix only failures this task caused.

- [ ] **Step 11: Commit**

```bash
git add -A apps/web/prisma apps/web/app packages/core
git commit -m "feat(ws-e): ActivationService + FunctionActivation table; discount activation wired; functions.discountRules un-gated"
```

---

### Task 4: Delivery-customization activation + un-gate `functions.deliveryCustomization`

**Files:**
- Modify: `apps/web/app/services/publish/activation.service.ts`
- Modify: `packages/core/src/extension-eligibility.ts` (wired set + `'functions.deliveryCustomization'`)
- Modify: `apps/web/app/__tests__/activation.service.test.ts`

**Interfaces:**
- Consumes: Task 3's `ActivationService` internals (`getStored`/`store`/`clearStored`/`graphqlJson`/`deleteWith`).
- Produces: `FUNCTION_KEY_ACTIVATION.deliveryCustomization = { kind: 'deliveryCustomization', functionHandle: 'superapp-delivery-customization' }`. Scope `write_delivery_customizations` is already granted (shopify.app.toml) — no toml change.

- [ ] **Step 1: Write the failing tests** (append to `activation.service.test.ts`):

```ts
describe('ActivationService — deliveryCustomization kind', () => {
  it('creates via functionHandle with enabled:true on first ensure', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList')
        return { data: { deliveryCustomizations: { nodes: [] } } };
      if (op === 'SuperAppDeliveryCustomizationCreate')
        return { data: { deliveryCustomizationCreate: { deliveryCustomization: { id: 'gid://shopify/DeliveryCustomization/1' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization');
    expect(gid).toBe('gid://shopify/DeliveryCustomization/1');
    const create = calls.find((c) => c.op === 'SuperAppDeliveryCustomizationCreate')!;
    expect((create.variables!.deliveryCustomization as any).functionHandle).toBe('superapp-delivery-customization');
    expect((create.variables!.deliveryCustomization as any).enabled).toBe(true);
  });

  it('adopts an existing customization for our function instead of duplicating', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList')
        return { data: { deliveryCustomizations: { nodes: [{ id: 'gid://d/9', title: 'x', enabled: true, functionId: 'fn_1' }] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization');
    expect(gid).toBe('gid://d/9');
    expect(calls.map((c) => c.op)).not.toContain('SuperAppDeliveryCustomizationCreate');
  });

  it('stored GID → zero Shopify calls; delete uses deliveryCustomizationDelete', async () => {
    db.set('shop_1:deliveryCustomization', { functionKey: 'deliveryCustomization', kind: 'deliveryCustomization', activationGid: 'gid://d/1' });
    const noCall = mockAdmin(() => { throw new Error('no call expected'); });
    expect(await new ActivationService(noCall.admin, 'shop_1').ensureForFunctionKey('deliveryCustomization')).toBe('gid://d/1');

    const del = mockAdmin((op) => {
      if (op === 'SuperAppDeliveryCustomizationDelete')
        return { data: { deliveryCustomizationDelete: { deletedId: 'gid://d/1', userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    await new ActivationService(del.admin, 'shop_1').deleteForFunctionKey('deliveryCustomization');
    expect(del.calls.map((c) => c.op)).toEqual(['SuperAppDeliveryCustomizationDelete']);
    expect(db.has('shop_1:deliveryCustomization')).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (kind unmapped → ensure returns null → first expectation fails).

- [ ] **Step 3: Implement** — add to `activation.service.ts`:

```ts
// registry entry:
deliveryCustomization: { kind: 'deliveryCustomization', functionHandle: 'superapp-delivery-customization' },
```

```ts
const FUNCTION_LOOKUP = `#graphql
  query SuperAppFunctionLookup {
    shopifyFunctions(first: 50) { nodes { id apiType title handle } }
  }
`;
const DELIVERY_LIST = `#graphql
  query SuperAppDeliveryCustomizationList {
    deliveryCustomizations(first: 25) { nodes { id title enabled functionId } }
  }
`;
const DELIVERY_CREATE = `#graphql
  mutation SuperAppDeliveryCustomizationCreate($deliveryCustomization: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;
const DELIVERY_DELETE = `#graphql
  mutation SuperAppDeliveryCustomizationDelete($id: ID!) {
    deliveryCustomizationDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;
```

```ts
/** Resolve the app-scoped ShopifyFunction id for a handle (recovery matching only — creates bind by handle). */
private async lookupFunctionId(functionHandle: string): Promise<string> {
  const json = await this.graphqlJson<{ shopifyFunctions: { nodes: Array<{ id: string; handle: string }> } }>(FUNCTION_LOOKUP);
  const fn = (json.data?.shopifyFunctions?.nodes ?? []).find((n) => n.handle === functionHandle);
  if (!fn) {
    throw new Error(
      `Function "${functionHandle}" is not deployed on this shop (shopifyFunctions lookup) — run \`shopify app deploy\` first.`,
    );
  }
  return fn.id;
}

private async ensureDeliveryCustomization(functionKey: string, functionHandle: string): Promise<string> {
  const stored = await this.getStored(functionKey);
  if (stored) return stored.activationGid;

  const functionId = await this.lookupFunctionId(functionHandle);
  const list = await this.graphqlJson<{ deliveryCustomizations: { nodes: Array<{ id: string; functionId: string }> } }>(DELIVERY_LIST);
  const found = (list.data?.deliveryCustomizations?.nodes ?? []).find((n) => n.functionId === functionId);
  if (found) {
    await this.store(functionKey, 'deliveryCustomization', found.id);
    return found.id;
  }

  const created = await this.graphqlJson<{
    deliveryCustomizationCreate: { deliveryCustomization?: { id: string }; userErrors: Array<{ message: string }> };
  }>(DELIVERY_CREATE, {
    deliveryCustomization: { functionHandle, title: 'SuperApp Delivery Customization', enabled: true },
  });
  const err = created.data?.deliveryCustomizationCreate?.userErrors?.[0];
  if (err) throw new Error(`deliveryCustomizationCreate failed: ${err.message}`);
  const id = created.data?.deliveryCustomizationCreate?.deliveryCustomization?.id;
  if (!id) throw new Error('deliveryCustomizationCreate returned no id');
  await this.store(functionKey, 'deliveryCustomization', id);
  return id;
}
```

Wire both switches: `case 'deliveryCustomization': return this.ensureDeliveryCustomization(functionKey, mapping.functionHandle);` and in `deleteForFunctionKey`: `case 'deliveryCustomization': await this.deleteWith(DELIVERY_DELETE, stored.activationGid, 'deliveryCustomizationDelete'); break;`

- [ ] **Step 4: Un-gate** — add `'functions.deliveryCustomization'` to `ACTIVATION_WIRED_FUNCTION_TYPES`.

- [ ] **Step 5: Run** — `npx vitest run app/__tests__/activation.service.test.ts app/__tests__/publish-functions-reliability.test.ts`. Expected: PASS. Note in the commit body: this type runs on Shopify Plus (registry `requiresPlan` note surfaces at publish as a reason, not a block — unchanged behavior).

- [ ] **Step 6: Commit** — `git commit -m "feat(ws-e): delivery-customization activation; functions.deliveryCustomization un-gated"`

---

### Task 5: Payment-customization activation + un-gate `functions.paymentCustomization`

Identical shape to Task 4. **Files:** same three as Task 4.

**Interfaces:** Produces `FUNCTION_KEY_ACTIVATION.paymentCustomization = { kind: 'paymentCustomization', functionHandle: 'superapp-payment-customization' }`. Scope `write_payment_customizations` already granted.

- [ ] **Step 1: Write the failing tests** — copy the three Task 4 tests, substituting: describe `'ActivationService — paymentCustomization kind'`; ops `SuperAppPaymentCustomizationList/Create/Delete`; data keys `paymentCustomizations` / `paymentCustomizationCreate` (`paymentCustomization { id }`) / `paymentCustomizationDelete` (`deletedId`); functionKey `'paymentCustomization'`; handle `'superapp-payment-customization'`; GID prefix `gid://shopify/PaymentCustomization/1`; title `'SuperApp Payment Customization'`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — documents (2026-07-validated):

```ts
const PAYMENT_LIST = `#graphql
  query SuperAppPaymentCustomizationList {
    paymentCustomizations(first: 25) { nodes { id title enabled functionId } }
  }
`;
const PAYMENT_CREATE = `#graphql
  mutation SuperAppPaymentCustomizationCreate($paymentCustomization: PaymentCustomizationInput!) {
    paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
      paymentCustomization { id }
      userErrors { field message }
    }
  }
`;
const PAYMENT_DELETE = `#graphql
  mutation SuperAppPaymentCustomizationDelete($id: ID!) {
    paymentCustomizationDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;
```

`ensurePaymentCustomization` is `ensureDeliveryCustomization` with the payment documents, title `'SuperApp Payment Customization'`, kind `'paymentCustomization'`, input `{ functionHandle, title, enabled: true }`. Wire both switch cases. Add registry entry.

- [ ] **Step 4: Un-gate** — add `'functions.paymentCustomization'` to the wired set.

- [ ] **Step 5: Run** both test files. Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(ws-e): payment-customization activation; functions.paymentCustomization un-gated"`

---

### Task 6: Checkout-validation activation + `write_validations` scope + un-gate `functions.cartAndCheckoutValidation`

**Files:**
- Modify: `apps/web/app/services/publish/activation.service.ts`
- Modify: `shopify.app.production.toml` + `shopify.app.dev.toml` (scopes)
- Modify: `packages/core/src/extension-eligibility.ts`
- Modify: `apps/web/app/__tests__/activation.service.test.ts`

**Interfaces:** Produces `FUNCTION_KEY_ACTIVATION.cartAndCheckoutValidation = { kind: 'validation', functionHandle: 'superapp-cart-checkout-validation' }`.

- [ ] **Step 1: Write the failing tests** — same trio, substitutions: describe `'ActivationService — validation kind'`; recovery list op `SuperAppValidationList` returning `{ data: { validations: { nodes: [{ id: 'gid://v/9', enabled: true, shopifyFunction: { id: 'fn_1', handle: 'superapp-cart-checkout-validation' } }] } } }` — note: **no `SuperAppFunctionLookup` needed** (nodes expose the handle directly; assert `calls` does NOT contain it); create op `SuperAppValidationCreate` → `{ data: { validationCreate: { validation: { id: 'gid://shopify/Validation/1' }, userErrors: [] } } }`, asserting create variables `{ validation: { functionHandle, enable: true, blockOnFailure: false, title: 'SuperApp Checkout Validation' } }` (field is `enable`, not `enabled` — 2026-07 `ValidationCreateInput`); delete op `SuperAppValidationDelete` → `validationDelete { deletedId }`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — documents (2026-07-validated):

```ts
const VALIDATION_LIST = `#graphql
  query SuperAppValidationList {
    validations(first: 25) { nodes { id enabled shopifyFunction { id handle } } }
  }
`;
const VALIDATION_CREATE = `#graphql
  mutation SuperAppValidationCreate($validation: ValidationCreateInput!) {
    validationCreate(validation: $validation) {
      validation { id }
      userErrors { field message }
    }
  }
`;
const VALIDATION_DELETE = `#graphql
  mutation SuperAppValidationDelete($id: ID!) {
    validationDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;
```

```ts
private async ensureValidation(functionKey: string, functionHandle: string): Promise<string> {
  const stored = await this.getStored(functionKey);
  if (stored) return stored.activationGid;

  const list = await this.graphqlJson<{
    validations: { nodes: Array<{ id: string; shopifyFunction?: { handle?: string } | null }> };
  }>(VALIDATION_LIST);
  const found = (list.data?.validations?.nodes ?? []).find((n) => n.shopifyFunction?.handle === functionHandle);
  if (found) {
    await this.store(functionKey, 'validation', found.id);
    return found.id;
  }

  const created = await this.graphqlJson<{
    validationCreate: { validation?: { id: string }; userErrors: Array<{ message: string }> };
  }>(VALIDATION_CREATE, {
    validation: {
      functionHandle,
      enable: true,
      // A validation-function timeout must not brick checkout — validation ERRORS
      // still always block (platform behavior); this only governs runtime exceptions.
      blockOnFailure: false,
      title: 'SuperApp Checkout Validation',
    },
  });
  const err = created.data?.validationCreate?.userErrors?.[0];
  if (err) throw new Error(`validationCreate failed: ${err.message}`);
  const id = created.data?.validationCreate?.validation?.id;
  if (!id) throw new Error('validationCreate returned no id');
  await this.store(functionKey, 'validation', id);
  return id;
}
```

Switch cases: ensure → `ensureValidation`; delete → `this.deleteWith(VALIDATION_DELETE, stored.activationGid, 'validationDelete')`. Registry entry added.

- [ ] **Step 4: Add the scope** — add `write_validations` (alphabetically) to **both** `shopify.app.production.toml` and `shopify.app.dev.toml` scopes, with this comment above the list appended to the existing audit note:

```toml
# WS-E: write_validations (validationCreate/Update/Delete — checkout-validation
# activation objects) + write_fulfillment_constraint_rules (Task 7) added. Scope
# changes need `shopify app deploy` + merchant re-consent before live effect.
```

Also extend `runPublishPreflight` so the missing grant fails loudly at publish (not deep in the mutation): in `publish-preflight.server.ts` change the signature to `runPublishPreflight(admin, input: { isThemeModule: boolean; moduleType?: string })` and compute:

```ts
const FUNCTION_TYPE_REQUIRED_SCOPES: Record<string, string[]> = {
  'functions.discountRules': ['write_discounts'],
  'functions.cartTransform': ['write_cart_transforms', 'write_products'],
  'functions.deliveryCustomization': ['write_delivery_customizations'],
  'functions.paymentCustomization': ['write_payment_customizations'],
  'functions.cartAndCheckoutValidation': ['write_validations'],
  'functions.fulfillmentConstraints': ['write_fulfillment_constraint_rules'],
};

const requiredScopes = [
  'write_metaobjects',
  ...(input.isThemeModule ? ['read_themes'] : []),
  ...(input.moduleType ? (FUNCTION_TYPE_REQUIRED_SCOPES[input.moduleType] ?? []) : []),
];
```

and pass `moduleType: spec.type` at the `runPublishPreflight` call in `api.publish.tsx:104` (and the agent publish route's equivalent call).

- [ ] **Step 5: Un-gate** — add `'functions.cartAndCheckoutValidation'` to the wired set.

- [ ] **Step 6: Run** — `npx vitest run app/__tests__/activation.service.test.ts app/__tests__/publish-functions-reliability.test.ts app/__tests__/publish-preflight.test.ts` (extend the preflight test with one case: `moduleType: 'functions.cartAndCheckoutValidation'` + granted scopes lacking `write_validations` → `ok: false, missingScopes: ['write_validations']`). Expected: PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(ws-e): checkout-validation activation + write_validations scope; functions.cartAndCheckoutValidation un-gated"`

---

### Task 7: Fulfillment-constraint activation + `write_fulfillment_constraint_rules` scope + un-gate `functions.fulfillmentConstraints`

**Files:** same four as Task 6.

**Interfaces:** Produces `FUNCTION_KEY_ACTIVATION.fulfillmentConstraints = { kind: 'fulfillmentConstraintRule', functionHandle: 'superapp-fulfillment-constraints' }`. NOTE: `fulfillmentConstraintRuleCreate` has **no update mutation** — idempotency is stored-GID + recovery-list only; `deliveryMethodTypes` is required and immutable (delete+recreate to change).

- [ ] **Step 1: Write the failing tests** — trio with: recovery op `SuperAppFulfillmentConstraintRuleList` → `{ data: { fulfillmentConstraintRules: [{ id: 'gid://f/9', function: { id: 'fn_1', handle: 'superapp-fulfillment-constraints' } }] } }` (NOTE: plain list, not a connection — validated); create op `SuperAppFulfillmentConstraintRuleCreate` asserting variables `{ functionHandle: 'superapp-fulfillment-constraints', deliveryMethodTypes: ['SHIPPING', 'LOCAL', 'PICK_UP'] }` → `{ data: { fulfillmentConstraintRuleCreate: { fulfillmentConstraintRule: { id: 'gid://shopify/FulfillmentConstraintRule/1' }, userErrors: [] } } }`; delete op `SuperAppFulfillmentConstraintRuleDelete` → `{ data: { fulfillmentConstraintRuleDelete: { success: true, userErrors: [] } } }`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — documents (2026-07-validated; create by `functionHandle`, the `functionId` arg is deprecated):

```ts
const FCR_LIST = `#graphql
  query SuperAppFulfillmentConstraintRuleList {
    fulfillmentConstraintRules { id function { id handle } }
  }
`;
const FCR_CREATE = `#graphql
  mutation SuperAppFulfillmentConstraintRuleCreate($functionHandle: String!, $deliveryMethodTypes: [DeliveryMethodType!]!) {
    fulfillmentConstraintRuleCreate(functionHandle: $functionHandle, deliveryMethodTypes: $deliveryMethodTypes) {
      fulfillmentConstraintRule { id }
      userErrors { field message }
    }
  }
`;
const FCR_DELETE = `#graphql
  mutation SuperAppFulfillmentConstraintRuleDelete($id: ID!) {
    fulfillmentConstraintRuleDelete(id: $id) {
      success
      userErrors { field message }
    }
  }
`;
```

```ts
private async ensureFulfillmentConstraintRule(functionKey: string, functionHandle: string): Promise<string> {
  const stored = await this.getStored(functionKey);
  if (stored) return stored.activationGid;

  const list = await this.graphqlJson<{
    fulfillmentConstraintRules: Array<{ id: string; function?: { handle?: string } | null }>;
  }>(FCR_LIST);
  const found = (list.data?.fulfillmentConstraintRules ?? []).find((n) => n.function?.handle === functionHandle);
  if (found) {
    await this.store(functionKey, 'fulfillmentConstraintRule', found.id);
    return found.id;
  }

  const created = await this.graphqlJson<{
    fulfillmentConstraintRuleCreate: { fulfillmentConstraintRule?: { id: string }; userErrors: Array<{ message: string }> };
  }>(FCR_CREATE, {
    functionHandle,
    // The wasm decides per-config which constraints to emit; register for all
    // delivery method types so config changes never require re-activation.
    deliveryMethodTypes: ['SHIPPING', 'LOCAL', 'PICK_UP'],
  });
  const err = created.data?.fulfillmentConstraintRuleCreate?.userErrors?.[0];
  if (err) throw new Error(`fulfillmentConstraintRuleCreate failed: ${err.message}`);
  const id = created.data?.fulfillmentConstraintRuleCreate?.fulfillmentConstraintRule?.id;
  if (!id) throw new Error('fulfillmentConstraintRuleCreate returned no id');
  await this.store(functionKey, 'fulfillmentConstraintRule', id);
  return id;
}
```

Delete case: `deleteWith(FCR_DELETE, stored.activationGid, 'fulfillmentConstraintRuleDelete')` (its result field is `success`, not `deletedId` — `deleteWith` only inspects `userErrors`, so no change needed). Registry entry added.

- [ ] **Step 4: Scope** — add `write_fulfillment_constraint_rules` to **both** `shopify.app.production.toml` and `shopify.app.dev.toml` scopes (comment already added in Task 6). Add `'functions.fulfillmentConstraints': ['write_fulfillment_constraint_rules']` already present in Task 6's map — verify.

- [ ] **Step 5: Un-gate** — add `'functions.fulfillmentConstraints'` to the wired set. Run the three suites from Task 6 Step 6. Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(ws-e): fulfillment-constraint activation + scope; functions.fulfillmentConstraints un-gated"`

---

### Task 8: Cart-transform activation via `BundleProductService` in single-module publish + remove the dead compiler metaobject + un-gate `functions.cartTransform` (E5)

**Files:**
- Modify: `apps/web/app/services/publish/publish.service.ts`
- Modify: `apps/web/app/services/publish/activation.service.ts` (cartTransform delete support)
- Modify: `apps/web/app/services/recipes/compiler/functions.cartTransform.ts`
- Modify: `packages/core/src/extension-eligibility.ts`
- Modify: `apps/web/app/__tests__/activation.service.test.ts`; check `apps/web/app/__tests__/publish-contract-drift.test.ts` + compiler tests for the removed op

**Interfaces:**
- Consumes: `BundleProductService.resolveComponents/ensureParentBundleProduct/activateCartTransform/buildBundleRuntimeConfig/resolveBundleWithPricing/bundleIdFromTitle/bundleParentSku` (all existing, unchanged) and `BlueprintService.resolveBundleForBlueprint`'s flow as the reference implementation (blueprint.service.ts:288–314).
- Produces: `PublishService` handles `functions.cartTransform` specs end-to-end; `FUNCTION_KEY_ACTIVATION.cartTransform = { kind: 'cartTransform', functionHandle: 'cart-transform-function' }` (delete path only — ensure happens through `activateCartTransform`, which also writes `$app:bundle_config`).

- [ ] **Step 1: Remove the dead op** — in `functions.cartTransform.ts` delete the `{ kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'cartTransform', config }` op (keep the AUDIT ops and the pricing lowering — the lowered `config` local now feeds Step 3's publish hook via `compiledJson`); change `compiledJson` to carry the full lowered config the publish path needs:

```ts
return {
  ops: [
    { kind: 'AUDIT', action: 'compile.functions.cartTransform' },
    ...ops,
  ],
  // WS-E: the wasm reads $app:bundle_config on the CartTransform object — the old
  // superapp-fn-cartTransform metaobject was a second config source it never read
  // and is no longer written. The lowered config rides compiledJson to the
  // publish-time bundle wiring (PublishService.publishCartTransform).
  compiledJson: JSON.stringify({ cartTransform: config }),
};
```

Run the compiler/publish suites (`npx vitest run app/__tests__/publish-contract-drift.test.ts app/__tests__/preview-sample-and-deployment.test.ts` + `npx vitest run app/services/recipes`) and update any test pinning the old op/`metaobjectHandle` compiledJson. Expected after updates: PASS.

- [ ] **Step 2: Write the failing publish-path test** (append to `activation.service.test.ts`):

```ts
describe('functions.cartTransform single-module publish (WS-E bundles decision E5)', () => {
  it('resolves components, ensures the parent product, and activates the cart transform with $app:bundle_config', async () => {
    const { admin, calls } = mockAdmin((op) => {
      switch (op) {
        case 'SuperAppVariantsBySku':
          return { data: { productVariants: { nodes: [
            { id: 'gid://v/1', sku: 'SKU-A', title: 'A', price: '10', product: { title: 'A' } },
            { id: 'gid://v/2', sku: 'SKU-B', title: 'B', price: '20', product: { title: 'B' } },
          ] } } };
        case 'SuperAppBundleProductSet':
          return { data: { productSet: { product: { variants: { nodes: [{ id: 'gid://v/parent' }] } }, userErrors: [] } } };
        case 'SuperAppCartTransforms':
          return { data: { cartTransforms: { nodes: [] } } };
        case 'SuperAppCartTransformCreate':
          return { data: { cartTransformCreate: { cartTransform: { id: 'gid://shopify/CartTransform/1' }, userErrors: [] } } };
        default:
          return { data: {} }; // metaobject/metafield plumbing for other module payloads — none here
      }
    });

    const { PublishService } = await import('~/services/publish/publish.service');
    const spec = {
      type: 'functions.cartTransform',
      category: 'functions',
      name: 'Bundle',
      config: { bundles: [{ title: 'Duo', componentSkus: ['SKU-A', 'SKU-B'], bundleSku: 'DUO' }] },
    } as never;
    await new PublishService(admin, { shopId: 'shop_1' }).publish(spec, { kind: 'PLATFORM', moduleId: 'm1' });

    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppVariantsBySku',
      'SuperAppBundleProductSet',
      'SuperAppCartTransforms',
      'SuperAppCartTransformCreate',
    ]);
    const create = calls.at(-1)!;
    const metafields = create.variables!.metafields as Array<{ key: string; value: string }>;
    const cfg = JSON.parse(metafields[0]!.value) as { bundles: Array<{ bundleId: string; parentVariantId: string }> };
    expect(cfg.bundles[0]).toMatchObject({ bundleId: 'duo', parentVariantId: 'gid://v/parent' });
    // Activation GID stored for unpublish.
    expect(db.get('shop_1:cartTransform')?.activationGid).toBe('gid://shopify/CartTransform/1');
  });

  it('fails LOUD when fewer than 2 component SKUs resolve (no placeholder deploy)', async () => {
    const { admin } = mockAdmin((op) =>
      op === 'SuperAppVariantsBySku' ? { data: { productVariants: { nodes: [] } } } : { data: {} },
    );
    const { PublishService } = await import('~/services/publish/publish.service');
    const spec = {
      type: 'functions.cartTransform', category: 'functions', name: 'Bundle',
      config: { bundles: [{ title: 'Duo', componentSkus: ['SKU-A', 'SKU-B'], bundleSku: 'DUO' }] },
    } as never;
    await expect(
      new PublishService(admin, { shopId: 'shop_1' }).publish(spec, { kind: 'PLATFORM', moduleId: 'm1' }),
    ).rejects.toThrow(/resolved/i);
  });
});
```

(Requires `functions.cartTransform` un-gated — Step 4 — so write Steps 2–4 then run; that's fine, the test drives the whole task.)

- [ ] **Step 3: Implement `publishCartTransform`** — in `publish.service.ts`, at the top of `publish()` right after the preflight gate + compile, add a type branch (before the ops loop; the compiler no longer emits a function op for this type):

```ts
// WS-E (E5): functions.cartTransform deploys through the SAME end-to-end path the
// blueprint co-deploy proved out — resolve SKUs → parent bundle product → cart
// transform activation carrying $app:bundle_config (the ONLY config the wasm reads).
if (spec.type === 'functions.cartTransform') {
  await this.publishCartTransform(spec);
}
```

```ts
private async publishCartTransform(spec: RecipeSpec): Promise<void> {
  const shopId = this.session?.shopId;
  if (!shopId) {
    throw new Error('Publishing functions.cartTransform requires session.shopId (WS-E).');
  }
  const config = (spec as { config?: { bundles?: Array<Record<string, unknown>>; pricing?: unknown } }).config;
  const bundleInputs = config?.bundles ?? [];
  const svc = new BundleProductService(this.admin);
  const resolved: ResolvedBundle[] = [];
  for (const b of bundleInputs) {
    const componentSkus = (b.componentSkus as string[] | undefined) ?? [];
    const title = String(b.title ?? 'Bundle');
    const components = await svc.resolveComponents(componentSkus);
    if (components.length < 2) {
      throw new Error(
        `Bundle "${title}": only ${components.length}/${componentSkus.length} component SKUs resolved to store variants — fix the SKUs and republish.`,
      );
    }
    const bundleId = bundleIdFromTitle(title);
    const parentVariantId = await svc.ensureParentBundleProduct({ bundleId, title, components });
    const base: ResolvedBundle = {
      bundleId, title, parentVariantId,
      bundleSku: bundleParentSku(bundleId),
      discountPercentage: Number(b.discountPercentage ?? 0),
      components,
    };
    resolved.push(resolveBundleWithPricing(base, (b.pricing ?? config?.pricing) as never));
  }
  const cartTransformGid = await svc.activateCartTransform(buildBundleRuntimeConfig(resolved));
  // Record for unpublish (Task 10) — kind cartTransform, one per shop.
  await new ActivationService(this.admin, shopId).recordCartTransform(cartTransformGid);
}
```

with imports `{ BundleProductService, buildBundleRuntimeConfig, resolveBundleWithPricing, bundleIdFromTitle, bundleParentSku, type ResolvedBundle }` from `~/services/bundles/bundle-product.service`. In `activation.service.ts` add the registry entry `cartTransform: { kind: 'cartTransform', functionHandle: 'cart-transform-function' }`, plus:

```ts
/** cartTransform's ensure runs through BundleProductService.activateCartTransform;
 *  this records the resulting GID so delete/unpublish can find it. */
async recordCartTransform(activationGid: string): Promise<void> {
  await this.store('cartTransform', 'cartTransform', activationGid);
}
```

`ensureForFunctionKey('cartTransform')` throws `'cartTransform activation is ensured by publishCartTransform (BundleProductService) — not via ensureForFunctionKey'` (it can never be reached from the ops loop since the compiler op is gone — the throw guards regressions). Delete case:

```ts
const CART_TRANSFORM_DELETE = `#graphql
  mutation SuperAppCartTransformDelete($id: ID!) {
    cartTransformDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;
// deleteForFunctionKey switch:
case 'cartTransform':
  await this.deleteWith(CART_TRANSFORM_DELETE, stored.activationGid, 'cartTransformDelete');
  break;
```

- [ ] **Step 4: Un-gate** — add `'functions.cartTransform'` to `ACTIVATION_WIRED_FUNCTION_TYPES`. If Task 1 left a `TODO(WS-E Task 8)` relaxation in `blueprint-deployability.test.ts`, restore the strict `deployable` assertion now (all blueprint member types are wired).

- [ ] **Step 5: Run** — `npx vitest run app/__tests__/activation.service.test.ts app/__tests__/publish-functions-reliability.test.ts app/__tests__/blueprint-deployability.test.ts app/__tests__/blueprint-co-deploy.test.ts app/__tests__/bundle-product.service.test.ts`. The blueprint co-deploy path double-wires (its own `resolveBundleForBlueprint` + now `publishCartTransform` inside `PublishService.publish`) — that is idempotent (same handles/lookups) but wasteful; in `blueprint.service.ts`, keep ordering "publish member first, then `activateCartTransform` with the RESOLVED config" (comment at lines 337–342) — since `publishCartTransform` now activates with the fully resolved config itself, delete the blueprint's redundant second `activateCartTransform` call at line ~474 if its config is identical (it is — both come from `buildBundleRuntimeConfig(resolved)`); keep `writeBundlePricingRules` + the discount ensure. Update `blueprint-co-deploy.test.ts` expectations accordingly. Expected: PASS.

- [ ] **Step 6: Full suite** — `npx vitest run`. Fix only regressions from this task.

- [ ] **Step 7: Commit** — `git commit -m "feat(ws-e): cartTransform publish wires BundleProductService end-to-end; dead superapp-fn-cartTransform metaobject removed; type un-gated"`

---

### Task 9: `UnpublishService` (compile-inverting cleanup) + `WebPixelService.delete` + `MetaobjectService.getMetaobjectIdByHandle`

**Files:**
- Create: `apps/web/app/services/publish/unpublish.service.ts`
- Modify: `apps/web/app/services/shopify/metaobject.service.ts`
- Modify: `apps/web/app/services/shopify/web-pixel.service.ts`
- Create: `apps/web/app/__tests__/unpublish.service.test.ts`

**Interfaces:**
- Consumes: `compileRecipe` (`~/services/recipes/compiler`), `MetaobjectService`, `MetafieldService.deleteShopMetafield`, `ActivationService.deleteForFunctionKey` (Tasks 3–8), namespace/key constants from `publish.service.ts` (EXPORT them: change the `const THEME_MODULES_NAMESPACE = ...` block, lines 25–52, to `export const ...` so both services share one source of truth).
- Produces:

```ts
export type UnpublishReport = { removedRefs: string[]; deletedMetaobjects: string[]; deletedActivations: string[]; deletedWebPixel: boolean };
export class UnpublishService {
  constructor(admin: AdminApiContext['admin'], session: { shopId?: string });
  /** Inverts a publish of `spec` for module `moduleId`. Idempotent — already-gone resources are success. */
  unpublish(spec: RecipeSpec, target: DeployTarget): Promise<UnpublishReport>;
}
```

- `MetaobjectService.getMetaobjectIdByHandle(type: string, handle: string): Promise<string | null>`
- `WebPixelService.delete(): Promise<boolean>` (false = no pixel existed)

- [ ] **Step 1: Small helpers first (failing tests)** — append to a new `unpublish.service.test.ts`:

```ts
// (mockAdmin helper + ~/db.server mock as in activation.service.test.ts; the db
// mock additionally needs prisma.module.count → configurable number for the
// shared-web-pixel guard.)

describe('MetaobjectService.getMetaobjectIdByHandle', () => {
  it('returns the id, or null when absent', async () => {
    const { admin } = mockAdmin((op) =>
      op === 'MetaobjectByHandle'
        ? { data: { metaobjectByHandle: { id: 'gid://mo/1', field: { value: '{}' } } } }
        : { data: {} },
    );
    const { MetaobjectService } = await import('~/services/shopify/metaobject.service');
    expect(await new MetaobjectService(admin).getMetaobjectIdByHandle('$app:superapp_module', 'superapp-module-m1')).toBe('gid://mo/1');
  });
});

describe('WebPixelService.delete', () => {
  it('deletes the current pixel; returns false when none exists', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppWebPixel') return { data: { webPixel: { id: 'gid://px/1' } } };
      if (op === 'SuperAppWebPixelDelete') return { data: { webPixelDelete: { deletedWebPixelId: 'gid://px/1', userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { WebPixelService } = await import('~/services/shopify/web-pixel.service');
    expect(await new WebPixelService(admin).delete()).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(['SuperAppWebPixel', 'SuperAppWebPixelDelete']);
  });
});
```

- [ ] **Step 2: Run** (FAIL) **then implement the helpers.** `getMetaobjectIdByHandle` reuses the existing `METAOBJECT_BY_HANDLE` document with a `handle: { type, handle }` variable and returns `json?.data?.metaobjectByHandle?.id ?? null`. `WebPixelService.delete`:

```ts
const WEB_PIXEL_DELETE = `#graphql
  mutation SuperAppWebPixelDelete($id: ID!) {
    webPixelDelete(id: $id) {
      deletedWebPixelId
      userErrors { field message }
    }
  }
`;

/** Delete the app's web pixel. Returns false when none exists (idempotent). */
async delete(): Promise<boolean> {
  const id = await this.currentPixelId();
  if (!id) return false;
  const res = await this.admin.graphql(WEB_PIXEL_DELETE, { variables: { id } });
  const json = (await res.json()) as {
    errors?: Array<{ message?: string }>;
    data?: { webPixelDelete?: { userErrors?: Array<{ message?: string }> } };
  };
  const topLevelErr = json?.errors?.[0]?.message;
  if (topLevelErr) throw new Error(`webPixelDelete error: ${topLevelErr}`);
  const err = json?.data?.webPixelDelete?.userErrors?.[0]?.message;
  if (err) throw new Error(`webPixelDelete error: ${err}`);
  return true;
}
```

Run: PASS.

- [ ] **Step 3: Write the failing UnpublishService tests** (exact mutation sequences, mocked admin):

```ts
describe('UnpublishService', () => {
  it('theme module: removes the GID from module_refs and deletes the metaobject — exact sequence', async () => {
    const { admin, calls } = mockAdmin((op, vars) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/theme1' } } };
        case 'ShopModuleRefs':
          return { data: { shop: { metafield: { value: JSON.stringify(['gid://mo/other', 'gid://mo/theme1']) } } } };
        case 'ShopId':
          return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
        case 'MetafieldsSet':
          return { data: { metafieldsSet: { metafields: [{ id: 'mf1' }], userErrors: [] } } };
        case 'MetaobjectDelete':
          return { data: { metaobjectDelete: { deletedId: vars?.id, userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'theme.section', category: 'theme', name: 'Banner', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'THEME', themeId: '1', moduleId: 'm1' });

    expect(calls.map((c) => c.op)).toEqual([
      'MetaobjectByHandle',  // find superapp-module-m1
      'ShopModuleRefs',      // read refs list
      'ShopId', 'MetafieldsSet', // write refs list WITHOUT our GID
      'MetaobjectDelete',    // delete the metaobject LAST (refs first → storefront never renders a dangling ref)
    ]);
    const written = JSON.parse((calls[3]!.variables!.metafields as any)[0].value) as string[];
    expect(written).toEqual(['gid://mo/other']);
    expect(report.deletedMetaobjects).toEqual(['gid://mo/theme1']);
  });

  it('functions.discountRules: strips module rules but PRESERVES managed bundle rules + activation', async () => {
    const { admin, calls } = mockAdmin((op) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/fn', field: { value: JSON.stringify({ rules: [
            { id: 'mod-rule-1' }, { id: 'bundle:duo' },
          ] }) } } } };
        case 'MetaobjectUpsert':
          return { data: { metaobjectUpsert: { metaobject: { id: 'gid://mo/fn' }, userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.discountRules', category: 'functions', name: 'D', config: { rules: [{ id: 'mod-rule-1' }] } } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' });

    // Managed bundle rules remain → metaobject + activation + metafield ref all KEPT;
    // only the module's own rules were stripped via upsert.
    expect(calls.map((c) => c.op)).toEqual(['MetaobjectByHandle', 'MetaobjectUpsert']);
    const upserted = JSON.parse((calls[1]!.variables!.metaobject as any).fields
      .find((f: any) => f.key === 'config_json').value);
    expect(upserted.rules).toEqual([{ id: 'bundle:duo' }]);
    expect(report.deletedActivations).toEqual([]);
  });

  it('functions.discountRules with NO managed rules: deletes metaobject + shop metafield ref + activation', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://disc/1' });
    const { admin, calls } = mockAdmin((op) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/fn', field: { value: JSON.stringify({ rules: [{ id: 'mod-rule-1' }] }) } } } };
        case 'MetaobjectDelete':
          return { data: { metaobjectDelete: { deletedId: 'gid://mo/fn', userErrors: [] } } };
        case 'SuperAppDiscountActivationDelete':
          return { data: { discountAutomaticDelete: { deletedAutomaticDiscountId: 'gid://disc/1', userErrors: [] } } };
        default:
          return { data: {} }; // metafield delete plumbing
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.discountRules', category: 'functions', name: 'D', config: { rules: [{ id: 'mod-rule-1' }] } } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' });
    expect(calls.map((c) => c.op)).toContain('SuperAppDiscountActivationDelete');
    expect(report.deletedActivations).toEqual(['discountRules']);
  });

  it('analytics.pixel: deletes the web pixel only when no OTHER published pixel module remains', async () => {
    // prisma.module.count mocked → 0 other published analytics.pixel modules
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppWebPixel') return { data: { webPixel: { id: 'gid://px/1' } } };
      if (op === 'SuperAppWebPixelDelete') return { data: { webPixelDelete: { deletedWebPixelId: 'gid://px/1', userErrors: [] } } };
      return { data: {} };
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'analytics.pixel', category: 'analytics', name: 'P', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' });
    expect(report.deletedWebPixel).toBe(true);
    expect(calls.map((c) => c.op)).toContain('SuperAppWebPixelDelete');
  });
});
```

(Adjust the `analytics.pixel` spec shape to whatever `MODULE_TEMPLATES` uses if the bare `{config:{}}` doesn't compile a `WEB_PIXEL_UPSERT` op — pull the template spec like the reliability test does.)

- [ ] **Step 4: Run** (FAIL) **then implement `unpublish.service.ts`:**

```ts
import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import { MetafieldService } from '~/services/shopify/metafield.service';
import { WebPixelService } from '~/services/shopify/web-pixel.service';
import { ActivationService } from '~/services/publish/activation.service';
import { getPrisma } from '~/db.server';
import {
  THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY,
  ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY,
  ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY,
  ADMIN_DISCOUNT_UI_NAMESPACE, ADMIN_DISCOUNT_UI_REFS_KEY,
  ADMIN_LINK_NAMESPACE, ADMIN_LINK_REFS_KEY,
  ADMIN_PRINT_NAMESPACE, ADMIN_PRINT_REFS_KEY,
  ADMIN_SEGMENT_TEMPLATE_NAMESPACE, ADMIN_SEGMENT_TEMPLATE_REFS_KEY,
  FUNCTIONS_NAMESPACE,
  CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY,
  CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY,
} from '~/services/publish/publish.service';

export type UnpublishReport = {
  removedRefs: string[];
  deletedMetaobjects: string[];
  deletedActivations: string[];
  deletedWebPixel: boolean;
};

/** One refs-list surface family: publish's write mirrored for teardown (E6). */
type RefsFamily = { ns: string; key: string; metaobjectType: string; handle: (moduleId: string) => string };

const REFS_FAMILIES: Record<string, RefsFamily> = {
  themeModulePayload:          { ns: THEME_MODULES_NAMESPACE, key: THEME_MODULE_REFS_KEY, metaobjectType: '$app:superapp_module', handle: (m) => `superapp-module-${m}` },
  adminBlockPayload:           { ns: ADMIN_BLOCKS_NAMESPACE, key: ADMIN_BLOCK_REFS_KEY, metaobjectType: '$app:superapp_admin_block', handle: (m) => `superapp-block-${m}` },
  adminActionPayload:          { ns: ADMIN_ACTIONS_NAMESPACE, key: ADMIN_ACTION_REFS_KEY, metaobjectType: '$app:superapp_admin_action', handle: (m) => `superapp-action-${m}` },
  adminDiscountUiPayload:      { ns: ADMIN_DISCOUNT_UI_NAMESPACE, key: ADMIN_DISCOUNT_UI_REFS_KEY, metaobjectType: '$app:superapp_admin_discount_ui', handle: (m) => `superapp-discount-ui-${m}` },
  adminLinkPayload:            { ns: ADMIN_LINK_NAMESPACE, key: ADMIN_LINK_REFS_KEY, metaobjectType: '$app:superapp_admin_link', handle: (m) => `superapp-link-${m}` },
  adminPrintPayload:           { ns: ADMIN_PRINT_NAMESPACE, key: ADMIN_PRINT_REFS_KEY, metaobjectType: '$app:superapp_admin_print', handle: (m) => `superapp-print-${m}` },
  adminSegmentTemplatePayload: { ns: ADMIN_SEGMENT_TEMPLATE_NAMESPACE, key: ADMIN_SEGMENT_TEMPLATE_REFS_KEY, metaobjectType: '$app:superapp_admin_segment_template', handle: (m) => `superapp-segment-template-${m}` },
  checkoutUpsellPayload:       { ns: CHECKOUT_NAMESPACE, key: CHECKOUT_UPSELL_REFS_KEY, metaobjectType: '$app:superapp_checkout_upsell', handle: (m) => `superapp-checkout-upsell-${m}` },
  customerAccountBlockPayload: { ns: CUSTOMER_ACCOUNT_NAMESPACE, key: CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, metaobjectType: '$app:superapp_customer_account_block', handle: (m) => `superapp-ca-block-${m}` },
};

export class UnpublishService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly session: { shopId?: string },
  ) {}

  async unpublish(spec: RecipeSpec, target: DeployTarget): Promise<UnpublishReport> {
    // E6: read the SAME compiler output publish used, so cleanup can never drift
    // from what was deployed.
    const result = compileRecipe(spec, target);
    const mo = new MetaobjectService(this.admin);
    const mf = new MetafieldService(this.admin);
    const report: UnpublishReport = { removedRefs: [], deletedMetaobjects: [], deletedActivations: [], deletedWebPixel: false };
    const moduleId = target.moduleId;

    // 1. refs-list surfaces — remove ref FIRST, delete metaobject LAST, so a
    //    storefront/admin read never sees a dangling reference mid-teardown.
    for (const [payloadKey, family] of Object.entries(REFS_FAMILIES)) {
      if (!(result as unknown as Record<string, unknown>)[payloadKey] || !moduleId) continue;
      const gid = await mo.getMetaobjectIdByHandle(family.metaobjectType, family.handle(moduleId));
      if (!gid) continue; // already gone — idempotent
      const current = await mo.getModuleGidList(family.ns, family.key);
      if (current.includes(gid)) {
        await mo.setModuleGidList(family.ns, family.key, current.filter((g) => g !== gid));
        report.removedRefs.push(gid);
      }
      await mo.deleteMetaobject(gid);
      report.deletedMetaobjects.push(gid);
    }

    // 2. proxy widget (handle-keyed, no refs list)
    if (result.proxyWidgetPayload) {
      const gid = await mo.getMetaobjectIdByHandle('$app:superapp_proxy_widget', `superapp-proxy-${result.proxyWidgetPayload.widgetId}`);
      if (gid) {
        await mo.deleteMetaobject(gid);
        report.deletedMetaobjects.push(gid);
      }
    }

    // 3. ops-driven surfaces
    for (const op of result.ops) {
      if (op.kind === 'FUNCTION_CONFIG_UPSERT') {
        await this.unpublishFunction(mo, mf, op.functionKey, report);
      }
      if (op.kind === 'WEB_PIXEL_UPSERT') {
        report.deletedWebPixel = await this.maybeDeleteWebPixel(moduleId);
      }
      // THEME_ASSET_UPSERT (native sections) is flag-gated and never produced by
      // the default app-block path; when the flag ships live, mirror publish by
      // deleting via ThemeFilesService here. Publishing throws while the flag is
      // off, so there is nothing to clean up today.
    }

    // 4. cartTransform (no FUNCTION_CONFIG_UPSERT op since Task 8 — keyed off spec type)
    if (spec.type === 'functions.cartTransform' && this.session.shopId) {
      await new ActivationService(this.admin, this.session.shopId).deleteForFunctionKey('cartTransform');
      report.deletedActivations.push('cartTransform');
      // The parent bundle product stays (merchant may have orders referencing it) —
      // documented behavior, matches Shopify guidance to not hard-delete products.
    }

    return report;
  }

  private async unpublishFunction(
    mo: MetaobjectService,
    mf: MetafieldService,
    functionKey: string,
    report: UnpublishReport,
  ): Promise<void> {
    const existing = await mo.getFunctionConfigByKey(functionKey);

    // discountRules metaobject may carry managed bundle rules (id "bundle:*") the
    // bundle path owns — strip only the module's rules and KEEP the metaobject,
    // metafield ref, and activation alive for them.
    if (functionKey === 'discountRules' && existing) {
      const rules = Array.isArray(existing.config.rules) ? (existing.config.rules as Array<Record<string, unknown>>) : [];
      const managed = rules.filter((r) => typeof r.id === 'string' && (r.id as string).startsWith('bundle:'));
      if (managed.length > 0) {
        await mo.upsertFunctionConfigObject('discountRules', { ...existing.config, rules: managed });
        return;
      }
    }

    if (existing) {
      await mf.deleteShopMetafield(FUNCTIONS_NAMESPACE, `fn_${functionKey}`);
      await mo.deleteMetaobject(existing.metaobjectId);
      report.deletedMetaobjects.push(existing.metaobjectId);
    }
    if (this.session.shopId) {
      await new ActivationService(this.admin, this.session.shopId).deleteForFunctionKey(functionKey);
      report.deletedActivations.push(functionKey);
    }
  }

  /** The web pixel is ONE shared app pixel per shop — only delete when this was the
   *  last published analytics.pixel module. */
  private async maybeDeleteWebPixel(excludeModuleId?: string): Promise<boolean> {
    if (this.session.shopId) {
      const others = await getPrisma().module.count({
        where: {
          shopId: this.session.shopId,
          type: 'analytics.pixel',
          status: 'PUBLISHED',
          ...(excludeModuleId ? { id: { not: excludeModuleId } } : {}),
        },
      });
      if (others > 0) return false;
    }
    return new WebPixelService(this.admin).delete();
  }
}
```

Export the namespace constants from `publish.service.ts` (mechanical `export const` change, no behavior).

- [ ] **Step 5: Run** — `npx vitest run app/__tests__/unpublish.service.test.ts` then the full suite. Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(ws-e): UnpublishService inverts publish (refs, metaobjects, activations, web pixel)"`

---

### Task 10: Unpublish route + `markUnpublished` status flip + minimal UI affordance

**Files:**
- Modify: `apps/web/app/services/modules/module.service.ts`
- Create: `apps/web/app/routes/api.modules.$moduleId.unpublish.tsx`
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (button only — WS-F polishes)
- Modify: `apps/web/app/__tests__/unpublish.service.test.ts`

**Interfaces:**
- Produces: `ModuleService.markUnpublished(shopDomain: string, moduleId: string): Promise<void>` (module → `DRAFT`, `activeVersionId` → `null`, PUBLISHED versions → `UNPUBLISHED`, per E7); route `POST /api/modules/:moduleId/unpublish` (form or JSON; redirects to `/modules/:id?unpublished=1`, JSON `{ ok: true, report }` for `Accept: application/json`).

- [ ] **Step 1: Failing service test:**

```ts
describe('ModuleService.markUnpublished (E7)', () => {
  it('flips module to DRAFT, clears activeVersionId, marks published versions UNPUBLISHED', async () => {
    // extend the prisma mock: module.findFirst → { id: 'm1', status: 'PUBLISHED', activeVersionId: 'v2' },
    // capture module.update / moduleVersion.updateMany args
    const { ModuleService } = await import('~/services/modules/module.service');
    await new ModuleService().markUnpublished('shop.example.com', 'm1');
    expect(capturedModuleUpdate).toMatchObject({ where: { id: 'm1' }, data: { status: 'DRAFT', activeVersionId: null } });
    expect(capturedVersionUpdateMany).toMatchObject({
      where: { moduleId: 'm1', status: 'PUBLISHED' },
      data: { status: 'UNPUBLISHED' },
    });
  });
});
```

- [ ] **Step 2: Run** (FAIL) **then implement** in `module.service.ts`:

```ts
/** WS-E: DB half of unpublish — Shopify cleanup is UnpublishService's job and MUST
 *  run first (routes own the ordering). */
async markUnpublished(shopDomain: string, moduleId: string) {
  const prisma = getPrisma();
  const module = await prisma.module.findFirst({ where: { id: moduleId, shop: { shopDomain } } });
  if (!module) throw new Error('Module not found');
  await prisma.moduleVersion.updateMany({
    where: { moduleId, status: 'PUBLISHED' },
    data: { status: 'UNPUBLISHED' },
  });
  await prisma.module.update({ where: { id: moduleId }, data: { status: 'DRAFT', activeVersionId: null } });
}
```

- [ ] **Step 3: The route** — `api.modules.$moduleId.unpublish.tsx` (mirror the delete route's structure exactly — loader 405, authenticate, 404 check, activity log):

```tsx
import { json, redirect } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { UnpublishService } from '~/services/publish/unpublish.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { getPrisma } from '~/db.server';
import type { DeployTarget } from '@superapp/core';

/** GET not allowed. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST: Unpublish a module — remove its storefront/admin/function footprint from
 * Shopify (refs, metaobjects, activation objects, web pixel), then flip DB status.
 * Shopify cleanup runs FIRST: if it throws, the module stays PUBLISHED (honest) and
 * the merchant can retry (UnpublishService is idempotent).
 */
export async function action({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: `/api/modules/${moduleId}/unpublish`, request },
    async () => {
      await enforceRateLimit(`unpublish:${session.shop}`);
      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
      const moduleService = new ModuleService();
      const mod = await moduleService.getModule(session.shop, moduleId);
      if (!mod) return json({ error: 'Module not found' }, { status: 404 });
      if (mod.status !== 'PUBLISHED') return json({ error: 'Module is not published' }, { status: 400 });

      const versionRow =
        mod.activeVersion ?? mod.versions.find((v) => v.status === 'PUBLISHED') ?? null;
      if (!versionRow) return json({ error: 'No published version found' }, { status: 400 });

      const spec = new RecipeService().parse(versionRow.specJson);
      const target: DeployTarget = spec.type.startsWith('theme.')
        ? { kind: 'THEME', themeId: versionRow.targetThemeId ?? '', moduleId: mod.id }
        : { kind: 'PLATFORM', moduleId: mod.id };

      const report = await new UnpublishService(admin, { shopId: shopRow?.id }).unpublish(spec, target);
      await moduleService.markUnpublished(session.shop, moduleId);
      await new ActivityLogService().log({
        actor: 'MERCHANT', action: 'MODULE_UNPUBLISHED', resource: `module:${moduleId}`,
        shopId: shopRow?.id, details: { report },
      }).catch(() => {});

      const acceptsJson = request.headers.get('Accept')?.includes('application/json');
      if (acceptsJson) return json({ ok: true, report });
      return redirect(`/modules/${moduleId}?unpublished=1`);
    },
  );
}
```

- [ ] **Step 4: UI affordance (minimal)** — in `modules.$moduleId.tsx`, next to the existing delete control, add (Polaris WC, copy minimal — WS-F polishes):

```tsx
{module.status === 'PUBLISHED' ? (
  <fetcher.Form method="post" action={`/api/modules/${module.id}/unpublish`}>
    <s-button variant="secondary" tone="critical" type="submit">
      Unpublish
    </s-button>
  </fetcher.Form>
) : null}
```

(Match the file's existing form/fetcher idiom for the delete button — reuse whichever pattern is already there.)

- [ ] **Step 5: Run** the unpublish tests + `npx vitest run` + `npm run lint` in apps/web. Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(ws-e): unpublish route + markUnpublished + merchant Unpublish button"`

---

### Task 11: Delete cleans up Shopify first

**Files:**
- Modify: `apps/web/app/routes/api.modules.$moduleId.delete.tsx`, `apps/web/app/routes/api.agent.modules.$moduleId.delete.tsx`, `apps/web/app/routes/modules.$moduleId.tsx` (inline delete action, line ~297)
- Modify: `apps/web/app/services/modules/module.service.ts`
- Modify: `apps/web/app/__tests__/unpublish.service.test.ts`

**Interfaces:**
- Produces: `ModuleService.unpublishThenDelete(admin, shopDomain, moduleId): Promise<void>` — single shared implementation so the three routes cannot drift:

```ts
import type { AdminApiContext } from '~/types/shopify';
import { RecipeService } from '~/services/recipes/recipe.service';
import { UnpublishService } from '~/services/publish/unpublish.service';
import type { DeployTarget } from '@superapp/core';

/** WS-E: deleting a published module must not leave its metaobject rendering
 *  forever — Shopify cleanup runs first; only then do DB rows go. A cleanup
 *  failure aborts the delete (retryable; unpublish is idempotent). */
async unpublishThenDelete(admin: AdminApiContext['admin'], shopDomain: string, moduleId: string) {
  const prisma = getPrisma();
  const module = await prisma.module.findFirst({
    where: { id: moduleId, shop: { shopDomain } },
    include: { versions: true, activeVersion: true, shop: { select: { id: true } } },
  });
  if (!module) throw new Error('Module not found');

  const publishedVersion = module.activeVersion ?? module.versions.find((v) => v.status === 'PUBLISHED');
  if (module.status === 'PUBLISHED' && publishedVersion) {
    const spec = new RecipeService().parse(publishedVersion.specJson);
    const target: DeployTarget = spec.type.startsWith('theme.')
      ? { kind: 'THEME', themeId: publishedVersion.targetThemeId ?? '', moduleId: module.id }
      : { kind: 'PLATFORM', moduleId: module.id };
    await new UnpublishService(admin, { shopId: module.shop.id }).unpublish(spec, target);
  }
  await prisma.module.delete({ where: { id: moduleId } });
}
```

- [ ] **Step 1: Failing test:**

```ts
describe('ModuleService.unpublishThenDelete', () => {
  it('published module: Shopify cleanup runs BEFORE the DB delete', async () => {
    // prisma mock: findFirst → published theme module with a spec; record call order
    // between admin.graphql (any op) and prisma.module.delete
    const order: string[] = [];
    // ... wire order.push('shopify') into mockAdmin respond, order.push('db') into the delete mock
    await new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'm1');
    expect(order.indexOf('shopify')).toBeLessThan(order.indexOf('db'));
  });

  it('draft module: no Shopify calls, straight delete', async () => {
    const { admin, calls } = mockAdmin(() => { throw new Error('no call expected'); });
    await new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'm-draft');
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run** (FAIL), **implement** (code above), run (PASS).

- [ ] **Step 3: Swap the three routes** — each currently calls `moduleService.deleteModule(session.shop, moduleId)`; replace with `moduleService.unpublishThenDelete(admin, session.shop, moduleId)` (all three routes already destructure `admin` from `shopify.authenticate.*` — verify the agent route does; if it authenticates without an admin client, use `const { admin } = await shopify.unauthenticated.admin(session.shop)`). Keep `deleteModule` for internal/no-admin callers but add a doc comment: "DB-only — use unpublishThenDelete wherever an admin client exists."

- [ ] **Step 4: Run full suite + lint. Commit** — `git commit -m "feat(ws-e): delete unpublishes from Shopify first (all three delete routes)"`

---

### Task 12: Remove the progressive-publish theater (E4)

**Files:**
- Modify: `apps/web/app/routes/api.publish.tsx` (lines 24–25, 208–220, 270–296), `apps/web/app/routes/api.agent.modules.$moduleId.publish.tsx` (same pattern)
- Delete: `apps/web/app/services/releases/progressive-publish.server.ts` + its test file (`git grep -l ProgressivePublishService apps/web` to find it)
- Check: `internal.release-dashboard.tsx` (keeps `release-metrics`/`RolloutPolicyService` — do NOT delete those; if it imports `ProgressivePublishService`, inline the static stage list or drop that widget row)

- [ ] **Step 1: Write the failing "it's gone" test** — append to `apps/web/app/__tests__/publish-functions-reliability.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('WS-E: progressive-publish theater is removed (E4)', () => {
  it('no source file references ProgressivePublishService / startCanary / evaluateRamp', () => {
    // grep-level guard: the two routes that used it plus the service itself.
    const files = [
      'app/routes/api.publish.tsx',
      'app/routes/api.agent.modules.$moduleId.publish.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', '..', f), 'utf8');
      expect(src).not.toMatch(/ProgressivePublishService|startCanary|evaluateRamp|progressiveStage/);
    }
    expect(() =>
      readFileSync(join(__dirname, '..', 'services', 'releases', 'progressive-publish.server.ts'), 'utf8'),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run** (FAIL). **Remove:** in `api.publish.tsx` delete the `ProgressivePublishService`/`getRecentPublishMetrics` imports, the `const progressive = ...; const canary = progressive.startCanary();` block, `progressiveStage/progressiveDecision` from the job payload, and the whole post-success `evaluateRamp → ABORT → rollbackToVersion` block (lines ~270–296) including its `MODULE_ROLLED_BACK` activity log. Same in the agent publish route. Delete `progressive-publish.server.ts` + its test. Fix `internal.release-dashboard.tsx` if it imported the service (keep the metrics widgets — they read `release-metrics.server.ts`, untouched).

- [ ] **Step 3: Run** the guard test + full suite + `npx tsc --noEmit` (via `npm run typecheck` if defined, else the repo's build check). Expected: PASS.

- [ ] **Step 4: Commit** — `git commit -m "refactor(ws-e): delete progressive-publish theater (fake canary + DB-only auto-rollback)"`

---

### Task 13: Real rollback = recompile + republish (`RollbackService`)

**Files:**
- Create: `apps/web/app/services/publish/rollback.service.ts`
- Modify: `apps/web/app/services/modules/module.service.ts` (doc-comment `rollbackToVersion` as DB-flip-only)
- Modify: `apps/web/app/routes/api.rollback.tsx`, `apps/web/app/routes/api.agent.modules.$moduleId.rollback.tsx`, `apps/web/app/routes/internal.ops.tsx:221`
- Create: `apps/web/app/__tests__/rollback.service.test.ts`

**Interfaces:**
- Consumes: `PublishService` (Task 3 signature), `ModuleService.rollbackToVersion` (existing DB flip, module.service.ts:277).
- Produces:

```ts
export class RollbackService {
  constructor(admin: AdminApiContext['admin'], session: { shop: string; shopId?: string });
  /** Republishes `version`'s spec through the normal publish pipeline; flips
   *  activeVersionId ONLY on success. Returns the target ModuleVersion row. */
  rollbackToVersion(moduleId: string, version: number): Promise<{ id: string; version: number }>;
}
```

- [ ] **Step 1: Failing tests:**

```ts
describe('RollbackService — rollback IS a republish (WS-E finding 3)', () => {
  it('publishes the target version spec to Shopify, THEN flips activeVersionId', async () => {
    const order: string[] = [];
    // prisma mock: moduleVersion.findFirst → { id: 'v1', version: 1, specJson: <theme.section template JSON>, targetThemeId: '77' }
    // module.update → order.push('db-flip')
    // mockAdmin: respond to metaobject plumbing ops with successes, order.push('shopify') on first call
    const { RollbackService } = await import('~/services/publish/rollback.service');
    const mv = await new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' })
      .rollbackToVersion('m1', 1);
    expect(mv.version).toBe(1);
    expect(order.indexOf('shopify')).toBeLessThan(order.indexOf('db-flip'));
  });

  it('does NOT flip activeVersionId when the republish throws (no DB/Shopify drift)', async () => {
    const { admin } = mockAdmin(() => { throw new Error('shopify down'); });
    const { RollbackService } = await import('~/services/publish/rollback.service');
    await expect(
      new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 1),
    ).rejects.toThrow();
    expect(order).not.toContain('db-flip');
  });

  it('theme module with no recorded targetThemeId fails loudly (cannot guess a theme)', async () => {
    // prisma mock: version row with theme.section spec and targetThemeId: null; module has no active themed version
    await expect(
      new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 1),
    ).rejects.toThrow(/theme/i);
  });
});
```

- [ ] **Step 2: Run** (FAIL), **implement:**

```ts
import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { ModuleService } from '~/services/modules/module.service';

/**
 * WS-E: rollback previously flipped `activeVersionId` and touched nothing in
 * Shopify — the store kept serving the version the merchant "rolled back from".
 * Real rollback = recompile the TARGET version's spec and run the normal publish
 * pipeline (idempotent republish converges every surface), then flip the DB.
 */
export class RollbackService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly session: { shop: string; shopId?: string },
  ) {}

  async rollbackToVersion(moduleId: string, version: number): Promise<{ id: string; version: number }> {
    const prisma = getPrisma();
    const mv = await prisma.moduleVersion.findFirst({
      where: { moduleId, version, module: { shop: { shopDomain: this.session.shop } } },
      include: { module: { include: { activeVersion: true } } },
    });
    if (!mv) throw new Error('Version not found');

    const spec = new RecipeService().parse(mv.specJson);
    let target: DeployTarget;
    if (spec.type.startsWith('theme.')) {
      const themeId = mv.targetThemeId ?? mv.module.activeVersion?.targetThemeId ?? null;
      if (!themeId) {
        throw new Error(
          'Cannot roll back this theme module: no target theme recorded on either version. Publish it to a theme instead.',
        );
      }
      target = { kind: 'THEME', themeId, moduleId };
    } else {
      target = { kind: 'PLATFORM', moduleId };
    }

    // Republish FIRST — only a successful deploy may move the active pointer.
    await new PublishService(this.admin, { shop: this.session.shop, shopId: this.session.shopId })
      .publish(spec, target);

    await new ModuleService().rollbackToVersion(this.session.shop, moduleId, version);
    return { id: mv.id, version: mv.version };
  }
}
```

Add to `ModuleService.rollbackToVersion` the doc comment: `/** DB pointer flip ONLY — never call directly for a live rollback; RollbackService republishes first. */`

- [ ] **Step 3: Swap call sites** —
  - `api.rollback.tsx`: destructure `admin` from `shopify.authenticate.admin(request)`; replace `ms.rollbackToVersion(...)` with `new RollbackService(admin, { shop: session.shop, shopId: shopRow?.id }).rollbackToVersion(moduleId, version)`.
  - `api.agent.modules.$moduleId.rollback.tsx`: same (use its auth's admin, or `shopify.unauthenticated.admin(session.shop)` if the agent auth has none).
  - `internal.ops.tsx:221`: `const { admin } = await shopify.unauthenticated.admin(moduleRow.shop.shopDomain);` then `await new RollbackService(admin, { shop: moduleRow.shop.shopDomain, shopId: moduleRow.shopId }).rollbackToVersion(moduleRow.id, target);` (imports at top; the route already imports from `~/shopify.server` — check symbol name, `shopify` vs the exported `unauthenticated`).

- [ ] **Step 4: Run** rollback tests + full suite. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ws-e): RollbackService — rollback recompiles and republishes, DB flips only on success"`

---

### Task 14: Per-op publish ledger + republish-is-the-fix surfacing

**Files:**
- Modify: `apps/web/app/services/publish/publish.service.ts`
- Modify: `apps/web/app/routes/api.publish.tsx`
- Create: `apps/web/app/__tests__/publish-ledger.test.ts`

**Interfaces:**
- Produces:

```ts
export type PublishOpLedgerEntry = { op: string; detail?: string };
export class PublishPartialFailureError extends Error {
  readonly code = 'PUBLISH_PARTIAL_FAILURE';
  constructor(readonly failedOp: string, readonly completed: PublishOpLedgerEntry[], readonly cause: unknown);
}
// publish() return type gains: ledger: PublishOpLedgerEntry[]
```

- [ ] **Step 1: Failing tests:**

```ts
describe('publish ledger (WS-E finding 4)', () => {
  it('successful publish returns a ledger naming every Shopify write', async () => {
    // theme.section spec, mocked-success admin
    const result = await publisher.publish(spec, { kind: 'THEME', themeId: '1', moduleId: 'm1' });
    expect(result.ledger.map((e) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp.theme/module_refs',
      'upsertMetaobject:superapp-module-m1',
      'setModuleGidList:superapp.theme/module_refs',
    ]);
  });

  it('mid-sequence failure throws PublishPartialFailureError carrying completed ops + the failed op', async () => {
    // admin mock: MetafieldsSet (the refs write) returns userErrors
    const err = await publisher.publish(spec, target).catch((e) => e);
    expect(err).toBeInstanceOf(PublishPartialFailureError);
    expect(err.failedOp).toBe('setModuleGidList:superapp.theme/module_refs');
    expect(err.completed.map((e: any) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp.theme/module_refs',
      'upsertMetaobject:superapp-module-m1',
    ]);
  });

  it('republish after partial failure converges: second run performs the SAME logical writes (handle-keyed upserts, no *Create duplicates)', async () => {
    // Run publish twice against a recording mock where run 1 fails at the refs write
    // and run 2 succeeds fully; assert run 2 contains no operation that would
    // duplicate (every mutation op name is in the idempotent allowlist below).
    const IDEMPOTENT_MUTATIONS = new Set([
      'MetaobjectUpsert', 'MetafieldsSet', 'MetafieldDefinitionCreate', // TAKEN swallowed
      'SuperAppWebPixelCreate', 'SuperAppWebPixelUpdate',
    ]);
    for (const call of run2Calls) {
      if (/mutation/i.test(call.op) === false) continue;
      expect(IDEMPOTENT_MUTATIONS.has(call.op), call.op).toBe(true);
    }
  });
});
```

(Write the ledger op-name strings exactly as the implementation emits them — the first test pins the format; adjust the expected arrays to the real emission order once implemented, that is the point of the test.)

- [ ] **Step 2: Run** (FAIL), **implement** — in `publish.service.ts`:

```ts
export type PublishOpLedgerEntry = { op: string; detail?: string };

export class PublishPartialFailureError extends Error {
  readonly code = 'PUBLISH_PARTIAL_FAILURE';
  constructor(
    readonly failedOp: string,
    readonly completed: PublishOpLedgerEntry[],
    override readonly cause: unknown,
  ) {
    super(
      `Publish failed at "${failedOp}" after ${completed.length} completed step(s): ` +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        `Republishing is safe — every completed step is idempotent and a republish converges.`,
    );
    this.name = 'PublishPartialFailureError';
  }
}
```

Add a `private ledger: PublishOpLedgerEntry[]` reset at the top of `publish()`; wrap every Shopify-writing step in a helper:

```ts
private async step<T>(op: string, fn: () => Promise<T>): Promise<T> {
  try {
    const out = await fn();
    this.ledger.push({ op });
    return out;
  } catch (cause) {
    throw new PublishPartialFailureError(op, [...this.ledger], cause);
  }
}
```

Mechanically wrap each write in the payload helpers and the ops loop, e.g. `writeThemeModule` becomes:

```ts
await this.step(`ensureMetafieldDefinition:${THEME_MODULES_NAMESPACE}/${THEME_MODULE_REFS_KEY}`, () =>
  mo.ensureMetafieldDefinition(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, '$app:superapp_module', true));
const gid = await this.step(`upsertMetaobject:superapp-module-${moduleId}`, () =>
  mo.upsertModuleObject(moduleId, payload));
...
await this.step(`setModuleGidList:${THEME_MODULES_NAMESPACE}/${THEME_MODULE_REFS_KEY}`, () =>
  mo.setModuleGidList(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, updatedGids));
```

…and the ops-loop cases (`SHOP_METAFIELD_SET:ns/key`, `FUNCTION_CONFIG_UPSERT:${functionKey}`, `functionActivation:${functionKey}`, `WEB_PIXEL_UPSERT`, `cartTransform:resolve|parentProduct|activate` inside `publishCartTransform`). Return `{ compiledJson, preflight, ledger: this.ledger }`.

In `api.publish.tsx`: on success, `jobs.succeed(job.id, { ok: true, ledger: result.ledger })`; in the catch, before the generic branch:

```ts
if (e instanceof PublishPartialFailureError) {
  await jobs.fail(job.id, { failedOp: e.failedOp, completed: e.completed, message: e.message });
  await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/publish', success: false, details: { failedOp: e.failedOp, completed: e.completed } });
  return json(
    {
      error: e.message,
      code: e.code,
      failedOp: e.failedOp,
      completedOps: e.completed,
      guidance: 'Republish to converge — completed steps are idempotent and will not duplicate.',
    },
    { status: 502 },
  );
}
```

- [ ] **Step 3: Run** ledger tests + full suite (existing publish tests destructure `{ compiledJson, preflight }` — additive field, should pass; fix any exact-shape assertions). Expected: PASS.

- [ ] **Step 4: Commit** — `git commit -m "feat(ws-e): per-op publish ledger + PublishPartialFailureError with republish guidance"`

---

### Task 15: Embed-activation check + deep link surfaced after publish

**Files:**
- Create: `apps/web/app/services/publish/embed-status.server.ts`
- Modify: `apps/web/app/routes/api.publish.tsx`, `apps/web/app/routes/modules.$moduleId.tsx`
- Create: `apps/web/app/__tests__/embed-status.test.ts`

**Interfaces:**
- Consumes: `toThemeGid` (exported from `~/services/publish/theme-files.server`), `ThemeService.listThemes` (role `'main'`).
- Produces:

```ts
export type EmbedStatus = 'enabled' | 'disabled' | 'not_added' | 'unknown';
export const EMBED_BLOCK_HANDLE = 'superapp-theme-modules';
export function parseEmbedStatus(settingsDataJson: string): EmbedStatus;                 // pure — unit-tested
export function getThemeEmbedStatus(admin, themeId?: string): Promise<EmbedStatus>;      // reads settings_data.json
export function embedActivationDeepLink(shopDomain: string): string;
```

- [ ] **Step 1: Failing tests** (pure parser + link):

```ts
import { describe, expect, it } from 'vitest';
import { parseEmbedStatus, embedActivationDeepLink } from '~/services/publish/embed-status.server';

const blockType = 'shopify:\/\/apps\/super-app-ai\/blocks\/superapp-theme-modules\/aaaa-bbbb';

describe('embed status (WS-E finding 5)', () => {
  it('not_added when settings_data has no superapp embed block', () => {
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: {} } }))).toBe('not_added');
    expect(parseEmbedStatus(JSON.stringify({ current: {} }))).toBe('not_added');
  });
  it('enabled when present and not disabled', () => {
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType, disabled: false } } } }))).toBe('enabled');
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType } } } }))).toBe('enabled');
  });
  it('disabled when present with disabled:true', () => {
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType, disabled: true } } } }))).toBe('disabled');
  });
  it('unknown on unparseable content (never blocks publish)', () => {
    expect(parseEmbedStatus('not json')).toBe('unknown');
  });
  it('deep link uses api_key + handle per current docs (uuid form is deprecated)', () => {
    process.env.SHOPIFY_API_KEY = 'testkey';
    expect(embedActivationDeepLink('demo.myshopify.com')).toBe(
      'https://demo.myshopify.com/admin/themes/current/editor?context=apps&template=index&activateAppId=testkey/superapp-theme-modules',
    );
  });
});
```

- [ ] **Step 2: Run** (FAIL), **implement:**

```ts
import type { AdminApiContext } from '~/types/shopify';
import { toThemeGid } from '~/services/publish/theme-files.server';
import { ThemeService } from '~/services/shopify/theme.service';

export type EmbedStatus = 'enabled' | 'disabled' | 'not_added' | 'unknown';
export const EMBED_BLOCK_HANDLE = 'superapp-theme-modules';

// Validated (2026-07): theme.files body → OnlineStoreThemeFileBodyText.content
const EMBED_SETTINGS_QUERY = `#graphql
  query SuperAppEmbedStatus($themeId: ID!) {
    theme(id: $themeId) {
      id
      files(filenames: ["config/settings_data.json"], first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }
`;

/** Pure parse of config/settings_data.json. App embed blocks appear under
 *  current.blocks with type "shopify://apps/{app}/blocks/{handle}/{uuid}"; the
 *  entry exists only after first enable, then persists with a disabled flag. */
export function parseEmbedStatus(settingsDataJson: string): EmbedStatus {
  try {
    const parsed = JSON.parse(settingsDataJson) as {
      current?: { blocks?: Record<string, { type?: string; disabled?: boolean }> } | string;
    };
    const current = typeof parsed.current === 'string' ? undefined : parsed.current;
    const blocks = current?.blocks ?? {};
    for (const block of Object.values(blocks)) {
      if (typeof block?.type === 'string' && block.type.includes(`/blocks/${EMBED_BLOCK_HANDLE}/`)) {
        return block.disabled ? 'disabled' : 'enabled';
      }
    }
    return 'not_added';
  } catch {
    return 'unknown';
  }
}

/** Read the embed status from the given theme (or the store's main theme).
 *  NEVER throws — an unreadable theme yields 'unknown' (advisory only). */
export async function getThemeEmbedStatus(
  admin: AdminApiContext['admin'],
  themeId?: string,
): Promise<EmbedStatus> {
  try {
    let id = themeId;
    if (!id) {
      const themes = await new ThemeService(admin).listThemes();
      id = themes.find((t) => t.role === 'main')?.id;
    }
    if (!id) return 'unknown';
    const res = await admin.graphql(EMBED_SETTINGS_QUERY, { variables: { themeId: toThemeGid(id) } });
    const json = (await res.json()) as {
      data?: { theme?: { files?: { nodes?: Array<{ body?: { content?: string } | null }> } } };
    };
    const content = json?.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!content) return 'unknown';
    return parseEmbedStatus(content);
  } catch {
    return 'unknown';
  }
}

export function embedActivationDeepLink(shopDomain: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY ?? '';
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&template=index&activateAppId=${apiKey}/${EMBED_BLOCK_HANDLE}`;
}
```

- [ ] **Step 3: Surface it** — in `api.publish.tsx` success path (after `markPublishedWithTransition`), for theme modules only:

```ts
let embedStatus: EmbedStatus | undefined;
if (isThemeModule) {
  embedStatus = await getThemeEmbedStatus(admin, target.kind === 'THEME' ? target.themeId : undefined);
}
return redirect(`/modules/${module.id}?published=1${embedStatus && embedStatus !== 'enabled' ? `&embed=${embedStatus}` : ''}`);
```

In `modules.$moduleId.tsx`: loader adds `embedDeepLink: embedActivationDeepLink(session.shop)` to its payload; the component reads `searchParams.get('embed')` and when `'disabled' | 'not_added' | 'unknown'` renders above the fold (copy minimal — WS-F polishes):

```tsx
<s-banner tone="warning" heading="Almost there — turn on the app embed">
  <s-paragraph>
    Published modules only appear on your storefront once the “SuperApp Theme Modules”
    app embed is enabled in your theme.
  </s-paragraph>
  <s-button href={data.embedDeepLink} target="_blank" variant="primary">
    Enable it in the theme editor
  </s-button>
</s-banner>
```

- [ ] **Step 4: Run** embed tests + full suite + lint. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ws-e): post-publish app-embed check + theme-editor activation deep link"`

---

### Task 16: Update the publishing contract doc

Folded here (not with Task 17's probe) so docs land with the code, per program rule "each WS updates its own doc as it lands". **No numeric claims in prose (WS-J rule).**

**Files:**
- Modify (or create if absent): `docs/publishing.md`

- [ ] **Step 1:** Rewrite/extend the doc with sections (content distilled FROM the code, cite file paths, no counts): *What publish writes per surface* (payload families table incl. namespaces/handles from `publish.service.ts`), *Function activation objects* (kind table: functionKey → Shopify object + mutation + scope, `FunctionActivation` persistence, one-discount-node invariant E3), *Unpublish/delete semantics* (E6 inversion, refs-before-metaobject ordering, managed bundle-rule preservation, shared-web-pixel guard), *Rollback = republish* (RollbackService contract; DB flip only on success), *Partial failure* (ledger, `PublishPartialFailureError`, republish-converges guidance), *Embed activation* (detection + deep-link format), *Gate seam* (`ACTIVATION_WIRED_FUNCTION_TYPES` — how a future function type gets un-gated).
- [ ] **Step 2:** `git commit -m "docs(ws-e): publishing contract — activation, unpublish, rollback, ledger, embed"`

---

### Task 17: Live-store verification probe (runbook) + handle-casing verdict

A runbook-style task executed against the dev store — no code except the conditional casing fix. Prereqs: Tasks 1–15 merged; `shopify app deploy` run (new scopes from Tasks 6–7 + current extensions); merchant re-consent completed on the dev store (the app shows the "update permissions" banner on next open); ideally WS-A's stable URL (else the tunnel must stay up throughout).

**Files (conditional):**
- Modify: `apps/web/app/services/shopify/metaobject.service.ts` (line 248), `apps/web/app/services/publish/unpublish.service.ts` + every `extensions/*/src/*.graphql` input query — ONLY if step 2 proves Shopify normalizes handles.
- Create: `apps/web/app/__tests__/function-handle-casing.test.ts` (only with the fix)
- Record results in: `docs/publishing.md` (append a dated "live probe" section with observed outputs)

- [ ] **Step 1: Deploy + baseline.** `shopify app deploy --config dev` from repo root for the dev-store probe (then a closing `shopify app deploy --config production` release once the probe is green); confirm the version includes all function extensions (CLI output lists them — expect the handles from `DEPLOYED_FUNCTION_EXTENSION_HANDLES`, including shipping-discount + order-routing from Task 2). Open the app on the dev store, accept the re-consent banner (validations + fulfillment-constraint scopes) — re-consent lands on whichever app the probe uses.

- [ ] **Step 2: Handle-casing verdict (finding 8).** In the app, publish a `functions.discountRules` module (create from a discount template → Publish). Then, via the Dev CLI GraphiQL (`shopify app dev` console) or any admin GraphQL client, run BOTH:

```graphql
query A { metaobjectByHandle(handle: { type: "$app:superapp_function_config", handle: "superapp-fn-discountRules" }) { id handle } }
query B { metaobjectByHandle(handle: { type: "$app:superapp_function_config", handle: "superapp-fn-discountrules" }) { id handle } }
```

  - **Expected if handles survive as-written:** A returns the object with `handle: "superapp-fn-discountRules"`, B returns null → **no fix needed**; record the verdict in docs and move on.
  - **If Shopify lowercased it** (A null / handle comes back `superapp-fn-discountrules`): every camelCase-keyed function read is broken (wasm reads null config). Apply the fix — in `metaobject.service.ts` line 248 and `getFunctionConfigByKey` line 265, normalize: `handle: \`superapp-fn-${functionKey}\`.toLowerCase()`; same in any handle built from `functionKey` in `unpublish.service.ts`; and edit ALL NINE wasm input queries (`extensions/superapp-{discount,delivery-customization,payment-customization,cart-checkout-validation,fulfillment-constraints,shipping-discount,order-routing,local-pickup,pickup-point}/src/*.graphql`) to the lowercase literal (e.g. `handle: "superapp-fn-discountrules"`). Add the pin test:

```ts
// apps/web/app/__tests__/function-handle-casing.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('function-config handles are lowercase everywhere (live-probe verdict, WS-E)', () => {
  it('no extensions/*/src/*.graphql references a camelCase superapp-fn handle', () => {
    const root = join(__dirname, '..', '..', '..', '..', 'extensions');
    for (const dir of readdirSync(root)) {
      let files: string[] = [];
      try { files = readdirSync(join(root, dir, 'src')).filter((f) => f.endsWith('.graphql')); } catch { continue; }
      for (const f of files) {
        const src = readFileSync(join(root, dir, 'src', f), 'utf8');
        const m = src.match(/superapp-fn-[A-Za-z]+/g) ?? [];
        for (const h of m) expect(h, `${dir}/src/${f}`).toBe(h.toLowerCase());
      }
    }
  });
});
```

    then rebuild + `shopify app deploy`, republish the module, and re-run query B (expect the object). Commit: `git commit -m "fix(ws-e): normalize function-config metaobject handles to lowercase (Shopify handle normalization confirmed live)"`. If NOT broken, commit only the doc note.

- [ ] **Step 3: theme.section end-to-end.** Publish a `theme.section` module to the main theme. Expect: publish succeeds; response redirect carries `embed=not_added` (fresh store) → banner with deep link appears; click it → theme editor opens with the SuperApp Theme Modules embed pending; enable + Save; open the storefront → the module renders. Then hit `/api/modules/:id/unpublish` via the Unpublish button → storefront no longer renders it, and in GraphiQL `metaobjectByHandle(type: "$app:superapp_module", handle: "superapp-module-<id>")` returns null, and the `superapp.theme/module_refs` shop metafield no longer contains the GID.

- [ ] **Step 4: discountRules end-to-end.** With the Step 2 module published: in GraphiQL confirm the activation object exists — `query { discountNodes(first: 50) { nodes { id discount { __typename ... on DiscountAutomaticApp { title } } } } }` contains ONE `DiscountAutomaticApp` titled `SuperApp Discounts` (exactly one — if a legacy `SuperApp Bundle Pricing` node predated the probe, confirm it was adopted/retitled, not duplicated). On the storefront, build a cart matching the module's rule → the discount line appears in cart/checkout. Republish the module → discountNodes count unchanged (idempotent). Unpublish → discount gone from checkout; node deleted (unless managed bundle rules kept it — note which case ran).

- [ ] **Step 5: Remaining function surfaces (spot).** Publish one module each for deliveryCustomization (Plus dev store required — note if the dev shop isn't Plus and record `userErrors` behavior instead), paymentCustomization, cartAndCheckoutValidation, fulfillmentConstraints. For each: publish succeeds → the corresponding admin list query (`deliveryCustomizations` / `paymentCustomizations` / `validations` / `fulfillmentConstraintRules`) shows our object → the behavior manifests at checkout (delivery options renamed/reordered; payment methods filtered; invalid cart blocked with the configured message; constraint visible in Fulfillment settings) → unpublish removes the object.

- [ ] **Step 6: cartTransform end-to-end.** Publish a `functions.cartTransform` bundle module with two real dev-store SKUs. Expect: a `superapp-bundle-*` parent product exists; `cartTransforms(first: 5)` shows one transform; adding both components to cart merges them into the bundle line at the configured price. Unpublish → transform deleted, cart no longer merges. Verify NO `superapp-fn-cartTransform` metaobject was created (Task 8 removed it): `metaobjectByHandle(type: "$app:superapp_function_config", handle: "superapp-fn-cartTransform")` → null (and the lowercase variant, per Step 2's verdict).

- [ ] **Step 7: Record.** Append the dated probe log (each step, observed vs expected, casing verdict) to `docs/publishing.md`; update `.claude/.../MEMORY` is out of scope here — the executor reports results upward. Commit: `git commit -m "docs(ws-e): live-store probe log — publish integrity verified end-to-end"`.

---

## Self-Review (performed while writing)

1. **Spec coverage** against the WS-E scope: activation objects incl. all six mutations + idempotent create/update/delete + GID storage + `shopifyFunctions` lookup + per-type gate revert (Tasks 3–8) ✓; unpublish + delete cleanup + route + UI note + mocked-sequence tests (Tasks 9–11) ✓; real rollback + theater removal with an explicit either/or decision (E4: removal) (Tasks 12–13) ✓; partial-failure ledger + guidance + idempotency pinning (Task 14) ✓; embed onboarding grounded in current docs (`api_key` form; settings_data detection) (Task 15) ✓; manifest consistency (Task 2) ✓; bundles decision (E5, Task 8) ✓; live probe incl. handle-casing with a concrete conditional fix (Task 17) ✓; dependency notes in header ✓.
2. **Placeholder scan:** no TBD/TODO-later items; the two intentionally conditional pieces (WS-QF gate reconciliation in Task 1, casing fix in Task 17) each carry the full code for both branches. Test snippets that depend on runtime-emitted strings (Task 14 ledger names) explicitly say the first test pins the format.
3. **Type consistency:** `ActivationService.ensureForFunctionKey/deleteForFunctionKey/recordCartTransform`, `FUNCTION_KEY_ACTIVATION`, `PublishService` session `{ shop?, accessToken?, shopId? }`, `UnpublishService.unpublish(spec, target)`, `RollbackService.rollbackToVersion(moduleId, version)`, `markUnpublished(shopDomain, moduleId)`, `unpublishThenDelete(admin, shopDomain, moduleId)`, `parseEmbedStatus/getThemeEmbedStatus/embedActivationDeepLink`, `PublishPartialFailureError(failedOp, completed, cause)` are used with the same names/signatures everywhere they appear.
4. **GraphQL:** every document in this plan was validated against Admin 2026-07 via the Shopify Dev MCP validator (including the deprecation-driven switches to `functionHandle` and the `validations`/`fulfillmentConstraintRules` recovery shapes; `fulfillmentConstraintRules` is a plain list, not a connection).

## Cross-review reconciliation (2026-08-24)

Edits applied from the cross-plan review:

- **B4.6** — Task 2's test helper reads `shopify.app.production.toml` (was `shopify.app.toml`); Task 6 Step 4 and Task 7 Step 4 add `write_validations` / `write_fulfillment_constraint_rules` to **both** `shopify.app.production.toml` and `shopify.app.dev.toml` scopes; Task 17 Step 1 deploys with `--config dev` for the dev-store probe (closing `--config production` release once the probe is green), with re-consent landing on whichever app the probe uses.
- **B4.7** — Task 2 Step 3's rationale no longer names an `api_version` (extensions will be on 2026-07 after WS-D Task 10); it now says "a stable dated `api_version`".
- **B7** — Task 1: the hedged "if WS-QF landed the gate under a different name/shape…" passage replaced with the concrete migration contract (WS-QF landed `FUNCTION_ACTIVATION_UNWIRED` + `functionActivationGap`, `ctx.activationHandledByCoDeploy`, `publish(spec, target, opts?)`, and pinned tests; Task 1 deletes the WS-QF symbols, introduces the initially-empty `ACTIVATION_WIRED_FUNCTION_TYPES`, keeps the co-deploy exemption in the gate condition until Task 8 retires it, and migrates the pinned tests preserving their co-deploy assertions); Task 1's gate code snippet now includes `&& !ctx.activationHandledByCoDeploy`. Task 3 Step 6 notes `publish()` keeps WS-QF's `opts` parameter and keeps forwarding `activationHandledByCoDeploy` into the preflight context until Task 8.
- **D7** — Ground-truth section: `rollbackToVersion` note amended — it also sets `status: 'PUBLISHED'` (module.service.ts:283), not only the `activeVersionId` flip.
