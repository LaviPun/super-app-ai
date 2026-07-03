# Discount / Pricing Packs (R2.2) — Implementation Spec

**Phase 030 · Control-packs · Piece R2.2.** The atomic discount primitive
(`type / value / min / combinable`) plus its relatives (tiers, BOGO, gift,
mechanism), and — the make-or-break part — how that merchant-facing vocabulary
**compiles into the already-shipped** `functions.discountRules` /
`functions.cartTransform` runtime.

Ground truth from the corpus:
- `settings-vocabulary.md:357-409` — packs #20–24 (`pricing.discount`,
  `pricing.tiers`, `pricing.bogo`, `pricing.gift`, `pricing.discount-mechanism`).
- `gap-analysis.md:89-95, 248` — M2 / R2.2: *"a wired runtime with no author-side
  words."* Must model **prerequisites + stacking** (Spring-26 BXGY + discount
  stacking).
- `fast-bundle.md:44, 119, 126` — **tiers can MIX discount kinds within one tier
  structure** (percentage / fixed / cheapest-free / free-shipping). This is the
  hard requirement that shapes the whole schema.
- `kaching-bundles.md:34, 78-84` — the canonical Tier row shape
  `{ quantity, discountType(percent|flat|specific-price), value, title, subtitle,
  badge, highlighted, preSelected, image, freeGift }`; BOGO
  `{ buy-qty, get-qty, get-product, showAsFree }`; gift `{ product, threshold }`.

**Design stance:** purely additive. One new control pack (`pricing`) that is the
single source of truth for the vocabulary, plus a **narrow, deterministic
compiler translation layer** that lowers that vocabulary into the *existing*
`functions.discountRules` / `functions.cartTransform` config shapes those
compilers already publish. No runtime is rewritten; we only widen the config both
Functions already accept and add a lowering step so the rich vocabulary survives
to the metaobject.

---

## 1. Current state (file:line evidence)

### 1.1 The enforcement runtime is real but fed an anemic config

`apps/web/app/services/recipes/compiler/functions.discountRules.ts:5-14` — the
compiler is a pure pass-through:

```ts
export function compileDiscountRules(spec) {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'discountRules', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.discountRules' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-discountRules' }),
  };
}
```

`functions.cartTransform.ts:5-16` — identical pass-through
(`functionKey: 'cartTransform'`).

The `FUNCTION_CONFIG_UPSERT` op is real and load-bearing:
`compiler/types.ts` defines it as *"Upsert a `$app:superapp_function_config`
metaobject for a Shopify Function. PublishService writes this to the metaobject +
sets a metaobject_reference shop metafield. API 2026-04+ compliant."* So whatever
we put in `config` reaches the live Function config metaobject verbatim.

### 1.2 The config schema is the bottleneck — no pricing vocabulary

`packages/core/src/recipe.ts:165-186` — `functions.discountRules.config`:

```ts
config: z.object({
  rules: z.array(z.object({
    when: z.object({
      customerTags: z.array(z.string()).optional(),
      minSubtotal: z.number().nonnegative().optional(),
      skuIn: z.array(z.string()).optional(),
    }),
    apply: z.object({
      percentageOff: z.number().min(0).max(100).optional(),
      fixedAmountOff: z.number().nonnegative().optional(),   // ← only two kinds
    }),
  })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
  combineWithOtherDiscounts: z.boolean().default(true),
}),
```

`recipe.ts:227-244` — `functions.cartTransform.config` models `bundles[]`
(`title / componentSkus / bundleSku`) + a `fallbackTheme`. **No pricing per
bundle** — a cart-transform bundle today has no attached discount at all.

**Gaps vs. corpus:** no `fixed-price`, `cheapest-free`, `free-shipping`,
`free-gift` discount kinds; no tiers; no BOGO; no gift-with-purchase; no min-qty
(only `minSubtotal`); no combine-order / stacking policy; no prerequisites; no
per-tier presentation (title/badge/highlighted/preSelected) for the storefront to
render. The runtime that would enforce these exists; the words to author them do
not.

### 1.3 The control-pack system + how it reaches generation

- Packs live in `packages/core/src/control-packs/packs/*.pack.ts`, each a
  `ControlPack` with a Zod `schema` (`control-packs/types.ts:69-88`). Convention
  proof: `schedule.pack.ts`, `style.pack.ts`.
- Registry: `control-packs/registry.ts` (`ALL_PACKS` array + `getPack`).
- Public surface re-exports each pack schema in `control-packs/index.ts:15-24`.
- **No pricing pack exists** (`packs/` dir has content/style/trigger/
  page-targeting/frequency-cap/countdown/behavior/audience/schedule/
  advanced-custom only — confirmed).

### 1.4 Generation derives JSON Schema straight from the recipe branch

`apps/web/app/services/ai/recipe-json-schema.server.ts:73-88` — `buildRegistry()`
iterates `RecipeSpecSchema.options`, pulls each branch, and runs
`zodToJsonSchema(branch, …)`. That per-type JSON Schema is what's handed to
Anthropic `tool_use` / OpenAI `text.format=json_schema`.

**Consequence that makes this piece tractable:** whatever Zod we add to the
`functions.discountRules` / `functions.cartTransform` `config` *automatically*
becomes part of the structured-output contract the AI must satisfy. No separate
prompt-schema wiring is required for the emit path; only prose guidance (§4).

---

## 2. Target shape (exact TS/Zod types + example JSON)

New file: **`packages/core/src/control-packs/packs/pricing.pack.ts`**. This pack
is the *authoring vocabulary*. It is intentionally richer than any single Function
config; the compiler (§5) lowers it. It is designed so a single `PricingPackSchema`
value can drive **both** a discount Function and a cart-transform bundle.

### 2.1 Primitives

```ts
import { z } from 'zod';
import type { ControlPack } from '../types.js';

/** Discount kinds — the union the corpus demands (fast-bundle.md:44). */
export const DISCOUNT_KINDS = [
  'percentage',      // value = 0..100
  'fixed-amount',    // value = money off (per applicable line or order — see appliesTo)
  'fixed-price',     // value = final price the set is sold for (Kaching "specific price")
  'cheapest-free',   // value ignored; cheapest N in set become free (mix&match tiers)
  'free-shipping',   // value ignored
  'free-gift',       // pairs with `gift`; value ignored
  'none',            // no price change (presentation-only tier)
] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** Atomic discount primitive — pack #20. Reused by tiers, bogo.get, offers. */
export const DiscountSchema = z.object({
  kind: z.enum(DISCOUNT_KINDS).default('percentage'),
  /** Meaning depends on `kind`; ignored for cheapest-free/free-shipping/free-gift/none. */
  value: z.number().nonnegative().default(0),
  /** How many cheapest items become free (kind='cheapest-free'). */
  cheapestFreeCount: z.number().int().positive().max(20).optional(),
  /** Force a price ending, e.g. 0.99 → prices snap to x.99 (Bold). Applied post-calc. */
  priceEnding: z.number().min(0).lt(1).optional(),
})
  .refine(d => d.kind !== 'percentage' || d.value <= 100, {
    message: 'percentage value must be 0..100', path: ['value'],
  });

/** Threshold basis for tiers / gift / min-gate. */
export const THRESHOLD_BASIS = ['quantity', 'cart-value'] as const;

/** Gate that must hold for the whole pricing block to apply (pack #20 min*). */
export const PricingGateSchema = z.object({
  minQuantity: z.number().int().positive().optional(),
  minSubtotal: z.number().nonnegative().optional(),
  /** Prerequisite products/collections (Spring-26 BXGY prerequisites). */
  prerequisiteProductIds: z.array(z.string()).max(100).default([]),
  prerequisiteCollectionIds: z.array(z.string()).max(50).default([]),
  /** Who qualifies — coarse gate; the rule-engine pack (R2.1) handles fine targeting. */
  customerTags: z.array(z.string()).max(50).default([]),
  usageLimit: z.number().int().positive().optional(),
});

/** Stacking / order-of-operations (pack #20 combinable/combineOrder + Spring-26 stacking). */
export const StackingSchema = z.object({
  /** Stack with Shopify native discount codes. Maps to Function's combinesWith. */
  combinable: z.boolean().default(true),
  /** Which discount classes this may combine with (Spring-26 multi-product-discount stacking). */
  combinesWith: z.object({
    orderDiscounts: z.boolean().default(false),
    productDiscounts: z.boolean().default(false),
    shippingDiscounts: z.boolean().default(false),
  }).default({ orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }),
  /** Apply before or after other discounts (Ultimate Special Offers). */
  order: z.enum(['before', 'after']).default('after'),
});
```

### 2.2 Tiers (the flagship — kinds mix within one set)

```ts
/** One tier row. Carries BOTH pricing and per-tier presentation (kaching-bundles.md:34). */
export const TierSchema = z.object({
  /** Threshold at which this tier activates (interpreted per parent `tiers.basis`). */
  threshold: z.number().positive(),
  /** This tier's OWN discount — kinds may differ per tier within the same set. */
  discount: DiscountSchema,
  /** Optional per-tier gift (kaching Tier.freeGift). */
  gift: z.object({ productId: z.string().min(1), quantity: z.number().int().positive().default(1) }).optional(),
  // Presentation (consumed by the storefront tier grid; ignored by the Function).
  title: z.string().max(60).optional(),        // "Buy 3"
  subtitle: z.string().max(120).optional(),     // "Save 37%"
  badge: z.string().max(40).optional(),         // "Most Popular" / "Best Value"
  highlighted: z.boolean().default(false),
  preSelected: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
});

export const TiersSchema = z.object({
  basis: z.enum(THRESHOLD_BASIS).default('quantity'),
  rows: z.array(TierSchema).min(1).max(10),
})
  // Exactly one preselected row (or none).
  .refine(t => t.rows.filter(r => r.preSelected).length <= 1, {
    message: 'At most one tier may be preSelected', path: ['rows'],
  });
```

### 2.3 BOGO + Gift

```ts
/** Buy-X-Get-Y (pack #22, kaching-bundles.md:82). */
export const BogoSchema = z.object({
  buy: z.object({
    productIds: z.array(z.string()).max(100).default([]),
    collectionIds: z.array(z.string()).max(50).default([]),
    quantity: z.number().int().positive().default(1),
  }),
  get: z.object({
    productIds: z.array(z.string()).max(100).default([]),
    collectionIds: z.array(z.string()).max(50).default([]),
    quantity: z.number().int().positive().default(1),
    /** The reward on the "get" arm. showAsFree ⇔ kind:'percentage' value:100. */
    discount: DiscountSchema.default({ kind: 'percentage', value: 100 }),
  }),
  showAsFree: z.boolean().default(true),
});

/** Gift-with-purchase (pack #23). */
export const GiftSchema = z.object({
  productIds: z.array(z.string()).min(1).max(20),
  threshold: z.number().positive(),
  basis: z.enum(THRESHOLD_BASIS).default('cart-value'),
  autoAdd: z.boolean().default(true),
  /** >1 gift → customer chooses (slide-cart/Candy Rack/Moon). */
  selectable: z.boolean().default(false),
});
```

### 2.4 Mechanism + the pack root

```ts
/** How the price change is materialized (pack #24). Gates what the compiler emits. */
export const MECHANISMS = [
  'shopify-function-discount',   // → functions.discountRules  (default, real)
  'shopify-function-cart-transform', // → functions.cartTransform (bundle line merge + price)
  'discount-code',               // author a code the storefront applies (declarative today)
  'draft-order',                 // draft-order pricing (declarative today — no runtime)
] as const;

export const PricingPackSchema = z.object({
  /** Which primitive drives this module. Exactly one “body” is authoritative per model. */
  model: z.enum(['single', 'tiered', 'bogo', 'gift']).default('single'),
  mechanism: z.enum(MECHANISMS).default('shopify-function-discount'),

  /** model:'single' — one flat discount. */
  discount: DiscountSchema.optional(),
  /** model:'tiered'. */
  tiers: TiersSchema.optional(),
  /** model:'bogo'. */
  bogo: BogoSchema.optional(),
  /** model:'gift' (also attachable alongside tiers via per-tier gift). */
  gift: GiftSchema.optional(),

  gate: PricingGateSchema.default({}),
  stacking: StackingSchema.default({}),
})
  // The chosen model must carry its body.
  .superRefine((p, ctx) => {
    const need = { single: 'discount', tiered: 'tiers', bogo: 'bogo', gift: 'gift' } as const;
    const key = need[p.model];
    if ((p as Record<string, unknown>)[key] == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key],
        message: `model='${p.model}' requires config.pricing.${key}` });
    }
  });

export type PricingPack = z.infer<typeof PricingPackSchema>;

export const pricingPack: ControlPack<typeof PricingPackSchema> = {
  id: 'pricing',
  namespace: 'pricing',
  label: 'Pricing & Discounts',
  tier: 'basic',
  schema: PricingPackSchema,
  uiSchema: {
    groupLabel: 'Pricing & Discounts',
    order: ['model', 'discount', 'tiers', 'bogo', 'gift', 'mechanism', 'gate', 'stacking'],
    fields: {
      discount: { showWhen: { field: 'model', equals: 'single' } },
      tiers:    { showWhen: { field: 'model', equals: 'tiered' } },
      bogo:     { showWhen: { field: 'model', equals: 'bogo' } },
      gift:     { showWhen: { field: 'model', equals: 'gift' } },
      mechanism: { tier: 'advanced', help: 'How the discount is enforced at checkout.' },
      stacking:  { tier: 'advanced' },
    },
  },
};
```

### 2.5 Example JSON (a tiered set that MIXES kinds — the load-bearing case)

```json
{
  "pricing": {
    "model": "tiered",
    "mechanism": "shopify-function-discount",
    "tiers": {
      "basis": "quantity",
      "rows": [
        { "threshold": 2, "discount": { "kind": "percentage", "value": 10 },
          "title": "Buy 2", "subtitle": "Save 10%" },
        { "threshold": 3, "discount": { "kind": "percentage", "value": 20 },
          "title": "Buy 3", "badge": "Most Popular", "highlighted": true, "preSelected": true },
        { "threshold": 5, "discount": { "kind": "cheapest-free", "cheapestFreeCount": 1 },
          "title": "Buy 5", "subtitle": "Cheapest free" },
        { "threshold": 6, "discount": { "kind": "fixed-price", "value": 99.99 },
          "title": "Buy 6", "badge": "Best Value" }
      ]
    },
    "gate": { "minQuantity": 2, "prerequisiteCollectionIds": [] },
    "stacking": { "combinable": true, "order": "after",
      "combinesWith": { "orderDiscounts": false, "productDiscounts": true, "shippingDiscounts": false } }
  }
}
```

Four tiers, four *different* discount kinds, one set. That is the parity bar
(`fast-bundle.md:44`).

---

## 3. Files to change (each with what changes)

| # | File | Change |
|---|------|--------|
| 1 | **`packages/core/src/control-packs/packs/pricing.pack.ts`** (NEW) | The schema of §2 in full. Exports `DISCOUNT_KINDS`, `DiscountSchema`, `TierSchema`, `TiersSchema`, `BogoSchema`, `GiftSchema`, `PricingPackSchema`, `pricingPack`, and the `PricingPack` type. |
| 2 | `packages/core/src/control-packs/registry.ts` | Import `pricingPack`; add to `ALL_PACKS`. |
| 3 | `packages/core/src/control-packs/index.ts` | Re-export `PricingPackSchema, pricingPack` (mirror line 15-24 convention). |
| 4 | `packages/core/src/index.ts` (barrel) | Ensure `PricingPackSchema` + `PricingPack` are exported from `@superapp/core` (verify the control-packs barrel is re-exported; add if missing). |
| 5 | `packages/core/src/allowed-values.ts` | Add `pricingTiersMax: 10`, `pricingBogoProductsMax: 100`. Reference them in the pack instead of literals so limits stay centralized (optional but matches house style). Also export `DISCOUNT_KINDS`/`MECHANISMS` here if the team prefers manifest-centralized enums — otherwise keep them in the pack. |
| 6 | **`packages/core/src/recipe.ts`** | On `functions.discountRules.config`: add **optional** `pricing: PricingPackSchema.optional()`. Keep `rules`/`combineWithOtherDiscounts` exactly as-is (back-compat). On `functions.cartTransform.config`: add **optional** `pricing: PricingPackSchema.optional()` at config root, and an **optional** `pricing` on each `bundles[]` row so a bundle can carry its own tier/price. Import `PricingPackSchema` from `./control-packs/packs/pricing.pack.js`. |
| 7 | **`apps/web/app/services/recipes/compiler/pricing/lower.ts`** (NEW) | The deterministic lowering functions (§5): `lowerPricingToDiscountRules(pricing)` → discount-Function config fragment; `lowerPricingToCartTransform(pricing, bundle)` → cart-transform price fragment; `pricingToStorefrontJson(pricing)` → the presentation payload for the tier grid. Pure, no I/O, unit-tested. |
| 8 | `apps/web/app/services/recipes/compiler/functions.discountRules.ts` | Before building ops: if `spec.config.pricing` present, call `lowerPricingToDiscountRules` and **merge** the lowered rules/combinesWith into the config passed to `FUNCTION_CONFIG_UPSERT`. If absent, behave exactly as today. |
| 9 | `apps/web/app/services/recipes/compiler/functions.cartTransform.ts` | If `spec.config.pricing` (root or per-bundle) present, fold the lowered price/expansion into the emitted config. Absent → unchanged. |
| 10 | `apps/web/app/services/ai/generation-prompt` (the prose guidance file that documents `functions.*` config — locate via `grep -rl "discountRules" apps/web/app/services/ai`) | Add a short "Pricing vocabulary" section (§4) so the model knows *when* to emit `config.pricing` and how `model` selects the body. |
| 11 | Storefront tier-grid renderer (theme.section bundle preview + `PreviewService`) | Consume `pricingToStorefrontJson` output to render tiers with badges/highlight/preselect. Out of scope for R2.2's *enforcement* wiring but noted in §5.4 as the render half; if a bundle theme.section already renders tiers, point it at the shared JSON. |
| 12 | Tests (§7) | `packages/core/…/pricing.pack.test.ts`, `…/compiler/pricing/lower.test.ts`, back-compat fixtures. |

---

## 4. Generation wiring (how the AI emits it)

The emit path needs **zero new schema plumbing**: `recipe-json-schema.server.ts`
already turns each `RecipeSpecSchema` branch into the structured-output JSON
Schema (`:73-88`), so the moment `functions.discountRules.config.pricing`
(optional) exists, the AI *can* produce it and it will be validated.

What must change is **prose guidance** so the model reaches for it. Add to the
generation prompt's Functions section:

> **Pricing vocabulary (`config.pricing`).** For any offer that changes price —
> bundles, quantity/volume breaks, BOGO, gift-with-purchase, spend-to-save — emit
> `config.pricing`. Set `model` to one of `single | tiered | bogo | gift` and fill
> the matching body (`discount` / `tiers` / `bogo` / `gift`). Tiers may mix
> discount kinds across rows (e.g. tier 1 percentage, tier 3 cheapest-free, tier 4
> fixed-price) — this is expected for volume bundles. Use `mechanism`
> `shopify-function-discount` unless the offer merges cart lines into a single
> bundle line, in which case use `shopify-function-cart-transform`. Set
> `gate.minQuantity` / `gate.minSubtotal` for thresholds and
> `stacking.combinable` for whether it stacks with Shopify codes. Do **not** emit
> the legacy `rules[]` array when you emit `pricing` — `pricing` supersedes it.

Prompt-expectations / few-shot: add one tiered-mixed-kinds example (the §2.5 JSON)
and one BOGO example to whichever intent-example set feeds discount/bundle prompts
(`apps/web/app/services/ai/intent-examples.ts` — it already references
`functions.discountRules` / `cartTransform`). The classifier
(`cheap-classifier.server.ts`) already routes bundle/discount intents to these
types; no routing change needed.

**Determinism guard:** because `pricing` and legacy `rules` can coexist in the
schema, the lowering step (§5.1) treats `pricing` as authoritative and *derives*
`rules` from it — so even if the model emits both, output is deterministic.

---

## 5. Runtime / compile / render wiring (the make-or-break section)

The runtime is shipped; the job is to make the rich vocabulary **survive to the
Function config metaobject** and to the storefront grid. All translation is a
pure, deterministic **lowering** step. Nothing here calls Shopify — it produces
the same `FUNCTION_CONFIG_UPSERT.config` shape `PublishService` already writes.

### 5.1 `pricing` → `functions.discountRules` config

The discount Function config today is `{ rules: [{ when, apply }], combineWithOtherDiscounts }`
(`recipe.ts:168-185`). We keep that as the **wire format** the Function reads and
*generate* it from `pricing`. Extend `apply` (Function-side contract) to carry the
new kinds; the wasm handler already receives arbitrary config JSON, so widening
the emitted shape is safe as long as the handler learns the new keys (see §5.5).

`lowerPricingToDiscountRules(pricing): { rules: LoweredRule[]; combinesWith; discountApplication }`:

- **single** → one rule: `when` from `gate` (`minQuantity → minQty`,
  `minSubtotal`, `prerequisite* → prerequisites`, `customerTags`), `apply` from
  `discount` (mapping below).
- **tiered** → **one rule per tier row**, each with
  `when.minQty = tier.threshold` (basis `quantity`) or
  `when.minSubtotal = tier.threshold` (basis `cart-value`), and `apply` from that
  tier's own `discount`. Rows are emitted **highest-threshold-first** so the
  Function's first-match evaluation picks the best qualifying tier (documented in
  the lowering + asserted in tests). This is exactly how mixed kinds survive: each
  tier lowers independently.
- **bogo** → a single rule with `apply.buyXGetY = { buyQty, buyIds, getQty, getIds, reward }`;
  `showAsFree` ⇒ reward `{ kind:'percentage', value:100 }`.
- **gift** → a single rule with `apply.freeGift = { productIds, threshold, basis, selectable }`.

Discount-kind mapping (`DiscountSchema` → `apply`):

| `kind` | emitted `apply` |
|--------|-----------------|
| `percentage` | `{ percentageOff: value }` (unchanged legacy key — back-compat) |
| `fixed-amount` | `{ fixedAmountOff: value }` (unchanged legacy key) |
| `fixed-price` | `{ fixedPrice: value }` (new key) |
| `cheapest-free` | `{ cheapestFree: cheapestFreeCount ?? 1 }` (new key) |
| `free-shipping` | `{ freeShipping: true }` (new key) |
| `free-gift` | handled via `apply.freeGift` from `pricing.gift` |
| `none` | rule omitted (presentation-only tier) |

`priceEnding` → `apply.priceEnding` (post-calc rounding hint the handler applies).

Stacking → the Function's `combinesWith`:
`combineWithOtherDiscounts = stacking.combinable` (keeps the legacy top-level
boolean populated for back-compat), plus a new
`combinesWith: { orderDiscounts, productDiscounts, shippingDiscounts }` and
`discountApplication.order = stacking.order`.

`functions.discountRules.ts` change:

```ts
export function compileDiscountRules(spec) {
  const base = spec.config;
  const config = base.pricing
    ? mergeLowered(base, lowerPricingToDiscountRules(base.pricing))  // pricing wins; derives rules
    : base;                                                          // legacy path untouched
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'discountRules', config },
      { kind: 'AUDIT', action: 'compile.functions.discountRules' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-discountRules' }),
  };
}
```

`mergeLowered` overwrites `rules` + `combineWithOtherDiscounts` from the lowered
result and attaches `combinesWith` / `discountApplication`. When `pricing` is
absent the original `spec.config` is emitted byte-for-byte.

### 5.2 `pricing` → `functions.cartTransform`

Cart-transform expands a BAP/bundle into component lines *and* must carry the
discounted price so it survives checkout (`fast-bundle.md:24, 45`). Per-bundle
`pricing` (added in §3 item 6) lowers to a price directive attached to the merged
line:

`lowerPricingToCartTransform(pricing, bundle)` →
`{ ...bundle, price: { kind, value, cheapestFreeCount?, priceEnding? }, tiers?: LoweredTierPrice[] }`.
For `model:'tiered'`, the emitted bundle carries a `tiers[]` price table keyed by
threshold so the CT handler prices the merged line by the selected tier. Absent
`pricing` → the bundle is emitted exactly as today (`title/componentSkus/bundleSku`),
so existing cart-transform recipes are byte-identical.

**Mechanism routing:** `pricing.mechanism` decides *which* Function receives the
lowering when a composite/blueprint emits both surfaces —
`shopify-function-discount` → discountRules; `shopify-function-cart-transform` →
cartTransform. For a single-module recipe the mechanism just validates against the
recipe `type` (emit a compile-time warning op if `type=functions.cartTransform`
but `mechanism=shopify-function-discount`). `discount-code` / `draft-order` remain
**declarative** (AUDIT only) exactly like `admin.discountUi` — honestly gated, no
fake runtime (matches the repo's "no false-published" discipline,
`gap-analysis.md:274`).

### 5.3 Presentation payload for the storefront grid

`pricingToStorefrontJson(pricing)` strips pricing math and emits only what the
tier grid renders: `{ basis, tiers: [{ threshold, title, subtitle, badge,
highlighted, preSelected, imageUrl, displayDiscount }] }` where `displayDiscount`
is a human string derived deterministically ("Save 20%", "Cheapest free", "$99.99")
so the storefront and the Function agree on what the shopper is promised
(`fast-bundle.md:126` — PDP preview and Function must agree). The bundle
`theme.section` (or `PreviewService`) reads this. This is the render half; the
enforcement half (§5.1/5.2) is the R2.2 deliverable, and both consume the same
`pricing` object so they cannot drift.

### 5.4 Where it plugs into the existing publish pipeline

No change: `compileDiscountRules` / `compileCartTransform` still return exactly one
`FUNCTION_CONFIG_UPSERT` + one `AUDIT`. `PublishService` writes the (now richer)
`config` to the `$app:superapp_function_config` metaobject as before. The wasm
Function reads it at request time.

### 5.5 The one runtime dependency to flag

The shipped wasm discount handler must **understand the new `apply` keys**
(`fixedPrice`, `cheapestFree`, `freeShipping`, `buyXGetY`, `freeGift`,
`priceEnding`, `combinesWith`). Until it does, emitting them changes the metaobject
but not shopper-facing behavior for those kinds — `percentage`/`fixed-amount`
(the legacy keys) work immediately. **Open item (§8):** confirm the wasm source
location and land the handler-side changes in the same PR or a fast-follow; the TS
compiler + schema are safe to ship first because the handler ignores unknown keys.

---

## 6. Back-compat (existing persisted recipes MUST keep validating + rendering)

Additive-by-construction:

1. **`pricing` is `.optional()` on both configs.** Every persisted
   `functions.discountRules` recipe (which has `rules[]` + `combineWithOtherDiscounts`
   and *no* `pricing`) still validates unchanged. `functions.cartTransform`
   recipes (with `bundles[]`, no `pricing`) likewise.
2. **Legacy `rules[]` is untouched.** We did not remove `percentageOff` /
   `fixedAmountOff` or narrow `rules`. The compiler's legacy branch
   (`if (base.pricing) … else emit base`) returns the *exact* prior config, so a
   re-publish of an old recipe produces a byte-identical metaobject → identical
   runtime behavior.
3. **New discount kinds use additive keys.** `fixedPrice`/`cheapestFree`/… are new
   `apply` keys; the wasm handler ignores unknown keys today, so old configs (which
   never carry them) are unaffected, and new configs degrade gracefully to
   percentage/fixed until the handler ships (§5.5).
4. **No enum churn.** No existing enum value is renamed or removed;
   `DISCOUNT_KINDS`/`MECHANISMS` are new.
5. **JSON-Schema generation stays valid.** Adding an optional object property to a
   branch is a pure superset; `recipe-json-schema.server.ts`'s
   `normalizeForStructuredOutput` (which force-adds all props to `required`) will
   mark `pricing` required *in the generated JSON Schema only* — verify this does
   not force the model to emit `pricing` for non-pricing discount prompts. **If it
   does**, either (a) leave `pricing` out of that normalization by keeping the two
   Function branches' generation on the legacy prose schema for one release, or
   (b) make `pricing` nullable and teach the normalizer to allow `null`. This is
   the one back-compat interaction to test explicitly (§7, T-BC3).

---

## 7. Test plan (concrete assertions)

**Schema (`pricing.pack.test.ts`):**
- T-S1 `PricingPackSchema.parse` accepts the §2.5 mixed-kinds tiered example.
- T-S2 `model:'single'` without `discount` → ZodError at path `['discount']`.
- T-S3 tiers with two `preSelected:true` rows → ZodError at `['tiers','rows']`.
- T-S4 `discount.kind:'percentage', value:150` → ZodError at `['value']`.
- T-S5 defaults: omitted `stacking` → `{ combinable:true, order:'after', combinesWith:{all false} }`.

**Lowering (`compiler/pricing/lower.test.ts`):**
- T-L1 single percentage → `rules:[{ when:{minQty?}, apply:{percentageOff:20} }]`,
  `combineWithOtherDiscounts` from `stacking.combinable`.
- T-L2 tiered mixed kinds (§2.5) → 4 rules, emitted **highest-threshold-first**
  (thresholds `[6,5,3,2]`), each `apply` matching its tier kind
  (`fixedPrice:99.99`, `cheapestFree:1`, `percentageOff:20`, `percentageOff:10`).
  **This is the flagship assertion — mixed kinds in one set survive.**
- T-L3 bogo `showAsFree:true` → `apply.buyXGetY.reward = {kind:'percentage',value:100}`.
- T-L4 gift → `apply.freeGift = { productIds, threshold, basis }`.
- T-L5 `stacking.combinesWith.productDiscounts:true` → emitted `combinesWith.productDiscounts:true`.
- T-L6 cart-transform per-bundle tiered pricing → bundle carries `tiers[]` price table.
- T-L7 `pricingToStorefrontJson` drops raw `value` math and emits `displayDiscount`
  strings ("Save 20%", "Cheapest free", "$99.99").

**Compiler integration (`functions.discountRules` / `cartTransform`):**
- T-C1 recipe with `config.pricing` → `FUNCTION_CONFIG_UPSERT.config.rules` equals
  `lowerPricingToDiscountRules(...).rules`; still exactly one `AUDIT` op.
- T-C2 mechanism mismatch (`type:cartTransform`, `mechanism:function-discount`) →
  a warning AUDIT op present, compile still succeeds.

**Back-compat:**
- T-BC1 a persisted legacy `functions.discountRules` fixture (rules[], no pricing)
  `RecipeSpecSchema.parse` succeeds; `compileDiscountRules` output `config` is
  **deep-equal** to the input `config` (byte-identical metaobject).
- T-BC2 legacy `functions.cartTransform` fixture → `bundles[]` emitted unchanged.
- T-BC3 `zodToJsonSchema` for the two widened branches still builds; assert the
  generated schema does **not** make `pricing` a hard-required top-level `config`
  key that would break non-pricing discount generation (guards the §6.5 risk).

---

## 8. Risks + open questions

1. **[HIGH] wasm handler lag (§5.5).** The TS compiler will emit `fixedPrice` /
   `cheapestFree` / `freeShipping` / `buyXGetY` / `freeGift`, but until the shipped
   discount + cart-transform wasm handlers parse those keys, only
   percentage/fixed-amount actually price at checkout. **Open q:** where is the
   wasm source (grep the extensions dir for the discount Function crate), and do we
   land handler changes in this PR or fast-follow? Ship-safe ordering: schema +
   compiler first (unknown keys ignored), handler second — but the feature is only
   *real* once the handler lands.
2. **[MED] structured-output `required` normalization (§6.5 / T-BC3).**
   `normalizeForStructuredOutput` force-marks every property `required`. An optional
   `pricing` may become required in the *generated* JSON Schema, pushing the model
   to emit `pricing` even for plain "10% off" prompts. Mitigation options in §6;
   must be verified before enabling on the generation path.
3. **[MED] Tier evaluation order is a Function-contract assumption.** Lowering
   emits tiers highest-threshold-first assuming the wasm handler is first-match.
   If the handler is best-of-all-matching, order is irrelevant but harmless; if
   it's first-match top-down, order is load-bearing. **Confirm the handler's match
   semantics** and encode it in the lowering doc + T-L2.
4. **[MED] Composite/blueprint fan-out is out of scope but adjacent.** A genuine
   Fast-Bundle needs one bundle entity feeding a theme block + cart-transform +
   discount Function that share IDs and the pricing-tier table
   (`fast-bundle.md:124-130`). R2.2 gives all three surfaces a *shared `pricing`
   vocabulary* so they can't drift, but the cross-extension identity binding is
   `composeBlueprint`'s job (M4 / phase #4). Flag: keep `PricingPackSchema`
   blueprint-consumable (it already is — pure data, no per-surface coupling).
5. **[LOW] `cheapest-free` / `fixed-price` semantics need a scope anchor.**
   "Cheapest free across which lines?" and "fixed price for which set?" depend on
   the module's product scope. For single-module recipes, scope = the Function's
   applicable lines; for bundles, scope = the bundle components. Document that
   `pricing` alone is not a product selector — it composes with
   `targeting.product-scope` (R-pack #9) / the bundle's `componentSkus`.
6. **[LOW] `priceEnding` rounding** can produce a *higher* price than the raw
   discount in edge cases; define it as "round the discounted price to the nearest
   x.99 at or below" and test.

---

## 9. Close-out dispositions — `free-gift`, `free-shipping`, `priceEnding` (R2.2 follow-up)

The R2.2 lowering (`compiler/pricing/lower.ts`) emits three `apply` kinds the
shipped discount handler (`extensions/superapp-discount`, commit `042919e`) could
not enforce, because each needs a *different* Shopify Function type. This section
records their honest final disposition after auditing what the handler already
does. **Rule of thumb applied: enforce what is cleanly expressible on the shipped
target; for the rest, warn at compile so nothing silently no-ops, and document the
exact runtime that is still required.**

### 9.1 `free-gift` — ENFORCED at checkout (clean win)

**Disposition: enforced.** A gift-with-purchase is, at checkout, "once the cart
qualifies, make the gift line 100% off." The shipped handler cannot parse
`apply.freeGift`, but it already runs a `buyXGetY` path with a 100%-off reward on
the get arm (`decide_bxgy`). The lowering now **co-emits** an `apply.buyXGetY`
alongside `apply.freeGift`:

- get arm = the gift product id(s) at `reward: { percentageOff: 100 }`;
- buy arm = **empty** (`buyProductIds: []`, `buyQty: 0`);
- the cart is qualified by the rule's threshold **gate**
  (`when.minQty` / `when.minSubtotal`, lowered from `gift.threshold` / `basis`),
  not by a specific buy product.

Handler change (`cart_lines_discounts_generate_run.rs` `decide_bxgy`): an **empty
buy arm** now means "gate already qualified" — reward the get arm with no
buy-quantity requirement and **no prerequisites** (there is no buy line to tie the
reward to). `selectable` gifts list all candidate ids in the get arm, so whichever
gift the shopper adds is freed. Covered by Rust tests
(`free_gift_empty_buy_arm_frees_gift_line_when_gate_met`,
`…_no_op_when_threshold_not_met`, `…_no_op_when_gift_line_absent`,
`…_selectable_frees_whichever_candidate_is_present`) and TS lowering/compiler tests.

**Remaining gap (NOT a Function concern — documented, out of scope here):** the
discount Function can only discount a gift line that is **already in the cart**. It
cannot **auto-ADD** the gift line — that is a storefront theme/JS/Ajax-cart concern
driven by `apply.freeGift.autoAdd` (and the `selectable` chooser UI). So the full
UX is: *storefront auto-adds/offers the gift line* (theme layer) **+** *this
Function makes it free* (now enforced). Only the auto-add half remains, and it
belongs to the storefront widget, not to any Shopify Function. `apply.freeGift`
stays in the emitted config as the presentation/auto-add half; serde drops it in
the handler.

### 9.2 `free-shipping` — `needs_runtime` (new crate required, out of scope)

**Disposition: NOT enforceable on the shipped target; a warning AUDIT is emitted so
it never silently no-ops.** The discount target is
`cart.lines.discounts.generate.run`, whose `CartOperation` set has **no shipping
operation** — it can only add product/order discounts. Waiving shipping requires a
separate Shopify Function of type **`cart.delivery-options.transform.run`**
(SHIPPING_DISCOUNT class), which is a **new wasm crate** not present in
`extensions/`. Standing up that crate is explicitly out of scope for this task
(it is a whole new Function extension).

**Interim (added):** `compileDiscountRules` now scans the lowered rules and emits
an `AUDIT` op `compile.functions.discountRules.kind.unenforced` with a
`free-shipping` detail whenever a `free-shipping` kind is lowered onto this target,
so the publish trail records that the kind does **not** price at checkout rather
than shipping a config that quietly does nothing.

**What a future increment needs to close this:**
- New crate `extensions/superapp-shipping-discount` targeting
  `cart.delivery-options.transform.run`, emitting a
  `DeliveryDiscountsAddOperation` (100% off / free) on qualifying delivery options,
  reading its config from the same `$app:superapp_function_config` metaobject
  pattern (a `superapp-fn-shippingDiscount` handle).
- A new `ModuleType` (e.g. `functions.shippingDiscount`) plus an
  **extension-eligibility registry** entry
  (`packages/core/src/extension-eligibility.ts`): `runtime: 'function'`,
  `functionHandle: 'superapp-shipping-discount'`, `requiresPlan` per Shopify's
  shipping-discount availability, `requiredScopes: ['write_metaobjects', 'write_discounts']`,
  and a `FUNCTION_RUNTIME_HANDLES` mapping. Until that handle appears in the
  deployed-function manifest, `isRuntimeShipped` returns `false` → the type reads
  `needs_runtime` (the registry's honest "not shipped" state), which is exactly the
  status `free-shipping` should carry today.
- Lowering would then route `free-shipping` (via `pricing.mechanism` or a dedicated
  model) to that compiler instead of the product-discount compiler.

Note: the discount-kind granularity (`free-shipping` is one `DISCOUNT_KIND`, not a
`ModuleType`) means the registry entry lives at the *new Function type* level, not
per-kind — the kind simply routes to it.

### 9.3 `priceEnding` — platform limit; one viable Function path documented

**Disposition: NOT enforceable as a discount; a warning AUDIT is emitted.** A
post-calculation `x.99`-style rounding of the *final* price is not expressible as a
`ProductDiscountCandidateValue` — a discount candidate is a percentage or a
fixed-amount off, not "make the resulting price end in .99." There is no
deterministic candidate value that yields an arbitrary post-discount ending, so the
handler ignores it rather than approximating (which could round a price *up*, cf.
§8.6).

**The one viable Function path (documented, not built):** the only way to force an
exact final price is a **cart-transform `lineUpdate.fixedPricePerUnit`** — a
**Shopify Plus-only** `update` operation that sets an explicit per-unit price on a
line. That is the same operation the cart-transform handler's own module note flags
as its follow-up for `fixed-amount` / `fixed-price` on merged lines. So `priceEnding`
is only ever enforceable through the cart-transform mechanism on Plus, by computing
the rounded target price at lowering time and emitting it as a `fixedPricePerUnit`
directive. It is **never** enforceable on the product-discount target.

**Interim (added):** `compileDiscountRules` emits the same
`compile.functions.discountRules.kind.unenforced` warning AUDIT with a `priceEnding`
detail whenever a `priceEnding` hint is lowered onto the discount target, so compile
does not imply an enforcement it lacks. `apply.priceEnding` remains in the config as
a hint the storefront/preview may use for *display* rounding; serde drops it in the
discount handler.

### 9.4 Summary table

| kind | shipped discount target | disposition | remaining runtime |
|------|-------------------------|-------------|-------------------|
| `free-gift` | **enforced** via co-emitted `buyXGetY` 100%-off (empty buy arm = gate-qualified) | ✅ prices at checkout | storefront auto-add of the gift line (theme/JS) — not a Function |
| `free-shipping` | not expressible (no shipping op) → warning AUDIT | ❌ `needs_runtime` | new `cart.delivery-options.transform.run` crate + eligibility entry (§9.2) |
| `priceEnding` | not expressible (not a candidate value) → warning AUDIT | ❌ platform limit | Plus-only cart-transform `fixedPricePerUnit` (§9.3) |

All code changes are additive and back-compat: `apply.freeGift` / `apply.freeShipping`
/ `apply.priceEnding` are still emitted (serde drops the two unenforced ones); legacy
configs without pricing compile byte-identically; the new warning AUDITs only appear
when the corresponding kind is actually lowered.

---

## Summary

- **One additive pack (`pricing`) is the whole vocabulary.** `PricingPackSchema`
  models the atomic discount (`kind/value/min/combinable`) plus tiers, BOGO, gift,
  and mechanism, with **per-tier discount kinds so one tier set can mix
  percentage / cheapest-free / fixed-price / free-shipping** (the Fast-Bundle /
  Kaching parity bar). It attaches as `config.pricing?` on the two shipped Function
  types — nothing else in the recipe union changes.
- **A pure lowering step connects vocabulary → live runtime.**
  `lowerPricingToDiscountRules` / `lowerPricingToCartTransform` deterministically
  translate `pricing` into the *existing* Function config shapes the compilers
  already publish via `FUNCTION_CONFIG_UPSERT`, so the real metaobject runtime
  enforces it with no pipeline rewrite; `pricingToStorefrontJson` feeds the same
  data to the storefront grid so preview and enforcement can't diverge.
- **Fully back-compat + auto-wired to generation.** `pricing` is optional, legacy
  `rules[]`/`bundles[]` are untouched (byte-identical re-publish), and because
  generation derives its JSON Schema straight from the recipe branch, the AI can
  emit `pricing` the moment the schema lands — only prose guidance is added.

**Biggest risk:** the shipped **wasm discount/cart-transform handlers don't yet
parse the new `apply` keys** (`fixedPrice`, `cheapestFree`, `freeShipping`,
`buyXGetY`, `freeGift`). The schema + compiler are ship-safe (unknown keys are
ignored), but the feature is only *real at checkout* once the handler-side changes
land — so the wasm crate must be located and updated in the same PR or an
immediate fast-follow, or merchants author mixed-kind tiers that silently price as
plain percentage.
