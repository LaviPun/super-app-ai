import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-HERO — native-section Liquid hero templates (034 native-sections lib).
 *
 * Ten `theme.section` templates, all `activation: 'section'` so they compile to
 * the native-section Liquid mode (Theme Edit API push) as a full-width page hero.
 * Five layout variants (split · centered · photo-overlay · ambient-gradient ·
 * video) are each realized against one shared token set and re-skinned across the
 * six style packs (design-vocabulary §2 "Hero" + §4 style packs) — same block/field
 * model, different `layout.layout` + `fields` + `style`, never different markup.
 *
 * Grounding: PageFly / GemPages Hero Banner element (media source + heading/text +
 * button + gradient/image/video background, on-load animation, sticky/overlay
 * variants) — plugins/pagefly.md:46,61,103, plugins/gempages.md:33,59,74.
 *
 * Modular blocks: `config.blocks[]` is the reorderable content list. `cta` blocks
 * carry a button label + link (`text` + `url`); `media` blocks carry a slide image
 * (`imageUrl`); `stat`/`feature` blocks carry a proof chip (rich data in `fields`).
 * Non-list heroes keep an empty `blocks: []` and drive copy from `config.fields`.
 */
export const NATIVE_HERO_TEMPLATES: TemplateEntry[] = [
  // NSEC-HERO-01 — Split hero (copy / visual), Apple HIG Clean.
  {
    id: 'NSEC-HERO-01',
    name: 'Hero — Split',
    description: 'Two-column homepage hero with copy on the left and a product visual on the right, dual CTAs — a content-first layout for the index page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'split', 'index', 'cta'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Split',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Built to last. Designed to love.',
        subtitle: 'Premium essentials, shipped free over $50.',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          eyebrow: 'New Season',
          bodyText: 'Considered materials, honest pricing, and a fit that holds up. Shop the pieces our community keeps coming back for.',
          mediaImageUrl: 'https://cdn.example.com/hero/split-clean.jpg',
          mediaAlt: 'Folded essentials on a linen surface',
          mediaSide: 'right',
          verticalAlign: 'center',
        },
        blocks: [
          { kind: 'cta', text: 'Shop new arrivals', url: 'https://example.com/collections/new', fields: { style: 'primary' } },
          { kind: 'cta', text: 'Our story', url: 'https://example.com/pages/about', fields: { style: 'secondary' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // NSEC-HERO-03 — Centered hero, Editorial Wellness.
  {
    id: 'NSEC-HERO-03',
    name: 'Hero — Centered Editorial',
    description: 'Centered, whitespace-forward hero with a light-weight display headline and a single quiet CTA — an editorial opener for a brand or landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'centered', 'page', 'cta'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Centered Editorial',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Slow made. Kindly worn.',
        subtitle: 'A small studio practice in natural fibers.',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'The Studio',
          bodyText: 'We make a few things, carefully, and we make them to be kept. No noise, no rush — just pieces you reach for.',
          verticalAlign: 'center',
          maxWidth: 'narrow',
        },
        blocks: [
          { kind: 'cta', text: 'Explore the collection', url: 'https://example.com/collections/all', fields: { style: 'link' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
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

  // NSEC-HERO-04 — Centered hero with stat chips, Tech Utility.
  {
    id: 'NSEC-HERO-04',
    name: 'Hero — Centered with Proof Stats',
    description: 'Centered hero backed by a row of animated proof stats (customers, rating, ship time) — a high-trust, data-forward opener for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'centered', 'index', 'social-proof'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Centered with Proof Stats',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'The toolkit teams actually ship with.',
        subtitle: 'Trusted by operators who measure everything.',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'Platform',
          bodyText: 'Fast, inspectable, and built to scale. Start free and grow into it.',
          verticalAlign: 'center',
        },
        blocks: [
          { kind: 'cta', text: 'Start free', url: 'https://example.com/pages/signup', fields: { style: 'primary' } },
          { kind: 'stat', text: '12,000+ stores', fields: { value: '12,000+', label: 'stores' } },
          { kind: 'stat', text: '4.9 / 5 rating', fields: { value: '4.9', label: 'avg. rating' } },
          { kind: 'stat', text: 'Under 24h support', fields: { value: '<24h', label: 'support reply' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#e5e7eb', background: '#0a0f1a', overlayBackdropOpacity: 0.45, seed: '#22d3ee' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // NSEC-HERO-05 — Photo hero with overlay, Bold DTC.
  {
    id: 'NSEC-HERO-05',
    name: 'Hero — Photo Overlay (Full Bleed)',
    description: 'Full-bleed photo hero with a darkening overlay and centered white headline plus CTA — an immersive campaign opener for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'photo-overlay', 'index', 'full-bleed'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Photo Overlay',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Made for the miles ahead.',
        subtitle: 'The all-weather line, now in three new colorways.',
        layout: { layout: 'stacked' },
        fields: {
          backgroundImageUrl: 'https://cdn.example.com/hero/overlay-campaign.jpg',
          backgroundAlt: 'Model outdoors in campaign apparel',
          overlayStrength: 'medium',
          verticalAlign: 'center',
          minHeight: 'tall',
        },
        blocks: [
          { kind: 'cta', text: 'Shop the line', url: 'https://example.com/collections/all-weather', fields: { style: 'primary' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#111111', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-HERO-07 — Ambient gradient hero, Bold DTC.
  {
    id: 'NSEC-HERO-07',
    name: 'Hero — Ambient Gradient',
    description: 'Centered hero over a soft multi-stop ambient gradient background (no photo), with dual CTAs — a fast, image-free opener for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'ambient-gradient', 'index', 'cta'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Ambient Gradient',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Your storefront, supercharged.',
        subtitle: 'Launch modules in minutes, not sprints.',
        layout: { layout: 'stacked' },
        fields: {
          background: 'gradient',
          gradientFrom: '#7c3aed',
          gradientTo: '#2563eb',
          gradientAngle: 135,
          verticalAlign: 'center',
        },
        blocks: [
          { kind: 'cta', text: 'Get started', url: 'https://example.com/pages/start', fields: { style: 'primary' } },
          { kind: 'cta', text: 'See it live', url: 'https://example.com/pages/demo', fields: { style: 'ghost' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#4c1d95', overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-HERO-08 — Ambient gradient hero with feature chips, Playful Commerce.
  {
    id: 'NSEC-HERO-08',
    name: 'Hero — Gradient with Feature Chips',
    description: 'Friendly rounded hero on a pastel gradient with a row of feature chips (free shipping, easy returns, rewards) beneath the CTA — a welcoming homepage opener.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'ambient-gradient', 'index', 'features'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Gradient with Feature Chips',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Little things, big smiles.',
        subtitle: 'Thoughtfully made goods for everyday joy.',
        layout: { layout: 'stacked' },
        fields: {
          background: 'gradient',
          gradientFrom: '#fde68a',
          gradientTo: '#fbcfe8',
          gradientAngle: 120,
          verticalAlign: 'center',
        },
        blocks: [
          { kind: 'cta', text: 'Shop bestsellers', url: 'https://example.com/collections/bestsellers', fields: { style: 'primary' } },
          { kind: 'feature', text: 'Free shipping over $40', fields: { icon: 'truck' } },
          { kind: 'feature', text: '30-day easy returns', fields: { icon: 'refresh' } },
          { kind: 'feature', text: 'Earn rewards on every order', fields: { icon: 'gift' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
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

  // NSEC-HERO-09 — Video hero, Bold DTC.
  {
    id: 'NSEC-HERO-09',
    name: 'Hero — Background Video',
    description: 'Full-bleed background-video hero with an overlay, centered headline, and CTA — a cinematic campaign opener for the homepage (poster fallback for reduced-motion).',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'video', 'index', 'full-bleed'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Background Video',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'See it in motion.',
        subtitle: 'The new flagship, in full flow.',
        layout: { layout: 'stacked' },
        fields: {
          background: 'video',
          videoUrl: 'https://cdn.example.com/hero/flagship-loop.mp4',
          posterImageUrl: 'https://cdn.example.com/hero/flagship-poster.jpg',
          videoAutoplay: true,
          videoLoop: true,
          videoMuted: true,
          overlayStrength: 'medium',
          verticalAlign: 'center',
          minHeight: 'tall',
        },
        blocks: [
          { kind: 'cta', text: 'Shop the flagship', url: 'https://example.com/collections/flagship', fields: { style: 'primary' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#000000', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.4 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-HERO-10 — Media carousel hero (slideshow), Apple HIG Clean.
  {
    id: 'NSEC-HERO-10',
    name: 'Hero — Slideshow Carousel',
    description: 'Rotating slideshow hero: each reorderable slide block carries its own image, headline, and link — a multi-message opener for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'carousel', 'index', 'slideshow'],
    spec: {
      type: 'theme.section',
      name: 'Hero — Slideshow Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'This season, in three acts.',
        layout: { layout: 'carousel' },
        fields: {
          autoRotate: true,
          rotateIntervalMs: 6000,
          showDots: true,
          showArrows: true,
          verticalAlign: 'center',
          minHeight: 'tall',
        },
        blocks: [
          { kind: 'slide', text: 'New arrivals', imageUrl: 'https://cdn.example.com/hero/slide-1.jpg', url: 'https://example.com/collections/new', fields: { headline: 'New arrivals', subhead: 'Fresh in this week', ctaLabel: 'Shop new' } },
          { kind: 'slide', text: 'Best sellers', imageUrl: 'https://cdn.example.com/hero/slide-2.jpg', url: 'https://example.com/collections/bestsellers', fields: { headline: 'Best sellers', subhead: 'The ones everyone loves', ctaLabel: 'Shop bestsellers' } },
          { kind: 'slide', text: 'On sale', imageUrl: 'https://cdn.example.com/hero/slide-3.jpg', url: 'https://example.com/collections/sale', fields: { headline: 'Up to 40% off', subhead: 'Season sale, while it lasts', ctaLabel: 'Shop sale' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'none', margin: 'none', gap: 'none', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: { text: '#ffffff', background: '#111827', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.35 },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
];
