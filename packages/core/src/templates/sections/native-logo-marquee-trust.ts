import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-MARQ — native-section logo marquee / trust strip (surface-coverage 034).
 *
 * Eight `theme.section` templates that compile to a self-contained native
 * `sections/superapp-<slug>.liquid` (ThemeDeployMode `native_section`, recipe.ts:100)
 * OR to the shipped app-block metaobject. All are pure presentation — a horizontal
 * band of brand/press logos, payment/security marks, guarantee icons, or big-number
 * trust stats. The logo/mark IMAGES are merchant-supplied (each block carries a demo
 * `imageUrl` so the preview + editor render a realistic strip); a merchant swaps in
 * their own asset URLs and links per block. No live event store, no third-party review
 * pull, no visitor-metered counter (a real ProveSource-style number needs an external
 * event backend — out of scope for a static section; see provesource.md mapping_note).
 * Where a "12,000+ sold" style stat appears it is an AUTHORED figure in `fields`, not a
 * live metered count.
 *
 * Grounding: design-vocabulary §2 "Logo / trust marquee — scroll-velocity-driven" +
 * "QR / credit-card trust marks" + Number-Ticker "12,000+ sold"; ProveSource's
 * Social-counter / Live-visitor big-number and inline PDP trust-widget veneer
 * (provesource.md surfaces/visual_patterns). Layout variants (scroll-marquee · static-grid ·
 * mono-row · framed) are driven by the same token set so no two stores look templated;
 * they differ only by `layout.layout`, `fields.*`, `style.*`, and block arrangement.
 */
export const NATIVE_LOGO_MARQUEE_TRUST_TEMPLATES: TemplateEntry[] = [
  {
    id: 'NSEC-MARQ-01',
    name: 'Brand Logo Marquee — Scrolling',
    description:
      'Infinite scroll-velocity logo marquee of partner/retailer brand logos for the homepage — a continuous "trusted by" band above the fold.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'logo-marquee', 'trust', 'social-proof', 'index', 'marquee', 'bold-dtc'],
    spec: {
      type: 'theme.section',
      name: 'Brand Logo Marquee — Scrolling',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'logo-marquee',
        activation: 'section',
        title: 'Trusted by leading brands',
        layout: { layout: 'carousel' },
        fields: {
          scrollDirection: 'left',
          scrollSpeed: 'medium',
          pauseOnHover: true,
          grayscaleLogos: true,
          logoHeight: 40,
          gapBetweenLogos: 'loose',
          duplicateForLoop: true,
        },
        blocks: [
          { kind: 'logo', text: 'Northwind', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-01.svg', url: 'https://example.com/press/northwind', fields: { alt: 'Northwind' } },
          { kind: 'logo', text: 'Aperture', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-02.svg', url: 'https://example.com/press/aperture', fields: { alt: 'Aperture' } },
          { kind: 'logo', text: 'Meridian', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-03.svg', fields: { alt: 'Meridian' } },
          { kind: 'logo', text: 'Halcyon', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-04.svg', fields: { alt: 'Halcyon' } },
          { kind: 'logo', text: 'Vantage', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-05.svg', fields: { alt: 'Vantage' } },
          { kind: 'logo', text: 'Cobalt', imageUrl: 'https://cdn.shopify.com/s/files/logos/brand-06.svg', fields: { alt: 'Cobalt' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'loose', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#6b7280', background: '#ffffff', overlayBackdropOpacity: 0.45, seed: '#111827' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'standard' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-02',
    name: 'As Seen In — Press Logo Row',
    description:
      'Static centered row of press / publication logos with an "As seen in" eyebrow for the homepage — a mono, evenly-spaced credibility strip.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'press', 'as-seen-in', 'trust', 'social-proof', 'index', 'editorial-wellness'],
    spec: {
      type: 'theme.section',
      name: 'As Seen In — Press Logo Row',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'logo-marquee',
        activation: 'section',
        title: 'As seen in',
        layout: { layout: 'stacked' },
        fields: {
          alignment: 'center',
          grayscaleLogos: true,
          monochrome: true,
          logoHeight: 28,
          logosPerRowDesktop: 5,
          logosPerRowMobile: 2,
          gapBetweenLogos: 'loose',
        },
        blocks: [
          { kind: 'logo', text: 'The Ledger', imageUrl: 'https://cdn.shopify.com/s/files/logos/press-01.svg', url: 'https://example.com/press/ledger', fields: { alt: 'The Ledger' } },
          { kind: 'logo', text: 'Frontier', imageUrl: 'https://cdn.shopify.com/s/files/logos/press-02.svg', url: 'https://example.com/press/frontier', fields: { alt: 'Frontier' } },
          { kind: 'logo', text: 'Dispatch', imageUrl: 'https://cdn.shopify.com/s/files/logos/press-03.svg', fields: { alt: 'Dispatch' } },
          { kind: 'logo', text: 'Bureau', imageUrl: 'https://cdn.shopify.com/s/files/logos/press-04.svg', fields: { alt: 'Bureau' } },
          { kind: 'logo', text: 'Quarterly', imageUrl: 'https://cdn.shopify.com/s/files/logos/press-05.svg', fields: { alt: 'Quarterly' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XS', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#9ca3af', background: '#ffffff', overlayBackdropOpacity: 0.45, seed: '#111827' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-03',
    name: 'Payment & Security Trust Marks',
    description:
      'Centered strip of accepted-payment and security marks (card networks, wallets, SSL/checkout badges) for the cart and product pages to lift checkout confidence.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'trust-badges', 'payment', 'security', 'cart', 'product', 'tech-utility'],
    spec: {
      type: 'theme.section',
      name: 'Payment & Security Trust Marks',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        title: 'Secure checkout',
        subtitle: 'Encrypted payments · trusted by shoppers worldwide',
        layout: { layout: 'stacked' },
        fields: {
          alignment: 'center',
          badgeHeight: 32,
          badgesPerRowDesktop: 6,
          badgesPerRowMobile: 3,
          showSslNote: true,
          sslNoteText: '256-bit SSL encrypted checkout',
        },
        blocks: [
          { kind: 'badge', text: 'Visa', imageUrl: 'https://cdn.shopify.com/s/files/marks/visa.svg', fields: { alt: 'Visa' } },
          { kind: 'badge', text: 'Mastercard', imageUrl: 'https://cdn.shopify.com/s/files/marks/mastercard.svg', fields: { alt: 'Mastercard' } },
          { kind: 'badge', text: 'American Express', imageUrl: 'https://cdn.shopify.com/s/files/marks/amex.svg', fields: { alt: 'American Express' } },
          { kind: 'badge', text: 'PayPal', imageUrl: 'https://cdn.shopify.com/s/files/marks/paypal.svg', fields: { alt: 'PayPal' } },
          { kind: 'badge', text: 'Apple Pay', imageUrl: 'https://cdn.shopify.com/s/files/marks/apple-pay.svg', fields: { alt: 'Apple Pay' } },
          { kind: 'badge', text: 'Shop Pay', imageUrl: 'https://cdn.shopify.com/s/files/marks/shop-pay.svg', fields: { alt: 'Shop Pay' } },
        ],
      },
      placement: { enabled_on: { templates: ['cart', 'product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#374151', background: '#f9fafb', border: '#e5e7eb', overlayBackdropOpacity: 0.45, seed: '#111827' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-04',
    name: 'Guarantee Icons — Shipping & Returns Strip',
    description:
      'Row of guarantee icons with short labels (free shipping, easy returns, secure checkout, warranty) for the product page — the classic reassurance strip under the buy box.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'trust-badges', 'guarantee', 'shipping', 'returns', 'product', 'apple-hig-clean'],
    spec: {
      type: 'theme.section',
      name: 'Guarantee Icons — Shipping & Returns Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          iconsPerRowDesktop: 4,
          iconsPerRowMobile: 2,
          iconSize: 28,
          labelPosition: 'below',
          showDividers: true,
        },
        blocks: [
          { kind: 'badge', text: 'Free shipping over $50', imageUrl: 'https://cdn.shopify.com/s/files/icons/truck.svg', fields: { alt: 'Free shipping', caption: 'Delivered in 2–4 business days' } },
          { kind: 'badge', text: '30-day easy returns', imageUrl: 'https://cdn.shopify.com/s/files/icons/return.svg', fields: { alt: 'Returns', caption: 'No-questions-asked refunds' } },
          { kind: 'badge', text: 'Secure checkout', imageUrl: 'https://cdn.shopify.com/s/files/icons/lock.svg', fields: { alt: 'Secure', caption: 'SSL-encrypted payment' } },
          { kind: 'badge', text: '2-year warranty', imageUrl: 'https://cdn.shopify.com/s/files/icons/shield.svg', fields: { alt: 'Warranty', caption: 'Covered against defects' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#111827', background: '#ffffff', overlayBackdropOpacity: 0.45, seed: '#2563eb' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-05',
    name: 'Framed Retailer Logo Grid',
    description:
      'Static bordered logo grid of stockists / retail partners inside framed cells for a page or about section — a tidy "available at" credibility block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'logo-marquee', 'stockists', 'trust', 'grid', 'page', 'minimal-luxe'],
    spec: {
      type: 'theme.section',
      name: 'Framed Retailer Logo Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'logo-marquee',
        activation: 'section',
        title: 'Available at',
        subtitle: 'Find us in select retailers nationwide',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          logosPerRowDesktop: 4,
          logosPerRowMobile: 2,
          framedCells: true,
          logoHeight: 44,
          grayscaleLogos: false,
        },
        blocks: [
          { kind: 'logo', text: 'Marketside', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-01.svg', url: 'https://example.com/stockists/marketside', fields: { alt: 'Marketside' } },
          { kind: 'logo', text: 'Provisions', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-02.svg', url: 'https://example.com/stockists/provisions', fields: { alt: 'Provisions' } },
          { kind: 'logo', text: 'Corner Store', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-03.svg', fields: { alt: 'Corner Store' } },
          { kind: 'logo', text: 'Harborview', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-04.svg', fields: { alt: 'Harborview' } },
          { kind: 'logo', text: 'Union Market', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-05.svg', fields: { alt: 'Union Market' } },
          { kind: 'logo', text: 'Greenfield', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-06.svg', fields: { alt: 'Greenfield' } },
          { kind: 'logo', text: 'Lantern', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-07.svg', fields: { alt: 'Lantern' } },
          { kind: 'logo', text: 'Cedar & Co', imageUrl: 'https://cdn.shopify.com/s/files/logos/stock-08.svg', fields: { alt: 'Cedar & Co' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { text: '#1f2937', background: '#ffffff', border: '#e5e7eb', overlayBackdropOpacity: 0.45, seed: '#1f2937' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-06',
    name: 'Trust Stat Strip — Big Numbers',
    description:
      'Row of big-number trust stats (customers served, orders shipped, average rating) as authored figures for the homepage — a number-ticker credibility band.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'trust', 'stats', 'social-proof', 'number-ticker', 'index', 'bold-dtc'],
    spec: {
      type: 'theme.section',
      name: 'Trust Stat Strip — Big Numbers',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        title: 'Why shoppers choose us',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          statsPerRowDesktop: 3,
          statsPerRowMobile: 1,
          animateCountUp: true,
          showDividers: true,
          note: 'Figures are merchant-authored, not a live metered count.',
        },
        blocks: [
          { kind: 'stat', text: '120,000+', fields: { label: 'Happy customers', suffix: '' } },
          { kind: 'stat', text: '4.9/5', fields: { label: 'Average rating', suffix: 'across verified reviews' } },
          { kind: 'stat', text: '1M+', fields: { label: 'Orders shipped', suffix: 'since 2019' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#0f172a', background: '#f8fafc', overlayBackdropOpacity: 0.45, seed: '#0ea5e9' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-07',
    name: 'Certification & Compliance Badges',
    description:
      'Inline strip of certification and compliance marks (organic, cruelty-free, carbon-neutral, GMP) for the product page to signal standards and values.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'trust-badges', 'certification', 'compliance', 'product', 'editorial-wellness'],
    spec: {
      type: 'theme.section',
      name: 'Certification & Compliance Badges',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust-badges',
        activation: 'section',
        subtitle: 'Independently certified',
        layout: { layout: 'stacked' },
        fields: {
          alignment: 'center',
          badgeHeight: 48,
          badgesPerRowDesktop: 4,
          badgesPerRowMobile: 2,
          showLabels: true,
          grayscaleLogos: false,
        },
        blocks: [
          { kind: 'badge', text: 'Certified Organic', imageUrl: 'https://cdn.shopify.com/s/files/marks/organic.svg', url: 'https://example.com/certifications/organic', fields: { alt: 'Certified Organic' } },
          { kind: 'badge', text: 'Cruelty-Free', imageUrl: 'https://cdn.shopify.com/s/files/marks/cruelty-free.svg', fields: { alt: 'Cruelty-Free' } },
          { kind: 'badge', text: 'Carbon Neutral', imageUrl: 'https://cdn.shopify.com/s/files/marks/carbon-neutral.svg', fields: { alt: 'Carbon Neutral' } },
          { kind: 'badge', text: 'GMP Certified', imageUrl: 'https://cdn.shopify.com/s/files/marks/gmp.svg', fields: { alt: 'GMP Certified' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XS', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#4b5563', background: '#ffffff', overlayBackdropOpacity: 0.45, seed: '#16a34a' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-MARQ-08',
    name: 'Partner Logo Marquee — Dark Mono Row',
    description:
      'Dark-ground monochrome partner-logo marquee for a footer or below-fold band — a low-key, high-trust "integrates with" scrolling row for tech/utility stores.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'logo-marquee', 'partners', 'trust', 'marquee', 'index', 'tech-utility'],
    spec: {
      type: 'theme.section',
      name: 'Partner Logo Marquee — Dark Mono Row',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'logo-marquee',
        activation: 'section',
        title: 'Integrates with your stack',
        layout: { layout: 'carousel' },
        fields: {
          scrollDirection: 'right',
          scrollSpeed: 'slow',
          pauseOnHover: true,
          monochrome: true,
          invertOnDark: true,
          logoHeight: 32,
          gapBetweenLogos: 'loose',
          duplicateForLoop: true,
        },
        blocks: [
          { kind: 'logo', text: 'Relay', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-01.svg', fields: { alt: 'Relay' } },
          { kind: 'logo', text: 'Segment', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-02.svg', fields: { alt: 'Segment' } },
          { kind: 'logo', text: 'Beacon', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-03.svg', fields: { alt: 'Beacon' } },
          { kind: 'logo', text: 'Conduit', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-04.svg', fields: { alt: 'Conduit' } },
          { kind: 'logo', text: 'Pylon', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-05.svg', fields: { alt: 'Pylon' } },
          { kind: 'logo', text: 'Cortex', imageUrl: 'https://cdn.shopify.com/s/files/logos/partner-06.svg', fields: { alt: 'Cortex' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'loose', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#e5e7eb', background: '#0b0f19', overlayBackdropOpacity: 0.45, seed: '#38bdf8' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'standard' },
      },
    },
  },
];
