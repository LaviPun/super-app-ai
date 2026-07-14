// packages/core/src/templates/blocks/themeblock-vb-behavior.ts
//
// V-B BEHAVIOR BATCH theme-app-block templates (recipeType: theme.section).
// Exemplars for the four behavior-vocabulary widenings shipped in 035:
//   - B4 COUNTDOWN V2   → the countdown pack's mode/onExpire/timerStyle vocabulary.
//       • VBB-01 evergreen flash-sale bar, TILES style (per-visitor 2h deadline that
//         re-arms on expiry — Hextom Evergreen Timer)
//       • VBB-02 daily-deal bar, PLAIN style (resets at local midnight)
//   - B5 TEASER         → VBB-03 newsletter popup that minimizes to a reopenable
//                         pill on dismiss (behavior.teaser) instead of vanishing
//                         for the session.
//   - B13 ENTRANCE      → each template exercises motion.entrance (rise / fade / zoom).
//
// Authored ONLY against vocab that exists in the widened countdown + behavior packs
// and storefront-style motion. Countdowns ride the `announcement-bar` band render;
// the popup rides the existing overlay render. No invented targets/kinds.
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];
const ALL_PAGES: PlaceTpl[] = ['index', 'product', 'collection', 'cart', 'search', 'page'];

export const VB_BEHAVIOR_TEMPLATES: TemplateEntry[] = [
  // ── TBLK-VBB-01 — Evergreen Flash-Sale Bar (tiles, per-visitor 2h, re-arms) ──
  {
    id: 'TBLK-VBB-01',
    name: 'Evergreen Flash-Sale Bar',
    description:
      'Header urgency bar with a per-visitor 2-hour countdown shown as day/hour/minute/second tiles — each shopper gets their own deadline that re-arms when it expires (Hextom evergreen timer).',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'timer',
    tags: ['section', 'countdown', 'announcement', 'evergreen', 'urgency', 'tiles', 'hextom', 'flash-sale'],
    spec: {
      type: 'theme.section',
      name: 'Evergreen Flash-Sale Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement-bar',
        activation: 'global',
        title: 'Flash sale — 20% off ends soon',
        layout: { layout: 'stacked' },
        countdown: {
          enabled: true,
          mode: 'evergreen',
          durationMinutes: 120,
          onExpire: 'restart',
          timerStyle: 'tiles',
          labels: { days: 'Days', hours: 'Hrs', minutes: 'Min', seconds: 'Sec' },
        },
        fields: { dismissible: false, sticky: true, fullWidth: true },
        blocks: [{ kind: 'cta', text: 'Shop the sale', url: 'https://example.com/collections/sale', fields: { ctaLabel: 'Shop the sale' } }],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'SM', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#b91c1c', overlayBackdropOpacity: 0.45, seed: '#b91c1c' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'enter', entrance: 'rise' },
        pack: 'bold',
      },
    },
  },

  // ── TBLK-VBB-02 — Daily Deal Bar (plain string, resets at local midnight) ──
  {
    id: 'TBLK-VBB-02',
    name: 'Daily Deal Countdown Bar',
    description:
      'Header deal bar with a plain countdown to the end of the day — the timer resets at local midnight, so "today only" always reads honestly. Hides once the day rolls over.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'timer',
    tags: ['section', 'countdown', 'announcement', 'daily', 'deal-of-the-day', 'urgency', 'promo'],
    spec: {
      type: 'theme.section',
      name: 'Daily Deal Countdown Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'announcement-bar',
        activation: 'global',
        title: 'Deal of the day ends in',
        layout: { layout: 'stacked' },
        countdown: {
          enabled: true,
          mode: 'daily',
          onExpire: 'hide',
          timerStyle: 'plain',
        },
        fields: { dismissible: true, sticky: true, fullWidth: true, ctaLabel: 'Shop today’s deal', ctaUrl: '/collections/deal-of-the-day' },
        blocks: [{ kind: 'cta', text: 'Shop today’s deal', url: 'https://example.com/collections/deal-of-the-day', fields: { ctaLabel: 'Shop today’s deal' } }],
      },
      placement: { enabled_on: { groups: ['header'], templates: ALL_PAGES } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#111827', background: '#fde68a', overlayBackdropOpacity: 0.45, seed: '#f59e0b' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter', entrance: 'fade' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-VBB-03 — Newsletter Popup with Teaser (minimizes on dismiss) ──
  {
    id: 'TBLK-VBB-03',
    name: 'Newsletter Popup — Minimizing Teaser',
    description:
      'Email-capture popup that, when dismissed, collapses to a small "Get 10% off" pill in the corner instead of disappearing for the session — one tap reopens it, recovering abandoned signups.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'popup',
    tags: ['section', 'popup', 'newsletter', 'email-capture', 'teaser', 'minimized', 'overlay', 'privy'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter Popup — Minimizing Teaser',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        activation: 'overlay',
        title: 'Get 10% off your first order',
        subtitle: 'Join the list — we’ll send your code instantly.',
        body: 'Sign up for early access to new drops and members-only deals.',
        layout: { layout: 'stacked' },
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
        behavior: {
          showCloseButton: true,
          autoCloseSeconds: 0,
          teaser: { enabled: true, label: 'Get 10% off', position: 'bottom-right', showAfterDismiss: true },
        },
        ctaText: 'Reveal my code',
        ctaUrl: 'https://example.com/pages/newsletter',
        fields: {
          emailFieldEnabled: true,
          emailPlaceholder: 'you@email.com',
          consentText: 'By signing up you agree to receive email marketing.',
          ctaLabel: 'Reveal my code',
          successMessage: 'Your code is WELCOME10 — copied to your clipboard.',
          couponCode: 'WELCOME10',
          dismissLabel: 'No thanks',
        },
        blocks: [{ kind: 'field', text: 'Email address', fields: { input: 'email', required: true } }],
      },
      placement: { enabled_on: { templates: ['index', 'product', 'collection'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'overlay', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'modal' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdrop: '#000000', overlayBackdropOpacity: 0.6, seed: '#0ea5e9' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter', entrance: 'zoom' },
        pack: 'bold',
      },
    },
  },
];
