import type { TemplateEntry } from '../types.js';

/**
 * functions.cartTransform templates — the cart.transform.run Function surface.
 *
 * Grounded in the bundle corpus (028-recipe-vocabulary/research/plugins):
 *  - kaching-bundles / fast-bundle — the "Cart Transform / BAP" model: a single
 *    clean bundle line whose components are expanded/merged at checkout, plus
 *    tiered quantity-break pricing that can MIX discount kinds per row.
 *  - bold-bundles — fixed-bundle price + "override cent values" (priceEnding),
 *    percentage bundle discount, group vs mix-&-match.
 *  - moon-bundles / wide-bundles / bundler — build-a-box, mix-&-match "pick N",
 *    volume tiers, gift-with-purchase.
 *
 * Vocabulary is authored ONLY against the live schema (recipe.ts
 * functions.cartTransform member): `config.mode` ∈ CART_TRANSFORM_MODES
 * (BUNDLE / MERGE / UNBUNDLE), `config.bundles[]` (title / componentSkus 2-20 /
 * bundleSku, optional per-bundle `pricing`), `config.fallbackTheme`, and a
 * root `config.pricing` PricingPack. The `pricing` pack is lowered by the
 * cart-transform compiler (mechanism 'shopify-function-cart-transform');
 * `priceEnding` forces price endings (Bold "override cent values").
 *
 * Honesty: cart_transform requires Shopify Plus — every template keeps the
 * `fallbackTheme` guidance line (a theme-only notice on non-Plus stores, NOT a
 * fake cart transform).
 */
export const FUNCTIONS_CART_TRANSFORM_TEMPLATES: TemplateEntry[] = [
  // FN-CART-01 — Fixed bundle merged into one clean cart line (Fast Bundle "BAP" / Kaching)
  {
    id: 'FN-CART-01',
    name: 'Fixed Bundle — Single Merged Line',
    description: 'Merges a fixed set of component SKUs into one clean bundle line on the cart page, expanding to real components at checkout — the Fast Bundle / Kaching cart-transform model.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['fast-bundle', 'bundles', 'cart-transform', 'fixed-bundle', 'cart', 'merge'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Fixed Bundle — Single Merged Line',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Complete Starter Kit',
            componentSkus: ['STARTER-CLEANSER', 'STARTER-TONER', 'STARTER-MOISTURIZER'],
            bundleSku: 'BUNDLE-STARTER-KIT',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Fixed bundle pricing applies via lineUpdate on Shopify Plus; on other plans it is applied automatically as a bundle discount at checkout.',
        },
      },
    },
  },

  // FN-CART-02 — Fixed bundle price via priceEnding (Bold "override cent values")
  {
    id: 'FN-CART-02',
    name: 'Fixed-Price Bundle (.99 Ending)',
    description: 'Sells a merged bundle at one fixed price forced to a .99 ending — the Bold Bundles "fixed bundle price + override cent values" pattern lowered into a cart-transform Function.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bold-bundles', 'bundles', 'cart-transform', 'fixed-price', 'price-ending', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Fixed-Price Bundle (.99 Ending)',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Weekend Getaway Set',
            componentSkus: ['TRAVEL-BAG', 'TRAVEL-KIT', 'TRAVEL-PILLOW'],
            bundleSku: 'BUNDLE-GETAWAY',
          },
        ],
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-cart-transform',
          discount: {
            kind: 'fixed-price',
            value: 89,
            priceEnding: 0.99,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Fixed bundle pricing requires Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-03 — Mix-and-match "pick any N from collection" merged bundle (Moon / Bold M&M)
  {
    id: 'FN-CART-03',
    name: 'Mix & Match — Pick Any 3',
    description: 'Lets shoppers pick any 3 items from a curated set and merges them into a single discounted bundle line at a percentage off — the Moon / Bold mix-and-match model.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['moon-bundles', 'bundles', 'cart-transform', 'mix-match', 'build-a-box', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Mix & Match — Pick Any 3',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Build Your Own 3-Pack',
            componentSkus: ['MM-CANDLE-A', 'MM-CANDLE-B', 'MM-CANDLE-C', 'MM-CANDLE-D', 'MM-CANDLE-E'],
            bundleSku: 'BUNDLE-MM-3PACK',
            pricing: {
              model: 'single',
              mechanism: 'shopify-function-cart-transform',
              discount: { kind: 'percentage', value: 20 },
              gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
              stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
            },
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Mix-and-match bundling requires Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-04 — Tiered quantity-break bundle with mixed discount kinds per tier (Kaching / Fast Bundle)
  {
    id: 'FN-CART-04',
    name: 'Volume Bundle — Tiered Quantity Breaks',
    description: 'Merges multi-buy quantity-break tiers into a bundle line, mixing percentage and fixed-price rewards across tiers — the Kaching / Fast Bundle "buy more, save more" ladder.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['kaching-bundles', 'bundles', 'cart-transform', 'quantity-break', 'tiered', 'volume'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Volume Bundle — Tiered Quantity Breaks',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Restock Multipack',
            componentSkus: ['SUPP-PROTEIN', 'SUPP-PROTEIN'],
            bundleSku: 'BUNDLE-PROTEIN-MULTI',
          },
        ],
        pricing: {
          model: 'tiered',
          mechanism: 'shopify-function-cart-transform',
          tiers: {
            basis: 'quantity',
            rows: [
              { threshold: 2, discount: { kind: 'percentage', value: 10 }, title: 'Buy 2', badge: 'Save 10%', highlighted: false, preSelected: false },
              { threshold: 3, discount: { kind: 'percentage', value: 15 }, title: 'Buy 3', badge: 'Most Popular', highlighted: true, preSelected: true },
              { threshold: 4, discount: { kind: 'fixed-price', value: 99, priceEnding: 0.99 }, title: 'Buy 4', badge: 'Best Value', highlighted: false, preSelected: false },
            ],
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Volume bundle pricing requires Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-05 — Frequently-bought-together merged bundle at a fixed price (Amazon-style)
  {
    id: 'FN-CART-05',
    name: 'Frequently Bought Together',
    description: 'Merges a hero product with its two most-common add-ons into one bundle line at a fixed savings price — the Amazon-style "frequently bought together" cross-sell bundle.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['fast-bundle', 'bundles', 'cart-transform', 'frequently-bought-together', 'cross-sell', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Frequently Bought Together',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Camera + Lens + Case',
            componentSkus: ['CAM-BODY-X100', 'CAM-LENS-35MM', 'CAM-CASE-LEATHER'],
            bundleSku: 'BUNDLE-FBT-CAM',
            pricing: {
              model: 'single',
              mechanism: 'shopify-function-cart-transform',
              discount: { kind: 'fixed-amount', value: 75 },
              gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
              stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
            },
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Bundle savings require Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-06 — Gift-with-purchase merged bundle (Moon / Kaching GWP)
  {
    id: 'FN-CART-06',
    name: 'Gift With Purchase Bundle',
    description: 'Merges a qualifying product with a free gift SKU into one bundle line, pricing the gift arm free above a cart-value threshold — the Moon / Kaching gift-with-purchase reward.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['moon-bundles', 'bundles', 'cart-transform', 'gift-with-purchase', 'gwp', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Gift With Purchase Bundle',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Signature Serum + Free Travel Size',
            componentSkus: ['SERUM-FULL-50ML', 'SERUM-TRAVEL-10ML'],
            bundleSku: 'BUNDLE-GWP-SERUM',
          },
        ],
        pricing: {
          model: 'gift',
          mechanism: 'shopify-function-cart-transform',
          gift: {
            productIds: ['gid://shopify/Product/7200000000001'],
            threshold: 60,
            basis: 'cart-value',
            autoAdd: true,
            selectable: false,
          },
          gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
          stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
        },
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Gift bundling requires Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-07 — Build-a-box fixed price with combinable stacking (Wide / Bundler)
  {
    id: 'FN-CART-07',
    name: 'Build-a-Box — Fixed Box Price',
    description: 'Merges a build-a-box selection into one line sold at a flat box price, stackable with product discounts — the Wide Bundles / Bundler build-a-box model.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['wide-bundles', 'bundles', 'cart-transform', 'build-a-box', 'fixed-price', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Build-a-Box — Fixed Box Price',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Build Your Snack Box',
            componentSkus: ['SNACK-A', 'SNACK-B', 'SNACK-C', 'SNACK-D'],
            bundleSku: 'BUNDLE-SNACKBOX',
          },
        ],
        pricing: {
          model: 'single',
          mechanism: 'shopify-function-cart-transform',
          discount: { kind: 'fixed-price', value: 24, priceEnding: 0.95 },
          gate: { minQuantity: 4, customerTags: [], prerequisiteProductIds: [], prerequisiteCollectionIds: [] },
          stacking: {
            combinable: true,
            combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: false },
            order: 'after',
          },
        },
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Build-a-box pricing requires Shopify Plus.',
        },
      },
    },
  },

  // FN-CART-08 — Multi-bundle catalog: several fixed bundles in one cart-transform module
  {
    id: 'FN-CART-08',
    name: 'Bundle Catalog — Multiple Kits',
    description: 'Registers several fixed bundle kits in one cart-transform module, each merging to its own clean line — the multi-deal catalog a bundle app publishes for a whole store.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['kaching-bundles', 'bundles', 'cart-transform', 'multi-bundle', 'catalog', 'cart'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Bundle Catalog — Multiple Kits',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'MERGE',
        bundles: [
          {
            title: 'Coffee Lovers Kit',
            componentSkus: ['COFFEE-BEANS', 'COFFEE-MUG', 'COFFEE-FILTER'],
            bundleSku: 'BUNDLE-COFFEE',
            pricing: {
              model: 'single',
              mechanism: 'shopify-function-cart-transform',
              discount: { kind: 'percentage', value: 15 },
              gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
              stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
            },
          },
          {
            title: 'Tea Ritual Kit',
            componentSkus: ['TEA-LEAVES', 'TEA-INFUSER', 'TEA-CUP'],
            bundleSku: 'BUNDLE-TEA',
            pricing: {
              model: 'single',
              mechanism: 'shopify-function-cart-transform',
              discount: { kind: 'fixed-price', value: 39, priceEnding: 0.99 },
              gate: { prerequisiteProductIds: [], prerequisiteCollectionIds: [], customerTags: [] },
              stacking: { combinable: true, combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, order: 'after' },
            },
          },
          {
            title: 'Cocoa Comfort Kit',
            componentSkus: ['COCOA-POWDER', 'COCOA-MARSHMALLOW', 'COCOA-MUG'],
            bundleSku: 'BUNDLE-COCOA',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Bundle catalog pricing requires Shopify Plus.',
        },
      },
    },
  },
];
