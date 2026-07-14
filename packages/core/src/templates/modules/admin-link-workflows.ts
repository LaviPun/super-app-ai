import type { TemplateEntry } from '../types.js';

/**
 * admin.link templates — deep links from an admin resource page into an app route
 * (Phase 6 vocab-hardening; family was previously covered only by the coverage stub
 * COV-LINK-01). A `admin_link` extension is a distinct Shopify extension TYPE, NOT a
 * ui_extension: the deploy IS the toml registration (`target` + relative `url`;
 * Shopify appends the store + selected-resource id at click time). No runtime bundle.
 *
 * Vocab is authored strictly against the admin.link config member (recipe.ts):
 * `{ target: ADMIN_LINK_TARGETS, label, url (relative, ^/…) }`. Each `url` is a
 * single leading-slash relative app path — Shopify appends `shop` + the resource id,
 * so the destination app page keys off the resource under the deep link. `requires`
 * is left `[]` (admin.link takes no data-surface flags in the modernize pass).
 */
export const ADMIN_LINK_WORKFLOW_TEMPLATES: TemplateEntry[] = [
  // ADM-LINK-01 — the canonical operations deep link: jump from an order into the
  // app's supplier-portal view for that order (dropship / made-to-order fulfilment).
  {
    id: 'ADM-LINK-01',
    name: 'Open Supplier Portal for This Order',
    description:
      'Adds an action-menu link on the order details page that opens the app’s supplier-portal route with the selected order pre-loaded, so staff can route it to the dropship/made-to-order vendor.',
    category: 'ADMIN_UI',
    type: 'admin.link',
    icon: 'admin',
    tier: 'exemplar',
    tags: ['admin', 'link', 'order', 'supplier', 'fulfillment', 'deep-link'],
    spec: {
      type: 'admin.link',
      name: 'Open Supplier Portal for This Order',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.link',
        label: 'Open supplier portal',
        url: '/app/orders/supplier-portal',
      },
    },
  },

  // ADM-LINK-02 — margin/cost lookup from the product page (buyer/merchandiser flow).
  {
    id: 'ADM-LINK-02',
    name: 'View Cost & Margin Sheet',
    description:
      'Adds an action-menu link on the product details page that opens the app’s cost-and-margin route for the selected product, giving buyers landed cost and margin at a glance.',
    category: 'ADMIN_UI',
    type: 'admin.link',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'link', 'product', 'margin', 'cost', 'deep-link'],
    spec: {
      type: 'admin.link',
      name: 'View Cost & Margin Sheet',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.action.link',
        label: 'Cost & margin sheet',
        url: '/app/products/margin',
      },
    },
  },

  // ADM-LINK-03 — bulk re-engagement handoff from the customer index selection bar.
  {
    id: 'ADM-LINK-03',
    name: 'Send Selected Customers to Campaign Builder',
    description:
      'Adds a bulk-selection action link on the customer index that hands the selected customers to the app’s campaign-builder route, seeding a targeted re-engagement send.',
    category: 'ADMIN_UI',
    type: 'admin.link',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'link', 'customer', 'bulk', 'campaign', 'deep-link'],
    spec: {
      type: 'admin.link',
      name: 'Send Selected Customers to Campaign Builder',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.link',
        label: 'Build a campaign',
        url: '/app/campaigns/new',
      },
    },
  },
];
