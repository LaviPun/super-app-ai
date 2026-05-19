import { z } from 'zod';

export const GENERATED_ASSET_KINDS = [
  'image_reference',
  'generated_mock',
  'exported_preview',
  'preview_manifest',
  'preview_screenshot',
] as const;

export const STORAGE_VISIBILITY = ['private', 'signed', 'public-read'] as const;

export const GeneratedAssetKindSchema = z.enum(GENERATED_ASSET_KINDS);
export const StorageVisibilitySchema = z.enum(STORAGE_VISIBILITY);

export const StorageObjectRefSchema = z.object({
  provider: z.enum(['local', 'r2']),
  bucket: z.string().min(1),
  key: z.string().min(1),
  etag: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  visibility: StorageVisibilitySchema,
  signedUrl: z.string().url().optional(),
  publicUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const GeneratedAssetMetadataSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  kind: GeneratedAssetKindSchema,
  storage: StorageObjectRefSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  recipeSpecRef: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export const ImageWorkerJobTypeSchema = z.enum([
  'IMAGE_INGESTION',
  'PREVIEW_EXPORT',
  'ASSET_CLEANUP',
]);

export const BaseImageWorkerPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});

export const ImageIngestionPayloadSchema = BaseImageWorkerPayloadSchema.extend({
  type: z.literal('IMAGE_INGESTION'),
  assetId: z.string().min(1),
  source: z.object({
    contentType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
    bytesBase64: z.string().min(1),
    filename: z.string().min(1).max(180).optional(),
  }),
});

export const PreviewExportPayloadSchema = BaseImageWorkerPayloadSchema.extend({
  type: z.literal('PREVIEW_EXPORT'),
  assetId: z.string().min(1),
  preview: z.object({
    contentType: z.enum(['text/html', 'application/json']),
    body: z.string().min(1),
  }),
  recipeSpecRef: z.string().min(1).optional(),
});

export const AssetCleanupPayloadSchema = BaseImageWorkerPayloadSchema.extend({
  type: z.literal('ASSET_CLEANUP'),
  storageKeys: z.array(z.string().min(1)).min(1),
});

export const ImageWorkerPayloadSchema = z.discriminatedUnion('type', [
  ImageIngestionPayloadSchema,
  PreviewExportPayloadSchema,
  AssetCleanupPayloadSchema,
]);

export const ImageWorkerStatusSchema = z.enum([
  'queued',
  'processing',
  'succeeded',
  'failed',
]);

export const ImageWorkerEventSchema = z.object({
  jobId: z.string().min(1),
  type: ImageWorkerJobTypeSchema,
  status: ImageWorkerStatusSchema,
  message: z.string().min(1),
  traceId: z.string().min(1).optional(),
  assetIds: z.array(z.string().min(1)).default([]),
  occurredAt: z.string().datetime(),
});

export const ImageWorkerResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(['succeeded', 'failed']),
  assets: z.array(GeneratedAssetMetadataSchema).default([]),
  deletedStorageKeys: z.array(z.string().min(1)).default([]),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  events: z.array(ImageWorkerEventSchema).min(1),
});

export type GeneratedAssetKind = z.infer<typeof GeneratedAssetKindSchema>;
export type StorageVisibility = z.infer<typeof StorageVisibilitySchema>;
export type StorageObjectRef = z.infer<typeof StorageObjectRefSchema>;
export type GeneratedAssetMetadata = z.infer<typeof GeneratedAssetMetadataSchema>;
export type ImageWorkerPayload = z.infer<typeof ImageWorkerPayloadSchema>;
export type ImageWorkerEvent = z.infer<typeof ImageWorkerEventSchema>;
export type ImageWorkerResult = z.infer<typeof ImageWorkerResultSchema>;
