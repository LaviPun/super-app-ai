import "@shopify/ui-extensions/preact";

/**
 * Background POS event observer. Mounted at the four `*.event.observe` targets
 * (cart-update, transaction-complete, cash-tracking-session-start / -complete).
 * Observers have NO UI: when the subscribed event fires, the handler reads the shop's
 * PUBLISHED pos.extension observer config from /api/pos/config and, for any module that
 * subscribes to this event, forwards the event payload to the module's declared
 * `observe.forwardTo` app-proxy path (e.g. loyalty accrual on transaction-complete,
 * till-audit logging on cash-tracking sessions).
 *
 * Everything is best-effort and non-blocking: a failed fetch/forward is swallowed so the
 * observer never interferes with the POS sale flow.
 */

/** Derive the observe-event enum from the extension's target string. */
function eventFromTarget(target) {
  // pos.<event>.event.observe → <event>
  const m = /^pos\.(.+)\.event\.observe$/.exec(target ?? '');
  return m ? m[1] : undefined;
}

async function loadObservers(event) {
  try {
    const token = await shopify?.session?.getSessionToken?.();
    const res = await fetch('/api/pos/config', {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (!res.ok) return [];
    const data = await res.json();
    const all = Array.isArray(data?.blocks) ? data.blocks : [];
    // Only observer modules subscribed to THIS event with a forward destination.
    return all.filter(
      (b) => b?.observe?.event === event && b?.observe?.forwardTo,
    );
  } catch {
    return [];
  }
}

async function forward(observer, payload) {
  try {
    const token = await shopify?.session?.getSessionToken?.();
    await fetch(observer.observe.forwardTo, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: observer.moduleId,
        event: observer.observe.event,
        payload,
      }),
    });
  } catch {
    /* Non-blocking: never interrupt the POS flow. */
  }
}

export default async (api) => {
  const event = eventFromTarget(api?.target);
  if (!event) return;

  // The event.observe entry receives the event payload via the target api. Forward it
  // to every subscribed observer's app-proxy endpoint.
  const payload = api?.data ?? api?.event ?? {};
  const observers = await loadObservers(event);
  await Promise.all(observers.map((o) => forward(o, payload)));
};
