import { getPrisma } from '~/db.server';
import { getRequestContext } from '~/services/observability/correlation.server';

export type JobType = 'AI_GENERATE'|'AI_HYDRATE'|'AI_MODIFY'|'PUBLISH'|'CONNECTOR_TEST'|'FLOW_RUN'|'MESSAGING_RUN'|'HTTP_SYNC_RUN'|'THEME_ANALYZE';
export type JobStatus = 'QUEUED'|'RUNNING'|'SUCCESS'|'FAILED';

export class JobService {
  async create(params: { shopId?: string; type: JobType; payload?: unknown; requestId?: string; correlationId?: string }) {
    const prisma = getPrisma();
    const ctx = getRequestContext();
    const requestId = params.requestId ?? ctx?.requestId ?? null;
    const correlationId = params.correlationId ?? ctx?.correlationId ?? requestId;
    return prisma.job.create({
      data: {
        shop: params.shopId ? { connect: { id: params.shopId } } : undefined,
        type: params.type,
        status: 'QUEUED',
        payload: params.payload ? JSON.stringify(params.payload) : null,
        requestId,
        correlationId,
      },
    });
  }

  /**
   * WS-C commit-0 fold-in (b): merge additional fields into `Job.payload`
   * after creation. `jobs.create` now runs BEFORE classify (Task 4 moved
   * classify/RAG into `runGenerationPipeline`, called after the Job already
   * exists), so `classifiedType`/`intent`/exemplar metadata that used to be
   * known at create time is only available once the pipeline's `onIntent`
   * hook fires. Read-merge-write keeps whatever `create`/other callers
   * already stored (e.g. `promptLen`) rather than clobbering it.
   */
  async updatePayload(jobId: string, patch: Record<string, unknown>) {
    const prisma = getPrisma();
    const existing = await prisma.job.findUnique({ where: { id: jobId }, select: { payload: true } });
    let base: Record<string, unknown> = {};
    if (existing?.payload) {
      try {
        base = JSON.parse(existing.payload) as Record<string, unknown>;
      } catch {
        base = {};
      }
    }
    return prisma.job.update({
      where: { id: jobId },
      data: { payload: JSON.stringify({ ...base, ...patch }) },
    });
  }

  async start(jobId: string) {
    const prisma = getPrisma();
    return prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async succeed(jobId: string, result?: unknown) {
    const prisma = getPrisma();
    return prisma.job.update({
      where: { id: jobId },
      data: { status: 'SUCCESS', finishedAt: new Date(), result: result ? JSON.stringify(result) : null },
    });
  }

  async fail(jobId: string, error: unknown) {
    const prisma = getPrisma();
    return prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), error: String(error) },
    });
  }

  async listLatest(limit = 200) {
    const prisma = getPrisma();
    return prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { shop: true } });
  }
}
