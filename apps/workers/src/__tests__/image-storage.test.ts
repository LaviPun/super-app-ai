import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';
import { createImageStorageProcessor } from '../image-storage.js';
import { WorkerEventSchema } from '../worker-events.js';

describe('image storage worker processor', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('emits worker lifecycle events on successful preview export', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-worker-preview-'));
    const processor = createImageStorageProcessor({
      storage: new LocalStorageAdapter({ rootDir: tempDir }),
      now: () => new Date('2026-05-19T09:00:00.000Z'),
    });

    const output = await processor({
      id: 'job_preview_1',
      queueName: 'asset-storage',
      payload: {
        type: 'PREVIEW_EXPORT',
        jobId: 'job_preview_1',
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'preview_1',
        preview: {
          contentType: 'text/html',
          body: '<section>RecipeSpec-safe preview</section>',
        },
      },
      trace: { correlationId: 'corr_preview_1', shopId: 'shop_1' },
    });

    expect(output.status).toBe('SUCCESS');
    expect(output.events.map((event) => event.type)).toEqual([
      'JOB_STARTED',
      'JOB_PROGRESS',
      'JOB_PROGRESS',
      'JOB_COMPLETED',
    ]);
    for (const event of output.events) {
      expect(WorkerEventSchema.safeParse(event).success).toBe(true);
    }
    expect(output.result).toMatchObject({
      status: 'succeeded',
      assets: [{ id: 'preview_1', kind: 'exported_preview' }],
    });
  });

  it('returns FAILED status and JOB_FAILED when payload validation fails', async () => {
    const processor = createImageStorageProcessor();
    const output = await processor({
      id: 'job_bad',
      queueName: 'asset-storage',
      payload: { type: 'IMAGE_INGESTION', jobId: 'job_bad' },
      trace: { correlationId: 'corr_bad' },
    });

    expect(output.status).toBe('FAILED');
    expect(output.events.at(-1)?.type).toBe('JOB_FAILED');
    expect(output.events.at(-1)?.message).toMatch(/invalid/i);
  });

  it('surfaces handler failures as FAILED processor status', async () => {
    const processor = createImageStorageProcessor({
      storage: new LocalStorageAdapter({ rootDir: '/tmp/unused' }),
      now: () => new Date('2026-05-19T09:00:00.000Z'),
    });

    const output = await processor({
      id: 'job_unsafe',
      queueName: 'asset-storage',
      payload: {
        type: 'PREVIEW_EXPORT',
        jobId: 'job_unsafe',
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'preview_1',
        preview: {
          contentType: 'text/html',
          body: '<section onclick="alert(1)">unsafe</section>',
        },
      },
      trace: { correlationId: 'corr_unsafe' },
    });

    expect(output.status).toBe('FAILED');
    expect(output.events.at(-1)?.type).toBe('JOB_FAILED');
    expect(output.result).toMatchObject({
      status: 'failed',
      error: { code: 'UNSAFE_PREVIEW_ARTIFACT' },
    });
  });
});
