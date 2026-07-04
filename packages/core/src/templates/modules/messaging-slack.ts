/**
 * Slack internal-ops alert campaigns — `messaging.campaign` templates whose primary
 * channel is `slack` (SlackConnector, shipped; delivered via the live
 * SEND_SLACK_MESSAGE step). Each fires an internal team alert to an explicit
 * ops recipient list (`audience.source: 'literal'`) off a REAL live trigger — a
 * subscribed Shopify webhook or a captured SuperApp data-record. No customer-facing
 * fan-out, no fabricated events, no unshipped channels.
 *
 * Grounding: the internal alerting patterns real apps expose through Shopify Flow —
 * Judge.me's "notify Slack/email, branch on rating" review-received action
 * (judge-me.md surfaces/§flow), and PushOwl/Brevo's server-side store-event
 * automations for restock / fulfillment / order signals (pushowl.md §surfaces,
 * §functional_model). Here those signals route to an internal Slack channel rather
 * than back out to shoppers.
 */
import type { TemplateEntry } from '../types.js';

export const MESSAGING_SLACK_TEMPLATES: TemplateEntry[] = [
  {
    id: 'MSG-SLACK-01',
    name: 'New Order — Ops Slack Alert',
    description:
      'Post an internal Slack alert to the fulfillment team the moment a new order is created, so ops can start picking without watching the admin.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'slack',
    tags: ['messaging', 'slack', 'ops', 'orders', 'internal', 'fulfillment'],
    spec: {
      type: 'messaging.campaign',
      name: 'New Order — Ops Slack Alert',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'slack',
        trigger: { kind: 'event', event: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
        audience: {
          source: 'literal',
          recipients: ['#ops-orders'],
        },
        templates: [
          {
            channel: 'slack',
            body:
              ':package: *New order {{order.name}}* — {{order.total_price}} · {{order.line_items_count}} item(s) · {{order.customer_name}}. Ship-to {{order.shipping_country}}. <{{order.admin_url}}|Open in admin>',
          },
        ],
        respectConsent: false,
        batchSize: 200,
      },
    },
  },
  {
    id: 'MSG-SLACK-02',
    name: 'Product Updated — Merch Ops Slack Alert',
    description:
      'Alert the merchandising channel in Slack whenever a product is updated (price, inventory, or status change) so the team catches restocks and price edits in real time.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'slack',
    tags: ['messaging', 'slack', 'ops', 'inventory', 'internal', 'merchandising'],
    spec: {
      type: 'messaging.campaign',
      name: 'Product Updated — Merch Ops Slack Alert',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'slack',
        trigger: { kind: 'event', event: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
        audience: {
          source: 'literal',
          recipients: ['#merch-ops'],
        },
        templates: [
          {
            channel: 'slack',
            body:
              ':label: *Product updated:* {{product.title}} ({{product.vendor}}) — status {{product.status}}, {{product.total_inventory}} in stock. <{{product.admin_url}}|Review the change>',
          },
        ],
        respectConsent: false,
        batchSize: 200,
      },
    },
  },
  {
    id: 'MSG-SLACK-03',
    name: 'Low Review Received — CX Ops Slack Alert',
    description:
      'Ping the customer-experience Slack channel when a captured low-star review lands, so CX can reach out before the shopper churns — the internal half of a review-received Flow.',
    category: 'INTEGRATION',
    type: 'messaging.campaign',
    icon: 'slack',
    tags: ['messaging', 'slack', 'ops', 'reviews', 'internal', 'cx'],
    spec: {
      type: 'messaging.campaign',
      name: 'Low Review Received — CX Ops Slack Alert',
      category: 'INTEGRATION',
      requires: [],
      config: {
        channel: 'slack',
        // Entry on a captured review data-record (no native review webhook exists);
        // a storefront view/review capture writes the record that fires this alert.
        trigger: { kind: 'event', event: 'SUPERAPP_DATA_RECORD_CREATED' },
        audience: {
          source: 'literal',
          recipients: ['#cx-alerts'],
        },
        templates: [
          {
            channel: 'slack',
            body:
              ':warning: *{{record.rating}}★ review* on {{record.product_title}} from {{record.reviewer_name}}: “{{record.body}}” — follow up before they churn.',
          },
        ],
        respectConsent: false,
        batchSize: 200,
      },
    },
  },
];
