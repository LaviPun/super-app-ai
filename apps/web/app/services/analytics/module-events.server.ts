/**
 * Module analytics event ingestion (doc 24.4.2, Section 30).
 * Writes to module_events; aggregation to module_metrics_daily can be done by a job.
 */

import { getPrisma } from '~/db.server';

export type ModuleEventInput = {
  shopId: string;
  moduleId: string;
  instanceId?: string | null;
  revisionId?: string | null;
  recipeId?: string | null;
  category?: string | null;
  surfaceType?: string | null;
  target?: string | null;
  templateContext?: string | null;
  sessionId?: string | null;
  visitorId?: string | null;
  userType?: string | null;
  eventName: string;
  eventProperties?: Record<string, unknown> | null;
  valueMetrics?: Record<string, unknown> | null;
  piiFlags?: Record<string, boolean> | null;
  correlationIds?: Record<string, string> | null;
};

export async function ingestModuleEvent(input: ModuleEventInput): Promise<string> {
  const prisma = getPrisma();
  const row = await prisma.moduleEvent.create({
    data: {
      shopId: input.shopId,
      moduleId: input.moduleId,
      instanceId: input.instanceId ?? null,
      revisionId: input.revisionId ?? null,
      recipeId: input.recipeId ?? null,
      category: input.category ?? null,
      surfaceType: input.surfaceType ?? null,
      target: input.target ?? null,
      templateContext: input.templateContext ?? null,
      sessionId: input.sessionId ?? null,
      visitorId: input.visitorId ?? null,
      userType: input.userType ?? null,
      eventName: input.eventName,
      eventProperties: input.eventProperties ? JSON.stringify(input.eventProperties) : null,
      valueMetrics: input.valueMetrics ? JSON.stringify(input.valueMetrics) : null,
      piiFlags: input.piiFlags ? JSON.stringify(input.piiFlags) : null,
      correlationIds: input.correlationIds ? JSON.stringify(input.correlationIds) : null,
    },
  });
  return row.id;
}

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

export async function getRecentModuleEvents(shopId: string, moduleId: string, limit = 50) {
  const prisma = getPrisma();
  return prisma.moduleEvent.findMany({
    where: { shopId, moduleId },
    orderBy: { timestamp: 'desc' },
    take: limit,
    select: {
      id: true,
      timestamp: true,
      eventName: true,
      eventProperties: true,
      surfaceType: true,
      target: true,
    },
  });
}
