import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];

/**
 * NSEC-UGC — V-A A6: UGC / INSTAGRAM GRID.
 *
 * recipeType = `theme.section`, kind `ugc-grid` (→ `gallery` archetype). A
 * masonry-ish aspect-ratio tile grid of customer / influencer photos; each tile's
 * hover/focus overlay surfaces the `caption`, the `@authorHandle`, and an optional
 * 'Shop this' link (`fields.productUrl`). Blocks are gallery `slide` blocks
 * carrying `imageUrl` + those fields. Keyboard users reach the overlay via focus
 * (the figcaption is focusable).
 *
 * A7 device pack is exercised on template 01 (device.mobileColumns:2 → a tidy
 * two-up grid on phones via the --sa-mobile-cols override).
 */
export const NATIVE_UGC_GRID_TEMPLATES: TemplateEntry[] = [
  // 01 — customer photos wall, bold DTC, 2-up on mobile.
  {
    id: 'NSEC-UGC-01',
    name: 'Customer Photos Grid (UGC)',
    description: 'Social-proof wall of real customer photos in a tight aspect-ratio grid; hovering or focusing a tile reveals the caption, the customer’s @handle and a Shop-this link. Drops to a neat two-column layout on mobile.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'ugc-grid', 'gallery', 'social-proof', 'instagram', 'customer-photos'],
    spec: {
      type: 'theme.section',
      name: 'Customer Photos Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'ugc-grid',
        activation: 'section',
        title: 'As worn by you',
        subtitle: 'Tag @ourbrand for a chance to be featured.',
        layout: { layout: 'grid' },
        device: { desktop: true, mobile: true, mobileColumns: 2 },
        fields: {},
        blocks: [
          { kind: 'slide', text: 'Golden hour in the Coastal Tote', imageUrl: 'https://cdn.example.com/ugc/1.jpg', fields: { caption: 'Golden hour in the Coastal Tote', authorHandle: 'maya.wanders', productUrl: 'https://example.com/products/coastal-tote' } },
          { kind: 'slide', text: 'Everyday carry, done right', imageUrl: 'https://cdn.example.com/ugc/2.jpg', fields: { caption: 'Everyday carry, done right', authorHandle: 'devon.k', productUrl: 'https://example.com/products/field-pack' } },
          { kind: 'slide', text: 'Weekend uniform', imageUrl: 'https://cdn.example.com/ugc/3.jpg', fields: { caption: 'Weekend uniform', authorHandle: 'priya.s', productUrl: 'https://example.com/products/knit-crew' } },
          { kind: 'slide', text: 'Rain or shine', imageUrl: 'https://cdn.example.com/ugc/4.jpg', fields: { caption: 'Rain or shine', authorHandle: 'sam.trails', productUrl: 'https://example.com/products/shell-jacket' } },
          { kind: 'slide', text: 'Studio to street', imageUrl: 'https://cdn.example.com/ugc/5.jpg', fields: { caption: 'Studio to street', authorHandle: 'noor.makes' } },
          { kind: 'slide', text: 'Small joys', imageUrl: 'https://cdn.example.com/ugc/6.jpg', fields: { caption: 'Small joys', authorHandle: 'lee.daily', productUrl: 'https://example.com/products/enamel-mug' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'product'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#db2777' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // 02 — influencer lookbook, minimal-luxe.
  {
    id: 'NSEC-UGC-02',
    name: 'Influencer Lookbook (UGC)',
    description: 'Editorial influencer lookbook grid — larger, quieter tiles where the overlay names the creator’s @handle and links straight to the featured piece. A refined take on shoppable social proof for premium brands.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'ugc-grid', 'gallery', 'lookbook', 'influencer', 'shoppable'],
    spec: {
      type: 'theme.section',
      name: 'Influencer Lookbook',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'ugc-grid',
        activation: 'section',
        title: 'The lookbook',
        subtitle: 'Styled by the people we admire.',
        layout: { layout: 'grid' },
        fields: {},
        blocks: [
          { kind: 'slide', text: 'Layered for the season', imageUrl: 'https://cdn.example.com/look/1.jpg', fields: { caption: 'Layered for the season', authorHandle: 'atelier.rue', productUrl: 'https://example.com/products/wool-overcoat', shopLabel: 'Shop the coat' } },
          { kind: 'slide', text: 'Quiet luxury', imageUrl: 'https://cdn.example.com/look/2.jpg', fields: { caption: 'Quiet luxury', authorHandle: 'the.edit', productUrl: 'https://example.com/products/cashmere-scarf', shopLabel: 'Shop the scarf' } },
          { kind: 'slide', text: 'City in motion', imageUrl: 'https://cdn.example.com/look/3.jpg', fields: { caption: 'City in motion', authorHandle: 'nomad.frames', productUrl: 'https://example.com/products/leather-holdall', shopLabel: 'Shop the bag' } },
          { kind: 'slide', text: 'Golden details', imageUrl: 'https://cdn.example.com/look/4.jpg', fields: { caption: 'Golden details', authorHandle: 'studio.lune', productUrl: 'https://example.com/products/signet-ring', shopLabel: 'Shop the ring' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.4, seed: '#0f172a' },
        shape: { radius: 'sm', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },
];
