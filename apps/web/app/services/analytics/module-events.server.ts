/**
 * Module analytics event ingestion (doc 24.4.2, Section 30).
 * Writes to module_events; aggregation to module_metrics_daily can be done by a job.
 */

import { getPrisma } from '~/db.server';

export async function getModuleMetricsDaily(shopId: string, moduleId: string, days = 30) {
  const prisma = getPrisma();
  const since = new Date();
  since.setDate(since.getDate() - days);
  return prisma.moduleMetricsDaily.findMany({
    where: { shopId, moduleId, date: { gte: since } },
    orderBy: { date: 'desc' },
    take: 90,
  });
}
