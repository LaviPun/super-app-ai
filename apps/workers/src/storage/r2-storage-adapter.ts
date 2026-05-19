import type { PutObjectInput, PutObjectResult, StorageAdapter } from './storage-adapter';
import { StorageAdapterError } from './storage-adapter';

export type R2BucketLike = {
  put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<{ etag?: string } | null>;
  delete(key: string): Promise<void>;
};

export type R2StorageAdapterOptions = {
  bucketName: string;
  bucket?: R2BucketLike;
  publicBaseUrl?: string;
};

export class R2StorageAdapter implements StorageAdapter {
  readonly provider = 'r2' as const;
  readonly bucket: string;
  private readonly r2Bucket?: R2BucketLike;
  private readonly publicBaseUrl?: string;

  constructor(options: R2StorageAdapterOptions) {
    this.bucket = options.bucketName;
    this.r2Bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    if (!this.r2Bucket) {
      throw new StorageAdapterError(
        'R2_UNAVAILABLE',
        'Cloudflare R2 binding is unavailable. Use the local adapter for dev/test or configure R2 credentials.',
      );
    }

    const result = await this.r2Bucket.put(input.key, input.body, {
      httpMetadata: { contentType: input.contentType },
      customMetadata: input.metadata,
    });

    return {
      provider: this.provider,
      bucket: this.bucket,
      key: input.key,
      etag: result?.etag,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      visibility: input.visibility,
      publicUrl: input.visibility === 'public-read' ? this.buildPublicUrl(input.key) : undefined,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.r2Bucket) {
      throw new StorageAdapterError('R2_UNAVAILABLE', 'Cloudflare R2 binding is unavailable.');
    }

    await this.r2Bucket.delete(key);
  }

  async createSignedUrl(): Promise<string> {
    throw new StorageAdapterError(
      'SIGNED_URL_NOT_CONFIGURED',
      'Signed R2 URLs must be issued by the API proxy/signing service, not exposed from worker credentials.',
    );
  }

  private buildPublicUrl(key: string): string | undefined {
    if (!this.publicBaseUrl) return undefined;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${encodeURI(key)}`;
  }
}
