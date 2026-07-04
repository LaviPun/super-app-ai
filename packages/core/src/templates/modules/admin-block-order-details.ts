import type { TemplateEntry } from '../types.js';

/**
 * admin.block templates for `admin.order-details.block.render` — merchant-facing
 * cards on the Shopify order-details page. Grounded in the 028 corpus admin/data
 * surfaces of subscription + loyalty apps (Recharge, Appstle, Smile.io,
 * LoyaltyLion, BON): the fields a support/ops merchant wants inline on an order —
 * subscription contract status, customer LTV, loyalty tier + points, risk/fraud
 * signals, and the customer's tag/segment context.
 *
 * The generic admin UI extension (extensions/admin-ui) renders `description`,
 * `fields`, `badges`, `table`, `buttons`, and `links` with Polaris `s-*` web
 * components from the persisted `$app:superapp_admin_block` metaobject. The label/
 * value/badge copy here is a MERCHANT-AUTHORABLE SEED — the values shown are
 * illustrative placeholders. Live per-order data (LTV, points balance, tier,
 * subscription status) is owned by the app's own data store / app-proxy and is
 * populated only once that data source is connected; until then the card renders
 * its seeded copy, never fabricated live figures.
 */
export const ADMIN_BLOCK_ORDER_DETAILS_TEMPLATES: TemplateEntry[] = [
  // ADMB-ORD-01 — Subscription status card (Recharge / Appstle contract state)
  {
    id: 'ADMB-ORD-01',
    name: 'Subscription Contract Status',
    description:
      'Order-page card summarizing the buyer’s subscription contract — status, plan, frequency and next charge — for support and dunning triage.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'subscription', 'recharge', 'appstle', 'dunning'],
    spec: {
      type: 'admin.block',
      name: 'Subscription Contract Status',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Subscription status',
        description:
          'Contract state for this subscriber. Populated from the app’s subscription store once connected; seeded values shown until then.',
        fields: [
          { label: 'Plan', value: 'Subscribe & Save — Monthly' },
          { label: 'Frequency', value: 'Every 1 month' },
          { label: 'Billing', value: 'Pay-as-you-go' },
          { label: 'Next charge', value: 'Not connected' },
          { label: 'Cycles completed', value: 'Not connected' },
        ],
        badges: [
          { label: 'Active', tone: 'success' },
          { label: 'Payment valid', tone: 'info' },
        ],
        buttons: [{ label: 'Open in subscription portal' }],
      },
    },
  },

  // ADMB-ORD-02 — Customer lifetime value card (LTV / repeat-purchase context)
  {
    id: 'ADMB-ORD-02',
    name: 'Customer Lifetime Value',
    description:
      'Order-page card showing the customer’s lifetime value, order count and average order value so merchants can gauge account worth while handling the order.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'ltv', 'customer', 'retention', 'analytics'],
    spec: {
      type: 'admin.block',
      name: 'Customer Lifetime Value',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Lifetime value',
        description:
          'Lifetime spend and repeat-purchase signal for this customer. Figures resolve from the app’s analytics store once connected.',
        fields: [
          { label: 'Lifetime value', value: 'Not connected' },
          { label: 'Total orders', value: 'Not connected' },
          { label: 'Average order value', value: 'Not connected' },
          { label: 'First order', value: 'Not connected' },
          { label: 'Last order', value: 'Not connected' },
        ],
        badges: [{ label: 'Repeat customer', tone: 'info' }],
      },
    },
  },

  // ADMB-ORD-03 — Loyalty tier & points card (Smile / LoyaltyLion / BON ledger)
  {
    id: 'ADMB-ORD-03',
    name: 'Loyalty Tier & Points',
    description:
      'Order-page card showing the customer’s loyalty tier, points balance and progress to the next tier — for merchants running Smile, LoyaltyLion or BON style programs.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'loyalty', 'points', 'smile', 'vip-tier'],
    spec: {
      type: 'admin.block',
      name: 'Loyalty Tier & Points',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Loyalty & rewards',
        description:
          'Loyalty standing for this customer. Balance and tier read from the app’s points ledger once connected; seeded copy shown until then.',
        fields: [
          { label: 'Points balance', value: 'Not connected' },
          { label: 'Points pending', value: 'Not connected' },
          { label: 'Lifetime points', value: 'Not connected' },
          { label: 'Points to next tier', value: 'Not connected' },
        ],
        badges: [
          { label: 'Gold tier', tone: 'warning' },
          { label: 'VIP', tone: 'success' },
        ],
        buttons: [{ label: 'Adjust points' }],
      },
    },
  },

  // ADMB-ORD-04 — Order risk & fraud signal card
  {
    id: 'ADMB-ORD-04',
    name: 'Order Risk & Fraud Signals',
    description:
      'Order-page card surfacing risk level and the fraud signals behind it (AVS/CVV, address mismatch, velocity) so merchants can review before fulfilling.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'risk', 'fraud', 'review', 'fulfillment'],
    spec: {
      type: 'admin.block',
      name: 'Order Risk & Fraud Signals',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Risk review',
        description:
          'Risk assessment for this order. Signals resolve from the app’s risk store / connected fraud provider once wired.',
        fields: [
          { label: 'Risk level', value: 'Not connected', tone: 'warning' },
          { label: 'Recommendation', value: 'Not connected' },
        ],
        badges: [{ label: 'Manual review', tone: 'warning' }],
        table: {
          columns: ['Signal', 'Result'],
          rows: [
            ['CVV verification', 'Not connected'],
            ['AVS (address)', 'Not connected'],
            ['Billing/shipping match', 'Not connected'],
            ['Order velocity', 'Not connected'],
          ],
        },
      },
    },
  },

  // ADMB-ORD-05 — Customer tags & segment context card (BON_[tier] tags etc.)
  {
    id: 'ADMB-ORD-05',
    name: 'Customer Tags & Segments',
    description:
      'Order-page card listing the customer’s tags and matched segments (VIP, wholesale, loyalty-tier tags) to give merchants routing and service context.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'customer', 'tags', 'segment', 'b2b'],
    spec: {
      type: 'admin.block',
      name: 'Customer Tags & Segments',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Customer context',
        description:
          'Tags and segment membership for this customer. Tag list resolves from the customer record; segment matches from the app’s store once connected.',
        fields: [
          { label: 'Accepts marketing', value: 'Not connected' },
          { label: 'Account status', value: 'Not connected' },
        ],
        badges: [
          { label: 'VIP', tone: 'success' },
          { label: 'Wholesale', tone: 'info' },
          { label: 'Subscriber', tone: 'info' },
        ],
        links: [{ label: 'View customer profile', url: '/app/customers' }],
      },
    },
  },

  // ADMB-ORD-06 — Support & fulfillment quick-actions card
  {
    id: 'ADMB-ORD-06',
    name: 'Order Ops Quick Actions',
    description:
      'Order-page card giving support and ops staff a compact set of deep-links and inert action buttons — open the subscription portal, log a ticket, flag for review — alongside key order facts.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'order', 'operations', 'support', 'actions', 'fulfillment'],
    spec: {
      type: 'admin.block',
      name: 'Order Ops Quick Actions',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Order ops',
        description:
          'Quick context and links for this order. Buttons without a URL are display-only until the matching app route is connected.',
        fields: [
          { label: 'Fulfillment', value: 'Not connected' },
          { label: 'Financial status', value: 'Not connected' },
          { label: 'Delivery method', value: 'Not connected' },
        ],
        buttons: [{ label: 'Flag for review', tone: 'critical' }, { label: 'Reprocess sync' }],
        links: [
          { label: 'Open order automations', url: '/app/flows' },
          { label: 'Contact customer', url: '/app/customers' },
        ],
      },
    },
  },
];
