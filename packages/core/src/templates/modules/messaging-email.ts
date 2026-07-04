/**
 * messaging.campaign templates — the email channel (SUP·EMAIL block).
 *
 * Grounded in the corpus email/SMS platforms (klaviyo.md, omnisend.md) and the
 * capture→persist→fan-out spine of the back-in-stock / wishlist apps
 * (appikon-notify-me.md, swym-wishlist-plus.md) plus review-request flows
 * (judge-me.md, yotpo-reviews.md). Every spec is `messaging.campaign` whose
 * config IS the MessagingPackSchema (flat-pin). Primary channel is `email` on all
 * eleven, so each carries an `email` template WITH a subject (the pack refines
 * email templates to require one).
 *
 * Honesty posture (specs/031 messaging-surface.md + allowed-values.ts):
 *  - `email` is a SHIPPED delivery channel (EmailConnector via SEND_EMAIL_NOTIFICATION).
 *  - `trigger.event` values are real FLOW_AUTOMATION_TRIGGERS (live webhooks /
 *    superapp events); `back_in_stock` resolves to SHOPIFY_WEBHOOK_PRODUCT_UPDATED
 *    with no fabricated event; drip presets resolve to their real entry triggers
 *    (MESSAGING_DRIP_PRESET_ENTRY) — no invented signals.
 *  - `data_store` audiences name the subscriber-list store the capture surface
 *    writes; `respectConsent` + a per-record `consentField` gate every send.
 */
import type { TemplateEntry } from '../types.js';

export const MESSAGING_EMAIL_TEMPLATES: TemplateEntry[] = [
  // ── Abandoned cart ──────────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-01',
    name: 'Abandoned Cart — Single Recovery Email',
    description:
      'One-shot cart-recovery email fired on checkout-start, nudging the shopper back to the items they left behind.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['klaviyo', 'email', 'abandoned-cart', 'recovery', 'automation', 'conversion'],
    spec: {
      type: 'messaging.campaign',
      name: 'Abandoned Cart — Single Recovery Email',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: { kind: 'event', event: 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED' },
        audience: {
          recipients: [],
          source: 'event_recipient',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'You left something behind 🛒',
            body:
              '<p>Hi {{customer.first_name}},</p><p>Your cart is still saved. Complete your order before it sells out.</p><p><a href="{{cart.recovery_url}}">Return to your cart →</a></p>',
            url: 'https://example.com/cart',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Abandoned cart — 3-step drip ──────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-02',
    name: 'Abandoned Cart — 3-Email Drip',
    description:
      'Three-touch cart-recovery drip: an immediate reminder, a 1-hour nudge, and a 24-hour last-call, timed on the durable scheduler.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['klaviyo', 'email', 'abandoned-cart', 'drip', 'sequence', 'recovery'],
    spec: {
      type: 'messaging.campaign',
      name: 'Abandoned Cart — 3-Email Drip',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'browse_abandon',
          steps: [
            { delayMs: 60000, label: 'Immediate reminder' },
            { delayMs: 3_600_000, channel: 'email', label: '1-hour nudge' },
            { delayMs: 86_400_000, channel: 'email', label: '24-hour last call' },
          ],
        },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'cart_abandoners',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Still thinking it over?',
            body:
              '<p>Hi {{record.first_name}},</p><p>The items in your cart are waiting. Here is a quick link back.</p><p><a href="{{record.cart_url}}">Finish checking out →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Welcome ───────────────────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-03',
    name: 'Welcome — New Subscriber Greeting',
    description:
      'Single welcome email sent when a new subscriber record lands from a signup form, thanking them and setting expectations.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['omnisend', 'email', 'welcome', 'signup', 'onboarding', 'automation'],
    spec: {
      type: 'messaging.campaign',
      name: 'Welcome — New Subscriber Greeting',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: { kind: 'event', event: 'SUPERAPP_DATA_RECORD_CREATED' },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'newsletter_subscribers',
          addressField: 'email',
          consentField: 'email_consent',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Welcome to the family 👋',
            body:
              '<p>Hi {{record.first_name}},</p><p>Thanks for subscribing. You will be first to hear about new drops and members-only offers.</p><p><a href="{{shop.url}}">Start shopping →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Welcome — 3-email onboarding drip ────────────────────────────────────────
  {
    id: 'MSG-EMAIL-04',
    name: 'Welcome — 3-Email Onboarding Series',
    description:
      'Post-signup onboarding drip: an instant welcome, a 2-day brand-story email, and a 5-day first-order incentive.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['omnisend', 'email', 'welcome', 'onboarding', 'drip', 'sequence'],
    spec: {
      type: 'messaging.campaign',
      name: 'Welcome — 3-Email Onboarding Series',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'post_purchase',
          steps: [
            { delayMs: 60000, label: 'Instant welcome' },
            { delayMs: 172_800_000, channel: 'email', label: 'Day 2 — brand story' },
            { delayMs: 259_200_000, channel: 'email', label: 'Day 5 — first-order offer' },
          ],
        },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'newsletter_subscribers',
          addressField: 'email',
          consentField: 'email_consent',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Welcome — here is what to expect',
            body:
              '<p>Hi {{record.first_name}},</p><p>Over the next few days we will introduce you to what we do best.</p><p><a href="{{shop.url}}">Explore the store →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Back-in-stock ────────────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-05',
    name: 'Back in Stock — Restock Alert',
    description:
      'Notify-me restock alert emailed to the product waitlist when a subscribed variant returns to stock.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['appikon', 'email', 'back-in-stock', 'restock', 'waitlist', 'notify-me'],
    spec: {
      type: 'messaging.campaign',
      name: 'Back in Stock — Restock Alert',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: { kind: 'back_in_stock' },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'back_in_stock_subscribers',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: '{{record.product_title}} is back in stock!',
            body:
              '<p>Good news, {{record.first_name}} — <strong>{{record.product_title}}</strong> is available again.</p><p>It may sell out fast, so grab yours now.</p><p><a href="{{record.product_url}}">Shop it now →</a></p>',
            url: 'https://example.com/products',
          },
        ],
        batchSize: 200,
        respectConsent: true,
      },
    },
  },

  // ── Price-drop waitlist ──────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-06',
    name: 'Price Drop — Wishlist Alert',
    description:
      'Emails wishlist subscribers when a saved product drops in price, driving high-intent shoppers back to buy.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['swym', 'email', 'price-drop', 'wishlist', 'alert', 'conversion'],
    spec: {
      type: 'messaging.campaign',
      name: 'Price Drop — Wishlist Alert',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'price_drop',
          steps: [{ delayMs: 60000, label: 'Price-drop alert' }],
        },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'wishlist_watchers',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Price drop on your wishlist 🎉',
            body:
              '<p>Hi {{record.first_name}},</p><p><strong>{{record.product_title}}</strong> from your wishlist is now {{record.new_price}}.</p><p><a href="{{record.product_url}}">See the new price →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Review request ───────────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-07',
    name: 'Review Request — Post-Delivery Ask',
    description:
      'Requests a product review a few days after fulfillment, timed with the durable scheduler off the order-created trigger.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['judge-me', 'email', 'review-request', 'reviews', 'ugc', 'post-purchase'],
    spec: {
      type: 'messaging.campaign',
      name: 'Review Request — Post-Delivery Ask',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'post_purchase',
          steps: [
            { delayMs: 60000, label: 'Order received' },
            { delayMs: 604_800_000, channel: 'email', label: 'Day 7 — review ask' },
          ],
        },
        audience: {
          recipients: [],
          source: 'event_recipient',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'How did we do? Leave a review',
            body:
              '<p>Hi {{customer.first_name}},</p><p>We hope you are loving your recent order. Would you share a quick review to help other shoppers?</p><p><a href="{{review.form_url}}">Write a review →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Review request — photo review incentive ─────────────────────────────────
  {
    id: 'MSG-EMAIL-08',
    name: 'Review Request — Photo Review Incentive',
    description:
      'Follow-up review ask that offers a next-order discount for a photo review, seeded from a data-store of recent buyers.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['yotpo', 'email', 'review-request', 'reviews', 'photo-review', 'incentive'],
    spec: {
      type: 'messaging.campaign',
      name: 'Review Request — Photo Review Incentive',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: { kind: 'event', event: 'SUPERAPP_DATA_RECORD_CREATED' },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'recent_buyers',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Share a photo, get 15% off',
            body:
              '<p>Hi {{record.first_name}},</p><p>Add a photo to your review of <strong>{{record.product_title}}</strong> and we will send you 15% off your next order.</p><p><a href="{{record.review_url}}">Add your review →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Win-back ─────────────────────────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-09',
    name: 'Win-Back — Lapsed Customer Re-engagement',
    description:
      'Long-delay re-engagement email for lapsed customers, timed off their last order via the win-back drip preset.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['klaviyo', 'email', 'win-back', 're-engagement', 'lapsed', 'retention'],
    spec: {
      type: 'messaging.campaign',
      name: 'Win-Back — Lapsed Customer Re-engagement',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'win_back',
          steps: [
            { delayMs: 60000, label: 'Order placed (entry)' },
            { delayMs: 7_776_000_000, channel: 'email', label: 'Day 90 — we miss you' },
          ],
        },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'lapsed_customers',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'We miss you — here is 20% off',
            body:
              '<p>Hi {{record.first_name}},</p><p>It has been a while. Come back and take 20% off your next order, on us.</p><p><a href="{{shop.url}}">Shop with 20% off →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Replenishment / reorder reminder ────────────────────────────────────────
  {
    id: 'MSG-EMAIL-10',
    name: 'Replenishment — Reorder Reminder',
    description:
      'Consumable reorder reminder delivered N days after purchase, timed relative to the order via the replenishment drip.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['omnisend', 'email', 'replenishment', 'reorder', 'drip', 'retention'],
    spec: {
      type: 'messaging.campaign',
      name: 'Replenishment — Reorder Reminder',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'replenishment',
          steps: [
            { delayMs: 60000, label: 'Order placed (entry)' },
            { delayMs: 2_592_000_000, channel: 'email', label: 'Day 30 — time to reorder' },
          ],
        },
        audience: {
          recipients: [],
          source: 'event_recipient',
          addressField: 'email',
          consentField: 'accepts_marketing',
        },
        templates: [
          {
            channel: 'email',
            subject: 'Running low? Time to restock',
            body:
              '<p>Hi {{customer.first_name}},</p><p>Based on your last order, you may be running low on <strong>{{order.product_title}}</strong>. Reorder in one click.</p><p><a href="{{order.reorder_url}}">Reorder now →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // ── Broadcast newsletter blast ──────────────────────────────────────────────
  {
    id: 'MSG-EMAIL-11',
    name: 'Newsletter — Broadcast Blast',
    description:
      'One-shot newsletter broadcast to the full subscriber list, sent now or on a scheduled run over the consented audience.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tags: ['omnisend', 'email', 'newsletter', 'broadcast', 'campaign', 'marketing'],
    spec: {
      type: 'messaging.campaign',
      name: 'Newsletter — Broadcast Blast',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: { kind: 'broadcast' },
        audience: {
          recipients: [],
          source: 'data_store',
          storeKey: 'newsletter_subscribers',
          addressField: 'email',
          consentField: 'email_consent',
        },
        templates: [
          {
            channel: 'email',
            subject: 'This week: new arrivals & members-only picks',
            body:
              '<p>Hi {{record.first_name}},</p><p>Here is what is new this week, hand-picked for our subscribers.</p><p><a href="{{shop.url}}">See what is new →</a></p>',
          },
        ],
        batchSize: 500,
        respectConsent: true,
      },
    },
  },
];
