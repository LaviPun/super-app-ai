import { LocalStorageAdapter } from './local-storage-adapter.js';
import { R2StorageAdapter, type R2BucketLike } from './r2-storage-adapter.js';
import type { StorageAdapter } from './storage-adapter.js';

export type CreateStorageAdapterOptions = {
  provider?: 'local' | 'r2';
  localRoot?: string;
  r2BucketName?: string;
  r2Bucket?: R2BucketLike;
  publicBaseUrl?: string;
};

export function createStorageAdapter(options: CreateStorageAdapterOptions = {}): StorageAdapter {
  const provider = options.provider ?? (options.r2Bucket ? 'r2' : 'local');

  if (provider === 'r2') {
    return new R2StorageAdapter({
      bucketName: options.r2BucketName ?? process.env.R2_BUCKET_NAME ?? 'generated-assets',
      bucket: options.r2Bucket,
      publicBaseUrl: options.publicBaseUrl ?? process.env.R2_PUBLIC_BASE_URL,
    });
  }

  return new LocalStorageAdapter({
    rootDir: options.localRoot ?? process.env.LOCAL_STORAGE_PATH ?? '.data/superapp-assets',
  });
}
