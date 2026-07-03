/**
 * Module performance aggregation (M12 — Sidekick data extension).
 *
 * Aggregates the per-day `moduleMetricsDaily` rows produced by the analytics
 * pipeline (see `module-events.server.ts:getModuleMetricsDaily`) into a single
 * summary the Sidekick data extension (and any agent caller) can read.
 *
 * Honesty contract: if there are no daily-metric rows for the module in the
 * window, we return `available: false` with a reason rather than fabricating
 * zeros as if they were real, measured performance. Whether metrics ingestion
 * is wired for a given surface is out of scope here — this reports truthfully
 * on whatever has actually been recorded.
 */

import { getModuleMetricsDaily } from '~/services/analytics/module-events.server';

export type ModulePerformanceByDay = {
  date: string;
  impressions: number;
  interactions: number;
  actions: number;
  conversions: number;
};

export type ModulePerformanceSummary =
  | {
      available: false;
      moduleId: string;
      days: number;
      reason: string;
    }
  | {
      available: true;
      moduleId: string;
      days: number;
      impressions: number;
      interactions: number;
      actions: number;
      conversions: number;
      /** conversions / impressions, rounded to 4 dp; 0 when impressions === 0. */
      conversionRate: number;
      byDay: ModulePerformanceByDay[];
    };

/**
 * Read the daily metric rows for a module and fold them into totals + a
 * per-day series. Pure aggregation over an already-scoped read.
 */
export async function getModulePerformanceSummary(
  shopId: string,
  moduleId: string,
  days = 30,
): Promise<ModulePerformanceSummary> {
  const rows = await getModuleMetricsDaily(shopId, moduleId, days);

  if (rows.length === 0) {
    return {
      available: false,
      moduleId,
      days,
      reason: 'No metrics recorded yet for this module.',
    };
  }

  let impressions = 0;
  let interactions = 0;
  let actions = 0;
  let conversions = 0;

  const byDay: ModulePerformanceByDay[] = [];
  for (const r of rows) {
    impressions += r.impressions;
    interactions += r.interactions;
    actions += r.actions;
    conversions += r.conversions;
    byDay.push({
      date: r.date.toISOString().slice(0, 10),
      impressions: r.impressions,
      interactions: r.interactions,
      actions: r.actions,
      conversions: r.conversions,
    });
  }

  const conversionRate =
    impressions > 0 ? Math.round((conversions / impressions) * 10000) / 10000 : 0;

  return {
    available: true,
    moduleId,
    days,
    impressions,
    interactions,
    actions,
    conversions,
    conversionRate,
    byDay,
  };
}
