import {
  R2StorageConfigSchema,
  StorageAdapterError,
  type R2StorageConfig,
  type StorageAdapter,
  type StorageGetResult,
  type StoragePutInput,
} from './types.js';

export type R2ObjectClient = {
  putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<{ etag?: string }>;
  getObject(input: { bucket: string; key: string }): Promise<StorageGetResult>;
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
};

export type R2StorageAdapterOptions = {
  config: R2StorageConfig;
  client: R2ObjectClient;
};

/**
 * Cloudflare R2 adapter contract. Production wiring injects an S3-compatible client;
 * tests use an in-memory client double.
 */
export class R2StorageAdapter implements StorageAdapter {
  readonly provider = 'r2' as const;
  private readonly config: R2StorageConfig;

  constructor(private readonly options: R2StorageAdapterOptions) {
    this.config = R2StorageConfigSchema.parse(options.config);
  }

  static assertCredentialsAvailable(env: {
    R2_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    R2_BUCKET?: string;
  }): R2StorageConfig {
    const parsed = R2StorageConfigSchema.safeParse({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
    if (!parsed.success) {
      throw new StorageAdapterError(
        'CREDENTIALS_UNAVAILABLE',
        'R2 credentials are incomplete; use local storage in dev/test or configure R2_* env vars.',
        parsed.error,
      );
    }
    return parsed.data;
  }

  async putObject(input: StoragePutInput): Promise<{ etag?: string }> {
    const body = typeof input.body === 'string' ? Buffer.from(input.body) : Buffer.from(input.body);
    try {
      return await this.options.client.putObject({
        bucket: this.config.bucket,
        key: input.key,
        body,
        contentType: input.contentType,
        metadata: input.metadata,
      });
    } catch (error) {
      throw new StorageAdapterError('PUT_FAILED', `R2 put failed for ${input.key}`, error);
    }
  }

  async getObject(input: { key: string }): Promise<StorageGetResult> {
    try {
      return await this.options.client.getObject({ bucket: this.config.bucket, key: input.key });
    } catch (error) {
      throw new StorageAdapterError('GET_FAILED', `R2 get failed for ${input.key}`, error);
    }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    try {
      await this.options.client.deleteObject({ bucket: this.config.bucket, key: input.key });
    } catch (error) {
      throw new StorageAdapterError('DELETE_FAILED', `R2 delete failed for ${input.key}`, error);
    }
  }

  async createSignedUrl(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }> {
    if (!this.config.publicBaseUrl) {
      throw new StorageAdapterError(
        'UNSIGNED_URL_UNSUPPORTED',
        'R2_PUBLIC_BASE_URL is required to build proxy-safe asset URLs in Phase 12.',
      );
    }
    const url = new URL(input.key.replace(/^\/+/, ''), `${this.config.publicBaseUrl.replace(/\/$/, '')}/`);
    url.searchParams.set('expiresIn', String(input.expiresInSeconds));
    return { url: url.toString() };
  }
}
