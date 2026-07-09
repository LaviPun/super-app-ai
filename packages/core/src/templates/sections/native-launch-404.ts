import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-LAUNCH — native-section Liquid launch + 404 templates (034 native-sections lib).
 *
 * Four `theme.section` templates for a store's two "empty-shell" surfaces:
 *  - the `password` (coming-soon / pre-launch) page — an email-capture teaser and a
 *    launch-countdown variant, so a store that is not yet open can still collect
 *    signups and build urgency;
 *  - the `404` (not-found) page — a search-and-recover variant and a helpful-links /
 *    popular-collections variant, so a broken URL routes the shopper back into the
 *    catalog instead of dead-ending.
 *
 * All `activation: 'section'` → they compile to native-section Liquid mode (Theme Edit
 * API push) as a full-width page section. Same block/field + StorefrontStyle token
 * model as the rest of the native-sections library; variants differ only by
 * `layout.layout` + `fields` + `style` + block arrangement, never by markup.
 *
 * Grounding:
 *  - Coming-soon email capture + coupon reveal → the Privy embedded/inline email
 *    -capture form: headline/body, email field, CTA label, consent, coupon reveal
 *    (plugins/privy.md:18,45-58,92-93). Honesty: the email field COLLECTS a signup;
 *    the section itself does not persist a subscriber list or mint a real discount —
 *    that is the Privy contact-store + native-coupon surface it decisively exceeds
 *    (privy.md:132-136). Copy is framed as "notify me" / "reveal code", not a
 *    guaranteed-live send.
 *  - Launch countdown → the Hextom Standard event timer: message-before-timer +
 *    live countdown to a target datetime + message-after + timer style
 *    (plugins/hextom-countdown.md:20,39-45,90-92). The countdown runs client-side to
 *    the authored `endsAt`; the section is display-only urgency (it does not apply a
 *    discount — hextom-countdown.md:22,135).
 *  - Style packs (Bold DTC · Editorial Wellness · Apple HIG Clean · Playful Commerce)
 *    and the token model from design-vocabulary §1 / §4.
 */
export const NATIVE_LAUNCH_404_TEMPLATES: TemplateEntry[] = [
  // NSEC-LAUNCH-01 — Coming-soon email-capture teaser on the password page, Bold DTC.
  {
    id: 'NSEC-LAUNCH-01',
    name: 'Coming Soon — Email Capture',
    description: 'Pre-launch coming-soon section for the password page: a statement headline, launch-date line, and an email "notify me" capture with a first-order incentive — a high-energy holding page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'launch',
    tags: ['section', 'coming-soon', 'password', 'email-capture', 'launch'],
    spec: {
      type: 'theme.section',
      name: 'Coming Soon — Email Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'coming-soon',
        activation: 'section',
        title: 'Something good is almost here.',
        subtitle: 'Be first through the door when we open.',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'Opening soon',
          bodyText: 'We are putting the finishing touches on the shop. Drop your email and we will send you the launch link — plus a little something for your first order.',
          captureEnabled: true,
          emailPlaceholder: 'you@email.com',
          captureCtaLabel: 'Notify me',
          consentText: 'I agree to receive launch and marketing emails. Unsubscribe anytime.',
          consentRequired: true,
          incentiveNote: 'Subscribers get an early-access code on launch day.',
          successMessage: 'You are on the list. See you at launch.',
          verticalAlign: 'center',
          maxWidth: 'narrow',
        },
        blocks: [
          { kind: 'feature', text: 'Early access', fields: { icon: 'star' } },
          { kind: 'feature', text: 'Launch-day code', fields: { icon: 'gift' } },
          { kind: 'feature', text: 'No spam', fields: { icon: 'shield' } },
        ],
      },
      placement: { enabled_on: { templates: ['password'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#f8fafc', background: '#0b0b0f', overlayBackdropOpacity: 0.5, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-LAUNCH-02 — Coming-soon launch countdown on the password page, Editorial Wellness.
  {
    id: 'NSEC-LAUNCH-02',
    name: 'Coming Soon — Launch Countdown',
    description: 'Pre-launch coming-soon section for the password page with a live countdown to the opening date, a light-weight display headline, and a quiet email reminder field — a calm, editorial holding page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'countdown',
    tags: ['section', 'coming-soon', 'password', 'countdown', 'launch'],
    spec: {
      type: 'theme.section',
      name: 'Coming Soon — Launch Countdown',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'coming-soon',
        activation: 'section',
        title: 'We open in',
        subtitle: 'A small studio, opening its doors.',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'The countdown is on',
          messageBefore: 'We open in',
          endsAt: '2026-09-01T09:00:00Z',
          timerStyle: 'plain-numbers',
          showLabels: true,
          messageAfter: 'Doors are open — come on in.',
          bodyText: 'Leave your email and we will send a gentle reminder the morning we launch.',
          captureEnabled: true,
          emailPlaceholder: 'Email address',
          captureCtaLabel: 'Remind me',
          consentText: 'I agree to receive a launch reminder email.',
          consentRequired: true,
          verticalAlign: 'center',
          maxWidth: 'narrow',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['password'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },

  // NSEC-LAUNCH-03 — 404 not-found with search + shop-home recovery, Apple HIG Clean.
  {
    id: 'NSEC-LAUNCH-03',
    name: '404 — Search & Recover',
    description: 'Not-found section for the 404 page: a plain apology headline, a storefront search box, and clear back-to-home and shop-all CTAs — a content-first way to route a broken URL back into the catalog.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'not-found',
    tags: ['section', '404', 'not-found', 'search', 'recovery'],
    spec: {
      type: 'theme.section',
      name: '404 — Search & Recover',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: '404',
        activation: 'section',
        title: 'We could not find that page.',
        subtitle: 'The link may be broken, or the page may have moved.',
        layout: { layout: 'stacked' },
        fields: {
          statusLabel: '404',
          bodyText: 'Try searching for what you need, or head back to the homepage.',
          searchEnabled: true,
          searchPlaceholder: 'Search the store',
          searchAction: '/search',
          verticalAlign: 'center',
          maxWidth: 'narrow',
        },
        blocks: [
          { kind: 'cta', text: 'Back to home', url: 'https://example.com/', fields: { style: 'primary' } },
          { kind: 'cta', text: 'Shop all products', url: 'https://example.com/collections/all', fields: { style: 'secondary' } },
        ],
      },
      placement: { enabled_on: { templates: ['404'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // NSEC-LAUNCH-04 — 404 with popular-collection links, Playful Commerce.
  {
    id: 'NSEC-LAUNCH-04',
    name: '404 — Popular Links',
    description: 'Friendly not-found section for the 404 page: a warm apology, a back-home CTA, and a row of reorderable popular-collection link cards — a rounded, welcoming way to keep a lost shopper browsing.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'not-found',
    tags: ['section', '404', 'not-found', 'popular-links', 'recovery'],
    spec: {
      type: 'theme.section',
      name: '404 — Popular Links',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: '404',
        activation: 'section',
        title: 'Oops — this page went wandering.',
        subtitle: 'Let us point you somewhere good.',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          statusLabel: '404',
          bodyText: 'That page is not here, but these are some of our favorites.',
          homeCtaLabel: 'Take me home',
          homeCtaUrl: 'https://example.com/',
          verticalAlign: 'center',
          maxWidth: 'container',
        },
        blocks: [
          { kind: 'link', text: 'New arrivals', imageUrl: 'https://cdn.example.com/404/new.jpg', url: 'https://example.com/collections/new', fields: { caption: 'Fresh in this week' } },
          { kind: 'link', text: 'Best sellers', imageUrl: 'https://cdn.example.com/404/bestsellers.jpg', url: 'https://example.com/collections/bestsellers', fields: { caption: 'The ones everyone loves' } },
          { kind: 'link', text: 'On sale', imageUrl: 'https://cdn.example.com/404/sale.jpg', url: 'https://example.com/collections/sale', fields: { caption: 'Up to 40% off' } },
        ],
      },
      placement: { enabled_on: { templates: ['404'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#f97316' },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
];
