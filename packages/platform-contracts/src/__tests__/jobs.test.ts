import { describe, expect, it } from 'vitest';
import {
  ASSET_STORAGE_JOB_REGISTRY,
  ASSET_STORAGE_QUEUE,
  IMAGE_WORKER_QUEUE_BY_TYPE,
  isImageWorkerJobType,
  parseImageWorkerPayload,
  resolveImageWorkerQueue,
} from '../jobs';

describe('jobs registry', () => {
  it('maps all image worker job types to asset-storage queue', () => {
    expect(ASSET_STORAGE_JOB_REGISTRY.queue).toBe(ASSET_STORAGE_QUEUE);
    expect(ASSET_STORAGE_JOB_REGISTRY.jobTypes).toEqual([
      'IMAGE_INGESTION',
      'PREVIEW_EXPORT',
      'ASSET_CLEANUP',
    ]);
    expect(Object.values(IMAGE_WORKER_QUEUE_BY_TYPE)).toEqual([
      ASSET_STORAGE_QUEUE,
      ASSET_STORAGE_QUEUE,
      ASSET_STORAGE_QUEUE,
    ]);
  });

  it('resolves queue names and validates payloads via registry helpers', () => {
    expect(resolveImageWorkerQueue('PREVIEW_EXPORT')).toBe('asset-storage');
    expect(isImageWorkerJobType('IMAGE_INGESTION')).toBe(true);
    expect(isImageWorkerJobType('AI_GENERATE')).toBe(false);

    const payload = parseImageWorkerPayload({
      type: 'ASSET_CLEANUP',
      jobId: 'job_cleanup_1',
      shopId: 'shop_1',
      moduleId: 'module_1',
      storageKeys: ['shops/shop_1/modules/module_1/assets/old.png'],
    });

    expect(payload.type).toBe('ASSET_CLEANUP');
  });
});
