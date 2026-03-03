import { getPrisma } from '~/db.server';
import { PLAN_CONFIGS } from './billing.service';
import { AppError } from '~/services/errors/app-error.server';

export type QuotaKind = 'aiRequest' | 'publishOp' | 'workflowRun' | 'connectorCall';

/**
 * Server-side quota enforcement.
 * Checks usage this calendar month against plan limits.
 * Throws AppError with RATE_LIMITED if limit exceeded.
 */
export class QuotaService {
  async enforce(shopId: string, kind: QuotaKind): Promise<void> {
    const prisma = getPrisma();
    const sub = await prisma.appSubscription.findUnique({ where: { shopId } });
    const planName = sub?.planName ?? 'FREE';
    const config = PLAN_CONFIGS[planName as keyof typeof PLAN_CONFIGS] ?? PLAN_CONFIGS.FREE;

    const limit = this.limitFor(config.quotas, kind);
    if (limit === -1) return; // unlimited

    const monthStart = startOfMonth();
    const used = await this.countUsage(shopId, kind, monthStart);

    if (used >= limit) {
      throw new AppError({
        code: 'RATE_LIMITED',
        message: `Monthly ${kind} quota exceeded. You've used ${used}/${limit} on the ${config.displayName} plan. Upgrade to get more.`,
        details: { kind, used: String(used), limit: String(limit), plan: planName },
      });
    }
  }

  async getUsageSummary(shopId: string) {
    const prisma = getPrisma();
    const sub = await prisma.appSubscription.findUnique({ where: { shopId } });
    const planName = sub?.planName ?? 'FREE';
    const config = PLAN_CONFIGS[planName as keyof typeof PLAN_CONFIGS] ?? PLAN_CONFIGS.FREE;
    const monthStart = startOfMonth();

    const [aiRequests, publishOps, workflowRuns, connectorCalls] = await Promise.all([
      this.countUsage(shopId, 'aiRequest', monthStart),
      this.countUsage(shopId, 'publishOp', monthStart),
      this.countUsage(shopId, 'workflowRun', monthStart),
      this.countUsage(shopId, 'connectorCall', monthStart),
    ]);

    return {
      plan: planName,
      quotas: config.quotas,
      used: { aiRequests, publishOps, workflowRuns, connectorCalls },
    };
  }

  private limitFor(quotas: Record<string, number>, kind: QuotaKind): number {
    const map: Record<QuotaKind, keyof typeof quotas> = {
      aiRequest: 'aiRequestsPerMonth',
      publishOp: 'publishOpsPerMonth',
      workflowRun: 'workflowRunsPerMonth',
      connectorCall: 'connectorCallsPerMonth',
    };
    return quotas[map[kind]] ?? 0;
  }

  private async countUsage(shopId: string, kind: QuotaKind, since: Date): Promise<number> {
    const prisma = getPrisma();

    if (kind === 'aiRequest') {
      const result = await prisma.aiUsage.aggregate({
        where: { shopId, createdAt: { gte: since } },
        _sum: { requestCount: true },
      });
      return result._sum.requestCount ?? 0;
    }

    if (kind === 'publishOp' || kind === 'workflowRun') {
      const type = kind === 'publishOp' ? 'PUBLISH' : 'FLOW_RUN';
      return prisma.job.count({
        where: { shopId, type, status: { in: ['SUCCESS', 'RUNNING', 'QUEUED'] }, createdAt: { gte: since } },
      });
    }

    if (kind === 'connectorCall') {
      return prisma.apiLog.count({
        where: { shopId, actor: 'MERCHANT', path: { contains: '/connector' }, createdAt: { gte: since } },
      });
    }

    return 0;
  }
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
