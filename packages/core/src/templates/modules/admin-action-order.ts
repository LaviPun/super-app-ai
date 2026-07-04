import type { TemplateEntry } from '../types.js';

/**
 * admin.action templates — ORDER surfaces.
 *
 * recipeType = admin.action; surface family = order-details / order-index(.selection) /
 * draft-order / order-fulfilled-card. Each entry opens a "More actions" modal that the
 * generic admin UI extension (extensions/admin-ui) renders from the persisted
 * `$app:superapp_admin_action` metaobject using Polaris `s-*` components: heading,
 * description, label/value `fields`, `badges`, a `table`, `buttons`, and `links`.
 *
 * HONESTY: `buttons` WITHOUT a `url` are display-only (inert); a `url` renders a
 * link-button / deep-link. These modals declare fulfillment/tagging/reorder INTENT and
 * link into the app's own routes — they do not themselves mutate the order. Copy is
 * grounded in the 028 corpus (Intuitive Shipping fulfillment/zones/boxes, ReConvert
 * order tag/note + on-hold, Recharge/Loop subscription reorder context, Stamped
 * post-fulfillment review requests) — no invented targets, tones, or vocab.
 */
export const ADMIN_ACTION_ORDER_TEMPLATES: TemplateEntry[] = [
  {
    id: 'ADMA-ORD-01',
    name: 'Fulfillment Readiness Check',
    description: 'Order-details action that surfaces whether an order is ready to fulfill — zone, box, and weight/dimension checks before a shipping label is bought.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'fulfillment', 'shipping', 'intuitive-shipping'],
    spec: {
      type: 'admin.action',
      name: 'Fulfillment Readiness Check',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.render',
        label: 'Check fulfillment readiness',
        title: 'Ready to fulfill?',
        description:
          'Verifies the destination is in a serviceable zone and that every line has the weight and dimensions the box/packing algorithm needs before a rate is bought.',
        fields: [
          { label: 'Destination zone', value: 'US — Domestic Ground', tone: 'success' },
          { label: 'Missing dimensions', value: '1 line item', tone: 'warning' },
          { label: 'Estimated boxes', value: '2 (SmartBoxing)' },
        ],
        badges: [
          { label: 'In serviceable zone', tone: 'success' },
          { label: 'Needs product dimensions', tone: 'warning' },
        ],
        buttons: [
          { label: 'Fix product dimensions', url: '/app/shipping/product-settings' },
          { label: 'Open scenario builder', url: '/app/shipping/scenarios' },
        ],
      },
    },
  },
  {
    id: 'ADMA-ORD-02',
    name: 'Apply Fulfillment Hold',
    description: 'Order-details action to review an order against fulfillment-hold rules (address risk, restricted zone, PO Box) before releasing it to the warehouse.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'fulfillment', 'hold', 'rules'],
    spec: {
      type: 'admin.action',
      name: 'Apply Fulfillment Hold',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.render',
        label: 'Review fulfillment hold',
        title: 'Fulfillment hold review',
        description:
          'Evaluates the order against hold rules — restricted zone, PO Box, and address-risk — so it is held before the warehouse picks it, not recalled after.',
        fields: [
          { label: 'PO Box destination', value: 'No', tone: 'success' },
          { label: 'Restricted zone', value: 'None matched', tone: 'success' },
          { label: 'Address risk', value: 'Medium', tone: 'warning' },
        ],
        badges: [{ label: 'Recommend hold', tone: 'warning' }],
        buttons: [
          { label: 'Place order on hold', tone: 'critical' },
          { label: 'Release to warehouse' },
        ],
        links: [{ label: 'Fulfillment hold rules', url: '/app/orders/hold-rules' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-03',
    name: 'Bulk Fulfill Selected Orders',
    description: 'Order-index selection action that groups the selected orders by destination zone and shipping method for a single bulk fulfillment pass.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'fulfillment', 'bulk', 'selection'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Fulfill Selected Orders',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-index.selection-action.render',
        label: 'Bulk fulfill selected',
        title: 'Bulk fulfill',
        description:
          'Groups the selected orders by zone and method so a single fulfillment pass can buy the right rate for each group and export to fulfillment.',
        table: {
          columns: ['Group', 'Orders', 'Method'],
          rows: [
            ['US Ground', '12', 'Standard Ground'],
            ['US Expedited', '3', '2-Day Air'],
            ['International', '2', 'DDP Priority'],
          ],
        },
        fields: [
          { label: 'Selected orders', value: '17' },
          { label: 'Held / blocked', value: '0', tone: 'success' },
        ],
        buttons: [
          { label: 'Buy labels for all groups' },
          { label: 'Export to fulfillment', url: '/app/fulfillment/export' },
        ],
      },
    },
  },
  {
    id: 'ADMA-ORD-04',
    name: 'Buy Shipping Label',
    description: 'Fulfilled-card action that shows the qualifying rates for the shipment’s zone and box so the label can be bought without leaving the order.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'shipping', 'label', 'fulfillment'],
    spec: {
      type: 'admin.action',
      name: 'Buy Shipping Label',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-fulfilled-card.action.render',
        label: 'Buy shipping label',
        title: 'Buy label',
        description:
          'Shows the qualifying carrier rates for this shipment’s zone and packed box. Rate shopping picks the cheapest that meets the delivery estimate.',
        table: {
          columns: ['Carrier', 'Service', 'Rate', 'Est. days'],
          rows: [
            ['USPS', 'Ground Advantage', '$8.42', '3-5'],
            ['UPS', 'Ground', '$11.10', '2-4'],
            ['UPS', '2nd Day Air', '$24.75', '2'],
          ],
        },
        badges: [{ label: 'Rate shopping on', tone: 'info' }],
        buttons: [{ label: 'Buy cheapest qualifying rate' }],
        links: [{ label: 'Edit box & packing', url: '/app/shipping/boxes' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-05',
    name: 'Tag & Note Order',
    description: 'Order-details action that applies a routing tag and an order note in one step — the same tag/note side-effect an upsell app writes on generated orders.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'tag', 'note', 'reconvert'],
    spec: {
      type: 'admin.action',
      name: 'Tag & Note Order',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.render',
        label: 'Tag & note order',
        title: 'Tag and note',
        description:
          'Applies a routing/segment tag and an internal note in one step, so downstream flows and fulfillment can key off a consistent tag vocabulary.',
        fields: [
          { label: 'Suggested tag', value: 'upsell-accepted', tone: 'info' },
          { label: 'Order source', value: 'Post-purchase offer' },
          { label: 'Existing tags', value: 'vip, repeat-buyer' },
        ],
        badges: [
          { label: 'upsell-accepted', tone: 'info' },
          { label: 'needs-review', tone: 'warning' },
        ],
        buttons: [{ label: 'Apply tag' }, { label: 'Add note' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-06',
    name: 'Bulk Tag Selected Orders',
    description: 'Order-index selection action that previews the tags to apply across the selected orders and how many already carry each tag.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'tag', 'bulk', 'selection'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Tag Selected Orders',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-index.selection-action.render',
        label: 'Bulk tag selected',
        title: 'Bulk tag',
        description:
          'Previews the tag set to apply across the selected orders, showing how many already carry each tag so a bulk apply does not double-tag.',
        table: {
          columns: ['Tag', 'Already tagged', 'Will add'],
          rows: [
            ['priority-ship', '4', '13'],
            ['gift-wrap', '2', '15'],
            ['manual-review', '0', '17'],
          ],
        },
        fields: [{ label: 'Selected orders', value: '17' }],
        buttons: [{ label: 'Apply tags to selection' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-07',
    name: 'Reorder Items for Customer',
    description: 'Order-details action that reviews the lines to duplicate into a new draft order — a manual reorder / win-back for a lapsed or subscription customer.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'reorder', 'draft-order', 'recharge'],
    spec: {
      type: 'admin.action',
      name: 'Reorder Items for Customer',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.render',
        label: 'Reorder these items',
        title: 'Reorder',
        description:
          'Reviews the lines from this order to duplicate into a new draft order — a manual reorder or win-back nudge for a repeat or lapsed subscription customer.',
        table: {
          columns: ['Item', 'Qty', 'In stock'],
          rows: [
            ['Cold Brew Concentrate — 32oz', '2', 'Yes'],
            ['Reusable Steel Filter', '1', 'Yes'],
            ['Seasonal Roast — Sold out', '1', 'No'],
          ],
        },
        fields: [
          { label: 'Customer orders', value: '6' },
          { label: 'Last order', value: '92 days ago', tone: 'warning' },
        ],
        buttons: [
          { label: 'Create draft order from in-stock items', url: '/app/orders/reorder/draft' },
        ],
        links: [{ label: 'View subscription contract', url: '/app/subscriptions/customer' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-08',
    name: 'Convert Draft to Reorder',
    description: 'Draft-order-details action that reviews a draft built as a reorder before it is sent — checks stock, shipping eligibility, and any applied discount.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'draft-order', 'reorder', 'shipping', 'loop-subscriptions'],
    spec: {
      type: 'admin.action',
      name: 'Convert Draft to Reorder',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.draft-order-details.action.render',
        label: 'Review reorder draft',
        title: 'Reorder draft review',
        description:
          'Reviews a draft built as a reorder before it is sent — confirms every line is in stock, the destination is serviceable, and any win-back discount is applied.',
        fields: [
          { label: 'All lines in stock', value: 'Yes', tone: 'success' },
          { label: 'Serviceable destination', value: 'Yes', tone: 'success' },
          { label: 'Win-back discount', value: '10% (WINBACK10)', tone: 'info' },
        ],
        badges: [{ label: 'Ready to invoice', tone: 'success' }],
        buttons: [{ label: 'Send invoice' }, { label: 'Mark as paid' }],
      },
    },
  },
  {
    id: 'ADMA-ORD-09',
    name: 'Bulk Send Review Requests',
    description: 'Order-index selection action that previews the post-fulfillment review-request emails to queue for the selected orders and which are eligible.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'action', 'order', 'reviews', 'fulfillment', 'stamped'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Send Review Requests',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-index.selection-action.render',
        label: 'Queue review requests',
        title: 'Review requests',
        description:
          'Previews the post-fulfillment review-request emails to queue for the selected orders. Only fulfilled orders past the delay window are eligible.',
        table: {
          columns: ['Status', 'Orders', 'Eligible'],
          rows: [
            ['Fulfilled 7+ days ago', '11', 'Yes'],
            ['Fulfilled recently', '4', 'Delay not met'],
            ['Unfulfilled', '2', 'No'],
          ],
        },
        fields: [
          { label: 'Selected orders', value: '17' },
          { label: 'Eligible now', value: '11', tone: 'success' },
        ],
        buttons: [{ label: 'Queue 11 review requests' }],
        links: [{ label: 'Edit request sequence', url: '/app/reviews/requests' }],
      },
    },
  },
];
