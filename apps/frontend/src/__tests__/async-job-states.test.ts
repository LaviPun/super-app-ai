import { describe, expect, it } from 'vitest';
import { resolveAsyncUxSnapshot } from '@/lib/async-job-states';
import type { WorkerEvent } from '@superapp/platform-contracts';

describe('resolveAsyncUxSnapshot', () => {
  it('maps AI generation validating metadata to validating phase', () => {
    const event: WorkerEvent = {
      type: 'JOB_PROGRESS',
      jobId: 'job-1',
      queueName: 'ai-generation',
      trace: { correlationId: 'corr-1' },
      timestamp: new Date().toISOString(),
      message: 'Validating RecipeSpec',
      progress: 72,
    };
    const snapshot = resolveAsyncUxSnapshot('AI_GENERATE', 'RUNNING', event);
    expect(snapshot.phase).toBe('validating');
    expect(snapshot.label).toContain('Validating');
  });

  it('maps publish success to published phase', () => {
    const snapshot = resolveAsyncUxSnapshot('PUBLISH', 'SUCCESS');
    expect(snapshot).toMatchObject({ phase: 'published', tone: 'success', canRetry: false });
  });

  it('maps connector auth failures', () => {
    const event: WorkerEvent = {
      type: 'JOB_FAILED',
      jobId: 'job-2',
      queueName: 'connector-execution',
      trace: { correlationId: 'corr-2' },
      timestamp: new Date().toISOString(),
      message: 'Auth failed for connector token',
    };
    const snapshot = resolveAsyncUxSnapshot('CONNECTOR_TEST', 'FAILED', event);
    expect(snapshot.phase).toBe('auth_failed');
    expect(snapshot.canRetry).toBe(true);
  });
});
