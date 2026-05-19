import { describe, expect, it, vi } from 'vitest';
import { InMemoryJobLedgerRepository, createQueuedJob } from '@superapp/db';
import { createInternalAssistantProcessor } from '../internal-assistant.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('internal assistant worker boundary', () => {
  it('runs internal assistant jobs through an isolated adapter', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'INTERNAL_TOOL_RUN',
      payload: {
        sessionId: 'sess-1',
        message: 'Summarize failed jobs',
        target: 'localMachine',
        clientRequestId: 'request-abc',
      },
      trace: { correlationId: 'corr-internal-1' },
    });
    const adapter = {
      run: vi.fn(async () => ({
        reply: 'There are no failed jobs.',
        target: 'localMachine' as const,
        backend: 'test' as const,
        model: 'test-model',
        tokensIn: 32,
        tokensOut: 16,
      })),
    };
    const processor = createInternalAssistantProcessor({ adapter, jobRepository: repository, logger });

    const result = await processor({
      id: record.id,
      type: 'INTERNAL_TOOL_RUN',
      queueName: 'internal-tool-run',
      payload: record.payload,
      trace: record.trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events.map((event) => event.type)).toEqual(['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED']);
    expect(adapter.run).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sess-1',
      target: 'localMachine',
    }));
    expect((await repository.findById(record.id))?.status).toBe('SUCCESS');
  });

  it('enforces local-only policy before adapter execution', async () => {
    const adapter = { run: vi.fn() };
    const processor = createInternalAssistantProcessor({ adapter, logger, localOnly: true });

    await expect(processor({
      id: 'job-internal-2',
      type: 'INTERNAL_TOOL_RUN',
      queueName: 'internal-tool-run',
      payload: {
        sessionId: 'sess-2',
        message: 'Use cloud target',
        target: 'modalRemote',
      },
      trace: { correlationId: 'corr-internal-2' },
    })).rejects.toThrow('INTERNAL_AI_LOCAL_ONLY');
    expect(adapter.run).not.toHaveBeenCalled();
  });
});
