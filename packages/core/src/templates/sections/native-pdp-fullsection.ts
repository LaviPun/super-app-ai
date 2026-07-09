import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-PDP — native-section PDP full sections (native-section@product).
 *
 * Eight `theme.section` templates authored for the product-page surface as
 * full-width content sections (NOT surface-blocks like a sticky trust bar). Every
 * design is authored once as a `theme.section` and can compile two ways (033/034):
 * the app-block metaobject path OR the native `sections/superapp-<slug>.liquid`
 * (`native_section`) path via the Theme Files API. The spec is identical for both;
 * `mode` is a DeployTarget concern, not part of the RecipeSpec, so it is not set here.
 *
 * The repeatable content uses the modular `config.blocks[]` model (design.md §A.6):
 * each block is `{ kind, text?, imageUrl?, url?, fields? }` — the renderer reads
 * `kind`/`text`/`imageUrl`/`url` first-class and everything richer from `fields`.
 * `config.layout.layout` picks the grid archetype; different variants differ by
 * `layout`, `fields`, `style`, and block arrangement — not by markup.
 *
 * Grounding: Loox review wall / carousel, Judge.me PDP review widget layouts
 * (Standard / Cards / Carousel + rating-distribution header), and Selleasy
 * Frequently-Bought-Together / product add-ons — the display shells only. The
 * stateful backing (persisted review corpus, offer store, request scheduler,
 * discount minting) lives in those apps' backend services and is intentionally
 * OUT of scope for a storefront section: these templates are the presentational
 * layer, seeded with sample content the merchant replaces.
 */

const PRODUCT_ONLY = {
  enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] },
};

export const NSEC_PDP_TEMPLATES: TemplateEntry[] = [
  // ── NSEC-PDP-01 — Loox-style photo review wall ──────────────────────────────
  {
    id: 'NSEC-PDP-01',
    name: 'Photo Review Wall',
    description: 'Full-width "wall of love" photo-review grid for the product page — verified-buyer star cards with customer media, in the Loox house style.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'reviews',
    tags: ['section', 'reviews', 'social-proof', 'product', 'loox', 'grid'],
    spec: {
      type: 'theme.section',
      name: 'Photo Review Wall',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'reviews',
        activation: 'section',
        title: 'Loved by thousands',
        subtitle: 'Real photos from verified buyers',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          showVerifiedBadge: true,
          starIcon: 'star',
          starColor: '#f5a623',
          openLightboxOnClick: true,
        },
        blocks: [
          { kind: 'review-card', text: '"Exactly as pictured — completely obsessed."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-01.jpg', fields: { author: 'Maya R.', rating: 5, verified: true, date: '2026-05-18' } },
          { kind: 'review-card', text: '"Fast shipping and the quality is unreal."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-02.jpg', fields: { author: 'Devon K.', rating: 5, verified: true, date: '2026-05-11' } },
          { kind: 'review-card', text: '"Bought two — gifting one to my sister."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-03.jpg', fields: { author: 'Priya S.', rating: 4, verified: true, date: '2026-05-04' } },
          { kind: 'review-card', text: '"Photos do not do it justice. Stunning."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-04.jpg', fields: { author: 'Aisha M.', rating: 5, verified: true, date: '2026-04-27' } },
          { kind: 'review-card', text: '"Second order. Will keep coming back."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-05.jpg', fields: { author: 'Liam T.', rating: 5, verified: true, date: '2026-04-20' } },
          { kind: 'review-card', text: '"Great value — feels far more premium than the price."', imageUrl: 'https://cdn.shopify.com/s/files/reviews/wall-06.jpg', fields: { author: 'Noor A.', rating: 4, verified: true, date: '2026-04-12' } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },

  // ── NSEC-PDP-02 — Judge.me-style review widget with rating-distribution header ─
  {
    id: 'NSEC-PDP-02',
    name: 'Review Widget — Rating Summary + Cards',
    description: 'PDP review section with an average-rating hero, a 5-bar rating-distribution chart, and stacked review cards — the Judge.me widget composition.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'reviews',
    tags: ['section', 'reviews', 'social-proof', 'product', 'judge-me', 'ratings'],
    spec: {
      type: 'theme.section',
      name: 'Review Widget — Rating Summary + Cards',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'reviews',
        activation: 'section',
        title: 'Customer reviews',
        subtitle: '',
        layout: { layout: 'stacked' },
        fields: {
          averageRating: 4.8,
          reviewCount: 1284,
          averageRatingStyle: 'bold',
          showBarChart: true,
          barChartType: 'stars',
          distribution: { '5': 1042, '4': 168, '3': 42, '2': 18, '1': 14 },
          showSearchBar: true,
          defaultSort: 'pictures_first',
          writeReviewCtaLabel: 'Write a review',
          verifiedBadgeStyle: 'bold-badge',
          cornerStyling: 'soft',
        },
        blocks: [
          { kind: 'review-card', text: 'Genuinely the best purchase I have made this year. Runs true to size and the finish is beautiful.', fields: { author: 'Hannah W.', location: 'Austin, TX', rating: 5, verified: true, title: 'Better than expected', helpfulVotes: 34, date: '2026-06-02' } },
          { kind: 'review-card', text: 'Shipped quickly and packaged with care. Docked one star only because I wish it came in more colors.', fields: { author: 'Marcus D.', location: 'Leeds, UK', rating: 4, verified: true, title: 'Solid, would buy again', helpfulVotes: 12, date: '2026-05-24' } },
          { kind: 'review-card', text: 'Customer support answered within minutes when I had a sizing question. The product itself is excellent.', imageUrl: 'https://cdn.shopify.com/s/files/reviews/jm-03.jpg', fields: { author: 'Sofia L.', location: 'Madrid, ES', rating: 5, verified: true, title: 'Great product and service', helpfulVotes: 27, date: '2026-05-15' } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { seed: '#fbbf24', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── NSEC-PDP-03 — Testimonial carousel (Loox/Judge.me carousel theme) ─────────
  {
    id: 'NSEC-PDP-03',
    name: 'Testimonial Carousel',
    description: 'Auto-advancing testimonial carousel of quote-forward review slides for the product page, matching the Loox/Judge.me carousel widget theme.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'carousel',
    tags: ['section', 'reviews', 'testimonials', 'product', 'carousel', 'social-proof'],
    spec: {
      type: 'theme.section',
      name: 'Testimonial Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'testimonials',
        activation: 'section',
        title: 'What buyers are saying',
        subtitle: 'Swipe through real customer stories',
        layout: { layout: 'carousel' },
        fields: {
          slidesPerViewDesktop: 3,
          slidesPerViewMobile: 1,
          autoplay: true,
          transitionSpeedSeconds: 6,
          showStars: true,
          starColor: '#f5a623',
        },
        blocks: [
          { kind: 'slide', text: '"I get compliments every single time I wear it. Worth every penny."', fields: { author: 'Elena V.', rating: 5, verified: true } },
          { kind: 'slide', text: '"Replaced three cheaper versions with this one. Should have bought it first."', fields: { author: 'Tom B.', rating: 5, verified: true } },
          { kind: 'slide', text: '"The material feels luxurious and it has held up perfectly after months of use."', fields: { author: 'Grace O.', rating: 5, verified: true } },
          { kind: 'slide', text: '"Ordered on a whim, now it is part of my daily routine."', fields: { author: 'Yusuf K.', rating: 4, verified: true } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'LG', weight: 'medium', lineHeight: 'relaxed', align: 'center' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'standard' },
        pack: 'bold',
      },
    },
  },

  // ── NSEC-PDP-04 — Frequently Bought Together (Selleasy classic FBT) ───────────
  {
    id: 'NSEC-PDP-04',
    name: 'Frequently Bought Together',
    description: 'Amazon-style "frequently bought together" strip on the product page — bundled product row with a combined total and an add-all block, in the Selleasy FBT layout.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'bundle',
    tags: ['section', 'upsell', 'cross-sell', 'product', 'selleasy', 'bundles'],
    spec: {
      type: 'theme.section',
      name: 'Frequently Bought Together',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'upsell',
        activation: 'section',
        title: 'Frequently bought together',
        subtitle: 'Complete the set and save',
        layout: { layout: 'columns' },
        fields: {
          offerSource: 'manual',
          selectionControl: 'checkbox',
          addAllLabel: 'Add all to cart',
          showCombinedTotal: true,
          discountLabel: 'Save 10% on the bundle',
          combineWithOtherDiscounts: false,
        },
        blocks: [
          { kind: 'feature', text: 'This item', imageUrl: 'https://cdn.shopify.com/s/files/fbt/main.jpg', url: 'https://example-store.myshopify.com/products/this-item', fields: { price: '48.00', preselected: true, isTriggerProduct: true } },
          { kind: 'feature', text: 'Care Kit', imageUrl: 'https://cdn.shopify.com/s/files/fbt/addon-1.jpg', url: 'https://example-store.myshopify.com/products/care-kit', fields: { price: '18.00', preselected: true } },
          { kind: 'feature', text: 'Travel Pouch', imageUrl: 'https://cdn.shopify.com/s/files/fbt/addon-2.jpg', url: 'https://example-store.myshopify.com/products/travel-pouch', fields: { price: '14.00', preselected: false } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#0f172a', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── NSEC-PDP-05 — Product add-ons grid (Selleasy card grid) ───────────────────
  {
    id: 'NSEC-PDP-05',
    name: 'Product Add-Ons Grid',
    description: 'Card grid of optional add-ons and complementary products below the product details, in the Selleasy "product add-ons" card layout with an add button per card.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'upsell', 'cross-sell', 'product', 'selleasy', 'grid'],
    spec: {
      type: 'theme.section',
      name: 'Product Add-Ons Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'upsell',
        activation: 'section',
        title: 'Pairs well with',
        subtitle: 'Hand-picked add-ons for this product',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          columnsDesktop: 4,
          columnsMobile: 2,
          addButtonLabel: 'Add',
          showPrice: true,
          selectionControl: 'button',
        },
        blocks: [
          { kind: 'feature', text: 'Refill Pack', imageUrl: 'https://cdn.shopify.com/s/files/addons/a1.jpg', url: 'https://example-store.myshopify.com/products/refill-pack', fields: { price: '12.00' } },
          { kind: 'feature', text: 'Protective Case', imageUrl: 'https://cdn.shopify.com/s/files/addons/a2.jpg', url: 'https://example-store.myshopify.com/products/protective-case', fields: { price: '22.00' } },
          { kind: 'feature', text: 'Cleaning Cloth', imageUrl: 'https://cdn.shopify.com/s/files/addons/a3.jpg', url: 'https://example-store.myshopify.com/products/cleaning-cloth', fields: { price: '8.00' } },
          { kind: 'feature', text: 'Gift Wrap', imageUrl: 'https://cdn.shopify.com/s/files/addons/a4.jpg', url: 'https://example-store.myshopify.com/products/gift-wrap', fields: { price: '5.00' } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#059669', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },

  // ── NSEC-PDP-06 — Feature / benefit bento grid ───────────────────────────────
  {
    id: 'NSEC-PDP-06',
    name: 'Feature Highlights — Bento Grid',
    description: 'Mixed-size bento grid of product benefits and materials below the buy box — icon-led feature tiles that tell the "why buy" story on the product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'features', 'product', 'benefits', 'grid'],
    spec: {
      type: 'theme.section',
      name: 'Feature Highlights — Bento Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'Why you will love it',
        subtitle: 'Built to last, designed to impress',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          iconStyle: 'outline',
          emphasizeFirstTile: true,
        },
        blocks: [
          { kind: 'feature', text: 'Premium materials sourced responsibly and built to outlast the trends.', fields: { heading: 'Made to last', icon: 'shield', span: 2 } },
          { kind: 'feature', text: 'Free carbon-neutral shipping on every order.', fields: { heading: 'Ships free', icon: 'truck' } },
          { kind: 'feature', text: 'Try it for 30 days — send it back for a full refund if it is not for you.', fields: { heading: '30-day returns', icon: 'refresh' } },
          { kind: 'feature', text: 'Backed by a 2-year warranty and real human support.', fields: { heading: '2-year warranty', icon: 'badge' } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#0f172a', background: '#0b1220', seed: '#22d3ee', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },

  // ── NSEC-PDP-07 — Comparison / "why us" table ────────────────────────────────
  {
    id: 'NSEC-PDP-07',
    name: 'Comparison Table — Us vs Them',
    description: 'Full-width comparison table on the product page contrasting this product against generic alternatives across the attributes buyers care about.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'table',
    tags: ['section', 'comparison', 'product', 'conversion', 'trust'],
    spec: {
      type: 'theme.section',
      name: 'Comparison Table — Us vs Them',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'comparison',
        activation: 'section',
        title: 'How we compare',
        subtitle: 'See why customers switch and stay',
        layout: { layout: 'stacked' },
        fields: {
          columnUs: 'Our product',
          columnThem: 'Generic alternative',
          highlightUsColumn: true,
        },
        blocks: [
          { kind: 'row', text: 'Ethically sourced materials', fields: { us: true, them: false } },
          { kind: 'row', text: 'Free 2-year warranty', fields: { us: true, them: false } },
          { kind: 'row', text: '30-day risk-free returns', fields: { us: true, them: true } },
          { kind: 'row', text: 'Carbon-neutral shipping', fields: { us: true, them: false } },
          { kind: 'row', text: 'Hidden fees at checkout', fields: { us: false, them: true } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#16a34a', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── NSEC-PDP-08 — Product FAQ accordion ──────────────────────────────────────
  {
    id: 'NSEC-PDP-08',
    name: 'Product FAQ Accordion',
    description: 'Full-width FAQ accordion on the product page answering the sizing, shipping, and care questions that block a purchase, reducing pre-sale support load.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'product', 'accordion', 'support', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'Product FAQ Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Questions? Answered.',
        subtitle: 'Everything you need to know before you buy',
        layout: { layout: 'stacked' },
        fields: {
          allowMultipleOpen: false,
          firstItemOpen: true,
        },
        blocks: [
          { kind: 'faq-item', text: 'It fits true to size. If you are between sizes, we recommend sizing up for a relaxed fit.', fields: { question: 'How does it fit?' } },
          { kind: 'faq-item', text: 'Orders ship within 1–2 business days. Delivery typically takes 3–5 business days in-country.', fields: { question: 'When will my order arrive?' } },
          { kind: 'faq-item', text: 'Machine wash cold, lay flat to dry. Avoid bleach to keep the color vibrant.', fields: { question: 'How do I care for it?' } },
          { kind: 'faq-item', text: 'Yes — return or exchange within 30 days for any reason, no questions asked.', fields: { question: 'What is your return policy?' } },
        ],
      },
      placement: PRODUCT_ONLY,
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { seed: '#8a7f6d', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
];
