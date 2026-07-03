/**
 * Config-driven POS behavior pack.
 *
 * The shipped generic POS block reads each module's PUBLISHED config from
 * `/api/pos/config` and both RENDERS (bound `binding` / literal `label`) and ACTS
 * (`action`) from it — no per-module code. This module maps a declared `action` /
 * `binding` onto the contextual POS API available on the current surface (Cart /
 * Customer / Order / Product / Cart Line Item) or the app proxy.
 *
 * Every operation degrades gracefully: an action whose required API is unavailable
 * on the surface, or that throws, surfaces a Toast and returns — it never crashes
 * the POS flow. Sensitive actions can be gated behind a staff PIN (PinPad API).
 */

/** Show a POS Toast when the API is present (no-op otherwise). */
function toast(message) {
  try {
    shopify?.toast?.show?.(message);
  } catch {
    /* Toast unavailable on this surface — ignore. */
  }
}

/**
 * Resolve a declared `binding` to a display string using whatever contextual API
 * the current surface exposes. Returns `undefined` when it can't be resolved, so
 * callers fall back to the block's literal `label`.
 *
 * @param {string|undefined} binding - one of POS_DATA_BINDINGS
 * @returns {string|undefined}
 */
export function resolveBinding(binding) {
  if (!binding) return undefined;
  try {
    const api = shopify ?? {};
    const cart = api.cart?.current?.value ?? api.cart?.current ?? {};
    const customer = api.customer?.current?.value ?? api.customer?.current ?? {};
    const order = api.order?.current?.value ?? api.order?.current ?? {};
    const product = api.product?.current?.value ?? api.product?.current ?? {};
    const line = api.lineItem?.current?.value ?? api.lineItem?.current ?? {};
    const session = api.session?.currentSession ?? {};

    switch (binding) {
      case 'cart.subtotal': return fmt(cart.subtotalPrice ?? cart.subtotal);
      case 'cart.total': return fmt(cart.totalPrice ?? cart.total);
      case 'cart.itemCount': return str(cart.lineItems?.length ?? cart.itemCount);
      case 'cart.note': return str(cart.note);
      case 'customer.displayName': return str(customer.displayName ?? customer.firstName);
      case 'customer.email': return str(customer.email);
      case 'customer.ordersCount': return str(customer.ordersCount ?? customer.numberOfOrders);
      case 'customer.amountSpent': return fmt(customer.amountSpent ?? customer.totalSpent);
      case 'order.name': return str(order.name);
      case 'order.financialStatus': return str(order.financialStatus);
      case 'order.fulfillmentStatus': return str(order.fulfillmentStatus);
      case 'order.totalPrice': return fmt(order.totalPrice);
      case 'product.title': return str(product.title);
      case 'product.totalInventory': return str(product.totalInventory);
      case 'lineItem.title': return str(line.title);
      case 'lineItem.quantity': return str(line.quantity);
      case 'session.staffMemberName': return str(session.staffMemberName ?? session.userName);
      case 'session.locationName': return str(session.locationName);
      // loyalty.* is app-owned; the app-proxy fetch happens in the modal, not inline.
      case 'loyalty.points':
      case 'loyalty.tier':
        return undefined;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function str(v) {
  return v === undefined || v === null || v === '' ? undefined : String(v);
}
function fmt(v) {
  const s = str(v);
  return s === undefined ? undefined : s;
}

/**
 * Perform the module's declared `action`. Optionally gated by a staff PIN. Returns
 * a `{ ok, message }` result; the caller decides how to present it. Never throws.
 *
 * @param {object} block - a PosBlockConfig from /api/pos/config
 */
export async function runAction(block) {
  const action = block?.action;
  if (!action || action === 'NONE') return { ok: true };

  // Staff-PIN gate for sensitive operations (PinPad API).
  if (block.staffPin?.required) {
    const passed = await requireStaffPin(block.staffPin);
    if (!passed) {
      toast('PIN verification required');
      return { ok: false, message: 'pin_required' };
    }
  }

  const cfg = block.actionConfig ?? {};
  try {
    const api = shopify ?? {};
    switch (action) {
      case 'PRESENT_MODAL':
        await api.action?.presentModal?.();
        return { ok: true };

      case 'APPLY_CART_DISCOUNT': {
        const kind = cfg.discountAmount && cfg.discountAmount.includes('%') ? 'Percentage' : cfg.discountKind ?? 'Percentage';
        await api.cart?.applyCartDiscount?.(kind, cfg.discountTitle ?? block.label, stripPct(cfg.discountAmount));
        toast('Discount applied');
        return { ok: true };
      }

      case 'APPLY_CODE_DISCOUNT':
        await api.cart?.applyCartDiscount?.('Code', cfg.discountCode ?? cfg.discountTitle ?? block.label);
        toast('Code applied');
        return { ok: true };

      case 'APPLY_LINE_DISCOUNT': {
        const uuid = api.lineItem?.current?.value?.uuid ?? api.lineItem?.current?.uuid;
        if (uuid && api.cart?.bulkSetLineItemDiscounts) {
          await api.cart.bulkSetLineItemDiscounts([
            { lineItemUuid: uuid, type: 'Percentage', title: cfg.discountTitle ?? block.label, amount: stripPct(cfg.discountAmount) },
          ]);
          toast('Line discount applied');
          return { ok: true };
        }
        return unsupported('line item');
      }

      case 'SET_CART_NOTE':
        await api.cart?.bulkCartUpdate?.({ note: cfg.note ?? '' });
        toast('Note saved');
        return { ok: true };

      case 'ADD_CART_PROPERTY': {
        const uuid = api.lineItem?.current?.value?.uuid ?? api.lineItem?.current?.uuid;
        if (uuid && cfg.propertyKey && api.cart?.addLineItemProperties) {
          await api.cart.addLineItemProperties(uuid, { [cfg.propertyKey]: cfg.propertyValue ?? '' });
          toast('Property added');
          return { ok: true };
        }
        return unsupported('cart property');
      }

      case 'ADD_LINE_ITEM':
        if (cfg.productVariantId && api.cart?.addLineItem) {
          await api.cart.addLineItem(cfg.productVariantId, 1);
          toast('Added to cart');
          return { ok: true };
        }
        return unsupported('add line item');

      case 'LOYALTY_READ':
        return await appProxy(block.appProxyPath, 'GET');

      case 'LOYALTY_WRITE':
      case 'APP_PROXY_POST':
        return await appProxy(block.appProxyPath, 'POST', appProxyBody(block));

      case 'RECEIPT_CONTENT':
        // Receipt content is rendered by Receipt.jsx, not an imperative action.
        return { ok: true };

      case 'PRINT':
        if (cfg.url && api.print?.print) {
          await api.print.print(cfg.url);
          return { ok: true };
        }
        return unsupported('print');

      case 'OPEN_URL':
        if (cfg.url && api.navigation?.navigate) {
          await api.navigation.navigate(cfg.url);
          return { ok: true };
        }
        return unsupported('navigation');

      default:
        return { ok: true };
    }
  } catch (err) {
    toast('Action failed');
    return { ok: false, message: String(err) };
  }
}

function stripPct(v) {
  return typeof v === 'string' ? v.replace('%', '').trim() : v;
}

function unsupported(what) {
  toast(`Not available here (${what})`);
  return { ok: false, message: `unsupported:${what}` };
}

/**
 * Require a staff PIN via the PinPad API before a sensitive action runs. When the
 * PinPad API isn't present on the surface, we fail closed for gated actions.
 */
async function requireStaffPin(staffPin) {
  try {
    const pinpad = shopify?.pinPad ?? shopify?.pinpad;
    if (!pinpad?.show) return false;
    const result = await pinpad.show({ reason: staffPin.reason, role: staffPin.role });
    return Boolean(result?.verified ?? result?.success ?? result);
  } catch {
    return false;
  }
}

/**
 * Read/write the app-owned loyalty ledger (or any app-proxy endpoint) using the POS
 * session token (App Authentication). `path` is relative to the app.
 */
async function appProxy(path, method, body) {
  if (!path) return unsupported('app proxy path');
  try {
    const token = await shopify?.session?.getSessionToken?.();
    const res = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    toast('Sync failed');
    return { ok: false, message: String(err) };
  }
}

/** Build the app-proxy body from the current surface context (best-effort). */
function appProxyBody(block) {
  const api = shopify ?? {};
  return {
    moduleId: block.moduleId,
    action: block.action,
    customerId: api.customer?.current?.value?.id ?? api.customer?.current?.id,
    orderId: api.order?.current?.value?.id ?? api.order?.current?.id,
    actionConfig: block.actionConfig ?? {},
  };
}
