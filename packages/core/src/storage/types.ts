import { z } from 'zod';

export const StorageProviderSchema = z.enum(['local', 'r2']);
export type StorageProvider = z.infer<typeof StorageProviderSchema>;

export const StorageObjectMetadataSchema = z.object({
  assetId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1).optional(),
  versionId: z.string().min(1).optional(),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  recipeSpecHash: z.string().min(8).max(128).optional(),
  kind: z.enum(['generated_image', 'preview_export', 'theme_analysis']),
  createdAt: z.string().datetime(),
});

export type StorageObjectMetadata = z.infer<typeof StorageObjectMetadataSchema>;

export const AssetStorageResultSchema = z.object({
  assetId: z.string().min(1),
  storageKey: z.string().min(1),
  provider: StorageProviderSchema,
  uri: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  etag: z.string().optional(),
  signedUrl: z.string().url().optional(),
});

export type AssetStorageResult = z.infer<typeof AssetStorageResultSchema>;

export type StoragePutInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
};

export type StorageGetResult = {
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  etag?: string;
};

export type StorageAdapter = {
  readonly provider: StorageProvider;
  putObject(input: StoragePutInput): Promise<{ etag?: string }>;
  getObject(input: { key: string }): Promise<StorageGetResult>;
  deleteObject(input: { key: string }): Promise<void>;
  createSignedUrl?(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }>;
};

export class StorageAdapterError extends Error {
  constructor(
    public readonly code:
      | 'CREDENTIALS_UNAVAILABLE'
      | 'NOT_FOUND'
      | 'PUT_FAILED'
      | 'GET_FAILED'
      | 'DELETE_FAILED'
      | 'UNSIGNED_URL_UNSUPPORTED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageAdapterError';
  }
}

export const R2StorageConfigSchema = z.object({
  accountId: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  endpoint: z.string().url().optional(),
  publicBaseUrl: z.string().url().optional(),
});

export type R2StorageConfig = z.infer<typeof R2StorageConfigSchema>;

export const LocalStorageConfigSchema = z.object({
  basePath: z.string().min(1),
});

export type LocalStorageConfig = z.infer<typeof LocalStorageConfigSchema>;

export type StorageEnv = {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_ENDPOINT?: string;
  R2_PUBLIC_BASE_URL?: string;
  LOCAL_STORAGE_PATH?: string;
};
