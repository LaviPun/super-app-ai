import type { TemplateEntry } from '../types.js';

/**
 * admin.action templates — product / variant / customer / product-index /
 * customer-index / customer-segment surfaces + bulk-selection actions.
 *
 * Each entry is an `admin.action` RecipeSpec: a "More actions" menu entry that
 * opens a modal rendered by the shipped generic admin UI extension
 * (extensions/admin-ui) from PUBLISHED config — description + label/value
 * `fields`, `badges`, a `table`, `buttons` (a `url` makes a button a link-button;
 * otherwise it is display-only), and deep-link `links`. Grounded in the 028 corpus:
 * loyalty (Smile / LoyaltyLion / Bon / Growave), email/SMS (Klaviyo / Omnisend),
 * reviews (Loox / Judge.me / Yotpo), recommendations (Bold Brain), bundles
 * (Fast Bundle / Bundler), and shipping (Intuitive Shipping).
 *
 * HONESTY: the modal renders the declarative payload the app persists. Any value
 * that would come from a live loyalty ledger / ESP / review store is shown as a
 * seeded example row or as a deep-link that opens the app page where the live data
 * resolves — NOT presented as a guaranteed-live admin read. Buttons without a `url`
 * are inert by design (display-only), matching AdminContentShape semantics.
 */
export const ADMIN_ACTION_PRODUCT_CUSTOMER_TEMPLATES: TemplateEntry[] = [
  // ── Customer-details actions (loyalty / email / reviews) ──────────────────
  {
    id: 'ADMA-PRC-01',
    name: 'Smile — Loyalty Snapshot',
    description: 'Customer-details action that opens a Smile.io loyalty snapshot modal — points balance, VIP tier, and a link into the member profile.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['smile', 'loyalty', 'customer', 'points', 'vip', 'rewards'],
    spec: {
      type: 'admin.action',
      name: 'Smile — Loyalty Snapshot',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Loyalty snapshot',
        title: 'Loyalty snapshot',
        description: 'Points, VIP tier, and referral status for this member. Open the Loyalty Hub for the live ledger and manual point adjustments.',
        fields: [
          { label: 'Points balance', value: '1,240 stars', tone: 'success' },
          { label: 'VIP tier', value: 'Gold', tone: 'info' },
          { label: 'Referrals completed', value: '3' },
          { label: 'Points expiry', value: 'None (active member)' },
        ],
        badges: [
          { label: 'VIP · Gold', tone: 'success' },
          { label: 'Enrolled', tone: 'info' },
        ],
        links: [{ label: 'Open member in Loyalty Hub', url: '/app/loyalty/members' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-02',
    name: 'Smile — Adjust Points',
    description: 'Customer-details action to review a member before a manual points adjustment — surfaces balance and a deep link to the adjust-points screen.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['smile', 'loyalty', 'customer', 'points', 'adjust'],
    spec: {
      type: 'admin.action',
      name: 'Smile — Adjust Points',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Adjust loyalty points',
        title: 'Adjust loyalty points',
        description: 'Issue or deduct points for this customer (goodwill, correction, or a bonus event). The adjustment is applied in the app where the ledger lives.',
        fields: [
          { label: 'Current balance', value: '1,240 stars' },
          { label: 'Earned this year', value: '3,180 stars' },
          { label: 'Last activity', value: 'Order #1042 · 6 days ago' },
        ],
        links: [{ label: 'Adjust points for this member', url: '/app/loyalty/members/adjust' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-03',
    name: 'LoyaltyLion — Member Activity',
    description: 'Customer-details action opening a LoyaltyLion activity modal — recent earning/redeeming events as a table plus tier progress.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['loyaltylion', 'loyalty', 'customer', 'activity', 'tier'],
    spec: {
      type: 'admin.action',
      name: 'LoyaltyLion — Member Activity',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Loyalty activity',
        title: 'Loyalty activity',
        description: 'Recent points activity and tier progress for this member. Full history opens in LoyaltyLion.',
        table: {
          columns: ['Date', 'Activity', 'Points'],
          rows: [
            ['Jul 1', 'Order placed', '+180'],
            ['Jun 24', 'Product review', '+50'],
            ['Jun 12', 'Reward redeemed', '-500'],
            ['Jun 2', 'Birthday bonus', '+100'],
          ],
        },
        fields: [
          { label: 'Tier', value: 'Insider', tone: 'info' },
          { label: 'To next tier', value: '260 points' },
        ],
        links: [{ label: 'Open in LoyaltyLion', url: '/app/loyaltylion/customers' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-04',
    name: 'Bon Loyalty — VIP Tier',
    description: 'Customer-details action showing a Bon Loyalty VIP-tier card — current tier, perks, and spend to the next milestone.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['bon-loyalty', 'loyalty', 'customer', 'vip', 'tier'],
    spec: {
      type: 'admin.action',
      name: 'Bon Loyalty — VIP Tier',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'VIP tier details',
        title: 'VIP tier details',
        description: 'This customer’s Bon Loyalty VIP tier, active perks, and progress to the next milestone.',
        fields: [
          { label: 'Current tier', value: 'Silver', tone: 'info' },
          { label: 'Points multiplier', value: '1.5×' },
          { label: 'Spend to Gold', value: '$120 remaining' },
        ],
        badges: [
          { label: 'Free shipping perk', tone: 'success' },
          { label: 'Early access', tone: 'info' },
        ],
        links: [{ label: 'Manage tiers in Bon', url: '/app/bon-loyalty/tiers' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-05',
    name: 'Growave — Rewards & Wishlist',
    description: 'Customer-details action opening a Growave modal that combines loyalty points and saved-wishlist items for the customer.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['growave', 'loyalty', 'wishlist', 'customer', 'rewards'],
    spec: {
      type: 'admin.action',
      name: 'Growave — Rewards & Wishlist',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Rewards & wishlist',
        title: 'Rewards & wishlist',
        description: 'Growave loyalty balance plus this customer’s wishlist. Use it to spot high-intent shoppers for a targeted offer.',
        fields: [
          { label: 'Reward points', value: '640' },
          { label: 'Wishlist items', value: '7' },
          { label: 'Reviews written', value: '2' },
        ],
        badges: [{ label: 'Wishlist active', tone: 'info' }],
        links: [{ label: 'Open customer in Growave', url: '/app/growave/customers' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-06',
    name: 'Klaviyo — Profile & Consent',
    description: 'Customer-details action showing the Klaviyo profile — email/SMS consent state and segment membership, with a link to the profile.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['klaviyo', 'email', 'sms', 'customer', 'consent', 'segments'],
    spec: {
      type: 'admin.action',
      name: 'Klaviyo — Profile & Consent',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Klaviyo profile',
        title: 'Klaviyo profile',
        description: 'Marketing consent and segment membership for this customer as synced to Klaviyo. Manage the profile in Klaviyo.',
        fields: [
          { label: 'Email consent', value: 'Subscribed', tone: 'success' },
          { label: 'SMS consent', value: 'Not subscribed', tone: 'warning' },
          { label: 'Lifetime value', value: '$418' },
        ],
        badges: [
          { label: 'VIP segment', tone: 'info' },
          { label: 'Engaged 30d', tone: 'success' },
        ],
        links: [{ label: 'Open profile in Klaviyo', url: '/app/klaviyo/profiles' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-07',
    name: 'Omnisend — Contact Sync',
    description: 'Customer-details action opening an Omnisend contact card — channel subscriptions and recent campaign engagement.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['omnisend', 'email', 'sms', 'customer', 'contact'],
    spec: {
      type: 'admin.action',
      name: 'Omnisend — Contact Sync',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Omnisend contact',
        title: 'Omnisend contact',
        description: 'Channel subscriptions and recent campaign engagement for this contact in Omnisend.',
        fields: [
          { label: 'Email', value: 'Subscribed', tone: 'success' },
          { label: 'SMS', value: 'Subscribed', tone: 'success' },
          { label: 'Last opened', value: 'Summer Sale · 2 days ago' },
        ],
        links: [{ label: 'Open contact in Omnisend', url: '/app/omnisend/contacts' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-08',
    name: 'Judge.me — Reviewer History',
    description: 'Customer-details action showing this customer’s Judge.me review history — count, average rating, and a link to moderate.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['judge-me', 'reviews', 'customer', 'ugc', 'moderation'],
    spec: {
      type: 'admin.action',
      name: 'Judge.me — Reviewer History',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Review history',
        title: 'Review history',
        description: 'Reviews this customer has submitted via Judge.me. Open Judge.me to reply, feature, or moderate.',
        fields: [
          { label: 'Reviews submitted', value: '5' },
          { label: 'Average rating given', value: '4.6 ★' },
          { label: 'Verified buyer', value: 'Yes', tone: 'success' },
        ],
        links: [{ label: 'Moderate in Judge.me', url: '/app/judgeme/reviews' }],
      },
    },
  },

  // ── Customer-index bulk-selection actions ─────────────────────────────────
  {
    id: 'ADMA-PRC-09',
    name: 'Klaviyo — Add to Segment (Bulk)',
    description: 'Customer-index selection action to add the selected customers to a Klaviyo segment — bulk enrichment from the customer list.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['klaviyo', 'email', 'customer-index', 'segments', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Klaviyo — Add to Segment (Bulk)',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.render',
        label: 'Add to Klaviyo segment',
        title: 'Add to Klaviyo segment',
        description: 'Queue the selected customers to sync into a Klaviyo segment for a targeted flow or campaign.',
        fields: [{ label: 'Action', value: 'Add selected customers to a Klaviyo list/segment' }],
        links: [{ label: 'Choose segment in Klaviyo', url: '/app/klaviyo/segments' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-10',
    name: 'Smile — Bulk Points Bonus',
    description: 'Customer-index selection action to grant a Smile.io bonus-point event to the selected customers.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['smile', 'loyalty', 'customer-index', 'points', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Smile — Bulk Points Bonus',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.render',
        label: 'Grant bonus points',
        title: 'Grant bonus points',
        description: 'Award a one-time bonus to the selected members (win-back, apology, or a VIP thank-you). Applied in Smile where the ledger lives.',
        fields: [
          { label: 'Suggested bonus', value: '250 stars' },
          { label: 'Selected members', value: 'Uses the current selection' },
        ],
        links: [{ label: 'Set up bonus in Smile', url: '/app/loyalty/bonus-events' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-11',
    name: 'Omnisend — Bulk Consent Review',
    description: 'Customer-index selection action to review marketing-consent state for the selected customers before an Omnisend send.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['omnisend', 'email', 'customer-index', 'consent', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Omnisend — Bulk Consent Review',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.render',
        label: 'Review consent',
        title: 'Review consent',
        description: 'Check email/SMS consent across the selected customers so a campaign only sends to subscribed contacts.',
        fields: [
          { label: 'Reminder', value: 'Only subscribed contacts receive marketing' },
        ],
        badges: [{ label: 'Consent-safe', tone: 'success' }],
        links: [{ label: 'Open Omnisend audiences', url: '/app/omnisend/audiences' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-12',
    name: 'Customer-index — Export Selection',
    description: 'Customer-index selection action to hand the selected customers to a CSV export or an outbound audience sync (Bold Brain-style Audiences).',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['audiences', 'customer-index', 'export', 'segments', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Customer-index — Export Selection',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.render',
        label: 'Export as audience',
        title: 'Export as audience',
        description: 'Send the selected customers to a CSV export or an outbound audience sync for downstream email/ads targeting.',
        fields: [{ label: 'Destinations', value: 'CSV · Mailchimp · Klaviyo' }],
        links: [{ label: 'Open audience builder', url: '/app/audiences' }],
      },
    },
  },

  // ── Customer-segment-details action ───────────────────────────────────────
  {
    id: 'ADMA-PRC-13',
    name: 'Segment — Activate Campaign',
    description: 'Customer-segment-details action that turns the open segment into a campaign audience — a bridge into the email/SMS builder.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['klaviyo', 'segment', 'email', 'campaign', 'audience'],
    spec: {
      type: 'admin.action',
      name: 'Segment — Activate Campaign',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-segment-details.action.render',
        label: 'Activate as campaign',
        title: 'Activate as campaign',
        description: 'Use this saved segment as the audience for a new email or SMS campaign, or as a flow entry filter.',
        fields: [
          { label: 'Segment', value: 'The currently open customer segment' },
          { label: 'Channels', value: 'Email · SMS' },
        ],
        links: [{ label: 'Open campaign builder', url: '/app/campaigns/new' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-14',
    name: 'Segment — VIP Perk Enrollment',
    description: 'Customer-segment-details action to enroll everyone in the open segment into a loyalty VIP perk or bonus event.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['loyalty', 'segment', 'vip', 'smile', 'enrollment'],
    spec: {
      type: 'admin.action',
      name: 'Segment — VIP Perk Enrollment',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-segment-details.action.render',
        label: 'Enroll in VIP perk',
        title: 'Enroll in VIP perk',
        description: 'Grant the members of this segment a VIP perk or a bonus-point event in the loyalty app.',
        fields: [
          { label: 'Perk', value: 'Bonus points or early access' },
          { label: 'Applies to', value: 'All members of the open segment' },
        ],
        links: [{ label: 'Configure perk in loyalty app', url: '/app/loyalty/perks' }],
      },
    },
  },

  // ── Product-details actions ───────────────────────────────────────────────
  {
    id: 'ADMA-PRC-15',
    name: 'Loox — Product Reviews',
    description: 'Product-details action opening a Loox review summary for the product — rating, count, and pending photo reviews to moderate.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['loox', 'reviews', 'product', 'ugc', 'moderation'],
    spec: {
      type: 'admin.action',
      name: 'Loox — Product Reviews',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.action.render',
        label: 'Product reviews',
        title: 'Product reviews',
        description: 'Loox review summary for this product. Open Loox to approve photo reviews, reply, or request more.',
        fields: [
          { label: 'Average rating', value: '4.7 ★' },
          { label: 'Total reviews', value: '212' },
          { label: 'Pending moderation', value: '4', tone: 'warning' },
        ],
        badges: [{ label: 'Photo reviews on', tone: 'info' }],
        links: [{ label: 'Moderate in Loox', url: '/app/loox/reviews' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-16',
    name: 'Bold Brain — Recommendation Insights',
    description: 'Product-details action showing Bold Brain frequently-bought-together pairs for the product as a table, linking to the widget manager.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['bold-brain', 'recommendations', 'product', 'cross-sell', 'insights'],
    spec: {
      type: 'admin.action',
      name: 'Bold Brain — Recommendation Insights',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.action.render',
        label: 'Recommendation insights',
        title: 'Recommendation insights',
        description: 'Products most frequently bought with this one, derived from order history. Use it to build an upsell or bundle.',
        table: {
          columns: ['Paired product', 'Co-purchase strength'],
          rows: [
            ['Care Kit', 'High'],
            ['Refill Pack', 'Medium'],
            ['Gift Wrap', 'Low'],
          ],
        },
        links: [{ label: 'Open widget manager', url: '/app/bold-brain/widgets' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-17',
    name: 'Fast Bundle — Add to Bundle',
    description: 'Product-details action to include the product in a Fast Bundle offer — surfaces existing bundles and a link to the bundle builder.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['fast-bundle', 'bundles', 'product', 'cross-sell', 'offers'],
    spec: {
      type: 'admin.action',
      name: 'Fast Bundle — Add to Bundle',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.action.render',
        label: 'Add to a bundle',
        title: 'Add to a bundle',
        description: 'Include this product in a Fast Bundle offer, or spin up a new fixed / mix-and-match bundle around it.',
        fields: [
          { label: 'In bundles', value: '2 active offers' },
          { label: 'Suggested type', value: 'Frequently bought together' },
        ],
        buttons: [{ label: 'New bundle from this product', url: '/app/fast-bundle/new' }],
        links: [{ label: 'Open Fast Bundle', url: '/app/fast-bundle' }],
      },
    },
  },
  {
    id: 'ADMA-PRC-18',
    name: 'Intuitive Shipping — Product Rules',
    description: 'Product-details action showing which Intuitive Shipping rules reference this product (shipping groups, restrictions) and a link to edit them.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['intuitive-shipping', 'shipping', 'product', 'rules', 'fulfillment'],
    spec: {
      type: 'admin.action',
      name: 'Intuitive Shipping — Product Rules',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.action.render',
        label: 'Shipping rules',
        title: 'Shipping rules',
        description: 'Intuitive Shipping rules and shipping groups that reference this product. Edit them to change how it rates or ships.',
        fields: [
          { label: 'Shipping group', value: 'Oversized' },
          { label: 'Restrictions', value: 'No PO boxes', tone: 'warning' },
        ],
        badges: [{ label: 'Rated by weight', tone: 'info' }],
        links: [{ label: 'Edit in Intuitive Shipping', url: '/app/intuitive-shipping/rules' }],
      },
    },
  },

  // ── Product-variant-details action ────────────────────────────────────────
  {
    id: 'ADMA-PRC-19',
    name: 'Variant — Bundle Component',
    description: 'Product-variant-details action showing how this specific variant participates in bundles (as a component SKU) with a link to the builder.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['bundler', 'bundles', 'variant', 'sku', 'component'],
    spec: {
      type: 'admin.action',
      name: 'Variant — Bundle Component',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-variant-details.action.render',
        label: 'Bundle component',
        title: 'Bundle component',
        description: 'How this variant is used as a component in bundle offers, and its pairing options.',
        fields: [
          { label: 'Used in bundles', value: '1 active bundle' },
          { label: 'Role', value: 'Component SKU' },
          { label: 'Bundle SKU', value: 'KIT-STARTER' },
        ],
        links: [{ label: 'Open bundle builder', url: '/app/bundler/builder' }],
      },
    },
  },

  // ── Product-index bulk-selection action ───────────────────────────────────
  {
    id: 'ADMA-PRC-20',
    name: 'Products — Bulk Enable Reviews Widget',
    description: 'Product-index selection action to enable a review-request or reviews widget across the selected products in one pass.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['reviews', 'product-index', 'yotpo', 'widget', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Products — Bulk Enable Reviews Widget',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-index.selection-action.render',
        label: 'Enable reviews widget',
        title: 'Enable reviews widget',
        description: 'Turn on the product-page reviews widget and review-request emails for every selected product at once.',
        fields: [
          { label: 'Applies to', value: 'The current product selection' },
          { label: 'Enables', value: 'Reviews widget + review-request email' },
        ],
        badges: [{ label: 'Bulk action', tone: 'info' }],
        links: [{ label: 'Configure reviews app', url: '/app/reviews/settings' }],
      },
    },
  },
];
