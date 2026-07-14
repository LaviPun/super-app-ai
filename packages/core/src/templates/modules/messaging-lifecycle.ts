import type { TemplateEntry } from '../types.js';

/**
 * messaging.campaign templates — lifecycle sends (Phase 6 vocab-hardening).
 * Complements the email/slack corpus in `messaging-email.ts` / `messaging-slack.ts`
 * with three lifecycle campaigns that exercise the drip-preset + consent vocabulary:
 * a back-in-stock alert, a multi-touch win-back drip, and a post-purchase cross-sell.
 *
 * Every spec is `messaging.campaign` whose config IS the MessagingPackSchema
 * (flat-pin). Primary channel is `email` (a SHIPPED delivery channel via
 * EmailConnector / SEND_EMAIL_NOTIFICATION), so each carries an `email` template WITH
 * a subject (the pack refines email templates to require one).
 *
 * Honesty (specs/031 messaging-surface.md): `back_in_stock` resolves to
 * SHOPIFY_WEBHOOK_PRODUCT_UPDATED and drip presets resolve to their real entry
 * triggers (MESSAGING_DRIP_PRESET_ENTRY) — no fabricated events. Every send is gated:
 * `respectConsent: true` plus a per-record `consentField` that must be truthy to send.
 */
export const MESSAGING_LIFECYCLE_TEMPLATES: TemplateEntry[] = [
  // MSG-CAMP-01 — back-in-stock: a two-touch alert (immediate + a next-day nudge)
  // to the product waitlist when a subscribed variant returns to stock.
  {
    id: 'MSG-CAMP-01',
    name: 'Back in Stock — Alert + Next-Day Nudge',
    description:
      'Emails the product waitlist the moment a subscribed variant is back in stock, then sends a next-day nudge to anyone who has not yet returned to buy.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tier: 'standard',
    tags: ['messaging', 'email', 'back-in-stock', 'restock', 'waitlist', 'drip'],
    spec: {
      type: 'messaging.campaign',
      name: 'Back in Stock — Alert + Next-Day Nudge',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'back_in_stock',
          steps: [
            { delayMs: 60000, label: 'Restock alert (entry)' },
            { delayMs: 86_400_000, channel: 'email', label: 'Day 1 — still available nudge' },
          ],
        },
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
              '<p>Good news, {{record.first_name}} — <strong>{{record.product_title}}</strong> is available again.</p><p>Stock is limited, so grab yours before it sells out.</p><p><a href="{{record.product_url}}">Shop it now →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // MSG-CAMP-02 — win-back: a three-touch lapsed-customer drip timed off the last
  // order via the win_back preset (soft check-in → offer → last call).
  {
    id: 'MSG-CAMP-02',
    name: 'Win-Back — 3-Touch Lapsed Drip',
    description:
      'Re-engages lapsed customers with a three-email drip timed off their last order: a soft check-in at 60 days, a discount offer at 90, and a final last-call at 120.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tier: 'standard',
    tags: ['messaging', 'email', 'win-back', 're-engagement', 'lapsed', 'drip', 'retention'],
    spec: {
      type: 'messaging.campaign',
      name: 'Win-Back — 3-Touch Lapsed Drip',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'win_back',
          steps: [
            { delayMs: 5_184_000_000, label: 'Day 60 — we miss you' },
            { delayMs: 2_592_000_000, channel: 'email', label: 'Day 90 — here is 15% off' },
            { delayMs: 2_592_000_000, channel: 'email', label: 'Day 120 — last call' },
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
            subject: 'We miss you — come back for 15% off',
            body:
              '<p>Hi {{record.first_name}},</p><p>It has been a while. Here is 15% off your next order to welcome you back.</p><p><a href="{{shop.url}}">Shop with 15% off →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },

  // MSG-CAMP-03 — post-purchase cross-sell. The exemplar: a two-touch cross-sell
  // drip that thanks the buyer, then recommends complementary products a few days
  // after the order via the post_purchase preset.
  {
    id: 'MSG-CAMP-03',
    name: 'Post-Purchase Cross-Sell',
    description:
      'Thanks the buyer right after their order, then follows up three days later with complementary product recommendations to drive a repeat purchase — a post-purchase cross-sell drip.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'mail',
    tier: 'exemplar',
    tags: ['messaging', 'email', 'post-purchase', 'cross-sell', 'recommendations', 'drip'],
    spec: {
      type: 'messaging.campaign',
      name: 'Post-Purchase Cross-Sell',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'email',
        trigger: {
          kind: 'drip',
          dripPreset: 'post_purchase',
          steps: [
            { delayMs: 60000, label: 'Order thank-you (entry)' },
            { delayMs: 259_200_000, channel: 'email', label: 'Day 3 — you might also like' },
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
            subject: 'Pairs perfectly with your order',
            body:
              '<p>Hi {{customer.first_name}},</p><p>Thanks again for your order. Customers who bought <strong>{{order.product_title}}</strong> often add these next:</p><p><a href="{{order.cross_sell_url}}">See the pairings →</a></p>',
          },
        ],
        respectConsent: true,
        batchSize: 200,
      },
    },
  },
];
