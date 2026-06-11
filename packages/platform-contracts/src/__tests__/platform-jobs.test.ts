import { describe, expect, it } from 'vitest';
import {
  PLATFORM_JOB_QUEUE_BY_TYPE,
  PLATFORM_QUEUE_REGISTRY,
  resolvePlatformQueue,
} from '../platform-jobs';

describe('platform job registry', () => {
  it('maps all platform job types to queues', () => {
    expect(PLATFORM_QUEUE_REGISTRY.queues).toContain('asset-storage');
    expect(PLATFORM_QUEUE_REGISTRY.queues).toContain('ai-generation');
    expect(resolvePlatformQueue('AI_GENERATE')).toBe('ai-generation');
    expect(resolvePlatformQueue('PREVIEW_EXPORT')).toBe('asset-storage');
    expect(Object.keys(PLATFORM_JOB_QUEUE_BY_TYPE)).toHaveLength(
      PLATFORM_QUEUE_REGISTRY.jobTypes.length,
    );
  });
});
