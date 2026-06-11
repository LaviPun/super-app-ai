import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';

describe('local storage adapter getObject', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('reads objects written via putObject', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-storage-get-'));
    const adapter = new LocalStorageAdapter({ rootDir: tempDir });
    const body = new TextEncoder().encode('<section>preview</section>');

    await adapter.putObject({
      key: 'shops/shop_1/modules/module_1/previews/preview_1.html',
      body,
      contentType: 'text/html',
      visibility: 'private',
    });

    const result = await adapter.getObject('shops/shop_1/modules/module_1/previews/preview_1.html');
    expect(new TextDecoder().decode(result.body)).toBe('<section>preview</section>');
    expect(result.contentType).toContain('text/html');
  });
});
