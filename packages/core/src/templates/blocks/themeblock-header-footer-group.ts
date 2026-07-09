/**
 * Header / footer section-group theme-app-block templates (unit: TBLK-HDR).
 *
 * Fourteen `theme.section` app-block templates authored for placement in a theme's
 * `header` / `footer` section groups (`placement.enabled_on.groups: ['header','footer']`).
 * Three functional clusters, all grounded in the 028 corpus:
 *   - Announcement / countdown bars  — Hextom: Countdown Timer Bar (event-promotion-bar)
 *     + Hextom: Upsell Sales Boost promo-message widget.
 *   - USP / trust / payment strips    — Hextom: Upsell Sales Boost trust-badge, payment-badge,
 *     free-shipping-progress, "only N left" widgets.
 *   - Newsletter footer capture       — Klaviyo Embedded Form + Omnisend inline signup box
 *     (theme app-embed sections merchants drop into the footer to persist site-wide).
 *
 * Every spec parses against `RecipeSpecSchema` (`theme.section` member, recipe.ts:338-399).
 * The repeatable content lives in `config.blocks[]` (the reorderable app-block list); the
 * renderer reads `kind/text/imageUrl/url` first-class and everything richer via `blocks[].fields`.
 * Free-form `config.kind` is a recommendation tag only. No `requires` flags beyond the
 * schema default are authored — the barrel `modernize…` layer injects them.
 *
 * HONESTY: these are DISPLAY constructs (matching the corpus reality — Hextom bars and
 * Klaviyo/Omnisend forms are storefront-rendered widgets, not Shopify Functions/discounts).
 * Countdown timers render client-side; no timer/discount is enforced by these specs.
 */
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/** All storefront templates a header/footer group section can surface on. */
type PlaceableTemplate = (typeof THEME_PLACEABLE_TEMPLATES)[number];
const ALL_PAGES: PlaceableTemplate[] = [
  'index',
  'product',
  'collection',
  'list-collections',
  'cart',
  'search',
  'page',
  'blog',
  'article',
  '404',
];

export const TEMPLATES: TemplateEntry[] = [
  // ─── Announcement / countdown bars (header group) ───────────────────────────
  {
    id: 'TBLK-HDR-01',
    name: 'Announcement Bar — Static Message',
    description:
      'Full-width single-row announcement bar for the header group — rotating-free static promo line with an optional CTA and dismiss X.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'megaphone',
    tags: ['section', 'announcement', 'header', 'promo', 'bar'],
    spec: {
      type: 'theme.section',
      name: 'Announcement Bar — Static Message',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement-bar',
        activation: 'global',
        title: 'Free shipping on orders over $50 — shop now',
        layout: { layout: 'stacked' },
        fields: {
          dismissible: true,
          ctaLabel: 'Shop the sale',
          ctaUrl: '/collections/all',
          fullWidth: true,
          sticky: true,
        },
        blocks: [
          {
            kind: 'message',
            text: 'Free shipping on all orders over $50 — no code needed',
            url: 'https://example.com/collections/all',
            fields: { emoji: '🚚', ctaLabel: 'Shop now' },
          },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#111827', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-02',
    name: 'Announcement Bar — Rotating Messages',
    description:
      'Header announcement bar that cycles through several promo messages — a classic Hextom Countdown Timer Bar rotation, each message an independent block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'megaphone',
    tags: ['section', 'announcement', 'header', 'rotating', 'hextom', 'promo'],
    spec: {
      type: 'theme.section',
      name: 'Announcement Bar — Rotating Messages',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement-bar',
        activation: 'global',
        title: 'Rotating store announcements',
        layout: { layout: 'carousel' },
        fields: {
          rotate: true,
          rotationIntervalMs: 4000,
          dismissible: false,
          sticky: true,
          fullWidth: true,
        },
        blocks: [
          { kind: 'message', text: 'Free shipping over $50', fields: { emoji: '📦' } },
          { kind: 'message', text: '30-day easy returns', fields: { emoji: '↩️' } },
          { kind: 'message', text: 'New arrivals just dropped', url: 'https://example.com/collections/new', fields: { emoji: '✨', ctaLabel: 'See what’s new' } },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
  {
    id: 'TBLK-HDR-03',
    name: 'Countdown Bar — Flash Sale (Standard Timer)',
    description:
      'Header urgency bar with a client-side countdown to a sale end time (Hextom Standard-timer pattern) — message-before + timer + optional CTA; display-only, no enforced discount.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'clock',
    tags: ['section', 'countdown', 'header', 'urgency', 'hextom', 'flash-sale'],
    spec: {
      type: 'theme.section',
      name: 'Countdown Bar — Flash Sale',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'countdown-bar',
        activation: 'global',
        title: 'Flash sale ends in',
        subtitle: 'Prices go back up at midnight',
        layout: { layout: 'stacked' },
        fields: {
          timerStyle: 'boxed',
          endsAt: '2026-12-31T23:59:59Z',
          onExpire: 'hide',
          showLabels: true,
          messageBefore: 'Flash sale ends in',
          sticky: true,
          fullWidth: true,
        },
        blocks: [
          {
            kind: 'message',
            text: 'Up to 40% off sitewide',
            url: 'https://example.com/collections/sale',
            fields: { ctaLabel: 'Shop the sale' },
          },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#b91c1c', seed: '#b91c1c', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'sm' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
  {
    id: 'TBLK-HDR-04',
    name: 'Countdown Bar — Daily Recurring',
    description:
      'Header countdown bar for a daily recurring window (Hextom Daily-timer pattern) with a circle-tile timer and dismiss control; timer math is client-side, display-only.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'clock',
    tags: ['section', 'countdown', 'header', 'daily', 'hextom', 'urgency'],
    spec: {
      type: 'theme.section',
      name: 'Countdown Bar — Daily Recurring',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'countdown-bar',
        activation: 'global',
        title: 'Today’s deal ends in',
        layout: { layout: 'stacked' },
        fields: {
          timerStyle: 'circle-tiles',
          timerMode: 'daily',
          dailyResetHour: 0,
          onExpire: 'restart',
          showLabels: true,
          dismissible: true,
          sticky: true,
          fullWidth: true,
        },
        blocks: [
          {
            kind: 'message',
            text: 'Deal of the day — 25% off selected styles',
            url: 'https://example.com/collections/daily-deal',
            fields: { ctaLabel: 'Grab it' },
          },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#f59e0b', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
  {
    id: 'TBLK-HDR-05',
    name: 'Announcement Bar — Dismissible with Link',
    description:
      'A dismissible header bar with a single tappable message (Hextom "make entire bar clickable" mode) that remembers dismissal per visitor — quiet, understated styling.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'megaphone',
    tags: ['section', 'announcement', 'header', 'dismissible', 'bar'],
    spec: {
      type: 'theme.section',
      name: 'Announcement Bar — Dismissible',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement-bar',
        activation: 'global',
        title: 'Complimentary gift wrapping this week',
        layout: { layout: 'stacked' },
        fields: {
          dismissible: true,
          rememberDismissal: true,
          barClickable: true,
          sticky: false,
          fullWidth: true,
        },
        blocks: [
          {
            kind: 'message',
            text: 'Complimentary gift wrapping on every order this week',
            url: 'https://example.com/pages/gifting',
          },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'XS', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#8a7d6b', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // ─── USP / trust / payment strips ───────────────────────────────────────────
  {
    id: 'TBLK-HDR-06',
    name: 'USP Strip — Icon Value Props',
    description:
      'A four-up USP strip of value-prop icons (free shipping, easy returns, secure checkout, support) for the footer or below the header — each prop a reorderable block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'star',
    tags: ['section', 'usp', 'footer', 'trust', 'icons', 'value-props'],
    spec: {
      type: 'theme.section',
      name: 'USP Strip — Icon Value Props',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'usp-strip',
        activation: 'section',
        title: 'Why shop with us',
        layout: { layout: 'grid', columns: 4 },
        fields: { columnsDesktop: 4, columnsMobile: 2, iconStyle: 'line' },
        blocks: [
          { kind: 'feature', text: 'Free shipping over $50', fields: { icon: 'truck', caption: 'On all domestic orders' } },
          { kind: 'feature', text: '30-day returns', fields: { icon: 'refresh', caption: 'No-hassle exchanges' } },
          { kind: 'feature', text: 'Secure checkout', fields: { icon: 'lock', caption: 'Encrypted payments' } },
          { kind: 'feature', text: '24/7 support', fields: { icon: 'chat', caption: 'We’re here to help' } },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-07',
    name: 'Trust Badge Row',
    description:
      'A centered row of trust-guarantee badges (Hextom trust-badge widget) — money-back, secure, verified, carbon-neutral — as reorderable badge blocks for the footer.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'shield',
    tags: ['section', 'trust', 'footer', 'badges', 'hextom', 'social-proof'],
    spec: {
      type: 'theme.section',
      name: 'Trust Badge Row',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        title: 'Shop with confidence',
        layout: { layout: 'grid', columns: 4 },
        fields: { columnsDesktop: 4, columnsMobile: 2, badgeSize: 'medium' },
        blocks: [
          { kind: 'badge', text: 'Money-back guarantee', imageUrl: 'https://cdn.example.com/badges/moneyback.svg', fields: { alt: '100% money-back guarantee' } },
          { kind: 'badge', text: 'Secure SSL checkout', imageUrl: 'https://cdn.example.com/badges/ssl.svg', fields: { alt: 'Secure SSL checkout' } },
          { kind: 'badge', text: 'Verified reviews', imageUrl: 'https://cdn.example.com/badges/verified.svg', fields: { alt: 'Verified customer reviews' } },
          { kind: 'badge', text: 'Carbon-neutral shipping', imageUrl: 'https://cdn.example.com/badges/carbon.svg', fields: { alt: 'Carbon-neutral shipping' } },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XS', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-08',
    name: 'Payment Icons Strip',
    description:
      'A footer strip of accepted-payment icons (Hextom payment-badge widget) in single-color or multicolor, reorderable per gateway — reassurance at the bottom of every page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'credit-card',
    tags: ['section', 'payment', 'footer', 'trust', 'hextom', 'checkout'],
    spec: {
      type: 'theme.section',
      name: 'Payment Icons Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'payment-icons',
        activation: 'section',
        title: 'We accept',
        layout: { layout: 'stacked' },
        fields: { badgeStyle: 'multicolor', badgeSize: 'small', caption: 'Safe & secure payment' },
        blocks: [
          { kind: 'logo', text: 'Visa', imageUrl: 'https://cdn.example.com/pay/visa.svg', fields: { alt: 'Visa' } },
          { kind: 'logo', text: 'Mastercard', imageUrl: 'https://cdn.example.com/pay/mastercard.svg', fields: { alt: 'Mastercard' } },
          { kind: 'logo', text: 'American Express', imageUrl: 'https://cdn.example.com/pay/amex.svg', fields: { alt: 'American Express' } },
          { kind: 'logo', text: 'PayPal', imageUrl: 'https://cdn.example.com/pay/paypal.svg', fields: { alt: 'PayPal' } },
          { kind: 'logo', text: 'Shop Pay', imageUrl: 'https://cdn.example.com/pay/shoppay.svg', fields: { alt: 'Shop Pay' } },
          { kind: 'logo', text: 'Apple Pay', imageUrl: 'https://cdn.example.com/pay/applepay.svg', fields: { alt: 'Apple Pay' } },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'XS', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-09',
    name: 'Free-Shipping Progress Bar',
    description:
      'A header goal bar nudging shoppers toward a free-shipping threshold (Hextom cart-progress / free-shipping-message widget) — copy is display-only; the fill is client-side.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'truck',
    tags: ['section', 'free-shipping', 'header', 'aov', 'hextom', 'progress'],
    spec: {
      type: 'theme.section',
      name: 'Free-Shipping Progress Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'free-shipping-bar',
        activation: 'global',
        title: 'You’re close to free shipping',
        layout: { layout: 'stacked' },
        fields: {
          thresholdAmount: 50,
          currency: 'USD',
          messageUnder: 'Add {remaining} more for free shipping',
          messageReached: 'You’ve unlocked free shipping!',
          showProgressBar: true,
          sticky: true,
          fullWidth: true,
        },
        blocks: [
          { kind: 'message', text: 'Free shipping when you spend $50', fields: { emoji: '🚚' } },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#059669', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
  {
    id: 'TBLK-HDR-10',
    name: 'USP Strip — Marquee Ticker',
    description:
      'A scrolling marquee of short value-prop phrases for the footer group — an ambient, low-cost ticker of shipping / returns / guarantee lines, each phrase a block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'star',
    tags: ['section', 'usp', 'footer', 'marquee', 'value-props', 'ticker'],
    spec: {
      type: 'theme.section',
      name: 'USP Strip — Marquee Ticker',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'usp-strip',
        activation: 'section',
        title: 'Store promises ticker',
        layout: { layout: 'carousel' },
        fields: { marquee: true, marqueeSpeedMs: 20000, separator: '•', fullWidth: true },
        blocks: [
          { kind: 'feature', text: 'Free shipping over $50' },
          { kind: 'feature', text: '30-day returns' },
          { kind: 'feature', text: 'Ethically made' },
          { kind: 'feature', text: '1-year warranty' },
          { kind: 'feature', text: 'Carbon-neutral delivery' },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'XS', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#f8fafc', background: '#0f172a', seed: '#38bdf8', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'standard' },
      },
    },
  },

  // ─── Newsletter footer capture ──────────────────────────────────────────────
  {
    id: 'TBLK-HDR-11',
    name: 'Newsletter Footer — Inline Email Capture',
    description:
      'An inline footer email-capture form (Klaviyo Embedded Form / Omnisend inline signup pattern) — heading, body, email field, submit, and consent line; site-wide in the footer group.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'mail',
    tags: ['section', 'newsletter', 'footer', 'email-capture', 'klaviyo', 'signup'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter Footer — Inline Email Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Join the list',
        subtitle: 'Get 10% off your first order and early access to drops.',
        layout: { layout: 'stacked' },
        fields: {
          emailPlaceholder: 'Enter your email',
          submitLabel: 'Subscribe',
          consentText: 'By subscribing you agree to receive marketing emails. Unsubscribe anytime.',
          successMessage: 'You’re in — check your inbox for your code.',
          collectSmsConsent: false,
        },
        blocks: [],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-12',
    name: 'Newsletter Footer — Split Image Signup',
    description:
      'A two-column footer newsletter block — lifestyle image beside an email form (Klaviyo side-image form pattern) with a discount incentive; imagery-led styling.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'mail',
    tags: ['section', 'newsletter', 'footer', 'email-capture', 'klaviyo'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter Footer — Split Image Signup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Stay in the loop',
        subtitle: 'Subscribe for new arrivals, restocks, and members-only offers.',
        layout: { layout: 'columns', columns: 2 },
        fields: {
          imagePosition: 'left',
          emailPlaceholder: 'you@example.com',
          submitLabel: 'Sign me up',
          incentive: '10% off your first order',
          consentText: 'We’ll email you occasionally. No spam, unsubscribe anytime.',
          successMessage: 'Welcome aboard — your code is on its way.',
        },
        blocks: [
          {
            kind: 'slide',
            imageUrl: 'https://cdn.example.com/newsletter/lifestyle.jpg',
            fields: { alt: 'Lifestyle image beside the signup form' },
          },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { seed: '#8a7d6b', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },
  {
    id: 'TBLK-HDR-13',
    name: 'Newsletter Footer — Email + SMS Consent',
    description:
      'A footer signup collecting both email and SMS with separate consent (Klaviyo/Omnisend dual-channel form) — two capture fields plus explicit per-channel consent lines.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'mail',
    tags: ['section', 'newsletter', 'footer', 'sms', 'omnisend', 'consent'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter Footer — Email + SMS Consent',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Never miss a drop',
        subtitle: 'Get texts and emails for launches, restocks, and flash sales.',
        layout: { layout: 'stacked' },
        fields: {
          emailPlaceholder: 'Email address',
          phonePlaceholder: 'Mobile number',
          collectSmsConsent: true,
          emailConsentText: 'I agree to receive marketing emails.',
          smsConsentText: 'I agree to receive recurring automated marketing texts. Msg & data rates may apply.',
          submitLabel: 'Subscribe',
          successMessage: 'Subscribed — watch your inbox and phone.',
        },
        blocks: [],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { text: '#f8fafc', background: '#111827', seed: '#38bdf8', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
  {
    id: 'TBLK-HDR-14',
    name: 'Footer — Newsletter + Social + Trust',
    description:
      'A rich multi-column footer combining an email signup, social links, and a trust line (the "designed footer" surface) — social and trust rows are reorderable blocks.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'layout',
    tags: ['section', 'newsletter', 'footer', 'social', 'trust', 'multi-column'],
    spec: {
      type: 'theme.section',
      name: 'Footer — Newsletter + Social + Trust',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'footer',
        activation: 'section',
        title: 'Get 10% off your first order',
        subtitle: 'Join our newsletter and follow along.',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          emailPlaceholder: 'Enter your email',
          submitLabel: 'Subscribe',
          consentText: 'Unsubscribe anytime.',
          trustLine: 'Secure checkout · Free returns · Carbon-neutral shipping',
        },
        blocks: [
          { kind: 'logo', text: 'Instagram', url: 'https://instagram.com/example', imageUrl: 'https://cdn.example.com/social/instagram.svg', fields: { alt: 'Instagram' } },
          { kind: 'logo', text: 'TikTok', url: 'https://tiktok.com/@example', imageUrl: 'https://cdn.example.com/social/tiktok.svg', fields: { alt: 'TikTok' } },
          { kind: 'logo', text: 'YouTube', url: 'https://youtube.com/@example', imageUrl: 'https://cdn.example.com/social/youtube.svg', fields: { alt: 'YouTube' } },
        ],
      },
      placement: { enabled_on: { groups: ['footer'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { text: '#e2e8f0', background: '#0f172a', seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },
];
