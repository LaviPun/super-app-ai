# Basic-Plan Bundle Pricing (NERD-pattern fallback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fixed-price bundle pricing actually work on non-Plus Shopify stores by expressing it through the (all-plans) discount Function instead of the Plus-only `lineUpdate` cart-transform operation, and correct all plan-gating notes to match Shopify's verified rules.

**Architecture:** The cart-transform wasm is untouched — it stays config-driven. A new pure splitter in the publish path decides, per shop plan, whether a `fixed-price` bundle keeps the existing `lineUpdate` config shape (Plus) or is rewritten as merge-only cart-transform config **plus** a companion discount rule that reduces the merged parent line to the target price (all other plans). The discount wasm gains one additive apply kind (`fixedPricePerUnit`); targeting reuses the existing `skuIn` matcher against the bundle parent's SKU. Publish co-writes the bundle rules into the existing `superapp-fn-discountRules` function config (managed, keyed, idempotent) and idempotently ensures an automatic app discount node exists.

**Tech Stack:** Rust (shopify_function crate, wasm), TypeScript (Remix app), Vitest, Shopify Admin GraphQL (2026-04).

## Verified platform facts this plan relies on (do not re-litigate)

- Functions in **public App Store apps run on every plan**; custom-app distribution is Plus-only. Source: <https://shopify.dev/docs/apps/build/functions> ("Functions availability").
- Cart Transform: **only `lineUpdate` is Plus/dev-store-gated**. `linesMerge` and `lineExpand` carry no plan note. Source: <https://shopify.dev/docs/api/functions/latest/cart-transform>.
- Delivery Customization, Payment Customization, and Cart/Checkout Validation Function APIs carry **no per-API Plus note** (the "some capabilities Plus-only" pointer resolves to notes on individual API pages; these pages have none). Source: <https://shopify.dev/docs/api/functions/latest> + per-API pages.
- Cart transform runs **before** discount functions in checkout processing, so the discount function sees the *merged* line (merchandise = the bundle parent variant, subtotal = sum of components). This is what makes the fallback sound.
- Current wasm behavior (verified in source): `extensions/superapp-cart-transform/src/cart_transform_run.rs:271-287` emits `LineUpdate`+`FixedPricePerUnit` for `fixed-price` bundles — silently dead on non-Plus stores.

## Global Constraints

- Rust functions: no external crates beyond `shopify_function`; pure decision cores stay unit-testable without Shopify input types (existing pattern in both crates).
- All config-shape changes must be **additive**: older configs parse unchanged (serde drops unknown keys); a pricing-free bundle serializes byte-identically to the legacy shape.
- `UNKNOWN` plan tier is treated as **non-Plus** (the discount fallback also prices correctly on Plus, so degrading is safe; the reverse is not).
- Tiered `fixed-price` bundles are **out of scope** for the non-Plus fallback in this plan (post-merge line quantity does not reflect component count, so `minQty` tier gates cannot be evaluated faithfully). They keep current behavior; the honest-gap note is updated. Single `fixed-price` only.
- Managed discount rules are keyed `"bundle:<bundleId>"` in a rule-level `id` field. The wasm ignores unknown keys, so `id` is runtime-inert by design.
- Run commands from repo root `/Users/lavipun/Work/ai-shopify-superapp` unless stated.
- Rust tests: `cargo test` inside the extension dir. TS tests: `npx vitest run <file>` inside `apps/web`.

---

### Task 1: Discount wasm — `fixedPricePerUnit` apply kind

**Files:**
- Modify: `extensions/superapp-discount/src/cart_lines_discounts_generate_run.rs`

**Interfaces:**
- Consumes: existing `RuleApply`, `Line`, `Candidate`, `CandidateValue`, `decide()` (all in this file).
- Produces: `RuleApply.fixed_price_per_unit: Option<f64>` — config key `fixedPricePerUnit` (camelCase via `rename_all`). Semantics: for each targeted line, reduce to `fixed_price_per_unit × quantity`; emit ONE `FixedAmount` candidate = Σ max(0, line.subtotal − fp×qty) across targeted lines; no-op when every targeted line is already at/below target. Task 3's splitter emits this key.

- [ ] **Step 1: Write the failing tests** — append to the `tests` module in `cart_lines_discounts_generate_run.rs`:

```rust
    // ── fixedPricePerUnit (Basic-plan bundle pricing fallback) ───────────────

    #[test]
    fn fixed_price_per_unit_reduces_line_to_target() {
        // Merged bundle line: qty 1, subtotal 30.00, target 27.00 → 3.00 off.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(27.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "BUNDLE-CANDLE", "pB", 1, 30.0),
            line("l2", "OTHER", "pO", 1, 10.0),
        ];
        let d = decide(&cfg, 40.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 3.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
        assert_eq!(d.target_line_ids, vec!["l1"]);
    }

    #[test]
    fn fixed_price_per_unit_scales_with_quantity() {
        // qty 2 of the bundle parent: subtotal 60, target 27×2=54 → 6.00 off.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(27.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "BUNDLE-CANDLE", "pB", 2, 30.0)];
        let d = decide(&cfg, 60.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 6.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
    }

    #[test]
    fn fixed_price_per_unit_no_op_when_already_at_or_below_target() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(35.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "BUNDLE-CANDLE", "pB", 1, 30.0)];
        assert_eq!(decide(&cfg, 30.0, &lines), None);
    }

    #[test]
    fn fixed_price_per_unit_takes_precedence_within_rule() {
        // A rule carrying both keys uses fixedPricePerUnit (splitter emits one key,
        // but precedence must be deterministic).
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["B".to_string()], ..Default::default() },
                RuleApply {
                    fixed_price_per_unit: Some(27.0),
                    percentage_off: Some(50.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "B", "pB", 1, 30.0)];
        let d = decide(&cfg, 30.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 3.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extensions/superapp-discount && cargo test fixed_price_per_unit`
Expected: compile error — `RuleApply` has no field `fixed_price_per_unit`.

- [ ] **Step 3: Implement.** In `RuleApply` (after the `cheapest_free` field, `cart_lines_discounts_generate_run.rs:109`), add:

```rust
    /// Per-unit set price for the targeted lines (Basic-plan bundle-pricing
    /// fallback): each targeted line is reduced to `value × quantity`. Emitted by
    /// the publish-time plan splitter as the non-Plus expression of a cart-transform
    /// `fixed-price` bundle (targets the merged parent line by SKU).
    #[shopify_function(default)]
    fixed_price_per_unit: Option<f64>,
```

In `decide()`, insert BEFORE the existing `fixed_price` block (before `cart_lines_discounts_generate_run.rs:252`):

```rust
        // fixed-price-per-unit: reduce each targeted line to fp × qty. Emitted as
        // one fixed-amount reduction across the set (per-line deltas summed).
        if let Some(fp) = rule.apply.fixed_price_per_unit {
            let reduction: f64 = targeted
                .iter()
                .map(|l| (l.subtotal - fp * l.quantity as f64).max(0.0))
                .sum();
            if reduction > 0.0 {
                return Some(Candidate {
                    target_line_ids: targeted.iter().map(|l| l.id.clone()).collect(),
                    value: CandidateValue::FixedAmount(reduction),
                    message: format!("Bundle price {}", format_money(fp)),
                    prerequisite_line_ids: vec![],
                });
            }
            continue;
        }
```

- [ ] **Step 4: Run the crate's full test suite**

Run: `cd extensions/superapp-discount && cargo test`
Expected: all tests PASS (new 4 + all pre-existing).

- [ ] **Step 5: Verify the wasm still builds**

Run: `cd extensions/superapp-discount && PATH="$HOME/.cargo/bin:$PATH" cargo build --target=wasm32-wasip1 --release 2>&1 | tail -3`
Expected: `Finished` line, no errors. (Rust/wasm toolchain needs `~/.cargo/bin` on PATH — known repo requirement.)

- [ ] **Step 6: Commit**

```bash
git add extensions/superapp-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "feat(discount-fn): additive fixedPricePerUnit apply kind (Basic-plan bundle pricing)"
```

---

### Task 2: Pure plan splitter — `splitBundlePricingForPlan`

**Files:**
- Create: `apps/web/app/services/bundles/bundle-pricing-split.ts`
- Test: `apps/web/app/__tests__/bundle-pricing-split.test.ts`
- Modify: `apps/web/app/services/bundles/bundle-product.service.ts` (add `bundleSku` to `ResolvedBundle`)

**Interfaces:**
- Consumes: `ResolvedBundle`, `BundleFunctionConfig`, `buildBundleRuntimeConfig` from `bundle-product.service.ts`; `PlanTier` from `@superapp/core`.
- Produces:

```ts
export type BundlePricingRule = {
  id: string; // "bundle:<bundleId>" — managed-rule key, runtime-inert
  when: { skuIn: string[] };
  apply: { fixedPricePerUnit: number };
};
export type BundlePricingSplit = {
  cartTransformConfig: BundleFunctionConfig;
  bundleDiscountRules: BundlePricingRule[];
};
export function splitBundlePricingForPlan(bundles: ResolvedBundle[], plan: PlanTier): BundlePricingSplit;
```

Task 3 consumes both outputs. `ResolvedBundle` gains optional `bundleSku?: string`.

- [ ] **Step 1: Add `bundleSku` to `ResolvedBundle`.** In `bundle-product.service.ts` (type at line 56), add after `parentVariantId: string;`:

```ts
  /** SKU of the parent bundle variant (used by the non-Plus pricing fallback to
   *  target the merged line in the discount Function). */
  bundleSku?: string;
```

Then find where `ResolvedBundle` objects are constructed from `CartTransformBundleInput` (the `resolveBundleWithPricing` path and its caller — `grep -n "parentVariantId:" apps/web/app/services/bundles/bundle-product.service.ts apps/web/app/services/blueprints/blueprint.service.ts`) and thread `bundleSku: input.bundleSku` through each construction site.

- [ ] **Step 2: Write the failing tests** — create `apps/web/app/__tests__/bundle-pricing-split.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitBundlePricingForPlan } from '~/services/bundles/bundle-pricing-split';
import type { ResolvedBundle } from '~/services/bundles/bundle-product.service';

const fixedPriceBundle: ResolvedBundle = {
  bundleId: 'candle-trio',
  title: 'Candle Trio',
  parentVariantId: 'gid://shopify/ProductVariant/1',
  bundleSku: 'BUNDLE-CANDLE',
  discountPercentage: 0,
  components: [],
  price: { kind: 'fixed-price', value: 27 },
};

const percentageBundle: ResolvedBundle = {
  bundleId: 'soap-duo',
  title: 'Soap Duo',
  parentVariantId: 'gid://shopify/ProductVariant/2',
  bundleSku: 'BUNDLE-SOAP',
  discountPercentage: 0,
  components: [],
  price: { kind: 'percentage', value: 10 },
};

describe('splitBundlePricingForPlan', () => {
  it('PLUS keeps fixed-price on the cart transform, no discount rules', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'PLUS');
    expect(s.cartTransformConfig.bundles[0].price).toEqual({ kind: 'fixed-price', value: 27 });
    expect(s.bundleDiscountRules).toEqual([]);
  });

  it('BASIC strips fixed-price from cart transform and emits a keyed discount rule', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'BASIC');
    expect(s.cartTransformConfig.bundles[0].price).toBeUndefined();
    expect(s.bundleDiscountRules).toEqual([
      {
        id: 'bundle:candle-trio',
        when: { skuIn: ['BUNDLE-CANDLE'] },
        apply: { fixedPricePerUnit: 27 },
      },
    ]);
  });

  it('UNKNOWN plan is treated as non-Plus', () => {
    const s = splitBundlePricingForPlan([fixedPriceBundle], 'UNKNOWN');
    expect(s.bundleDiscountRules).toHaveLength(1);
  });

  it('percentage bundles are untouched on every plan (merge pricing works everywhere)', () => {
    for (const plan of ['BASIC', 'PLUS', 'UNKNOWN'] as const) {
      const s = splitBundlePricingForPlan([percentageBundle], plan);
      expect(s.cartTransformConfig.bundles[0].price).toEqual({ kind: 'percentage', value: 10 });
      expect(s.bundleDiscountRules).toEqual([]);
    }
  });

  it('fixed-price bundle without a bundleSku on non-Plus emits no rule (cannot target) and keeps lineUpdate config', () => {
    const noSku = { ...fixedPriceBundle, bundleSku: undefined };
    const s = splitBundlePricingForPlan([noSku], 'BASIC');
    // Honest degradation: without a SKU to target we leave behavior as-is
    // rather than silently mispricing.
    expect(s.cartTransformConfig.bundles[0].price).toEqual({ kind: 'fixed-price', value: 27 });
    expect(s.bundleDiscountRules).toEqual([]);
  });

  it('tiered fixed-price bundles are left unchanged on non-Plus (documented gap)', () => {
    const tiered: ResolvedBundle = {
      ...fixedPriceBundle,
      price: undefined,
      tiers: [{ threshold: 2, kind: 'fixed-price', value: 25 }],
    };
    const s = splitBundlePricingForPlan([tiered], 'BASIC');
    expect(s.cartTransformConfig.bundles[0].tiers).toHaveLength(1);
    expect(s.bundleDiscountRules).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/__tests__/bundle-pricing-split.test.ts`
Expected: FAIL — module `~/services/bundles/bundle-pricing-split` not found.

- [ ] **Step 4: Implement** — create `apps/web/app/services/bundles/bundle-pricing-split.ts`:

```ts
/**
 * Plan-aware bundle pricing split (Basic-plan fallback — the "NERD pattern").
 *
 * Cart Transform's `lineUpdate` operation (the only channel that can set an
 * absolute per-unit price on a line) runs ONLY on dev stores and Shopify Plus
 * (shopify.dev/docs/api/functions/latest/cart-transform). `linesMerge` and the
 * discount Function run on every plan. So on non-Plus shops a `fixed-price`
 * bundle is expressed as: merge-only cart-transform config (presentation) plus a
 * companion discount rule that reduces the merged parent line — targeted by the
 * parent variant's SKU — to `fixedPricePerUnit × quantity` at pricing time.
 * Cart transform runs before discount functions, so the discount sees the merged
 * line. Percentage bundles are untouched (merge `percentageDecrease` is
 * plan-universal). Tiered fixed-price stays Plus-only: post-merge quantity does
 * not reflect component count, so tier gates cannot be evaluated faithfully.
 */
import type { PlanTier } from '@superapp/core';
import type { BundleFunctionConfig, ResolvedBundle } from './bundle-product.service';
import { buildBundleRuntimeConfig } from './bundle-product.service';

export type BundlePricingRule = {
  /** Managed-rule key ("bundle:<bundleId>"); ignored by the wasm (serde drops it). */
  id: string;
  when: { skuIn: string[] };
  apply: { fixedPricePerUnit: number };
};

export type BundlePricingSplit = {
  cartTransformConfig: BundleFunctionConfig;
  bundleDiscountRules: BundlePricingRule[];
};

export function splitBundlePricingForPlan(
  bundles: ResolvedBundle[],
  plan: PlanTier,
): BundlePricingSplit {
  if (plan === 'PLUS' || plan === 'ENTERPRISE') {
    return { cartTransformConfig: buildBundleRuntimeConfig(bundles), bundleDiscountRules: [] };
  }

  const rules: BundlePricingRule[] = [];
  const rewritten = bundles.map((b) => {
    const isSingleFixedPrice =
      b.price?.kind === 'fixed-price' && (b.price.value ?? 0) > 0 && !(b.tiers && b.tiers.length);
    if (!isSingleFixedPrice || !b.bundleSku) return b;
    rules.push({
      id: `bundle:${b.bundleId}`,
      when: { skuIn: [b.bundleSku] },
      apply: { fixedPricePerUnit: b.price!.value },
    });
    // Strip the fixed price so the wasm takes the merge path (no lineUpdate).
    return { ...b, price: undefined };
  });

  return { cartTransformConfig: buildBundleRuntimeConfig(rewritten), bundleDiscountRules: rules };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/__tests__/bundle-pricing-split.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/services/bundles/bundle-pricing-split.ts apps/web/app/__tests__/bundle-pricing-split.test.ts apps/web/app/services/bundles/bundle-product.service.ts apps/web/app/services/blueprints/blueprint.service.ts
git commit -m "feat(bundles): plan-aware pricing split — fixed-price bundles fall back to discount rules on non-Plus"
```

---

### Task 3: Publisher — managed bundle rules in `discountRules` config + automatic discount node

**Files:**
- Modify: `apps/web/app/services/bundles/bundle-product.service.ts` (two new methods on `BundleProductService`)
- Test: `apps/web/app/__tests__/bundle-product.service.test.ts` (extend existing suite; it already mocks `admin.graphql`)

**Interfaces:**
- Consumes: `BundlePricingRule` (Task 2); `MetaobjectService` (`apps/web/app/services/shopify/metaobject.service.ts` — `getFunctionConfigByKey(key)`, `upsertFunctionConfigObject(key, config)` at lines 246/261); the `cartTransformCreate` mock pattern already used in the test file.
- Produces:
  - `BundleProductService.writeBundlePricingRules(mo: MetaobjectService, rules: BundlePricingRule[]): Promise<void>` — merges managed rules (id-prefixed `bundle:`) into the `discountRules` function config, replacing any previous `bundle:*` rules, preserving all module-authored rules, no-op-safe when `rules` is empty AND no stale managed rules exist.
  - `BundleProductService.ensureAutomaticBundleDiscount(): Promise<string>` — idempotently ensures ONE automatic app discount node backed by the `superapp-discount` function; returns its GID.

- [ ] **Step 1: Verify the MetaobjectService constructor + existing test mock shape** (read-only):

Run: `grep -n "constructor" apps/web/app/services/shopify/metaobject.service.ts && sed -n '1,40p' apps/web/app/__tests__/bundle-product.service.test.ts`
Expected: constructor signature (admin client) and the established `admin.graphql` mock pattern to reuse below. Adapt mock helper names in Step 2 to what you find.

- [ ] **Step 2: Write the failing tests** — append to `apps/web/app/__tests__/bundle-product.service.test.ts` (adapt mock helpers to the file's existing pattern):

```ts
describe('writeBundlePricingRules', () => {
  it('replaces previous bundle:* rules and preserves module-authored rules', async () => {
    const existing = {
      rules: [
        { when: { minSubtotal: 100 }, apply: { percentageOff: 10 } },          // module-authored
        { id: 'bundle:old-bundle', when: { skuIn: ['OLD'] }, apply: { fixedPricePerUnit: 9 } }, // stale managed
      ],
    };
    const mo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue(existing),
      upsertFunctionConfigObject: vi.fn().mockResolvedValue('gid://shopify/Metaobject/9'),
    };
    const svc = new BundleProductService(mockAdmin());
    await svc.writeBundlePricingRules(mo as never, [
      { id: 'bundle:candle-trio', when: { skuIn: ['BUNDLE-CANDLE'] }, apply: { fixedPricePerUnit: 27 } },
    ]);
    expect(mo.upsertFunctionConfigObject).toHaveBeenCalledWith('discountRules', {
      rules: [
        { when: { minSubtotal: 100 }, apply: { percentageOff: 10 } },
        { id: 'bundle:candle-trio', when: { skuIn: ['BUNDLE-CANDLE'] }, apply: { fixedPricePerUnit: 27 } },
      ],
    });
  });

  it('no-ops when there are no new rules and no stale managed rules', async () => {
    const mo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue({ rules: [{ apply: { percentageOff: 5 } }] }),
      upsertFunctionConfigObject: vi.fn(),
    };
    const svc = new BundleProductService(mockAdmin());
    await svc.writeBundlePricingRules(mo as never, []);
    expect(mo.upsertFunctionConfigObject).not.toHaveBeenCalled();
  });
});

describe('ensureAutomaticBundleDiscount', () => {
  it('returns the existing node without creating a duplicate', async () => {
    const admin = mockAdminSequence([
      // 1st call: lookup existing automatic app discounts
      { data: { automaticDiscountNodes: { nodes: [
        { id: 'gid://shopify/DiscountAutomaticNode/1',
          automaticDiscount: { __typename: 'DiscountAutomaticApp', title: 'SuperApp Bundle Pricing' } },
      ] } } },
    ]);
    const svc = new BundleProductService(admin);
    await expect(svc.ensureAutomaticBundleDiscount()).resolves.toBe('gid://shopify/DiscountAutomaticNode/1');
  });

  it('creates the node when absent (function id looked up, then created)', async () => {
    const admin = mockAdminSequence([
      { data: { automaticDiscountNodes: { nodes: [] } } },
      { data: { shopifyFunctions: { nodes: [
        { id: 'fn-1', apiType: 'product_discounts', title: 'superapp-discount' },
      ] } } },
      { data: { discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/2' },
        userErrors: [],
      } } },
    ]);
    const svc = new BundleProductService(admin);
    await expect(svc.ensureAutomaticBundleDiscount()).resolves.toBe('gid://shopify/DiscountAutomaticNode/2');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/__tests__/bundle-product.service.test.ts`
Expected: FAIL — `writeBundlePricingRules` / `ensureAutomaticBundleDiscount` do not exist.

- [ ] **Step 4: Implement both methods** on `BundleProductService` (after `activateCartTransform`, `bundle-product.service.ts:286`):

```ts
  /**
   * Merge managed bundle-pricing rules into the `discountRules` function config
   * (the same `$app:superapp_function_config` metaobject the discount wasm reads).
   * Managed rules are keyed `id: "bundle:*"` — previous managed rules are replaced,
   * module-authored rules are preserved verbatim. Idempotent on republish.
   */
  async writeBundlePricingRules(mo: MetaobjectService, rules: BundlePricingRule[]): Promise<void> {
    const existing = (await mo.getFunctionConfigByKey('discountRules')) as
      | { rules?: Array<Record<string, unknown>> }
      | null;
    const existingRules = existing?.rules ?? [];
    const unmanaged = existingRules.filter(
      (r) => typeof r.id !== 'string' || !(r.id as string).startsWith('bundle:'),
    );
    const hadManaged = unmanaged.length !== existingRules.length;
    if (rules.length === 0 && !hadManaged) return;
    await mo.upsertFunctionConfigObject('discountRules', {
      ...(existing ?? {}),
      rules: [...unmanaged, ...rules],
    });
  }

  /**
   * Idempotently ensure the automatic app discount node that activates the
   * superapp-discount function for bundle pricing. Title-keyed lookup first;
   * creates via discountAutomaticAppCreate when absent. Requires write_discounts
   * (already in shopify.app.toml scopes).
   */
  async ensureAutomaticBundleDiscount(): Promise<string> {
    const TITLE = 'SuperApp Bundle Pricing';
    const lookup = await this.graphqlJson<{
      automaticDiscountNodes: { nodes: Array<{ id: string; automaticDiscount: { __typename: string; title?: string } }> };
    }>(
      `#graphql
      query BundlePricingDiscountLookup {
        automaticDiscountNodes(first: 50) {
          nodes { id automaticDiscount { __typename ... on DiscountAutomaticApp { title } } }
        }
      }`,
      {},
    );
    const existing = lookup.automaticDiscountNodes.nodes.find(
      (n) => n.automaticDiscount.__typename === 'DiscountAutomaticApp' && n.automaticDiscount.title === TITLE,
    );
    if (existing) return existing.id;

    const fns = await this.graphqlJson<{
      shopifyFunctions: { nodes: Array<{ id: string; apiType: string; title: string }> };
    }>(
      `#graphql
      query BundlePricingFunctionLookup {
        shopifyFunctions(first: 50) { nodes { id apiType title } }
      }`,
      {},
    );
    const fn = fns.shopifyFunctions.nodes.find((n) => n.apiType === 'product_discounts');
    if (!fn) throw new Error('superapp-discount function not deployed (no product_discounts function found)');

    const created = await this.graphqlJson<{
      discountAutomaticAppCreate: {
        automaticAppDiscount?: { discountId: string };
        userErrors: Array<{ message: string }>;
      };
    }>(
      `#graphql
      mutation BundlePricingDiscountCreate($discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $discount) {
          automaticAppDiscount { discountId }
          userErrors { message }
        }
      }`,
      {
        discount: {
          title: TITLE,
          functionId: fn.id,
          startsAt: new Date().toISOString(),
          combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
        },
      },
    );
    const err = created.discountAutomaticAppCreate.userErrors[0];
    if (err) throw new Error(`discountAutomaticAppCreate failed: ${err.message}`);
    const id = created.discountAutomaticAppCreate.automaticAppDiscount?.discountId;
    if (!id) throw new Error('discountAutomaticAppCreate returned no id');
    return id;
  }
```

Add the imports at the top of the file: `import type { BundlePricingRule } from './bundle-pricing-split';` and `import type { MetaobjectService } from '~/services/shopify/metaobject.service';` (match the repo's existing import style for MetaobjectService). Reuse the private `graphqlJson` helper (line 335) — match its actual signature when wiring the calls.

- [ ] **Step 5: Validate the two GraphQL documents** against the live schema:

Run (uses the shopify-dev MCP if executing interactively, else Shopify CLI): `cd apps/web && npx shopify app function schema --help >/dev/null 2>&1; echo "validate manually"` — at minimum confirm field names `automaticDiscountNodes`, `shopifyFunctions.nodes.apiType`, `discountAutomaticAppCreate.automaticAppDiscount.discountId` against <https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountAutomaticAppCreate>. If `discountId` is not the field name on `DiscountAutomaticApp` in 2026-04, use the documented field and update the test mock to match.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/__tests__/bundle-product.service.test.ts`
Expected: all PASS (new 4 + pre-existing).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/services/bundles/bundle-product.service.ts apps/web/app/__tests__/bundle-product.service.test.ts
git commit -m "feat(bundles): managed bundle-pricing discount rules + idempotent automatic discount node"
```

---

### Task 4: Wire the split into the bundle publish path

**Files:**
- Modify: `apps/web/app/services/blueprints/blueprint.service.ts` (both `activateCartTransform` call sites — the main path near line 294 and the member-deploy path at line 462)

**Interfaces:**
- Consumes: `splitBundlePricingForPlan` (Task 2), `writeBundlePricingRules` + `ensureAutomaticBundleDiscount` (Task 3), `CapabilityService.getPlanTier(shopDomain)` (`apps/web/app/services/shopify/capability.service.ts`).
- Produces: publish flow behavior — on non-Plus shops a fixed-price bundle publish writes merge-only cart-transform config, upserts the managed discount rules, and ensures the discount node. On Plus, byte-identical behavior to today.

- [ ] **Step 1: Read both call sites and their surrounding context** (what variables are in scope — `admin`, `shopDomain`, any `MetaobjectService` instance):

Run: `sed -n '280,300p;450,475p' apps/web/app/services/blueprints/blueprint.service.ts && grep -n "shopDomain\|MetaobjectService\|CapabilityService" apps/web/app/services/blueprints/blueprint.service.ts | head -20`

- [ ] **Step 2: Write the failing test.** Extend the existing blueprint/bundle deploy test (locate with `grep -rn "activateCartTransform" apps/web/app/__tests__/`) with a case: publishing a fixed-price bundle with plan `BASIC` calls `activateCartTransform` with a config whose bundle has NO `price` key, calls `ensureAutomaticBundleDiscount` once, and calls `writeBundlePricingRules` with the `bundle:<id>` rule; with plan `PLUS` the config keeps `price` and neither discount method is called. Follow the file's existing mocking style for services.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run <that test file>`
Expected: FAIL — call sites still pass `buildBundleRuntimeConfig(...)` directly.

- [ ] **Step 4: Implement.** At each call site, replace the direct `buildBundleRuntimeConfig`→`activateCartTransform` flow with:

```ts
const plan = await new CapabilityService().getPlanTier(shopDomain);
const split = splitBundlePricingForPlan(bundlesForThisSite, plan);
await svc.activateCartTransform(split.cartTransformConfig);
if (split.bundleDiscountRules.length > 0) {
  await svc.ensureAutomaticBundleDiscount();
}
await svc.writeBundlePricingRules(mo, split.bundleDiscountRules);
```

(`bundlesForThisSite` is whatever `ResolvedBundle[]` the site already has — `[bundle]` at line 462. `writeBundlePricingRules` is called unconditionally so stale managed rules are cleaned when a bundle loses its fixed price. Construct `mo` the same way other code in this file constructs `MetaobjectService`, found in Step 1.)

- [ ] **Step 5: Run the full web test suite + typecheck**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/services/blueprints/blueprint.service.ts apps/web/app/__tests__/
git commit -m "feat(publish): plan-aware bundle pricing — non-Plus shops get merge + discount fallback"
```

---

### Task 5: Truth pass — plan-gating copy and eligibility notes

**Files:**
- Modify: `apps/web/app/services/shopify/capability.service.ts:28-35` (`explainCapabilityGate`)
- Modify: `packages/core/src/extension-eligibility.ts` (PLUS_ONLY_FUNCTIONS + `fn()` note, ~lines 201/209/447)
- Modify: `packages/core/src/templates/modules/functions-cart-transform.ts` (`fallbackTheme.notificationMessage`)
- Test: whichever existing tests assert these strings (find with the greps below)

- [ ] **Step 1: Locate every assertion on the current copy**

Run: `grep -rn "require Shopify Plus\|requires Shopify Plus\|requiresPlan" apps/web/app/__tests__ packages/core --include="*.ts" | grep -iv node_modules | head -30`

- [ ] **Step 2: Update `explainCapabilityGate`** in `capability.service.ts` — replace the `CART_TRANSFORM_FUNCTION_UPDATE` branch body with:

```ts
      return 'Cart Transform lineUpdate operations run only on Shopify Plus (and dev stores). On other plans, fixed-price bundle pricing is applied automatically via a discount Function instead — the bundle still prices correctly.';
```

- [ ] **Step 3: Fix distribution-conditional notes in `extension-eligibility.ts`.** Per the verified docs (header of this plan): `functions.deliveryCustomization`, `functions.paymentCustomization`, `functions.cartAndCheckoutValidation` carry NO per-API Plus restriction — the Plus gate they were modeling is the *custom-app distribution* gate, which applies to ALL function types equally. Make `PLUS_ONLY_FUNCTIONS` empty (keep the set + plumbing for future per-API gates), and append a distribution note in the `fn()` helper:

```ts
// In fn(), change the note line to:
    note: `${note} Functions run on every Shopify plan when the app is installed from the App Store; under custom-app distribution they require Shopify Plus.`,
```

Update the `PLUS_ONLY_FUNCTIONS` doc comment to record why it is now empty (cite the two shopify.dev URLs from this plan's header and the audit date 2026-07-13).

- [ ] **Step 4: Update the template message.** In `packages/core/src/templates/modules/functions-cart-transform.ts`, find `notificationMessage` (grep `Bundle pricing requires Shopify Plus`) and replace the message with:

```
'Fixed bundle pricing applies via lineUpdate on Shopify Plus; on other plans it is applied automatically as a bundle discount at checkout.'
```

- [ ] **Step 5: Update the assertions found in Step 1, then run the affected suites**

Run: `cd apps/web && npx vitest run && cd ../../packages/core && npx vitest run 2>/dev/null || (cd /Users/lavipun/Work/ai-shopify-superapp && npx vitest run packages/core)`
Expected: all PASS. (Use whichever core-package test invocation the repo's root package.json defines — check `npm run -ws test --if-present` if the direct call fails.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/services/shopify/capability.service.ts packages/core/src/extension-eligibility.ts packages/core/src/templates/modules/functions-cart-transform.ts apps/web/app/__tests__ packages/core
git commit -m "fix(eligibility): plan notes match verified Shopify rules — lineUpdate-only Plus gate, distribution-conditional function notes"
```

---

### Task 6: End-to-end verification on the dev store

**Files:** none (verification only). Requires `shopify app dev` / deployed dev app.

- [ ] **Step 1: Build both wasm crates and deploy to the dev store**

Run: `PATH="$HOME/.cargo/bin:$PATH" shopify app deploy` (from repo root; confirm the version bump prompt).
Expected: version deployed with `superapp-cart-transform` + `superapp-discount` included.

- [ ] **Step 2: Simulate the non-Plus path.** Dev stores satisfy the Plus gate, so force the fallback: temporarily set the shop's `planTier` to `BASIC` in the local DB (`cd apps/web && npx prisma studio` → `Shop.planTier = 'BASIC'`), then publish a fixed-price bundle module from `/generate`.

- [ ] **Step 3: Verify the three artifacts on the store:**
  1. `$app:bundle_config` metafield on the CartTransform owner has the bundle WITHOUT a `price` key (Admin GraphQL: `cartTransforms(first:5) { nodes { metafield(namespace:"$app", key:"bundle_config"){ value } } }`).
  2. `superapp-fn-discountRules` metaobject `config_json` contains the `bundle:<id>` rule.
  3. `automaticDiscountNodes` contains "SuperApp Bundle Pricing".

- [ ] **Step 4: Cart test.** On the storefront, add the bundle via its widget; open cart/checkout. Expected: one merged bundle line + a "Bundle price X" discount reducing it to the configured fixed price. Screenshot for the record.

- [ ] **Step 5: Restore `planTier`, commit any fixups, and update `docs/debug.md`** with a short section documenting the fallback (root cause: Plus-only lineUpdate; fix: plan splitter; where the managed rules live).

```bash
git add docs/debug.md
git commit -m "docs(debug): Basic-plan bundle pricing fallback — root cause and verification"
```

---

## Explicitly out of scope (separate plans)

1. **App Store distribution readiness** (production hosting to replace the trycloudflare URL, billing API, app review checklist, scopes re-consent rollout from `shopify.app.toml:118`). This is the gate to non-Plus stores in production — nothing in this plan reaches real Basic-plan merchants until the app is public. Ops-heavy, no TDD shape; needs its own plan.
2. **Tiered fixed-price bundles on non-Plus** — needs a per-bundle-quantity signal visible to the discount function (e.g. a `_superapp_bundle_qty` cart attribute stamped by the widget). Documented as an honest gap in Task 2.
3. **Merchant-facing function test panel** (NERD's step-4 UX) — product feature, separate spec.
