/**
 * Real POS behavior-pack tests (2026-04 API). Two invariants under adversarial review:
 *   (1) NEVER report success (success toast / ok:true) for a call whose real method is absent.
 *   (2) NEVER resolve a binding from a shape the real API doesn't expose.
 *
 * `posBehavior.js` reads the ambient `shopify` global; each test installs a tailored mock.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  resolveBinding,
  runAction,
  requireStaffPin,
  numericIdFromGid,
} from '../src/posBehavior.js';

/** Record every toast so we can assert a skipped call NEVER toasts success. */
let toasts;
function installShopify(overrides = {}) {
  toasts = [];
  globalThis.shopify = {
    toast: { show: (m) => toasts.push(String(m)) },
    ...overrides,
  };
  return globalThis.shopify;
}
function toastsInclude(re) {
  return toasts.some((t) => re.test(t));
}
const SUCCESS_TOAST_RE = /applied|saved|added to cart|property added/i;

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.shopify;
  delete globalThis.fetch;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('numericIdFromGid', () => {
  test('extracts numeric id from a ProductVariant GID', () => {
    expect(numericIdFromGid('gid://shopify/ProductVariant/42')).toBe(42);
  });
  test('passes through a bare numeric string / number', () => {
    expect(numericIdFromGid('99')).toBe(99);
    expect(numericIdFromGid(7)).toBe(7);
  });
  test('returns undefined for junk', () => {
    expect(numericIdFromGid('not-a-gid')).toBeUndefined();
    expect(numericIdFromGid(undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runAction — INVARIANT 1: no false success when the real method is absent', () => {
  // Each action, with the shopify global exposing NONE of the cart/print methods.
  const cases = [
    { action: 'APPLY_CART_DISCOUNT', actionConfig: { discountAmount: '10%' } },
    { action: 'APPLY_CODE_DISCOUNT', actionConfig: { discountCode: 'SAVE' } },
    { action: 'APPLY_LINE_DISCOUNT', actionConfig: { discountAmount: '5' } },
    { action: 'SET_CART_NOTE', actionConfig: { note: 'hi' } },
    { action: 'ADD_CART_PROPERTY', actionConfig: { propertyKey: 'k', propertyValue: 'v' } },
    { action: 'ADD_LINE_ITEM', actionConfig: { productVariantId: 'gid://shopify/ProductVariant/1' } },
    { action: 'PRINT', actionConfig: { url: '/print/doc' } },
    { action: 'PRESENT_MODAL' },
  ];

  for (const block of cases) {
    test(`${block.action} → unsupported (never success) when its method is missing`, async () => {
      installShopify(); // only toast.show present — no cart/print/action methods
      const res = await runAction(block);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('unsupported');
      // The load-bearing assertion: NO success toast for a skipped call.
      expect(toastsInclude(SUCCESS_TOAST_RE)).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runAction — invokes the REAL flat 2026-04 methods when present', () => {
  test('APPLY_CART_DISCOUNT calls shopify.applyCartDiscount(Percentage, title, amount)', async () => {
    const applyCartDiscount = vi.fn().mockResolvedValue(undefined);
    installShopify({ applyCartDiscount });
    const res = await runAction({
      action: 'APPLY_CART_DISCOUNT',
      label: 'VIP',
      actionConfig: { discountTitle: 'VIP', discountAmount: '15%' },
    });
    expect(res.ok).toBe(true);
    expect(applyCartDiscount).toHaveBeenCalledWith('Percentage', 'VIP', '15');
    expect(toastsInclude(/applied/i)).toBe(true);
  });

  test('APPLY_CART_DISCOUNT infers FixedAmount for a plain amount', async () => {
    const applyCartDiscount = vi.fn().mockResolvedValue(undefined);
    installShopify({ applyCartDiscount });
    await runAction({ action: 'APPLY_CART_DISCOUNT', label: 'x', actionConfig: { discountAmount: '5.00' } });
    expect(applyCartDiscount).toHaveBeenCalledWith('FixedAmount', 'x', '5.00');
  });

  test('APPLY_CODE_DISCOUNT calls shopify.addCartCodeDiscount(code)', async () => {
    const addCartCodeDiscount = vi.fn().mockResolvedValue(undefined);
    installShopify({ addCartCodeDiscount });
    const res = await runAction({ action: 'APPLY_CODE_DISCOUNT', actionConfig: { discountCode: 'WELCOME' } });
    expect(res.ok).toBe(true);
    expect(addCartCodeDiscount).toHaveBeenCalledWith('WELCOME');
  });

  test('SET_CART_NOTE calls shopify.bulkCartUpdate({ note })', async () => {
    const bulkCartUpdate = vi.fn().mockResolvedValue({});
    installShopify({ bulkCartUpdate });
    const res = await runAction({ action: 'SET_CART_NOTE', actionConfig: { note: 'gift wrap' } });
    expect(res.ok).toBe(true);
    expect(bulkCartUpdate).toHaveBeenCalledWith({ note: 'gift wrap' });
  });

  test('ADD_CART_PROPERTY on a line-item context calls addLineItemProperties(uuid, props)', async () => {
    const addLineItemProperties = vi.fn().mockResolvedValue(undefined);
    installShopify({ addLineItemProperties, cartLineItem: { uuid: 'li-1' } });
    const res = await runAction({
      action: 'ADD_CART_PROPERTY',
      actionConfig: { propertyKey: 'engrave', propertyValue: 'Happy Bday' },
    });
    expect(res.ok).toBe(true);
    expect(addLineItemProperties).toHaveBeenCalledWith('li-1', { engrave: 'Happy Bday' });
  });

  test('ADD_CART_PROPERTY with no line item falls back to addCartProperties(props)', async () => {
    const addCartProperties = vi.fn().mockResolvedValue(undefined);
    installShopify({ addCartProperties });
    const res = await runAction({
      action: 'ADD_CART_PROPERTY',
      actionConfig: { propertyKey: 'giftMessage', propertyValue: 'xoxo' },
    });
    expect(res.ok).toBe(true);
    expect(addCartProperties).toHaveBeenCalledWith({ giftMessage: 'xoxo' });
  });

  test('APPLY_LINE_DISCOUNT calls bulkSetLineItemDiscounts with the line uuid', async () => {
    const bulkSetLineItemDiscounts = vi.fn().mockResolvedValue(undefined);
    installShopify({ bulkSetLineItemDiscounts, cartLineItem: { uuid: 'li-9' } });
    const res = await runAction({
      action: 'APPLY_LINE_DISCOUNT',
      label: 'Damage',
      actionConfig: { discountAmount: '20%' },
    });
    expect(res.ok).toBe(true);
    expect(bulkSetLineItemDiscounts).toHaveBeenCalledWith([
      { lineItemUuid: 'li-9', type: 'Percentage', title: 'Damage', amount: '20' },
    ]);
  });

  test('APPLY_LINE_DISCOUNT without a line-item context reports unsupported (no false success)', async () => {
    const bulkSetLineItemDiscounts = vi.fn();
    installShopify({ bulkSetLineItemDiscounts }); // method present, but no cartLineItem
    const res = await runAction({ action: 'APPLY_LINE_DISCOUNT', actionConfig: { discountAmount: '20%' } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unsupported');
    expect(bulkSetLineItemDiscounts).not.toHaveBeenCalled();
    expect(toastsInclude(SUCCESS_TOAST_RE)).toBe(false);
  });

  test('ADD_LINE_ITEM extracts the NUMERIC variant id and calls addLineItem(variantId, 1)', async () => {
    const addLineItem = vi.fn().mockResolvedValue('new-uuid');
    installShopify({ addLineItem });
    const res = await runAction({
      action: 'ADD_LINE_ITEM',
      actionConfig: { productVariantId: 'gid://shopify/ProductVariant/12345' },
    });
    expect(res.ok).toBe(true);
    expect(addLineItem).toHaveBeenCalledWith(12345, 1); // numeric, not the GID string
    expect(toastsInclude(/added to cart/i)).toBe(true);
  });

  test('ADD_LINE_ITEM treats an empty-string return (oversell guard dismissed) as NOT success', async () => {
    const addLineItem = vi.fn().mockResolvedValue(''); // user dismissed the oversell modal
    installShopify({ addLineItem });
    const res = await runAction({
      action: 'ADD_LINE_ITEM',
      actionConfig: { productVariantId: 'gid://shopify/ProductVariant/1' },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('cancelled');
    expect(toastsInclude(/added to cart/i)).toBe(false);
  });

  test('PRINT calls the FLAT shopify.print(src)', async () => {
    const print = vi.fn().mockResolvedValue(undefined);
    installShopify({ print });
    const res = await runAction({ action: 'PRINT', actionConfig: { url: '/print/receipt' } });
    expect(res.ok).toBe(true);
    expect(print).toHaveBeenCalledWith('/print/receipt');
  });

  test('PRESENT_MODAL calls shopify.action.presentModal()', async () => {
    const presentModal = vi.fn();
    installShopify({ action: { presentModal } });
    const res = await runAction({ action: 'PRESENT_MODAL' });
    expect(res.ok).toBe(true);
    expect(presentModal).toHaveBeenCalledOnce();
  });

  test('a thrown real method reports failure honestly (never success)', async () => {
    const applyCartDiscount = vi.fn().mockRejectedValue(new Error('POS said no'));
    installShopify({ applyCartDiscount });
    const res = await runAction({ action: 'APPLY_CART_DISCOUNT', label: 'x', actionConfig: { discountAmount: '10%' } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('error');
    expect(toastsInclude(SUCCESS_TOAST_RE)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resolveBinding — INVARIANT 2: reads only shapes the real API exposes', () => {
  test('cart.subtotal / cart.total / cart.taxTotal read cart.current.value', () => {
    installShopify({
      cart: { current: { value: { subtotal: '$40.00', grandTotal: '$45.20', taxTotal: '$5.20' } } },
    });
    expect(resolveBinding('cart.subtotal')).toBe('$40.00');
    expect(resolveBinding('cart.total')).toBe('$45.20'); // grandTotal, not a non-existent `total`
    expect(resolveBinding('cart.taxTotal')).toBe('$5.20');
  });

  test('cart.itemCount sums lineItems[].quantity', () => {
    installShopify({ cart: { current: { value: { lineItems: [{ quantity: 2 }, { quantity: 3 }] } } } });
    expect(resolveBinding('cart.itemCount')).toBe('5');
  });

  test('lineItem.* reads shopify.cartLineItem (the object itself, not .current)', () => {
    installShopify({ cartLineItem: { title: 'Blue Tee', quantity: 2 } });
    expect(resolveBinding('lineItem.title')).toBe('Blue Tee');
    expect(resolveBinding('lineItem.quantity')).toBe('2');
  });

  test('order.name reads shopify.order.name', () => {
    installShopify({ order: { id: 1, name: '#1042', customerId: 7 } });
    expect(resolveBinding('order.name')).toBe('#1042');
  });

  test('session.* reads currentSession IDs/currency (no name fields exist)', () => {
    installShopify({
      session: { currentSession: { locationId: 55, staffMemberId: 88, currency: 'USD' } },
    });
    expect(resolveBinding('session.locationId')).toBe('55');
    expect(resolveBinding('session.staffMemberId')).toBe('88');
    expect(resolveBinding('session.currency')).toBe('USD');
  });

  test('loyalty.* is app-owned → undefined inline (resolved via app proxy in the modal)', () => {
    installShopify({});
    expect(resolveBinding('loyalty.points')).toBeUndefined();
    expect(resolveBinding('loyalty.tier')).toBeUndefined();
  });

  test('pruned/removed bindings never resolve to a fabricated literal', () => {
    // These were dropped from POS_DATA_BINDINGS; even if a stale config sends one, it must
    // NOT resolve (so the block falls back to its literal label — never a fake live value).
    installShopify({
      customer: { id: 1 },
      order: { id: 2, name: '#2' },
      product: { id: 3, variantId: 4 },
      session: { currentSession: { locationId: 5, staffMemberId: 6 } },
    });
    for (const b of [
      'customer.displayName',
      'customer.email',
      'customer.ordersCount',
      'customer.amountSpent',
      'order.financialStatus',
      'order.fulfillmentStatus',
      'order.totalPrice',
      'product.title',
      'product.totalInventory',
      'session.staffMemberName',
      'session.locationName',
      'cart.note',
    ]) {
      expect(resolveBinding(b)).toBeUndefined();
    }
  });

  test('undefined binding → undefined (block uses its literal label)', () => {
    installShopify({});
    expect(resolveBinding(undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('requireStaffPin — real PinPad + server-side verification, fails closed', () => {
  test('PinPad API absent → blocked (unsupported), never allowed', async () => {
    installShopify({}); // no pinPad
    const res = await requireStaffPin({ staffPin: { required: true }, appProxyPath: '/apps/superapp/pos' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unsupported');
  });

  test('no app-proxy verify endpoint → blocked (unverifiable), never trusts a client PIN', async () => {
    installShopify({ pinPad: { showPinPad: vi.fn() } });
    const res = await requireStaffPin({ staffPin: { required: true } }); // no appProxyPath
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unverifiable');
  });

  test('server verifies the PIN → accept, then onDismissed fires → ok:true', async () => {
    // Real contract: onSubmit returns 'accept', POS dismisses the modal and fires onDismissed.
    const showPinPad = vi.fn(async (cb, opts) => {
      const verdict = await cb([1, 2, 3, 4]);
      expect(verdict.result).toBe('accept');
      opts.onDismissed({ completed: true, pin: [1, 2, 3, 4] }); // POS dismisses after accept
    });
    installShopify({
      pinPad: { showPinPad },
      session: { getSessionToken: vi.fn().mockResolvedValue('tok') },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: true }) });

    const res = await requireStaffPin({
      staffPin: { required: true, role: 'manager' },
      appProxyPath: '/apps/superapp/pos',
    });
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/apps/superapp/pos/verify-pin',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('server rejects the PIN → pad shows reject; dismissal settles as blocked', async () => {
    const showPinPad = vi.fn(async (cb, opts) => {
      const verdict = await cb([9, 9, 9, 9]);
      expect(verdict.result).toBe('reject'); // wrong PIN keeps the pad open
      opts.onDismissed({ completed: false }); // staffer gives up
    });
    installShopify({
      pinPad: { showPinPad },
      session: { getSessionToken: vi.fn().mockResolvedValue('tok') },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: false }) });

    const res = await requireStaffPin({ staffPin: { required: true }, appProxyPath: '/apps/superapp/pos' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('blocked');
  });

  test('a PIN-gated action is blocked end-to-end when verification fails', async () => {
    const applyCartDiscount = vi.fn();
    const showPinPad = vi.fn(async (cb, opts) => {
      await cb([0, 0, 0, 0]);
      opts.onDismissed({ completed: false });
    });
    installShopify({
      applyCartDiscount,
      pinPad: { showPinPad },
      session: { getSessionToken: vi.fn().mockResolvedValue('tok') },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: false }) });

    const res = await runAction({
      action: 'APPLY_CART_DISCOUNT',
      label: 'Void',
      staffPin: { required: true },
      appProxyPath: '/apps/superapp/pos',
      actionConfig: { discountAmount: '100%' },
    });
    expect(res.ok).toBe(false);
    expect(applyCartDiscount).not.toHaveBeenCalled(); // gate blocked the action
    expect(toastsInclude(SUCCESS_TOAST_RE)).toBe(false);
  });
});
