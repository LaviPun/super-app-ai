import { createHash } from 'node:crypto';
import {
  GeneratedAssetMetadataSchema,
  ImageWorkerPayloadSchema,
  ImageWorkerResultSchema,
  type GeneratedAssetMetadata,
  type ImageWorkerEvent,
  type ImageWorkerPayload,
  type ImageWorkerResult,
} from '@superapp/platform-contracts';
import { StorageAdapterError, type StorageAdapter } from '../storage/storage-adapter';

export type ImageWorkerHandlerOptions = {
  storage: StorageAdapter;
  now?: () => Date;
};

export class ImageWorkerHandler {
  private readonly storage: StorageAdapter;
  private readonly now: () => Date;

  constructor(options: ImageWorkerHandlerOptions) {
    this.storage = options.storage;
    this.now = options.now ?? (() => new Date());
  }

  async handle(rawPayload: unknown): Promise<ImageWorkerResult> {
    const parsed = ImageWorkerPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return ImageWorkerResultSchema.parse({
        jobId: extractJobId(rawPayload),
        status: 'failed',
        assets: [],
        deletedStorageKeys: [],
        error: {
          code: 'INVALID_IMAGE_WORKER_PAYLOAD',
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        },
        events: [
          this.event({
            jobId: extractJobId(rawPayload),
            type: 'IMAGE_INGESTION',
            status: 'failed',
            message: 'Image worker rejected invalid payload.',
          }),
        ],
      });
    }

    const payload = parsed.data;
    const events: ImageWorkerEvent[] = [
      this.event({
        jobId: payload.jobId,
        type: payload.type,
        status: 'processing',
        message: 'Image worker started processing.',
        traceId: payload.traceId,
      }),
    ];

    try {
      const result = await this.dispatch(payload, events);
      return ImageWorkerResultSchema.parse(result);
    } catch (error) {
      const adapterError = normalizeError(error);
      events.push(
        this.event({
          jobId: payload.jobId,
          type: payload.type,
          status: 'failed',
          message: adapterError.message,
          traceId: payload.traceId,
        }),
      );

      return ImageWorkerResultSchema.parse({
        jobId: payload.jobId,
        status: 'failed',
        assets: [],
        deletedStorageKeys: [],
        error: adapterError,
        events,
      });
    }
  }

  private async dispatch(payload: ImageWorkerPayload, events: ImageWorkerEvent[]): Promise<ImageWorkerResult> {
    switch (payload.type) {
      case 'IMAGE_INGESTION':
        return this.ingestImage(payload, events);
      case 'PREVIEW_EXPORT':
        return this.exportPreview(payload, events);
      case 'ASSET_CLEANUP':
        return this.cleanupAssets(payload, events);
    }
  }

  private async ingestImage(
    payload: Extract<ImageWorkerPayload, { type: 'IMAGE_INGESTION' }>,
    events: ImageWorkerEvent[],
  ): Promise<ImageWorkerResult> {
    const body = decodeBase64(payload.source.bytesBase64);
    const key = buildStorageKey({
      shopId: payload.shopId,
      moduleId: payload.moduleId,
      revisionId: payload.revisionId,
      folder: 'images',
      assetId: payload.assetId,
      extension: extensionForContentType(payload.source.contentType),
    });
    const storage = await this.storage.putObject({
      key,
      body,
      contentType: payload.source.contentType,
      visibility: 'private',
      metadata: { assetId: payload.assetId, jobId: payload.jobId },
    });
    const asset = GeneratedAssetMetadataSchema.parse({
      id: payload.assetId,
      shopId: payload.shopId,
      moduleId: payload.moduleId,
      revisionId: payload.revisionId,
      kind: 'image_reference',
      storage,
      checksumSha256: sha256(body),
      createdAt: this.now().toISOString(),
      metadata: payload.source.filename ? { filename: payload.source.filename } : {},
    });

    events.push(
      this.event({
        jobId: payload.jobId,
        type: payload.type,
        status: 'succeeded',
        message: 'Image asset stored.',
        traceId: payload.traceId,
        assetIds: [asset.id],
      }),
    );

    return {
      jobId: payload.jobId,
      status: 'succeeded',
      assets: [asset],
      deletedStorageKeys: [],
      events,
    };
  }

  private async exportPreview(
    payload: Extract<ImageWorkerPayload, { type: 'PREVIEW_EXPORT' }>,
    events: ImageWorkerEvent[],
  ): Promise<ImageWorkerResult> {
    assertPreviewIsRecipeSafe(payload.preview.body);

    const body = new TextEncoder().encode(payload.preview.body);
    const key = buildStorageKey({
      shopId: payload.shopId,
      moduleId: payload.moduleId,
      revisionId: payload.revisionId,
      folder: 'previews',
      assetId: payload.assetId,
      extension: payload.preview.contentType === 'text/html' ? 'html' : 'json',
    });
    const storage = await this.storage.putObject({
      key,
      body,
      contentType: payload.preview.contentType,
      visibility: 'private',
      metadata: { assetId: payload.assetId, jobId: payload.jobId },
    });
    const asset: GeneratedAssetMetadata = GeneratedAssetMetadataSchema.parse({
      id: payload.assetId,
      shopId: payload.shopId,
      moduleId: payload.moduleId,
      revisionId: payload.revisionId,
      kind: 'exported_preview',
      storage,
      checksumSha256: sha256(body),
      recipeSpecRef: payload.recipeSpecRef,
      createdAt: this.now().toISOString(),
      metadata: { contentType: payload.preview.contentType },
    });

    events.push(
      this.event({
        jobId: payload.jobId,
        type: payload.type,
        status: 'succeeded',
        message: 'Preview artifact exported.',
        traceId: payload.traceId,
        assetIds: [asset.id],
      }),
    );

    return {
      jobId: payload.jobId,
      status: 'succeeded',
      assets: [asset],
      deletedStorageKeys: [],
      events,
    };
  }

  private async cleanupAssets(
    payload: Extract<ImageWorkerPayload, { type: 'ASSET_CLEANUP' }>,
    events: ImageWorkerEvent[],
  ): Promise<ImageWorkerResult> {
    const deletedStorageKeys: string[] = [];
    for (const key of payload.storageKeys) {
      await this.storage.deleteObject(key);
      deletedStorageKeys.push(key);
    }

    events.push(
      this.event({
        jobId: payload.jobId,
        type: payload.type,
        status: 'succeeded',
        message: 'Asset cleanup completed.',
        traceId: payload.traceId,
      }),
    );

    return {
      jobId: payload.jobId,
      status: 'succeeded',
      assets: [],
      deletedStorageKeys,
      events,
    };
  }

  private event(input: Omit<ImageWorkerEvent, 'occurredAt' | 'assetIds'> & { assetIds?: string[] }): ImageWorkerEvent {
    return {
      ...input,
      assetIds: input.assetIds ?? [],
      occurredAt: this.now().toISOString(),
    };
  }
}

function buildStorageKey(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  folder: 'images' | 'previews';
  assetId: string;
  extension: string;
}): string {
  const revisionSegment = input.revisionId ? `/revisions/${safePathSegment(input.revisionId)}` : '';
  return [
    'shops',
    safePathSegment(input.shopId),
    'modules',
    safePathSegment(input.moduleId),
    `${revisionSegment}/${input.folder}/${safePathSegment(input.assetId)}.${input.extension}`.replace(/^\//, ''),
  ].join('/');
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionForContentType(contentType: string): string {
  const subtype = contentType.split('/')[1]?.toLowerCase() ?? 'bin';
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  return subtype.replace(/[^a-z0-9]/g, '') || 'bin';
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

function assertPreviewIsRecipeSafe(body: string): void {
  if (/<script[\s>]/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /javascript:/i.test(body)) {
    throw new StorageAdapterError(
      'UNSAFE_PREVIEW_ARTIFACT',
      'Preview artifacts must be RecipeSpec/config-safe and cannot include scripts or inline event handlers.',
    );
  }
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof StorageAdapterError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: 'IMAGE_WORKER_FAILED', message: error.message };
  }

  return { code: 'IMAGE_WORKER_FAILED', message: 'Image worker failed.' };
}

function extractJobId(rawPayload: unknown): string {
  if (rawPayload && typeof rawPayload === 'object' && 'jobId' in rawPayload && typeof rawPayload.jobId === 'string') {
    return rawPayload.jobId;
  }

  return 'unknown';
}
