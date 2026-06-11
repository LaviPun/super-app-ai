import { describe, expect, it, vi } from 'vitest';
import { createPublishProcessor, createStubPublishExecutionAdapter } from '../publish-execution.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('publish execution worker', () => {
  it('runs runPublishJob via stub adapter and emits completion events', async () => {
    const processor = createPublishProcessor({ logger, adapter: createStubPublishExecutionAdapter() });
    const result = await processor({
      id: 'job-publish-1',
      type: 'PUBLISH',
      queueName: 'publish-execution',
      payload: { moduleId: 'mod_123', versionId: 'ver_123' },
      trace: { correlationId: 'corr-publish-1', shopId: 'shop_123' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events.map((event) => event.type)).toEqual(['JOB_STARTED', 'JOB_COMPLETED']);
    expect(result.events[1]?.metadata).toMatchObject({ publishStatus: 'published' });
  });

  it('short-circuits dry-run publishes without Shopify apply', async () => {
    const processor = createPublishProcessor({ logger });
    const result = await processor({
      id: 'job-publish-dry',
      type: 'PUBLISH',
      queueName: 'publish-execution',
      payload: { moduleId: 'mod_123', dryRun: true },
      trace: { correlationId: 'corr-publish-dry' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events[1]?.message).toContain('Dry-run');
  });
});
