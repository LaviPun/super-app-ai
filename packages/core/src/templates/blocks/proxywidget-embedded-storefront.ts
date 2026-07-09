/**
 * proxy.widget — embedded storefront widgets (surface: 'embed').
 *
 * Authoring unit for the 032 template library. Every entry is a `proxy.widget`
 * RecipeSpec that renders an app-proxy-served, client-hydrated fragment embedded
 * INTO a theme page (`surface: 'embed'`, the deployable-today Liquid path — 034
 * §"Deployable TODAY: proxy.widget liquid"). These are the widgets whose contents
 * are shopper-scoped and dynamic (reviews pulled/sorted/paginated, a wishlist keyed
 * to the shopper, personalized recommendation strips, a live social-proof stream, a
 * back-in-stock waitlist form) — i.e. the surfaces the corpus records map to
 * `proxy.widget` precisely because a static Liquid section cannot hold their state.
 *
 * Grounded in: loox / okendo (reviews), rebuy / selleasy (recs + FBT), swym-wishlist-plus
 * (wishlist button + page), loyaltylion (loyalty launcher/panel), provesource
 * (inline social-proof), appikon-notify-me (back-in-stock).
 *
 * HONESTY: these embedded blocks are `mode: 'HTML'` + `surface: 'embed'` only. The
 * `full_page` surface is served by the proxy route (layout:false) but at the same fixed
 * `/apps/superapp/<widgetId>` path — there is no per-widget routed subpath. The widget renders its shell
 * + copy from config; the live data (review bodies, wishlist items, recommended
 * products, loyalty balance, waitlist confirmation) is hydrated by the app-proxy
 * loader at request time and honestly DEGRADES to the shell / an empty state until
 * the proxy resolves it — never a faked "N shoppers bought this" or a fake balance.
 *
 * `ruleEngine` gates server-side in the proxy loader (the strongest evaluation site;
 * the proxy has the authenticated customer + cart). Only resolvable (object,attribute)
 * pairs from RULE_ATTRIBUTES are used.
 *
 * See specs/032-template-library/design.md §C for the authoring contract and
 * packages/core/src/recipe.ts (`proxy.widget` member) for the schema of record.
 */
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/** Narrow helper so placement template literals type-check against the manifest. */
type PlaceableTemplate = (typeof THEME_PLACEABLE_TEMPLATES)[number];

export const templates: TemplateEntry[] = [
  // ── 01 · Loox — dynamic photo-review wall (reviews) ────────────────────────
  {
    id: 'PXY-EMB-01',
    name: 'Loox Photo Review Wall (Embedded)',
    description:
      'App-proxy reviews widget embedded on the product page — verified-buyer photo/video review cards fetched, sorted (visual-first) and paginated server-side.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'reviews',
    tags: ['loox', 'reviews', 'ugc', 'social-proof', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Loox Photo Review Wall (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'loox-review-wall',
        mode: 'HTML',
        surface: 'embed',
        title: 'Loved by thousands',
        message:
          'Real photos from verified buyers. Filter by rating or media, sorted visual-first.',
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { seed: '#f5a623', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 02 · Okendo — reviews + Q&A widget (reviews) ───────────────────────────
  {
    id: 'PXY-EMB-02',
    name: 'Okendo Reviews & Q&A (Embedded)',
    description:
      'App-proxy Okendo reviews module for the product page — score summary rail, attribute averages, filter chips, and a Q&A accordion hydrated from the reviews backend.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'reviews',
    tags: ['okendo', 'reviews', 'qa', 'attributes', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Okendo Reviews & Q&A (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'okendo-reviews-qa',
        mode: 'HTML',
        surface: 'embed',
        title: 'Reviews & Questions',
        message:
          'Average score, star distribution and sizing/fit attribute averages, with filter chips and a Q&A tab.',
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f766e' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 03 · Rebuy — PDP cross-sell recommendations strip (recs) ───────────────
  {
    id: 'PXY-EMB-03',
    name: 'Rebuy PDP Cross-Sell Strip (Embedded)',
    description:
      'App-proxy Rebuy recommendation carousel below the product — a Data-Source ruleset resolves personalized cross-sells server-side with an add-to-cart per card.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'widget',
    tags: ['rebuy', 'recommendations', 'cross-sell', 'carousel', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Rebuy PDP Cross-Sell Strip (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'rebuy-pdp-crosssell',
        mode: 'HTML',
        surface: 'embed',
        title: 'You may also like',
        message: 'Personalized picks from a Rebuy Data-Source ruleset. Empty until the proxy resolves recommendations.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'product', attribute: 'available', operator: 'equal_to', value: true },
              ],
            },
          ],
        },
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#4f46e5' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 04 · Rebuy — cart cross-sell recommendations (recs, cart) ──────────────
  {
    id: 'PXY-EMB-04',
    name: 'Rebuy Cart Cross-Sell (Embedded)',
    description:
      'App-proxy Rebuy cross-sell embedded on the cart page — recommendations resolved against the live cart contents, shown only when the cart has at least one item.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'cart',
    tags: ['rebuy', 'recommendations', 'cross-sell', 'cart', 'aov', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Rebuy Cart Cross-Sell (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'rebuy-cart-crosssell',
        mode: 'HTML',
        surface: 'embed',
        title: 'Complete your order',
        message: 'Add-ons matched to what is in your cart. Resolved server-side against live cart contents.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'cart', attribute: 'itemCount', operator: 'greater_than', value: 0 },
              ],
            },
          ],
        },
      },
      placement: { enabled_on: { templates: ['cart'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#e07856' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 05 · Selleasy — Frequently Bought Together (recs) ──────────────────────
  {
    id: 'PXY-EMB-05',
    name: 'Selleasy Frequently Bought Together (Embedded)',
    description:
      'App-proxy Amazon-style FBT block on the product page — offer products resolved server-side (manual list, recommendation engine, or metafield) with a combined total and "add all".',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'widget',
    tags: ['selleasy', 'upsell', 'frequently-bought-together', 'bundle', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Selleasy Frequently Bought Together (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'selleasy-fbt',
        mode: 'HTML',
        surface: 'embed',
        title: 'Frequently bought together',
        message: 'Bundle the essentials in one click. Offer products and combined price resolved by the proxy.',
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'bottom', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 06 · Swym — wishlist button (wishlist, product) ────────────────────────
  {
    id: 'PXY-EMB-06',
    name: 'Swym Wishlist Button (Embedded)',
    description:
      'App-proxy wishlist button beside add-to-cart on the product page — toggles a shopper-scoped list (regid/email) with a default/added state and optional social-save count.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'heart',
    tags: ['swym', 'wishlist', 'save-for-later', 'social-proof', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Swym Wishlist Button (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'swym-wishlist-button',
        mode: 'HTML',
        surface: 'embed',
        title: 'Add to Wishlist',
        message: 'Saves to a shopper-scoped list; the added state and any social-save count come from the wishlist backend.',
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f766e' },
        shape: { radius: 'full', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 07 · Swym — wishlist page / drawer (wishlist) ──────────────────────────
  {
    id: 'PXY-EMB-07',
    name: 'Swym Wishlist Page (Embedded)',
    description:
      'App-proxy wishlist page embedded on a dedicated page — renders the shopper\'s saved product grid with add-to-cart per item and a shareable-list link, hydrated from the list backend.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'heart',
    tags: ['swym', 'wishlist', 'saved-items', 'share', 'page', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Swym Wishlist Page (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'swym-wishlist-page',
        mode: 'HTML',
        surface: 'embed',
        title: 'My Wishlist',
        message: 'Your saved products with add-to-cart and a share link. Empty until the proxy loads your list.',
      },
      placement: { enabled_on: { templates: ['page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#e07856' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 08 · LoyaltyLion — loyalty launcher / panel (loyalty) ──────────────────
  {
    id: 'PXY-EMB-08',
    name: 'LoyaltyLion Rewards Panel (Embedded)',
    description:
      'App-proxy loyalty widget embedded in-page — a tabbed panel (earn / spend / referral / tier) that reads the logged-in shopper\'s points balance server-side; guests see a sign-up splash.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'star',
    tags: ['loyaltylion', 'loyalty', 'rewards', 'points', 'referral', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'LoyaltyLion Rewards Panel (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'loyaltylion-panel',
        mode: 'HTML',
        surface: 'embed',
        title: 'Rewards',
        message:
          'Earn, spend, refer, and tier progress. Points balance loads from the loyalty ledger for members; guests see a sign-up splash until the proxy resolves identity.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true },
              ],
            },
          ],
        },
      },
      placement: { enabled_on: { templates: ['page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { seed: '#4f46e5', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 09 · ProveSource — inline social-proof PDP widget (social-proof) ───────
  {
    id: 'PXY-EMB-09',
    name: 'ProveSource Inline Social Proof (Embedded)',
    description:
      'App-proxy inline social-proof block on the product page — a trust widget rendered in-flow from the ProveSource event stream; shows nothing until real events resolve (no fabricated counts).',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'widget',
    tags: ['provesource', 'social-proof', 'trust', 'fomo', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'ProveSource Inline Social Proof (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'provesource-inline',
        mode: 'HTML',
        surface: 'embed',
        title: 'Recently purchased',
        message: 'Live activity from the event stream. Renders empty until real events resolve — no fabricated counts.',
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#7c3aed' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 10 · Appikon — back-in-stock "Notify Me" widget (back-in-stock) ────────
  {
    id: 'PXY-EMB-10',
    name: 'Notify Me When Available (Embedded)',
    description:
      'App-proxy back-in-stock widget on the product page — a variant-aware "Notify Me" button that captures an email/phone waitlist entry server-side; shows only for sold-out variants.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'widget',
    tags: ['appikon', 'back-in-stock', 'notify-me', 'waitlist', 'product', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Notify Me When Available (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'appikon-notify-me',
        mode: 'HTML',
        surface: 'embed',
        title: 'Notify me when available',
        message: 'Capture email (and phone if SMS is on) for a restock alert. The waitlist entry is written server-side.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'product', attribute: 'available', operator: 'equal_to', value: false },
              ],
            },
          ],
        },
      },
      placement: { enabled_on: { templates: ['product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#0f766e' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    } as unknown as TemplateEntry['spec'],
  },

  // ── 11 · Rebuy — recently-viewed / buy-it-again strip (recs) ───────────────
  {
    id: 'PXY-EMB-11',
    name: 'Rebuy Recently Viewed & Buy It Again (Embedded)',
    description:
      'App-proxy Rebuy "recently viewed / buy it again" strip on the homepage — a returning-shopper recommendation rail resolved from behavioral + order history server-side, shown to logged-in members.',
    category: 'STOREFRONT_UI',
    type: 'proxy.widget',
    icon: 'widget',
    tags: ['rebuy', 'recommendations', 'buy-it-again', 'recently-viewed', 'index', 'embed'],
    spec: {
      type: 'proxy.widget',
      name: 'Rebuy Recently Viewed & Buy It Again (Embedded)',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'rebuy-buy-it-again',
        mode: 'HTML',
        surface: 'embed',
        title: 'Pick up where you left off',
        message:
          'Recently viewed and buy-it-again picks from behavioral + order history. Resolved by the proxy; empty for new visitors.',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          onUnresolved: 'defer',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true },
              ],
            },
          ],
        },
      },
      placement: { enabled_on: { templates: ['index'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#4f46e5' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'bold',
      },
    } as unknown as TemplateEntry['spec'],
  },
];
