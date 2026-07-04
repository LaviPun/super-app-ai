/**
 * Config-driven POS behavior pack — grounded in the REAL 2026-04 POS UI Extensions API.
 *
 * The shipped generic POS block reads each module's PUBLISHED config from
 * `/api/pos/config` and both RENDERS (bound `binding` / literal `label`) and ACTS
 * (`action`) from it — no per-module code. This module maps a declared `action` /
 * `binding` onto the real POS UI Extensions API surface available on the current
 * target (Cart / Cart Line Item / Customer / Order / Product / Session) or the app proxy.
 *
 * TWO ABSOLUTE INVARIANTS (adversarial-review mandate):
 *   1. NEVER report success for a call that no-ops. Every action gates on
 *      `typeof shopify.<method> === 'function'`; when the method is absent the action
 *      returns `{ ok:false, reason:'unsupported' }` and shows an unsupported toast — it
 *      NEVER toasts success or returns `{ ok:true }` for a skipped call.
 *   2. NEVER offer a binding/action a template cannot fulfil. `resolveBinding` only reads
 *      fields the real API genuinely exposes; anything POS does not expose natively is
 *      resolved via the app proxy (loyalty.*) or is absent from the enum entirely
 *      (see allowed-values.ts POS_ACTIONS / POS_DATA_BINDINGS).
 *
 * Real 2026-04 API shapes used here (verified via Shopify dev-MCP, api_version 2026-04):
 *   - Cart API (FLAT on `shopify`): applyCartDiscount(type,title,amount?),
 *     addCartCodeDiscount(code), addLineItem(variantId:number,qty)→uuid,
 *     bulkCartUpdate(cartState), addLineItemProperties(uuid,props),
 *     addCartProperties(props), bulkSetLineItemDiscounts(SetLineItemDiscountInput[]).
 *     Cart read: `shopify.cart.current.value` → { subtotal, grandTotal, taxTotal,
 *     lineItems, properties, ... } (currency strings; NO `note` on read).
 *   - Cart Line Item API: `shopify.cartLineItem` (a LineItem object, NOT `.current`) →
 *     { uuid, title, quantity, price, productId, variantId, properties, ... }.
 *   - Order API: `shopify.order` → { id:number, name:string, customerId?:number }.
 *   - Customer API: `shopify.customer` → { id:number }.
 *   - Product API: `shopify.product` → { id:number, variantId:number }.
 *   - Session API: `shopify.session.currentSession` → { shopId, shopDomain, currency,
 *     userId, locationId, staffMemberId, posVersion }; `shopify.session.getSessionToken()`.
 *   - PinPad API: `shopify.pinPad.showPinPad(callback, options)`; the callback receives the
 *     entered digits and returns { result:'accept'|'reject', errorMessage? }. NO built-in
 *     verification — the PIN must be verified server-side (here: the app proxy).
 *   - Print API: `shopify.print(src)` (FLAT). Toast API: `shopify.toast.show(msg)`.
 *   - Action API: `shopify.action.presentModal()`.
 */

/**
 * The ambient `shopify` global, typed as `any` for the IMPERATIVE call sites.
 *
 * The POS `shopify` global is a union across targets (Cart methods exist only on cart
 * targets, `print` only where the Print API is available, etc.), so the static type is
 * deliberately narrow. Every imperative use here is guarded at RUNTIME by `hasMethod(...)`
 * — the real safety gate — so we intentionally widen to `any` at the call site rather than
 * assert a shape the surface may not have. Reads in `resolveBinding` stay defensively
 * optional-chained and don't need this.
 * @returns {any}
 */
function sh() {
  return typeof shopify !== 'undefined' ? shopify : {};
}

/** True when `shopify.<path>` resolves to a callable method (real, not a silent no-op). */
function hasMethod(path) {
  try {
    const parts = path.split('.');
    let node = typeof shopify !== 'undefined' ? shopify : undefined;
    for (const p of parts) {
      if (node == null) return false;
      node = node[p];
    }
    return typeof node === 'function';
  } catch {
    return false;
  }
}

/** Show a POS Toast when the API is present (no-op otherwise — never throws). */
function toast(message) {
  try {
    if (typeof shopify !== 'undefined') shopify?.toast?.show?.(message);
  } catch {
    /* Toast unavailable on this surface — ignore. */
  }
}

/** A skipped call — the required real API method is absent on this surface/version. */
function unsupported(what) {
  toast(`Not available here (${what})`);
  return { ok: false, reason: 'unsupported', message: `unsupported:${what}` };
}

/** Extract the numeric id from a Shopify GID (`gid://shopify/ProductVariant/123` → 123). */
export function numericIdFromGid(gid) {
  if (typeof gid === 'number' && Number.isFinite(gid)) return gid;
  if (typeof gid !== 'string') return undefined;
  const m = gid.match(/\/(\d+)(?:[?#].*)?$/);
  if (m) return Number(m[1]);
  if (/^\d+$/.test(gid.trim())) return Number(gid.trim());
  return undefined;
}

/**
 * Resolve a declared `binding` to a display string using the REAL contextual API on the
 * current target. Returns `undefined` when the surface doesn't expose it, so callers fall
 * back to the block's literal `label`. NEVER fabricates a literal that pretends to be live.
 *
 * Only bindings the real API genuinely exposes are handled here; loyalty.* is app-owned and
 * resolved in the modal via the app proxy (returns undefined inline). Bindings POS does not
 * expose (customer name/email/spend, order financial/fulfillment/total, staff/location NAMES)
 * are NOT in POS_DATA_BINDINGS at all, so they can never reach this function.
 *
 * @param {string|undefined} binding - one of POS_DATA_BINDINGS
 * @returns {string|undefined}
 */
export function resolveBinding(binding) {
  if (!binding) return undefined;
  try {
    const s = typeof shopify !== 'undefined' ? shopify : {};

    switch (binding) {
      // ── Cart (read: shopify.cart.current.value — currency strings) ──
      case 'cart.subtotal': {
        const cart = s.cart?.current?.value ?? s.cart?.current;
        return str(cart?.subtotal);
      }
      case 'cart.total': {
        const cart = s.cart?.current?.value ?? s.cart?.current;
        return str(cart?.grandTotal);
      }
      case 'cart.taxTotal': {
        const cart = s.cart?.current?.value ?? s.cart?.current;
        return str(cart?.taxTotal);
      }
      case 'cart.itemCount': {
        const cart = s.cart?.current?.value ?? s.cart?.current;
        const items = cart?.lineItems;
        if (!Array.isArray(items)) return undefined;
        const count = items.reduce((n, li) => n + (Number(li?.quantity) || 0), 0);
        return String(count);
      }

      // ── Cart Line Item (shopify.cartLineItem is the LineItem object directly) ──
      case 'lineItem.title':
        return str(s.cartLineItem?.title);
      case 'lineItem.quantity':
        return str(s.cartLineItem?.quantity);

      // ── Order (shopify.order → { id, name, customerId }) ──
      case 'order.name':
        return str(s.order?.name);

      // ── Session (shopify.session.currentSession — IDs only, no names) ──
      case 'session.locationId':
        return str(s.session?.currentSession?.locationId);
      case 'session.staffMemberId':
        return str(s.session?.currentSession?.staffMemberId);
      case 'session.currency':
        return str(s.session?.currentSession?.currency);

      // ── Loyalty (app-owned — resolved via the app proxy in the modal, not inline) ──
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

/**
 * Perform the module's declared `action` against the REAL 2026-04 POS API. Optionally gated
 * by a server-verified staff PIN. Returns `{ ok, reason?, message?, data? }`; the caller
 * decides how to present it. Never throws. NEVER toasts success / returns ok:true for a
 * method that isn't present (see hasMethod + unsupported()).
 *
 * @param {object} block - a PosBlockConfig from /api/pos/config
 */
export async function runAction(block) {
  const action = block?.action;
  if (!action || action === 'NONE') return { ok: true };

  // Staff-PIN gate (real PinPad + server-side verification) for sensitive operations.
  if (block.staffPin?.required) {
    const gate = await requireStaffPin(block);
    if (!gate.ok) {
      toast(gate.reason === 'unsupported' ? 'Staff PIN unavailable' : 'PIN verification failed');
      return gate;
    }
  }

  const cfg = block.actionConfig ?? {};
  // Imperative calls go through `sh()` (widened to any) — every one is runtime-gated by
  // hasMethod(...) just above it, which is the real guard against a silent no-op.
  const s = sh();
  try {
    switch (action) {
      case 'PRESENT_MODAL':
        if (hasMethod('action.presentModal')) {
          s.action.presentModal();
          return { ok: true };
        }
        return unsupported('present modal');

      case 'APPLY_CART_DISCOUNT': {
        if (!hasMethod('applyCartDiscount')) return unsupported('cart discount');
        const type = discountType(cfg);
        const title = cfg.discountTitle ?? block.label ?? 'Discount';
        await s.applyCartDiscount(type, title, stripPct(cfg.discountAmount));
        toast('Discount applied');
        return { ok: true };
      }

      case 'APPLY_CODE_DISCOUNT': {
        const code = cfg.discountCode ?? cfg.discountTitle;
        if (!code) return unsupported('discount code');
        // Real 2026-04: a code discount is added via addCartCodeDiscount(code).
        if (hasMethod('addCartCodeDiscount')) {
          await s.addCartCodeDiscount(code);
          toast('Code applied');
          return { ok: true };
        }
        // Fallback to the unified applyCartDiscount('Code', code) form where present.
        if (hasMethod('applyCartDiscount')) {
          await s.applyCartDiscount('Code', code);
          toast('Code applied');
          return { ok: true };
        }
        return unsupported('discount code');
      }

      case 'APPLY_LINE_DISCOUNT': {
        if (!hasMethod('bulkSetLineItemDiscounts')) return unsupported('line discount');
        const uuid = s.cartLineItem?.uuid;
        if (!uuid) return unsupported('line item context');
        await s.bulkSetLineItemDiscounts([
          {
            lineItemUuid: uuid,
            type: discountType(cfg),
            title: cfg.discountTitle ?? block.label ?? 'Discount',
            amount: stripPct(cfg.discountAmount),
          },
        ]);
        toast('Line discount applied');
        return { ok: true };
      }

      case 'SET_CART_NOTE': {
        // Real 2026-04: the cart note is set via bulkCartUpdate({ note }).
        if (!hasMethod('bulkCartUpdate')) return unsupported('cart note');
        await s.bulkCartUpdate({ note: cfg.note ?? '' });
        toast('Note saved');
        return { ok: true };
      }

      case 'ADD_CART_PROPERTY': {
        if (!cfg.propertyKey) return unsupported('cart property');
        const props = { [cfg.propertyKey]: cfg.propertyValue ?? '' };
        // Prefer a line-item property when a line-item context exists; else a cart property.
        const uuid = s.cartLineItem?.uuid;
        if (uuid && hasMethod('addLineItemProperties')) {
          await s.addLineItemProperties(uuid, props);
          toast('Property added');
          return { ok: true };
        }
        if (hasMethod('addCartProperties')) {
          await s.addCartProperties(props);
          toast('Property added');
          return { ok: true };
        }
        return unsupported('cart property');
      }

      case 'ADD_LINE_ITEM': {
        if (!hasMethod('addLineItem')) return unsupported('add line item');
        // addLineItem requires a NUMERIC variant id (not a GID).
        const variantId = numericIdFromGid(cfg.productVariantId);
        if (variantId === undefined) return unsupported('product variant');
        const uuid = await s.addLineItem(variantId, 1);
        // addLineItem returns '' when the user dismissed the oversell-guard modal — not a success.
        if (uuid === '') {
          toast('Add cancelled');
          return { ok: false, reason: 'cancelled', message: 'oversell_guard_dismissed' };
        }
        toast('Added to cart');
        return { ok: true, data: { uuid } };
      }

      case 'LOYALTY_READ':
        return await appProxy(block.appProxyPath, 'GET');

      case 'LOYALTY_WRITE':
      case 'APP_PROXY_POST':
        return await appProxy(block.appProxyPath, 'POST', appProxyBody(block));

      case 'RECEIPT_CONTENT':
        // Receipt content is rendered declaratively by Receipt.jsx, not an imperative action.
        return { ok: true };

      case 'PRINT': {
        // Real 2026-04: Print API is FLAT — shopify.print(src).
        if (!cfg.url) return unsupported('print source');
        if (!hasMethod('print')) return unsupported('print');
        await s.print(cfg.url);
        return { ok: true };
      }

      default:
        return unsupported(String(action));
    }
  } catch (err) {
    toast('Action failed');
    return { ok: false, reason: 'error', message: String(err) };
  }
}

/** Map config → a real CartDiscountType ('Percentage' | 'FixedAmount'). */
function discountType(cfg) {
  if (cfg?.discountKind === 'FixedAmount') return 'FixedAmount';
  if (cfg?.discountKind === 'Percentage') return 'Percentage';
  // Infer from the amount string: a trailing % ⇒ percentage, else fixed amount.
  const amt = cfg?.discountAmount;
  if (typeof amt === 'string' && amt.includes('%')) return 'Percentage';
  return cfg?.discountAmount != null ? 'FixedAmount' : 'Percentage';
}

function stripPct(v) {
  return typeof v === 'string' ? v.replace('%', '').trim() : v;
}

/**
 * Gate a sensitive action behind a staff PIN. Uses the REAL PinPad API
 * (`shopify.pinPad.showPinPad(callback, options)`) to COLLECT the PIN, then verifies it
 * SERVER-SIDE via the app proxy — the PinPad API has NO built-in verification, so a
 * client-only "verified" check would be security theatre.
 *
 * Returns `{ ok:true }` only when the server confirms the PIN; `{ ok:false, reason }`
 * otherwise. `reason:'unsupported'` when the PinPad API is absent (fails CLOSED — the
 * action is blocked, never silently allowed). When no `appProxyPath` is configured to
 * verify against, the gate ALSO fails closed (`reason:'unverifiable'`) rather than
 * trusting an unverified client PIN.
 *
 * @param {object} block - the PosBlockConfig (needs staffPin + appProxyPath)
 */
export async function requireStaffPin(block) {
  const staffPin = block?.staffPin ?? {};
  if (!hasMethod('pinPad.showPinPad')) {
    return { ok: false, reason: 'unsupported', message: 'pinpad_absent' };
  }
  // Without a server endpoint we cannot verify the PIN — refuse rather than fake-approve.
  const verifyPath = block?.appProxyPath;
  if (!verifyPath) {
    return { ok: false, reason: 'unverifiable', message: 'no_verify_endpoint' };
  }

  const s = sh();

  // Real shipped contract (@shopify/ui-extensions 2026.4): showPinPad(onSubmit, options).
  // `onSubmit` returns { result:'accept'|'reject', errorMessage? }. On ACCEPT the modal
  // dismisses and `onDismissed` fires ({ completed, pin }); on REJECT the modal stays open
  // (so the staffer can retry). We verify SERVER-SIDE inside onSubmit — the PinPad API has
  // no built-in verification — and resolve the outer promise idempotently: a verified accept
  // wins; a dismissal without a verified accept settles as blocked.
  return await new Promise((resolve) => {
    let settled = false;
    let verified = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    try {
      s.pinPad.showPinPad(
        async (pin) => {
          const digits = Array.isArray(pin) ? pin.join('') : String(pin ?? '');
          const verdict = await verifyStaffPin(verifyPath, digits, staffPin.role);
          if (verdict.ok) {
            verified = true;
            return { result: 'accept' };
          }
          // Wrong PIN: keep the pad open for a retry; the outer promise stays unsettled
          // until the staffer succeeds or dismisses.
          return { result: 'reject', errorMessage: 'PIN not verified — try again' };
        },
        {
          title: 'Staff verification',
          label: staffPin.reason ?? 'Enter your staff PIN to continue',
          masked: true,
          minPinLength: 4,
          maxPinLength: 10,
          // Fires on accept (post-dismiss) AND on cancel. Settle from the verified flag so a
          // genuine accept resolves ok:true and a cancel resolves blocked.
          onDismissed: () =>
            finish(
              verified
                ? { ok: true }
                : { ok: false, reason: 'blocked', message: 'pin_dismissed' },
            ),
        },
      );
    } catch (err) {
      finish({ ok: false, reason: 'error', message: String(err) });
    }
  });
}

/**
 * Verify a collected PIN against the store's staff/role config SERVER-SIDE via the app
 * proxy. POST { pin, role } to `<appProxyPath>/verify-pin` with the POS session token; the
 * app validates it and returns { verified:boolean }. Any non-2xx / non-verified / network
 * error is treated as NOT verified (fail closed).
 */
async function verifyStaffPin(appProxyPath, pin, role) {
  try {
    const token = await shopify?.session?.getSessionToken?.();
    const path = `${appProxyPath.replace(/\/$/, '')}/verify-pin`;
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin, role }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return { ok: data?.verified === true };
  } catch {
    return { ok: false };
  }
}

/**
 * Read/write the app-owned loyalty ledger (or any app-proxy endpoint) using the POS
 * session token (App Authentication). `path` is relative to the app. Reports failure
 * honestly — a non-2xx or thrown error returns `{ ok:false }` with a failure toast.
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
    return { ok: false, reason: 'error', message: String(err) };
  }
}

/** Build the app-proxy body from the REAL surface context (order/customer are id-only). */
function appProxyBody(block) {
  const s = typeof shopify !== 'undefined' ? shopify : {};
  return {
    moduleId: block.moduleId,
    action: block.action,
    customerId: s.customer?.id ?? s.order?.customerId,
    orderId: s.order?.id,
    productId: s.product?.id,
    variantId: s.product?.variantId,
    lineItemUuid: s.cartLineItem?.uuid,
    actionConfig: block.actionConfig ?? {},
  };
}
