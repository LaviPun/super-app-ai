import {
  createBullMqQueueAdapter,
  loadJobOrchestratorConfig,
  resolveEffectiveMode,
  type JobQueueAdapter,
} from '@superapp/job-orchestration';
import {
  resolvePlatformQueue,
  type JobTrace,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';

let sharedAdapter: JobQueueAdapter | undefined;

/** True when the effective job-orchestrator mode is 'queue' (Redis configured). */
export function isAsyncJobsEnabled(): boolean {
  return resolveEffectiveMode(loadJobOrchestratorConfig()) === 'queue';
}

export type EnqueueWebJobInput = {
  /** Prisma Job.id — doubles as the BullMQ jobId (queue-level dedupe). */
  id: string;
  jobType: PlatformJobType;
  payload: Record<string, unknown>;
  trace: JobTrace;
  opts?: { attempts?: number };
};

/**
 * Narrower than `JobQueueAdapter`: this codebase only ever enqueues with a
 * concrete `Record<string, unknown>` payload (never `unknown`), so the
 * `payload` field is typed accordingly here. `JobQueueAdapter.enqueue`
 * (payload: unknown) still satisfies this structurally — Record<string,
 * unknown> is assignable to unknown — so the real BullMQ adapter needs no
 * cast; this only exists to let tests supply a minimal fake adapter without
 * fighting `unknown`'s non-assignability into a narrower mock signature.
 */
export type EnqueueWebJobAdapter = {
  enqueue: (input: {
    id: string;
    queueName: PlatformQueueName;
    jobType: PlatformJobType;
    payload: Record<string, unknown>;
    trace: JobTrace;
    opts?: { attempts?: number; backoffMs?: number };
  }) => Promise<{ queueName: PlatformQueueName; jobId: string }>;
  close?: () => Promise<void>;
};

export async function enqueueWebJob(
  input: EnqueueWebJobInput,
  deps?: { adapter?: EnqueueWebJobAdapter },
): Promise<{ queueName: PlatformQueueName; jobId: string }> {
  const adapter =
    deps?.adapter ??
    (sharedAdapter ??= createBullMqQueueAdapter({ config: loadJobOrchestratorConfig() }));
  const queueName = resolvePlatformQueue(input.jobType);
  return adapter.enqueue({
    id: input.id,
    queueName,
    jobType: input.jobType,
    // Trace rides in the payload — createBullMqQueueAdapter transmits payload only.
    payload: { ...input.payload, trace: input.trace },
    trace: input.trace,
    ...(input.opts ? { opts: input.opts } : {}),
  });
}
