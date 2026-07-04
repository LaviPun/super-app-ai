import type { TemplateEntry } from './types.js';

/**
 * Coverage backfill — authored LAST by the wiring agent (design.md §E, §D.3).
 *
 * The three real libraries (`./modules`, `./blocks`, `./sections`) already cover the
 * overwhelming majority of `RECIPE_SPEC_TYPES` with corpus-grounded content. This file
 * adds the minimum, schema-valid entries for the handful of rarely-authored types that
 * no corpus unit file produces, so every `RECIPE_SPEC_TYPE` has ≥ 1 template and the
 * `covers all RecipeSpec type variants` gate stays green.
 *
 * Count check (post-wiring, pre-coverage): the following 5 types had 0 templates —
 *   admin.link · admin.print · admin.segmentTemplate · analytics.pixel ·
 *   platform.extensionBlueprint
 * Each entry below is a real, honest, minimal use of its shipped surface (admin deep
 * link / print action / segment-template data extension / web-pixel / extension
 * blueprint intent) and parses against `RecipeSpecSchema`.
 */
export const COVERAGE_TEMPLATES: TemplateEntry[] = [
  // admin.link — deep link from an admin resource page into an app route.
  {
    id: 'COV-LINK-01',
    name: 'Order Reconcile Deep Link',
    description:
      'Adds an admin-action link on the order details page that opens the app’s order-reconcile route with the selected order pre-loaded.',
    category: 'ADMIN_UI',
    type: 'admin.link',
    icon: 'admin',
    tags: ['admin', 'link', 'order', 'deep-link', 'coverage'],
    spec: {
      type: 'admin.link',
      name: 'Order Reconcile Deep Link',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.link',
        label: 'Reconcile this order',
        url: '/app/orders/reconcile',
      },
    },
  },

  // admin.print — a custom printable document (packing slip) for an order.
  {
    id: 'COV-PRINT-01',
    name: 'Branded Packing Slip',
    description:
      'Adds an order print action that renders a branded packing slip document (order name, line items, shop header) from the order details page.',
    category: 'ADMIN_UI',
    type: 'admin.print',
    icon: 'admin',
    tags: ['admin', 'print', 'order', 'packing-slip', 'coverage'],
    spec: {
      type: 'admin.print',
      name: 'Branded Packing Slip',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.print-action.render',
        label: 'Print packing slip',
        documentKind: 'packing-slip',
        title: 'Packing Slip',
        subtitle: 'Thanks for your order — {{order.name}}',
        includeShopHeader: true,
      },
    },
  },

  // admin.segmentTemplate — pre-built segment queries in the editor gallery.
  {
    id: 'COV-SEG-01',
    name: 'Repeat & Lapsed Customer Segments',
    description:
      'Seeds the customer-segment editor gallery with ready-to-run templates for repeat buyers, lapsed customers, and high-value spenders.',
    category: 'ADMIN_UI',
    type: 'admin.segmentTemplate',
    icon: 'admin',
    tags: ['admin', 'segment', 'customers', 'template', 'coverage'],
    spec: {
      type: 'admin.segmentTemplate',
      name: 'Repeat & Lapsed Customer Segments',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customers.segmentation-templates.data',
        templates: [
          {
            title: 'Repeat buyers',
            description: 'Customers with 2 or more completed orders.',
            query: 'number_of_orders >= 2',
          },
          {
            title: 'Lapsed customers',
            description: 'Customers whose last order was more than 90 days ago.',
            query: 'last_order_date < -90d',
          },
          {
            title: 'High-value spenders',
            description: 'Customers who have spent over $500 lifetime.',
            query: 'amount_spent > 500',
          },
        ],
      },
    },
  },

  // analytics.pixel — a web pixel capturing standard storefront events.
  {
    id: 'COV-ANA-01',
    name: 'Storefront Conversion Pixel',
    description:
      'A web pixel that captures the core storefront funnel events (page views, product views, add-to-cart, checkout, purchase) for downstream analytics.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tags: ['analytics', 'pixel', 'conversion', 'events', 'coverage'],
    spec: {
      type: 'analytics.pixel',
      name: 'Storefront Conversion Pixel',
      category: 'INTEGRATION',
      requires: [],
      config: {
        events: [
          'page_viewed',
          'product_viewed',
          'product_added_to_cart',
          'checkout_started',
          'checkout_completed',
        ],
        mapping: {
          eventName: '{{event.name}}',
          timestamp: '{{event.timestamp}}',
        },
      },
    },
  },

  // platform.extensionBlueprint — a scaffolding intent for a new extension surface.
  {
    id: 'COV-BP-01',
    name: 'Theme App Extension Blueprint',
    description:
      'Declares the intent to scaffold a new theme app extension block, naming the surface and the goal so the build path can generate the starting files.',
    category: 'ADMIN_UI',
    type: 'platform.extensionBlueprint',
    icon: 'code',
    tags: ['platform', 'blueprint', 'scaffold', 'theme-app-extension', 'coverage'],
    spec: {
      type: 'platform.extensionBlueprint',
      name: 'Theme App Extension Blueprint',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        surface: 'THEME_APP_EXTENSION',
        goal: 'Scaffold a reusable storefront theme app extension block with schema-driven settings.',
        suggestedFiles: [
          'extensions/theme-app-extension/blocks/custom-block.liquid',
          'extensions/theme-app-extension/shopify.extension.toml',
        ],
      },
    },
  },
];
