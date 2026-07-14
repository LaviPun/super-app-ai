import type { TemplateEntry } from '../types.js';

/**
 * analytics.pixel templates — web pixels that capture standard storefront funnel
 * events for downstream analytics/ad platforms (Phase 6 vocab-hardening; family was
 * previously covered only by the coverage stub COV-ANA-01). A web pixel runs in the
 * sandboxed customer-events worker and subscribes to Shopify STANDARD events; the
 * config declares which events to capture and how to map them to a vendor's event
 * shape.
 *
 * Vocab is authored strictly against the analytics.pixel config member (recipe.ts):
 * `{ events: PIXEL_STANDARD_EVENTS[], pixelId?, mapping?: Record<string,string> }`.
 * `mapping` keys are the vendor's parameter names; values are `{{event.*}}` /
 * `{{event.data.*}}` dot-paths the pixel resolves per event. The barrel modernize pass
 * injects `mapping.moduleId` + `mapping.shopId`. `requires` is left `[]` (the
 * data-surface flags are added by the modernize pass).
 *
 * HONESTY: a pixel CAPTURES + FORWARDS events. It does not stand up the vendor's
 * analytics backend; `pixelId` names the destination account the merchant configures.
 * Consent is respected by Shopify's customer-privacy gating around the pixel sandbox.
 */
export const ANALYTICS_PIXEL_VENDOR_TEMPLATES: TemplateEntry[] = [
  // ANA-PIXEL-01 — GA4 purchase + full-funnel mapping. The canonical, most-reached
  // pixel: map Shopify standard events onto GA4 recommended-event params.
  {
    id: 'ANA-PIXEL-01',
    name: 'Google Analytics 4 — Purchase & Funnel',
    description:
      'Web pixel that maps the storefront funnel (view item, add to cart, begin checkout, purchase) onto GA4 recommended-event parameters, with order value and currency on the purchase event.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tier: 'exemplar',
    tags: ['analytics', 'pixel', 'ga4', 'google-analytics', 'purchase', 'conversion'],
    spec: {
      type: 'analytics.pixel',
      name: 'Google Analytics 4 — Purchase & Funnel',
      category: 'INTEGRATION',
      requires: [],
      config: {
        pixelId: 'G-XXXXXXXXXX',
        events: [
          'product_viewed',
          'product_added_to_cart',
          'checkout_started',
          'checkout_completed',
        ],
        // GA4 recommended-event param mapping. `event_name` is derived per source
        // event by the pixel; value/currency/transaction_id come off the checkout.
        mapping: {
          event_name: '{{event.name}}',
          value: '{{event.data.checkout.totalPrice.amount}}',
          currency: '{{event.data.checkout.currencyCode}}',
          transaction_id: '{{event.data.checkout.order.id}}',
          items: '{{event.data.checkout.lineItems}}',
        },
      },
    },
  },

  // ANA-PIXEL-02 — Meta (Facebook) Pixel standard events for ad attribution.
  {
    id: 'ANA-PIXEL-02',
    name: 'Meta Pixel — Standard Events',
    description:
      'Web pixel that forwards the storefront funnel to the Meta Pixel as standard events (ViewContent, AddToCart, InitiateCheckout, Purchase) for ad attribution and lookalike audiences.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tier: 'standard',
    tags: ['analytics', 'pixel', 'meta', 'facebook', 'ads', 'attribution'],
    spec: {
      type: 'analytics.pixel',
      name: 'Meta Pixel — Standard Events',
      category: 'INTEGRATION',
      requires: [],
      config: {
        pixelId: '000000000000000',
        events: [
          'product_viewed',
          'product_added_to_cart',
          'checkout_started',
          'checkout_completed',
        ],
        // Meta standard-event params. `event` is resolved per source event to the
        // matching Meta name (ViewContent/AddToCart/InitiateCheckout/Purchase).
        mapping: {
          event: '{{event.name}}',
          value: '{{event.data.checkout.totalPrice.amount}}',
          currency: '{{event.data.checkout.currencyCode}}',
          content_ids: '{{event.data.productVariant.id}}',
          content_type: 'literal:product',
        },
      },
    },
  },

  // ANA-PIXEL-03 — TikTok Pixel funnel events for TikTok Ads.
  {
    id: 'ANA-PIXEL-03',
    name: 'TikTok Pixel — Funnel Events',
    description:
      'Web pixel that maps the storefront funnel to TikTok Pixel events (ViewContent, AddToCart, InitiateCheckout, CompletePayment) for TikTok Ads optimization and reporting.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tier: 'standard',
    tags: ['analytics', 'pixel', 'tiktok', 'ads', 'social', 'conversion'],
    spec: {
      type: 'analytics.pixel',
      name: 'TikTok Pixel — Funnel Events',
      category: 'INTEGRATION',
      requires: [],
      config: {
        pixelId: 'XXXXXXXXXXXXXXXXXXXX',
        events: [
          'product_viewed',
          'product_added_to_cart',
          'checkout_started',
          'checkout_completed',
        ],
        mapping: {
          event: '{{event.name}}',
          value: '{{event.data.checkout.totalPrice.amount}}',
          currency: '{{event.data.checkout.currencyCode}}',
          content_id: '{{event.data.productVariant.id}}',
        },
      },
    },
  },

  // ANA-PIXEL-04 — consent-strict minimal pixel: page + product views only, no
  // order value, no identifiers. The privacy-first baseline.
  {
    id: 'ANA-PIXEL-04',
    name: 'Consent-Strict Minimal Pixel',
    description:
      'A privacy-first web pixel that captures only anonymous page and product views — no order value, no customer or transaction identifiers — for basic traffic analytics under strict consent.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tier: 'standard',
    tags: ['analytics', 'pixel', 'consent', 'privacy', 'minimal', 'gdpr'],
    spec: {
      type: 'analytics.pixel',
      name: 'Consent-Strict Minimal Pixel',
      category: 'INTEGRATION',
      requires: [],
      config: {
        events: ['page_viewed', 'product_viewed'],
        // Deliberately no value/id fields — only the event name and its timestamp,
        // so nothing personally identifying leaves the pixel sandbox.
        mapping: {
          event_name: '{{event.name}}',
          timestamp: '{{event.timestamp}}',
        },
      },
    },
  },
];
