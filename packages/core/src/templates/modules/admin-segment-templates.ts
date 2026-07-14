import type { TemplateEntry } from '../types.js';

/**
 * admin.segmentTemplate templates — pre-built customer-segment queries surfaced into
 * the segment editor's template gallery (Phase 6 vocab-hardening; family was
 * previously covered only by the coverage stub COV-SEG-01). A runnable data extension
 * on the single target `admin.customers.segmentation-templates.data`: the shipped
 * extension returns the published templates verbatim and the merchant inserts one with
 * a click.
 *
 * Vocab is authored strictly against the admin.segmentTemplate config member
 * (recipe.ts): `{ target (literal), templates: [{ title, description, query }] }`
 * (1–20). Each `query` uses Shopify segment-editor syntax (`number_of_orders >= 5`,
 * `last_order_date < -90d`, `customer_tags CONTAINS 'vip'`, `amount_spent > 500`).
 * `requires` is left `[]`.
 */
export const ADMIN_SEGMENT_TEMPLATE_TEMPLATES: TemplateEntry[] = [
  // ADM-SEG-01 — churn-risk / re-engagement gallery: the highest-leverage retention
  // segments (lapsing, dormant, one-and-done).
  {
    id: 'ADM-SEG-01',
    name: 'Churn-Risk & Re-engagement Segments',
    description:
      'Seeds the segment editor with retention-focused templates: customers lapsing out of their buying window, long-dormant buyers, and one-and-done shoppers ripe for a win-back.',
    category: 'ADMIN_UI',
    type: 'admin.segmentTemplate',
    icon: 'admin',
    tier: 'exemplar',
    tags: ['admin', 'segment', 'churn', 'retention', 'win-back', 'customers'],
    spec: {
      type: 'admin.segmentTemplate',
      name: 'Churn-Risk & Re-engagement Segments',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customers.segmentation-templates.data',
        templates: [
          {
            title: 'Lapsing customers',
            description: 'Repeat buyers whose last order was 60–120 days ago — still reachable, starting to slip.',
            query: 'number_of_orders >= 2 AND last_order_date < -60d AND last_order_date >= -120d',
          },
          {
            title: 'Dormant customers',
            description: 'Anyone who has ordered before but not in the last 180 days.',
            query: 'number_of_orders >= 1 AND last_order_date < -180d',
          },
          {
            title: 'One-and-done buyers',
            description: 'Customers with exactly one order placed more than 45 days ago.',
            query: 'number_of_orders = 1 AND last_order_date < -45d',
          },
        ],
      },
    },
  },

  // ADM-SEG-02 — VIP / high-value gallery for loyalty and concierge outreach.
  {
    id: 'ADM-SEG-02',
    name: 'VIP & High-Value Segments',
    description:
      'Seeds the segment editor with high-value templates: top lifetime spenders, frequent repeat buyers, and customers already tagged VIP — for loyalty perks and concierge outreach.',
    category: 'ADMIN_UI',
    type: 'admin.segmentTemplate',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'segment', 'vip', 'high-value', 'loyalty', 'customers'],
    spec: {
      type: 'admin.segmentTemplate',
      name: 'VIP & High-Value Segments',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customers.segmentation-templates.data',
        templates: [
          {
            title: 'Top spenders',
            description: 'Customers who have spent more than $500 across their lifetime.',
            query: 'amount_spent > 500',
          },
          {
            title: 'Frequent buyers',
            description: 'Customers with 5 or more completed orders.',
            query: 'number_of_orders >= 5',
          },
          {
            title: 'Tagged VIPs',
            description: 'Customers already carrying the VIP tag from loyalty or manual review.',
            query: "customer_tags CONTAINS 'vip'",
          },
        ],
      },
    },
  },

  // ADM-SEG-03 — first-time / new-customer gallery for onboarding and welcome flows.
  {
    id: 'ADM-SEG-03',
    name: 'First-Time & New Customer Segments',
    description:
      'Seeds the segment editor with acquisition templates: brand-new subscribers with no order yet, first-time buyers within their onboarding window, and recently created accounts.',
    category: 'ADMIN_UI',
    type: 'admin.segmentTemplate',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'segment', 'new-customer', 'first-time', 'onboarding', 'customers'],
    spec: {
      type: 'admin.segmentTemplate',
      name: 'First-Time & New Customer Segments',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customers.segmentation-templates.data',
        templates: [
          {
            title: 'Subscribers, no purchase',
            description: 'People who signed up but have not placed a single order.',
            query: 'number_of_orders = 0 AND email_subscription_status = subscribed',
          },
          {
            title: 'First-time buyers (last 30 days)',
            description: 'Customers whose only order was placed within the last 30 days.',
            query: 'number_of_orders = 1 AND last_order_date >= -30d',
          },
          {
            title: 'New accounts (last 14 days)',
            description: 'Customer accounts created in the last two weeks.',
            query: 'customer_added_date >= -14d',
          },
        ],
      },
    },
  },
];
