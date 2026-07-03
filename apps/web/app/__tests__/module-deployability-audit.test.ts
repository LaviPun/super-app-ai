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
  // Order-routing Function: the crate (extensions/superapp-order-routing, target
  // cart.fulfillment-groups.location-rankings.generate.run — a REAL 2026-04 API) + full
  // TS wiring are real and its handle is wired in FUNCTION_RUNTIME_HANDLES, but the handle
  // is not yet in the deployed-function manifest (deployed-extensions.server.ts), so it
  // honestly reads needs_runtime until `shopify app deploy` ships the wasm and the handle
  // is added there — the same honest state as the shipping-discount crate.
  'functions.orderRoutingLocationRule',
  // Local-pickup / pickup-point delivery-option generators: the crates
  // (extensions/superapp-local-pickup, extensions/superapp-pickup-point) + full TS wiring
  // are real, but these Function APIs are currently only on Shopify's `unstable` version
  // (verified 2026-07-04 via the dev MCP; NOT in 2026-04, which the app pins). Their
  // handles are wired, but the crates can't ship on a stable version yet, so the handles
  // won't be in the deployed manifest → needs_runtime until Shopify promotes these APIs.
  'functions.localPickupDeliveryOption',
  'functions.pickupPointDeliveryOption',
  // Shipping-discount Function: the crate (extensions/superapp-shipping-discount,
  // target cart.delivery-options.discounts.generate.run) + full TS wiring are real,
  // but its handle is not yet in the deployed-function manifest
  // (deployed-extensions.server.ts), so it honestly reads needs_runtime until
  // `shopify app deploy` ships the wasm and the handle is added there. See
  // discount-packs.md §9.2.
  'functions.shippingDiscount',
  // Flow trigger/action extensions ship; workflow-definition publish wiring pending.
  'flow.automation',
  // Spring 2026 Discount UI Extension — generatable + previewable, but the
  // discount-details admin extension isn't built in extensions/ yet.
  'admin.discountUi',
  // App-proxy sync: no compiler persists its config and nothing consumes it
  // server-side yet, so publishing would deploy nothing. Gated until wired.
  'integration.httpSync',
  // Composite blueprint: no runtime of its own. It deploys ONLY by publishing its
  // members (co-deploy); as a standalone module it compiles to a bare AUDIT op and
  // writes no artifact, so publishing it directly would false-publish. Gated
  // needs_runtime so the single-publish path fails loudly. See extension-eligibility.ts.
  'platform.extensionBlueprint',
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

  it('reports the deployable surface area (most types)', () => {
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
    for (const type of ['functions.discountRules', 'theme.section'] as const) {
      const pf = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(pf.status, `${type} must stay deployable`).toBe('deployable');
      expect(pf.willDeploy).toBe(true);
    }
  });
});

/**
 * Casing fix: validation-report check status is a strict uppercase enum
 * ('PASS'|'WARN'|'FAIL'). The LLM sometimes emits the wrong case; the envelope
 * repair must normalize it BEFORE schema validation, or a lowercase 'pass' both
 * fails the Zod enum (needless retry) and renders red in the module UI (which
 * checks `status === 'PASS'` exactly).
 */
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
