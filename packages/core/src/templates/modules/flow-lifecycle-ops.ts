import type { TemplateEntry } from '../types.js';

/**
 * flow.automation templates — lifecycle & ops automations (Phase 6 vocab-hardening).
 * Complements the linear-runner corpus flows in `flow-linear-runner.ts` with three
 * everyday merchant automations that exercise the trigger + step vocabulary:
 * order-count gating (VIP on the 5th order), a durable post-fulfilment delay
 * (review request), and a threshold condition (low-inventory Slack alert).
 *
 * Vocab is authored strictly against the flow.automation config member (recipe.ts):
 * `{ trigger: FLOW_AUTOMATION_TRIGGERS, steps: [...] }`. Step kinds, operators, and
 * DELAY durations come only from the live vocabulary (FLOW_STEP_KINDS,
 * CONDITION_OPERATORS, FLOW_DELAY_LIMITS). DELAYs use `duration` mode (the shipped v1
 * path); a DELAY longer than the inline threshold parks the remaining steps on the
 * durable scheduler. `requires` is left `[]` (the barrel injects the flow flags).
 */
export const FLOW_LIFECYCLE_OPS_TEMPLATES: TemplateEntry[] = [
  // FLOW-07 — VIP promotion gated on order count: on each order, if the customer has
  // now placed 5+ orders, tag them VIP, note the order, and record them to a VIP store.
  {
    id: 'FLOW-07',
    name: 'VIP Tagging on 5th Order',
    description:
      'On each new order, checks the customer’s lifetime order count and — once they reach five orders — tags them VIP, annotates the order, and writes them to a VIP customer store.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tier: 'standard',
    tags: ['flow', 'vip', 'loyalty', 'tagging', 'order-count', 'segmentation'],
    spec: {
      type: 'flow.automation',
      name: 'VIP Tagging on 5th Order',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          {
            kind: 'CONDITION',
            field: 'customer.ordersCount',
            operator: 'greater_than_or_equal',
            value: 5,
            thenSteps: [
              { kind: 'TAG_CUSTOMER', tag: 'vip' },
              { kind: 'ADD_ORDER_NOTE', note: 'Customer reached 5 orders — promoted to VIP.' },
              {
                kind: 'WRITE_TO_STORE',
                storeKey: 'vip_customers',
                titleExpr: 'VIP unlocked — {{customer.id}}',
                payloadMapping: {
                  customerId: '{{customer.id}}',
                  ordersCount: '{{customer.ordersCount}}',
                  unlockedOn: '{{order.name}}',
                },
              },
            ],
            elseSteps: [],
          },
        ],
      },
    },
  },

  // FLOW-08 — post-fulfilment review request with a durable delay. The exemplar:
  // a clean multi-step durable automation (DELAY → tag → notify) off fulfilment.
  {
    id: 'FLOW-08',
    name: 'Review Request After Fulfillment',
    description:
      'When a fulfillment is created, waits three days for delivery, then tags the customer review-requested and posts to the reviews Slack channel so the team can follow up.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tier: 'exemplar',
    tags: ['flow', 'reviews', 'review-request', 'post-fulfillment', 'delay', 'durable'],
    spec: {
      type: 'flow.automation',
      name: 'Review Request After Fulfillment',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
        steps: [
          // Wait a short delivery window before asking for a review; parks durably.
          { kind: 'DELAY', mode: 'duration', durationMs: 259_200_000 },
          { kind: 'TAG_CUSTOMER', tag: 'review-requested' },
          {
            kind: 'SEND_SLACK_MESSAGE',
            channel: '#reviews',
            text: 'A fulfilled order has passed its delivery window — review-request cadence reached its send step.',
          },
        ],
      },
    },
  },

  // FLOW-09 — low-inventory Slack alert gated on a stock threshold.
  {
    id: 'FLOW-09',
    name: 'Low-Inventory Slack Alert',
    description:
      'On a product update, checks the primary variant’s inventory and, when it drops below the reorder threshold, posts a restock alert to the inventory Slack channel.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tier: 'standard',
    tags: ['flow', 'inventory', 'low-stock', 'alert', 'slack', 'ops'],
    spec: {
      type: 'flow.automation',
      name: 'Low-Inventory Slack Alert',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        steps: [
          {
            kind: 'CONDITION',
            field: 'product.variants.0.inventory_quantity',
            operator: 'less_than',
            value: 5,
            thenSteps: [
              {
                kind: 'SEND_SLACK_MESSAGE',
                channel: '#inventory-alerts',
                text: 'Low stock: {{product.title}} has dropped below the reorder threshold — time to restock.',
              },
            ],
            elseSteps: [],
          },
        ],
      },
    },
  },
];
