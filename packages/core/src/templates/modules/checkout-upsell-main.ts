import type { TemplateEntry } from '../types.js';

/**
 * checkout.upsell templates — IN-CHECKOUT cross-sell / add-to-order.
 *
 * recipeType = checkout.upsell; surface family = purchase.checkout.block.render (the
 * in-checkout offer slot). The shipped generic checkout UI extension reads the
 * persisted `$app:superapp_checkout_upsell` config and renders a single add-to-order
 * offer inside checkout via checkout extensibility. The `checkout.upsell` RecipeSpec
 * member (recipe.ts:724-741) is deliberately minimal: `offerTitle` (the offer heading),
 * `productVariantGid` (the pasted single-variant fallback — `strategy:'manual'` with one
 * variant IS this field), `discountPercent`, and an optional `recommendation` pack that
 * lets the offer CHOOSE its product by strategy instead of a fixed paste.
 *
 * HONESTY (034 no-false-success discipline):
 *  - The STATIC recommendation strategies (`manual` / `collection` / `related` /
 *    `complementary` / `most-expensive-in-cart` / `cheapest-in-cart`) resolve at
 *    checkout via the Storefront API with NO backend service — genuinely live.
 *  - The DYNAMIC strategies (`top-sellers` / `trending` / `buy-it-again` /
 *    `recently-viewed`) need the App-Proxy recommendation service; at checkout they
 *    DEGRADE to the deterministic `fallback` where/until that service resolves them.
 *    Every dynamic entry below therefore sets an honest, resolvable `fallback` (a
 *    static strategy) and a `manualVariantGids` seed so the slot is never left empty —
 *    we do NOT imply the dynamic pick is guaranteed-live.
 *  - In-checkout upsells are a Shopify Plus surface (checkout extensibility); that is a
 *    platform gate surfaced elsewhere, not something these templates can fake around.
 *
 * Grounded in the 028 corpus: Honeycomb Upsell (order-merge add-on / one-fixed-product
 * offer), Candy Rack (frequently-bought-together + Smart Auto-Upsell), Bold AI Upsell
 * (true upsell/upgrade + buy-it-again from order history), ReConvert/Upsell.com
 * (collection-sourced recommendations, exclusion tags, hide-cart-products). No invented
 * strategies, fallbacks, or config keys.
 */
export const CHECKOUT_UPSELL_MAIN_TEMPLATES: TemplateEntry[] = [
  {
    id: 'CHKU-01',
    name: 'Checkout Add-On: Shipping Protection',
    description:
      'In-checkout one-tap add-on offering shipping protection (or a warranty) as a single fixed product merged into the order — Honeycomb-style order-merge upsell.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['honeycomb', 'upsell', 'checkout', 'add-on', 'order-merge', 'protection'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Add-On: Shipping Protection',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Add shipping protection?',
        productVariantGid: 'gid://shopify/ProductVariant/44880010101010',
        discountPercent: 0,
      },
    },
  },
  {
    id: 'CHKU-02',
    name: 'Checkout Cross-Sell: Frequently Bought Together',
    description:
      'In-checkout cross-sell that offers a complementary product for what is already in the cart — Candy Rack "frequently bought together", resolved statically at checkout.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['candy-rack', 'cross-sell', 'checkout', 'complementary', 'frequently-bought-together'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Cross-Sell: Frequently Bought Together',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Complete the set',
        productVariantGid: 'gid://shopify/ProductVariant/44880010202020',
        discountPercent: 10,
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          strategy: 'complementary',
          manualVariantGids: ['gid://shopify/ProductVariant/44880010202020'],
          productLimit: 1,
          hideCartProducts: true,
          fallback: 'manual',
        },
      },
    },
  },
  {
    id: 'CHKU-03',
    name: 'Checkout Upgrade: Premium Variant Swap',
    description:
      'In-checkout true-upsell that offers the higher-value variant of a cart item at a small discount — Bold AI Upsell upgrade/replace pattern presented as an add-to-order.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['bold', 'upsell', 'checkout', 'upgrade', 'true-upsell', 'variant'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Upgrade: Premium Variant Swap',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Upgrade to the Pro size',
        productVariantGid: 'gid://shopify/ProductVariant/44880010303030',
        discountPercent: 15,
      },
    },
  },
  {
    id: 'CHKU-04',
    name: 'Checkout Cross-Sell: From a Collection',
    description:
      'In-checkout cross-sell that draws a single random offer from a chosen collection, excluding sale tags and items already in the cart — ReConvert collection-source recommendation.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['reconvert', 'cross-sell', 'checkout', 'collection', 'recommendations'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Cross-Sell: From a Collection',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'You might also like',
        productVariantGid: 'gid://shopify/ProductVariant/44880010404040',
        discountPercent: 10,
        recommendation: {
          strategy: 'collection',
          collectionGid: 'gid://shopify/Collection/288833440404',
          collectionRandom: true,
          manualVariantGids: ['gid://shopify/ProductVariant/44880010404040'],
          productLimit: 1,
          excludeTags: ['clearance', 'final-sale'],
          hideCartProducts: true,
          fallback: 'collection',
        },
      },
    },
  },
  {
    id: 'CHKU-05',
    name: 'Checkout Smart Auto-Upsell: Trending',
    description:
      'In-checkout Smart Auto-Upsell that offers a trending product chosen by the recommendation service, degrading to a related-product pick where the service is unavailable — Candy Rack Smart upsell.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['candy-rack', 'upsell', 'checkout', 'smart', 'trending', 'ai'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Smart Auto-Upsell: Trending',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Trending with your order',
        productVariantGid: 'gid://shopify/ProductVariant/44880010505050',
        discountPercent: 5,
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          // DYNAMIC strategy — resolves via the App-Proxy recommendation service and
          // degrades to `related` (static, no service) where/until it is unavailable.
          strategy: 'trending',
          manualVariantGids: ['gid://shopify/ProductVariant/44880010505050'],
          productLimit: 1,
          hideCartProducts: true,
          fallback: 'related',
        },
      },
    },
  },
  {
    id: 'CHKU-06',
    name: 'Checkout Replenishment: Buy It Again',
    description:
      'In-checkout upsell that re-offers a product from the customer order history, falling back to a merchant-picked variant when no history or service is available — Bold buy-it-again replenishment.',
    category: 'STOREFRONT_UI',
    type: 'checkout.upsell',
    icon: 'checkout',
    tags: ['bold', 'upsell', 'checkout', 'buy-it-again', 'replenishment', 'ai'],
    spec: {
      type: 'checkout.upsell',
      name: 'Checkout Replenishment: Buy It Again',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Restock a favorite',
        productVariantGid: 'gid://shopify/ProductVariant/44880010606060',
        discountPercent: 0,
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          // DYNAMIC strategy (order-history ranking) — degrades to the merchant-picked
          // `manual` variant when there is no history or the service is unavailable.
          strategy: 'buy-it-again',
          manualVariantGids: ['gid://shopify/ProductVariant/44880010606060'],
          productLimit: 1,
          hideCartProducts: true,
          fallback: 'manual',
        },
      },
    },
  },
];
