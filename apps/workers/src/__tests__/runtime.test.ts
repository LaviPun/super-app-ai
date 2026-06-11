import { describe, expect, it, vi } from 'vitest';
import { createWorkerBootstrapState } from '../bootstrap.js';
import { loadWorkerEnv } from '../env.js';
import { createWorkerRuntime } from '../runtime.js';

describe('worker runtime', () => {
  it('loads local-safe defaults', () => {
    const env = loadWorkerEnv({ NODE_ENV: 'test' });
    expect(env).toMatchObject({
      NODE_ENV: 'test',
      QUEUE_PROVIDER: 'memory',
      QUEUE_PREFIX: 'superapp-v2',
    });
  });

  it('requires Redis URL for BullMQ runtime config', () => {
    expect(() => loadWorkerEnv({
      NODE_ENV: 'production',
      QUEUE_PROVIDER: 'bullmq',
    })).toThrow();
  });

  it('starts and stops workers for every queue registration', async () => {
    const close = vi.fn(async () => undefined);
    const created: string[] = [];
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const env = loadWorkerEnv({
      NODE_ENV: 'test',
      QUEUE_PROVIDER: 'memory',
      WORKER_SHUTDOWN_TIMEOUT_MS: '1000',
    });

    const runtime = createWorkerRuntime({
      env,
      logger,
      workerFactory(queueName) {
        created.push(queueName);
        return { close };
      },
    });

    expect(runtime.started).toBe(true);
    expect(created).toHaveLength(createWorkerBootstrapState().registrations.length);
    await runtime.stop();
    expect(close).toHaveBeenCalledTimes(created.length);
  });
});
