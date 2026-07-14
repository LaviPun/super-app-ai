import type { TemplateEntry } from '../types.js';

/**
 * admin.print templates — custom printable documents for orders/products (Phase 6
 * vocab-hardening; family was previously covered only by the coverage stub
 * COV-PRINT-01). The shipped admin-print extension renders an `s-admin-print-action`
 * whose `src` points at the app's `/admin-print/document` route, parameterized by the
 * published config (documentKind + title + which resource ids). Config-driven — no
 * per-module bundle.
 *
 * Vocab is authored strictly against the admin.print config member (recipe.ts):
 * `{ target: ADMIN_PRINT_TARGETS, label, documentKind: ADMIN_PRINT_DOCUMENT_KINDS,
 * title, subtitle?, bodyTemplate?, includeShopHeader }`. `{{order.name}}` /
 * `{{product.title}}` placeholders are resolved by the app's print route at render
 * time. `requires` is left `[]`.
 */
export const ADMIN_PRINT_DOCUMENT_TEMPLATES: TemplateEntry[] = [
  // ADM-PRINT-01 — the everyday warehouse document: a branded packing slip printed
  // from the order details page. The canonical, most-reached print action.
  {
    id: 'ADM-PRINT-01',
    name: 'Branded Packing Slip',
    description:
      'Order print action that renders a branded packing slip — shop header, order name, ship-to, and line items — from the order details page, ready to drop in the box.',
    category: 'ADMIN_UI',
    type: 'admin.print',
    icon: 'admin',
    tier: 'exemplar',
    tags: ['admin', 'print', 'order', 'packing-slip', 'warehouse', 'fulfillment'],
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
        subtitle: 'Order {{order.name}} — thank you for shopping with us',
        includeShopHeader: true,
      },
    },
  },

  // ADM-PRINT-02 — a price-suppressed gift receipt (documentKind 'custom' — a
  // receipt with no monetary values, for gifting).
  {
    id: 'ADM-PRINT-02',
    name: 'Gift Receipt (No Prices)',
    description:
      'Order print action that renders a gift receipt for the order — item names and a gift message, with all prices suppressed — so a gift can ship straight to the recipient.',
    category: 'ADMIN_UI',
    type: 'admin.print',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'print', 'order', 'gift-receipt', 'gifting'],
    spec: {
      type: 'admin.print',
      name: 'Gift Receipt (No Prices)',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.print-action.render',
        label: 'Print gift receipt',
        documentKind: 'custom',
        title: 'Gift Receipt',
        subtitle: 'A little something for you 🎁',
        bodyTemplate:
          'Order {{order.name}}\nItems are listed without prices. Returns accepted within 30 days with this receipt.',
        includeShopHeader: true,
      },
    },
  },

  // ADM-PRINT-03 — a bulk pick list generated from an order-index selection (batch
  // picking across many orders in one print run).
  {
    id: 'ADM-PRINT-03',
    name: 'Batch Pick List',
    description:
      'Bulk order-index print action that renders a consolidated pick list across the selected orders — SKU, bin, and quantity — for a single warehouse picking run.',
    category: 'ADMIN_UI',
    type: 'admin.print',
    icon: 'admin',
    tier: 'standard',
    tags: ['admin', 'print', 'order', 'pick-list', 'bulk', 'warehouse'],
    spec: {
      type: 'admin.print',
      name: 'Batch Pick List',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-index.selection-print-action.render',
        label: 'Print pick list',
        documentKind: 'pick-list',
        title: 'Pick List',
        subtitle: 'Consolidated across selected orders',
        includeShopHeader: false,
      },
    },
  },
];
