// packages/core/src/templates/blocks/themeblock-vb-final.ts
//
// V-B FINAL BATCH templates (B6 multi-step forms + product-finder quiz, B7 A/B
// experiment, B14 sales-pop toasts). Exemplars for the last vocab widenings:
//   - B6 MULTI-STEP FORM (formFields on a popup) → Klaviyo/Omnisend/FoxKit-class
//       • VBF-01 two-step newsletter + birthday popup
//       • VBF-02 SMS + email dual-capture popup with per-channel consent
//   - B6 PRODUCT-FINDER QUIZ (proxy.widget, surface: 'full_page') →
//       • VBF-03 skincare routine finder (app-served page, zero TAE Liquid)
//   - B7 A/B EXPERIMENT (experiment on a theme.section) →
//       • VBF-04 hero headline A/B (two text-only variants)
//   - B14 SALES-POP (kind: 'sales-pop', merchant-authored events) →
//       • VBF-05 recent-purchase social proof · VBF-06 low-stock urgency toasts
//
// Authored ONLY against vocab that exists in the widened packs (form-fields,
// experiment) + the proxy.widget quiz keys + the sales-pop kind. No invented
// targets. HONESTY: consent fields are unchecked opt-ins; sales-pop v1 renders
// only merchant-authored sample events (a real order feed is a tracked follow-up).
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];
const ALL_PAGES: PlaceTpl[] = ['index', 'product', 'collection', 'cart', 'search', 'page'];

const OVERLAY_STYLE = {
  layout: { mode: 'overlay' as const, anchor: 'center' as const, offsetX: 0, offsetY: 0, width: 'narrow' as const, zIndex: 'modal' as const },
  spacing: { padding: 'loose' as const, margin: 'none' as const, gap: 'medium' as const, density: 'comfortable' as const },
  typography: { size: 'LG' as const, weight: 'bold' as const, lineHeight: 'normal' as const, align: 'center' as const },
  colors: { overlayBackdrop: '#000000', overlayBackdropOpacity: 0.6, seed: '#0ea5e9' },
  shape: { radius: 'lg' as const, borderWidth: 'none' as const, shadow: 'lg' as const, elevation: 'soft' as const },
  responsive: { hideOnMobile: false, hideOnDesktop: false },
  accessibility: { focusVisible: true, reducedMotion: true },
  motion: { duration: 'base' as const, easing: 'enter' as const, entrance: 'zoom' as const },
  pack: 'bold' as const,
};

const SALESPOP_STYLE = {
  layout: { mode: 'inline' as const, anchor: 'bottom' as const, offsetX: 0, offsetY: 0, width: 'narrow' as const, zIndex: 'sticky' as const },
  spacing: { padding: 'tight' as const, margin: 'none' as const, gap: 'tight' as const, density: 'compact' as const },
  typography: { size: 'SM' as const, weight: 'medium' as const, lineHeight: 'normal' as const, align: 'left' as const },
  colors: { seed: '#0f766e', overlayBackdropOpacity: 0.45 },
  shape: { radius: 'lg' as const, borderWidth: 'thin' as const, shadow: 'md' as const, elevation: 'soft' as const },
  responsive: { hideOnMobile: false, hideOnDesktop: false },
  accessibility: { focusVisible: true, reducedMotion: true },
  motion: { duration: 'base' as const, easing: 'enter' as const, entrance: 'fade' as const },
  pack: 'luxe' as const,
};

export const VB_FINAL_TEMPLATES: TemplateEntry[] = [
  // ── TBLK-VBF-01 — Two-step newsletter + birthday popup ──
  {
    id: 'TBLK-VBF-01',
    name: 'Two-Step Newsletter + Birthday Popup',
    description:
      'Email-capture popup that asks for the email first, then (step two) an optional birthday for a birthday-reward flow — a Klaviyo-style staged form that reveals a welcome code on completion.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'popup',
    tags: ['section', 'popup', 'newsletter', 'multi-step', 'form', 'birthday', 'email-capture', 'klaviyo'],
    spec: {
      type: 'theme.section',
      name: 'Two-Step Newsletter + Birthday Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        activation: 'overlay',
        title: 'Get 10% off your first order',
        subtitle: 'Join the list and unlock a birthday treat.',
        trigger: 'ON_EXIT_INTENT',
        frequency: 'ONCE_PER_SESSION',
        maxShowsPerDay: 2,
        showOnPages: 'ALL',
        customPageUrls: [],
        autoCloseSeconds: 0,
        showCloseButton: true,
        countdownEnabled: false,
        countdownSeconds: 0,
        countdownLabel: '',
        layout: { layout: 'stacked' },
        fields: {},
        blocks: [],
        behavior: { teaser: { enabled: true, label: 'Get 10% off', position: 'bottom-right' } },
        formFields: {
          steps: [
            { heading: 'Where should we send your code?', fields: [
              { type: 'email', label: 'Email address', required: true },
              { type: 'consent', label: 'Email me new drops and offers.', required: false },
            ] },
            { heading: 'When’s your birthday? (optional)', fields: [
              { type: 'birthday', label: 'Birthday', required: false },
            ] },
          ],
          successStep: { message: 'You’re in! Here’s your welcome code:', discountCode: 'WELCOME10' },
        },
      },
      placement: { enabled_on: { templates: ['index', 'product', 'collection'] as PlaceTpl[] } },
      style: OVERLAY_STYLE,
    },
  },

  // ── TBLK-VBF-02 — SMS + email dual-capture popup with consent ──
  {
    id: 'TBLK-VBF-02',
    name: 'SMS + Email Dual-Capture Popup',
    description:
      'Two-step capture that collects an email (with marketing consent) then a mobile number (with a separate SMS consent) — each consent is an unchecked opt-in, and a code is revealed on completion.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'popup',
    tags: ['section', 'popup', 'multi-step', 'form', 'sms', 'email', 'consent', 'omnisend'],
    spec: {
      type: 'theme.section',
      name: 'SMS + Email Dual-Capture Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        activation: 'overlay',
        title: 'Unlock 15% off',
        subtitle: 'Two quick steps — email, then optional text alerts.',
        trigger: 'ON_LOAD',
        frequency: 'ONCE_PER_SESSION',
        delaySeconds: 6,
        maxShowsPerDay: 3,
        showOnPages: 'ALL',
        customPageUrls: [],
        autoCloseSeconds: 0,
        showCloseButton: true,
        countdownEnabled: false,
        countdownSeconds: 0,
        countdownLabel: '',
        layout: { layout: 'stacked' },
        fields: {},
        blocks: [],
        behavior: { teaser: { enabled: true, label: 'Unlock 15% off', position: 'bottom-left' } },
        formFields: {
          steps: [
            { heading: 'Get email offers', fields: [
              { type: 'email', label: 'Email address', required: true },
              { type: 'consent', label: 'I agree to receive marketing emails.', required: true },
            ] },
            { heading: 'Want text alerts too?', fields: [
              { type: 'phone', label: 'Mobile number', required: false },
              { type: 'consent', label: 'Text me deals (msg rates may apply).', required: false },
            ] },
          ],
          successStep: { message: 'Thanks! Your code is ready:', discountCode: 'UNLOCK15' },
        },
      },
      placement: { enabled_on: { templates: ['index', 'product', 'collection', 'cart'] as PlaceTpl[] } },
      style: OVERLAY_STYLE,
    },
  },

  // ── TBLK-VBF-03 — Skincare product-finder quiz (proxy.widget, full_page) ──
  {
    id: 'TBLK-VBF-03',
    name: 'Skincare Routine Finder Quiz',
    description:
      'A full-page product-finder quiz (app-served, so it costs no theme Liquid) — three questions about skin type and goals route the shopper to the matching skincare collection.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'quiz',
    tags: ['proxy-widget', 'quiz', 'product-finder', 'skincare', 'full-page', 'recommendation'],
    spec: {
      type: 'proxy.widget',
      name: 'Skincare Routine Finder Quiz',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'skincare-finder',
        mode: 'HTML',
        surface: 'full_page',
        title: 'Find your skincare routine',
        message: 'Answer three quick questions to see your matches.',
        quiz: {
          questions: [
            { text: 'How does your skin usually feel?', options: [
              { label: 'Tight and dry', tagHints: ['dry'] },
              { label: 'Shiny / oily by midday', tagHints: ['oily'] },
              { label: 'Combination', tagHints: ['combo'] },
            ] },
            { text: 'What’s your top goal?', options: [
              { label: 'Deep hydration', tagHints: ['dry'] },
              { label: 'Control breakouts', tagHints: ['oily'] },
              { label: 'Even, balanced skin', tagHints: ['combo'] },
            ] },
            { text: 'How much time do you want to spend?', options: [
              { label: 'Keep it simple', tagHints: ['combo'] },
              { label: 'I love a full routine', tagHints: ['dry'] },
            ] },
          ],
          outcomes: [
            { hint: 'dry', heading: 'Your hydration routine', collectionHandle: 'hydration' },
            { hint: 'oily', heading: 'Your clarifying routine', collectionHandle: 'oil-control' },
            { hint: 'combo', heading: 'Your balancing routine', collectionHandle: 'balance' },
          ],
          fallback: { heading: 'Our bestsellers for every skin type', collectionHandle: 'bestsellers' },
          emailGate: false,
        },
      },
      placement: { enabled_on: { templates: ['page'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#0ea5e9', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },

  // ── TBLK-VBF-04 — Hero headline A/B experiment ──
  {
    id: 'TBLK-VBF-04',
    name: 'Hero Headline A/B Test',
    description:
      'A homepage hero that runs a two-variant A/B test on its headline and CTA label — each visitor is deterministically bucketed and the winning copy is measured against a click goal.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'experiment',
    tags: ['section', 'hero', 'ab-test', 'experiment', 'optimization', 'zipify'],
    spec: {
      type: 'theme.section',
      name: 'Hero Headline A/B Test',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'New season, new staples',
        subtitle: 'Timeless pieces, built to last.',
        layout: { layout: 'stacked' },
        fields: {
          mediaImageUrl: 'https://example.com/hero.jpg',
          ctaLabel: 'Shop new arrivals',
          ctaUrl: 'https://example.com/collections/new',
        },
        blocks: [
          { kind: 'cta', text: 'Shop new arrivals', url: 'https://example.com/collections/new', fields: { ctaLabel: 'Shop new arrivals' } },
        ],
        experiment: {
          enabled: true,
          goal: 'click',
          variants: [
            { id: 'control', weight: 50, overrides: {} },
            { id: 'urgency', weight: 50, overrides: { headline: 'Selling fast — new season staples', ctaLabel: 'Shop before they’re gone' } },
          ],
        },
      },
      placement: { enabled_on: { templates: ['index'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#111827', background: '#f9fafb', overlayBackdropOpacity: 0.45, seed: '#111827' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter', entrance: 'fade' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-VBF-05 — Recent-purchase social-proof toasts ──
  {
    id: 'TBLK-VBF-05',
    name: 'Recent-Purchase Sales-Pop',
    description:
      'A rotating corner toast that surfaces recent-purchase social proof (“Ava from Austin bought …”). v1 shows merchant-authored SAMPLE events — a live order feed is a follow-up.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bell',
    tags: ['section', 'sales-pop', 'social-proof', 'toast', 'urgency', 'provesource', 'fomo'],
    spec: {
      type: 'theme.section',
      name: 'Recent-Purchase Sales-Pop',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sales-pop',
        activation: 'global',
        title: 'Recent purchases',
        intervalSeconds: 8,
        position: 'bottom-left',
        maxPerSession: 8,
        dismissible: true,
        fields: {},
        blocks: [
          { kind: 'event', text: 'Ava from Austin bought {product} {timeAgo}', fields: { product: 'the Everyday Tote', timeAgo: '2 hours ago' } },
          { kind: 'event', text: 'Noah from Denver bought {product} {timeAgo}', fields: { product: 'the Weekender Duffel', timeAgo: '35 minutes ago' } },
          { kind: 'event', text: 'Mia from Seattle bought {product} {timeAgo}', fields: { product: 'the Mini Crossbody', timeAgo: '1 hour ago' } },
          { kind: 'event', text: 'Liam from Chicago bought {product} {timeAgo}', fields: { product: 'the Everyday Tote', timeAgo: '10 minutes ago' } },
        ],
      },
      placement: { enabled_on: { templates: ALL_PAGES } },
      style: SALESPOP_STYLE,
    },
  },

  // ── TBLK-VBF-06 — Low-stock urgency toasts ──
  {
    id: 'TBLK-VBF-06',
    name: 'Low-Stock Urgency Sales-Pop',
    description:
      'A corner toast queue that nudges with low-stock / high-demand messages on collection and product pages. v1 renders merchant-authored SAMPLE lines (a live inventory feed is a follow-up).',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bell',
    tags: ['section', 'sales-pop', 'urgency', 'low-stock', 'toast', 'scarcity', 'fera'],
    spec: {
      type: 'theme.section',
      name: 'Low-Stock Urgency Sales-Pop',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sales-pop',
        activation: 'global',
        title: 'Selling fast',
        intervalSeconds: 10,
        position: 'bottom-right',
        maxPerSession: 5,
        dismissible: true,
        fields: {},
        blocks: [
          { kind: 'event', text: 'Only a few {product} left in stock', fields: { product: 'Signature Hoodies' } },
          { kind: 'event', text: '{product} is trending — {timeAgo}', fields: { product: 'The Linen Shirt', timeAgo: 'selling quickly today' } },
          { kind: 'event', text: 'Almost gone: {product}', fields: { product: 'the Wool Beanie' } },
        ],
      },
      placement: { enabled_on: { groups: ['header'], templates: ['product', 'collection'] as PlaceTpl[] } },
      style: SALESPOP_STYLE,
    },
  },
];
