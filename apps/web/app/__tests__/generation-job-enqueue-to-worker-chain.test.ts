/**
 * WS-C Task 5 — carried test requirement: at least one TRUE
 * enqueue -> runtime chain test (enqueueWebJob -> worker runtime picks it up
 * -> processor runs -> observable result), not just two-halves tests that
 * mock the pieces this task is supposed to wire together.
 *
 * Everything genuinely internal to WS-C is REAL here: `enqueueWebJob` (Task
 * 1), `createWebWorkerRuntime` (Task 1), `buildWorkerHandlers`'s
 * `ai-generation` dispatch (Task 5), and `createAiGenerationJobHandler`
 * (Task 5). Only true external boundaries are mocked: BullMQ's `Worker`
 * class + `ioredis` (no real Redis needed for this test — see
 * worker-runtime.test.ts for the same pattern), `shopify.server`'s admin
 * context, `db.server`'s Prisma client, `JobService`'s DB writes, and
 * `runGenerationPipeline`'s actual LLM-calling internals (that orchestration
 * is Task 4's own, already-tested unit).
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  GenerationPipelineInput,
  GenerationPipelineHooks,
  GenerationPipelineResult,
} from '~/services/ai/generation-pipeline.server';

const workerCtor = vi.fn();
vi.mock('bullmq', () => ({
  Worker: class {
    opts: unknown;
    processor: (job: unknown) => Promise<unknown>;
    // WS-C final review (IMPORTANT-2a): createWebWorkerRuntime now registers
    // a `'failed'` listener on every constructed Worker — this stub must
    // support `.on()` or that registration throws at construction time.
    constructor(queueName: string, processor: (job: unknown) => Promise<unknown>, opts: unknown) {
      workerCtor(queueName, opts);
      this.processor = processor;
      this.opts = opts;
    }
    on() {
      return this;
    }
    close = vi.fn(async () => {});
  },
}));
vi.mock('ioredis', () => ({
  default: class {
    quit = vi.fn(async () => {});
  },
}));

const hoisted = vi.hoisted(() => ({
  jobStart: vi.fn(async () => {}),
  jobSetStage: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  jobUpdatePayload: vi.fn(async () => {}),
  optionUpsert: vi.fn(async () => ({})),
  optionUpdateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { unauthenticated: { admin: vi.fn(async () => ({ admin: {} })) } },
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiGenerationOption: { upsert: hoisted.optionUpsert, updateMany: hoisted.optionUpdateMany },
  }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    start = hoisted.jobStart;
    setStage = hoisted.jobSetStage;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
    failWithPayload = hoisted.jobFailWithPayload;
    updatePayload = hoisted.jobUpdatePayload;
  },
}));
vi.mock('~/services/ai/generation-pipeline.server', () => ({
  runGenerationPipeline: vi.fn(
    async (
      _input: GenerationPipelineInput,
      hooks: GenerationPipelineHooks,
    ): Promise<GenerationPipelineResult> => {
      await hooks.onOption?.({
        index: 0,
        approach: 'polished',
        option: { explanation: 'e0', recipe: { type: 'theme.section', name: 'A' } as never },
        durationMs: 5,
      });
      await hooks.onRanking?.({ recommendedIndex: 0, scores: [{ index: 0, score: 1, badges: [] }] });
      return { validCount: 1, moduleType: 'theme.section', collected: new Map([[0, {} as never]]) };
    },
  ),
}));
vi.mock('~/services/ai/llm.server', () => ({
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
  },
}));

import { enqueueWebJob, type EnqueueWebJobAdapter } from '~/services/jobs/enqueue.server';
import { createWebWorkerRuntime } from '~/services/jobs/worker-runtime.server';
import { buildWorkerHandlers } from '~/services/jobs/processors/index';

describe('WS-C Task 5: enqueue -> worker runtime -> processor -> observable result', () => {
  it('a job enqueued via enqueueWebJob, handed to a real createWebWorkerRuntime Worker, runs the real ai-generation dispatch and processor end to end', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';

    // 1. ENQUEUE — real enqueueWebJob, fake adapter standing in for BullMQ's
    // Queue#add (the same seam Task 1's own test uses for enqueueWebJob).
    let captured: { id: string; queueName: string; jobType: string; payload: Record<string, unknown> } | undefined;
    const adapter: EnqueueWebJobAdapter = {
      enqueue: async (input) => {
        captured = input;
        return { queueName: input.queueName, jobId: input.id };
      },
    };
    const enqueueResult = await enqueueWebJob(
      {
        id: 'job-chain-1',
        jobType: 'AI_GENERATE',
        payload: {
          kind: 'WEB_AI_GENERATE',
          shopId: 'shop-1',
          shopDomain: 'x.myshopify.com',
          prompt: 'make a banner',
          preferredType: 'Auto',
          preferredCategory: 'Auto',
          preferredBlockType: 'Auto',
          matchStoreColors: true,
          optionCount: 3,
          planTier: 'BASIC',
        },
        trace: { correlationId: 'corr-chain-1', shopId: 'shop-1' },
        opts: { attempts: 2 },
      },
      { adapter },
    );
    expect(enqueueResult).toEqual({ queueName: 'ai-generation', jobId: 'job-chain-1' });
    expect(captured).toBeDefined();
    // enqueueWebJob embeds the trace into the payload (BullMQ only transmits
    // payload) — this is the exact contract the worker runtime's envelope
    // rebuild (below) depends on.
    expect(captured!.payload.trace).toEqual({ correlationId: 'corr-chain-1', shopId: 'shop-1' });

    // 2. WORKER RUNTIME — real createWebWorkerRuntime + real buildWorkerHandlers,
    // only the BullMQ Worker class itself is faked (captures the processor).
    // WS-C Task 9 registers a SECOND handler (the `publish` queue) alongside
    // `ai-generation` — the worker always mounts both once handlers exist
    // for both queues, regardless of PUBLISH_ASYNC_ENABLED (that flag only
    // gates whether `api.publish.tsx` ever enqueues onto it).
    const runtime = createWebWorkerRuntime({ handlers: buildWorkerHandlers() });
    expect(runtime.workers).toHaveLength(2);
    expect(workerCtor).toHaveBeenCalledWith('ai-generation', expect.objectContaining({ prefix: 'superapp' }));
    expect(workerCtor).toHaveBeenCalledWith('publish', expect.objectContaining({ prefix: 'superapp' }));

    // 3. PICK UP — hand the runtime EXACTLY what a real BullMQ Job would carry
    // (id/name/data), built straight from what enqueueWebJob captured — this
    // is "the runtime picks up the enqueued job", not a hand-rolled envelope.
    // `Object.keys` preserves insertion order for string keys, so the
    // `ai-generation` handler (registered first in buildWorkerHandlers) is
    // still workers[0].
    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    const bullJob = { id: captured!.id, name: captured!.jobType, data: captured!.payload };
    const processorResult = await w.processor(bullJob);

    // 4. OBSERVABLE RESULT — the real ai-generation processor ran to
    // completion: it persisted the option, wrote ranking, and succeeded the
    // Job through the (mocked-at-the-DB-boundary-only) JobService.
    expect(processorResult).toEqual({ optionCount: 1 });
    expect(hoisted.jobStart).toHaveBeenCalledWith('job-chain-1');
    expect(hoisted.jobSetStage).toHaveBeenCalledWith('job-chain-1', 'classifying');
    expect(hoisted.optionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId_idx: { jobId: 'job-chain-1', idx: 0 } } }),
    );
    expect(hoisted.jobSucceed).toHaveBeenCalledWith(
      'job-chain-1',
      expect.objectContaining({ optionCount: 1, recommendedIndex: 0, type: 'theme.section' }),
    );
    expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();

    await runtime.close();
  });
});
