import { LocalStorageAdapter } from './local-storage-adapter.js';
import { R2StorageAdapter, type R2ObjectClient } from './r2-storage-adapter.js';
import type { StorageAdapter, StorageEnv } from './types.js';

export type CreateStorageAdapterOptions = {
  env?: StorageEnv;
  /** When omitted, R2 credentials fall back to the local adapter (Phase 12 local/testable default). */
  r2Client?: R2ObjectClient;
  localBasePath?: string;
};

export function createStorageAdapter(options: CreateStorageAdapterOptions = {}): StorageAdapter {
  const env = options.env ?? {};
  if (options.r2Client && hasR2Credentials(env)) {
    const config = R2StorageAdapter.assertCredentialsAvailable(env);
    return new R2StorageAdapter({
      config: {
        ...config,
        endpoint: env.R2_ENDPOINT,
        publicBaseUrl: env.R2_PUBLIC_BASE_URL,
      },
      client: options.r2Client,
    });
  }

  return new LocalStorageAdapter({
    basePath: options.localBasePath ?? env.LOCAL_STORAGE_PATH ?? '.data/superapp-assets',
  });
}

function hasR2Credentials(env: StorageEnv): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}
