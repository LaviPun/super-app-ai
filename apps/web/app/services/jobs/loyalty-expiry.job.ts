/**
 * Loyalty-expiry cron job (Phase #4 · R3.6).
 *
 * The ABSOLUTE nightly half of the loyalty engine: ages out point lots past their
 * `expiryDays` policy across every shop that published a loyalty-ledger composite.
 * Invoked from api.cron on a once-a-day cadence (like the retention jobs) — the
 * work is idempotent, so a more frequent run is harmless (a second pass finds
 * nothing due).
 *
 * This reuses `expireDuePoints` (the shop-scoped engine) — the cron job only fans
 * it across shops. Shops are discovered from `Recipe.compositeJson` (the same
 * registry the accrual path uses); NO new table.
 */
import { getPrisma } from '~/db.server';
import { expireDuePoints, type ExpiryOutcome } from '~/services/composites/loyalty-accrual.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

export interface LoyaltyExpiryResult {
  shopsSwept: number;
  rowsExpired: number;
  pointsExpired: number;
  ranAt: string;
}

/**
 * Sweep loyalty expiry for every shop that has a composite manifest. Best-effort
 * per shop (a failure on one shop is logged, never blocks others). Bounded by
 * `maxShops` per run so a large fleet drains across nights.
 */
export async function runLoyaltyExpirySweep(
  opts: { now?: Date; maxShops?: number } = {},
): Promise<LoyaltyExpiryResult> {
  const prisma = getPrisma();
  const now = opts.now ?? new Date();
  const maxShops = Math.max(1, Math.min(opts.maxShops ?? 200, 1000));

  // Shops with at least one composite manifest — the loyalty filter happens inside
  // `expireDuePoints` (it returns 0/0/0 for a shop with no ledger, so the fan-out
  // is safe + cheap). Distinct shopIds keep the fan-out bounded.
  const recipes = await prisma.recipe.findMany({
    where: { compositeJson: { not: null } },
    select: { shopId: true },
    distinct: ['shopId'],
    take: maxShops,
  });

  let rowsExpired = 0;
  let pointsExpired = 0;
  let shopsSwept = 0;
  for (const { shopId } of recipes) {
    try {
      const outcomes: ExpiryOutcome[] = await expireDuePoints(shopId, { now });
      const swept = outcomes.some((o) => o.rowsSwept > 0 || o.rowsExpired > 0);
      if (swept) shopsSwept += 1;
      for (const o of outcomes) {
        rowsExpired += o.rowsExpired;
        pointsExpired += o.pointsExpired;
      }
    } catch (err) {
      logger.warn('[loyalty-expiry] shop sweep failed', { shopId, ...safeErrorMeta(err) });
    }
  }

  return { shopsSwept, rowsExpired, pointsExpired, ranAt: now.toISOString() };
}
