import type { TemplateEntry } from '../types.js';

/**
 * pos.extension templates — staff-run counter workflows (Phase 6 vocab-hardening).
 * Complements the POS corpus (home loyalty, customer/cart, product/order-post) with
 * two staff-assisted actions: a loyalty check-in on the customer surface and a
 * staff-assisted exchange on the exchange-post surface.
 *
 * Vocab is authored strictly against the pos.extension config member (recipe.ts):
 * `{ target: POS_TARGETS, label, blockKind?, presentation?, action?, binding?,
 * staffPin?, actionConfig?, appProxyPath?, observe? }`. Both entries run app-owned
 * writes, so they resolve through `appProxyPath` (verified by the app proxy) and gate
 * the write behind a staff PIN.
 *
 * HONESTY: LOYALTY_WRITE / APP_PROXY_POST are app-proxy actions — until the app proxy
 * serves the named route they report `unsupported` (never a fake success), matching
 * the shipped generic POS block's degrade-gracefully contract. `requires` is left `[]`
 * (the barrel modernize pass injects the POS data-surface flags).
 */
export const POS_CHECKIN_EXCHANGE_TEMPLATES: TemplateEntry[] = [
  // POS-CHECK-01 — loyalty check-in from the customer details surface: staff tap the
  // action to accrue a visit/check-in to the member's loyalty ledger (PIN-gated).
  {
    id: 'POS-CHECK-01',
    name: 'Loyalty Check-In Action',
    description:
      'A POS customer-details action that lets staff check a member in — accruing a visit to the loyalty ledger via the app proxy — gated behind a staff PIN to prevent accidental writes.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tier: 'exemplar',
    tags: ['pos', 'loyalty', 'check-in', 'staff', 'customer', 'points'],
    spec: {
      type: 'pos.extension',
      name: 'Loyalty Check-In Action',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.customer-details.action.render',
        label: 'Check in member',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'LOYALTY_WRITE',
        binding: 'loyalty.points',
        appProxyPath: '/apps/loyalty/pos/check-in',
        staffPin: {
          required: true,
          reason: 'Confirm staff before writing to the loyalty ledger',
          role: 'cashier',
        },
      },
    },
  },

  // POS-CHECK-02 — staff-assisted exchange on the exchange-post surface: after an
  // exchange, POST the exchange context to the app so it logs/reconciles it (PIN-gated).
  {
    id: 'POS-CHECK-02',
    name: 'Staff-Assisted Exchange Log',
    description:
      'A POS exchange-post action that lets staff record a completed in-store exchange — posting the exchange context to the app for reconciliation and reporting — behind a manager PIN.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tier: 'standard',
    tags: ['pos', 'exchange', 'returns', 'staff', 'reconcile', 'app-proxy'],
    spec: {
      type: 'pos.extension',
      name: 'Staff-Assisted Exchange Log',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.exchange.post.action.render',
        label: 'Log exchange',
        blockKind: 'action',
        presentation: 'MENUITEM_ACTION',
        action: 'APP_PROXY_POST',
        appProxyPath: '/apps/pos/exchange/log',
        staffPin: {
          required: true,
          reason: 'Manager approval required to record an exchange',
          role: 'manager',
        },
      },
    },
  },
];
