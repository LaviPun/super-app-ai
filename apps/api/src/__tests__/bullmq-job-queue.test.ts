import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.js';
import { BullMqJobQueue } from '../services/queue/bullmq-job-queue.js';
import type { JobRecord } from '@superapp/platform-contracts';

const addMock = vi.fn(async (_name: string, _payload: unknown, options?: { jobId?: string }) => ({
  id: options?.jobId ?? 'bull-job-1',
}));
const getStateMock = vi.fn(async () => 'waiting');
const getJobMock = vi.fn(async () => ({ getState: getStateMock }));
const closeMock = vi.fn(async () => undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: addMock,
    getJob: getJobMock,
    close: closeMock,
  })),
}));

const env: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  API_SERVICE_VERSION: 'test',
  JOB_EXECUTION_MODE: 'queue',
  QUEUE_PROVIDER: 'bullmq',
  JOB_STORE_PROVIDER: 'memory',
  QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
  QUEUE_PREFIX: 'test',
  QUEUE_DEFAULT_ATTEMPTS: 3,
  QUEUE_DEFAULT_BACKOFF_MS: 100,
};

const record: JobRecord = {
  id: 'job_000001',
  type: 'AI_GENERATE',
  queueName: 'ai-generation',
  status: 'QUEUED',
  payload: { prompt: 'hello' },
  trace: { correlationId: 'corr-bullmq-1' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('BullMqJobQueue', () => {
  beforeEach(() => {
    addMock.mockClear();
    getStateMock.mockClear();
    getJobMock.mockClear();
    closeMock.mockClear();
  });

  it('adds typed jobs to the planned queue', async () => {
    const queue = new BullMqJobQueue(env);
    const result = await queue.enqueue({
      record,
      request: {
        type: record.type,
        payload: record.payload,
        trace: record.trace,
      },
    });

    expect(result).toEqual({ transportJobId: record.id, queueName: 'ai-generation' });
    expect(addMock).toHaveBeenCalledWith(
      'AI_GENERATE',
      expect.objectContaining({ jobId: record.id, payload: record.payload }),
      expect.objectContaining({ jobId: record.id, attempts: 3 }),
    );
    await queue.close();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('reads BullMQ transport state by queue and job id', async () => {
    const queue = new BullMqJobQueue(env);
    const status = await queue.getStatus(record.id, record.queueName);
    expect(status).toBe('queued');
    expect(getJobMock).toHaveBeenCalledWith(record.id);
  });
});
