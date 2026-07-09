import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-GAL — native-section Liquid gallery / lookbook templates (034 native-sections lib).
 *
 * Eight `theme.section` templates, all `activation: 'section'` so they compile to
 * the native-section Liquid mode (Theme Edit API push) as a full-width editorial
 * media section. Four core layout variants (masonry · sticky-scroll · split ·
 * fullbleed) — per surface-coverage plan.md §D.2 #16 (gallery-lookbook) and
 * design-vocabulary §2 "Stacking-card / sticky-scroll narrative — story-driven PDP
 * / lookbook sequence" (line 164) — are each realized against one shared token set
 * and re-skinned across the six style packs (design-vocabulary §4). Same block/field
 * model, different `layout.layout` + `fields` + `style`, never different markup.
 *
 * Grounding: GemPages / PageFly gallery + Image, Before & After, and Carousel
 * elements (image source + alt + link, gallery/masonry grids, parallax fixed-
 * attachment backgrounds, on-scroll Fade/Slide reveals, sticky positioning,
 * shoppable product hotspots via dynamic product binding) —
 * plugins/gempages.md:33,46,50,59,74,101-104,130 (dynamic product binding).
 *
 * Modular blocks: `config.blocks[]` is the reorderable gallery list — one `slide`
 * per image tile. Renderer-first-class fields: `text` (caption), `imageUrl` (the
 * media), `url` (the tile's link, e.g. a shoppable product). Everything richer
 * (alt text, span, aspect, hotspot product handles, headline/body for a scroll
 * chapter) lives in the per-block `fields` bag. `config.layout.layout` selects the
 * grid archetype (masonry / grid / stacked / carousel), so one section type ships
 * multiple variants from the same tokens.
 *
 * Honesty: `slide.url` may deep-link to a product; the tile is a static link, not a
 * live quick-add. Shoppable "hotspot" product handles in `fields` are presentational
 * anchors the renderer/preview can surface, not a guaranteed live add-to-cart binding.
 */
export const NATIVE_GALLERY_LOOKBOOK_TEMPLATES: TemplateEntry[] = [
  // NSEC-GAL-01 — Masonry photo wall, Editorial Wellness.
  {
    id: 'NSEC-GAL-01',
    name: 'Gallery — Masonry Wall',
    description: 'Whitespace-forward masonry photo wall of mixed-height image tiles with quiet captions — an imagery-led lookbook grid for a brand or landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'gallery', 'lookbook', 'masonry', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Gallery — Masonry Wall',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'lookbook',
        activation: 'section',
        title: 'The Spring Edit',
        subtitle: 'Shot on film across three coasts.',
        layout: { layout: 'masonry', columns: 3 },
        fields: {
          eyebrow: 'Lookbook',
          columnsDesktop: 3,
          columnsMobile: 2,
          gutter: 'medium',
          showCaptions: true,
          lazyLoad: true,
        },
        blocks: [
          { kind: 'slide', text: 'Morning linen', imageUrl: 'https://cdn.example.com/lookbook/masonry-1.jpg', url: 'https://example.com/collections/linen', fields: { alt: 'Linen set on a sunlit bed', span: 'tall' } },
          { kind: 'slide', text: 'The travel coat', imageUrl: 'https://cdn.example.com/lookbook/masonry-2.jpg', url: 'https://example.com/products/travel-coat', fields: { alt: 'Model in an oversized travel coat', span: 'wide' } },
          { kind: 'slide', text: 'Studio knits', imageUrl: 'https://cdn.example.com/lookbook/masonry-3.jpg', url: 'https://example.com/collections/knits', fields: { alt: 'Folded knitwear stack', span: 'square' } },
          { kind: 'slide', text: 'On the coast', imageUrl: 'https://cdn.example.com/lookbook/masonry-4.jpg', url: 'https://example.com/collections/all', fields: { alt: 'Beach walk in neutral tones', span: 'tall' } },
          { kind: 'slide', text: 'Everyday carry', imageUrl: 'https://cdn.example.com/lookbook/masonry-5.jpg', url: 'https://example.com/collections/accessories', fields: { alt: 'Woven tote on a wooden table', span: 'square' } },
          { kind: 'slide', text: 'Golden hour', imageUrl: 'https://cdn.example.com/lookbook/masonry-6.jpg', url: 'https://example.com/collections/new', fields: { alt: 'Portrait in warm evening light', span: 'wide' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
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

  // NSEC-GAL-02 — Masonry gallery, Playful Commerce (UGC / community grid).
  {
    id: 'NSEC-GAL-02',
    name: 'Gallery — Community Grid',
    description: 'Friendly rounded masonry grid of customer and community photos with playful captions and a "shop the look" link per tile — a UGC gallery for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'gallery', 'ugc', 'masonry', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Gallery — Community Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'gallery',
        activation: 'section',
        title: 'From our community',
        subtitle: 'Tag #madewithjoy to be featured.',
        layout: { layout: 'masonry', columns: 4 },
        fields: {
          eyebrow: 'You + Us',
          columnsDesktop: 4,
          columnsMobile: 2,
          gutter: 'tight',
          showCaptions: true,
          showShopLink: true,
          lazyLoad: true,
        },
        blocks: [
          { kind: 'slide', text: '@maya.makes', imageUrl: 'https://cdn.example.com/ugc/grid-1.jpg', url: 'https://example.com/products/mug', fields: { alt: 'Handmade mug on a kitchen shelf', span: 'square', shopLabel: 'Shop the mug' } },
          { kind: 'slide', text: '@devon.k', imageUrl: 'https://cdn.example.com/ugc/grid-2.jpg', url: 'https://example.com/products/tote', fields: { alt: 'Canvas tote at a farmers market', span: 'tall', shopLabel: 'Shop the tote' } },
          { kind: 'slide', text: '@priya.s', imageUrl: 'https://cdn.example.com/ugc/grid-3.jpg', url: 'https://example.com/collections/candles', fields: { alt: 'Candles lit on a windowsill', span: 'square', shopLabel: 'Shop candles' } },
          { kind: 'slide', text: '@thekellys', imageUrl: 'https://cdn.example.com/ugc/grid-4.jpg', url: 'https://example.com/collections/kids', fields: { alt: 'Family picnic with branded blanket', span: 'wide', shopLabel: 'Shop the blanket' } },
          { kind: 'slide', text: '@sam.builds', imageUrl: 'https://cdn.example.com/ugc/grid-5.jpg', url: 'https://example.com/collections/desk', fields: { alt: 'Tidy desk setup with accessories', span: 'square', shopLabel: 'Shop desk' } },
          { kind: 'slide', text: '@leafandloom', imageUrl: 'https://cdn.example.com/ugc/grid-6.jpg', url: 'https://example.com/collections/home', fields: { alt: 'Plants and textiles in a cozy corner', span: 'tall', shopLabel: 'Shop home' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#f97316' },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-GAL-03 — Sticky-scroll narrative lookbook, Editorial Wellness.
  {
    id: 'NSEC-GAL-03',
    name: 'Lookbook — Sticky Scroll Story',
    description: 'Story-driven lookbook where imagery pins while chapter copy scrolls past — each block is one narrative chapter with image, headline, and body, for a landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'lookbook', 'sticky-scroll', 'narrative', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Lookbook — Sticky Scroll Story',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'lookbook',
        activation: 'section',
        title: 'A day in the collection',
        subtitle: 'From first light to last call.',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'The Story',
          stickyMedia: true,
          mediaSide: 'left',
          revealOnScroll: true,
          progressIndicator: true,
        },
        blocks: [
          { kind: 'slide', text: 'Morning', imageUrl: 'https://cdn.example.com/story/chapter-1.jpg', url: 'https://example.com/collections/morning', fields: { alt: 'Coffee and linen at sunrise', headline: 'Ease into the day', body: 'Soft layers made for slow mornings and long light.' } },
          { kind: 'slide', text: 'Midday', imageUrl: 'https://cdn.example.com/story/chapter-2.jpg', url: 'https://example.com/collections/midday', fields: { alt: 'Walking through the city at noon', headline: 'Move with it', body: 'Breathable pieces that keep up from meeting to market.' } },
          { kind: 'slide', text: 'Evening', imageUrl: 'https://cdn.example.com/story/chapter-3.jpg', url: 'https://example.com/collections/evening', fields: { alt: 'Golden-hour rooftop gathering', headline: 'Wind it down', body: 'A little more structure for the parts of the day that matter.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },

  // NSEC-GAL-05 — Split lookbook (media / copy).
  {
    id: 'NSEC-GAL-05',
    name: 'Lookbook — Split Feature',
    description: 'Two-column lookbook pairing a large campaign image with a caption stack of shoppable looks beside it — a content-first split section for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'lookbook', 'split', 'shoppable', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Lookbook — Split Feature',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'lookbook',
        activation: 'section',
        title: 'Shop the look',
        subtitle: 'One outfit, four ways to make it yours.',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          eyebrow: 'Featured Look',
          heroImageUrl: 'https://cdn.example.com/lookbook/split-hero.jpg',
          heroAlt: 'Full campaign look, head to toe',
          mediaSide: 'left',
          verticalAlign: 'center',
        },
        blocks: [
          { kind: 'slide', text: 'The jacket', imageUrl: 'https://cdn.example.com/lookbook/split-item-1.jpg', url: 'https://example.com/products/field-jacket', fields: { alt: 'Field jacket flat lay', price: '$148' } },
          { kind: 'slide', text: 'The tee', imageUrl: 'https://cdn.example.com/lookbook/split-item-2.jpg', url: 'https://example.com/products/heavy-tee', fields: { alt: 'Heavyweight tee flat lay', price: '$42' } },
          { kind: 'slide', text: 'The denim', imageUrl: 'https://cdn.example.com/lookbook/split-item-3.jpg', url: 'https://example.com/products/straight-denim', fields: { alt: 'Straight denim flat lay', price: '$98' } },
          { kind: 'slide', text: 'The boot', imageUrl: 'https://cdn.example.com/lookbook/split-item-4.jpg', url: 'https://example.com/products/chelsea-boot', fields: { alt: 'Chelsea boot flat lay', price: '$180' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // NSEC-GAL-06 — Split before/after gallery, Tech Utility.
  {
    id: 'NSEC-GAL-06',
    name: 'Gallery — Before & After Split',
    description: 'Split gallery pairing before/after image sets with crisp result captions — a proof-forward, data-forward transformation section for a landing or product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'gallery', 'before-after', 'split', 'page'],
    spec: {
      type: 'theme.section',
      name: 'Gallery — Before & After Split',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'gallery',
        activation: 'section',
        title: 'The results speak',
        subtitle: 'Real customers, 8 weeks apart.',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          eyebrow: 'Before / After',
          columnsDesktop: 2,
          columnsMobile: 1,
          showLabels: true,
          beforeLabel: 'Week 0',
          afterLabel: 'Week 8',
        },
        blocks: [
          { kind: 'slide', text: 'Hydration set', imageUrl: 'https://cdn.example.com/results/pair-1.jpg', url: 'https://example.com/products/hydration-set', fields: { alt: 'Before and after using the hydration set', metric: '+38% moisture' } },
          { kind: 'slide', text: 'Repair serum', imageUrl: 'https://cdn.example.com/results/pair-2.jpg', url: 'https://example.com/products/repair-serum', fields: { alt: 'Before and after using the repair serum', metric: '−24% redness' } },
          { kind: 'slide', text: 'Daily SPF', imageUrl: 'https://cdn.example.com/results/pair-3.jpg', url: 'https://example.com/products/daily-spf', fields: { alt: 'Before and after using the daily SPF', metric: 'Even tone' } },
          { kind: 'slide', text: 'Night cream', imageUrl: 'https://cdn.example.com/results/pair-4.jpg', url: 'https://example.com/products/night-cream', fields: { alt: 'Before and after using the night cream', metric: 'Firmer feel' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#e5e7eb', background: '#0a0f1a', overlayBackdropOpacity: 0.45, seed: '#22d3ee' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // NSEC-GAL-07 — Full-bleed edge-to-edge gallery band, Bold DTC.
  {
    id: 'NSEC-GAL-07',
    name: 'Gallery — Full-Bleed Band',
    description: 'Edge-to-edge full-bleed gallery band of large campaign images with high-energy overlay captions and shop links — an immersive lookbook strip for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'gallery', 'lookbook', 'full-bleed', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Gallery — Full-Bleed Band',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'lookbook',
        activation: 'section',
        title: 'The campaign',
        subtitle: 'Drop 04, from every angle.',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          fullBleed: true,
          columnsDesktop: 3,
          columnsMobile: 1,
          gutter: 'none',
          overlayCaptions: true,
          overlayStrength: 'medium',
        },
        blocks: [
          { kind: 'slide', text: 'Street', imageUrl: 'https://cdn.example.com/campaign/bleed-1.jpg', url: 'https://example.com/collections/drop-04', fields: { alt: 'Campaign shot on the street', ctaLabel: 'Shop the drop' } },
          { kind: 'slide', text: 'Studio', imageUrl: 'https://cdn.example.com/campaign/bleed-2.jpg', url: 'https://example.com/collections/drop-04', fields: { alt: 'Campaign shot in the studio', ctaLabel: 'Shop the drop' } },
          { kind: 'slide', text: 'Night', imageUrl: 'https://cdn.example.com/campaign/bleed-3.jpg', url: 'https://example.com/collections/drop-04', fields: { alt: 'Campaign shot at night', ctaLabel: 'Shop the drop' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'none', margin: 'none', gap: 'none', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: { text: '#ffffff', background: '#0b0b0f', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.5, seed: '#e11d48' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // NSEC-GAL-08 — Full-bleed carousel lookbook (Instagram-style feed), Bold DTC.
  {
    id: 'NSEC-GAL-08',
    name: 'Gallery — Shoppable Carousel Feed',
    description: 'Swipeable full-bleed carousel of shoppable feed tiles — each reorderable slide carries an image, caption, and product link — an Instagram-style gallery for the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'gallery',
    tags: ['section', 'gallery', 'shoppable', 'carousel', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Gallery — Shoppable Carousel Feed',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'gallery',
        activation: 'section',
        title: 'Straight from the feed',
        subtitle: 'Tap any look to shop it.',
        layout: { layout: 'carousel' },
        fields: {
          feedStyle: 'instagram',
          slidesPerViewDesktop: 4,
          slidesPerViewMobile: 1.2,
          showArrows: true,
          showDots: true,
          snap: true,
          showShopLink: true,
        },
        blocks: [
          { kind: 'slide', text: 'Layered for fall', imageUrl: 'https://cdn.example.com/feed/tile-1.jpg', url: 'https://example.com/products/layer-coat', fields: { alt: 'Layered fall outfit', shopLabel: 'Shop this look' } },
          { kind: 'slide', text: 'Desk to dinner', imageUrl: 'https://cdn.example.com/feed/tile-2.jpg', url: 'https://example.com/products/blazer', fields: { alt: 'Blazer styled two ways', shopLabel: 'Shop this look' } },
          { kind: 'slide', text: 'Weekend uniform', imageUrl: 'https://cdn.example.com/feed/tile-3.jpg', url: 'https://example.com/collections/weekend', fields: { alt: 'Casual weekend outfit', shopLabel: 'Shop this look' } },
          { kind: 'slide', text: 'The accessory drop', imageUrl: 'https://cdn.example.com/feed/tile-4.jpg', url: 'https://example.com/collections/accessories', fields: { alt: 'Accessory flat lay', shopLabel: 'Shop accessories' } },
          { kind: 'slide', text: 'New in knits', imageUrl: 'https://cdn.example.com/feed/tile-5.jpg', url: 'https://example.com/collections/knits', fields: { alt: 'Knitwear close-up', shopLabel: 'Shop knits' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#f8fafc', background: '#111827', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.4, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
];
