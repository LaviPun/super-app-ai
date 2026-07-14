// packages/core/src/templates/blocks/themeblock-size-chart.ts
//
// V-A A8: SIZE-CHART MODAL theme-app-block templates (recipeType: theme.section).
// FoxKit / Globo-class size-guide. kind `size-chart` (→ `technical` archetype): a
// trigger button ("Size guide") opens a modal (reusing the .superapp-popup chrome
// + focus trap from the runtime) holding a responsive table. Rows are blocks
// kind:'row' with `fields.cells` (array — the SAME encoding as the pricing-matrix
// comparison rows), `block.text` = the row header; column headers come from
// `config.fields.columns`. HONEST: the storefront renders nothing when there are
// no rows. Placed on the product page.
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];
const PRODUCT_ONLY = { enabled_on: { templates: ['product'] as PlaceTpl[] } };

export const SIZE_CHART_TEMPLATES: TemplateEntry[] = [
  // ── TBLK-SIZE-01 — Apparel size chart (body measurements), minimal luxe ──
  {
    id: 'TBLK-SIZE-01',
    name: 'Apparel Size Chart Modal',
    description:
      'A "Size guide" link on the product page that opens a modal with a body-measurement table (chest / waist / hip by size), so shoppers pick the right fit without leaving the page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'table',
    tags: ['section', 'size-chart', 'size-guide', 'modal', 'product', 'apparel', 'foxkit'],
    spec: {
      type: 'theme.section',
      name: 'Apparel Size Chart',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'size-chart',
        activation: 'section',
        title: 'Size guide',
        subtitle: 'All measurements are in inches. Between sizes? Size up for a relaxed fit.',
        fields: { triggerLabel: 'Size guide', columns: ['Chest', 'Waist', 'Hip'] },
        blocks: [
          { kind: 'row', text: 'XS', fields: { cells: ['32-34', '25-27', '35-37'] } },
          { kind: 'row', text: 'S', fields: { cells: ['35-37', '28-30', '38-40'] } },
          { kind: 'row', text: 'M', fields: { cells: ['38-40', '31-33', '41-43'] } },
          { kind: 'row', text: 'L', fields: { cells: ['41-43', '34-36', '44-46'] } },
          { kind: 'row', text: 'XL', fields: { cells: ['44-46', '37-39', '47-49'] } },
        ],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#0f172a', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'md', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // ── TBLK-SIZE-02 — Shoe size conversion (US/UK/EU/CM), bold DTC ──
  {
    id: 'TBLK-SIZE-02',
    name: 'Shoe Size Conversion Modal',
    description:
      'A "Size & fit" trigger on footwear product pages opening a modal with an international shoe-size conversion table (US / UK / EU / CM) so global shoppers order the right size with confidence.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'table',
    tags: ['section', 'size-chart', 'size-guide', 'modal', 'product', 'footwear', 'conversion', 'globo'],
    spec: {
      type: 'theme.section',
      name: 'Shoe Size Conversion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'size-chart',
        activation: 'section',
        title: 'Size & fit',
        subtitle: 'Find your size across regions. Our shoes run true to size.',
        fields: { triggerLabel: 'Size & fit', columns: ['US', 'UK', 'EU', 'CM'] },
        blocks: [
          { kind: 'row', text: 'Small', fields: { cells: ['7', '6', '40', '25'] } },
          { kind: 'row', text: 'Medium', fields: { cells: ['8', '7', '41', '26'] } },
          { kind: 'row', text: 'Large', fields: { cells: ['9', '8', '42', '27'] } },
          { kind: 'row', text: 'X-Large', fields: { cells: ['10', '9', '44', '28'] } },
          { kind: 'row', text: 'XX-Large', fields: { cells: ['11', '10', '45', '29'] } },
        ],
      },
      placement: { enabled_on: PRODUCT_ONLY.enabled_on },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#ea580c', overlayBackdropOpacity: 0.55 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];
