import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import type { GetObjectResult, PutObjectInput, PutObjectResult, StorageAdapter } from './storage-adapter';
import { StorageAdapterError } from './storage-adapter';

export type LocalStorageAdapterOptions = {
  rootDir: string;
  bucket?: string;
};

export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = 'local' as const;
  readonly bucket: string;
  private readonly rootDir: string;

  constructor(options: LocalStorageAdapterOptions) {
    this.rootDir = options.rootDir;
    this.bucket = options.bucket ?? 'local-generated-assets';
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const filePath = this.resolveKey(input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);

    const etag = createHash('sha256').update(input.body).digest('hex');

    return {
      provider: this.provider,
      bucket: this.bucket,
      key: input.key,
      etag,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      visibility: input.visibility,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const filePath = this.resolveKey(key);
    let body: Buffer;
    try {
      body = await readFile(filePath);
    } catch (error) {
      throw new StorageAdapterError('OBJECT_NOT_FOUND', 'Storage object was not found.', { cause: error });
    }

    return {
      body: new Uint8Array(body),
      contentType: contentTypeForKey(key),
      sizeBytes: body.byteLength,
    };
  }

  async createSignedUrl(key: string, options: { expiresInSeconds: number }): Promise<string> {
    if (options.expiresInSeconds <= 0) {
      throw new StorageAdapterError('INVALID_SIGNED_URL_TTL', 'Signed URL TTL must be positive.');
    }

    return `local://${this.bucket}/${encodeURIComponent(key)}?expiresIn=${options.expiresInSeconds}`;
  }

  private resolveKey(key: string): string {
    if (key.includes('\0') || key.startsWith('/') || key.includes('..')) {
      throw new StorageAdapterError('INVALID_STORAGE_KEY', 'Storage keys must be relative paths without traversal.');
    }

    const normalized = normalize(key);
    if (normalized.startsWith('..')) {
      throw new StorageAdapterError('INVALID_STORAGE_KEY', 'Storage keys must stay inside the storage root.');
    }

    return join(this.rootDir, normalized);
  }
}

function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
