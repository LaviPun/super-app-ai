import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createStorageAdapter, type CreateStorageAdapterOptions } from './storage/storage-adapter-factory.js';
import {
  AssetStorageResultSchema,
  StorageAdapterError,
  StorageObjectMetadataSchema,
  type AssetStorageResult,
  type StorageAdapter,
  type StorageObjectMetadata,
} from './storage/types.js';

export const ImageStorageJobTypeSchema = z.enum([
  'ASSET_INGEST',
  'PREVIEW_EXPORT',
  'ASSET_CLEANUP',
  'THEME_ANALYZE',
]);
export type ImageStorageJobType = z.infer<typeof ImageStorageJobTypeSchema>;

export const ImageStorageProgressEventSchema = z.enum([
  'ASSET_INGEST_REQUESTED',
  'ASSET_INGEST_VALIDATED',
  'ASSET_STORED',
  'PREVIEW_EXPORT_REQUESTED',
  'PREVIEW_EXPORT_STORED',
  'ASSET_CLEANUP_REQUESTED',
  'ASSET_CLEANUP_COMPLETED',
  'THEME_ANALYZE_REQUESTED',
  'THEME_ANALYZE_COMPLETED',
  'ASSET_JOB_FAILED',
]);
export type ImageStorageProgressEvent = z.infer<typeof ImageStorageProgressEventSchema>;

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'sourceUrl must use https');

const blockedHostPattern =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.|::1|\[::1\]|metadata\.google)/i;

export const AssetIngestPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(128),
  sourceUrl: httpsUrlSchema,
  contentType: z.string().min(1).default('image/png'),
  recipeSpecHash: z.string().min(8).max(128).optional(),
  inlineBodyBase64: z.string().min(1).optional(),
});

export const PreviewExportPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(128),
  previewHtml: z.string().min(1).max(512_000),
  format: z.enum(['html']).default('html'),
});

export const AssetCleanupPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1).optional(),
  assetIds: z.array(z.string().min(1)).min(1).max(100),
});

export const ThemeAnalyzeStoragePayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  themeId: z.string().min(1),
  profileJson: z.record(z.unknown()),
});

export type AssetIngestPayload = z.infer<typeof AssetIngestPayloadSchema>;
export type PreviewExportPayload = z.infer<typeof PreviewExportPayloadSchema>;
export type AssetCleanupPayload = z.infer<typeof AssetCleanupPayloadSchema>;
export type ThemeAnalyzeStoragePayload = z.infer<typeof ThemeAnalyzeStoragePayloadSchema>;

export type ImageStorageWorkerResult =
  | { status: 'stored'; result: AssetStorageResult }
  | { status: 'cleaned'; deletedAssetIds: string[] }
  | { status: 'analyzed'; themeId: string; storageKey: string };

export type ImageStorageWorkerAdapters = {
  storage?: StorageAdapter;
  storageFactory?: CreateStorageAdapterOptions;
  fetchImpl?: typeof fetch;
  events?: {
    emit(event: {
      jobId: string;
      type: ImageStorageProgressEvent;
      message?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void> | void;
  };
  metadataStore?: {
    getByIdempotencyKey(input: { shopId: string; idempotencyKey: string }): Promise<AssetStorageResult | null>;
    saveMetadata(metadata: StorageObjectMetadata, result: AssetStorageResult): Promise<void>;
    resolveAssetKey(assetId: string): Promise<string | null>;
  };
};

export class ImageStorageWorkerError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PAYLOAD'
      | 'UNSAFE_SOURCE_URL'
      | 'FETCH_FAILED'
      | 'STORAGE_FAILED'
      | 'INLINE_BODY_REQUIRED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImageStorageWorkerError';
  }
}

export function buildAssetStorageKey(input: {
  shopId: string;
  moduleId: string;
  assetId: string;
  extension: string;
}): string {
  return `shops/${input.shopId}/modules/${input.moduleId}/assets/${input.assetId}.${input.extension}`;
}

export function assertSafeAssetSourceUrl(sourceUrl: string): URL {
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:') {
    throw new ImageStorageWorkerError('UNSAFE_SOURCE_URL', 'Asset source URLs must use https.');
  }
  if (blockedHostPattern.test(url.hostname)) {
    throw new ImageStorageWorkerError('UNSAFE_SOURCE_URL', `Blocked asset source host: ${url.hostname}`);
  }
  return url;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('html')) return 'html';
  return 'bin';
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function toStorageUri(provider: AssetStorageResult['provider'], storageKey: string): string {
  return provider === 'r2' ? `r2://${storageKey}` : `file://${storageKey}`;
}

async function storeBuffer(input: {
  adapter: StorageAdapter;
  shopId: string;
  moduleId: string;
  versionId?: string;
  kind: StorageObjectMetadata['kind'];
  contentType: string;
  body: Buffer;
  recipeSpecHash?: string;
  metadataStore?: ImageStorageWorkerAdapters['metadataStore'];
}): Promise<AssetStorageResult> {
  const assetId = randomUUID();
  const extension = extensionForContentType(input.contentType);
  const storageKey = buildAssetStorageKey({
    shopId: input.shopId,
    moduleId: input.moduleId,
    assetId,
    extension,
  });
  const put = await input.adapter.putObject({
    key: storageKey,
    body: input.body,
    contentType: input.contentType,
    metadata: {
      shopId: input.shopId,
      moduleId: input.moduleId,
      assetId,
    },
  });

  const metadata = StorageObjectMetadataSchema.parse({
    assetId,
    shopId: input.shopId,
    moduleId: input.moduleId,
    versionId: input.versionId,
    contentType: input.contentType,
    byteSize: input.body.byteLength,
    sha256: sha256(input.body),
    recipeSpecHash: input.recipeSpecHash,
    kind: input.kind,
    createdAt: new Date().toISOString(),
  });

  const result = AssetStorageResultSchema.parse({
    assetId,
    storageKey,
    provider: input.adapter.provider,
    uri: toStorageUri(input.adapter.provider, storageKey),
    contentType: input.contentType,
    byteSize: input.body.byteLength,
    etag: put.etag,
  });

  await input.metadataStore?.saveMetadata(metadata, result);
  return result;
}

export async function runAssetIngestJob(
  rawPayload: unknown,
  adapters: ImageStorageWorkerAdapters = {},
): Promise<ImageStorageWorkerResult> {
  const parsed = AssetIngestPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ImageStorageWorkerError('INVALID_PAYLOAD', parsed.error.message, parsed.error);
  }
  const payload = parsed.data;
  await adapters.events?.emit({ jobId: payload.jobId, type: 'ASSET_INGEST_REQUESTED' });
  assertSafeAssetSourceUrl(payload.sourceUrl);

  const existing = await adapters.metadataStore?.getByIdempotencyKey({
    shopId: payload.shopId,
    idempotencyKey: payload.idempotencyKey,
  });
  if (existing) {
    await adapters.events?.emit({
      jobId: payload.jobId,
      type: 'ASSET_STORED',
      message: 'Idempotent asset ingest reused existing metadata.',
      metadata: { assetId: existing.assetId },
    });
    return { status: 'stored', result: existing };
  }

  await adapters.events?.emit({ jobId: payload.jobId, type: 'ASSET_INGEST_VALIDATED' });

  let body: Buffer;
  if (payload.inlineBodyBase64) {
    body = Buffer.from(payload.inlineBodyBase64, 'base64');
  } else {
    const fetchImpl = adapters.fetchImpl ?? fetch;
    const response = await fetchImpl(payload.sourceUrl).catch((error) => {
      throw new ImageStorageWorkerError('FETCH_FAILED', 'Failed to fetch asset source URL.', error);
    });
    if (!response.ok) {
      throw new ImageStorageWorkerError('FETCH_FAILED', `Asset fetch returned ${response.status}.`);
    }
    const arrayBuffer = await response.arrayBuffer();
    body = Buffer.from(arrayBuffer);
  }

  const storage =
    adapters.storage ?? createStorageAdapter(adapters.storageFactory ?? { env: process.env as Record<string, string> });

  try {
    const result = await storeBuffer({
      adapter: storage,
      shopId: payload.shopId,
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      kind: 'generated_image',
      contentType: payload.contentType,
      body,
      recipeSpecHash: payload.recipeSpecHash,
      metadataStore: adapters.metadataStore,
    });
    await adapters.events?.emit({
      jobId: payload.jobId,
      type: 'ASSET_STORED',
      metadata: { assetId: result.assetId, storageKey: result.storageKey },
    });
    return { status: 'stored', result };
  } catch (error) {
    if (error instanceof StorageAdapterError) {
      throw new ImageStorageWorkerError('STORAGE_FAILED', error.message, error);
    }
    throw error;
  }
}

export async function runPreviewExportJob(
  rawPayload: unknown,
  adapters: ImageStorageWorkerAdapters = {},
): Promise<ImageStorageWorkerResult> {
  const parsed = PreviewExportPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ImageStorageWorkerError('INVALID_PAYLOAD', parsed.error.message, parsed.error);
  }
  const payload = parsed.data;
  await adapters.events?.emit({ jobId: payload.jobId, type: 'PREVIEW_EXPORT_REQUESTED' });

  const storage =
    adapters.storage ?? createStorageAdapter(adapters.storageFactory ?? { env: process.env as Record<string, string> });
  const body = Buffer.from(payload.previewHtml, 'utf8');

  const result = await storeBuffer({
    adapter: storage,
    shopId: payload.shopId,
    moduleId: payload.moduleId,
    versionId: payload.versionId,
    kind: 'preview_export',
    contentType: 'text/html; charset=utf-8',
    body,
    metadataStore: adapters.metadataStore,
  });

  await adapters.events?.emit({
    jobId: payload.jobId,
    type: 'PREVIEW_EXPORT_STORED',
    metadata: { assetId: result.assetId, storageKey: result.storageKey },
  });
  return { status: 'stored', result };
}

export async function runAssetCleanupJob(
  rawPayload: unknown,
  adapters: ImageStorageWorkerAdapters = {},
): Promise<ImageStorageWorkerResult> {
  const parsed = AssetCleanupPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ImageStorageWorkerError('INVALID_PAYLOAD', parsed.error.message, parsed.error);
  }
  const payload = parsed.data;
  await adapters.events?.emit({ jobId: payload.jobId, type: 'ASSET_CLEANUP_REQUESTED' });

  const storage =
    adapters.storage ?? createStorageAdapter(adapters.storageFactory ?? { env: process.env as Record<string, string> });
  const deleted: string[] = [];

  for (const assetId of payload.assetIds) {
    const storageKey = await adapters.metadataStore?.resolveAssetKey(assetId);
    if (!storageKey) continue;
    await storage.deleteObject({ key: storageKey });
    deleted.push(assetId);
  }

  await adapters.events?.emit({
    jobId: payload.jobId,
    type: 'ASSET_CLEANUP_COMPLETED',
    metadata: { deletedAssetIds: deleted },
  });
  return { status: 'cleaned', deletedAssetIds: deleted };
}

export async function runThemeAnalyzeStorageJob(
  rawPayload: unknown,
  adapters: ImageStorageWorkerAdapters = {},
): Promise<ImageStorageWorkerResult> {
  const parsed = ThemeAnalyzeStoragePayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ImageStorageWorkerError('INVALID_PAYLOAD', parsed.error.message, parsed.error);
  }
  const payload = parsed.data;
  await adapters.events?.emit({ jobId: payload.jobId, type: 'THEME_ANALYZE_REQUESTED' });

  const storage =
    adapters.storage ?? createStorageAdapter(adapters.storageFactory ?? { env: process.env as Record<string, string> });
  const body = Buffer.from(JSON.stringify(payload.profileJson), 'utf8');
  const storageKey = `shops/${payload.shopId}/themes/${payload.themeId}/profile.json`;

  await storage.putObject({
    key: storageKey,
    body,
    contentType: 'application/json',
  });

  await adapters.events?.emit({
    jobId: payload.jobId,
    type: 'THEME_ANALYZE_COMPLETED',
    metadata: { themeId: payload.themeId, storageKey },
  });
  return { status: 'analyzed', themeId: payload.themeId, storageKey };
}

export async function runImageStorageJob(
  type: ImageStorageJobType,
  payload: unknown,
  adapters: ImageStorageWorkerAdapters = {},
): Promise<ImageStorageWorkerResult> {
  try {
    switch (type) {
      case 'ASSET_INGEST':
        return await runAssetIngestJob(payload, adapters);
      case 'PREVIEW_EXPORT':
        return await runPreviewExportJob(payload, adapters);
      case 'ASSET_CLEANUP':
        return await runAssetCleanupJob(payload, adapters);
      case 'THEME_ANALYZE':
        return await runThemeAnalyzeStorageJob(payload, adapters);
      default: {
        const unsupported: never = type;
        throw new ImageStorageWorkerError('INVALID_PAYLOAD', `Unsupported image storage job type: ${unsupported}`);
      }
    }
  } catch (error) {
    const jobId =
      typeof payload === 'object' && payload && 'jobId' in payload && typeof payload.jobId === 'string'
        ? payload.jobId
        : 'unknown';
    await adapters.events?.emit({
      jobId,
      type: 'ASSET_JOB_FAILED',
      message: error instanceof Error ? error.message : String(error),
      metadata: {
        code: error instanceof ImageStorageWorkerError ? error.code : 'UNKNOWN',
      },
    });
    throw error;
  }
}
