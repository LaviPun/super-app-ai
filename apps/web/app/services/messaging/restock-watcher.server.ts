/**
 * RestockWatcherService (Track V-C, item C1) — back-in-stock + price-drop
 * notification watcher.
 *
 * A merchant's storefront back-in-stock / price-drop form posts a DataCapture with
 *   captureType 'back_in_stock' | 'price_drop'
 *   payload    { variantGid, productGid, priceAt?, email?, customerId? }
 * (the capture ingestion path is the shipped app-proxy `/proxy/capture`). When the
 * subscribed variant crosses back into stock (or its price falls below the price at
 * subscription time), this watcher notifies the subscriber ONCE and marks the capture
 * `notified`, so it never re-fires.
 *
 * The subscription store is the EXISTING `DataCapture` model — no new Prisma table.
 * The status marker (`waiting` | `notified`) lives inside the capture's `payload`
 * JSON, which the watcher updates in place. Absent status ⇒ waiting.
 *
 * ── Delivery ──
 * Sends through the SAME email connector the live SEND_EMAIL_NOTIFICATION step and
 * MessagingRunnerService.sendOne use (`getConnector('email').invoke`). No new mailer.
 *
 * ── Honesty gates (mirrors MessagingRunnerService) ──
 *  - No email connector configured (EMAIL_API_KEY / EMAIL_FROM absent) ⇒ the whole
 *    run refuses up front, captures stay `waiting`, and one audit log records the
 *    shortfall. Never a fake send.
 *  - A recipient whose email is not resolvable stays `waiting` with an audit log
 *    (see the PII note below) — never marked notified.
 *  - A send that fails (transient upstream error) leaves the capture `waiting`, so
 *    the next inventory-affecting `products/update` for the same product retries it.
 *
 * ── PII-at-rest constraint (important divergence from the naive premise) ──
 * `DataCapture.payload` is persisted through `persistJsonSafely`, whose `redact()`
 * masks EVERY email string to `[REDACTED_EMAIL]` regardless of key. So the
 * subscriber email cannot be read back from the payload in cleartext. The watcher
 * therefore resolves the recipient email at notify time:
 *   1. payload email, IF it is a usable (non-redacted) address — covers deployments
 *      with redaction disabled or a future cleartext-contact path; otherwise
 *   2. the capture's `customerId` → Shopify `customer.defaultEmailAddress` (cleartext
 *      from the Admin API, the same source the consent resolver uses).
 * A capture with neither (an anonymous, redacted email-only subscription) cannot be
 * notified — it stays `waiting` and is audit-logged. The storefront capture widget
 * (a sibling's scope) should attach a `customerId` so anonymous subscribers become
 * notifiable, or the platform needs a redaction-exempt consented-contact store.
 *
 * ── Consent posture ──
 * Back-in-stock / price-drop alerts are USER-REQUESTED, single-product transactional
 * notifications (the person explicitly asked to be told about THIS product) — the act
 * of subscribing is the opt-in for that one alert. They are therefore NOT gated on the
 * customer's *marketing* consent state (mirroring Klaviyo BIS / Appikon). We still
 * honour an explicit opt-out carried on the capture (`consent === false` /
 * `marketingOptOut === true`) and skip such a capture. This choice is documented and
 * intentional; it diverges from MessagingRunnerService's marketing-consent gate, which
 * governs broadcast marketing, not requested transactional alerts.
 *
 * ── Wiring / deliverability ──
 * Wired into `products/update` (scope `read_products`, GRANTED and already delivered —
 * see webhooks.tsx TOPIC_TO_TRIGGER), reading `variants[].inventory_quantity` /
 * `variants[].price` exactly like the shipped messaging back_in_stock guard. The
 * "purer" `inventory_levels/update` topic IS in the registry but its scope
 * `read_inventory` is NOT in GRANTED_WEBHOOK_SCOPES, so Shopify does not deliver it
 * today — it would be inert. products/update is the deliverable signal.
 *
 * ── Rate bound / re-entry ──
 * Fan-out is capped at `batchCap` (default 100) notifications per run. When a single
 * product has more waiting subscribers than the cap, the overflow stays `waiting` and
 * is picked up by the NEXT `products/update` for that product (natural webhook
 * re-entry) — the run reports the capped count so the shortfall is visible, never
 * truncated-as-success.
 */
import { getConnector } from '~/services/workflows/connectors/index';
import { getPrisma } from '~/db.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import type { AdminGraphqlFn } from './consent-resolver.server';

export const BACK_IN_STOCK_CAPTURE_TYPE = 'back_in_stock';
export const PRICE_DROP_CAPTURE_TYPE = 'price_drop';

const REDACTED_EMAIL = '[REDACTED_EMAIL]';

/** Dependency seams (all overridable in tests — no DB / network by default in tests). */
export type RestockWatcherDeps = {
  prisma?: ReturnType<typeof getPrisma>;
  /** Resolve a connector by channel; defaults to the live connector registry. */
  getConnector?: typeof getConnector;
  /** Injectable email API key (defaults to process.env.EMAIL_API_KEY). */
  emailApiKey?: string;
  /** Env seam for the connector config gate. Default process.env. */
  env?: Record<string, string | undefined>;
  /** Max notifications delivered per run (default 100). Overflow stays waiting. */
  batchCap?: number;
  /** Clock seam (notifiedAt). Default () => new Date(). */
  now?: () => Date;
};

export type RestockWatchResult = {
  /** Captures examined this run (waiting subscribers for the affected product). */
  matched: number;
  /** Notifications actually sent (email accepted). */
  notified: number;
  /** Captures left waiting because a send failed or the recipient was unresolvable. */
  waiting: number;
  /** Captures skipped for an explicit opt-out. */
  skipped: number;
  /** Captures beyond the per-run cap, deferred to the next products/update. */
  deferred: number;
  /** True when the email connector is unconfigured — nothing was sent, all stay waiting. */
  connectorUnconfigured: boolean;
};

type CapturePayload = Record<string, unknown> & {
  variantGid?: unknown;
  productGid?: unknown;
  priceAt?: unknown;
  email?: unknown;
  customerId?: unknown;
  status?: unknown;
};

type CaptureRow = { id: string; customerId: string | null; captureType: string; payload: string };

/** One variant's post-update state, parsed from the products/update payload. */
type VariantState = { variantGid: string; qty: number | null; price: number | null };

export class RestockWatcherService {
  private readonly prisma: ReturnType<typeof getPrisma>;
  private readonly connectorFor: typeof getConnector;
  private readonly deps: RestockWatcherDeps;

  constructor(deps: RestockWatcherDeps = {}) {
    this.prisma = deps.prisma ?? getPrisma();
    this.connectorFor = deps.getConnector ?? getConnector;
    this.deps = deps;
  }

  private get env(): Record<string, string | undefined> {
    return this.deps.env ?? process.env;
  }

  private get batchCap(): number {
    const n = this.deps.batchCap ?? 100;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
  }

  private nowDate(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /**
   * React to a `products/update` webhook: notify any waiting back_in_stock capture
   * whose variant is now in stock, and any waiting price_drop capture whose variant's
   * price has fallen below the subscription-time price.
   *
   * Best-effort by contract — the caller (webhooks.tsx) runs this as a sibling and
   * never lets a failure release the event claim or 500 the webhook.
   */
  async runForProductUpdate(
    shopDomain: string,
    adminGraphql: AdminGraphqlFn | undefined,
    event: unknown,
  ): Promise<RestockWatchResult> {
    const empty: RestockWatchResult = {
      matched: 0,
      notified: 0,
      waiting: 0,
      skipped: 0,
      deferred: 0,
      connectorUnconfigured: false,
    };

    const parsed = parseProductEvent(event);
    if (!parsed || parsed.variants.length === 0) return empty;
    const { productGid, productTitle, productHandle, variants } = parsed;

    const shopRow = await this.prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shopRow) return empty;

    // Config gate — refuse loudly (audit log), never fake a send.
    const emailApiKey = this.deps.emailApiKey ?? this.env.EMAIL_API_KEY;
    const emailFrom = this.env.EMAIL_FROM;
    const connectorUnconfigured = !emailApiKey || !emailFrom;

    const variantByGid = new Map(variants.map((v) => [v.variantGid, v]));

    // Pull every waiting subscription for THIS product in one query per capture type.
    // `payload contains productGid` narrows at the DB; exact matching + status is done
    // in memory (payload is an opaque JSON string, so the status marker isn't a column).
    const captures = await this.prisma.dataCapture.findMany({
      where: {
        shopId: shopRow.id,
        captureType: { in: [BACK_IN_STOCK_CAPTURE_TYPE, PRICE_DROP_CAPTURE_TYPE] },
        payload: { contains: productGid },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, customerId: true, captureType: true, payload: true },
    });

    const result: RestockWatchResult = { ...empty, connectorUnconfigured };

    for (const cap of captures) {
      const payload = parseCapturePayload(cap.payload);
      if (!payload) continue;
      if (!isWaiting(payload)) continue; // already notified — dedupe.
      const variantGid = typeof payload.variantGid === 'string' ? payload.variantGid : undefined;
      if (!variantGid) continue;
      const variant = variantByGid.get(variantGid);
      if (!variant) continue;

      const triggered =
        cap.captureType === BACK_IN_STOCK_CAPTURE_TYPE
          ? restockTriggered(variant)
          : priceDropTriggered(payload, variant);
      if (!triggered) continue;

      result.matched++;

      // Explicit opt-out on the capture is honoured (transactional alerts are opt-in
      // by subscription, but a hard opt-out still wins).
      if (isOptedOut(payload)) {
        result.skipped++;
        continue;
      }

      // Rate bound: once the cap is reached, leave the rest waiting for the next
      // products/update (natural re-entry). Counted as deferred, not sent-as-success.
      if (result.notified >= this.batchCap) {
        result.deferred++;
        continue;
      }

      // Connector unconfigured ⇒ cannot send; stays waiting (audit log emitted once
      // below). Count as waiting so the shortfall is visible.
      if (connectorUnconfigured) {
        result.waiting++;
        continue;
      }

      const to = await this.resolveRecipientEmail(payload, cap.customerId, adminGraphql);
      if (!to) {
        result.waiting++;
        logger.warn('[restock-watcher] capture has no resolvable recipient email — staying waiting', {
          shopDomain,
          captureId: cap.id,
          captureType: cap.captureType,
          reason: 'email redacted at rest and no resolvable customerId',
        });
        continue;
      }

      const sent = await this.sendNotification({
        shopDomain,
        emailApiKey,
        captureType: cap.captureType,
        to,
        productTitle,
        productHandle,
        variant,
        priceAt: toPrice(payload.priceAt),
      });

      if (sent) {
        await this.markNotified(cap.id, payload);
        result.notified++;
      } else {
        // Send failed (transient) — leave waiting for the next products/update retry.
        result.waiting++;
      }
    }

    if (connectorUnconfigured && (result.waiting > 0 || result.matched > 0)) {
      logger.warn('[restock-watcher] email connector not configured — notifications withheld', {
        shopDomain,
        productGid,
        missing: [!emailApiKey ? 'EMAIL_API_KEY' : null, !emailFrom ? 'EMAIL_FROM' : null].filter(Boolean),
        waiting: result.waiting,
      });
    }

    return result;
  }

  /**
   * Resolve a sendable recipient email:
   *  1. the payload email, IF cleartext & valid (non-redacted); else
   *  2. Shopify `customer.defaultEmailAddress.emailAddress` via the capture customerId.
   * Returns undefined when neither yields a usable address.
   */
  private async resolveRecipientEmail(
    payload: CapturePayload,
    customerId: string | null,
    adminGraphql: AdminGraphqlFn | undefined,
  ): Promise<string | undefined> {
    const direct = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (direct && direct !== REDACTED_EMAIL && direct.includes('@')) return direct;

    const gid = customerGid(customerId ?? payload.customerId);
    if (!gid || !adminGraphql) return undefined;
    try {
      const res = await adminGraphql(CUSTOMER_EMAIL_QUERY, { variables: { id: gid } });
      const body = (await res.json()) as {
        data?: { customer?: { defaultEmailAddress?: { emailAddress?: string | null } | null } | null };
      };
      const email = body.data?.customer?.defaultEmailAddress?.emailAddress?.trim();
      return email && email.includes('@') ? email : undefined;
    } catch (err) {
      logger.warn('[restock-watcher] customer email lookup failed', safeErrorMeta(err));
      return undefined;
    }
  }

  /** The ONLY delivery path — the same connector.invoke the messaging runner makes. */
  private async sendNotification(input: {
    shopDomain: string;
    emailApiKey: string;
    captureType: string;
    to: string;
    productTitle: string;
    productHandle: string;
    variant: VariantState;
    priceAt: number | null;
  }): Promise<boolean> {
    const connector = this.connectorFor('email');
    if (!connector) {
      logger.warn('[restock-watcher] email connector not registered', { shopDomain: input.shopDomain });
      return false;
    }
    const { subject, body } = buildEmail(input);
    try {
      const res = await connector.invoke(
        { type: 'api_key', apiKey: input.emailApiKey },
        {
          runId: `restock-${Date.now()}`,
          stepId: 'RESTOCK_NOTIFY_EMAIL',
          tenantId: input.shopDomain,
          operation: 'send',
          inputs: { to: input.to, subject, body },
          timeoutMs: 10000,
        },
      );
      if (!res.ok) {
        logger.warn('[restock-watcher] email send failed — capture stays waiting', {
          shopDomain: input.shopDomain,
          captureType: input.captureType,
          message: res.message,
        });
        return false;
      }
      return true;
    } catch (err) {
      logger.error('[restock-watcher] email connector threw — capture stays waiting', {
        shopDomain: input.shopDomain,
        ...safeErrorMeta(err),
      });
      return false;
    }
  }

  /** Flip the capture's in-payload status marker to `notified` (dedupe for next runs). */
  private async markNotified(captureId: string, payload: CapturePayload): Promise<void> {
    const next = { ...payload, status: 'notified', notifiedAt: this.nowDate().toISOString() };
    // The stored payload is already PII-safe (email redacted at rest); we only add
    // status/notifiedAt, so a plain stringify preserves the existing posture.
    await this.prisma.dataCapture.update({
      where: { id: captureId },
      data: { payload: JSON.stringify(next) },
    });
  }
}

// ─── Pure helpers (exported for unit tests) ────────────────────────────────────

const CUSTOMER_EMAIL_QUERY = `#graphql
  query RestockRecipientEmail($id: ID!) {
    customer(id: $id) {
      id
      defaultEmailAddress { emailAddress marketingState }
    }
  }
`;

/** Parse the products/update webhook payload into product + variant states. */
export function parseProductEvent(event: unknown): {
  productGid: string;
  productTitle: string;
  productHandle: string;
  variants: VariantState[];
} | null {
  if (!isRecord(event)) return null;
  const productGid =
    (typeof event.admin_graphql_api_id === 'string' && event.admin_graphql_api_id) ||
    (event.id != null ? `gid://shopify/Product/${String(event.id)}` : '');
  if (!productGid) return null;
  const productTitle = typeof event.title === 'string' ? event.title : 'Your item';
  const productHandle = typeof event.handle === 'string' ? event.handle : '';

  const rawVariants = Array.isArray(event.variants) ? event.variants : [];
  const variants: VariantState[] = [];
  for (const v of rawVariants) {
    if (!isRecord(v)) continue;
    const variantGid =
      (typeof v.admin_graphql_api_id === 'string' && v.admin_graphql_api_id) ||
      (v.id != null ? `gid://shopify/ProductVariant/${String(v.id)}` : '');
    if (!variantGid) continue;
    variants.push({
      variantGid,
      qty: toQty(v.inventory_quantity),
      price: toPrice(v.price),
    });
  }
  return { productGid, productTitle, productHandle, variants };
}

export function parseCapturePayload(raw: string): CapturePayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? (parsed as CapturePayload) : null;
  } catch {
    return null;
  }
}

/** A capture is waiting unless its status marker is explicitly `notified`. */
export function isWaiting(payload: CapturePayload): boolean {
  return String(payload.status ?? 'waiting').toLowerCase() !== 'notified';
}

/** Restock fires when the subscribed variant now has positive available inventory. */
export function restockTriggered(variant: VariantState): boolean {
  return variant.qty != null && variant.qty > 0;
}

/**
 * Price-drop fires when the variant's current price is strictly below the price at
 * subscription time. Absent priceAt (nothing to compare) ⇒ does not fire.
 */
export function priceDropTriggered(payload: CapturePayload, variant: VariantState): boolean {
  const priceAt = toPrice(payload.priceAt);
  if (priceAt == null || variant.price == null) return false;
  return variant.price < priceAt;
}

/** Honour an explicit opt-out carried on the capture. */
function isOptedOut(payload: CapturePayload): boolean {
  if (payload.marketingOptOut === true) return true;
  if (payload.consent === false) return true;
  if (typeof payload.consent === 'string') {
    const s = payload.consent.trim().toLowerCase();
    return s === 'false' || s === 'no' || s === '0';
  }
  return false;
}

function buildEmail(input: {
  shopDomain: string;
  captureType: string;
  productTitle: string;
  productHandle: string;
  variant: VariantState;
  priceAt: number | null;
}): { subject: string; body: string } {
  const url = input.productHandle
    ? `https://${input.shopDomain}/products/${input.productHandle}`
    : `https://${input.shopDomain}`;
  if (input.captureType === PRICE_DROP_CAPTURE_TYPE) {
    const now = input.variant.price != null ? formatPrice(input.variant.price) : '';
    const subject = `Price drop: ${input.productTitle}`;
    const body =
      `<p>Good news — <strong>${escapeHtml(input.productTitle)}</strong> just dropped in price` +
      (now ? ` to ${now}` : '') +
      `.</p><p><a href="${url}">View it now</a></p>`;
    return { subject, body };
  }
  const subject = `Back in stock: ${input.productTitle}`;
  const body =
    `<p><strong>${escapeHtml(input.productTitle)}</strong> is back in stock.</p>` +
    `<p><a href="${url}">Shop it now</a> before it sells out again.</p>`;
  return { subject, body };
}

/** Coerce a Shopify GID or numeric customer id into a Customer GID. */
function customerGid(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('gid://shopify/Customer/')) return t;
    if (/^\d+$/.test(t)) return `gid://shopify/Customer/${t}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return `gid://shopify/Customer/${value}`;
  return undefined;
}

function toQty(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toPrice(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function formatPrice(n: number): string {
  return n.toFixed(2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
