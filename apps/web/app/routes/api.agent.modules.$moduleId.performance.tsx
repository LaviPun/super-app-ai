import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { getModulePerformanceSummary } from '~/services/analytics/module-performance.server';

/**
 * Agent API: Aggregated performance for a module.
 *
 * GET /api/agent/modules/:moduleId/performance?days=30
 *
 * Reads the daily module metrics and folds them into totals + a per-day series.
 * READ-ONLY. Shares the exact aggregation the Sidekick data extension uses
 * (`getModulePerformanceSummary`), so the two surfaces can never disagree.
 * Reports `available:false` when no metrics exist rather than fabricating zeros.
 */
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { moduleId?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const daysRaw = Number(new URL(request.url).searchParams.get('days'));
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, Math.trunc(daysRaw))) : 30;

  const prisma = getPrisma();
  const mod = await prisma.module.findFirst({
    where: { id: moduleId, shop: { shopDomain: session.shop } },
    select: { id: true, shopId: true, name: true, type: true, status: true },
  });
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  const performance = await getModulePerformanceSummary(mod.shopId, moduleId, days);

  return json({
    ok: true,
    moduleId,
    name: mod.name,
    type: mod.type,
    status: mod.status,
    performance,
  });
}
