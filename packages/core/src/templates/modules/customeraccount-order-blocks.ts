import type { TemplateEntry } from '../types.js';

/**
 * Customer-account ORDER blocks (CAB-ORD-01 .. CAB-ORD-14).
 *
 * Config-driven `customerAccount.blocks` modules mounted on the new Shopify
 * Customer Accounts order surfaces — `customer-account.order-status.block.render`,
 * `customer-account.order-index.block.render`, and the `order.action` menu-item +
 * overlay pair. Grounded in the real behaviour of the retention corpus:
 *   - Reorder / buy-it-again landing (Rebuy: "Reorder / Reactivate landing pages
 *     seeded from prior order history"; recs on the account Orders page).
 *   - Live tracking (order.trackingNumber / order.trackingUrl / order.fulfillmentStatus
 *     bindings resolved by the shipped generic extension against the Order API).
 *   - Review-request prompts (Judge.me / Okendo / Growave "Write a review" button +
 *     Ask-Review block on the Order Status page, per purchased line item).
 *   - Subscription manage (Recharge / Loop "Manage Subscription" portal entry point,
 *     subscription.status + subscription.nextOrderDate bindings).
 *
 * HONESTY: bindings that read Order-API fields (tracking, fulfillment, return
 * status) resolve on the order-status/order surfaces. `subscription.*` and
 * `loyalty.points` bindings are DECLARATIONS that degrade to the block's literal
 * `content` until the app-proxy portal / points ledger ships — never a guaranteed
 * live value. FORM `submit.proxyPath` posts to the app proxy (returns / review
 * capture) — the block collects + displays honestly and writes only where the proxy
 * is wired. No POS, no invented targets/kinds/bindings.
 */
export const CUSTOMERACCOUNT_ORDER_BLOCKS_TEMPLATES: TemplateEntry[] = [
  // ── Reorder / buy-it-again (Rebuy-grounded) ────────────────────────────────
  {
    id: 'CAB-ORD-01',
    name: 'Buy It Again — Order Status Reorder',
    description:
      'One-tap reorder prompt on the order-status page that links back to a prefilled cart seeded from this order (Rebuy-style buy-it-again).',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'reorder',
    tags: ['rebuy', 'reorder', 'buy-it-again', 'order-status', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Buy It Again — Order Status Reorder',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Order it again',
        blocks: [
          { kind: 'TEXT', content: 'Loved what you got? Add the same items back to your cart in one tap.' },
          {
            kind: 'BUTTON',
            content: 'Reorder these items',
            url: 'https://example.com/cart',
            variant: 'primary',
          },
          { kind: 'DIVIDER' },
          { kind: 'LINK', content: 'Browse what pairs well', url: 'https://example.com/collections/bestsellers' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-02',
    name: 'Reorder Card — Orders List',
    description:
      'Compact reorder call-to-action on the customer accounts Orders index so returning buyers can restock past purchases without hunting through order history.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'refresh',
    tags: ['rebuy', 'reorder', 'order-index', 'retention', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Reorder Card — Orders List',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-index.block.render',
        title: 'Restock your favorites',
        blocks: [
          { kind: 'BADGE', content: 'Fast reorder', tone: 'info' },
          { kind: 'TEXT', content: 'Your most-ordered items, one click from your cart.' },
          { kind: 'BUTTON', content: 'Reorder now', url: 'https://example.com/account/reorder', variant: 'primary' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── Tracking (order.trackingNumber / order.trackingUrl bindings) ───────────
  {
    id: 'CAB-ORD-03',
    name: 'Where Is My Order — Live Tracking',
    description:
      'Order-status tracking panel that surfaces the live tracking number and a "Track package" link bound to the Order API fulfillment tracking fields.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'truck',
    tags: ['tracking', 'fulfillment', 'order-status', 'wismo', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Where Is My Order — Live Tracking',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Track your package',
        blocks: [
          { kind: 'TEXT', content: 'Tracking number', bind: 'order.trackingNumber' },
          { kind: 'BADGE', content: 'In transit', bind: 'order.fulfillmentStatus', tone: 'info' },
          { kind: 'LINK', content: 'Track package', bind: 'order.trackingUrl' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-04',
    name: 'Fulfillment Status Banner',
    description:
      'Order-status announcement block that reflects the current fulfillment state with a status page deep-link, degrading to static copy when unresolved.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'package',
    tags: ['tracking', 'fulfillment', 'order-status', 'status', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Fulfillment Status Banner',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Delivery update',
        blocks: [
          { kind: 'BADGE', content: 'Preparing your order', bind: 'order.fulfillmentStatus', tone: 'info' },
          { kind: 'TEXT', content: 'We will email you the moment your package ships.' },
          { kind: 'LINK', content: 'View full status page', bind: 'order.statusPageUrl' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-05',
    name: 'Shipment Details — Fulfillment Card',
    description:
      'Tracking card mounted after the fulfillment details region on the order-status page, pairing the carrier tracking number with a track-shipment button.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'map-pin',
    tags: ['tracking', 'shipment', 'fulfillment-details', 'order-status', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Shipment Details — Fulfillment Card',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.fulfillment-details.render-after',
        title: 'Your shipment',
        blocks: [
          { kind: 'TEXT', content: 'Carrier tracking', bind: 'order.trackingNumber' },
          { kind: 'BUTTON', content: 'Track shipment', bind: 'order.trackingUrl', variant: 'secondary' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── Review-request (Judge.me / Okendo / Growave-grounded) ──────────────────
  {
    id: 'CAB-ORD-06',
    name: 'Write a Review — Order Status Prompt',
    description:
      'Ask-review prompt on the order-status page inviting buyers to review their purchase, matching the Judge.me / Growave post-purchase review CTA.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'star',
    tags: ['judge-me', 'reviews', 'review-request', 'order-status', 'ugc'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Write a Review — Order Status Prompt',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'How did we do?',
        blocks: [
          { kind: 'TEXT', content: 'Share a quick review and help other shoppers — it takes under a minute.' },
          { kind: 'BUTTON', content: 'Write a review', url: 'https://example.com/account/reviews/new', variant: 'primary' },
          { kind: 'LINK', content: 'View my reviews', url: 'https://example.com/account/reviews' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-07',
    name: 'Photo Review Request — Reward Nudge',
    description:
      'Order-status review-request block that offers a reward for a photo review, mirroring Okendo/Growave bonus-points-for-media review capture.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'camera',
    tags: ['okendo', 'reviews', 'review-request', 'photo-review', 'order-status'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Photo Review Request — Reward Nudge',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Add a photo, earn a reward',
        blocks: [
          { kind: 'BADGE', content: 'Bonus reward', tone: 'success' },
          { kind: 'TEXT', content: 'Post a photo review of your order and earn a thank-you reward on your next purchase.' },
          { kind: 'BUTTON', content: 'Add photo review', url: 'https://example.com/account/reviews/new?media=1', variant: 'primary' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-08',
    name: 'Review Request — Inline Feedback Form',
    description:
      'Order-status block that captures a star rating and short comment inline and posts to the app proxy, for merchants collecting first-party review feedback.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'message-square',
    tags: ['reviews', 'review-request', 'feedback', 'form', 'order-status'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Review Request — Inline Feedback Form',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Rate your order',
        blocks: [
          { kind: 'TEXT', content: 'Tell us how your order went. Your feedback shapes what we stock next.' },
          {
            kind: 'FORM',
            content: 'Order feedback',
            fields: [
              {
                kind: 'select',
                key: 'rating',
                label: 'Overall rating',
                required: true,
                options: [
                  { value: '5', label: '5 — Excellent' },
                  { value: '4', label: '4 — Good' },
                  { value: '3', label: '3 — Okay' },
                  { value: '2', label: '2 — Poor' },
                  { value: '1', label: '1 — Bad' },
                ],
              },
              { kind: 'textarea', key: 'comment', label: 'What stood out?', placeholder: 'A sentence or two helps a lot' },
            ],
            submit: { proxyPath: '/apps/superapp/ca/review-feedback', submitLabel: 'Submit review' },
          },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-09',
    name: 'Ask for a Review — Order Action',
    description:
      'Order-scoped action in the order menu that opens a modal inviting the buyer to review each purchased item, matching the Judge.me "Manage" review dropdown.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'edit',
    tags: ['judge-me', 'reviews', 'review-request', 'order-action', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Ask for a Review — Order Action',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order.action.menu-item.render',
        title: 'Write a review',
        blocks: [
          {
            kind: 'ACTION',
            content: 'Review the items from this order and help other shoppers decide.',
            action: 'modal',
            modalId: 'review-order-modal',
          },
          {
            kind: 'MODAL',
            id: 'review-order-modal',
            content: 'Pick an item to review — it only takes a minute.',
          },
          { kind: 'BUTTON', content: 'Start review', url: 'https://example.com/account/reviews/new', variant: 'primary' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── Subscription manage (Recharge / Loop-grounded) ─────────────────────────
  {
    id: 'CAB-ORD-10',
    name: 'Manage Subscription — Order Status Entry',
    description:
      'Order-status entry point into the subscription portal showing the next order date and status, matching the Recharge/Loop "Manage Subscription" link.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'repeat',
    tags: ['recharge', 'subscriptions', 'subscription-manage', 'order-status', 'portal'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Manage Subscription — Order Status Entry',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Your subscription',
        blocks: [
          { kind: 'BADGE', content: 'Active', bind: 'subscription.status', tone: 'success' },
          { kind: 'TEXT', content: 'Next delivery', bind: 'subscription.nextOrderDate' },
          { kind: 'BUTTON', content: 'Manage subscription', url: 'https://example.com/apps/superapp/portal', variant: 'primary' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-11',
    name: 'Skip or Swap — Subscription Quick Actions',
    description:
      'Order-status subscription card with skip / swap / reschedule shortcuts into the customer portal, mirroring Recharge no-code portal quick actions.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'calendar',
    tags: ['recharge', 'subscriptions', 'subscription-manage', 'skip-swap', 'order-status'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Skip or Swap — Subscription Quick Actions',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Adjust your next order',
        blocks: [
          { kind: 'TEXT', content: 'Next charge', bind: 'subscription.nextOrderDate' },
          { kind: 'BUTTON', content: 'Skip next delivery', url: 'https://example.com/apps/superapp/portal/skip', variant: 'secondary' },
          { kind: 'BUTTON', content: 'Swap products', url: 'https://example.com/apps/superapp/portal/swap', variant: 'secondary' },
          { kind: 'LINK', content: 'Reschedule or pause', url: 'https://example.com/apps/superapp/portal' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-12',
    name: 'Manage Subscription — Orders List Entry',
    description:
      'Subscription management entry on the customer accounts Orders index so subscribers reach skip/pause/cancel from their order history, per Loop/Recharge.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'list',
    tags: ['loop-subscriptions', 'subscriptions', 'subscription-manage', 'order-index', 'portal'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Manage Subscription — Orders List Entry',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-index.block.render',
        title: 'Subscriptions',
        blocks: [
          { kind: 'BADGE', content: 'Subscriber', bind: 'subscription.status', tone: 'success' },
          { kind: 'TEXT', content: 'Manage frequency, skip a delivery, or update your next order.' },
          { kind: 'BUTTON', content: 'Manage subscriptions', url: 'https://example.com/apps/superapp/portal', variant: 'primary' },
        ],
        b2bOnly: false,
      },
    },
  },
  {
    id: 'CAB-ORD-13',
    name: 'Cancellation Retention — Save Offer',
    description:
      'Order-status subscription block that presents a save offer before cancel and links into the retention flow, modeling Recharge cancellation-prevention.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'shield',
    tags: ['recharge', 'subscriptions', 'retention', 'cancellation', 'order-status'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Cancellation Retention — Save Offer',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Before you cancel',
        blocks: [
          { kind: 'BADGE', content: 'Members-only offer', tone: 'warning' },
          { kind: 'TEXT', content: 'Pause instead of cancel, or take 20% off your next delivery to stay.' },
          { kind: 'BUTTON', content: 'Pause my subscription', url: 'https://example.com/apps/superapp/portal/pause', variant: 'primary' },
          { kind: 'BUTTON', content: 'Apply 20% and keep it', url: 'https://example.com/apps/superapp/portal/save-offer', variant: 'secondary' },
          { kind: 'DIVIDER' },
          { kind: 'LINK', content: 'Continue to cancel', url: 'https://example.com/apps/superapp/portal/cancel' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── Returns (Order API return status) ──────────────────────────────────────
  {
    id: 'CAB-ORD-14',
    name: 'Start a Return — Order Action',
    description:
      'Order-scoped return request: an order-menu action opening a return-reason form that posts to the app proxy, with the current return status surfaced.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'corner-up-left',
    tags: ['returns', 'return-request', 'order-action', 'order-status', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Start a Return — Order Action',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order.action.menu-item.render',
        title: 'Start a return',
        blocks: [
          { kind: 'TEXT', content: 'Return status', bind: 'order.returnStatus' },
          {
            kind: 'FORM',
            content: 'Request a return',
            fields: [
              {
                kind: 'select',
                key: 'reason',
                label: 'Reason for return',
                required: true,
                options: [
                  { value: 'size', label: 'Wrong size or fit' },
                  { value: 'damaged', label: 'Arrived damaged' },
                  { value: 'not-as-described', label: 'Not as described' },
                  { value: 'changed-mind', label: 'Changed my mind' },
                ],
              },
              { kind: 'textarea', key: 'notes', label: 'Anything else?', placeholder: 'Optional details for our team' },
            ],
            submit: { proxyPath: '/apps/superapp/ca/return-request', submitLabel: 'Submit return request' },
          },
        ],
        b2bOnly: false,
      },
    },
  },
];
