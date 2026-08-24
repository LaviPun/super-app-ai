import { describe, it, expect } from 'vitest';
import {
  RECIPE_SPEC_TYPES,
  getExtensionEligibility,
  isRuntimeShipped,
  ACTIVATION_WIRED_FUNCTION_TYPES,
  type ModuleType,
  type RecipeSpec,
  type DeployTarget,
} from '@superapp/core';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { deployedFunctionExtensions } from '~/services/publish/deployed-extensions.server';
import { compileRecipe } from '~/services/recipes/compiler';
import { repairHydrateEnvelope } from '~/services/ai/llm.server';

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
  // Local-pickup / pickup-point delivery-option generators: the crates
  // (extensions/superapp-local-pickup, extensions/superapp-pickup-point) + full TS wiring
  // are real, but these Function APIs are currently only on Shopify's `unstable` version
  // (verified 2026-07-04 via the dev MCP; NOT in 2026-04, which the app pins). Their
  // handles are wired, but the crates can't ship on a stable version yet, so the handles
  // won't be in the deployed manifest → needs_runtime until Shopify promotes these APIs.
  'functions.localPickupDeliveryOption',
  'functions.pickupPointDeliveryOption',
  // flow.automation is now DEPLOYABLE: the compiler persists the flow definition
  // (SHOP_METAFIELD_SET, non-AUDIT → not false-published) and FlowRunnerService
  // consumes the active-version specJson server-side — a linear runner on live
  // webhooks / MANUAL / SCHEDULED / agent API, with long DELAY/wait steps parked on
  // the durable scheduler (WorkflowRun WAITING + resumeAt) and resumed by the cron
  // sweep once due (idempotent). So it is intentionally NOT in this set anymore.
  // integration.httpSync is now DEPLOYABLE (build #7a): the compiler persists the sync
  // config (SHOP_METAFIELD_SET) and HttpSyncRunnerService consumes it server-side —
  // webhook-triggered outbound sync to the merchant-connected service (signed) +
  // inbound reconciliation into the typed data store. So it is intentionally NOT in
  // this set anymore.
  // Composite blueprint: no runtime of its own. It deploys ONLY by publishing its
  // members (co-deploy); as a standalone module it compiles to a bare AUDIT op and
  // writes no artifact, so publishing it directly would false-publish. Gated
  // needs_runtime so the single-publish path fails loudly. See extension-eligibility.ts.
  'platform.extensionBlueprint',
  // WS-E (D6 step 2): wasm deployed but Shopify ACTIVATION object unwired on the
  // single-module publish path (see ACTIVATION_WIRED_FUNCTION_TYPES in
  // extension-eligibility.ts — initially empty ⇒ every functions.* type gates here).
  // Blueprint co-deploy still publishes them (activationHandledByCoDeploy). Each
  // WS-E task removes exactly one type from this set as activation wiring ships.
  // functions.discountRules removed (Task 3, 2026-08-24): ActivationService's
  // discount kind wires discountAutomaticAppCreate/Update — see
  // ACTIVATION_WIRED_FUNCTION_TYPES.
  // functions.deliveryCustomization removed (Task 4, 2026-08-24): ActivationService's
  // deliveryCustomization kind wires deliveryCustomizationCreate, bound by
  // functionHandle, adopting the existing node for our function (paginated
  // deliveryCustomizations scan keyed on functionId) — see
  // ACTIVATION_WIRED_FUNCTION_TYPES.
  // functions.paymentCustomization removed (Task 5, 2026-08-24): ActivationService's
  // paymentCustomization kind wires paymentCustomizationCreate, identical shape to
  // deliveryCustomization (paginated paymentCustomizations scan keyed on
  // functionId) — see ACTIVATION_WIRED_FUNCTION_TYPES.
  // functions.cartAndCheckoutValidation removed (Task 6, 2026-08-24): ActivationService's
  // validation kind wires validationCreate (enable:true, blockOnFailure:false), adoption
  // keyed directly off shopifyFunction.handle (paginated validations scan) — see
  // ACTIVATION_WIRED_FUNCTION_TYPES.
  // functions.fulfillmentConstraints removed (Task 7, 2026-08-24): ActivationService's
  // fulfillmentConstraintRule kind wires fulfillmentConstraintRuleCreate
  // (deliveryMethodTypes: ['SHIPPING','LOCAL','PICK_UP']), adoption keyed off
  // function.handle over the plain-list fulfillmentConstraintRules (no pagination —
  // not a connection) — see ACTIVATION_WIRED_FUNCTION_TYPES.
  // functions.cartTransform removed (Task 8, 2026-08-24): wired via
  // PublishService.publishCartTransform → BundleProductService (resolveComponents →
  // ensureParentBundleProduct → activateCartTransform writing $app:bundle_config),
  // GID recorded via ActivationService.recordCartTransform for unpublish
  // (cartTransformDelete) — see ACTIVATION_WIRED_FUNCTION_TYPES. All six
  // WS-QF-original function types are now activation-wired.
  // Shipping-discount + order-routing Functions: wasm now deployed (WS-E T2 —
  // superapp-shipping-discount, superapp-order-routing joined the deployed-function
  // manifest in deployed-extensions.server.ts, reconciling it with
  // shopify.app.production.toml's extension_directories). Same activation gate as the
  // six types above — needs_runtime until each gets its ACTIVATION_WIRED_FUNCTION_TYPES
  // entry.
  'functions.shippingDiscount',
  'functions.orderRoutingLocationRule',
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
    it(`${type} classifier agrees with the registry (manifest ∧ activation)`, () => {
      const shipped = isRuntimeShipped(type, { deployedFunctionHandles: deployed });
      const activationGated = type.startsWith('functions.') && !ACTIVATION_WIRED_FUNCTION_TYPES.has(type);
      const expectedDeployable = shipped && !activationGated;
      const result = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(result.status).toBe(expectedDeployable ? 'deployable' : 'needs_runtime');
      expect(result.willDeploy).toBe(expectedDeployable);
    });
  }

  it('the needs_runtime set equals the documented pending set (no silent regression)', () => {
    const needsRuntime = RECIPE_SPEC_TYPES.filter(
      (t) => !classifyModulePublishability({ type: t } as RecipeSpec, { deployedExtensions: deployed }).willDeploy,
    ).sort();
    expect(needsRuntime).toEqual([...EXPECTED_NEEDS_RUNTIME].sort());
  });

  it('reports the deployable surface area (most types)', () => {
    const deployableCount = RECIPE_SPEC_TYPES.filter(
      (t) => classifyModulePublishability({ type: t } as RecipeSpec, { deployedExtensions: deployed }).willDeploy,
    ).length;
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
  // Checkout-UI types deploy via PLATFORM extensions (the compiler's target guard
  // now rejects any other kind — the old fabricated 'CHECKOUT' kind only "worked"
  // because compileRecipe used to ignore the target entirely).
  const target = { kind: 'PLATFORM', moduleId: 'test-module' } as unknown as DeployTarget;

  for (const type of ['checkout.block', 'postPurchase.offer'] as const) {
    it(`${type} compiles to a checkoutUpsellPayload, not an AUDIT no-op`, () => {
      const spec = { type, name: 'Test Offer', config: {} } as unknown as RecipeSpec;
      const result = compileRecipe(spec, target);
      expect(result.checkoutUpsellPayload).toBeDefined();
      expect(result.checkoutUpsellPayload?.type).toBe(type);
    });
  }
});

/**
 * Build #2: a checkout.block stays `deployable` (checkout UI extension is shipped)
 * and surfaces protected-customer-data + buyer-input write notes without ever
 * blocking publish. Bare configs surface no build#2 note beyond the Plus plan note.
 */
describe('build#2 checkout.block preflight notes (non-blocking)', () => {
  const deployed = deployedFunctionExtensions();

  it('surfaces protected-data + buyer-input notes for a rich checkout.block, still deployable', () => {
    const spec = {
      type: 'checkout.block',
      name: 'Gift options',
      config: {
        target: 'purchase.checkout.block.render',
        title: 'Make it a gift',
        protectedData: 'level2',
        fields: [{ kind: 'text', key: 'gift_message', label: 'Gift message', write: { to: 'attribute' } }],
      },
    } as unknown as RecipeSpec;
    const pf = classifyModulePublishability(spec, { deployedExtensions: deployed });
    expect(pf.willDeploy).toBe(true);
    expect(pf.reasons.some((r) => r.includes('Level 2'))).toBe(true);
    expect(pf.reasons.some((r) => r.toLowerCase().includes('accelerated checkout'))).toBe(true);
  });

  it('bare checkout.block (no config) does not crash and stays deployable', () => {
    const pf = classifyModulePublishability({ type: 'checkout.block' } as RecipeSpec, {
      deployedExtensions: deployed,
    });
    expect(pf.willDeploy).toBe(true);
  });
});

/**
 * INTEGRITY GATE (build #0): PUBLISHED must be gated behind a REAL deployable
 * artifact. A type whose compile yields ONLY a bare AUDIT op AND no payload writes
 * nothing at publish; if such a type is still classified `willDeploy: true`, the
 * publish path flips status→PUBLISHED while deploying nothing (false-publish).
 *
 * The one legitimate exception is a type that deploys via a NON-compiler artifact:
 * `pos.extension` persists no metaobject — its shipped POS block reads the PUBLISHED
 * ModuleVersion from the app backend (/api/pos/config, see pos-config.server.ts), so
 * the persisted PUBLISHED version IS the artifact. It is genuinely deployable.
 */
const PAYLOAD_KEYS = [
  'themeModulePayload',
  'adminBlockPayload',
  'adminActionPayload',
  'adminDiscountUiPayload',
  'adminLinkPayload',
  'adminPrintPayload',
  'adminSegmentTemplatePayload',
  'checkoutUpsellPayload',
  'customerAccountBlockPayload',
  'proxyWidgetPayload',
] as const;

/** Types whose real deploy artifact is NOT a compiler op/payload (documented exceptions). */
const NON_COMPILER_ARTIFACT_TYPES: ReadonlySet<ModuleType> = new Set<ModuleType>([
  // POS reads its PUBLISHED ModuleVersion from the app backend, not a metaobject.
  'pos.extension',
]);

describe('INTEGRITY: no AUDIT-only type false-publishes (PUBLISHED ⇒ real artifact)', () => {
  const deployed = deployedFunctionExtensions();
  const themeTarget = { kind: 'THEME', themeId: '1', moduleId: 'x' } as unknown as DeployTarget;
  const platformTarget = { kind: 'PLATFORM', moduleId: 'x' } as unknown as DeployTarget;

  for (const type of RECIPE_SPEC_TYPES) {
    it(`${type}: if willDeploy, it emits a real artifact (op or payload) or is a documented non-compiler-artifact type`, () => {
      const pf = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      if (!pf.willDeploy) return; // needs_runtime types are honestly gated — nothing to prove.

      let auditOnly = false;
      let hasPayload = false;
      try {
        const spec = { type, name: 'Probe', config: {} } as unknown as RecipeSpec;
        const result = compileRecipe(spec, type === 'theme.section' ? themeTarget : platformTarget);
        auditOnly = result.ops.length > 0 && result.ops.every((o) => o.kind === 'AUDIT');
        hasPayload = PAYLOAD_KEYS.some((k) => (result as Record<string, unknown>)[k] != null);
      } catch {
        // A compile throw on an empty probe config means the compiler DOES real work
        // for this type (it reads config) — it is not a bare AUDIT no-op.
        return;
      }

      const noArtifact = auditOnly && !hasPayload;
      if (noArtifact) {
        expect(
          NON_COMPILER_ARTIFACT_TYPES.has(type),
          `${type} is willDeploy=true but compiles to a bare AUDIT op with no payload and no documented ` +
            `non-compiler artifact path — it would flip PUBLISHED while deploying nothing (false-publish).`,
        ).toBe(true);
      }
    });
  }

  it('platform.extensionBlueprint is gated needs_runtime (composite has no standalone artifact)', () => {
    const pf = classifyModulePublishability({ type: 'platform.extensionBlueprint' } as RecipeSpec, {
      deployedExtensions: deployed,
    });
    expect(pf.status).toBe('needs_runtime');
    expect(pf.willDeploy).toBe(false);
  });

  it('a known-deployable type still reaches deployable (gate is not over-broad)', () => {
    for (const type of ['analytics.pixel', 'theme.section'] as const) {
      const pf = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(pf.status, `${type} must stay deployable`).toBe('deployable');
      expect(pf.willDeploy).toBe(true);
    }
  });
});

/**
 * Pricing-mechanism honesty (plan 1c): a Function spec pinned to a DECLARATIVE-ONLY
 * pricing mechanism (`discount-code` / `draft-order`) has no shipped runtime — the
 * compiler lowers only the two `shopify-function-*` mechanisms — so it must classify
 * `needs_runtime` (never willDeploy), or it would false-publish an inert discount.
 * A bare spec (no pricing) for the same type stays deployable — the gate is narrow.
 */
describe('INTEGRITY: declarative pricing mechanism ⇒ needs_runtime (no inert false-publish)', () => {
  const deployed = deployedFunctionExtensions();

  for (const mechanism of ['discount-code', 'draft-order'] as const) {
    it(`functions.discountRules with '${mechanism}' classifies needs_runtime`, () => {
      const spec = {
        type: 'functions.discountRules',
        name: 'Inert discount',
        config: {
          rules: [{ when: {}, apply: { percentageOff: 10 } }],
          pricing: { model: 'single', mechanism, discount: { kind: 'percentage', value: 10 } },
        },
      } as unknown as RecipeSpec;
      const pf = classifyModulePublishability(spec, { deployedExtensions: deployed });
      expect(pf.status).toBe('needs_runtime');
      expect(pf.willDeploy).toBe(false);
      expect(pf.reasons.some((r) => r.includes(mechanism) && r.toLowerCase().includes('declarative'))).toBe(true);
    });
  }

  it("functions.cartTransform with a per-bundle 'draft-order' mechanism classifies needs_runtime", () => {
    const spec = {
      type: 'functions.cartTransform',
      name: 'Inert bundle',
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: 'Kit',
            componentSkus: ['A', 'B'],
            bundleSku: 'KIT',
            pricing: { model: 'single', mechanism: 'draft-order', discount: { kind: 'fixed-price', value: 50 } },
          },
        ],
      },
    } as unknown as RecipeSpec;
    const pf = classifyModulePublishability(spec, { deployedExtensions: deployed });
    expect(pf.status).toBe('needs_runtime');
    expect(pf.willDeploy).toBe(false);
  });

  it('functions.discountRules with a REAL Function mechanism passes the pricing gate (deployable on single-module path)', () => {
    const spec = {
      type: 'functions.discountRules',
      name: 'Real discount',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 10 } }],
        pricing: { model: 'single', mechanism: 'shopify-function-discount', discount: { kind: 'percentage', value: 10 } },
      },
    } as unknown as RecipeSpec;
    // WS-E Task 3: functions.discountRules is activation-wired — the single-module
    // path is deployable directly now, proving the pricing gate is narrow (it was
    // never the activation gate that blocked this spec).
    const single = classifyModulePublishability(spec, { deployedExtensions: deployed });
    expect(single.status).toBe('deployable');
    expect(single.willDeploy).toBe(true);
    // Blueprint co-deploy (which activates for itself) stays deployable too.
    const coDeploy = classifyModulePublishability(spec, {
      deployedExtensions: deployed,
      activationHandledByCoDeploy: true,
    });
    expect(coDeploy.status).toBe('deployable');
    expect(coDeploy.willDeploy).toBe(true);
  });
});

/**
 * Casing fix: validation-report check status is a strict uppercase enum
 * ('PASS'|'WARN'|'FAIL'). The LLM sometimes emits the wrong case; the envelope
 * repair must normalize it BEFORE schema validation, or a lowercase 'pass' both
 * fails the Zod enum (needless retry) and renders red in the module UI (which
 * checks `status === 'PASS'` exactly).
 */
/**
 * WS-E activation gate (D6 step 2, 2026-08-24): Function types whose wasm IS
 * deployed but whose Shopify ACTIVATION object is never created on the
 * single-module publish path (cartTransformCreate / discountAutomaticAppCreate live
 * only in bundle-product.service.ts, used by blueprint co-deploy; the
 * delivery/payment/validation/fulfillment Create mutations exist nowhere).
 * Publishing one writes a config metaobject and flips PUBLISHED while the Function
 * never runs. Gate them needs_runtime on the single-module path; blueprint
 * co-deploy opts out via activationHandledByCoDeploy. This local list is the six
 * types WS-QF originally gated explicitly; ACTIVATION_WIRED_FUNCTION_TYPES (empty)
 * now gates them — and every other functions.* type — as a strict superset. Each
 * WS-E task removes exactly one type from ACTIVATION_WIRED_FUNCTION_TYPES's
 * complement (i.e. adds it to the wired set) as activation wiring ships.
 * functions.discountRules removed (Task 3) — now activation-wired.
 * functions.deliveryCustomization removed (Task 4) — now activation-wired.
 * functions.paymentCustomization removed (Task 5) — now activation-wired.
 * functions.cartAndCheckoutValidation removed (Task 6) — now activation-wired.
 * functions.fulfillmentConstraints removed (Task 7) — now activation-wired.
 * functions.cartTransform removed (Task 8) — now activation-wired via
 * PublishService.publishCartTransform (BundleProductService end-to-end), so ALL
 * SIX original WS-QF-gated types are wired (see the explicit assertion below).
 * The list now pins the two REMAINING activation-gated function types —
 * functions.shippingDiscount / functions.orderRoutingLocationRule (WS-E T2:
 * wasm deployed via extension_directories, but no ActivationService kind yet).
 */
const ACTIVATION_UNWIRED_TYPES = ['functions.shippingDiscount', 'functions.orderRoutingLocationRule'] as const;

describe('INTEGRITY: activation-unwired function types are needs_runtime on single publish', () => {
  const deployed = deployedFunctionExtensions();

  for (const type of ACTIVATION_UNWIRED_TYPES) {
    it(`${type} is needs_runtime with an honest activation reason (wasm deployed is not enough)`, () => {
      const pf = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(pf.status).toBe('needs_runtime');
      expect(pf.willDeploy).toBe(false);
      expect(pf.reasons.join(' ')).toMatch(/activation/i);
    });

    it(`${type} stays deployable for blueprint co-deploy (activationHandledByCoDeploy)`, () => {
      const pf = classifyModulePublishability({ type } as RecipeSpec, {
        deployedExtensions: deployed,
        activationHandledByCoDeploy: true,
      });
      expect(pf.status).toBe('deployable');
      expect(pf.willDeploy).toBe(true);
    });
  }

  it('analytics.pixel is NOT gated (webPixelCreate is a real activation)', () => {
    const pf = classifyModulePublishability({ type: 'analytics.pixel' } as RecipeSpec, {
      deployedExtensions: deployed,
    });
    expect(pf.status).toBe('deployable');
  });

  it('NONE of the WS-QF-original-six function types is still gated/needs_runtime (all activation-wired)', () => {
    // The six function types WS-QF originally gated explicitly (each has a real
    // activation implementation — five via ActivationService ensure* kinds, and
    // cartTransform via PublishService.publishCartTransform/BundleProductService;
    // see FUNCTION_KEY_ACTIVATION). WS-E tasks 3-8 progressively un-gated them via
    // ACTIVATION_WIRED_FUNCTION_TYPES — as of Task 8 the gated set is EMPTY.
    // functions.shippingDiscount / functions.orderRoutingLocationRule are a SEPARATE
    // needs_runtime concern (WS-E T2, no activation wiring yet) and are covered by
    // the ACTIVATION_UNWIRED_TYPES loop above (see EXPECTED_NEEDS_RUNTIME too).
    const originalSix = [
      'functions.discountRules',
      'functions.deliveryCustomization',
      'functions.paymentCustomization',
      'functions.cartAndCheckoutValidation',
      'functions.fulfillmentConstraints',
      'functions.cartTransform',
    ] as const;
    const gatedFunctionTypes = originalSix
      .filter((t) => !classifyModulePublishability({ type: t } as RecipeSpec, { deployedExtensions: deployed }).willDeploy)
      .sort();
    expect(gatedFunctionTypes).toEqual([]);
  });
});

describe("INTEGRITY: validation-report status casing is normalized ('pass' → 'PASS')", () => {
  it('uppercases lowercase/mixed-case check statuses and overall', () => {
    const repaired = repairHydrateEnvelope({
      validationReport: {
        overall: 'pass',
        checks: [
          { id: 'A', severity: 'high', status: 'pass', description: 'ok' },
          { id: 'B', severity: 'medium', status: 'Warn', description: 'meh' },
          { id: 'C', severity: 'low', status: 'fail', description: 'bad' },
        ],
      },
    }) as { validationReport: { overall: string; checks: Array<{ status: string }> } };

    expect(repaired.validationReport.overall).toBe('PASS');
    expect(repaired.validationReport.checks.map((c) => c.status)).toEqual(['PASS', 'WARN', 'FAIL']);
  });
});
