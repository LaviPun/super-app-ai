import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-BA — before/after comparison slider (V-B renderer batch B9, GemPages-class).
 *
 * `theme.section` templates, `kind: 'before-after'`, that map to the gallery
 * archetype but render a JS-enhanced comparison slider: EXACTLY the first two image
 * blocks are compared. The no-JS/SEO fallback stacks both labelled images;
 * superapp-modules.js overlaps them and clips the "after" pane to a pointer-drag +
 * keyboard (arrow/Home/End) ARIA-slider handle. `config.startPercent` sets the
 * initial reveal (default 50). Blocks: two `image` blocks (imageUrl + label text +
 * fields.alt) — the renderer takes the first two with an imageUrl.
 */
export const NATIVE_BEFORE_AFTER_TEMPLATES: TemplateEntry[] = [
  // NSEC-BA-01 — Skincare 8-week results (Editorial Wellness, luxe).
  {
    id: 'NSEC-BA-01',
    name: 'Before/After — Skincare Results',
    description: 'A drag-to-compare before/after slider proving an 8-week skincare transformation — two labelled images with a clip-path handle, for a product or results page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'before-after', 'comparison', 'results', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Before/After — Skincare Results',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'before-after',
        activation: 'section',
        title: 'See the difference in 8 weeks',
        subtitle: 'Real results from the daily ritual — drag to compare.',
        startPercent: 50,
        fields: { eyebrow: 'Proof' },
        blocks: [
          { kind: 'image', text: 'Week 0', imageUrl: 'https://cdn.example.com/results/skin-before.jpg', fields: { alt: 'Skin before the 8-week regimen', label: 'Week 0' } },
          { kind: 'image', text: 'Week 8', imageUrl: 'https://cdn.example.com/results/skin-after.jpg', fields: { alt: 'Skin after the 8-week regimen', label: 'Week 8' } },
        ],
      },
      placement: { enabled_on: { templates: ['product', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-BA-02 — Furniture restoration (Bold DTC).
  {
    id: 'NSEC-BA-02',
    name: 'Before/After — Furniture Restoration',
    description: 'A high-contrast drag-to-compare slider showing a worn piece restored to new — two labelled photos with a scrub handle, for a landing or portfolio page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'before-after', 'comparison', 'restoration', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Before/After — Furniture Restoration',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'before-after',
        activation: 'section',
        title: 'From salvage to statement',
        subtitle: 'Every piece, brought back by hand. Drag to reveal.',
        startPercent: 40,
        fields: { eyebrow: 'The Workshop' },
        blocks: [
          { kind: 'image', text: 'Salvaged', imageUrl: 'https://cdn.example.com/restore/chair-before.jpg', fields: { alt: 'Worn armchair before restoration', label: 'Salvaged' } },
          { kind: 'image', text: 'Restored', imageUrl: 'https://cdn.example.com/restore/chair-after.jpg', fields: { alt: 'Reupholstered armchair after restoration', label: 'Restored' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: { text: '#f8fafc', background: '#0b0b0f', overlayBackdropOpacity: 0.5, seed: '#e11d48' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];
