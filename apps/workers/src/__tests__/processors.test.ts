import { describe, expect, it, vi } from 'vitest';
import { JobTypeSchema } from '@superapp/platform-contracts';
import { createProcessorRegistry } from '../processors.js';

describe('worker processors', () => {
  it('registers a contract-validating processor for every planned job type', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = createProcessorRegistry(logger);

    expect(Object.keys(registry).sort()).toEqual([...JobTypeSchema.options].sort());

    const result = await registry.AI_GENERATE({
      id: 'job-1',
      type: 'AI_GENERATE',
      queueName: 'ai-generation',
      payload: { prompt: 'Create a banner' },
      trace: { correlationId: 'corr-processor-1' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events.map((event) => event.type)).toEqual(['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED']);
    expect(result.events[1]?.message).toContain('RecipeSpec');

    const internalResult = await registry.INTERNAL_TOOL_RUN({
      id: 'job-internal-1',
      type: 'INTERNAL_TOOL_RUN',
      queueName: 'internal-tool-run',
      payload: { sessionId: 'sess-1', message: 'Summarize failed jobs' },
      trace: { correlationId: 'corr-internal-processor-1' },
    });
    expect(internalResult.status).toBe('SUCCESS');
  });

  it('rejects invalid job payloads through shared schemas', async () => {
    const registry = createProcessorRegistry({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    await expect(registry.PUBLISH({
      id: 'job-2',
      type: 'PUBLISH',
      queueName: 'publish-execution',
      payload: {},
      trace: { correlationId: 'corr-processor-2' },
    })).rejects.toThrow();
  });
});
