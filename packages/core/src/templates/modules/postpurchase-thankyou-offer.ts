import type { TemplateEntry } from '../types.js';

/**
 * Post-purchase / thank-you one-click offer templates (recipeType `postPurchase.offer`).
 *
 * Surface: the Shopify post-purchase extension page (shown after payment, before the
 * order-confirmation / thank-you page) and the thank-you-block target
 * (`purchase.thank-you.block.render`). The offer is charged against the buyer's
 * already-vaulted payment method — one tap, no re-checkout, no re-auth.
 *
 * Grounded in the 028 corpus for this surface:
 *  - reconvert.md (Upsell.com / ReConvert): post-purchase Product Upsell, Product
 *    Recommendations (Shopify Recommendations intent=related|complementary, specific
 *    product, collection±random, most/cheapest-in-cart), Birthday Collector, review /
 *    social-proof integrations, "compare-at" strike-through pricing.
 *  - zipify-ocu.md: post-purchase upsell + downsell (max 2 offers/order), multi-product
 *    buy-boxes, AI "best-selling products" dynamic offers, free-shipping incentive.
 *  - candy-rack.md: native post-purchase upsell on all plans — manual upsell, Smart
 *    (AI) auto-upsell, true upgrade (swap for higher-value variant), product add-on
 *    (warranty / shipping protection / gift wrap), free gift.
 *
 * VOCAB HONESTY: the `postPurchase.offer` config is intentionally small —
 * `offerTitle` (required), optional `productVariantGid` (a real pasted variant GID),
 * optional `message`, and the optional `recommendation` pack. Where a template wants a
 * DYNAMIC pick (best-sellers / buy-it-again), `recommendation.strategy` is a dynamic
 * strategy WITH a deterministic `fallback` so it never renders an empty slot — matching
 * how the corpus degrades a dynamic offer. The corpus's Birthday-Collector / survey /
 * review-request capture-input widgets are NOT expressible as buyer-input on this type
 * (post-purchase has no write-back field vocab), so those templates carry the ask as
 * offer copy only — they surface the intent without implying a live captured value.
 */
export const POSTPURCHASE_THANKYOU_OFFER_TEMPLATES: TemplateEntry[] = [
  // PPO-01 — ReConvert/Upsell.com core: a fixed one-click upsell of a specific product
  // at a set discount (Discount = %/fixed applied to the offered line; "compare-at"
  // strike-through pricing). A pasted variant GID = recommendation.strategy 'manual'.
  {
    id: 'PPO-01',
    name: 'Post-Purchase One-Click Upsell',
    description:
      'One-click upsell of a specific product on the post-purchase page — added to the just-paid order at a set discount, no re-checkout.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['reconvert', 'post-purchase', 'upsell', 'one-click', 'thank-you'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase One-Click Upsell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7C3AED' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        offerTitle: 'Wait — add this at 15% off',
        productVariantGid: 'gid://shopify/ProductVariant/40000000000001',
        message:
          "One tap adds it to the order you just placed — same shipment, no re-entering payment. Offer ends when you leave this page.",
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          hideCartProducts: false,
          strategy: 'manual',
          manualVariantGids: ['gid://shopify/ProductVariant/40000000000001'],
          productLimit: 1,
          fallback: 'related',
        },
      },
    },
  },

  // PPO-02 — Candy Rack "Product add-on" (warranty / shipping protection / gift wrap).
  // A fixed protection-plan variant; the classic post-purchase add-on offer.
  {
    id: 'PPO-02',
    name: 'Post-Purchase Warranty / Protection Add-On',
    description:
      'Offer an extended warranty or shipping-protection plan on the post-purchase page — a low-friction add-on tacked onto the paid order.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['candy-rack', 'post-purchase', 'warranty', 'add-on', 'protection'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase Warranty / Protection Add-On',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1F3A2E' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        offerTitle: 'Protect your order for 2 years',
        productVariantGid: 'gid://shopify/ProductVariant/40000000000002',
        message:
          'Add an extended warranty and shipping protection for peace of mind — one tap, charged to the card you just used.',
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          hideCartProducts: false,
          strategy: 'manual',
          manualVariantGids: ['gid://shopify/ProductVariant/40000000000002'],
          productLimit: 1,
          fallback: 'related',
        },
      },
    },
  },

  // PPO-03 — ReConvert "Product Recommendations" widget, Shopify Recommendations with
  // intent=complementary. STATIC strategy (resolves via Storefront API, no service).
  {
    id: 'PPO-03',
    name: 'Post-Purchase Complementary Cross-Sell',
    description:
      'Cross-sell complementary products on the post-purchase page using Shopify product recommendations (goes-well-with), seeded from the order.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['reconvert', 'post-purchase', 'cross-sell', 'recommendations', 'complementary'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase Complementary Cross-Sell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#DB2777' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        offerTitle: 'Goes great with what you just bought',
        message: 'Pair it now and it ships together — one tap to add, no second checkout.',
        recommendation: {
          manualVariantGids: [],
          collectionRandom: false,
          excludeTags: [],
          strategy: 'complementary',
          productLimit: 3,
          hideCartProducts: true,
          fallback: 'related',
        },
      },
    },
  },

  // PPO-04 — Zipify OCU / Candy Rack Smart (AI) auto-upsell: a DYNAMIC best-sellers pick
  // resolved at runtime by the recommendation service, degrading to a `collection`
  // fallback so the post-purchase slot is never empty (no fake "AI" result on failure).
  {
    id: 'PPO-04',
    name: 'Post-Purchase Best-Sellers Auto-Upsell',
    description:
      'Auto-upsell the store best-sellers on the post-purchase page (dynamic), with a curated collection fallback so the offer is never empty.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['zipify-ocu', 'post-purchase', 'upsell', 'best-sellers', 'ai'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase Best-Sellers Auto-Upsell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0EA5E9' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        offerTitle: 'Customers also grab these',
        message: 'Our most-loved add-ons, added to your order in one tap.',
        recommendation: {
          manualVariantGids: [],
          collectionRandom: false,
          excludeTags: [],
          // Post-purchase has no App-Proxy access — top-sellers would always degrade
          // to fallback; source directly from the merchant's best-sellers collection.
          strategy: 'collection',
          collectionGid: 'gid://shopify/Collection/30000000000001',
          productLimit: 3,
          hideCartProducts: true,
          fallback: 'collection',
        },
      },
    },
  },

  // PPO-05 — Zipify OCU downsell / free-shipping incentive: the second post-purchase
  // offer (max 2/order) — a cheaper, discounted single product framed as the "last
  // chance" downsell after a declined upsell. Fixed variant = manual strategy.
  {
    id: 'PPO-05',
    name: 'Post-Purchase Downsell Offer',
    description:
      'A lower-commitment downsell shown as the second post-purchase offer — a discounted single product framed as a last-chance add.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['zipify-ocu', 'post-purchase', 'downsell', 'discount', 'last-chance'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase Downsell Offer',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#DC2626' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        offerTitle: 'Last chance: 20% off this one',
        productVariantGid: 'gid://shopify/ProductVariant/40000000000005',
        message:
          "Not the full bundle? Add just this at 20% off — one tap, same order, and it's gone when you leave.",
        recommendation: {
          collectionRandom: false,
          excludeTags: [],
          hideCartProducts: false,
          strategy: 'manual',
          manualVariantGids: ['gid://shopify/ProductVariant/40000000000005'],
          productLimit: 1,
          fallback: 'related',
        },
      },
    },
  },

  // PPO-06 — ReConvert review-request / social-proof thank-you card. The post-purchase
  // page's non-offer use: an appreciation + review-ask message. No variant, no capture
  // field (post-purchase.offer has no buyer-input vocab) — the ask is offer COPY only,
  // so it degrades honestly to a message card rather than implying a captured review.
  {
    id: 'PPO-06',
    name: 'Post-Purchase Thank-You & Review Request',
    description:
      'A thank-you card on the post-purchase page asking the buyer to review their order — appreciation copy, no offered product.',
    category: 'STOREFRONT_UI',
    type: 'postPurchase.offer',
    icon: 'checkout',
    tags: ['reconvert', 'post-purchase', 'thank-you', 'review-request', 'social-proof'],
    spec: {
      type: 'postPurchase.offer',
      name: 'Post-Purchase Thank-You & Review Request',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#4A3B2A' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        offerTitle: 'Thank you for your order!',
        message:
          "You're all set — your order is confirmed. Loved it (or have a question)? A quick review helps other shoppers and helps us do better.",
      },
    },
  },
];
