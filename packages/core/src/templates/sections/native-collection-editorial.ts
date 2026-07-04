import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * Native-section collection editorial (native-section@collection).
 *
 * Six `theme.section` templates that sit ABOVE / AROUND a collection listing to
 * turn a bare product grid into an editorial, campaign-led page: a photo hero
 * banner, a seasonal narrative story, a lookbook grid, a split editorial intro,
 * a category-story carousel, and a curated promo band. Every entry deploys as a
 * NATIVE section (Theme Edit API, `mode: 'native_section'`) placed on the
 * `collection` template — the dual-mode design authored once, compiled to a real
 * `sections/*.liquid` block a merchant can add/move in the theme editor.
 *
 * Grounding:
 *  - GemPages (`plugins/gempages.md`): collection page_type, section→row(1–6
 *    column presets)→element tree, Hero Banner / Image / Text-Heading / Button /
 *    Testimonial / Carousel elements, Global Styles token set, "Apply to all
 *    products" (template-scope) editorial pages. The editorial page-builder that
 *    layers designed content over a collection is exactly this surface.
 *  - Hextom USB (`plugins/hextom-usb.md`): collection-surface widgets are a
 *    PRIMARY placement (promo message strips, badge rows) — this is where an
 *    editorial band / announcement over the grid lives.
 *  - design-vocabulary §2 (section-block catalog) + §4 "Editorial Wellness"
 *    style pack: big light-weight display, abundant whitespace, imagery-led,
 *    border-carried soft shadow, airy density, slow reveals.
 *
 * Layout archetype vocabulary for `theme.section` is `stacked | grid | masonry
 * | carousel` (layout-archetype.pack.ts / type-enums). The six variants differ
 * by `layout.layout`, `fields`, `style`, and block arrangement — NOT by markup.
 * `blocks[]` is the reorderable block list the merchant edits.
 */
export const NATIVE_COLLECTION_EDITORIAL_TEMPLATES: TemplateEntry[] = [
  {
    id: 'NSEC-COLL-01',
    name: 'Collection Editorial Hero',
    description:
      'Full-width photo-overlay hero above a collection grid — campaign headline, standfirst, and a shop-the-edit CTA over an editorial banner image.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'collection', 'editorial', 'hero', 'campaign', 'editorial-wellness'],
    spec: {
      type: 'theme.section',
      name: 'Collection Editorial Hero',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-hero',
        activation: 'section',
        title: 'The Winter Edit',
        subtitle: 'Layer up in considered pieces built to last the season.',
        layout: { layout: 'stacked' },
        fields: {
          heading: 'The Winter Edit',
          standfirst: 'Layer up in considered pieces built to last the season.',
          ctaLabel: 'Shop the edit',
          ctaUrl: 'https://example.com/collections/winter',
          heroImageUrl: 'https://cdn.shopify.com/s/files/editorial/winter-hero.jpg',
          overlayText: true,
          eyebrow: 'New Season',
          deployMode: 'native_section',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: {
          text: '#ffffff',
          background: '#111111',
          buttonBg: '#ffffff',
          buttonText: '#111111',
          overlayBackdrop: '#000000',
          overlayBackdropOpacity: 0.35,
          seed: '#8a6d3b',
        },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-COLL-02',
    name: 'Collection Story — Seasonal Narrative',
    description:
      'Stacked editorial narrative between the collection header and grid — eyebrow, long-form heading, and reorderable story paragraphs with inline imagery.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'article',
    tags: ['section', 'collection', 'editorial', 'story', 'narrative', 'brand'],
    spec: {
      type: 'theme.section',
      name: 'Collection Story — Seasonal Narrative',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-story',
        activation: 'section',
        title: 'Made for the long walk home',
        subtitle: 'The thinking behind this season',
        layout: { layout: 'stacked' },
        fields: {
          eyebrow: 'The Story',
          heading: 'Made for the long walk home',
          intro: 'Every piece in this collection started with one question: what earns a place in a wardrobe for a decade?',
          deployMode: 'native_section',
        },
        blocks: [
          {
            kind: 'story',
            text: 'We began with the fabric — a heavyweight organic cotton milled in Portugal, washed soft before it ever reaches you.',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/story-fabric.jpg',
            fields: { align: 'left', caption: 'Milled in Porto' },
          },
          {
            kind: 'story',
            text: 'Then the cut — relaxed but intentional, drawn to move with you rather than hang off you.',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/story-cut.jpg',
            fields: { align: 'right', caption: 'Pattern no. 14' },
          },
          {
            kind: 'story',
            text: 'What is left is quiet, durable, and yours. Scroll on to shop the pieces.',
            fields: { align: 'center' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#1f2933', background: '#faf9f6', overlayBackdropOpacity: 0.45, seed: '#6b7280' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-COLL-03',
    name: 'Collection Lookbook Grid',
    description:
      'Editorial lookbook grid above a collection — reorderable image tiles, each linking to a sub-edit, for a magazine-style category landing.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'collection', 'editorial', 'lookbook', 'grid', 'imagery'],
    spec: {
      type: 'theme.section',
      name: 'Collection Lookbook Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-lookbook',
        activation: 'section',
        title: 'Shop by edit',
        subtitle: 'Four ways to wear the collection',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          heading: 'Shop by edit',
          columnsDesktop: 4,
          columnsMobile: 2,
          deployMode: 'native_section',
        },
        blocks: [
          {
            kind: 'tile',
            text: 'The Commute',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/look-commute.jpg',
            url: 'https://example.com/collections/commute',
            fields: { itemCount: 18 },
          },
          {
            kind: 'tile',
            text: 'Off Duty',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/look-offduty.jpg',
            url: 'https://example.com/collections/off-duty',
            fields: { itemCount: 24 },
          },
          {
            kind: 'tile',
            text: 'After Dark',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/look-afterdark.jpg',
            url: 'https://example.com/collections/after-dark',
            fields: { itemCount: 12 },
          },
          {
            kind: 'tile',
            text: 'The Essentials',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/look-essentials.jpg',
            url: 'https://example.com/collections/essentials',
            fields: { itemCount: 31 },
          },
        ],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#111827', background: '#ffffff', overlayBackdrop: '#000000', overlayBackdropOpacity: 0.25, seed: '#111827' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-COLL-04',
    name: 'Collection Split Intro',
    description:
      'Two-column editorial intro above the grid — imagery on one side, a category standfirst and CTA on the other, for a considered collection landing.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'columns',
    tags: ['section', 'collection', 'editorial', 'split', 'intro', 'minimal-luxe'],
    spec: {
      type: 'theme.section',
      name: 'Collection Split Intro',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-split',
        activation: 'section',
        title: 'Ceramics, thrown by hand',
        subtitle: 'A small-batch tableware collection',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          eyebrow: 'The Collection',
          heading: 'Ceramics, thrown by hand',
          body: 'Each piece is wheel-thrown in our Kyoto studio and glazed in small batches, so no two are identical.',
          ctaLabel: 'Meet the makers',
          ctaUrl: 'https://example.com/pages/studio',
          imageUrl: 'https://cdn.shopify.com/s/files/editorial/split-ceramics.jpg',
          imageSide: 'left',
          deployMode: 'native_section',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#2b2b2b', background: '#f4f1ec', buttonBg: '#2b2b2b', buttonText: '#f4f1ec', overlayBackdropOpacity: 0.45, seed: '#9c8466' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },
  {
    id: 'NSEC-COLL-05',
    name: 'Collection Category Carousel',
    description:
      'Editorial category carousel above the grid — swipeable slides, each a sub-category with its own image and shop link, for browsing a large collection.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'carousel',
    tags: ['section', 'collection', 'editorial', 'carousel', 'category', 'navigation'],
    spec: {
      type: 'theme.section',
      name: 'Collection Category Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-carousel',
        activation: 'section',
        title: 'Browse the range',
        subtitle: 'Swipe to explore each category',
        layout: { layout: 'carousel' },
        fields: {
          heading: 'Browse the range',
          slidesToShowDesktop: 3,
          slidesToShowMobile: 1.2,
          autoplay: false,
          deployMode: 'native_section',
        },
        blocks: [
          {
            kind: 'slide',
            text: 'Outerwear',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/cat-outerwear.jpg',
            url: 'https://example.com/collections/outerwear',
          },
          {
            kind: 'slide',
            text: 'Knitwear',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/cat-knitwear.jpg',
            url: 'https://example.com/collections/knitwear',
          },
          {
            kind: 'slide',
            text: 'Trousers',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/cat-trousers.jpg',
            url: 'https://example.com/collections/trousers',
          },
          {
            kind: 'slide',
            text: 'Accessories',
            imageUrl: 'https://cdn.shopify.com/s/files/editorial/cat-accessories.jpg',
            url: 'https://example.com/collections/accessories',
          },
        ],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#0f172a', background: '#ffffff', overlayBackdrop: '#0f172a', overlayBackdropOpacity: 0.3, seed: '#0f172a' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
  {
    id: 'NSEC-COLL-06',
    name: 'Collection Curated Promo Band',
    description:
      'Editorial promo band above the collection grid — a bold seasonal message strip with an accent background and a single shop-the-sale CTA.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'banner',
    tags: ['section', 'collection', 'editorial', 'promo', 'sale', 'bold-dtc'],
    spec: {
      type: 'theme.section',
      name: 'Collection Curated Promo Band',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-promo',
        activation: 'section',
        title: 'Mid-Season Sale',
        subtitle: 'Up to 40% off selected styles — ends Sunday',
        layout: { layout: 'stacked' },
        fields: {
          heading: 'Mid-Season Sale',
          subheading: 'Up to 40% off selected styles — ends Sunday',
          ctaLabel: 'Shop the sale',
          ctaUrl: 'https://example.com/collections/sale',
          deployMode: 'native_section',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#b91c1c', buttonBg: '#ffffff', buttonText: '#b91c1c', overlayBackdropOpacity: 0.45, seed: '#b91c1c' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'enter' },
      },
    },
  },
];
