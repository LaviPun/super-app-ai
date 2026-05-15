import { getPrisma } from '~/db.server';
import type { RolloutMetrics } from '~/services/releases/rollout-policy.service';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export async function getRecentPublishMetrics(input: {
  shopId?: string;
  paths?: string[];
  windowMinutes?: number;
}): Promise<RolloutMetrics> {
  const prisma = getPrisma();
  const windowMinutes = input.windowMinutes ?? 30;
  const paths = input.paths ?? ['/api/publish'];
  const since = new Date(Date.now() - windowMinutes * 60_000);

  const logs = await prisma.apiLog.findMany({
    where: {
      ...(input.shopId ? { shopId: input.shopId } : {}),
      path: { in: paths },
      createdAt: { gte: since },
      finishedAt: { not: null },
    },
    select: { success: true, status: true, durationMs: true },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  const sampleSize = logs.length;
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      errorRate: 0,
      p95LatencyMs: 0,
    };
  }

  const errorCount = logs.filter((log) => !log.success || log.status >= 500).length;
  const latencies = logs.map((log) => Math.max(0, log.durationMs));

  return {
    sampleSize,
    errorRate: errorCount / sampleSize,
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

