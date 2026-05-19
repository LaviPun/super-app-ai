import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LocalStorageConfig } from './types.js';
import { StorageAdapterError, type StorageAdapter, type StorageGetResult, type StoragePutInput } from './types.js';

export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = 'local' as const;

  constructor(private readonly config: LocalStorageConfig) {}

  private resolvePath(key: string): string {
    const normalized = key.replace(/^\/+/, '');
    const fullPath = path.resolve(this.config.basePath, normalized);
    const base = path.resolve(this.config.basePath);
    if (!fullPath.startsWith(base + path.sep) && fullPath !== base) {
      throw new StorageAdapterError('PUT_FAILED', `Storage key escapes local base path: ${key}`);
    }
    return fullPath;
  }

  async putObject(input: StoragePutInput): Promise<{ etag?: string }> {
    const filePath = this.resolvePath(input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const body = typeof input.body === 'string' ? Buffer.from(input.body) : Buffer.from(input.body);
    try {
      await writeFile(filePath, body);
      return { etag: `local-${body.byteLength}` };
    } catch (error) {
      throw new StorageAdapterError('PUT_FAILED', `Local storage put failed for ${input.key}`, error);
    }
  }

  async getObject(input: { key: string }): Promise<StorageGetResult> {
    const filePath = this.resolvePath(input.key);
    try {
      const body = await readFile(filePath);
      return {
        body,
        contentType: 'application/octet-stream',
        etag: `local-${body.byteLength}`,
      };
    } catch (error) {
      throw new StorageAdapterError('NOT_FOUND', `Local storage object not found: ${input.key}`, error);
    }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    const filePath = this.resolvePath(input.key);
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      throw new StorageAdapterError('DELETE_FAILED', `Local storage delete failed for ${input.key}`, error);
    }
  }
}
