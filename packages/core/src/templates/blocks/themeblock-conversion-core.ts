// packages/core/src/templates/blocks/themeblock-conversion-core.ts
//
// V-B CONVERSION CORE theme-app-block templates (recipeType: theme.section).
// Three flagship conversion widgets at competitor parity, grounded in the 028
// corpus:
//   - B1 progress-bar   → cart-goal / free-shipping progress bar (UpCart / Rebuy /
//                         FoxKit — the most-installed conversion widget). Uses the
//                         `progressGoal` control pack (1–3 tiers, token-aware copy);
//                         the storefront computes live progress from /cart.js.
//   - B2 post-atc-offer → post-add-to-cart offer modal (Candy Rack flagship). Uses
//                         the `recommendation` pack; the modal is built by JS on ATC
//                         from a live-resolved offer product.
//   - B3 sticky-atc     → sticky add-to-cart bar v2 (FoxKit / GemPages): real product
//                         context + variant/qty + /cart/add.js, revealed on scroll.
//
// Authored ONLY against vocab that exists in recipe.ts (theme.section member) +
// the control packs (progressGoal, recommendation). No invented targets/kinds.
//
// HONESTY: these are storefront render templates. The progress bar surfaces
// progress toward a reward the merchant provisions via Shopify (free-shipping
// rate / discount / gift) — it does not apply it. The post-ATC offer only opens
// when a real recommendation resolves (silent no-op otherwise). The sticky bar
// renders only in a product context.
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];
const CART_ONLY = { enabled_on: { templates: ['cart'] as PlaceTpl[] } };
const PRODUCT_ONLY = { enabled_on: { templates: ['product'] as PlaceTpl[] } };

export const CONVERSION_CORE_TEMPLATES: TemplateEntry[] = [
  // ── TBLK-CONV-01 — Free Shipping Progress Bar (single tier, minimal luxe) ──
  {
    id: 'TBLK-CONV-01',
    name: 'Free Shipping Progress Bar',
    description:
      'Cart-page progress bar showing how much more the shopper must spend to unlock free shipping, with live "{remaining} away" copy driven by the real cart total.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'progress',
    tags: ['section', 'cart', 'free-shipping', 'progress-bar', 'goal-bar', 'aov', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Free Shipping Progress Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'progress-bar',
        activation: 'section',
        title: 'Free shipping progress',
        subtitle: '',
        layout: { layout: 'stacked' },
        progressGoal: {
          basis: 'cart-total',
          tiers: [{ threshold: 75, rewardType: 'shipping', label: 'Free shipping' }],
          beforeText: 'You’re {remaining} away from free shipping',
          afterText: 'You’ve unlocked free shipping!',
          barStyle: 'slim',
        },
        fields: {},
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
        motion: { duration: 'base', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-CONV-02 — Cart Rewards Ladder (3 tiers shipping→discount→gift, bold) ──
  {
    id: 'TBLK-CONV-02',
    name: 'Cart Rewards Ladder',
    description:
      'Three-tier cart-goal bar that ladders free shipping → a discount → a free gift, with milestone markers and "spend {remaining} more" copy that advances tier by tier.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'rewards',
    tags: ['section', 'cart', 'rewards', 'tiers', 'progress-bar', 'aov', 'upcart'],
    spec: {
      type: 'theme.section',
      name: 'Cart Rewards Ladder',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'progress-bar',
        activation: 'section',
        title: 'Unlock your rewards',
        subtitle: '',
        layout: { layout: 'stacked' },
        progressGoal: {
          basis: 'cart-total',
          tiers: [
            { threshold: 50, rewardType: 'shipping', label: 'Free shipping' },
            { threshold: 100, rewardType: 'discount', label: '10% off' },
            { threshold: 150, rewardType: 'product', label: 'Free gift' },
          ],
          beforeText: 'Spend {remaining} more to reach your next reward',
          afterText: 'Every reward unlocked — {amount} in your cart!',
          barStyle: 'chunky',
        },
        fields: {},
        blocks: [],
      },
      placement: { enabled_on: CART_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#7c3aed', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'full', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },

  // ── TBLK-CONV-03 — Candy Rack Post-Add Upsell (related strategy) ──
  {
    id: 'TBLK-CONV-03',
    name: 'Candy Rack Post-Add Upsell',
    description:
      'Post-add-to-cart offer modal that pops after Add to Cart with a related product and a one-tap "add to order" button — the Candy Rack flagship upsell, resolved live from Shopify related recommendations.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'upsell',
    tags: ['section', 'product', 'post-atc-offer', 'upsell', 'cross-sell', 'aov', 'candyrack'],
    spec: {
      type: 'theme.section',
      name: 'Candy Rack Post-Add Upsell',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'post-atc-offer',
        activation: 'overlay',
        title: 'Post-add upsell offer',
        subtitle: '',
        offerTitle: 'Wait — add this before you check out?',
        acceptLabel: 'Add to order',
        declineLabel: 'No thanks',
        layout: { layout: 'stacked' },
        recommendation: {
          strategy: 'related',
          manualVariantGids: [],
          collectionRandom: false,
          productLimit: 4,
          excludeTags: [],
          hideCartProducts: true,
          fallback: 'related',
        },
        fields: {},
        blocks: [],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'overlay', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'overlay' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#db2777', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },

  // ── TBLK-CONV-04 — Bundle Completer (complementary strategy + custom decline) ──
  {
    id: 'TBLK-CONV-04',
    name: 'Bundle Completer',
    description:
      'Post-add-to-cart modal that offers the complementary product needed to complete the bundle, with a gentle "I’ll pass" decline — resolved live from Shopify complementary recommendations.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bundle',
    tags: ['section', 'product', 'post-atc-offer', 'complementary', 'bundle', 'aov', 'candyrack'],
    spec: {
      type: 'theme.section',
      name: 'Bundle Completer',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'post-atc-offer',
        activation: 'overlay',
        title: 'Bundle completer offer',
        subtitle: '',
        offerTitle: 'Complete the set',
        acceptLabel: 'Add to my order',
        declineLabel: 'I’ll pass',
        layout: { layout: 'stacked' },
        recommendation: {
          strategy: 'complementary',
          manualVariantGids: [],
          collectionRandom: false,
          productLimit: 4,
          excludeTags: [],
          hideCartProducts: true,
          fallback: 'related',
        },
        fields: {},
        blocks: [],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'overlay', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'overlay' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#0f766e', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-CONV-05 — Sticky Add-to-Cart (minimal luxe) ──
  {
    id: 'TBLK-CONV-05',
    name: 'Sticky Add to Cart',
    description:
      'Sticky add-to-cart bar that slides in from the bottom when the product’s buy box scrolls out of view, with the real product title, price and a one-tap add — quiet, minimal styling.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'sticky-atc',
    tags: ['section', 'product', 'sticky-atc', 'buy-box', 'conversion', 'foxkit'],
    spec: {
      type: 'theme.section',
      name: 'Sticky Add to Cart',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sticky-atc',
        activation: 'overlay',
        title: '',
        subtitle: '',
        ctaText: 'Add to cart',
        layout: { layout: 'stacked' },
        fields: {
          watchSelector: 'form[action*="/cart/add"]',
          showQuantity: false,
        },
        blocks: [],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'overlay', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'overlay' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#0f172a', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-CONV-06 — Sticky Add-to-Cart with Quantity (bold) ──
  {
    id: 'TBLK-CONV-06',
    name: 'Sticky Add to Cart — Quantity',
    description:
      'Bold sticky add-to-cart bar with a variant picker and a quantity stepper, revealed when the buy box scrolls away — for stores that want the full buy controls always at thumb reach.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'sticky-atc',
    tags: ['section', 'product', 'sticky-atc', 'buy-box', 'quantity', 'conversion', 'gempages'],
    spec: {
      type: 'theme.section',
      name: 'Sticky Add to Cart — Quantity',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sticky-atc',
        activation: 'overlay',
        title: '',
        subtitle: '',
        ctaText: 'Add to cart',
        layout: { layout: 'stacked' },
        fields: {
          watchSelector: 'form[action*="/cart/add"]',
          showQuantity: true,
        },
        blocks: [],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'overlay', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'overlay' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'SM', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#ea580c', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];
