import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-STOCK — V-A A3: stock counter / low-stock urgency alert.
 *
 * recipeType = `theme.section`, kind `stock-counter` (→ `band` archetype). Competitor
 * parity: Hextom / FoxKit inventory urgency. HONESTY is the whole point: the storefront
 * Liquid renders the count from REAL product inventory
 * (`product.selected_or_first_available_variant.inventory_quantity`) and ONLY when the
 * product tracks inventory AND `0 < qty ≤ threshold`. Outside a product context, or when
 * inventory is untracked, it renders NOTHING — there is no fake-number mode and zero JS.
 * The builder preview shows an illustrative count plus a "live inventory on the storefront"
 * affordance so the merchant understands the number is real, not seeded.
 *
 * MODEL: presentation-only, no blocks. `config.fields.threshold` sets the visibility cutoff,
 * `config.fields.messageTemplate` carries a `{count}` token, and `config.fields.urgency`
 * toggles the emphasised (pulsing) styling. Placement targets the product page.
 */
export const NATIVE_STOCK_COUNTER_TEMPLATES: TemplateEntry[] = [
  // 01 — urgency PDP counter, threshold 10, emphasised styling.
  {
    id: 'NSEC-STOCK-01',
    name: 'Low-Stock Urgency Counter (PDP)',
    description: 'Product-page urgency chip that shows the real remaining inventory when stock falls to ten or fewer — pulsing accent styling to nudge the purchase. Renders nothing when stock is healthy or untracked.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'countdown',
    tags: ['section', 'stock-counter', 'urgency', 'inventory', 'scarcity', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Low-Stock Urgency Counter',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'stock-counter',
        activation: 'section',
        title: '',
        subtitle: 'Shows real remaining inventory when stock is low.',
        layout: { layout: 'stacked' },
        fields: { threshold: 10, messageTemplate: 'Only {count} left in stock — order soon!', urgency: true },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#ff4d2e' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // 02 — minimal-luxe variant, threshold 5, quiet styling.
  {
    id: 'NSEC-STOCK-02',
    name: 'Minimal Low-Stock Note (Luxe)',
    description: 'Understated low-stock note that appears only when five or fewer units remain — quiet, no pulsing — for stores that want honest scarcity without the hard sell. Hidden when stock is healthy or untracked.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'countdown',
    tags: ['section', 'stock-counter', 'inventory', 'scarcity', 'minimal', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Minimal Low-Stock Note',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'stock-counter',
        activation: 'section',
        title: '',
        subtitle: 'Appears only when a few units remain — real inventory, no hard sell.',
        layout: { layout: 'stacked' },
        fields: { threshold: 5, messageTemplate: 'Low stock — {count} remaining', urgency: false },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f172a' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },
];
