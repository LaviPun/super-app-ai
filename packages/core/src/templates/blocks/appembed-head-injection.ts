import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * App-embed HEAD injection templates (unit: appembed-head-injection, 034 surface
 * coverage → theme-extension blocks lib).
 *
 * Every entry is a `theme.section` with `config.activation: 'head'` — the head
 * app-embed surface. Head modules have NO visible markup (recipe.ts:346-351): they
 * inject into the document `<head>` — JSON-LD structured data, meta/OG tags, resource
 * preload, third-party pixel/tag bootstrap, and Consent Mode v2 defaults. Because they
 * render nothing on-page, they carry NO `style` display object and NO `blocks[]`; their
 * configuration lives in `config.fields` (typed via `config.fieldSchema` where it aids
 * retrieval + the merchant form).
 *
 * Grounding (028 corpus): Judge.me/Loox mirror review aggregates and inject JSON-LD
 * rich snippets for Google (judge-me.md:118, loox.md:81); Klaviyo/ProveSource/Omnisend
 * bootstrap an on-site tracking pixel + form renderer via a head/app-embed script and
 * gate it behind marketing consent (klaviyo.md:20-21, provesource.md:93, omnisend.md:23).
 * These reflect the REAL head-surface footprint those apps ship — not generic filler.
 *
 * HONESTY: head injection ships as an app-embed (034 storefront build landed the
 * app-embed emit path). These templates DECLARE the head payload; the merchant still
 * supplies the third-party id / measurement id, and consent is enforced — a pixel with
 * no id, or a shopper who has not consented, injects nothing (never a fake load).
 */

const t = (ts: readonly (typeof THEME_PLACEABLE_TEMPLATES)[number][]): (typeof THEME_PLACEABLE_TEMPLATES)[number][] => [...ts];

export const APPEMBED_HEAD_INJECTION_TEMPLATES: TemplateEntry[] = [
  // ── EMB-HEAD-01 · Product rich-snippet JSON-LD (reviews aggregate) ────────────
  {
    id: 'EMB-HEAD-01',
    name: 'Product Rich Snippet (Review JSON-LD)',
    description: 'Injects Product + AggregateRating JSON-LD into the product page <head> so Google shows star ratings in search results — reads the mirrored reviews.rating / reviews.rating_count metafields.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'json-ld', 'structured-data', 'reviews', 'seo', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Product Rich Snippet (Review JSON-LD)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'json-ld',
        activation: 'head',
        title: 'Product review rich snippet',
        subtitle: 'Product + AggregateRating structured data for Google rich results',
        fieldSchema: {
          fields: [
            { name: 'schemaType', label: 'Schema type', type: 'select', required: true, options: ['Product', 'Product + Offer', 'Product + AggregateRating'], piiFlag: false },
            { name: 'ratingMetafield', label: 'Rating metafield', type: 'text', required: false, piiFlag: false, help: 'Namespace.key holding the aggregate rating (default reviews.rating).' },
            { name: 'ratingCountMetafield', label: 'Rating-count metafield', type: 'text', required: false, piiFlag: false, help: 'Namespace.key holding the review count (default reviews.rating_count).' },
            { name: 'includeOffer', label: 'Include price / availability offer', type: 'boolean', required: false, piiFlag: false },
          ],
        },
        fields: {
          schemaType: 'Product + AggregateRating',
          ratingMetafield: 'reviews.rating',
          ratingCountMetafield: 'reviews.rating_count',
          includeOffer: true,
          ratingScaleMin: 1,
          ratingScaleMax: 5,
          suppressWhenNoReviews: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['product']) } },
    },
  },

  // ── EMB-HEAD-02 · Organization + WebSite JSON-LD (sitelinks search box) ───────
  {
    id: 'EMB-HEAD-02',
    name: 'Organization & Sitelinks Search JSON-LD',
    description: 'Injects Organization + WebSite JSON-LD (logo, social profiles, sitelinks search box action) into the homepage <head> so the brand appears correctly in Google Knowledge Panel and search.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'json-ld', 'structured-data', 'seo', 'organization', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Organization & Sitelinks Search JSON-LD',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'json-ld',
        activation: 'head',
        title: 'Organization structured data',
        subtitle: 'Brand identity + sitelinks search box for Google',
        fieldSchema: {
          fields: [
            { name: 'organizationName', label: 'Organization name', type: 'text', required: true, piiFlag: false },
            { name: 'logoUrl', label: 'Logo URL', type: 'url', required: false, piiFlag: false, help: 'Square logo, ≥112x112px, for the Knowledge Panel.' },
            { name: 'searchUrlTemplate', label: 'Search URL template', type: 'text', required: false, piiFlag: false, help: 'e.g. /search?q={search_term_string}' },
          ],
        },
        fields: {
          organizationName: 'Your Store',
          logoUrl: 'https://cdn.shopify.com/s/files/placeholder/logo.png',
          searchUrlTemplate: '/search?q={search_term_string}',
          sameAs: ['https://instagram.com/yourstore', 'https://facebook.com/yourstore'],
          includeSitelinksSearchBox: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['index']) } },
    },
  },

  // ── EMB-HEAD-03 · BreadcrumbList JSON-LD (collection navigation) ──────────────
  {
    id: 'EMB-HEAD-03',
    name: 'Breadcrumb JSON-LD',
    description: 'Injects BreadcrumbList JSON-LD into collection and product page <head> so Google renders the category breadcrumb trail above the search result instead of a bare URL.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'json-ld', 'structured-data', 'seo', 'breadcrumb', 'collection'],
    spec: {
      type: 'theme.section',
      name: 'Breadcrumb JSON-LD',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'json-ld',
        activation: 'head',
        title: 'Breadcrumb structured data',
        subtitle: 'BreadcrumbList trail for search results',
        fieldSchema: {
          fields: [
            { name: 'includeHome', label: 'Start trail at Home', type: 'boolean', required: false, piiFlag: false },
            { name: 'homeLabel', label: 'Home label', type: 'text', required: false, piiFlag: false },
          ],
        },
        fields: {
          includeHome: true,
          homeLabel: 'Home',
          deriveFromCollectionAndProduct: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['collection', 'product']) } },
    },
  },

  // ── EMB-HEAD-04 · Open Graph + Twitter Card meta (social share) ───────────────
  {
    id: 'EMB-HEAD-04',
    name: 'Open Graph & Twitter Card Meta',
    description: 'Injects Open Graph + Twitter Card <meta> tags into the <head> so shared product and page links render a rich preview card (title, description, image) on Facebook, X, and iMessage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'meta', 'open-graph', 'social-share', 'seo', 'product'],
    spec: {
      type: 'theme.section',
      name: 'Open Graph & Twitter Card Meta',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'meta',
        activation: 'head',
        title: 'Social share meta tags',
        subtitle: 'Open Graph + Twitter Card preview cards',
        fieldSchema: {
          fields: [
            { name: 'twitterCardType', label: 'Twitter card type', type: 'select', required: false, options: ['summary', 'summary_large_image'], piiFlag: false },
            { name: 'twitterSite', label: 'Twitter @handle', type: 'text', required: false, piiFlag: false },
            { name: 'fallbackImageUrl', label: 'Fallback share image', type: 'url', required: false, piiFlag: false },
          ],
        },
        fields: {
          twitterCardType: 'summary_large_image',
          twitterSite: '@yourstore',
          fallbackImageUrl: 'https://cdn.shopify.com/s/files/placeholder/og-image.png',
          ogType: 'product',
          useProductImageWhenAvailable: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['product', 'index', 'page']) } },
    },
  },

  // ── EMB-HEAD-05 · Resource preload / preconnect (perf) ────────────────────────
  {
    id: 'EMB-HEAD-05',
    name: 'Resource Preload & Preconnect Hints',
    description: 'Injects <link rel="preconnect"> and <link rel="preload"> resource hints into the <head> to warm CDN/font connections and prioritize the hero image — cuts LCP on the homepage and product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'zap',
    tags: ['head', 'app-embed', 'preload', 'preconnect', 'performance', 'core-web-vitals', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Resource Preload & Preconnect Hints',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'preload',
        activation: 'head',
        title: 'Performance resource hints',
        subtitle: 'preconnect + preload to improve LCP',
        fieldSchema: {
          fields: [
            { name: 'preloadHeroImage', label: 'Preload hero image', type: 'boolean', required: false, piiFlag: false },
            { name: 'fontPreloadUrl', label: 'Font file to preload', type: 'url', required: false, piiFlag: false, help: 'A woff2 URL for the above-the-fold heading font.' },
          ],
        },
        fields: {
          preloadHeroImage: true,
          fontPreloadUrl: 'https://cdn.shopify.com/s/files/placeholder/heading.woff2',
          preconnectOrigins: ['https://cdn.shopify.com', 'https://fonts.gstatic.com'],
          crossoriginFonts: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['index', 'product']) } },
    },
  },

  // ── EMB-HEAD-06 · Marketing pixel bootstrap (Klaviyo/Omnisend onsite tag) ─────
  {
    id: 'EMB-HEAD-06',
    name: 'Marketing Pixel Bootstrap (Onsite Tag)',
    description: 'Bootstraps a marketing platform onsite tag (Klaviyo/Omnisend style) in the <head> — loads the tracking script and form renderer that fire browse/cart events; injects nothing until a public key is set and marketing consent is granted.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'pixel', 'bootstrap', 'klaviyo', 'omnisend', 'tracking'],
    spec: {
      type: 'theme.section',
      name: 'Marketing Pixel Bootstrap (Onsite Tag)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pixel-bootstrap',
        activation: 'head',
        title: 'Marketing onsite tag',
        subtitle: 'Klaviyo / Omnisend style tracking + form loader',
        fieldSchema: {
          fields: [
            { name: 'provider', label: 'Provider', type: 'select', required: true, options: ['klaviyo', 'omnisend'], piiFlag: false },
            { name: 'publicKey', label: 'Public site / account ID', type: 'text', required: false, piiFlag: false, help: 'e.g. Klaviyo company_id / Omnisend account ID. Empty = tag not injected.' },
            { name: 'loadFormRenderer', label: 'Load popup / form renderer', type: 'boolean', required: false, piiFlag: false },
          ],
        },
        fields: {
          provider: 'klaviyo',
          publicKey: '',
          loadFormRenderer: true,
          requireMarketingConsent: true,
          async: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['index', 'product', 'collection', 'cart', 'search', 'page']) } },
    },
  },

  // ── EMB-HEAD-07 · Social-proof pixel bootstrap (ProveSource style) ────────────
  {
    id: 'EMB-HEAD-07',
    name: 'Social-Proof Pixel Bootstrap',
    description: 'Bootstraps a social-proof pixel (ProveSource style) in the <head> that fetches sales/visitor events from the vendor backend and renders corner toast + inline trust widgets site-wide; loads nothing until a site ID is supplied.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'code',
    tags: ['head', 'app-embed', 'pixel', 'bootstrap', 'provesource', 'social-proof', 'index'],
    spec: {
      type: 'theme.section',
      name: 'Social-Proof Pixel Bootstrap',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'pixel-bootstrap',
        activation: 'head',
        title: 'Social-proof pixel',
        subtitle: 'ProveSource style sales-pop + live-visitor loader',
        fieldSchema: {
          fields: [
            { name: 'siteId', label: 'Site / account ID', type: 'text', required: false, piiFlag: false, help: 'Vendor site ID. Empty = pixel not injected.' },
            { name: 'scriptSrc', label: 'Pixel script URL', type: 'url', required: false, piiFlag: false },
          ],
        },
        fields: {
          siteId: '',
          scriptSrc: 'https://cdn.provesrc.com/provesrc.js',
          async: true,
          deferUntilInteraction: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['index', 'product', 'collection', 'cart']) } },
    },
  },

  // ── EMB-HEAD-08 · Consent Mode v2 defaults ───────────────────────────────────
  {
    id: 'EMB-HEAD-08',
    name: 'Consent Mode v2 Defaults',
    description: 'Injects a Google Consent Mode v2 default-state block at the top of the <head> (ad_storage, analytics_storage, ad_user_data, ad_personalization = denied by default) so downstream tags respect consent until the banner grants it.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'shield',
    tags: ['head', 'app-embed', 'consent-mode', 'privacy', 'gdpr', 'compliance', 'tracking'],
    spec: {
      type: 'theme.section',
      name: 'Consent Mode v2 Defaults',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'consent',
        activation: 'head',
        title: 'Consent Mode v2 defaults',
        subtitle: 'Deny-by-default consent state for downstream tags',
        fieldSchema: {
          fields: [
            { name: 'defaultAdStorage', label: 'ad_storage default', type: 'select', required: false, options: ['denied', 'granted'], piiFlag: false },
            { name: 'defaultAnalyticsStorage', label: 'analytics_storage default', type: 'select', required: false, options: ['denied', 'granted'], piiFlag: false },
            { name: 'waitForUpdateMs', label: 'wait_for_update (ms)', type: 'number', required: false, piiFlag: false },
          ],
        },
        fields: {
          defaultAdStorage: 'denied',
          defaultAnalyticsStorage: 'denied',
          defaultAdUserData: 'denied',
          defaultAdPersonalization: 'denied',
          defaultFunctionalityStorage: 'granted',
          waitForUpdateMs: 500,
          syncWithShopifyCustomerPrivacy: true,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: t(['index', 'product', 'collection', 'cart', 'search', 'page', 'article', 'blog']) } },
    },
  },
];

export const templates = APPEMBED_HEAD_INJECTION_TEMPLATES;
