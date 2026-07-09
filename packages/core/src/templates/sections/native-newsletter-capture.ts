/**
 * Native newsletter-capture theme sections (unit: native_section newsletter capture).
 *
 * Eight `theme.section` templates for storefront email/SMS signup capture across the
 * index / page / blog / article surfaces. Grounded in the corpus records for the real
 * email-marketing apps this surface competes with — Privy, Omnisend, Klaviyo — reflecting
 * their actual controls (inline embedded form vs footer strip vs multi-step email→SMS
 * capture, exit-intent/scroll behaviour, discount reveal on success, consent capture,
 * on-brand theming per breakpoint) and the design-vocabulary §2 "newsletter capture"
 * variant catalog rendered through the six style packs (§4).
 *
 * Modular-blocks model (§A.6): the capture form's repeatable content — benefit rows,
 * multi-step stages, trust badges, consent lines — lives in `config.blocks[]`, each block a
 * `{ kind, text?, imageUrl?, url?, fields? }` object the generic renderer reads first-class
 * (kind/text/imageUrl/url) with anything richer in `fields`. `config.layout.layout` selects
 * the layout variant so the same tokens ship inline / centered / split-image / footer-strip.
 *
 * HONESTY: `activation:'section'` = in-body embedded/inline capture (the shipped native
 * path); `activation:'overlay'` = an in-body popup-style capture card (rendered where placed,
 * NOT a true exit-intent overlay engine — the behavior fields describe the intended trigger,
 * they are not a guaranteed-live JS trigger engine). Discount-reveal / consent copy describe
 * what the success step SHOWS; actual list subscription + discount minting happen off-module
 * (no fabricated send). No POS, no loyalty binding, no invented enums.
 */
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceableTemplate = (typeof THEME_PLACEABLE_TEMPLATES)[number];

export const NEWSLETTER_CAPTURE_SECTION_TEMPLATES: TemplateEntry[] = [
  // NSEC-NEWS-01 — Privy-style inline embedded capture (scroll box → inline block), homepage.
  {
    id: 'NSEC-NEWS-01',
    name: 'Newsletter — Inline Embedded Capture',
    description:
      'Inline email-capture block for the homepage — headline, single email field, and CTA that reveals a welcome discount on signup. Privy-style embedded form.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'privy', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Inline Embedded Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Get 10% off your first order',
        subtitle: 'Join the list for early drops, restocks, and members-only sales.',
        layout: { layout: 'stacked' },
        fields: {
          emailFieldLabel: 'Email address',
          emailPlaceholder: 'you@email.com',
          ctaLabel: 'Unlock 10% off',
          consentText: 'By subscribing you agree to receive marketing emails. Unsubscribe anytime.',
          successHeadline: 'You’re in — here’s your code',
          successBody: 'Use code WELCOME10 at checkout. It’s also on its way to your inbox.',
          discountRevealCode: 'WELCOME10',
        },
        blocks: [
          { kind: 'benefit', text: 'Early access to new arrivals', fields: { icon: 'sparkle' } },
          { kind: 'benefit', text: 'Restock alerts on sold-out favorites', fields: { icon: 'bell' } },
          { kind: 'benefit', text: 'Subscriber-only sale previews', fields: { icon: 'tag' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#e07856' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // NSEC-NEWS-02 — Split-image editorial capture (Klaviyo side-image form), page surface.
  {
    id: 'NSEC-NEWS-02',
    name: 'Newsletter — Split Image Capture',
    description:
      'Two-column newsletter capture with a lifestyle side image on one half and the email form on the other — editorial signup for a landing page. Klaviyo side-image form layout.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'klaviyo', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Split Image Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Slow living, delivered',
        subtitle: 'One considered email a week — new pieces, journal entries, nothing more.',
        layout: { layout: 'split' },
        fields: {
          imageSide: 'left',
          emailPlaceholder: 'Enter your email',
          ctaLabel: 'Subscribe',
          consentText: 'We’ll email you a weekly note. No spam, unsubscribe anytime.',
          successHeadline: 'Welcome',
          successBody: 'Look out for our next edition this Sunday.',
        },
        blocks: [
          {
            kind: 'media',
            imageUrl: 'https://cdn.shopify.com/s/files/1/placeholder/newsletter-editorial.jpg',
            fields: { alt: 'Lifestyle editorial photograph', focalPoint: 'center' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f766e' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-NEWS-03 — Footer newsletter strip (Klaviyo "Embedded Form in Footer" pattern).
  {
    id: 'NSEC-NEWS-03',
    name: 'Newsletter — Footer Strip',
    description:
      'Compact full-width newsletter strip for the footer — one-line email field and button that persists site-wide across the homepage and content pages. Klaviyo footer embed pattern.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'klaviyo', 'footer'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Footer Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Stay in the loop',
        subtitle: 'Product news and occasional offers.',
        layout: { layout: 'inline-row' },
        fields: {
          emailPlaceholder: 'Email address',
          ctaLabel: 'Sign up',
          consentText: 'By signing up you agree to our privacy policy.',
          successBody: 'Thanks — you’re subscribed.',
        },
        blocks: [],
      },
      placement: {
        enabled_on: { templates: ['index', 'page', 'blog', 'article', 'collection', 'product'] as PlaceableTemplate[], groups: ['footer'] },
      },
      style: {
        layout: { mode: 'inline', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#e5e7eb', background: '#0b0f19', seed: '#3b82f6', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // NSEC-NEWS-04 — Multi-step email → SMS capture (Klaviyo/Privy multi-step form, blocks = steps).
  {
    id: 'NSEC-NEWS-04',
    name: 'Newsletter — Multi-Step Email then SMS',
    description:
      'Progressive multi-step capture — step 1 email, step 2 phone/SMS consent, step 3 discount reveal — as reorderable step blocks. Klaviyo/Privy multi-step signup form.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'sms-capture', 'klaviyo', 'multi-step', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Multi-Step Email then SMS',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Get 15% off — two quick steps',
        subtitle: 'Add your email, then opt in for text alerts if you’d like.',
        layout: { layout: 'stepped' },
        fields: {
          discountRevealCode: 'WELCOME15',
          progressStyle: 'dots',
          successHeadline: 'Here’s your 15% off',
          successBody: 'Code WELCOME15 — sent to your inbox too.',
        },
        blocks: [
          {
            kind: 'step',
            text: 'Where should we send your discount?',
            fields: { step: 1, field: 'email', label: 'Email address', placeholder: 'you@email.com', ctaLabel: 'Continue', required: true, channel: 'email', consent: 'email' },
          },
          {
            kind: 'step',
            text: 'Want restock + drop alerts by text?',
            fields: { step: 2, field: 'phone', label: 'Mobile number', placeholder: '(555) 000-0000', ctaLabel: 'Get my code', required: false, skipLabel: 'No thanks', channel: 'sms', consent: 'sms' },
          },
          {
            kind: 'step',
            text: 'You’re on the list.',
            fields: { step: 3, kind: 'success', showDiscount: true },
          },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#6d28d9', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // NSEC-NEWS-05 — Popup-style centered capture card (Privy/Omnisend popup rendered in-body).
  {
    id: 'NSEC-NEWS-05',
    name: 'Newsletter — Popup-Style Welcome Card',
    description:
      'Centered welcome-offer capture card styled like a popup, rendered in-body where placed — dimmed-card framing, email field, and discount reveal. Privy/Omnisend welcome popup look.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'privy', 'omnisend'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Popup-Style Welcome Card',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'overlay',
        title: 'Before you go — save 10%',
        subtitle: 'Pop your email in and we’ll send a code you can use today.',
        layout: { layout: 'centered' },
        fields: {
          emailPlaceholder: 'you@email.com',
          ctaLabel: 'Send my code',
          dismissLabel: 'No thanks, I’ll pay full price',
          trigger: 'exit_intent',
          frequency: 'once_per_session',
          consentText: 'You’re signing up for marketing emails. Unsubscribe anytime.',
          discountRevealCode: 'SAVE10',
          successHeadline: 'Copied — SAVE10',
          successBody: 'Apply it at checkout for 10% off your order.',
        },
        blocks: [
          { kind: 'benefit', text: 'Free shipping over $50', fields: { icon: 'truck' } },
          { kind: 'benefit', text: '30-day easy returns', fields: { icon: 'refresh' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection', 'product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'medium', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#db2777', overlayBackdrop: '#1f1147', overlayBackdropOpacity: 0.55 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },

  // NSEC-NEWS-06 — Blog/article inline capture with trust badges (Omnisend inline + legal-consent block).
  {
    id: 'NSEC-NEWS-06',
    name: 'Newsletter — Article Inline with Trust Badges',
    description:
      'Inline capture placed mid- or end-of-article, with a short pitch, email field, and a row of trust badges (subscriber count, no-spam, unsubscribe). Omnisend inline form with consent block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'omnisend', 'article', 'trust'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Article Inline with Trust Badges',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Enjoying the read?',
        subtitle: 'Get our next guide straight to your inbox.',
        layout: { layout: 'stacked' },
        fields: {
          emailPlaceholder: 'Your best email',
          ctaLabel: 'Send me guides',
          consentText: 'One email when we publish. No spam, unsubscribe in a click.',
          successBody: 'Subscribed — the next guide is on its way.',
        },
        blocks: [
          { kind: 'badge', text: 'Joined by 12,000+ readers', fields: { icon: 'users' } },
          { kind: 'badge', text: 'No spam, ever', fields: { icon: 'shield' } },
          { kind: 'badge', text: 'Unsubscribe anytime', fields: { icon: 'x-circle' } },
        ],
      },
      placement: { enabled_on: { templates: ['article', 'blog'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'medium', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { seed: '#059669', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-NEWS-07 — Minimal-luxe centered single-field capture (Editorial/Minimal-Luxe, homepage hero band).
  {
    id: 'NSEC-NEWS-07',
    name: 'Newsletter — Minimal Centered Capture',
    description:
      'Restrained centered single-line capture band for the homepage — hairline underline field, one word CTA, near-mono palette.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'index', 'centered'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Minimal Centered Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Join the list',
        subtitle: 'Occasional letters. New work, first.',
        layout: { layout: 'centered' },
        fields: {
          emailPlaceholder: 'Email',
          ctaLabel: 'Subscribe',
          fieldStyle: 'underline',
          consentText: 'We only email when there’s something worth sending.',
          successBody: 'Thank you.',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: '2XL', weight: 'normal', lineHeight: 'tight', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'none', borderWidth: 'thin', shadow: 'none', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-NEWS-08 — Benefit-grid capture with value props (Privy/Omnisend benefit blocks), page surface.
  {
    id: 'NSEC-NEWS-08',
    name: 'Newsletter — Benefit Grid Capture',
    description:
      'Newsletter capture over a grid of value-prop cards — each benefit a reorderable block — with the email form beneath. Conversion-focused signup for a landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'newsletter',
    tags: ['section', 'newsletter', 'email-capture', 'privy', 'page', 'grid'],
    spec: {
      type: 'theme.section',
      name: 'Newsletter — Benefit Grid Capture',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'newsletter',
        activation: 'section',
        title: 'Subscribe and save on every order',
        subtitle: 'Here’s what you get the moment you join.',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          emailPlaceholder: 'you@email.com',
          ctaLabel: 'Join now',
          consentText: 'By joining you agree to receive marketing emails. Unsubscribe anytime.',
          discountRevealCode: 'JOIN10',
          successHeadline: 'Welcome aboard',
          successBody: 'Your code JOIN10 is ready and in your inbox.',
        },
        blocks: [
          { kind: 'benefit', text: '10% off your first order', fields: { icon: 'tag', headline: 'Instant welcome offer' } },
          { kind: 'benefit', text: 'First look at every new drop', fields: { icon: 'sparkle', headline: 'Early access' } },
          { kind: 'benefit', text: 'Back-in-stock alerts you can trust', fields: { icon: 'bell', headline: 'Restock alerts' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#2563eb', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },
];
