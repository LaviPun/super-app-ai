import { describe, expect, it } from 'vitest';
import { createJobOrchestrator } from '../job-orchestrator.js';
import type { JobHandler } from '../types.js';

describe('JobOrchestrator', () => {
  it('skips when execution mode is disabled', async () => {
    const orchestrator = createJobOrchestrator({
      config: {
        mode: 'disabled',
        queuePrefix: 'test',
        defaultAttempts: 3,
        defaultBackoffMs: 1000,
      },
    });

    const result = await orchestrator.enqueue({
      id: 'job_1',
      jobType: 'PREVIEW_EXPORT',
      payload: { type: 'PREVIEW_EXPORT' },
      trace: { correlationId: 'corr_1', shopId: 'shop_1' },
    });

    expect(result.status).toBe('skipped');
  });

  it('runs inline handlers when mode is inline', async () => {
    const handler: JobHandler = async (job) => ({
      status: 'SUCCESS',
      result: { ok: true, jobId: job.id },
    });

    const orchestrator = createJobOrchestrator({
      config: {
        mode: 'inline',
        queuePrefix: 'test',
        defaultAttempts: 3,
        defaultBackoffMs: 1000,
      },
      inlineHandlers: {
        'asset-storage': handler,
      },
    });

    const result = await orchestrator.enqueue({
      id: 'job_inline_1',
      jobType: 'PREVIEW_EXPORT',
      payload: {
        type: 'PREVIEW_EXPORT',
        jobId: 'job_inline_1',
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'asset_1',
        preview: { contentType: 'text/html', body: '<section>ok</section>' },
      },
      trace: { correlationId: 'corr_inline', shopId: 'shop_1' },
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.handlerResult.status).toBe('SUCCESS');
    }
  });

  it('rejects invalid envelopes', async () => {
    const orchestrator = createJobOrchestrator({
      config: {
        mode: 'inline',
        queuePrefix: 'test',
        defaultAttempts: 3,
        defaultBackoffMs: 1000,
      },
    });

    const result = await orchestrator.enqueue({
      id: 'job_bad',
      jobType: 'PREVIEW_EXPORT',
      payload: {},
      trace: { correlationId: '', shopId: 'shop_1' },
    });

    expect(result.status).toBe('invalid');
  });
});
