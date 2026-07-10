import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * TBLK-PDP — Product-page theme-app-block templates (recipeType = theme.section).
 *
 * Surface: OS-2.0 Theme App Extension app blocks placed ON the product template
 * (`placement.enabled_on.templates: ['product']`). Each entry compiles to the shipped
 * `$app:superapp_module` metaobject rendered by the theme app extension
 * (`extensions/theme-app-extension/snippets/superapp-module.liquid`), which dispatches
 * on `config.kind` and, for non-preset kinds, renders the generic section branch: it
 * walks `config.blocks[]` and reads each block's first-class `kind` / `text` /
 * `imageUrl` / `url`, with everything richer in the per-block `fields` bag; the grid
 * archetype comes from `config.layout.layout`. So `config.blocks[]` IS the reorderable,
 * merchant-add/remove block list (design.md §A.6). Parses against the `theme.section`
 * RecipeSpec member (recipe.ts:338-399).
 *
 * These 14 cover the five PDP block families the assignment names — trust badges, size
 * chart, bought-together, sticky add-to-cart, review summary — grounded in the 028
 * corpus:
 *  - Trust/payment badges → Hextom Upsell Sales Boost (payment-badge multiselect + sort,
 *    "Multicolor / Single Color" style, trust-badge gallery); the classic USB widgets are
 *    DISPLAY constructs — no discounts, no external cart state — which is exactly what a
 *    single stateless theme.section can honestly express.
 *  - Bought-together / add-ons → Selleasy (Amazon "classic" FBT row + "card" FBT; add-on
 *    card_list / card_slider / grid layouts; checkbox vs button selection) — here the
 *    PDP DISPLAY shell only. The real offer engine (Offer store, discount handoff,
 *    priority tiebreak, funnel branching) EXCEEDS one module (selleasy.md mapping_note),
 *    so these templates render the presentational bundle strip and DO NOT imply a live
 *    discount or a resolved recommendation.
 *  - Review summary / rating badge → Loox, Judge.me, Okendo (average-rating hero,
 *    star-distribution bars, verified-buyer cards, media grid). The review CORPUS lives in
 *    an external store hydrated by proxy.widget (loox.md / judge-me.md / okendo.md
 *    mapping_note); these theme.section blocks are the STATIC presentational layer only —
 *    the sample cards below are seed/placeholder content, not live-fetched reviews.
 *  - Size chart / product-info → Globo Product Options (Size charts as image/HTML popup,
 *    paragraph / popup-modal info blocks) — a static info section, no option rule engine.
 *
 * HONESTY (034 no-false-success discipline):
 *  - Every block here is presentational: it renders seed content the merchant edits. None
 *    of these templates fetch live reviews, resolve a recommendation, apply a discount, or
 *    mutate the cart — those paths need proxy.widget / a Function / an external store and
 *    are called out in the corpus mapping_notes as beyond a single theme.section. The copy
 *    and cards below are honest placeholders, not guaranteed-live data.
 *  - Only vocabulary that resolves in recipe.ts / allowed-values.ts is used: `kind` is a
 *    free-form recommendation tag; `activation` ∈ section|global|overlay|head; block
 *    `kind`/`text`/`imageUrl`/`url` are the renderer's first-class fields; `layout.layout`
 *    is a loose string archetype; placement templates are ⊂ THEME_PLACEABLE_TEMPLATES;
 *    `style` is a full StorefrontStyle object. No invented targets/kinds/enums.
 */

// Placement helper: every block in this file sits on the product template.
const ON_PRODUCT = {
  enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] },
} as const;

export const templates: TemplateEntry[] = [
  // ── Trust / payment badges (Hextom USB) ──────────────────────────────────
  {
    id: 'TBLK-PDP-01',
    name: 'Trust Badge Row (Under Buy Button)',
    description:
      'Inline trust-badge strip under the product buy button — secure-checkout, money-back, and fast-shipping badges as a horizontal row on the product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'shield',
    tags: ['hextom', 'trust-badge', 'product', 'social-proof', 'row', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'Trust Badge Row (Under Buy Button)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        title: 'Shop with confidence',
        layout: { layout: 'grid', columns: 3 },
        fields: { columnsDesktop: 3, columnsMobile: 1, iconStyle: 'multicolor' },
        blocks: [
          { kind: 'badge', text: 'Secure SSL checkout', fields: { icon: 'lock', caption: '256-bit encryption' } },
          { kind: 'badge', text: '30-day money-back', fields: { icon: 'refund', caption: 'No questions asked' } },
          { kind: 'badge', text: 'Free & fast shipping', fields: { icon: 'truck', caption: 'Ships in 24h' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f172a' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-02',
    name: 'Payment Icons Strip',
    description:
      'Accepted-payment icon strip for the product page — a reorderable row of gateway badges (Visa, Mastercard, Amex, PayPal, Shop Pay) with an optional caption.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'card',
    tags: ['hextom', 'payment-badge', 'product', 'trust', 'row', 'checkout-reassurance'],
    spec: {
      type: 'theme.section',
      name: 'Payment Icons Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'payment-badges',
        activation: 'section',
        subtitle: 'Guaranteed safe checkout',
        // 5 gateway badges → single 5-up row (was columns:6, which left an orphan cell).
        layout: { layout: 'grid', columns: 5 },
        fields: { badgeStyle: 'multicolor', badgeSize: 'medium', showCaption: true },
        blocks: [
          { kind: 'payment-icon', text: 'Visa', fields: { provider: 'visa', order: 1 } },
          { kind: 'payment-icon', text: 'Mastercard', fields: { provider: 'mastercard', order: 2 } },
          { kind: 'payment-icon', text: 'American Express', fields: { provider: 'amex', order: 3 } },
          { kind: 'payment-icon', text: 'PayPal', fields: { provider: 'paypal', order: 4 } },
          { kind: 'payment-icon', text: 'Shop Pay', fields: { provider: 'shop-pay', order: 5 } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'XS', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#059669' },
        shape: { radius: 'sm', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-03',
    name: 'Guarantee Badge Grid (Mono)',
    description:
      'Monochrome guarantee-badge grid — single-color icon cards for quality, returns, and support, styled black-and-white to match the store.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'shield',
    tags: ['hextom', 'trust-badge', 'product', 'grid', 'guarantee'],
    spec: {
      type: 'theme.section',
      name: 'Guarantee Badge Grid (Mono)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        title: 'Our promise',
        layout: { layout: 'grid', columns: 4 },
        fields: { columnsDesktop: 4, columnsMobile: 2, iconStyle: 'single-color' },
        blocks: [
          { kind: 'badge', text: 'Ethically made', fields: { icon: 'leaf' } },
          { kind: 'badge', text: 'Lifetime warranty', fields: { icon: 'badge' } },
          { kind: 'badge', text: 'Free returns', fields: { icon: 'refund' } },
          { kind: 'badge', text: 'Human support', fields: { icon: 'chat' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Size chart / product info (Globo Product Options) ─────────────────────
  {
    id: 'TBLK-PDP-04',
    name: 'Size Chart Table',
    description:
      'Size-chart section for apparel product pages — a labeled measurement grid (size, chest, waist, length) that renders as a reorderable row-per-size block table.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'ruler',
    tags: ['globo', 'size-chart', 'product', 'apparel', 'grid', 'sizing'],
    spec: {
      type: 'theme.section',
      name: 'Size Chart Table',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'size-chart',
        activation: 'section',
        title: 'Size guide',
        subtitle: 'Measurements in inches',
        layout: { layout: 'stacked' },
        fields: { unit: 'in', columns: ['Size', 'Chest', 'Waist', 'Length'] },
        blocks: [
          { kind: 'size-row', text: 'S', fields: { chest: '36', waist: '30', length: '27' } },
          { kind: 'size-row', text: 'M', fields: { chest: '40', waist: '34', length: '28' } },
          { kind: 'size-row', text: 'L', fields: { chest: '44', waist: '38', length: '29' } },
          { kind: 'size-row', text: 'XL', fields: { chest: '48', waist: '42', length: '30' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#a67c52' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-05',
    name: 'Size Chart Popup (Image)',
    description:
      'Overlay size-chart for the product page — a "View size chart" trigger that opens an uploaded measurement-diagram image in a modal, for stores using a graphic size guide.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'ruler',
    tags: ['globo', 'size-chart', 'product', 'overlay', 'popup', 'sizing'],
    spec: {
      type: 'theme.section',
      name: 'Size Chart Popup (Image)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'size-chart',
        activation: 'overlay',
        title: 'View size chart',
        layout: { layout: 'stacked' },
        fields: { trigger: 'link', linkLabel: 'View size chart' },
        blocks: [
          {
            kind: 'chart-image',
            text: 'Unisex fit — measure a garment you already own and compare.',
            imageUrl: 'https://cdn.example.com/size-charts/unisex-tee.png',
          },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'overlay', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'modal' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdrop: '#000000', overlayBackdropOpacity: 0.55, seed: '#0f172a' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-06',
    name: 'Product Info Accordion',
    description:
      'Collapsible product-info section for the product page — reorderable accordion blocks for details, materials, shipping, and care, matching Globo paragraph/popup info blocks.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'list',
    tags: ['globo', 'product', 'accordion', 'faq', 'product-info', 'details'],
    spec: {
      type: 'theme.section',
      name: 'Product Info Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'accordion',
        activation: 'section',
        title: 'Product details',
        layout: { layout: 'stacked' },
        fields: { openFirst: true, singleOpen: false },
        blocks: [
          { kind: 'accordion-item', text: 'Cut from mid-weight organic cotton with a relaxed, true-to-size fit.', fields: { heading: 'Description' } },
          { kind: 'accordion-item', text: '100% GOTS-certified organic cotton, 220gsm.', fields: { heading: 'Materials' } },
          { kind: 'accordion-item', text: 'Free carbon-neutral shipping. Ships within 24 hours.', fields: { heading: 'Shipping' } },
          { kind: 'accordion-item', text: 'Machine wash cold, tumble dry low, do not bleach.', fields: { heading: 'Care' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#059669' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Bought-together / add-ons (Selleasy) ──────────────────────────────────
  {
    id: 'TBLK-PDP-07',
    name: 'Bought Together (Classic Row)',
    description:
      'Amazon-style "frequently bought together" display strip on the product page — a horizontal product row with a combined total and one "add all" CTA (presentational bundle shell).',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bundle',
    tags: ['selleasy', 'bought-together', 'product', 'cross-sell', 'carousel', 'fbt'],
    spec: {
      type: 'theme.section',
      name: 'Bought Together (Classic Row)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'bought-together',
        activation: 'section',
        title: 'Frequently bought together',
        layout: { layout: 'carousel' },
        // Presentational only — the combined total / add-all is a DISPLAY construct; a
        // real offer + discount + priority tiebreak lives in an external Offer store and
        // exceeds a single theme.section (selleasy.md mapping_note).
        fields: { selectionControl: 'checkbox', showCombinedTotal: true, ctaLabel: 'Add all to cart' },
        blocks: [
          { kind: 'bundle-item', text: 'This item', imageUrl: 'https://cdn.example.com/pdp/main.jpg', fields: { role: 'trigger', preselected: true } },
          { kind: 'bundle-item', text: 'Matching cap', imageUrl: 'https://cdn.example.com/pdp/cap.jpg', fields: { role: 'addon', price: '24.00', preselected: true } },
          { kind: 'bundle-item', text: 'Care kit', imageUrl: 'https://cdn.example.com/pdp/care.jpg', fields: { role: 'addon', price: '12.00', preselected: false } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },
  {
    id: 'TBLK-PDP-08',
    name: 'Product Add-Ons (Card List)',
    description:
      'Optional product add-ons list for the product page — checkbox add-on cards (gift wrap, warranty, express) shown below the buy button as a Selleasy card_list layout.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'plus',
    tags: ['selleasy', 'add-ons', 'product', 'cross-sell', 'stacked', 'aov'],
    spec: {
      type: 'theme.section',
      name: 'Product Add-Ons (Card List)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'product-addons',
        activation: 'section',
        title: 'Add to your order',
        layout: { layout: 'stacked' },
        fields: { selectionControl: 'checkbox', requireMainProduct: true },
        blocks: [
          { kind: 'addon-card', text: 'Gift wrapping', fields: { price: '5.00', description: 'Recycled kraft + ribbon' } },
          { kind: 'addon-card', text: '2-year warranty', fields: { price: '9.00', description: 'Covers accidental damage' } },
          { kind: 'addon-card', text: 'Express shipping', fields: { price: '12.00', description: 'Next-business-day delivery' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#a67c52' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },
  {
    id: 'TBLK-PDP-09',
    name: 'Complete the Look (Card Slider)',
    description:
      'Cross-sell carousel on the product page — a swipeable "complete the look" card slider of complementary products, mirroring Selleasy card_slider add-on layout.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['selleasy', 'cross-sell', 'product', 'carousel', 'complementary', 'aov'],
    spec: {
      type: 'theme.section',
      name: 'Complete the Look (Card Slider)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'recommendations',
        activation: 'section',
        title: 'Complete the look',
        layout: { layout: 'carousel' },
        // Seed cards only — a live recommendation strategy would resolve via
        // proxy.widget / the recommendation service, not a static section.
        fields: { cardsPerViewDesktop: 4, cardsPerViewMobile: 2 },
        blocks: [
          { kind: 'product-card', text: 'Linen shirt', imageUrl: 'https://cdn.example.com/look/shirt.jpg', url: 'https://example.com/products/linen-shirt', fields: { price: '68.00' } },
          { kind: 'product-card', text: 'Canvas belt', imageUrl: 'https://cdn.example.com/look/belt.jpg', url: 'https://example.com/products/canvas-belt', fields: { price: '32.00' } },
          { kind: 'product-card', text: 'Leather sandals', imageUrl: 'https://cdn.example.com/look/sandals.jpg', url: 'https://example.com/products/sandals', fields: { price: '84.00' } },
          { kind: 'product-card', text: 'Straw hat', imageUrl: 'https://cdn.example.com/look/hat.jpg', url: 'https://example.com/products/straw-hat', fields: { price: '40.00' } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f172a' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // ── Sticky add-to-cart (Hextom button / cart urgency lineage) ─────────────
  {
    id: 'TBLK-PDP-10',
    name: 'Sticky Add-to-Cart Bar',
    description:
      'Sticky add-to-cart bar for the product page — a bottom-anchored bar with product title, price, and buy button that follows the shopper as they scroll the PDP.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'cart',
    tags: ['hextom', 'sticky-atc', 'product', 'conversion', 'overlay', 'buy-button'],
    spec: {
      type: 'theme.section',
      name: 'Sticky Add-to-Cart Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sticky-atc',
        activation: 'overlay',
        layout: { layout: 'stacked' },
        fields: { position: 'bottom', showPrice: true, showThumbnail: true, ctaLabel: 'Add to cart', showOnScrollPastAtc: true },
        blocks: [],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'sticky', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#059669' },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },
  {
    id: 'TBLK-PDP-11',
    name: 'Sticky ATC (Mobile-Only)',
    description:
      'Mobile-only sticky buy bar for the product page — a compact bottom add-to-cart bar shown on phones and hidden on desktop, where the buy button stays in view.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'cart',
    tags: ['hextom', 'sticky-atc', 'product', 'mobile', 'conversion', 'buy-button'],
    spec: {
      type: 'theme.section',
      name: 'Sticky ATC (Mobile-Only)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sticky-atc',
        activation: 'overlay',
        layout: { layout: 'stacked' },
        fields: { position: 'bottom', showPrice: true, showThumbnail: false, ctaLabel: 'Add to cart' },
        blocks: [],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'sticky', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#111827', overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'lg' },
        responsive: { hideOnMobile: false, hideOnDesktop: true },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // ── Review summary / rating (Loox · Judge.me · Okendo) ────────────────────
  {
    id: 'TBLK-PDP-12',
    name: 'Review Summary Header',
    description:
      'Aggregate review-summary header for the product page — average score, star row, and a 5-bar rating distribution, matching the Judge.me / Okendo summary-rail pattern.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'star',
    tags: ['judge-me', 'reviews', 'product', 'social-proof', 'rating-summary', 'stacked'],
    spec: {
      type: 'theme.section',
      name: 'Review Summary Header',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'review-summary',
        activation: 'section',
        title: 'Customer reviews',
        layout: { layout: 'stacked' },
        // Seed aggregate — the real distribution is hydrated from the external review
        // store via proxy.widget; this section is the static presentational header only.
        fields: { averageStyle: 'bold', barChart: 'stars', showSearchBar: false, starColor: '#f5a623' },
        blocks: [
          { kind: 'rating-bar', text: '5 stars', fields: { stars: 5, count: 812, pct: 0.78 } },
          { kind: 'rating-bar', text: '4 stars', fields: { stars: 4, count: 143, pct: 0.14 } },
          { kind: 'rating-bar', text: '3 stars', fields: { stars: 3, count: 52, pct: 0.05 } },
          { kind: 'rating-bar', text: '2 stars', fields: { stars: 2, count: 21, pct: 0.02 } },
          { kind: 'rating-bar', text: '1 star', fields: { stars: 1, count: 10, pct: 0.01 } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-13',
    name: 'Star Rating Snippet (Inline)',
    description:
      'Compact inline star-rating snippet for the product title area — a star row plus "(count)" that scrolls to the reviews section on click, mirroring the Loox / Okendo badge.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'star',
    tags: ['loox', 'reviews', 'product', 'rating-badge', 'social-proof', 'inline'],
    spec: {
      type: 'theme.section',
      name: 'Star Rating Snippet (Inline)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'star-rating',
        activation: 'section',
        layout: { layout: 'stacked' },
        fields: { content: 'average-and-count', includeBrackets: true, scrollToReviews: true, starColor: '#f5a623' },
        blocks: [
          { kind: 'rating', text: '4.8', fields: { stars: 5, count: 1038 } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'base' },
        spacing: { padding: 'none', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'tight', align: 'left' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'TBLK-PDP-14',
    name: 'Photo Review Wall',
    description:
      'Photo-review "wall of love" grid for the product page — verified-buyer star cards with customer-photo thumbnails, seeded from the Loox media-gallery pattern.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'reviews',
    tags: ['loox', 'reviews', 'product', 'ugc', 'wall-of-love', 'grid'],
    spec: {
      type: 'theme.section',
      name: 'Photo Review Wall',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'reviews',
        activation: 'section',
        title: 'Loved by thousands',
        subtitle: 'Real photos from verified buyers',
        layout: { layout: 'grid', columns: 3 },
        // Seed cards — live media/reviews are served by the external review store via
        // proxy.widget; these are static placeholders the merchant replaces or the
        // hydration layer overwrites.
        fields: { columnsDesktop: 3, columnsMobile: 1, showVerifiedBadge: true, starColor: '#f5a623' },
        blocks: [
          { kind: 'review-card', text: '"Exactly as pictured — obsessed."', imageUrl: 'https://cdn.example.com/reviews/r1.jpg', fields: { author: 'Maya R.', rating: 5, verified: true } },
          { kind: 'review-card', text: '"Fast shipping and great quality."', imageUrl: 'https://cdn.example.com/reviews/r2.jpg', fields: { author: 'Devon K.', rating: 5, verified: true } },
          { kind: 'review-card', text: '"Bought two, gifting one."', imageUrl: 'https://cdn.example.com/reviews/r3.jpg', fields: { author: 'Priya S.', rating: 4, verified: true } },
        ],
      },
      placement: ON_PRODUCT,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },
];
