import type { TemplateEntry } from '../types.js';

/**
 * POS product / order / purchase-post templates (unit: pos-product-order-post).
 *
 * Surface scope: the `pos.product-details`, `pos.order-details`, and
 * `pos.purchase.post` render families (block + menu-item/action pairs), plus the
 * two receipt blocks (`pos.receipt-header` / `pos.receipt-footer`) and the two
 * background `*.event.observe` targets that fire on this flow
 * (`pos.transaction-complete`, `pos.cart-update`).
 *
 * Every `target` here is a member of POS_RENDER_TARGETS / POS_EVENT_TARGETS; every
 * `action` / `binding` / `blockKind` / `presentation` / `observe.event` is from the
 * current POS enums in allowed-values.ts. Nothing invented.
 *
 * Honesty notes:
 *  - `loyalty.points` / `loyalty.tier` bindings and LOYALTY_READ / LOYALTY_WRITE /
 *    APP_PROXY_POST actions resolve through the app proxy (`appProxyPath`). Until the
 *    merchant's loyalty proxy is wired they degrade to the literal `label` (bindings)
 *    or report `unsupported` (actions) — never a fake success. This mirrors how the
 *    corpus loyalty apps (Smile, Stamped, Rivo, Yotpo, Growave, Bon) actually project
 *    an externally-hosted points ledger onto POS.
 *  - `observe` modules are UI-less; they forward the POS event context to `forwardTo`
 *    (an app-proxy path). No render, no block on the sale flow.
 *
 * Grounded in the corpus loyalty/reviews records (smile-io, stamped, rivo,
 * yotpo-reviews, judge-me, reconvert, bon-loyalty, growave): in-store points earn on
 * transaction-complete, POS amount/percentage redemption, review-request capture on
 * fulfilled POS orders, and receipt-printed loyalty/referral messaging.
 */
export const POS_PRODUCT_ORDER_POST_TEMPLATES: TemplateEntry[] = [
  // ── pos.product-details ───────────────────────────────────────────────────
  {
    id: 'POS-PROD-03',
    tier: 'standard',
    name: 'POS Add Recommended Add-On',
    description: 'Menu-item action on the POS product-details screen that adds a paired accessory line item to the cart.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'upsell', 'cross-sell', 'product', 'rebuy'],
    spec: {
      type: 'pos.extension',
      name: 'POS Add Recommended Add-On',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.product-details.action.menu-item.render',
        label: 'Add recommended add-on',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'ADD_LINE_ITEM',
        actionConfig: {
          productVariantId: 'gid://shopify/ProductVariant/40000000000001',
        },
      },
    },
  },
  {
    id: 'POS-PROD-04',
    tier: 'floor',
    name: 'POS Product Line Discount',
    description: 'Product-details action that applies a fixed percentage line discount to the selected item, PIN-gated for staff.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'product', 'staff-pin', 'bold-discounts'],
    spec: {
      type: 'pos.extension',
      name: 'POS Product Line Discount',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.product-details.action.render',
        label: 'Apply item discount',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'APPLY_LINE_DISCOUNT',
        actionConfig: {
          discountTitle: 'Staff item discount',
          discountKind: 'Percentage',
          discountAmount: '10',
        },
        staffPin: {
          required: true,
          reason: 'Manager approval for item discount',
        },
      },
    },
  },
  {
    id: 'POS-PROD-05',
    tier: 'standard',
    name: 'POS Tag Product Property',
    description: 'Product-details action that stamps a gift-wrap property onto the added line item for fulfillment staff.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'product', 'property', 'gift', 'ops'],
    spec: {
      type: 'pos.extension',
      name: 'POS Tag Product Property',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.product-details.action.render',
        label: 'Mark as gift wrap',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'ADD_CART_PROPERTY',
        actionConfig: {
          propertyKey: 'gift_wrap',
          propertyValue: 'yes',
        },
      },
    },
  },
  // ── pos.order-details ─────────────────────────────────────────────────────
  {
    id: 'POS-PROD-07',
    tier: 'floor',
    name: 'POS Order Number Reference',
    description: 'Displays the live order name on the POS order-details block so staff can reference it during service.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'order', 'reference', 'ops'],
    spec: {
      type: 'pos.extension',
      name: 'POS Order Number Reference',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.order-details.block.render',
        label: 'Order',
        blockKind: 'block',
        presentation: 'STANDALONE',
        action: 'NONE',
        binding: 'order.name',
      },
    },
  },
  {
    id: 'POS-PROD-08',
    tier: 'floor',
    name: 'POS Award Bonus Points',
    description: 'Order-details action that writes a bonus loyalty-ledger entry for the customer, PIN-gated to prevent abuse.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'points', 'order', 'staff-pin', 'rivo'],
    spec: {
      type: 'pos.extension',
      name: 'POS Award Bonus Points',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.order-details.action.render',
        label: 'Award bonus points',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'LOYALTY_WRITE',
        appProxyPath: '/apps/loyalty/pos/accrue',
        staffPin: {
          required: true,
          reason: 'Staff approval to award loyalty points',
          role: 'manager',
        },
      },
    },
  },
  {
    id: 'POS-PROD-10',
    tier: 'floor',
    name: 'POS Order Fulfillment Note',
    description: 'Order-details action that adds a staff handoff note to the cart for the fulfillment team.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'order', 'note', 'fulfillment', 'ops'],
    spec: {
      type: 'pos.extension',
      name: 'POS Order Fulfillment Note',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.order-details.action.render',
        label: 'Add fulfillment note',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'SET_CART_NOTE',
        actionConfig: {
          note: 'Ship to customer — collected in-store, pending delivery.',
        },
      },
    },
  },
  // ── pos.purchase.post ─────────────────────────────────────────────────────
  {
    id: 'POS-PROD-14',
    tier: 'floor',
    name: 'POS Post-Sale Redeem Reward',
    description: 'Purchase-post action that applies a fixed-amount loyalty redemption discount to the cart, PIN-gated.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'redeem', 'discount', 'post-purchase', 'stamped'],
    spec: {
      type: 'pos.extension',
      name: 'POS Post-Sale Redeem Reward',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.purchase.post.action.render',
        label: 'Redeem points reward',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'APPLY_CART_DISCOUNT',
        actionConfig: {
          discountTitle: 'Loyalty reward',
          discountKind: 'FixedAmount',
          discountAmount: '5.00',
        },
        staffPin: {
          required: true,
          reason: 'Confirm loyalty redemption',
        },
      },
    },
  },
  {
    id: 'POS-PROD-16',
    tier: 'floor',
    name: 'POS Post-Sale Cart Total Recap',
    description: 'Shows the sale grand total on the POS purchase-post block as a quick confirmation for staff.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'order', 'total', 'post-purchase', 'ops'],
    spec: {
      type: 'pos.extension',
      name: 'POS Post-Sale Cart Total Recap',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.purchase.post.block.render',
        label: 'Sale total',
        blockKind: 'block',
        presentation: 'STANDALONE',
        action: 'NONE',
        binding: 'cart.total',
      },
    },
  },
  // ── receipt header / footer ───────────────────────────────────────────────
  {
    id: 'POS-PROD-17',
    tier: 'standard',
    name: 'POS Receipt Loyalty Header',
    description: 'Prints a loyalty points-balance line in the POS receipt header for the customer to keep.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'receipt', 'loyalty', 'points', 'smile', 'stamped'],
    spec: {
      type: 'pos.extension',
      name: 'POS Receipt Loyalty Header',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.receipt-header.block.render',
        label: 'Your rewards',
        blockKind: 'receipt',
        presentation: 'STANDALONE',
        action: 'RECEIPT_CONTENT',
        binding: 'loyalty.points',
        appProxyPath: '/apps/loyalty/pos/receipt',
        actionConfig: {
          receiptText: 'Thanks for shopping with us — your points balance is printed below.',
        },
      },
    },
  },
  {
    id: 'POS-PROD-18',
    tier: 'standard',
    name: 'POS Receipt Review Invite Footer',
    description: 'Prints a review-request invitation with a short link in the POS receipt footer.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'receipt', 'reviews', 'footer', 'judge-me', 'yotpo'],
    spec: {
      type: 'pos.extension',
      name: 'POS Receipt Review Invite Footer',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.receipt-footer.block.render',
        label: 'Leave a review',
        blockKind: 'receipt',
        presentation: 'STANDALONE',
        action: 'RECEIPT_CONTENT',
        actionConfig: {
          receiptText: 'Loved your visit? Scan the code or visit our reviews page to share your feedback.',
        },
      },
    },
  },
  {
    id: 'POS-PROD-19',
    tier: 'floor',
    name: 'POS Receipt Referral Footer',
    description: 'Prints a refer-a-friend message and reward reminder in the POS receipt footer.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'receipt', 'referral', 'footer', 'loyalty', 'rivo'],
    spec: {
      type: 'pos.extension',
      name: 'POS Receipt Referral Footer',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.receipt-footer.block.render',
        label: 'Refer a friend',
        blockKind: 'receipt',
        presentation: 'STANDALONE',
        action: 'RECEIPT_CONTENT',
        actionConfig: {
          receiptText: 'Refer a friend and you both earn rewards on their first purchase.',
        },
      },
    },
  },
  // ── event.observe (UI-less background handlers) ───────────────────────────
  {
    id: 'POS-PROD-20',
    tier: 'standard',
    name: 'POS Transaction Loyalty Accrual',
    description: 'Background observer that forwards each completed POS sale to the loyalty proxy to accrue points automatically.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'accrual', 'observe', 'transaction', 'smile'],
    spec: {
      type: 'pos.extension',
      name: 'POS Transaction Loyalty Accrual',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.transaction-complete.event.observe',
        label: 'Accrue loyalty on sale',
        blockKind: 'observer',
        presentation: 'STANDALONE',
        observe: {
          event: 'transaction-complete',
          forwardTo: '/apps/loyalty/pos/observe/transaction',
        },
      },
    },
  },
  {
    id: 'POS-PROD-21',
    tier: 'floor',
    name: 'POS Transaction Review Trigger',
    description: 'Background observer that forwards completed POS sales to the review-request pipeline so a review invite is scheduled.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'reviews', 'observe', 'transaction', 'request', 'stamped'],
    spec: {
      type: 'pos.extension',
      name: 'POS Transaction Review Trigger',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.transaction-complete.event.observe',
        label: 'Trigger review request',
        blockKind: 'observer',
        presentation: 'STANDALONE',
        observe: {
          event: 'transaction-complete',
          forwardTo: '/apps/reviews/pos/observe/transaction',
        },
      },
    },
  },
  {
    id: 'POS-PROD-22',
    tier: 'floor',
    name: 'POS Cart Upsell Watcher',
    description: 'Background observer that forwards POS cart changes to the upsell service so relevant add-on suggestions can be surfaced.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'upsell', 'observe', 'cart', 'cross-sell', 'rebuy'],
    spec: {
      type: 'pos.extension',
      name: 'POS Cart Upsell Watcher',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.cart-update.event.observe',
        label: 'Watch cart for upsells',
        blockKind: 'observer',
        presentation: 'STANDALONE',
        observe: {
          event: 'cart-update',
          forwardTo: '/apps/upsell/pos/observe/cart',
        },
      },
    },
  },
];
