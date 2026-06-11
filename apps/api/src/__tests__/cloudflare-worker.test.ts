import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetJobStatusStore } from '@superapp/job-orchestration';
import worker from '../cloudflare-worker.js';
import { resetJobOrchestratorForTests } from '../handlers/job-handlers.js';
import { resetPreviewSandboxServiceForTests } from '../handlers/preview-handlers.js';

describe('cloudflare-worker', () => {
  let tempDir = '';

  afterEach(async () => {
    resetJobOrchestratorForTests();
    resetPreviewSandboxServiceForTests();
    resetJobStatusStore();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('returns health payload', async () => {
    const response = await worker.fetch(new Request('https://api.example/health'), {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.runtime).toBe('cloudflare-workers');
  });

  it('returns ready payload with env', async () => {
    const response = await worker.fetch(new Request('https://api.example/ready'), {
      JOB_EXECUTION_MODE: 'queue',
      ASSETS: {} as R2Bucket,
    });
    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.jobExecutionMode).toBe('queue');
    expect(body.r2Bound).toBe(true);
  });

  it('enqueues and returns job status inline', async () => {
    process.env.PLATFORM_V2_ENABLED = 'true';
    const response = await worker.fetch(
      new Request('https://api.example/v1/jobs/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobType: 'AI_GENERATE',
          shopId: 'shop_1',
          payload: {
            jobId: 'job_cf_1',
            shopId: 'shop_1',
            intentKey: 'promo.banner',
            prompt: 'test',
          },
        }),
      }),
      { JOB_EXECUTION_MODE: 'inline', PLATFORM_V2_ENABLED: 'true' },
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { jobId: string };
    const status = await worker.fetch(new Request(`https://api.example/v1/jobs/${body.jobId}`), {
      JOB_EXECUTION_MODE: 'inline',
      PLATFORM_V2_ENABLED: 'true',
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      jobId: body.jobId,
      status: 'SUCCESS',
      jobType: 'AI_GENERATE',
    });
  });

  it('rejects unknown job types', async () => {
    const response = await worker.fetch(
      new Request('https://api.example/v1/jobs/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobType: 'NOT_A_JOB', payload: {} }),
      }),
      { PLATFORM_V2_ENABLED: 'true' },
    );
    expect(response.status).toBe(400);
  });

  it('serves preview envelope and content', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-cf-preview-'));
    const enqueue = await worker.fetch(
      new Request('https://api.example/v1/jobs/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobType: 'PREVIEW_EXPORT',
          shopId: 'shop_1',
          payload: {
            type: 'PREVIEW_EXPORT',
            jobId: 'job_cf_preview',
            shopId: 'shop_1',
            moduleId: 'module_1',
            assetId: 'preview_module_1',
            preview: { contentType: 'text/html', body: '<section>CF preview</section>' },
          },
        }),
      }),
      {
        JOB_EXECUTION_MODE: 'inline',
        PLATFORM_V2_ENABLED: 'true',
        LOCAL_STORAGE_PATH: tempDir,
      },
    );
    expect(enqueue.status).toBe(202);

    const envelope = await worker.fetch(
      new Request('https://api.example/v1/preview/shop_1/module_1/envelope?assetId=preview_module_1'),
      { LOCAL_STORAGE_PATH: tempDir },
    );
    expect(envelope.status).toBe(200);
    expect((await envelope.json()).policy.scriptsAllowed).toBe(false);

    const content = await worker.fetch(
      new Request('https://api.example/v1/preview/shop_1/module_1/content?assetId=preview_module_1'),
      { LOCAL_STORAGE_PATH: tempDir },
    );
    expect(content.status).toBe(200);
    expect(content.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await content.text()).toContain('CF preview');
  });

  it('publishes to Cloudflare Queue when queue mode bindings exist', async () => {
    const send = vi.fn(async () => undefined);
    const response = await worker.fetch(
      new Request('https://api.example/v1/jobs/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobType: 'WEBHOOK_PROCESS',
          payload: { topic: 'orders/create', shopId: 'shop_1' },
        }),
      }),
      {
        JOB_EXECUTION_MODE: 'queue',
        PLATFORM_V2_ENABLED: 'true',
        WEBHOOK_QUEUE: { send } as Queue,
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledOnce();
  });

  it('exposes internal assistant readiness and chat stubs', async () => {
    const readiness = await worker.fetch(
      new Request('https://api.example/v1/internal/assistant/readiness'),
      { PLATFORM_V2_ENABLED: 'true' },
    );
    expect(readiness.status).toBe(200);
    expect((await readiness.json()).ready).toBe(true);

    const chat = await worker.fetch(
      new Request('https://api.example/v1/internal/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello worker' }),
      }),
      { PLATFORM_V2_ENABLED: 'true' },
    );
    expect(chat.status).toBe(200);
    expect((await chat.json()).content).toContain('hello worker');
  });
});
