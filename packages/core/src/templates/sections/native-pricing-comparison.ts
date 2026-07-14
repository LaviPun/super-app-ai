import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * Native-section pricing table / comparison templates (NSEC-PRICE-01..08).
 *
 * All are `theme.section` specs — the design-vocabulary "Pricing / plan compare"
 * catalog entry (design-vocabulary.md §2, line ~163: "with a recommended-tier
 * emphasis") realized as 8 layout variants driven by the SAME token set (§2 line
 * 157). Grounded in the page-builder corpus (pagefly.md / gempages.md): every
 * variant is a section → row → column tree of `plan`/`feature`/`row` blocks with a
 * global-style token set, dynamic-binding-free static content, and a
 * responsive-per-device styling model — the slice of a page-builder Pricing
 * section that maps cleanly onto our vocabulary (pagefly.md:123-125,
 * gempages.md:122-124).
 *
 * The reorderable `config.blocks[]` array IS the plan/feature list the merchant
 * add/reorders; `blocks[].kind` is the block type, `text` the block copy, and
 * everything richer (price, period, features[], recommended, cell values) lives in
 * `blocks[].fields`. `config.layout.layout` selects the layout variant; the six
 * style packs (design-vocabulary §4) supply the mood per variant.
 *
 * These compile via the native-section deploy MODE (recipe.ts:90-100) — a
 * self-contained `sections/superapp-<slug>.liquid` with a native `{% schema %}` —
 * but the RecipeSpec is an ordinary `theme.section`; native_section is a compile
 * target, not a spec type. Every `spec` parses against RecipeSpecSchema.
 */
export const NATIVE_PRICING_COMPARISON_TEMPLATES: TemplateEntry[] = [
  // 01 — 3-tier compare, recommended highlight (the canonical design-vocabulary case).
  {
    id: 'NSEC-PRICE-01',
    name: 'Pricing — 3-Tier Compare (Recommended Highlight)',
    description: 'Three-column pricing compare on the page with an emphasized "recommended" middle tier — accent border, lift, and badge. Reorderable plan blocks.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'plan-compare', 'cta', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — 3-Tier Compare',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pricing',
        activation: 'section',
        title: 'Choose your plan',
        subtitle: 'Cancel anytime. No hidden fees.',
        layout: { layout: 'columns', columns: 3 },
        fields: { columnsDesktop: 3, columnsMobile: 1, highlightBlockIndex: 1, currency: 'USD', billingNote: 'Billed monthly' },
        blocks: [
          { kind: 'plan', text: 'Starter', fields: { price: '19', period: 'mo', ctaLabel: 'Start free', ctaUrl: '/pages/signup', features: ['1 store', 'Core analytics', 'Email support'], recommended: false } },
          { kind: 'plan', text: 'Growth', fields: { price: '49', period: 'mo', ctaLabel: 'Choose Growth', ctaUrl: '/pages/signup?plan=growth', features: ['5 stores', 'Advanced analytics', 'Priority support', 'A/B testing'], recommended: true, badge: 'Most popular' } },
          { kind: 'plan', text: 'Scale', fields: { price: '99', period: 'mo', ctaLabel: 'Choose Scale', ctaUrl: '/pages/signup?plan=scale', features: ['Unlimited stores', 'Custom reports', 'Dedicated CSM', 'SLA'], recommended: false } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#4f46e5' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // 02 — Monthly/annual toggle framing, 2-tier simple.
  {
    id: 'NSEC-PRICE-02',
    name: 'Pricing — 2-Tier Simple (Monthly / Annual)',
    description: 'Two-column pricing block with a monthly/annual framing note and a highlighted premium tier — for a focused free-vs-pro decision on a landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'plan-compare', 'freemium', 'landing'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — 2-Tier Simple',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pricing',
        activation: 'section',
        title: 'Simple, transparent pricing',
        subtitle: 'Save 20% with annual billing',
        layout: { layout: 'columns', columns: 2 },
        fields: { columnsDesktop: 2, columnsMobile: 1, highlightBlockIndex: 1, currency: 'USD', billingCycle: 'annual', annualDiscountPercent: 20 },
        blocks: [
          { kind: 'plan', text: 'Free', fields: { price: '0', period: 'mo', ctaLabel: 'Get started', ctaUrl: '/pages/signup', features: ['Up to 100 orders/mo', 'Standard checkout', 'Community support'], recommended: false } },
          { kind: 'plan', text: 'Pro', fields: { price: '39', period: 'mo', annualPrice: '374', ctaLabel: 'Go Pro', ctaUrl: '/pages/signup?plan=pro', features: ['Unlimited orders', 'Advanced checkout', 'Priority support', 'Custom domain'], recommended: true, badge: 'Best value' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0071e3' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // 03 — Feature comparison MATRIX (rows = features, cols = plans).
  {
    id: 'NSEC-PRICE-03',
    name: 'Pricing — Feature Comparison Matrix',
    description: 'Full feature-by-plan comparison table where each row is a feature and columns are the plans, with check/dash cells — the "compare all features" grid under a pricing block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'comparison', 'feature-matrix', 'table'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — Feature Comparison Matrix',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'comparison',
        activation: 'section',
        title: 'Compare all features',
        subtitle: 'Everything included in each plan',
        layout: { layout: 'stacked' },
        fields: {
          planNames: ['Starter', 'Growth', 'Scale'],
          highlightColumnIndex: 1,
          checkGlyph: '✓',
          dashGlyph: '—',
          stickyHeader: true,
        },
        blocks: [
          { kind: 'row', text: 'Included stores', fields: { cells: ['1', '5', 'Unlimited'] } },
          { kind: 'row', text: 'Analytics dashboard', fields: { cells: ['Basic', 'Advanced', 'Advanced'] } },
          { kind: 'row', text: 'A/B testing', fields: { cells: ['—', '✓', '✓'] } },
          { kind: 'row', text: 'Custom reports', fields: { cells: ['—', '—', '✓'] } },
          { kind: 'row', text: 'Priority support', fields: { cells: ['—', '✓', '✓'] } },
          { kind: 'row', text: 'Dedicated CSM', fields: { cells: ['—', '—', '✓'] } },
          { kind: 'row', text: 'SLA', fields: { cells: ['—', '—', '99.9%'] } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0ea5e9' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // 04 — 4-tier compact grid (enterprise ladder).
  {
    id: 'NSEC-PRICE-04',
    name: 'Pricing — 4-Tier Compact Grid',
    description: 'Dense four-column pricing grid from free to enterprise with a highlighted business tier — a compact plan ladder for SaaS-style catalogs.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'plan-compare', 'grid', 'enterprise'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — 4-Tier Compact Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pricing',
        activation: 'section',
        title: 'Plans for every stage',
        subtitle: 'Upgrade or downgrade anytime',
        layout: { layout: 'grid', columns: 4 },
        fields: { columnsDesktop: 4, columnsMobile: 1, highlightBlockIndex: 2, currency: 'USD' },
        blocks: [
          { kind: 'plan', text: 'Free', fields: { price: '0', period: 'mo', ctaLabel: 'Start', ctaUrl: '/pages/signup', features: ['1 seat', 'Core features'], recommended: false } },
          { kind: 'plan', text: 'Starter', fields: { price: '15', period: 'mo', ctaLabel: 'Choose', ctaUrl: '/pages/signup?plan=starter', features: ['3 seats', 'Integrations'], recommended: false } },
          { kind: 'plan', text: 'Business', fields: { price: '45', period: 'mo', ctaLabel: 'Choose', ctaUrl: '/pages/signup?plan=business', features: ['10 seats', 'Advanced controls', 'Priority support'], recommended: true, badge: 'Popular' } },
          { kind: 'plan', text: 'Enterprise', fields: { price: 'Custom', period: '', ctaLabel: 'Contact sales', ctaUrl: '/pages/contact', features: ['Unlimited seats', 'SSO/SAML', 'Dedicated CSM', 'SLA'], recommended: false } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { text: '#0b1120', background: '#0f172a', overlayBackdropOpacity: 0.45, seed: '#38bdf8' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'md', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // 05 — Single hero-plan spotlight (one product, framed as a plan).
  {
    id: 'NSEC-PRICE-05',
    name: 'Pricing — Single Plan Spotlight',
    description: 'One-plan pricing spotlight card with a large price, an itemized feature list, and a prominent CTA — for a single-offer or membership page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'single-plan', 'membership', 'spotlight'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — Single Plan Spotlight',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pricing',
        activation: 'section',
        title: 'Membership',
        subtitle: 'One price. Everything unlocked.',
        layout: { layout: 'stacked' },
        fields: { columnsDesktop: 1, columnsMobile: 1, highlightBlockIndex: 0, currency: 'USD' },
        blocks: [
          { kind: 'plan', text: 'All-Access', fields: { price: '129', period: 'yr', ctaLabel: 'Become a member', ctaUrl: '/pages/join', features: ['Free shipping on every order', 'Members-only drops', 'Early access sales', 'Concierge support', 'Birthday reward'], recommended: true, badge: 'Members save 15%' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'LG', weight: 'medium', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f172a' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'sm', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // 06 — Two-product "this vs that" head-to-head comparison.
  {
    id: 'NSEC-PRICE-06',
    name: 'Pricing — Head-to-Head Compare (This vs That)',
    description: 'Side-by-side two-column head-to-head comparison contrasting two options attribute by attribute, with a winner-highlighted column — a "why choose us" table.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'comparison', 'versus', 'table', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — Head-to-Head Compare',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'comparison',
        activation: 'section',
        title: 'Why switch to us',
        subtitle: 'See how we stack up',
        layout: { layout: 'stacked' },
        fields: {
          columnNames: ['Us', 'The other guys'],
          highlightColumnIndex: 0,
          checkGlyph: '✓',
          dashGlyph: '✕',
        },
        blocks: [
          { kind: 'row', text: 'Free 2-day shipping', fields: { cells: ['✓', '✕'] } },
          { kind: 'row', text: 'No subscription lock-in', fields: { cells: ['✓', '✕'] } },
          { kind: 'row', text: '365-day returns', fields: { cells: ['✓', '30 days'] } },
          { kind: 'row', text: 'Carbon-neutral delivery', fields: { cells: ['✓', '✕'] } },
          { kind: 'row', text: 'Price', fields: { cells: ['$49', '$79'] } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'product', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#dc2626' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // 07 — Tiered bundle / quantity pricing (buy-more-save-more, presentation only).
  {
    id: 'NSEC-PRICE-07',
    name: 'Pricing — Tiered Quantity (Buy More, Save More)',
    description: 'Quantity-tier pricing block presenting buy-more-save-more bundles (1 / 2 / 3-pack) with per-unit prices and a best-value badge — a volume-pricing display card.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'pricing', 'bundle', 'quantity-tiers', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Pricing — Tiered Quantity',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pricing',
        activation: 'section',
        title: 'Buy more, save more',
        subtitle: 'The more you bundle, the less you pay per unit',
        layout: { layout: 'columns', columns: 3 },
        fields: { columnsDesktop: 3, columnsMobile: 1, highlightBlockIndex: 2, currency: 'USD', basisLabel: 'per unit' },
        blocks: [
          { kind: 'plan', text: 'Single', fields: { quantity: 1, price: '30', unitPrice: '30', ctaLabel: 'Add 1', ctaUrl: '/cart/add', savingsLabel: '', recommended: false } },
          { kind: 'plan', text: 'Double', fields: { quantity: 2, price: '54', unitPrice: '27', ctaLabel: 'Add 2', ctaUrl: '/cart/add', savingsLabel: 'Save 10%', recommended: false } },
          { kind: 'plan', text: 'Triple', fields: { quantity: 3, price: '72', unitPrice: '24', ctaLabel: 'Add 3', ctaUrl: '/cart/add', savingsLabel: 'Save 20%', recommended: true, badge: 'Best value' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#a21caf' },
        shape: { radius: 'xl', borderWidth: 'thin', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },

  // 08 — V-A A1: volume/quantity-break table (kind: volume-tiers). Kaching/Fast
  // Bundle-class percent-off tiers as selectable radio rows; the highlighted tier is
  // pre-selected and, on the storefront, sets the product quantity input.
  {
    id: 'NSEC-VOL-01',
    name: 'Volume Bundles — 3-Tier Percent Off (Kaching-style)',
    description: 'Three selectable quantity-break rows (buy 1 / 2 / 3) with percent-off savings and a highlighted best-value tier — picking a row sets the product quantity for Add-to-cart.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'volume-tiers', 'quantity-break', 'bundle', 'product', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'Volume Bundles — 3-Tier Percent Off',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'volume-tiers',
        activation: 'section',
        title: 'Buy more, save more',
        subtitle: 'Pick a bundle — the discount is applied automatically at checkout.',
        layout: { layout: 'stacked' },
        fields: { highlightBlockIndex: 2, currency: 'USD' },
        blocks: [
          { kind: 'tier', text: 'Buy 1', fields: { quantityMin: 1, discountLabel: 'Single unit', percentOff: 0 } },
          { kind: 'tier', text: 'Buy 2', fields: { quantityMin: 2, discountLabel: 'Stock up', percentOff: 10, savingsLabel: 'Save 10%' } },
          { kind: 'tier', text: 'Buy 3', fields: { quantityMin: 3, discountLabel: 'Best value', percentOff: 20, savingsLabel: 'Save 20%', highlight: true, badge: 'Most popular' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#ff4d2e' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // 09 — V-A A1: B2B per-unit price breaks, 4 tiers.
  {
    id: 'NSEC-VOL-02',
    name: 'Bulk B2B Price Breaks — 4-Tier Per Unit',
    description: 'Four wholesale quantity tiers (1 / 5 / 10 / 25) with a falling per-unit price and a highlighted volume tier — a B2B "price breaks" selector that drives the quantity input.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'pricing',
    tags: ['section', 'volume-tiers', 'quantity-break', 'b2b', 'wholesale', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Bulk B2B Price Breaks',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'volume-tiers',
        activation: 'section',
        title: 'Wholesale price breaks',
        subtitle: 'The more units per order, the lower your per-unit price.',
        layout: { layout: 'stacked' },
        fields: { highlightBlockIndex: 2, currency: 'USD', basisLabel: 'per unit' },
        blocks: [
          { kind: 'tier', text: '1–4 units', fields: { quantityMin: 1, discountLabel: 'List price', pricePerUnit: '$30/ea' } },
          { kind: 'tier', text: '5–9 units', fields: { quantityMin: 5, discountLabel: 'Trade', pricePerUnit: '$27/ea', savingsLabel: 'Save 10%' } },
          { kind: 'tier', text: '10–24 units', fields: { quantityMin: 10, discountLabel: 'Volume', pricePerUnit: '$24/ea', savingsLabel: 'Save 20%', highlight: true, badge: 'Best rate' } },
          { kind: 'tier', text: '25+ units', fields: { quantityMin: 25, discountLabel: 'Pallet', pricePerUnit: '$21/ea', savingsLabel: 'Save 30%' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0284c7' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'utility',
      },
    },
  },
];
