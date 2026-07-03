import { describe, it, expect } from 'vitest';
import {
  RECIPE_SPEC_TYPES,
  getExtensionEligibility,
  isRuntimeShipped,
  type ModuleType,
  type RecipeSpec,
  type DeployTarget,
} from '@superapp/core';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { deployedFunctionExtensions } from '~/services/publish/deployed-extensions.server';
import { compileRecipe } from '~/services/recipes/compiler';

/**
 * MODULE COMBINATION AUDIT (machine-checked, eligibility model).
 *
 * The platform answers exactly one of two honest things for EVERY module type, so
 * a merchant can ask for anything:
 *   - `deployable`    — a real runtime is shipped; publish writes config it reads
 *                       (plan/scope requirements ride along as merchant-facing notes).
 *   - `needs_runtime` — the runtime binary/extension is not shipped yet (the only
 *                       genuinely non-deployable case). The goal is to keep this
 *                       set empty by shipping each runtime.
 *
 * This test pins reality two ways:
 *  1. The classifier must AGREE with the eligibility registry for every type
 *     (consistency — a classifier bug fails CI).
 *  2. The set of types still `needs_runtime` must equal the documented pending set
 *     below — so shipping a runtime is a visible, intentional change, and nothing
 *     silently regresses.
 */

// Types whose runtime is NOT shipped yet. Empty is the goal; shrink this as
// runtimes land (each removal must coincide with a real extension + compiler wiring).
const EXPECTED_NEEDS_RUNTIME: ReadonlySet<ModuleType> = new Set<ModuleType>([
  // No Shopify CLI template for an order-routing Function → no wasm to ship.
  'functions.orderRoutingLocationRule',
  // Flow trigger/action extensions ship; workflow-definition publish wiring pending.
  'flow.automation',
  // Spring 2026 Discount UI Extension — generatable + previewable, but the
  // discount-details admin extension isn't built in extensions/ yet.
  'admin.discountUi',
  // App-proxy sync: no compiler persists its config and nothing consumes it
  // server-side yet, so publishing would deploy nothing. Gated until wired.
  'integration.httpSync',
]);
// `pos.extension` is now deployable: extensions/superapp-pos-block reads its
// published config from the app backend (/api/pos/config) via App Authentication
// (POS cannot read Storefront metaobjects, so config is served by the app).

describe('module deployability audit — every type classified (eligibility model)', () => {
  const deployed = deployedFunctionExtensions();

  it('covers every RECIPE_SPEC_TYPE (no drift)', () => {
    for (const t of RECIPE_SPEC_TYPES) {
      // getExtensionEligibility throws if a type has no registry entry.
      expect(getExtensionEligibility(t).moduleType).toBe(t);
    }
  });

  for (const type of RECIPE_SPEC_TYPES) {
    it(`${type} classifier agrees with the registry`, () => {
      const shipped = isRuntimeShipped(type, { deployedFunctionHandles: deployed });
      const result = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(result.status).toBe(shipped ? 'deployable' : 'needs_runtime');
      expect(result.willDeploy).toBe(shipped);
    });
  }

  it('the needs_runtime set equals the documented pending set (no silent regression)', () => {
    const needsRuntime = RECIPE_SPEC_TYPES.filter(
      (t) => !isRuntimeShipped(t, { deployedFunctionHandles: deployed }),
    ).sort();
    expect(needsRuntime).toEqual([...EXPECTED_NEEDS_RUNTIME].sort());
  });

  it('reports the deployable surface area (most of 20)', () => {
    const deployableCount = RECIPE_SPEC_TYPES.filter((t) =>
      isRuntimeShipped(t, { deployedFunctionHandles: deployed }),
    ).length;
    // Everything except the documented pending set must be deployable end-to-end.
    expect(deployableCount).toBe(RECIPE_SPEC_TYPES.length - EXPECTED_NEEDS_RUNTIME.size);
  });
});

/**
 * Regression guard for the false-published bug: a type classified `deployable`
 * whose compiler returns only a bare `AUDIT` op writes NOTHING at publish, yet the
 * module still flips to PUBLISHED. checkout.block / postPurchase.offer both have
 * real compilers (emitting a `checkoutUpsellPayload` PublishService writes to a
 * metaobject) — they must be wired into `compileRecipe`, not routed to the AUDIT
 * fallthrough. This fails on the pre-fix path.
 */
describe('deployable checkout-UI types compile to a real deploy (no false-publish)', () => {
  const target = { kind: 'CHECKOUT', moduleId: 'test-module' } as unknown as DeployTarget;

  for (const type of ['checkout.block', 'postPurchase.offer'] as const) {
    it(`${type} compiles to a checkoutUpsellPayload, not an AUDIT no-op`, () => {
      const spec = { type, name: 'Test Offer', config: {} } as unknown as RecipeSpec;
      const result = compileRecipe(spec, target);
      expect(result.checkoutUpsellPayload).toBeDefined();
      expect(result.checkoutUpsellPayload?.type).toBe(type);
    });
  }
});
