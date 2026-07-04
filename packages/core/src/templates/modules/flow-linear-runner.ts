import type { TemplateEntry } from '../types.js';

/**
 * flow.automation — linear-runner unit (surface-coverage 034, flow-linear-runner).
 *
 * Six trigger→linear-steps→DELAY(durable) automations grounded in the 028 corpus:
 * back-in-stock fan-out (appikon-notify-me), abandoned-nudge drip (pushowl),
 * post-purchase review request (judge-me), win-back timer (klaviyo), and
 * subscription/renewal ops (loop-subscriptions). Every step kind, trigger, and
 * DELAY duration is drawn ONLY from the live vocabulary in recipe.ts /
 * allowed-values.ts (FLOW_AUTOMATION_TRIGGERS, FLOW_STEP_KINDS, FLOW_DELAY_LIMITS).
 *
 * HONESTY: the durable scheduler PARKS remaining steps on a DELAY and a cron
 * resume sweep continues them (recipe.ts:1103-1123); these templates use only
 * `duration` mode (the shipped v1 path), never `until`. `requires` is left minimal
 * so the barrel's withFlowDefaults injects the flow capability flags.
 */
export const FLOW_LINEAR_RUNNER_TEMPLATES: TemplateEntry[] = [
  // FLOW-01 — Back-in-stock waitlist fan-out (Appikon "Notify Me" behavioral core:
  // restock → persist the demand record → wait out the rate interval → notify + tag).
  {
    id: 'FLOW-01',
    name: 'Back-in-Stock Waitlist Fan-Out',
    description:
      'When a product restocks, records the demand signal to a waitlist store, waits out the rate interval, then emails the merchant and tags the customer — an Appikon-style notify-me engine.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'back-in-stock', 'waitlist', 'notify', 'restock', 'appikon'],
    spec: {
      type: 'flow.automation',
      name: 'Back-in-Stock Waitlist Fan-Out',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        steps: [
          {
            kind: 'WRITE_TO_STORE',
            storeKey: 'back_in_stock_queue',
            titleExpr: 'Restock: {{product.title}}',
            payloadMapping: {
              productId: '{{product.id}}',
              productTitle: '{{product.title}}',
              restockedAt: '{{event.occurredAt}}',
            },
          },
          // Space the fan-out so a burst restock does not hammer the send channel.
          { kind: 'DELAY', mode: 'duration', durationMs: 900_000 },
          {
            kind: 'SEND_EMAIL_NOTIFICATION',
            to: 'ops@example.com',
            subject: 'Back in stock — waitlist ready to notify',
            body:
              '{{product.title}} is back in stock. The waitlist has been recorded and is ready for the next notification batch.',
          },
          { kind: 'TAG_CUSTOMER', tag: 'waitlist-notified' },
        ],
      },
    },
  },

  // FLOW-02 — Abandoned-order nudge drip (PushOwl abandoned-cart automation: a
  // draft order lingers → wait → nudge, with a longer second wait before a final
  // reminder note; the two DELAYs each park durably).
  {
    id: 'FLOW-02',
    name: 'Abandoned-Order Nudge Drip',
    description:
      'On a new draft order, waits one hour then emails a first nudge, waits a day, then leaves a follow-up note and tags the order for reporting — a PushOwl-style multi-step recovery drip.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'abandoned', 'drip', 'recovery', 'notify', 'pushowl'],
    spec: {
      type: 'flow.automation',
      name: 'Abandoned-Order Nudge Drip',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED',
        steps: [
          // First nudge one hour after the draft is created.
          { kind: 'DELAY', mode: 'duration', durationMs: 3_600_000 },
          {
            kind: 'SEND_EMAIL_NOTIFICATION',
            to: 'ops@example.com',
            subject: 'Draft order still open — first nudge sent',
            body:
              'A draft order has been open for an hour. First recovery nudge is queued for the customer.',
          },
          // Second touch a day later.
          { kind: 'DELAY', mode: 'duration', durationMs: 86_400_000 },
          {
            kind: 'ADD_ORDER_NOTE',
            note: 'Abandoned-order drip: second reminder reached final step.',
          },
          { kind: 'TAG_ORDER', tags: 'abandoned-drip,recovery-attempted' },
        ],
      },
    },
  },

  // FLOW-03 — Post-purchase review request (Judge.me review-request cadence: order
  // paid → wait for delivery window → tag the customer + Slack the review team).
  {
    id: 'FLOW-03',
    name: 'Post-Purchase Review Request',
    description:
      'After an order is created, waits seven days for delivery, then tags the customer as review-eligible and posts to the review team Slack channel — a Judge.me-style review-request cadence.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'reviews', 'post-purchase', 'review-request', 'judge-me'],
    spec: {
      type: 'flow.automation',
      name: 'Post-Purchase Review Request',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          // Wait a delivery window before asking for a review.
          { kind: 'DELAY', mode: 'duration', durationMs: 604_800_000 },
          { kind: 'TAG_CUSTOMER', tag: 'review-eligible' },
          {
            kind: 'SEND_SLACK_MESSAGE',
            channel: '#reviews',
            text: 'A recent order is now review-eligible — review request cadence reached its send step.',
          },
        ],
      },
    },
  },

  // FLOW-04 — VIP order routing + write-store (Klaviyo-style segmentation branch):
  // high-value order → CONDITION on total → tag customer VIP, note the order, and
  // record the VIP order to a segment store; else tag standard.
  {
    id: 'FLOW-04',
    name: 'VIP Order Tag & Segment Router',
    description:
      'On each new order, branches on order total: high-value orders tag the customer VIP, annotate the order, and write to a VIP segment store; everyone else is tagged standard — a Klaviyo-style segmentation branch.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'segmentation', 'vip', 'tag-order', 'write-store', 'klaviyo'],
    spec: {
      type: 'flow.automation',
      name: 'VIP Order Tag & Segment Router',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          {
            kind: 'CONDITION',
            field: 'order.totalPrice',
            operator: 'greater_than_or_equal',
            value: 250,
            thenSteps: [
              { kind: 'TAG_CUSTOMER', tag: 'vip' },
              { kind: 'TAG_ORDER', tags: 'vip-order,high-value' },
              { kind: 'ADD_ORDER_NOTE', note: 'High-value order — routed to VIP segment.' },
              {
                kind: 'WRITE_TO_STORE',
                storeKey: 'vip_segment',
                titleExpr: 'VIP order {{order.name}}',
                payloadMapping: {
                  orderId: '{{order.id}}',
                  customerId: '{{customer.id}}',
                  totalPrice: '{{order.totalPrice}}',
                },
              },
            ],
            elseSteps: [{ kind: 'TAG_CUSTOMER', tag: 'standard' }],
          },
        ],
      },
    },
  },

  // FLOW-05 — Win-back reactivation timer (Klaviyo/Loop lapsed-customer sequence:
  // order → long durable wait → tag win-back + email the merchant to re-engage).
  {
    id: 'FLOW-05',
    name: 'Win-Back Reactivation Timer',
    description:
      'After an order, waits thirty days then tags the customer for win-back and emails the merchant to trigger a re-engagement offer — a long durable-wait lapsed-customer timer.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'win-back', 'reactivation', 'lifecycle', 'delay', 'klaviyo'],
    spec: {
      type: 'flow.automation',
      name: 'Win-Back Reactivation Timer',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          // Long durable wait — parks the remaining steps until the resume sweep.
          { kind: 'DELAY', mode: 'duration', durationMs: 2_592_000_000 },
          { kind: 'TAG_CUSTOMER', tag: 'win-back-due' },
          {
            kind: 'SEND_EMAIL_NOTIFICATION',
            to: 'crm@example.com',
            subject: 'Customer due for win-back re-engagement',
            body:
              'A customer has passed the reactivation window with no repeat order. Queue a win-back offer.',
          },
        ],
      },
    },
  },

  // FLOW-06 — Subscription renewal reminder ops (Loop Subscriptions dunning cadence:
  // fulfillment created → wait the renewal-lead window → note the renewal + Slack ops).
  {
    id: 'FLOW-06',
    name: 'Subscription Renewal Reminder',
    description:
      'When a fulfillment is created, waits the renewal-lead window then annotates the order with a renewal reminder and posts to the subscriptions ops Slack — a Loop-style renewal dunning cadence.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'subscriptions', 'renewal', 'reminder', 'ops', 'loop'],
    spec: {
      type: 'flow.automation',
      name: 'Subscription Renewal Reminder',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
        steps: [
          // Lead time before the next renewal cycle.
          { kind: 'DELAY', mode: 'duration', durationMs: 1_814_400_000 },
          {
            kind: 'ADD_ORDER_NOTE',
            note: 'Subscription renewal window approaching — reminder cadence reached its send step.',
          },
          {
            kind: 'SEND_SLACK_MESSAGE',
            channel: '#subscriptions-ops',
            text: 'A subscription is entering its renewal window — renewal reminder cadence fired.',
          },
        ],
      },
    },
  },
];
