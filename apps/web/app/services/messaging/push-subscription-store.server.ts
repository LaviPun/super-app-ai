/**
 * Web-push subscription store (build #17b — makes the web-push connector REAL end
 * to end).
 *
 * The `WebPushConnector` sends to a browser `PushSubscription`; that subscription is
 * captured client-side by `webPushClientRegistration()` and POSTed to
 * `/webpush/subscribe`. This module is the persistence seam between the two: it
 * stores each subscription in a first-party `DataStore` (key `push_subscriptions`),
 * keyed by the subscription `endpoint` so a re-subscribe UPSERTS (never duplicates)
 * and a stale-prune DELETES by endpoint.
 *
 * The stored record payload carries the subscription under BOTH `subscription` and
 * `pushSubscription` plus a flat `endpoint`, so the messaging runner's push audience
 * resolution (`r.subscription ?? r.pushSubscription`, see messaging-runner.service.ts
 * §push) drops straight in with no per-store field mapping.
 *
 * HONESTY: a subscription is the opt-in — we only ever store a well-formed one the
 * browser actually handed us. Pruning on a 410/404 from the push service is REAL
 * removal (the connector surfaces `subscriptionGone`), never a soft flag.
 */
import { DataStoreService } from '~/services/data/data-store.service';

/** The canonical store key web-push subscriptions land in (shop-scoped). */
export const PUSH_SUBSCRIPTION_STORE_KEY = 'push_subscriptions';

/** A browser PushSubscription as captured client-side. */
export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

/** Validate + normalize a raw POSTed body into a PushSubscription (or undefined). */
export function parsePushSubscription(raw: unknown): StoredPushSubscription | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const endpoint = typeof s.endpoint === 'string' ? s.endpoint : undefined;
  const keys = s.keys && typeof s.keys === 'object' ? (s.keys as Record<string, unknown>) : undefined;
  const p256dh = keys && typeof keys.p256dh === 'string' ? (keys.p256dh as string) : undefined;
  const auth = keys && typeof keys.auth === 'string' ? (keys.auth as string) : undefined;
  // Same well-formedness bar the connector enforces (endpoint must be https + keys).
  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) return undefined;
  return {
    endpoint,
    keys: { p256dh, auth },
    expirationTime: typeof s.expirationTime === 'number' ? (s.expirationTime as number) : null,
  };
}

export class PushSubscriptionStore {
  constructor(private readonly service: DataStoreService = new DataStoreService()) {}

  /** Ensure the shop's push-subscription store exists and return it. */
  private async ensureStore(shopId: string) {
    return this.service.ensureTypedStore(shopId, PUSH_SUBSCRIPTION_STORE_KEY, {
      label: 'Web-push subscribers',
      description: 'Browser push subscriptions captured from the storefront/customer surfaces.',
    });
  }

  /**
   * Upsert a subscription for a shop, keyed by endpoint. Returns whether a NEW row
   * was created (vs. an existing endpoint refreshed) so the caller can report honestly.
   */
  async upsert(
    shopId: string,
    sub: StoredPushSubscription,
    meta: { customerId?: string } = {},
  ): Promise<{ created: boolean }> {
    const store = await this.ensureStore(shopId);
    const existing = await this.findByEndpoint(store.id, sub.endpoint);
    const payload = {
      subscription: sub,
      // Duplicate under pushSubscription + a flat endpoint so the messaging runner's
      // audience field-shapes (r.subscription / r.pushSubscription) resolve directly.
      pushSubscription: sub,
      endpoint: sub.endpoint,
      capturedAt: new Date().toISOString(),
    };
    if (existing) {
      await this.service.updateRecord(existing.id, store.id, {
        title: `Push · ${hostOf(sub.endpoint)}`,
        payload,
        ...(meta.customerId ? { externalId: meta.customerId } : {}),
      });
      return { created: false };
    }
    await this.service.createRecord(store.id, {
      // externalId indexes by endpoint so prune-by-endpoint is a direct lookup.
      externalId: sub.endpoint,
      customerId: meta.customerId,
      title: `Push · ${hostOf(sub.endpoint)}`,
      payload,
    });
    return { created: true };
  }

  /**
   * Remove a stale subscription by endpoint (called when the push service returns
   * 410/404). REAL deletion — returns the number of rows removed (0 when absent).
   */
  async prune(shopId: string, endpoint: string): Promise<{ removed: number }> {
    const store = await this.service.getStoreByKey(shopId, PUSH_SUBSCRIPTION_STORE_KEY);
    if (!store) return { removed: 0 };
    const row = await this.findByEndpoint(store.id, endpoint);
    if (!row) return { removed: 0 };
    const res = await this.service.deleteRecord(row.id, store.id);
    return { removed: res.count ?? 0 };
  }

  /** Find a subscription row by its endpoint (the store's externalId key). */
  private async findByEndpoint(dataStoreId: string, endpoint: string) {
    const { getPrisma } = await import('~/db.server');
    return getPrisma().dataStoreRecord.findFirst({ where: { dataStoreId, externalId: endpoint } });
  }
}

/** Host of a push endpoint URL for a human-readable record title. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'push';
  }
}
