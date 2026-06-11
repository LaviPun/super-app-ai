import { afterEach, describe, expect, it } from 'vitest';
import { schedulePreviewExport } from './preview-export.queue.server';

describe('schedulePreviewExport', () => {
  const originalFlag = process.env.PREVIEW_EXPORT_QUEUE_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.PREVIEW_EXPORT_QUEUE_ENABLED;
    } else {
      process.env.PREVIEW_EXPORT_QUEUE_ENABLED = originalFlag;
    }
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

  it('returns a validated asset-storage payload when enabled', async () => {
    process.env.PREVIEW_EXPORT_QUEUE_ENABLED = '1';

    const result = await schedulePreviewExport({
      shopId: 'shop_1',
      moduleId: 'module_1',
      revisionId: 'rev_1',
      html: '<section>Preview</section>',
    });

    expect(result.status).toBe('queued');
    if (result.status !== 'queued') return;

    expect(result.queueName).toBe('asset-storage');
    expect(result.payload.type).toBe('PREVIEW_EXPORT');
    expect(result.payload.preview.body).toContain('Preview');
  });
});
