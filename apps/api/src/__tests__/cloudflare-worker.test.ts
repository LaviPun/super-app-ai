import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-worker.js';

describe('cloudflare-worker', () => {
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
      ASSETS: {} as { put: () => Promise<unknown> },
    });
    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.jobExecutionMode).toBe('queue');
    expect(body.r2Bound).toBe(true);
  });
});
