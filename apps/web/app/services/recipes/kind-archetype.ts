/**
 * Canonical kind→archetype alias table — the SINGLE source of truth.
 *
 * A storefront `theme.section`'s `config.kind` string resolves to one of a fixed
 * set of section archetypes (archetype-contract.md §"Canonical archetypes and kind
 * aliases"). Three renderers must agree on this mapping or preview⇄storefront
 * parity breaks (a kind previews as one archetype but compiles/renders as another):
 *   1. PreviewService              (apps/web/app/services/preview/preview.service.ts)
 *   2. the native-section compiler (apps/web/app/services/recipes/compiler/native-section.ts)
 *   3. the storefront Liquid       (`case sa_kind_h` dispatch in
 *      apps/web/theme-extension-src/liquid/snippets/superapp-module.liquid — built
 *      to extensions/theme-app-extension/ by scripts/build-theme-liquid.mjs)
 *
 * The two TS consumers import this module directly. Liquid can't import a TS const,
 * so its `when` table is kept in sync by kind-archetype-parity.test.ts, which
 * asserts the Liquid dispatch covers every kind below.
 *
 * Pure data + type — NO imports, so it can be consumed by both the preview service
 * and the compiler without risking an import cycle.
 */

export type SectionArchetype =
  | 'hero' | 'feature' | 'gallery' | 'collection' | 'pricing' | 'faq'
  | 'testimonial' | 'stats' | 'cta' | 'trust' | 'newsletter' | 'launch'
  | 'contact' | 'team' | 'timeline' | 'upsell' | 'band' | 'technical';

export const KIND_ARCHETYPE: Record<string, SectionArchetype> = {
  hero: 'hero', 'collection-hero': 'hero',
  feature: 'feature', benefit: 'feature',
  gallery: 'gallery', lookbook: 'gallery', 'collection-lookbook': 'gallery', 'collection-carousel': 'gallery',
  'ugc-grid': 'gallery',
  'collection-story': 'collection', 'collection-split': 'collection', 'collection-promo': 'collection',
  'collection-list': 'collection', story: 'collection',
  pricing: 'pricing', comparison: 'pricing', plan: 'pricing', 'volume-tiers': 'pricing',
  faq: 'faq', accordion: 'faq',
  testimonials: 'testimonial', reviews: 'testimonial', 'social-proof': 'testimonial',
  'review-summary': 'testimonial', testimonial: 'testimonial',
  stats: 'stats',
  cta: 'cta', 'rich-text': 'cta',
  trust: 'trust', 'trust-badges': 'trust', 'trust-badge': 'trust', 'payment-badges': 'trust',
  'usp-strip': 'trust', 'logo-marquee': 'trust',
  newsletter: 'newsletter',
  launch: 'launch', 'coming-soon': 'launch', '404': 'launch',
  contact: 'contact',
  team: 'team',
  timeline: 'timeline', steps: 'timeline',
  upsell: 'upsell', 'bought-together': 'upsell', 'product-addons': 'upsell', 'post-atc-offer': 'upsell',
  announcement: 'band', 'announcement-bar': 'band', 'free-shipping-bar': 'band',
  countdown: 'band', 'countdown-bar': 'band', progress: 'band', 'progress-bar': 'band', 'stock-counter': 'band',
  consent: 'technical', 'json-ld': 'technical', meta: 'technical', 'pixel-bootstrap': 'technical',
  preload: 'technical', filters: 'technical', search: 'technical', sort: 'technical',
  'sticky-atc': 'technical', 'size-chart': 'technical', 'star-rating': 'technical',
  'payment-icons': 'technical', footer: 'technical', rewards: 'technical', badge: 'technical',
};

/**
 * Canonical id list for the trust/payment badge-icon catalog (V-A A2).
 *
 * A `badge` block sets `fields.icon` to one of these ids; the storefront Liquid
 * renders the matching `<symbol id="sa-ico-<id>">` from its inline sprite and the
 * PreviewService renders the mirrored inline SVG — both keyed off THIS list, which
 * is the single source of truth for the id set. The sprite in
 * `theme-extension-src/liquid/snippets/superapp-module.liquid` and the preview
 * `BADGE_ICON_SVG` map are asserted to cover exactly these ids by
 * badge-icons.test.ts (no `type-enum` catalog entry — the icon lives on a
 * free-form `blocks[].fields.icon`, outside the `config.<ns>.<field>` type-enum
 * surface). Unknown/absent icon → the badge's existing text/image fallback.
 *
 * Payment marks first (card networks + wallets), then trust/guarantee glyphs.
 */
export const BADGE_ICON_IDS = [
  'visa', 'mastercard', 'amex', 'paypal', 'shop-pay', 'apple-pay', 'google-pay', 'klarna',
  'secure-checkout', 'free-returns', 'fast-shipping', 'money-back', 'warranty', 'support', 'eco', 'lock',
] as const;

export type BadgeIconId = (typeof BADGE_ICON_IDS)[number];
