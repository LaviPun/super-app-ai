import { describe, expect, it } from 'vitest';
import {
  GeneratedAssetMetadataSchema,
  ImageWorkerPayloadSchema,
  ImageWorkerResultSchema,
} from '../storage';

describe('storage contracts', () => {
  it('validates generated asset metadata shape', () => {
    const parsed = GeneratedAssetMetadataSchema.parse({
      id: 'asset_1',
      shopId: 'shop_1',
      moduleId: 'module_1',
      kind: 'exported_preview',
      storage: {
        provider: 'local',
        bucket: 'local-generated-assets',
        key: 'shops/shop_1/modules/module_1/previews/asset_1.html',
        sizeBytes: 128,
        contentType: 'text/html',
        visibility: 'private',
      },
      checksumSha256: 'a'.repeat(64),
      createdAt: new Date('2026-05-19T09:00:00.000Z').toISOString(),
    });

    expect(parsed.metadata).toEqual({});
    expect(parsed.storage.signedUrl).toBeUndefined();
  });

  it('rejects unsafe inline script preview payloads outside the worker policy', () => {
    const parsed = ImageWorkerPayloadSchema.safeParse({
      type: 'PREVIEW_EXPORT',
      jobId: 'job_1',
      shopId: 'shop_1',
      moduleId: 'module_1',
      assetId: 'preview_1',
      preview: {
        contentType: 'application/javascript',
        body: 'alert("merchant code")',
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('requires worker results to carry at least one status event', () => {
    const parsed = ImageWorkerResultSchema.safeParse({
      jobId: 'job_1',
      status: 'succeeded',
      assets: [],
      deletedStorageKeys: [],
      events: [],
    });

    expect(parsed.success).toBe(false);
  });
});
