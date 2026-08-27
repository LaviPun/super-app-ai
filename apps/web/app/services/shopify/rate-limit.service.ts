import { getPrisma } from '~/db.server';

/**
 * Shopify Admin API rate-limit tracking.
 *
 * Every Admin GraphQL response carries `extensions.cost.throttleStatus`
 * ({ maximumAvailable, currentlyAvailable, restoreRate }) + `actualQueryCost`.
 * We capture the latest snapshot per shop (upsert into ShopApiRateLimit) so the
 * API-limit threshold is real, live, and dashboard-readable — and so flows can
 * back off proactively instead of blindly hitting 429s.
 *
 * Recording is best-effort and NEVER throws into the caller (telemetry must not
 * break a real API call); it no-ops under NODE_ENV=test.
 */

export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface AdminCost {
  throttleStatus?: ThrottleStatus;
  actualQueryCost?: number | null;
}

/** Pull `extensions.cost` out of an Admin GraphQL response body. */
export function extractAdminCost(body: unknown): AdminCost | null {
  const cost = (body as { extensions?: { cost?: { throttleStatus?: ThrottleStatus; actualQueryCost?: number } } })
    ?.extensions?.cost;
  if (!cost) return null;
  return { throttleStatus: cost.throttleStatus, actualQueryCost: cost.actualQueryCost ?? null };
}

export class RateLimitService {
  async getByShopId(shopId: string) {
    return getPrisma().shopApiRateLimit.findUnique({ where: { shopId } });
  }

  async getByDomain(shopDomain: string) {
    const shop = await getPrisma().shop.findUnique({ where: { shopDomain }, select: { id: true } });
    return shop ? this.getByShopId(shop.id) : null;
  }

  /** Fraction of the bucket consumed (0 = full, 1 = empty), or null if unknown. */
  static utilization(snap: { currentlyAvailable?: number | null; maximumAvailable?: number | null }): number | null {
    if (snap.maximumAvailable == null || snap.currentlyAvailable == null || snap.maximumAvailable <= 0) return null;
    return Math.min(1, Math.max(0, 1 - snap.currentlyAvailable / snap.maximumAvailable));
  }

  /**
   * Proactive backoff: if the bucket is below `floor` fraction of capacity, return
   * the ms to wait for it to refill back to `floor`; otherwise 0. Keeps flows from
   * tripping 429s under sustained load.
   */
  static backoffMs(
    snap: { currentlyAvailable?: number | null; maximumAvailable?: number | null; restoreRate?: number | null },
    floor = 0.1,
  ): number {
    if (snap.maximumAvailable == null || snap.currentlyAvailable == null || !snap.restoreRate) return 0;
    const target = snap.maximumAvailable * floor;
    if (snap.currentlyAvailable >= target) return 0;
    const deficit = target - snap.currentlyAvailable;
    return Math.min(10_000, Math.ceil((deficit / snap.restoreRate) * 1000));
  }
}
