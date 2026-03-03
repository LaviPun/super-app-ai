import { getPrisma } from '~/db.server';

export type JobType = 'AI_GENERATE'|'PUBLISH'|'CONNECTOR_TEST'|'FLOW_RUN'|'THEME_ANALYZE';
export type JobStatus = 'QUEUED'|'RUNNING'|'SUCCESS'|'FAILED';

export class JobService {
  async create(params: { shopId?: string; type: JobType; payload?: unknown }) {
    const prisma = getPrisma();
    return prisma.job.create({
      data: {
        shopId: params.shopId ?? null,
        type: params.type,
        status: 'QUEUED',
        payload: params.payload ? JSON.stringify(params.payload) : null,
      },
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
