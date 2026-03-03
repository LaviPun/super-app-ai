import { getPrisma } from '~/db.server';
import { getPlanConfig } from './plan-config.service';
import { AppError } from '~/services/errors/app-error.server';

export type QuotaKind = 'aiRequest' | 'publishOp' | 'workflowRun' | 'connectorCall' | 'moduleCount';

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
    const config = await getPlanConfig(planName);

    const limit = this.limitFor(config.quotas, kind);
    if (limit === -1) return; // unlimited

    const since = kind === 'moduleCount' ? new Date(0) : startOfMonth();
    const used = await this.countUsage(shopId, kind, since);

    if (used >= limit) {
      const msg = kind === 'moduleCount'
        ? `Module limit reached. You have ${used}/${limit} published modules on the ${config.displayName} plan. Upgrade or delete an existing module to add more.`
        : `Monthly ${kind} quota exceeded. You've used ${used}/${limit} on the ${config.displayName} plan. Upgrade to get more.`;
      throw new AppError({
        code: 'RATE_LIMITED',
        message: msg,
        details: { kind, used: String(used), limit: String(limit), plan: planName },
      });
    }
  }

  async getUsageSummary(shopId: string) {
    const prisma = getPrisma();
    const sub = await prisma.appSubscription.findUnique({ where: { shopId } });
    const planName = sub?.planName ?? 'FREE';
    const config = await getPlanConfig(planName);
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
    const map: Record<QuotaKind, string> = {
      aiRequest: 'aiRequestsPerMonth',
      publishOp: 'publishOpsPerMonth',
      workflowRun: 'workflowRunsPerMonth',
      connectorCall: 'connectorCallsPerMonth',
      moduleCount: 'modulesTotal',
    };
    return quotas[map[kind]] ?? 0;
  }

  private async countUsage(shopId: string, kind: QuotaKind, _since: Date): Promise<number> {
    const prisma = getPrisma();

    if (kind === 'aiRequest') {
      const result = await prisma.aiUsage.aggregate({
        where: { shopId, createdAt: { gte: _since } },
        _sum: { requestCount: true },
      });
      return result._sum.requestCount ?? 0;
    }

    if (kind === 'publishOp' || kind === 'workflowRun') {
      const type = kind === 'publishOp' ? 'PUBLISH' : 'FLOW_RUN';
      return prisma.job.count({
        where: { shopId, type, status: { in: ['SUCCESS', 'RUNNING', 'QUEUED'] }, createdAt: { gte: _since } },
      });
    }

    if (kind === 'connectorCall') {
      return prisma.apiLog.count({
        where: { shopId, actor: 'MERCHANT', path: { contains: '/connector' }, createdAt: { gte: _since } },
      });
    }

    // moduleCount: total active (published) modules — not time-bounded
    if (kind === 'moduleCount') {
      return prisma.module.count({
        where: { shopId, status: 'PUBLISHED' },
      });
    }

    return 0;
  }
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
