import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-HS — shoppable image hotspots / "shop the look" (V-B renderer batch B10).
 *
 * `theme.section` templates, `kind: 'hotspots'`, that map to the gallery archetype
 * but render a shoppable image: a base `config.imageUrl` plus `hotspot` blocks
 * ({ x, y percent, title, price?, url, imageUrl? }). The no-JS/SEO fallback is the
 * base image + a numbered link list; superapp-modules.js overlays positioned markers
 * and opens a focus-trapped popover card per marker (Escape to close). On narrow
 * viewports the numbered list is the interface.
 */
export const NATIVE_HOTSPOTS_TEMPLATES: TemplateEntry[] = [
  // NSEC-HS-01 — Living-room "shop the look" (Editorial, luxe).
  {
    id: 'NSEC-HS-01',
    name: 'Hotspots — Shop the Living Room',
    description: 'A styled living-room photo with shoppable hotspots over each product — tap a marker for a title/price/link popover, with a numbered list fallback, for a homepage or lookbook.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'hotspots', 'shoppable', 'shop-the-look', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Hotspots — Shop the Living Room',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hotspots',
        activation: 'section',
        title: 'Shop the room',
        subtitle: 'Every piece in the frame, one tap away.',
        imageUrl: 'https://cdn.example.com/lookbook/living-room.jpg',
        fields: { imageAlt: 'Styled living room with sofa, lamp, rug and art' },
        blocks: [
          { kind: 'hotspot', text: 'Boucle sofa', url: 'https://example.com/products/boucle-sofa', fields: { x: 32, y: 62, price: '$1,290', imageUrl: 'https://cdn.example.com/products/sofa-thumb.jpg' } },
          { kind: 'hotspot', text: 'Arc floor lamp', url: 'https://example.com/products/arc-lamp', fields: { x: 68, y: 30, price: '$240', imageUrl: 'https://cdn.example.com/products/lamp-thumb.jpg' } },
          { kind: 'hotspot', text: 'Wool area rug', url: 'https://example.com/products/wool-rug', fields: { x: 50, y: 84, price: '$420' } },
          { kind: 'hotspot', text: 'Framed print', url: 'https://example.com/products/framed-print', fields: { x: 80, y: 22, price: '$95', imageUrl: 'https://cdn.example.com/products/print-thumb.jpg' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#a67c52' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-HS-02 — Outfit of the week (Bold DTC apparel).
  {
    id: 'NSEC-HS-02',
    name: 'Hotspots — Outfit of the Week',
    description: 'A full-look outfit shot with shoppable hotspots over each garment — tap a marker for a price/link popover, numbered-list fallback below, for a homepage drop.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'hotspots', 'shoppable', 'outfit', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Hotspots — Outfit of the Week',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hotspots',
        activation: 'section',
        title: 'Outfit of the week',
        subtitle: 'Tap any piece to shop the full look.',
        imageUrl: 'https://cdn.example.com/lookbook/outfit-week.jpg',
        fields: { imageAlt: 'Model in a full styled outfit against a studio wall' },
        blocks: [
          { kind: 'hotspot', text: 'Oversized blazer', url: 'https://example.com/products/oversized-blazer', fields: { x: 46, y: 34, price: '$168' } },
          { kind: 'hotspot', text: 'Ribbed tank', url: 'https://example.com/products/ribbed-tank', fields: { x: 50, y: 52, price: '$38' } },
          { kind: 'hotspot', text: 'Wide-leg trouser', url: 'https://example.com/products/wide-leg-trouser', fields: { x: 52, y: 74, price: '$120' } },
          { kind: 'hotspot', text: 'Leather loafer', url: 'https://example.com/products/leather-loafer', fields: { x: 55, y: 92, price: '$185' } },
          { kind: 'hotspot', text: 'Structured tote', url: 'https://example.com/products/structured-tote', fields: { x: 30, y: 60, price: '$210' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: { text: '#111827', background: '#f8fafc', overlayBackdropOpacity: 0.4, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];
