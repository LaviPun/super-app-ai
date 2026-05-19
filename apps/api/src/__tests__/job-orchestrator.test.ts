import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../env.js';
import { InMemoryJobStore } from '../services/jobs/job-store.js';
import { JobOrchestrator } from '../services/jobs/job-orchestrator.js';
import { InMemoryJobQueue } from '../services/queue/job-queue.js';

const env: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  API_SERVICE_VERSION: 'test',
  JOB_EXECUTION_MODE: 'queue',
  QUEUE_PROVIDER: 'memory',
  JOB_STORE_PROVIDER: 'memory',
  QUEUE_PREFIX: 'test',
  QUEUE_DEFAULT_ATTEMPTS: 2,
  QUEUE_DEFAULT_BACKOFF_MS: 10,
};

describe('JobOrchestrator', () => {
  it('stores, queues, and emits progress event without executing work', async () => {
    const store = new InMemoryJobStore();
    const queue = new InMemoryJobQueue();
    const orchestrator = new JobOrchestrator({ env, store, queue });

    const result = await orchestrator.enqueue({
      type: 'CONNECTOR_CALL',
      payload: { connectorId: 'conn-1', endpointId: 'endpoint-1', input: { ping: true } },
      trace: { correlationId: 'corr-orch-1' },
    });

    expect(result).toMatchObject({
      status: 'QUEUED',
      queueName: 'connector-execution',
      deduped: false,
    });
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.events).toHaveLength(1);
    expect(queue.events[0]?.type).toBe('JOB_QUEUED');
    expect(await store.get(result.jobId)).toMatchObject({
      status: 'QUEUED',
      payload: { connectorId: 'conn-1', endpointId: 'endpoint-1', input: { ping: true } },
    });
  });

  it('deduplicates by idempotency key and does not enqueue twice', async () => {
    const store = new InMemoryJobStore();
    const queue = new InMemoryJobQueue();
    const orchestrator = new JobOrchestrator({ env, store, queue });

    const request = {
      type: 'RETENTION_RUN' as const,
      payload: { policy: 'jobs' },
      idempotencyKey: 'retention-jobs-daily',
      trace: { correlationId: 'corr-orch-2' },
    };

    const first = await orchestrator.enqueue(request);
    const second = await orchestrator.enqueue(request);

    expect(second.jobId).toBe(first.jobId);
    expect(second.deduped).toBe(true);
    expect(queue.enqueued).toHaveLength(1);
  });

  it('rejects enqueue when execution mode is disabled', async () => {
    const orchestrator = new JobOrchestrator({
      env: { ...env, JOB_EXECUTION_MODE: 'disabled' },
      store: new InMemoryJobStore(),
      queue: new InMemoryJobQueue(),
    });

    await expect(orchestrator.enqueue({
      type: 'AI_GENERATE',
      payload: { prompt: 'hello' },
      trace: { correlationId: 'corr-orch-3' },
    })).rejects.toMatchObject({ code: 'JOB_EXECUTION_DISABLED' });
  });
});
