// packages/core/src/templates/blocks/themeblock-cart-surface.ts
//
// Cart-surface theme-app-block section templates (recipeType: theme.section),
// all placed on the cart template (`placement.enabled_on.templates: ['cart']`).
// Grounded in the 028 corpus cart-drawer / cart-page apps:
//   - upcart.md            (tiered rewards / free-shipping progress bar, add-ons, announcements)
//   - slide-cart-corner.md (cart-goal progress → free gift, confetti unlock, milestones)
//   - selleasy.md          (cart add-ons / FBT cross-sell, add-all bundle)
//   - hextom-usb.md        (cart free-shipping message, reserved-cart urgency timer)
//
// Authored ONLY against vocab that exists in recipe.ts (theme.section member,
// recipe.ts:338-399) + allowed-values.ts (THEME_PLACEABLE_TEMPLATES, STOREFRONT_*).
// The repeatable content is the config.blocks[] app-block model (design.md §A.6):
// each block is { kind, text?, imageUrl?, url?, fields? } and config.layout.layout
// picks the layout variant. No invented targets/kinds/enums.
//
// HONESTY: these are storefront render templates only. Where the real app realizes
// a reward via a native Shopify discount / free-shipping rate (upcart §data,
// slide-cart §surfaces), that side-effect is NOT claimed here — the section renders
// the progress/announcement UI and copy; the merchant still provisions the discount.
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

const CART_ONLY = {
  enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] },
};

export const templates: TemplateEntry[] = [
  // ── TBLK-CART-01 — Free-shipping goal bar (UpCart tiered-rewards progress) ──
  {
    id: 'TBLK-CART-01',
    name: 'Free Shipping Goal Bar',
    description:
      'Cart-page progress bar that shows how much more to spend to unlock free shipping, with a "spend X more" message above the cart line items.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'progress',
    tags: ['section', 'cart', 'free-shipping', 'goal-bar', 'aov', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Free Shipping Goal Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'progress',
        activation: 'section',
        title: 'You’re almost there!',
        subtitle: 'Spend {{amount}} more to unlock free shipping',
        layout: { layout: 'stacked' },
        fields: {
          goalBasis: 'cart-total',
          thresholdAmount: 75,
          beforeText: 'You’re {{amount}} away from free shipping 🚚',
          achievedText: 'Congrats — you’ve unlocked free shipping!',
          showRewardIcon: true,
          barPosition: 'above-items',
          // Honest: the merchant must create the matching Shopify free-shipping rate;
          // this bar surfaces progress toward it (upcart.md §data), it does not apply it.
          reliesOnShopifyShippingRate: true,
        },
        blocks: [],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#16a34a', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'full', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-02 — Tiered rewards ladder (UpCart 3-tier rewards bar) ──
  {
    id: 'TBLK-CART-02',
    name: 'Tiered Rewards Ladder',
    description:
      'Cart-page multi-tier rewards bar (free shipping → discount → free gift) with a milestone per tier, showing progress toward each unlock.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'rewards',
    tags: ['section', 'cart', 'rewards', 'tiers', 'aov', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Tiered Rewards Ladder',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'rewards',
        activation: 'section',
        title: 'Unlock your rewards',
        subtitle: 'Add more to your cart to reach the next tier',
        layout: { layout: 'stacked' },
        fields: {
          rewardBasis: 'cart-total',
          usePreDiscountedTotal: false,
          showRewardIcons: true,
          finalTierText: 'You’ve unlocked every reward — checkout to claim them!',
        },
        // Each tier is a reorderable block (upcart reward_tier: threshold + description).
        // Max 3–4 tiers per the real rewards bar (upcart.md §functional_model).
        blocks: [
          { kind: 'reward-tier', text: 'Free shipping', fields: { threshold: 50, rewardType: 'shipping', beforeText: 'Spend {{amount}} more for free shipping', icon: 'truck' } },
          { kind: 'reward-tier', text: '10% off your order', fields: { threshold: 100, rewardType: 'discount', beforeText: 'Spend {{amount}} more to save 10%', icon: 'tag' } },
          { kind: 'reward-tier', text: 'Free gift', fields: { threshold: 150, rewardType: 'product', beforeText: 'Spend {{amount}} more for a free gift', icon: 'gift' } },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#7c3aed', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-03 — Cart goal → free gift (Corner slide-cart free-gift) ──
  {
    id: 'TBLK-CART-03',
    name: 'Cart Goal — Free Gift Unlock',
    description:
      'Single-goal cart progress bar that unlocks a free gift at a spend threshold, with celebratory "unlocked" copy on the cart page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gift',
    tags: ['section', 'cart', 'free-gift', 'goal-bar', 'cornercart'],
    spec: {
      type: 'theme.section',
      name: 'Cart Goal — Free Gift Unlock',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'progress',
        activation: 'section',
        title: 'Free gift at {{amount}}',
        subtitle: 'Keep going — your gift is waiting',
        layout: { layout: 'stacked' },
        fields: {
          goalBasis: 'cart-total',
          thresholdAmount: 120,
          beforeText: 'Spend {{amount}} more to get your free gift 🎁',
          achievedText: 'Gift unlocked! Add it to your cart before checkout.',
          celebrateOnUnlock: true,
          chooseFromMultiple: true,
          // Honest: the free gift comes from real catalog inventory and is applied via
          // the merchant's Shopify gift/discount mechanism (slide-cart-corner.md §surfaces);
          // this section renders the goal + unlock UI, not the gift line-item side-effect.
          reliesOnShopifyGiftMechanism: true,
        },
        blocks: [
          { kind: 'gift-option', text: 'Travel-size candle', imageUrl: 'https://cdn.example.com/gifts/candle.jpg', fields: { variantRef: 'gid://shopify/ProductVariant/1111111111', label: 'Free candle' } },
          { kind: 'gift-option', text: 'Sample set', imageUrl: 'https://cdn.example.com/gifts/samples.jpg', fields: { variantRef: 'gid://shopify/ProductVariant/2222222222', label: 'Free sample set' } },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#db2777', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'xl', borderWidth: 'thin', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        motion: { duration: 'base', easing: 'enter' },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-04 — In-cart upsell cards (UpCart upsell module) ──
  {
    id: 'TBLK-CART-04',
    name: 'In-Cart Upsell Cards',
    description:
      'Cart-page upsell strip of recommended add-on products with image, price and an add button, shown below the cart line items.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'upsell',
    tags: ['section', 'cart', 'upsell', 'cross-sell', 'aov', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'In-Cart Upsell Cards',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'upsell',
        activation: 'section',
        title: 'You might also like',
        subtitle: 'One-tap add — no need to leave your cart',
        layout: { layout: 'carousel' },
        fields: {
          addButtonLabel: 'Add',
          showComparePrice: true,
          maxProducts: 4,
        },
        blocks: [
          { kind: 'upsell-card', text: 'Everyday Tote', imageUrl: 'https://cdn.example.com/upsell/tote.jpg', url: 'https://example.com/products/everyday-tote', fields: { price: '38.00', variantRef: 'gid://shopify/ProductVariant/3333333333' } },
          { kind: 'upsell-card', text: 'Care Kit', imageUrl: 'https://cdn.example.com/upsell/care-kit.jpg', url: 'https://example.com/products/care-kit', fields: { price: '12.00', variantRef: 'gid://shopify/ProductVariant/4444444444' } },
          { kind: 'upsell-card', text: 'Gift Wrap', imageUrl: 'https://cdn.example.com/upsell/gift-wrap.jpg', url: 'https://example.com/products/gift-wrap', fields: { price: '5.00', variantRef: 'gid://shopify/ProductVariant/5555555555' } },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-05 — Cart add-ons / bundle (Selleasy cart add-ons, add-all) ──
  {
    id: 'TBLK-CART-05',
    name: 'Cart Add-Ons Bundle',
    description:
      'Cart-page "complete your order" add-on grid with checkbox-style selection and an add-all bundle CTA, driving cross-sell AOV.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bundle',
    tags: ['section', 'cart', 'add-ons', 'bundle', 'selleasy'],
    spec: {
      type: 'theme.section',
      name: 'Cart Add-Ons Bundle',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'upsell',
        activation: 'section',
        title: 'Complete your order',
        subtitle: 'Frequently added together',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          selectionControl: 'checkbox',
          addAllButtonLabel: 'Add selected to cart',
          showLineTotal: true,
          // Honest: any bundle discount is applied by the merchant's Shopify discount
          // mechanism (selleasy.md §data); the section renders the add-on selection UI.
          reliesOnShopifyDiscountMechanism: true,
        },
        blocks: [
          { kind: 'addon', text: 'Shipping protection', fields: { price: '2.99', control: 'checkbox', default: false } },
          { kind: 'addon', text: 'Extended warranty', fields: { price: '9.00', control: 'checkbox', default: false } },
          { kind: 'addon', text: 'Gift message card', fields: { price: '1.50', control: 'checkbox', default: false } },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-06 — Rotating cart announcements (UpCart announcements module) ──
  {
    id: 'TBLK-CART-06',
    name: 'Cart Announcement Bar',
    description:
      'Cart-page announcement strip that rotates through shipping, returns and promo messages above the line items.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'announcement',
    tags: ['section', 'cart', 'announcement', 'promo', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Cart Announcement Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement',
        activation: 'section',
        title: 'Cart announcements',
        layout: { layout: 'stacked' },
        fields: {
          position: 'above-items',
          rotate: true,
          rotateIntervalMs: 4000,
        },
        blocks: [
          { kind: 'message', text: 'Free returns within 30 days' },
          { kind: 'message', text: 'Ships in 1–2 business days' },
          { kind: 'message', text: 'Use code WELCOME10 for 10% off your first order' },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'none', density: 'compact' },
        typography: { size: 'XS', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#111827', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        motion: { duration: 'slow', easing: 'standard' },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-07 — Reserved-cart urgency timer (Hextom reserved-cart timer) ──
  {
    id: 'TBLK-CART-07',
    name: 'Reserved Cart Timer',
    description:
      'Cart-page urgency banner with a countdown that frames the cart as reserved for a limited time to reduce checkout drop-off.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'timer',
    tags: ['section', 'cart', 'urgency', 'countdown', 'hextom'],
    spec: {
      type: 'theme.section',
      name: 'Reserved Cart Timer',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement',
        activation: 'section',
        title: 'Your cart is reserved',
        subtitle: 'Items are held for a limited time',
        layout: { layout: 'stacked' },
        fields: {
          messageTemplate: 'Your cart is reserved for {{timer}}',
          durationMinutes: 10,
          onExpire: 'restart',
          showTimerIcon: true,
        },
        blocks: [],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#dc2626', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        motion: { duration: 'fast', easing: 'mechanical' },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ── TBLK-CART-08 — Empty-cart recommendations (UpCart empty-cart module) ──
  {
    id: 'TBLK-CART-08',
    name: 'Empty Cart Recommendations',
    description:
      'Recommendation strip shown on the cart page when the cart is empty, with a "you may also like" grid and a shop-now CTA.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'recommendations',
    tags: ['section', 'cart', 'recommendations', 'empty-cart', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Empty Cart Recommendations',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'recommendations',
        activation: 'section',
        title: 'Your cart is empty',
        subtitle: 'You may also like',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          showOnEmptyCartOnly: true,
          shopNowLabel: 'Shop now',
          shopNowUrl: 'https://example.com/collections/all',
          maxRecommendations: 6,
        },
        // Recommendation source (R2.3): a STATIC `collection` strategy resolves in
        // Liquid with no backend (recommendation pack). collectionGid is required for
        // the collection strategy; fallback covers an empty/unavailable render.
        recommendation: {
          manualVariantGids: [],
          collectionRandom: false,
          excludeTags: [],
          hideCartProducts: false,
          strategy: 'collection',
          collectionGid: 'gid://shopify/Collection/123456789',
          productLimit: 6,
          fallback: 'related',
        },
        blocks: [
          { kind: 'product-card', text: 'Best Seller Tee', imageUrl: 'https://cdn.example.com/rec/tee.jpg', url: 'https://example.com/products/best-seller-tee', fields: { price: '28.00' } },
          { kind: 'product-card', text: 'Classic Cap', imageUrl: 'https://cdn.example.com/rec/cap.jpg', url: 'https://example.com/products/classic-cap', fields: { price: '22.00' } },
          { kind: 'product-card', text: 'Water Bottle', imageUrl: 'https://cdn.example.com/rec/bottle.jpg', url: 'https://example.com/products/water-bottle', fields: { price: '18.00' } },
        ],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
];
