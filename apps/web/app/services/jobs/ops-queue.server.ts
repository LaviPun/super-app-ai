import { Queue } from 'bullmq';
import { createRedisConnection, loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { JOB_EXECUTORS, isOwnedJobType, type OwnedJobType } from '~/services/jobs/job-executors.server';

/**
 * WS-G Task 14 (Decision G8). A SEPARATE, web-local BullMQ queue for the job
 * kinds this app owns end-to-end (CONNECTOR_TEST/FLOW_RUN/MESSAGING_RUN/
 * HTTP_SYNC_RUN/RESTOCK_WATCH_RUN/LOYALTY_ACCRUAL_RUN — see job-executors.server.ts).
 *
 * WS-C-consumption note: this deliberately does NOT reuse
 * `createBullMqQueueAdapter`/`enqueueWebJob`/`createWebWorkerRuntime`
 * (enqueue.server.ts / worker-runtime.server.ts). Those are typed against
 * `@superapp/platform-contracts`'s `PlatformJobType`/`PlatformQueueName` — a
 * LOCKED cross-service contract shared with the Cloudflare side (see the
 * doc comment on `WebJobEnvelope` in worker-runtime.server.ts: "it is not
 * extended"). None of this plan's six owned job kinds are part of that
 * registry, so extending it would violate WS-C's contract. Instead this
 * queue talks to BullMQ directly (same library, same Redis, same
 * `loadJobOrchestratorConfig`/`resolveEffectiveMode` mode seam WS-C uses) —
 * fully additive, zero overlap with the platform queue registry.
 */
const OPS_QUEUE_NAME = 'superapp-ops';

let _queue: Queue | null = null;

function opsQueue(): Queue {
  if (_queue) return _queue;
  const config = loadJobOrchestratorConfig();
  const connection = createRedisConnection(config);
  _queue = new Queue(OPS_QUEUE_NAME, {
    connection,
    prefix: config.queuePrefix,
    defaultJobOptions: {
      attempts: config.defaultAttempts,
      backoff: { type: 'exponential', delay: config.defaultBackoffMs },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
  return _queue;
}

export { OPS_QUEUE_NAME };

/**
 * Creates the Job row (bookkeeping, unchanged contract) AND, when queue mode
 * is reachable, enqueues it onto the real BullMQ "superapp-ops" queue for
 * scripts/worker.ts's Worker to consume. Falls back to inline execution
 * (calling the executor directly) when queue mode isn't configured — same
 * "inline vs queue" seam `@superapp/job-orchestration` already models
 * elsewhere, so dev machines without Redis keep working.
 */
export async function enqueueOwnedJob(input: {
  type: OwnedJobType;
  shopId?: string;
  payload: unknown;
  correlationId?: string;
}): Promise<{ jobId: string; queued: boolean }> {
  const jobs = new JobService();
  const job = await jobs.create({
    shopId: input.shopId,
    type: input.type,
    payload: input.payload,
    correlationId: input.correlationId,
  });

  const config = loadJobOrchestratorConfig();
  const mode = resolveEffectiveMode(config);
  if (mode !== 'queue') {
    // Inline fallback — execute now, still going through the same executor +
    // succeed/fail bookkeeping so behavior is identical to the queued path.
    await processOwnedJob({ id: job.id, type: job.type, payload: job.payload, shopId: job.shopId ?? undefined });
    return { jobId: job.id, queued: false };
  }

  await opsQueue().add(input.type, { jobId: job.id }, { jobId: job.id });
  return { jobId: job.id, queued: true };
}

/**
 * The worker processor: given a Job row (already fetched), runs its
 * executor and persists the outcome. Exported standalone so both
 * scripts/worker.ts (BullMQ Worker) and the inline fallback above call the
 * identical code path.
 */
export async function processOwnedJob(job: {
  id: string;
  type: string;
  payload: string | null;
  shopId?: string;
}): Promise<void> {
  const jobs = new JobService();
  if (!isOwnedJobType(job.type)) {
    await jobs.fail(job.id, new Error(`Job type ${job.type} is not in JOB_EXECUTORS (Decision G8) — cannot be processed by this worker`));
    return;
  }
  await jobs.start(job.id);
  try {
    let payload: unknown = null;
    if (job.payload) {
      try {
        payload = JSON.parse(job.payload);
      } catch {
        payload = job.payload;
      }
    }
    const result = await JOB_EXECUTORS[job.type](payload, { shopId: job.shopId });
    await jobs.succeed(job.id, result);
  } catch (err) {
    await jobs.fail(job.id, err);
  }
}

/**
 * Fetches the job row by the BullMQ job's stored jobId and processes it —
 * the actual bullmq Worker processor callback, wired in scripts/worker.ts.
 */
export async function processOwnedJobById(jobId: string): Promise<void> {
  const row = await getPrisma().job.findUnique({ where: { id: jobId } });
  if (!row) return; // job row gone (e.g. redacted shop) — nothing to do
  await processOwnedJob({ id: row.id, type: row.type, payload: row.payload, shopId: row.shopId ?? undefined });
}
