// packages/core/src/templates/modules/checkout-block-main.ts
//
// checkout.block main authoring unit (032 template library · 034 surface-coverage,
// MODULES → checkout.block: main 8). Eight `checkout.block` templates spanning the
// purchase.checkout.* and thank-you render targets, exercising the widened
// declarative render vocab (034 build #2): non-interactive `layout[]` presentation
// blocks (trust-badges, banner, progress-bar, payment-icons, countdown, testimonial,
// divider), interactive buyer-input `fields[]` (checkout-surface only; degrade to
// read-only labels on thank-you), and the `protectedData` access-level DECLARATION.
//
// Grounded in the 028 corpus: ReConvert/Upsell.com (announcement bar, banner, timer,
// order-summary, custom-form/birthday collector, free-shipping incentive), Candy Rack
// (rewards/free-shipping progress bar, trust badges), Zipify OCU (thank-you-page offer
// block, free-shipping progress with {{amount_left}}). Every non-offer content block in
// those apps is a `checkout.block` in our vocabulary.
//
// Honesty: `protectedData` is a DECLARATION only — the data populates once the app
// holds the matching access grant (shopify.app.toml + Partner-dashboard approval);
// until then those values are empty (surfaced as a merchant note, never a fake render).
// Interactive `fields[]` writes are checkout-surface only and skipped under accelerated
// checkout (Apple/Google Pay). Neither is implied to be guaranteed-live here.
//
// All vocab resolves against RecipeSpecSchema's `checkout.block` member (recipe.ts) and
// the allowed-values enums (CHECKOUT_UI_TARGETS, CHECKOUT_LAYOUT_KINDS,
// CHECKOUT_FIELD_KINDS, CHECKOUT_INPUT_TARGET_KINDS, CHECKOUT_PAYMENT_ICON_TYPES,
// CHECKOUT_TONES, CHECKOUT_PROTECTED_DATA_LEVELS). No placement/style on this type.

import type { TemplateEntry } from '../types.js';

export const CHECKOUT_BLOCK_MAIN_TEMPLATES: TemplateEntry[] = [
  // CHKB-01 — Trust-badge cluster + accepted-payment icons in checkout.
  // Corpus: Candy Rack / ReConvert non-offer trust content; classic checkout
  // conversion-reassurance block. Pure presentation (layout kinds only); no
  // buyer input, no protected data.
  {
    id: 'CHKB-01',
    name: 'Checkout Trust & Payment Reassurance',
    description:
      'Trust-badge cluster plus accepted-payment icons in the checkout body — reassures buyers at the point of payment to reduce abandonment.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'trust-badges', 'payment-icons', 'conversion', 'reassurance'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Trust & Payment Reassurance',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0F172A' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        target: 'purchase.checkout.block.render',
        title: 'Checkout with confidence',
        message: 'Secure, encrypted checkout — your details are protected.',
        layout: [
          {
            kind: 'trust-badges',
            tone: 'success',
            badges: ['Secure SSL checkout', '30-day returns', 'Money-back guarantee'],
          },
          { kind: 'divider' },
          {
            kind: 'payment-icons',
            icons: ['visa', 'mastercard', 'amex', 'paypal', 'apple-pay', 'shop-pay'],
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-02 — Free-shipping progress bar near the cart-line list.
  // Corpus: Candy Rack rewards bar; Zipify OCU free-shipping progress
  // ({{amount_left}}). progress-bar renders a static fraction (no live timer in
  // SSR); `value` is 0..1.
  {
    id: 'CHKB-02',
    name: 'Free-Shipping Progress Bar',
    description:
      'Free-shipping goal progress bar rendered after the checkout cart-line list — shows how close the buyer is to unlocking free delivery.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'progress-bar', 'free-shipping', 'aov', 'incentive'],
    spec: {
      type: 'checkout.block',
      name: 'Free-Shipping Progress Bar',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#059669' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        target: 'purchase.checkout.cart-line-list.render-after',
        title: 'You are almost there',
        message: 'Spend a little more to unlock free shipping on this order.',
        layout: [
          {
            kind: 'progress-bar',
            tone: 'info',
            value: 0.75,
            text: 'Add one more item to qualify for free shipping.',
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-03 — Urgency banner + countdown near the checkout actions.
  // Corpus: ReConvert Announcement Bar + Timer widgets. countdown renders as
  // static text (endsAt ISO); no live client timer.
  {
    id: 'CHKB-03',
    name: 'Checkout Urgency Banner',
    description:
      'Promotional banner with a countdown deadline placed before the checkout actions — creates urgency to complete the purchase.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'banner', 'countdown', 'urgency', 'promotion'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Urgency Banner',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#E11D48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
      config: {
        target: 'purchase.checkout.actions.render-before',
        title: 'Limited-time offer',
        message: 'Complete your order soon to lock in today’s pricing.',
        layout: [
          {
            kind: 'banner',
            tone: 'warning',
            text: 'Your cart pricing is reserved for a limited time.',
          },
          {
            kind: 'countdown',
            text: 'Offer ends soon',
            endsAt: '2026-12-31T23:59:59Z',
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-04 — Gift-message capture field written to a cart attribute.
  // Corpus: ReConvert Custom Form / Form Fields. Interactive field → attribute
  // write (checkout surface only; skipped under accelerated checkout).
  {
    id: 'CHKB-04',
    name: 'Gift Message Field',
    description:
      'Optional gift-message input in the checkout contact area, written to a cart attribute so it flows onto the order for fulfilment.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'fields', 'gift-message', 'attribute', 'contact'],
    spec: {
      type: 'checkout.block',
      name: 'Gift Message Field',
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
        target: 'purchase.checkout.contact.render-after',
        title: 'Add a gift message',
        message: 'Sending this as a gift? Add a personal note we’ll include on the packing slip.',
        fields: [
          {
            kind: 'textarea',
            key: 'gift_message',
            label: 'Gift message',
            placeholder: 'Write your note here…',
            required: false,
            write: { to: 'attribute' },
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-05 — Delivery-instructions field written to the buyer note.
  // Corpus: ReConvert Custom Form; delivery/shipping-note capture. Field → note
  // write, placed near the delivery-address step.
  {
    id: 'CHKB-05',
    name: 'Delivery Instructions Field',
    description:
      'Free-text delivery-instructions input near the checkout delivery address, saved to the buyer note so couriers and staff can read it.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'fields', 'delivery', 'note', 'shipping'],
    spec: {
      type: 'checkout.block',
      name: 'Delivery Instructions Field',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1E3A5F' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        target: 'purchase.checkout.delivery-address.render-after',
        title: 'Delivery instructions',
        message: 'Anything the courier should know? Gate codes, drop-off spot, etc.',
        fields: [
          {
            kind: 'text',
            key: 'delivery_instructions',
            label: 'Instructions for delivery',
            placeholder: 'e.g. Leave with the concierge',
            required: false,
            write: { to: 'note' },
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-06 — Shipping-protection opt-in checkbox written to a metafield.
  // Corpus: Candy Rack / ReConvert add-on (shipping protection) as a non-offer
  // opt-in. checkbox field → metafield write; namespace defaults to $app:superapp
  // at compile time so we omit it.
  {
    id: 'CHKB-06',
    name: 'Shipping Protection Opt-In',
    description:
      'Checkbox to add carbon-neutral shipping protection near the checkout reductions, recorded as a cart metafield for order processing.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'fields', 'shipping-protection', 'metafield', 'add-on'],
    spec: {
      type: 'checkout.block',
      name: 'Shipping Protection Opt-In',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#3D2C2E' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        target: 'purchase.checkout.reductions.render-before',
        title: 'Protect your order',
        message: 'Add shipping protection against loss, theft, or damage in transit.',
        fields: [
          {
            kind: 'checkbox',
            key: 'shipping_protection',
            label: 'Yes, protect my order',
            required: false,
            write: { to: 'metafield', metafieldKey: 'shipping_protection' },
          },
        ],
        layout: [
          {
            kind: 'trust-badges',
            tone: 'info',
            badges: ['Covered against loss', 'Fast reshipments'],
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-07 — Thank-you-page cross-sell block with a testimonial.
  // Corpus: Zipify OCU TY-Page offer editor; ReConvert thank-you block. Renders on
  // the thank-you surface (no buyer-input writes there — presentation only).
  {
    id: 'CHKB-07',
    name: 'Thank-You Cross-Sell & Social Proof',
    description:
      'Thank-you-page block pairing a follow-up recommendation prompt with a customer testimonial to drive a repeat purchase.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['thank-you', 'testimonial', 'cross-sell', 'post-purchase', 'social-proof'],
    spec: {
      type: 'checkout.block',
      name: 'Thank-You Cross-Sell & Social Proof',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#2E2A3F' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        target: 'purchase.thank-you.block.render',
        title: 'Thanks for your order!',
        message: 'Customers who bought this also loved these — grab yours before they sell out.',
        layout: [
          {
            kind: 'testimonial',
            tone: 'success',
            text: '“Ordered again the same week — the quality is unreal.”',
            attribution: 'Maya R., verified buyer',
          },
          { kind: 'divider' },
          {
            kind: 'banner',
            tone: 'info',
            text: 'Your loyalty points have been added to your account.',
          },
        ],
        protectedData: 'none',
      },
    },
  },

  // CHKB-08 — Thank-you birthday collector (Level 1 protected-data declaration).
  // Corpus: ReConvert Birthday Collector on Thank-You / Order-Status. Interactive
  // field degrades to a read-only label on thank-you (honest); declares Level 1
  // protected-customer-data (customer id / order count) — data only populates once
  // the app holds the Level 1 grant; surfaced as a merchant note, never faked.
  {
    id: 'CHKB-08',
    name: 'Thank-You Birthday Collector',
    description:
      'Thank-you-page birthday capture for loyalty perks; declares Level 1 protected-customer-data and degrades to a read-only prompt until buyer-input access ships on this surface.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['thank-you', 'fields', 'birthday', 'loyalty', 'protected-data'],
    spec: {
      type: 'checkout.block',
      name: 'Thank-You Birthday Collector',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#5A4B3B' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
      config: {
        target: 'purchase.thank-you.customer-information.render-after',
        title: 'Tell us your birthday',
        message: 'Share your birthday and we’ll send you a treat every year.',
        fields: [
          {
            kind: 'text',
            key: 'birthday',
            label: 'Birthday (MM/DD)',
            placeholder: 'MM/DD',
            required: false,
            write: { to: 'attribute' },
          },
        ],
        layout: [
          {
            kind: 'banner',
            tone: 'info',
            text: 'Members get an exclusive birthday reward each year.',
          },
        ],
        protectedData: 'level1',
      },
    },
  },
];
