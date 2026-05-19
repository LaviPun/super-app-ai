import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';
import { R2StorageAdapter } from '../storage/r2-storage-adapter.js';
import { createStorageAdapter } from '../storage/storage-adapter-factory.js';
import { StorageAdapterError } from '../storage/types.js';

describe('storage adapters', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('stores and reads objects through the local adapter', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-storage-'));
    const adapter = new LocalStorageAdapter({ basePath: tempDir });
    await adapter.putObject({
      key: 'shops/demo/assets/a.png',
      body: Buffer.from('png-bytes'),
      contentType: 'image/png',
    });

    const stored = await readFile(path.join(tempDir, 'shops/demo/assets/a.png'));
    expect(stored.toString()).toBe('png-bytes');
    const read = await adapter.getObject({ key: 'shops/demo/assets/a.png' });
    expect(read.body.toString()).toBe('png-bytes');
  });

  it('falls back to local storage when R2 credentials are unavailable', () => {
    const adapter = createStorageAdapter({ env: {}, localBasePath: '.data/test-assets' });
    expect(adapter.provider).toBe('local');
  });

  it('uses the R2 contract when credentials and a client double are provided', async () => {
    const adapter = createStorageAdapter({
      env: {
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'assets',
        R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
      },
      r2Client: {
        putObject: async () => ({ etag: 'r2-etag' }),
        getObject: async () => ({
          body: Buffer.from('r2'),
          contentType: 'image/png',
        }),
        deleteObject: async () => undefined,
      },
    });

    expect(adapter.provider).toBe('r2');
    await adapter.putObject({
      key: 'shops/demo/assets/a.png',
      body: Buffer.from('r2'),
      contentType: 'image/png',
    });
    const signed = await adapter.createSignedUrl?.({ key: 'shops/demo/assets/a.png', expiresInSeconds: 300 });
    expect(signed?.url).toContain('https://cdn.example.com/');
  });

  it('throws CREDENTIALS_UNAVAILABLE when R2 credentials are incomplete', () => {
    expect(() =>
      R2StorageAdapter.assertCredentialsAvailable({
        R2_ACCOUNT_ID: 'acct',
      }),
    ).toThrowError(StorageAdapterError);
  });

  it('surfaces adapter failures from the R2 client double', async () => {
    const adapter = new R2StorageAdapter({
      config: {
        accountId: 'acct',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'assets',
      },
      client: {
        putObject: async () => {
          throw new Error('network down');
        },
        getObject: async () => {
          throw new Error('missing');
        },
        deleteObject: async () => {
          throw new Error('delete failed');
        },
      },
    });

    await expect(
      adapter.putObject({ key: 'x', body: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toMatchObject({ code: 'PUT_FAILED' });
  });
});
