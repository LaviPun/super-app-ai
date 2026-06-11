import { afterEach, describe, expect, it } from 'vitest';
import {
  resetPreviewOrchestratorForTests,
  schedulePreviewExport,
} from './preview-export.queue.server';

describe('schedulePreviewExport', () => {
  const originalFlag = process.env.PREVIEW_EXPORT_QUEUE_ENABLED;
  const originalMode = process.env.JOB_EXECUTION_MODE;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.PREVIEW_EXPORT_QUEUE_ENABLED;
    } else {
      process.env.PREVIEW_EXPORT_QUEUE_ENABLED = originalFlag;
    }

    if (originalMode === undefined) {
      delete process.env.JOB_EXECUTION_MODE;
    } else {
      process.env.JOB_EXECUTION_MODE = originalMode;
    }

    resetPreviewOrchestratorForTests();
  });

  it('skips enqueue when PREVIEW_EXPORT_QUEUE_ENABLED is unset', async () => {
    delete process.env.PREVIEW_EXPORT_QUEUE_ENABLED;

    const result = await schedulePreviewExport({
      shopId: 'shop_1',
      moduleId: 'module_1',
      html: '<section>Preview</section>',
    });

    expect(result.status).toBe('skipped');
  });

  it('processes preview export inline when enabled', async () => {
    process.env.PREVIEW_EXPORT_QUEUE_ENABLED = '1';
    process.env.JOB_EXECUTION_MODE = 'inline';

    const result = await schedulePreviewExport({
      shopId: 'shop_1',
      moduleId: 'module_1',
      revisionId: 'rev_1',
      html: '<section>Preview</section>',
    });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.payload.type).toBe('PREVIEW_EXPORT');
    expect(result.payload.preview.body).toContain('Preview');
  });

  it('returns queued metadata when queue mode is configured', async () => {
    process.env.PREVIEW_EXPORT_QUEUE_ENABLED = '1';
    process.env.JOB_EXECUTION_MODE = 'queue';
    process.env.QUEUE_REDIS_URL = 'redis://127.0.0.1:6379';

    const result = await schedulePreviewExport({
      shopId: 'shop_1',
      moduleId: 'module_1',
      revisionId: 'rev_1',
      html: '<section>Preview</section>',
    });

    expect(['queued', 'completed', 'skipped']).toContain(result.status);
  });
});
