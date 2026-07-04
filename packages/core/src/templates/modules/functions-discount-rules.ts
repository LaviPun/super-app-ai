/**
 * functions.discountRules — surface-coverage authoring unit (034).
 *
 * Surface/target: cart.lines.discounts.generate.run (the unified product/order
 * Discount Function). 14 templates spanning the pricing vocabulary the discount
 * corpus demands — flat / tiered volume / spend-to-save / mix-and-match BOGO /
 * gift-with-purchase / cheapest-free — grounded in the real merchant controls of
 * Discount Ninja Promo Engine, Bold Discounts, Kaching Bundles, and Bold
 * Memberships (customer-tag member pricing).
 *
 * Two authoring modes are used, both parsing against the `functions.discountRules`
 * member of RecipeSpecSchema (recipe.ts):
 *  - legacy `config.rules[]` ({when:{customerTags?,minSubtotal?,skuIn?}, apply:{
 *    percentageOff?|fixedAmountOff?}}) for flat / SKU / tag / spend rules; and
 *  - `config.pricing` (PricingPack, R2.2) for tiered / bogo / gift / cheapest-free
 *    / fixed-price, which SUPERSEDES `rules[]` and lowers into the Function config.
 *
 * Honesty: only resolvable vocab is used. GID references use the canonical
 * `gid://shopify/Product|Collection/<id>` form the schema regex enforces. No POS
 * pricing, no external-billing perk, no fabricated runtime — the customer-tag /
 * member gates degrade to "no match" until the tag exists, they never imply a
 * guaranteed live discount.
 */
import type { TemplateEntry } from '../types.js';

export const FUNCTIONS_DISCOUNT_RULES_TEMPLATES: TemplateEntry[] = [
  // ── FN-DISC-01 — Spend-to-Save tiered cart discount (Discount Ninja "Spend-to-Save Tiers") ──
  {
    id: 'FN-DISC-01',
    name: 'Spend-to-Save Cart Tiers',
    description:
      'Automatic order discount that grows with cart subtotal — buy-more-save-more tiers priced at checkout by the discount Function.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount-ninja', 'discounts', 'tiered', 'spend-to-save', 'cart', 'order'],
    spec: {
      type: 'functions.discountRules',
      name: 'Spend-to-Save Cart Tiers',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { minSubtotal: 75 }, apply: { percentageOff: 5 } },
          { when: { minSubtotal: 150 }, apply: { percentageOff: 10 } },
          { when: { minSubtotal: 300 }, apply: { percentageOff: 15 } },
        ],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'cart-value',
            rows: [
              { threshold: 75, discount: { kind: 'percentage', value: 5 }, title: 'Spend $75', subtitle: 'Save 5%', highlighted: false, preSelected: false },
              {
                threshold: 150,
                discount: { kind: 'percentage', value: 10 },
                title: 'Spend $150',
                subtitle: 'Save 10%',
                badge: 'Most Popular',
                highlighted: true,
                preSelected: false,
              },
              { threshold: 300, discount: { kind: 'percentage', value: 15 }, title: 'Spend $300', subtitle: 'Save 15%', highlighted: false, preSelected: false },
            ],
          },
          stacking: {
            combinable: false,
            combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
            order: 'after',
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
        },
      },
    },
  },

  // ── FN-DISC-02 — Quantity-break volume tiers (Kaching "Quantity Break" grid) ──
  {
    id: 'FN-DISC-02',
    name: 'Quantity Break Volume Tiers',
    description:
      'Buy-more-save-more quantity breaks on eligible products — Amazon-style tier grid pricing applied as a checkout-level product discount.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['kaching-bundles', 'discounts', 'volume', 'quantity-break', 'tiered', 'product'],
    spec: {
      type: 'functions.discountRules',
      name: 'Quantity Break Volume Tiers',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 5 } }],
        combineWithOtherDiscounts: true,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'quantity',
            rows: [
              { threshold: 2, discount: { kind: 'percentage', value: 5 }, title: 'Buy 2', subtitle: 'Save 5%', highlighted: false, preSelected: false },
              {
                threshold: 3,
                discount: { kind: 'percentage', value: 10 },
                title: 'Buy 3',
                subtitle: 'Save 10%',
                badge: 'Best Value',
                highlighted: true,
                preSelected: true,
              },
              { threshold: 5, discount: { kind: 'percentage', value: 15 }, title: 'Buy 5+', subtitle: 'Save 15%', highlighted: false, preSelected: false },
            ],
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-03 — Mix-and-match BOGO (Discount Ninja "Mix-and-Match BOGO" / Kaching BXGY) ──
  {
    id: 'FN-DISC-03',
    name: 'Mix-and-Match BOGO',
    description:
      'Buy any 1 from a collection, get the next one free — mix-and-match buy-X-get-Y priced by the discount Function.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount-ninja', 'discounts', 'bogo', 'buy-x-get-y', 'mix-and-match', 'collection'],
    spec: {
      type: 'functions.discountRules',
      name: 'Mix-and-Match BOGO',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 100 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'bogo',
          mechanism: 'shopify-function-discount',
          bogo: {
            buy: {
              productIds: [],
              collectionIds: ['gid://shopify/Collection/111111111'],
              quantity: 1,
            },
            get: {
              productIds: [],
              collectionIds: ['gid://shopify/Collection/111111111'],
              quantity: 1,
              discount: { kind: 'percentage', value: 100 },
            },
            showAsFree: true,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-04 — Buy 2 Get 1 half-off (multi-tier BOGO with partial reward) ──
  {
    id: 'FN-DISC-04',
    name: 'Buy 2 Get 1 Half Off',
    description:
      'Buy two eligible products and take 50% off a third — buy-X-get-Y with a partial-percentage reward arm.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount-ninja', 'discounts', 'bogo', 'buy-x-get-y', 'promotion', 'product'],
    spec: {
      type: 'functions.discountRules',
      name: 'Buy 2 Get 1 Half Off',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 50 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'bogo',
          mechanism: 'shopify-function-discount',
          bogo: {
            buy: {
              productIds: ['gid://shopify/Product/222222221', 'gid://shopify/Product/222222222'],
              collectionIds: [],
              quantity: 2,
            },
            get: {
              productIds: ['gid://shopify/Product/222222223'],
              collectionIds: [],
              quantity: 1,
              discount: { kind: 'percentage', value: 50 },
            },
            showAsFree: false,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-05 — Gift with purchase over threshold (Discount Ninja "Auto Free Gift" / GWP) ──
  {
    id: 'FN-DISC-05',
    name: 'Free Gift Over $100',
    description:
      'Auto-add a free gift product when the cart crosses a spend threshold — gift-with-purchase priced at $0 by the discount Function.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'gift',
    tags: ['discount-ninja', 'discounts', 'gift-with-purchase', 'gwp', 'threshold', 'cart'],
    spec: {
      type: 'functions.discountRules',
      name: 'Free Gift Over $100',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 100 }, apply: { percentageOff: 100 } }],
        combineWithOtherDiscounts: true,
        pricing: {
          model: 'gift',
          mechanism: 'shopify-function-discount',
          gift: {
            productIds: ['gid://shopify/Product/333333331'],
            threshold: 100,
            basis: 'cart-value',
            autoAdd: true,
            selectable: false,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-06 — Choose-your-gift (Discount Ninja "Choose Your Gift" — selectable GWP) ──
  {
    id: 'FN-DISC-06',
    name: 'Choose Your Free Gift',
    description:
      'Spend past a threshold and pick one free gift from a curated set — selectable gift-with-purchase, priced free at checkout.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'gift',
    tags: ['discount-ninja', 'discounts', 'gift-with-purchase', 'gwp', 'selectable', 'cart'],
    spec: {
      type: 'functions.discountRules',
      name: 'Choose Your Free Gift',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 150 }, apply: { percentageOff: 100 } }],
        combineWithOtherDiscounts: true,
        pricing: {
          model: 'gift',
          mechanism: 'shopify-function-discount',
          gift: {
            productIds: [
              'gid://shopify/Product/333333341',
              'gid://shopify/Product/333333342',
              'gid://shopify/Product/333333343',
            ],
            threshold: 150,
            basis: 'cart-value',
            autoAdd: false,
            selectable: true,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-07 — Cheapest-item-free mix & match (Kaching / Discount Ninja "cheapest free") ──
  {
    id: 'FN-DISC-07',
    name: 'Buy 3, Cheapest Free',
    description:
      'Add three eligible items and the cheapest one is free — cheapest-free mix-and-match tier applied by the discount Function.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['kaching-bundles', 'discounts', 'cheapest-free', 'mix-and-match', 'quantity-break', 'promotion'],
    spec: {
      type: 'functions.discountRules',
      name: 'Buy 3, Cheapest Free',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 33 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'quantity',
            rows: [
              {
                threshold: 3,
                discount: { kind: 'cheapest-free', value: 0, cheapestFreeCount: 1 },
                title: 'Buy 3',
                subtitle: 'Cheapest is free',
                badge: '3 for 2',
                highlighted: true,
                preSelected: false,
              },
            ],
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-08 — Buy 4 pay for 3 (cheapest-free, multi-tier) ──
  {
    id: 'FN-DISC-08',
    name: 'Buy 4 Pay for 3',
    description:
      'Two mix-and-match tiers — buy 4 get the cheapest free, buy 6 get the two cheapest free — priced by the discount Function.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['kaching-bundles', 'discounts', 'cheapest-free', 'volume', 'tiered', 'mix-and-match'],
    spec: {
      type: 'functions.discountRules',
      name: 'Buy 4 Pay for 3',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 25 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'quantity',
            rows: [
              {
                threshold: 4,
                discount: { kind: 'cheapest-free', value: 0, cheapestFreeCount: 1 },
                title: 'Buy 4',
                subtitle: 'Pay for 3',
                highlighted: false,
                preSelected: false,
              },
              {
                threshold: 6,
                discount: { kind: 'cheapest-free', value: 0, cheapestFreeCount: 2 },
                title: 'Buy 6',
                subtitle: 'Pay for 4',
                badge: 'Best Value',
                highlighted: true,
                preSelected: false,
              },
            ],
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-09 — Volume tiers to a specific price (Kaching "specific fixed price") ──
  {
    id: 'FN-DISC-09',
    name: 'Volume Fixed-Price Tiers',
    description:
      'Quantity tiers that set an exact bundle price (e.g. 2 for $30, 3 for $40) — fixed-price volume breaks priced at checkout.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['kaching-bundles', 'discounts', 'volume', 'fixed-price', 'tiered', 'quantity-break'],
    spec: {
      type: 'functions.discountRules',
      name: 'Volume Fixed-Price Tiers',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { fixedAmountOff: 5 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'quantity',
            rows: [
              {
                threshold: 2,
                discount: { kind: 'fixed-price', value: 30 },
                title: '2 for $30',
                badge: 'Popular',
                highlighted: true,
                preSelected: true,
              },
              { threshold: 3, discount: { kind: 'fixed-price', value: 40 }, title: '3 for $40', highlighted: false, preSelected: false },
            ],
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-10 — Flat percentage on a collection (Discount Ninja "Percentage Discount") ──
  {
    id: 'FN-DISC-10',
    name: 'Collection Percentage Sale',
    description:
      'A flat automatic percentage off a chosen collection — the classic single-rate product discount applied at checkout.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['bold-discounts', 'discounts', 'percentage', 'sale', 'collection', 'product'],
    spec: {
      type: 'functions.discountRules',
      name: 'Collection Percentage Sale',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { percentageOff: 20 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-discount',
          discount: { kind: 'percentage', value: 20 },
          gate: {
            prerequisiteProductIds: [],
            prerequisiteCollectionIds: ['gid://shopify/Collection/444444441'],
            customerTags: [],
          },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-11 — Fixed-amount clearance with .99 price ending (Bold "Override Cents") ──
  {
    id: 'FN-DISC-11',
    name: 'Clearance Dollars-Off (.99 ending)',
    description:
      'A fixed dollar amount off with a forced .99 price ending — the Bold "override cents" clearance pattern, priced at checkout.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['bold-discounts', 'discounts', 'fixed-amount', 'clearance', 'price-ending', 'sale'],
    spec: {
      type: 'functions.discountRules',
      name: 'Clearance Dollars-Off',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: {}, apply: { fixedAmountOff: 10 } }],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-discount',
          discount: { kind: 'fixed-amount', value: 10, priceEnding: 0.99 },
          gate: {
            prerequisiteProductIds: [],
            prerequisiteCollectionIds: ['gid://shopify/Collection/555555551'],
            customerTags: [],
          },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-12 — VIP / member customer-tag discount (Discount Ninja tag audience; Bold member perk) ──
  {
    id: 'FN-DISC-12',
    name: 'VIP Member Discount',
    description:
      'An exclusive automatic percentage for customers carrying a VIP/member tag — the member perk degrades to no discount until the tag is present.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['bold-memberships', 'discounts', 'vip', 'member', 'customer-tag', 'loyalty'],
    spec: {
      type: 'functions.discountRules',
      name: 'VIP Member Discount',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: { customerTags: ['vip', 'member'] }, apply: { percentageOff: 15 } }],
        combineWithOtherDiscounts: true,
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-discount',
          discount: { kind: 'percentage', value: 15 },
          gate: {
            prerequisiteProductIds: [],
            prerequisiteCollectionIds: [],
            customerTags: ['vip', 'member'],
          },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-13 — Spend $X get $Y off for tagged wholesale customers ──
  {
    id: 'FN-DISC-13',
    name: 'Wholesale Spend-X-Get-Y',
    description:
      'Wholesale-tagged buyers who spend past a subtotal threshold get a fixed amount off the order — a tag-gated spend-X-get-Y order discount.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount-ninja', 'discounts', 'wholesale', 'spend-x-get-y', 'customer-tag', 'order'],
    spec: {
      type: 'functions.discountRules',
      name: 'Wholesale Spend-X-Get-Y',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { customerTags: ['wholesale'], minSubtotal: 500 }, apply: { fixedAmountOff: 50 } },
          { when: { customerTags: ['wholesale'], minSubtotal: 1000 }, apply: { fixedAmountOff: 125 } },
        ],
        combineWithOtherDiscounts: false,
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-discount',
          tiers: {
            basis: 'cart-value',
            rows: [
              { threshold: 500, discount: { kind: 'fixed-amount', value: 50 }, title: 'Spend $500', subtitle: '$50 off', highlighted: false, preSelected: false },
              {
                threshold: 1000,
                discount: { kind: 'fixed-amount', value: 125 },
                title: 'Spend $1,000',
                subtitle: '$125 off',
                highlighted: true,
                preSelected: false,
              },
            ],
          },
          gate: {
            prerequisiteProductIds: [],
            prerequisiteCollectionIds: [],
            customerTags: ['wholesale'],
          },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },

  // ── FN-DISC-14 — Spend-X, get a free gift from a collection with a usage cap ──
  {
    id: 'FN-DISC-14',
    name: 'Spend $200 Get a Bonus Item',
    description:
      'Cross the $200 spend threshold and auto-receive a bonus item, capped by a per-promotion usage limit — gift-with-purchase priced free at checkout.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'gift',
    tags: ['discount-ninja', 'discounts', 'gift-with-purchase', 'gwp', 'threshold', 'usage-limit'],
    spec: {
      type: 'functions.discountRules',
      name: 'Spend $200 Get a Bonus Item',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: { minSubtotal: 200 }, apply: { percentageOff: 100 } }],
        combineWithOtherDiscounts: true,
        pricing: {
          model: 'gift',
          mechanism: 'shopify-function-discount',
          gift: {
            productIds: ['gid://shopify/Product/666666661'],
            threshold: 200,
            basis: 'cart-value',
            autoAdd: true,
            selectable: false,
          },
          gate: {
            prerequisiteProductIds: [],
            prerequisiteCollectionIds: [],
            customerTags: [],
            usageLimit: 500,
          },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
      },
    },
  },
];
