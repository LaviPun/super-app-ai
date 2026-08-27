import { describe, expect, it, vi } from 'vitest';
import { createWorkerBootstrapState } from '../bootstrap.js';
import { loadWorkerEnv } from '../env.js';
import { createWorkerRuntime } from '../runtime.js';
import { createProcessorRegistry } from '../processors.js';
import type { AiGenerationAdapter } from '../ai-generation.js';

// WS-C Task 17: the built-in stub AI adapter was removed — `createWorkerRuntime`'s
// default (`createProcessorRegistry(logger)`, no adapter) now throws. This
// test isn't about AI generation, it's about the runtime starting/stopping a
// worker per queue registration, so it supplies its own local double via an
// explicit `processors` registry rather than relying on the (now-removed)
// silent default. NOTE: production's `main.ts` still calls
// `createWorkerRuntime({ env, logger })` with no adapter — that is
// deliberately left throwing at boot; WS-C's real AI generation runs in
// apps/web, and apps/workers (V2) is delete-ready for WS-I.
function unusedAiAdapter(): AiGenerationAdapter {
  return {
    generate: () => Promise.reject(new Error('not used')),
    hydrate: () => Promise.reject(new Error('not used')),
    modify: () => Promise.reject(new Error('not used')),
  };
}

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
      processors: createProcessorRegistry({ logger, aiAdapter: unusedAiAdapter() }),
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
