import { getPrisma } from '~/db.server';
import { getRequestContext } from '~/services/observability/correlation.server';
import type { AppErrorPayload } from '~/services/errors/app-error.server';
import { OpsAlertService, markOpsAlerted } from '~/services/observability/ops-alert.server';

export type JobType = 'AI_GENERATE'|'AI_HYDRATE'|'AI_MODIFY'|'PUBLISH'|'CONNECTOR_TEST'|'FLOW_RUN'|'MESSAGING_RUN'|'HTTP_SYNC_RUN'|'RESTOCK_WATCH_RUN'|'LOYALTY_ACCRUAL_RUN'|'THEME_ANALYZE';
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
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), error: String(error) },
    });
    await new OpsAlertService()
      .fire({
        kind: 'JOB_FAILED',
        message: `Job ${jobId} (${updated.type}) failed: ${String(error)}`,
        error,
        context: { jobId, jobType: updated.type },
      })
      .catch(() => {});
    // Double-alert seam fix: this failure may still be rethrown by the caller
    // and land in an outer withApiLogging catch (e.g. an inline-executed job
    // whose route awaits it directly) — mark it so that catch doesn't fire a
    // second, redundant API_REQUEST_FAILED alert for the same underlying
    // failure this JOB_FAILED alert already covers.
    markOpsAlerted(error);
    return updated;
  }

  /**
   * WS-C Task 5: async worker jobs have no HTTP response to carry a typed
   * error to the client — the poll route (Task 6) reads `Job.error` back out
   * and re-hydrates it as the same `AppErrorPayload` shape the inline routes
   * return directly. Never a bare `String(e)` (D8, no silent failures).
   */
  async failWithPayload(jobId: string, payload: AppErrorPayload) {
    const prisma = getPrisma();
    return prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), error: JSON.stringify(payload) },
    });
  }

  /**
   * WS-C final review (IMPORTANT-2a): atomically fails a Job ONLY if it is
   * still RUNNING. Used by `worker-runtime.server.ts`'s BullMQ `'failed'`
   * event handler to reconcile a row after a worker hard-crash (SIGKILL/
   * OOM) or a stall BullMQ gave up retrying — neither runs the normal
   * processor code path (`failWithPayload` above) that would otherwise
   * finalize this row, so without this it stays RUNNING forever, invisible
   * to `/internal/funnel` and spinning the merchant's poll indefinitely.
   *
   * The `status: 'RUNNING'` guard inside the WHERE clause (not a separate
   * read-then-write) makes this atomically race-safe against the normal
   * processor path finishing around the same moment — it can never clobber
   * a SUCCESS/FAILED row a processor already wrote. This reuses the exact
   * same `AppErrorPayload` JSON shape `failWithPayload` writes (same
   * single-writer discipline / terminal-write format), it's just a
   * conditional variant needed only because THIS call site races with the
   * processor in a way no HTTP route call site does.
   *
   * Returns true iff it actually flipped the row (false when the row was
   * already terminal, or unknown — both are legitimate no-ops here).
   */
  async failIfStillRunning(jobId: string, payload: AppErrorPayload): Promise<boolean> {
    const prisma = getPrisma();
    const result = await prisma.job.updateMany({
      where: { id: jobId, status: 'RUNNING' },
      data: { status: 'FAILED', finishedAt: new Date(), error: JSON.stringify(payload) },
    });
    return result.count > 0;
  }

  /** WS-C Task 5: coarse pipeline-stage progress for async jobs (see Job.stage). */
  async setStage(jobId: string, stage: string) {
    const prisma = getPrisma();
    return prisma.job.update({ where: { id: jobId }, data: { stage } });
  }

  /**
   * WS-C Task 6. Fetch a Job (with its persisted generation options) scoped
   * to a shop — the poll route's ONLY read path. Returns null for an
   * unknown job id AND for a job that belongs to a different shop (or has
   * no shop at all) — the caller can't tell those apart, which is the
   * point: a merchant polling another shop's jobId gets the same 404 as
   * polling a jobId that doesn't exist.
   */
  async getForShop(jobId: string, shopDomain: string) {
    const prisma = getPrisma();
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { shop: true, generationOptions: { orderBy: { idx: 'asc' } } },
    });
    if (!job || job.shop?.shopDomain !== shopDomain) return null;
    return job;
  }

  async listLatest(limit = 200) {
    const prisma = getPrisma();
    return prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { shop: true } });
  }
}
