import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageWorkerHandler } from '../image/image-worker';
import { LocalStorageAdapter } from '../storage/local-storage-adapter';
import { R2StorageAdapter } from '../storage/r2-storage-adapter';
import { StorageAdapterError, type PutObjectInput, type PutObjectResult, type StorageAdapter } from '../storage/storage-adapter';

const fixedNow = () => new Date('2026-05-19T09:00:00.000Z');
const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('ImageWorkerHandler', () => {
  it('rejects invalid payloads with a failed status event', async () => {
    const rootDir = await tempRoot();
    const handler = new ImageWorkerHandler({
      storage: new LocalStorageAdapter({ rootDir }),
      now: fixedNow,
    });

    const result = await handler.handle({ type: 'IMAGE_INGESTION', jobId: 'job_invalid' });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_IMAGE_WORKER_PAYLOAD');
    expect(result.events).toMatchObject([
      { jobId: 'job_invalid', status: 'failed', message: 'Image worker rejected invalid payload.' },
    ]);
  });

  it('stores image ingestion output locally and returns metadata shape', async () => {
    const rootDir = await tempRoot();
    const handler = new ImageWorkerHandler({
      storage: new LocalStorageAdapter({ rootDir }),
      now: fixedNow,
    });

    const result = await handler.handle({
      type: 'IMAGE_INGESTION',
      jobId: 'job_image',
      shopId: 'shop_1',
      moduleId: 'module_1',
      assetId: 'asset_1',
      source: {
        contentType: 'image/png',
        bytesBase64: Buffer.from('fake image').toString('base64'),
        filename: 'hero.png',
      },
    });

    expect(result.status).toBe('succeeded');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      id: 'asset_1',
      kind: 'image_reference',
      shopId: 'shop_1',
      moduleId: 'module_1',
      storage: {
        provider: 'local',
        bucket: 'local-generated-assets',
        contentType: 'image/png',
        visibility: 'private',
      },
      createdAt: '2026-05-19T09:00:00.000Z',
      metadata: { filename: 'hero.png' },
    });
    expect(result.assets[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(join(rootDir, result.assets[0]?.storage.key ?? ''), 'utf8')).toBe('fake image');
    expect(result.events.map((event) => event.status)).toEqual(['processing', 'succeeded']);
  });

  it('rejects unsafe preview exports before storage', async () => {
    const adapter = new RecordingStorageAdapter();
    const handler = new ImageWorkerHandler({ storage: adapter, now: fixedNow });

    const result = await handler.handle({
      type: 'PREVIEW_EXPORT',
      jobId: 'job_preview',
      shopId: 'shop_1',
      moduleId: 'module_1',
      assetId: 'preview_1',
      preview: {
        contentType: 'text/html',
        body: '<section onclick="alert(1)">unsafe</section>',
      },
    });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('UNSAFE_PREVIEW_ARTIFACT');
    expect(adapter.puts).toHaveLength(0);
    expect(result.events.map((event) => event.status)).toEqual(['processing', 'failed']);
  });

  it('surfaces storage adapter failures as failed worker results', async () => {
    const handler = new ImageWorkerHandler({
      storage: new FailingStorageAdapter(),
      now: fixedNow,
    });

    const result = await handler.handle({
      type: 'PREVIEW_EXPORT',
      jobId: 'job_fail',
      shopId: 'shop_1',
      moduleId: 'module_1',
      assetId: 'preview_1',
      preview: {
        contentType: 'application/json',
        body: '{"recipeSpecSafe":true}',
      },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toEqual({
      code: 'STORAGE_WRITE_FAILED',
      message: 'Unable to write generated artifact.',
    });
    expect(result.events.map((event) => event.status)).toEqual(['processing', 'failed']);
  });

  it('returns cleanup status and deleted keys', async () => {
    const adapter = new RecordingStorageAdapter();
    const handler = new ImageWorkerHandler({ storage: adapter, now: fixedNow });

    const result = await handler.handle({
      type: 'ASSET_CLEANUP',
      jobId: 'job_cleanup',
      shopId: 'shop_1',
      moduleId: 'module_1',
      storageKeys: ['shops/shop_1/modules/module_1/images/asset_1.png'],
    });

    expect(result.status).toBe('succeeded');
    expect(result.deletedStorageKeys).toEqual(['shops/shop_1/modules/module_1/images/asset_1.png']);
    expect(adapter.deleted).toEqual(['shops/shop_1/modules/module_1/images/asset_1.png']);
    expect(result.events.at(-1)).toMatchObject({ status: 'succeeded', message: 'Asset cleanup completed.' });
  });

  it('documents R2 unavailable behavior for local/test fallback', async () => {
    const adapter = new R2StorageAdapter({ bucketName: 'generated-assets' });

    await expect(
      adapter.putObject({
        key: 'asset.png',
        body: new Uint8Array([1]),
        contentType: 'image/png',
        visibility: 'private',
      }),
    ).rejects.toMatchObject({ code: 'R2_UNAVAILABLE' });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'superapp-assets-'));
  cleanupPaths.push(root);
  return root;
}

class RecordingStorageAdapter implements StorageAdapter {
  readonly provider = 'local' as const;
  readonly bucket = 'test-bucket';
  readonly puts: PutObjectInput[] = [];
  readonly deleted: string[] = [];

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.puts.push(input);
    return {
      provider: this.provider,
      bucket: this.bucket,
      key: input.key,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      visibility: input.visibility,
    };
  }

  async deleteObject(key: string): Promise<void> {
    this.deleted.push(key);
  }

  async createSignedUrl(key: string): Promise<string> {
    return `local://test-bucket/${key}`;
  }
}

class FailingStorageAdapter extends RecordingStorageAdapter {
  override async putObject(): Promise<PutObjectResult> {
    throw new StorageAdapterError('STORAGE_WRITE_FAILED', 'Unable to write generated artifact.');
  }
}
