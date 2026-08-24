import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * proxy.widget module templates — app-proxy served, shopper-scoped storefront + order
 * surfaces. Every entry compiles the `proxy.widget` RecipeSpec member (recipe.ts):
 * an app-proxy fragment (`surface: 'embed'`) or a standalone routed page
 * (`surface: 'full_page'`, layout:false). All are served at the app's single fixed
 * app-proxy subpath, `/apps/superapp/<widgetId>` (the app has one app_proxy).
 *
 * These reflect the REAL surfaces the corpus apps route through an app proxy —
 * dynamic, per-shopper content that pure Liquid cannot render:
 *  - Swym Wishlist Plus  → the hosted wishlist page / pop-up (regid/email-scoped list).
 *  - Recharge / Loop     → the standalone customer subscription portal (magic-link).
 *  - Rebuy / Selleasy    → client-hydrated recommendation carousels served from a backend.
 *  - LoyaltyLion / Okendo→ the floating loyalty/points hub + rewards portal.
 *  - Loox                → dynamic review data (fetch/sort/filter/paginate) + submission.
 *  - ProveSource         → live-visitor / recent-order social-proof toast.
 *  - order-tracking      → a self-serve "where is my order" lookup page.
 *
 * HONESTY: the app-proxy loader is the strongest evaluation site (authenticated
 * customer + cart), but shopper-scoped balances/lists/contracts only populate once
 * the proxy backend for that domain is provisioned. These templates ship the
 * declarative widget + placement + display rules; they do NOT imply guaranteed-live
 * per-shopper data before the proxy endpoint exists — the widget renders its
 * empty/sign-in state until then. No fabricated data.
 */
export const PROXY_WIDGET_STOREFRONT_AND_ORDER_TEMPLATES: TemplateEntry[] = [
  // ── Wishlist (Swym Wishlist Plus) ──────────────────────────────────────────
  {
    id: 'PXY-MOD-01',
    tier: 'standard',
    name: 'Wishlist Page (Hosted)',
    description: 'Standalone wishlist page served from the app proxy (/apps/superapp/<widgetId>) — a shopper-scoped product grid with remove + add-to-cart, so guest and logged-in lists sync across devices.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'wishlist',
    tags: ['swym', 'wishlist', 'full-page', 'proxy', 'account', 'save-for-later'],
    spec: {
      type: 'proxy.widget',
      name: 'Wishlist Page (Hosted)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'swym-wishlist-page',
        mode: 'HTML',
        surface: 'full_page',
        title: 'My Wishlist',
        message: 'Everything you have saved, in one place. Sign in to sync your list across every device.',
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
  {
    id: 'PXY-MOD-02',
    tier: 'floor',
    name: 'Wishlist Drawer Pop-up',
    description: 'Embeddable wishlist pop-up fragment the floating heart launcher opens — a shopper-scoped saved-items drawer with live counter, served from the app proxy so it hydrates the current shopper list without a page reload.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'wishlist',
    tags: ['swym', 'wishlist', 'popup', 'proxy', 'drawer', 'overlay'],
    spec: {
      type: 'proxy.widget',
      name: 'Wishlist Drawer Pop-up',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'swym-wishlist-drawer',
        mode: 'HTML',
        surface: 'embed',
        title: 'Saved items',
        message: 'Tap the heart to save products for later.',
      },
      placement: { enabled_on: { templates: ['product', 'collection', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'overlay', anchor: 'right', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'modal' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdrop: '#000000', overlayBackdropOpacity: 0.5, seed: '#e11d48' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'lg', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },
  {
    id: 'PXY-MOD-03',
    tier: 'floor',
    name: 'Shared Wishlist / Registry Page',
    description: 'Public shareable wishlist page served from the app proxy (/apps/superapp/<widgetId>) — renders a read-only registry list from a share token so gifters can view and buy, resolving the list per share link.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'wishlist',
    tags: ['swym', 'wishlist', 'registry', 'full-page', 'proxy', 'share'],
    spec: {
      type: 'proxy.widget',
      name: 'Shared Wishlist / Registry Page',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'swym-wishlist-shared',
        mode: 'HTML',
        surface: 'full_page',
        title: 'A wishlist shared with you',
        message: 'Pick something from their saved items — purchases update the list automatically.',
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Order tracking ─────────────────────────────────────────────────────────
  {
    id: 'PXY-MOD-04',
    tier: 'floor',
    name: 'Order Tracking Page',
    description: 'Self-serve "where is my order" page served from the app proxy (/apps/superapp/<widgetId>) — shopper enters order number + email and the app-proxy loader returns fulfillment status and tracking, rendered without the theme layout as a first-class store page.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'shipping',
    tags: ['order-tracking', 'full-page', 'proxy', 'fulfillment', 'wismo', 'support'],
    spec: {
      type: 'proxy.widget',
      name: 'Order Tracking Page',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'order-tracking-page',
        mode: 'HTML',
        surface: 'full_page',
        title: 'Track your order',
        message: 'Enter your order number and email to see the latest shipping status.',
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#2563eb' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Recommendations portal (Rebuy / Selleasy) ──────────────────────────────
  {
    id: 'PXY-MOD-07',
    tier: 'standard',
    name: 'PDP Cross-Sell Carousel (Rebuy)',
    description: 'Embeddable "you may also like" carousel on the product page — client-hydrated from the app proxy so the recommended set resolves per product and shopper, matching Rebuy\'s Data Source-driven cross-sell widget.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'upsell',
    tags: ['rebuy', 'recommendations', 'cross-sell', 'proxy', 'product', 'carousel'],
    spec: {
      type: 'proxy.widget',
      name: 'PDP Cross-Sell Carousel (Rebuy)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'rebuy-pdp-crosssell',
        mode: 'HTML',
        surface: 'embed',
        title: 'You may also like',
        message: 'Personalized picks based on this product and the current cart.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            { logic: 'AND', conditions: [{ object: 'product', attribute: 'available', operator: 'equal_to', value: true }] },
          ],
        },
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },
  {
    id: 'PXY-MOD-10',
    tier: 'floor',
    name: 'Recommendations Portal Page',
    description: 'Standalone "recommended for you" page served from the app proxy (/apps/superapp/<widgetId>) — a full-page personalized product feed resolving per-shopper picks (recently viewed, buy-it-again) as a first-class store page.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'upsell',
    tags: ['rebuy', 'recommendations', 'full-page', 'proxy', 'personalized', 'portal'],
    spec: {
      type: 'proxy.widget',
      name: 'Recommendations Portal Page',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'recs-portal-page',
        mode: 'HTML',
        surface: 'full_page',
        title: 'Recommended for you',
        message: 'A personalized feed built from what you have viewed and bought before.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            { logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true }] },
          ],
        },
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    },
  },

  // ── Social proof (ProveSource) + back-in-stock (Appikon) ────────────────────
  {
    id: 'PXY-MOD-19',
    tier: 'standard',
    name: 'Back-in-Stock Signup Widget (Appikon)',
    description: 'Embeddable back-in-stock notify-me widget on out-of-stock products — served from the app proxy so it captures the shopper email against the variant waitlist, matching Appikon Notify Me.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'back-in-stock',
    tags: ['appikon', 'back-in-stock', 'proxy', 'product', 'waitlist', 'notify-me'],
    spec: {
      type: 'proxy.widget',
      name: 'Back-in-Stock Signup Widget (Appikon)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'appikon-back-in-stock',
        mode: 'HTML',
        surface: 'embed',
        title: 'Notify me when available',
        message: 'Leave your email and we will alert you the moment this is back in stock.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            { logic: 'AND', conditions: [{ object: 'product', attribute: 'available', operator: 'equal_to', value: false }] },
          ],
        },
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0ea5e9' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },
];
