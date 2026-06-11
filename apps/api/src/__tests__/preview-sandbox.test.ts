import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import { resetJobOrchestratorForTests } from '../routes/jobs.js';
import { resetPreviewSandboxServiceForTests } from '../routes/preview.js';
import { PreviewSandboxService } from '../services/preview-sandbox.js';
import { LocalStorageAdapter } from '@superapp/workers';

describe('preview sandbox API', () => {
  let tempDir = '';

  afterEach(async () => {
    resetJobOrchestratorForTests();
    resetPreviewSandboxServiceForTests();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('returns envelope and CSP-protected content for exported previews', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-api-preview-'));
    process.env.LOCAL_STORAGE_PATH = tempDir;
    process.env.JOB_EXECUTION_MODE = 'inline';

    const { app } = await buildApp();

    const enqueue = await app.inject({
      method: 'POST',
      url: '/v1/jobs/enqueue',
      payload: {
        jobType: 'PREVIEW_EXPORT',
        shopId: 'shop_1',
        payload: {
          type: 'PREVIEW_EXPORT',
          jobId: 'job_preview_api',
          shopId: 'shop_1',
          moduleId: 'module_1',
          assetId: 'preview_module_1',
          preview: { contentType: 'text/html', body: '<section>Sandbox preview</section>' },
        },
      },
    });
    expect(enqueue.statusCode).toBe(202);

    const envelopeResponse = await app.inject({
      method: 'GET',
      url: '/v1/preview/shop_1/module_1/envelope?assetId=preview_module_1',
    });
    expect(envelopeResponse.statusCode).toBe(200);
    const envelope = envelopeResponse.json();
    expect(envelope.policy.scriptsAllowed).toBe(false);
    expect(envelope.policy.liquidAllowed).toBe(false);

    const contentResponse = await app.inject({
      method: 'GET',
      url: '/v1/preview/shop_1/module_1/content?assetId=preview_module_1',
    });
    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.headers['content-security-policy']).toContain("default-src 'none'");
    expect(contentResponse.body).toContain('Sandbox preview');
  });

  it('returns 404 when preview artifact is missing', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-api-preview-missing-'));
    process.env.LOCAL_STORAGE_PATH = tempDir;

    const { app } = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/preview/shop_9/module_9/envelope',
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects stored preview content that fails RecipeSpec safety checks', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-api-preview-unsafe-'));
    const storage = new LocalStorageAdapter({ rootDir: tempDir });
    const service = new PreviewSandboxService({ storage });

    await storage.putObject({
      key: 'shops/shop_1/modules/module_1/previews/preview_module_1.html',
      body: new TextEncoder().encode('<section onclick="x()">unsafe</section>'),
      contentType: 'text/html',
      visibility: 'private',
    });

    await expect(
      service.loadPreviewHtml({ shopId: 'shop_1', moduleId: 'module_1', assetId: 'preview_module_1' }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PREVIEW_ARTIFACT' });
  });
});
