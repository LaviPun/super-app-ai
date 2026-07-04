import type { TemplateEntry } from '../types.js';

/**
 * Admin customer-details block templates (recipeType = admin.block).
 *
 * All five mount on `admin.customer-details.block.render` — the customer-details
 * page block surface — and render declaratively through the shipped generic admin
 * UI extension (extensions/admin-ui) from the persisted `$app:superapp_admin_block`
 * metaobject: description + label/value fields + status badges + a data table +
 * link-buttons + deep-links (AdminContentShape, recipe.ts:193-245).
 *
 * Grounded in the 028 corpus of the retention apps whose merchant-facing summaries
 * a store owner most wants pinned on the customer record:
 *  - loyalty/points  — Smile.io, LoyaltyLion, Growave (points balance, VIP tier,
 *    referral link, ledger)
 *  - reviews history — Yotpo (per-customer written reviews, verified/media state)
 *  - subscriptions   — Recharge (active subscriptions, next charge, portal actions)
 *
 * HONESTY: these apps keep their real state in their OWN hosted backend (Smile /
 * LoyaltyLion / Growave / Yotpo / Recharge DBs), not in Shopify — see each record's
 * data_model + mapping_note. So the fields/tables below are the DECLARATIVE render
 * surface (label + sample/placeholder values a merchant fills or a sync populates),
 * and the buttons/links are deep-links into the app that owns the live data. Nothing
 * here implies a guaranteed-live in-admin data binding: the admin.block family
 * AUDIT-compiles + renders the persisted payload, it does not fetch the vendor ledger.
 * Buttons with a `url` render as link-buttons; a link's `url` is a relative app deep
 * link. No `requires` flags are authored — the barrel's modernize layer injects them.
 */
export const ADMIN_BLOCK_CUSTOMER_DETAILS_TEMPLATES: TemplateEntry[] = [
  {
    id: 'ADMB-CUS-01',
    name: 'Loyalty & Points Summary (Smile-style)',
    description:
      'Pins a customer’s loyalty snapshot on the admin customer-details page — points balance, VIP tier, lifetime spend, and a jump into the loyalty program.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'loyalty',
    tags: ['smile-io', 'loyalty', 'points', 'customer', 'vip', 'admin'],
    spec: {
      type: 'admin.block',
      name: 'Loyalty & Points Summary',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.block.render',
        label: 'Loyalty & Points',
        description:
          'This customer’s loyalty standing in the rewards program. Balances and tier are read from the loyalty app’s ledger, not stored in Shopify — open the program to adjust points or perks.',
        fields: [
          { label: 'Points balance', value: '1,240 points', tone: 'success' },
          { label: 'Pending points', value: '80 points', tone: 'info' },
          { label: 'VIP tier', value: 'Gold' },
          { label: 'Lifetime spend (12mo)', value: '$1,910.00' },
          { label: 'Points currency', value: 'Glam Bucks' },
        ],
        badges: [
          { label: 'VIP: Gold', tone: 'success' },
          { label: 'Enrolled', tone: 'info' },
        ],
        buttons: [
          { label: 'Open loyalty program', url: '/app/loyalty/members' },
          { label: 'Adjust points', url: '/app/loyalty/members/adjust' },
        ],
        links: [{ label: 'View earning & redemption rules', url: '/app/loyalty/settings' }],
      },
    },
  },
  {
    id: 'ADMB-CUS-02',
    name: 'Points Ledger & Referrals (LoyaltyLion-style)',
    description:
      'Shows the recent points-ledger rows and referral status for a customer on the admin customer-details page — earned/redeemed history plus their referral link.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'loyalty',
    tags: ['loyaltylion', 'loyalty', 'referrals', 'points-ledger', 'customer', 'admin'],
    spec: {
      type: 'admin.block',
      name: 'Points Ledger & Referrals',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.block.render',
        label: 'Points Ledger & Referrals',
        description:
          'Recent loyalty ledger entries and referral standing. The ledger lives in the loyalty backend keyed to this Shopify customer — rows here reflect the last sync.',
        fields: [
          { label: 'Approved balance', value: '2,050 points', tone: 'success' },
          { label: 'Referral link', value: 'refer.shop/lion-3f9a' },
          { label: 'Successful referrals', value: '4' },
        ],
        badges: [
          { label: 'Referrer', tone: 'info' },
          { label: 'Birthday points due', tone: 'warning' },
        ],
        table: {
          columns: ['Date', 'Activity', 'Points', 'Status'],
          rows: [
            ['2026-06-28', 'Order #1042', '+210', 'Approved'],
            ['2026-06-14', 'Left a review', '+50', 'Approved'],
            ['2026-06-02', 'Redeemed $10 off', '-500', 'Used'],
            ['2026-05-20', 'Referral bonus', '+250', 'Pending'],
          ],
        },
        buttons: [{ label: 'Open member profile', url: '/app/loyalty/members/current' }],
        links: [{ label: 'Manage referral program', url: '/app/loyalty/referrals' }],
      },
    },
  },
  {
    id: 'ADMB-CUS-03',
    name: 'Reviews History (Yotpo-style)',
    description:
      'Lists the reviews a customer has written across products on the admin customer-details page — rating, product, verified/media state, and moderation status.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'reviews',
    tags: ['yotpo', 'reviews', 'ugc', 'customer', 'moderation', 'admin'],
    spec: {
      type: 'admin.block',
      name: 'Reviews History',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.block.render',
        label: 'Reviews History',
        description:
          'Reviews this customer has submitted. Content and moderation state come from the reviews app’s backend — open a review to reply or change its published state.',
        fields: [
          { label: 'Reviews written', value: '6' },
          { label: 'Average rating given', value: '4.3 ★' },
          { label: 'Verified buyer', value: 'Yes', tone: 'success' },
        ],
        badges: [
          { label: 'Verified buyer', tone: 'success' },
          { label: '1 pending', tone: 'warning' },
        ],
        table: {
          columns: ['Date', 'Product', 'Rating', 'Media', 'Status'],
          rows: [
            ['2026-06-30', 'Everyday Tote', '5★', 'Photo', 'Published'],
            ['2026-06-11', 'Linen Wrap Dress', '4★', '—', 'Published'],
            ['2026-05-27', 'Canvas Sneakers', '3★', 'Video', 'Pending'],
          ],
        },
        buttons: [{ label: 'Open reviews inbox', url: '/app/reviews/moderation' }],
        links: [{ label: 'Send a review request', url: '/app/reviews/requests/new' }],
      },
    },
  },
  {
    id: 'ADMB-CUS-04',
    name: 'Active Subscriptions (Recharge-style)',
    description:
      'Surfaces a customer’s active subscriptions on the admin customer-details page — product, cadence, next charge date, and status, with a jump to the subscription portal.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'subscriptions',
    tags: ['recharge', 'subscriptions', 'customer', 'recurring', 'next-charge', 'admin'],
    spec: {
      type: 'admin.block',
      name: 'Active Subscriptions',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.block.render',
        label: 'Subscriptions',
        description:
          'This customer’s recurring subscriptions. Schedules and statuses are held in the subscriptions app keyed to the Shopify customer — manage skips, swaps, and cadence in the portal.',
        fields: [
          { label: 'Active subscriptions', value: '2', tone: 'success' },
          { label: 'Next charge', value: '2026-07-12' },
          { label: 'Monthly recurring value', value: '$58.00' },
        ],
        badges: [
          { label: 'Active', tone: 'success' },
          { label: 'Prepaid', tone: 'info' },
        ],
        table: {
          columns: ['Product', 'Cadence', 'Next charge', 'Status'],
          rows: [
            ['Cold Brew — 32oz', 'Every 2 weeks', '2026-07-12', 'Active'],
            ['Ground Beans — 1lb', 'Every month', '2026-07-28', 'Active'],
          ],
        },
        buttons: [{ label: 'Open subscription portal', url: '/app/subscriptions/customer/current' }],
        links: [{ label: 'View upcoming charges', url: '/app/subscriptions/charges' }],
      },
    },
  },
  {
    id: 'ADMB-CUS-05',
    name: 'Retention Snapshot — Loyalty + Subscription (Growave-style)',
    description:
      'A combined retention card on the admin customer-details page — loyalty tier, wishlist activity, and subscription status in one at-a-glance block for repeat buyers.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['growave', 'loyalty', 'wishlist', 'subscriptions', 'customer', 'retention'],
    spec: {
      type: 'admin.block',
      name: 'Retention Snapshot',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.block.render',
        label: 'Retention Snapshot',
        description:
          'An at-a-glance retention view: loyalty standing, wishlist interest, and subscription status. Values are read from the retention app’s backend for this customer — open each area to act.',
        fields: [
          { label: 'Loyalty tier', value: 'Silver' },
          { label: 'Store credit', value: '$12.00', tone: 'success' },
          { label: 'Wishlist items', value: '9' },
          { label: 'On-sale wishlist alerts', value: '2 pending', tone: 'warning' },
          { label: 'Subscription status', value: 'Active', tone: 'success' },
        ],
        badges: [
          { label: 'Silver tier', tone: 'info' },
          { label: 'Subscriber', tone: 'success' },
          { label: 'At-risk: none', tone: 'success' },
        ],
        buttons: [
          { label: 'Open loyalty', url: '/app/growave/loyalty/member' },
          { label: 'View wishlist', url: '/app/growave/wishlist' },
        ],
        links: [{ label: 'Manage subscription', url: '/app/growave/subscriptions' }],
      },
    },
  },
];

export const templates = ADMIN_BLOCK_CUSTOMER_DETAILS_TEMPLATES;
