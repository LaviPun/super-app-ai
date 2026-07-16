import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-TAB — tabs (V-B renderer batch B11, GemPages/PageFly-class).
 *
 * `theme.section` templates, `kind: 'tabs'`, that map to the faq archetype but render
 * an ARIA tablist. Each `tab` block ({ text: label, fields.body richtext }) renders
 * as a heading + body panel — ALL visible as the no-JS/SEO fallback (so the copy is
 * always in the DOM for search engines). superapp-modules.js builds the tablist
 * (full arrow/Home/End keyboard pattern) and shows one panel at a time.
 */
export const NATIVE_TABS_TEMPLATES: TemplateEntry[] = [
  // NSEC-TAB-01 — Product details tabs (Editorial, luxe).
  {
    id: 'NSEC-TAB-01',
    name: 'Tabs — Product Details',
    description: 'A tabbed product-details block splitting description, ingredients, and shipping into an ARIA tablist — all copy stays in the DOM (SEO/no-JS), for a product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'tabs', 'product-details', 'accordion', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Tabs — Product Details',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'tabs',
        activation: 'section',
        title: 'The details',
        subtitle: 'Everything you need to know before you buy.',
        fields: {},
        blocks: [
          { kind: 'tab', text: 'Description', fields: { body: 'A weightless daily moisturizer that layers over serum and under SPF. Fast-absorbing, unscented, and made for sensitive skin.' } },
          { kind: 'tab', text: 'Ingredients', fields: { body: 'Water, glycerin, squalane, niacinamide, panthenol, sodium hyaluronate, tocopherol. Free of fragrance, parabens, and dyes.' } },
          { kind: 'tab', text: 'Shipping & returns', fields: { body: 'Free carbon-neutral shipping over $40. Ships in 1–2 business days. 30-day returns, no questions asked.' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-TAB-02 — Service plan tabs (Bold DTC / SaaS).
  {
    id: 'NSEC-TAB-02',
    name: 'Tabs — Service Plans',
    description: 'A tabbed block comparing monthly, annual, and team service plans in an ARIA tablist — each plan panel stays in the DOM (SEO/no-JS), for a pricing or landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'tabs', 'plans', 'pricing', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Tabs — Service Plans',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'tabs',
        activation: 'section',
        title: 'Pick your plan',
        subtitle: 'Switch anytime — no lock-in.',
        fields: {},
        blocks: [
          { kind: 'tab', text: 'Monthly', fields: { body: '$29/mo. Full access, cancel anytime, priority email support. Best for trying things out before you commit.' } },
          { kind: 'tab', text: 'Annual', fields: { body: '$290/yr (save 17%). Everything in Monthly plus quarterly strategy reviews and early feature access.' } },
          { kind: 'tab', text: 'Team', fields: { body: '$79/mo for up to 10 seats. Shared workspaces, role permissions, and a dedicated onboarding session.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#f8fafc', background: '#111827', overlayBackdropOpacity: 0.4, seed: '#22d3ee' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];
