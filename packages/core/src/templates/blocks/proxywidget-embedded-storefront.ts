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

];
