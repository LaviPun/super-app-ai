import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import type { ApiEnv } from '../env.js';

const testEnv: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  API_SERVICE_VERSION: 'test',
  JOB_EXECUTION_MODE: 'queue',
  QUEUE_PROVIDER: 'memory',
  JOB_STORE_PROVIDER: 'memory',
  QUEUE_PREFIX: 'test',
  QUEUE_DEFAULT_ATTEMPTS: 2,
  QUEUE_DEFAULT_BACKOFF_MS: 10,
};

function signBody(body: unknown, secret: string): string {
  const raw = JSON.stringify(body);
  return createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('security plugin', () => {
  it('rejects connector enqueue URLs that fail SSRF checks', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connectors/test',
      payload: {
        payload: {
          connectorId: 'conn-1',
          path: 'https://169.254.169.254/latest/meta-data',
          method: 'GET',
        },
        trace: { correlationId: 'corr-ssrf-block' },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'UNSAFE_CONNECTOR_PATH' });
    await app.close();
  });

  it('requires valid Shopify webhook HMAC when SHOPIFY_API_SECRET is set', async () => {
    process.env.SHOPIFY_API_SECRET = 'phase17-test-secret';
    const app = await buildApp({ env: testEnv, logger: false });
    const payload = {
      shopDomain: 'demo.myshopify.com',
      topic: 'orders/create',
      eventId: 'evt-hmac-1',
      payload: { id: 1 },
    };

    const unsigned = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/shopify',
      payload,
    });
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.json()).toMatchObject({ error: 'INVALID_WEBHOOK_HMAC' });

    const signature = signBody(payload, process.env.SHOPIFY_API_SECRET);
    const signed = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/shopify',
      payload,
      headers: { 'x-shopify-hmac-sha256': signature },
    });
    expect(signed.statusCode).toBe(202);
    await app.close();
  });

  it('validates GDPR compliance webhook ingress boundaries', async () => {
    process.env.SHOPIFY_API_SECRET = 'phase17-test-secret';
    const app = await buildApp({ env: testEnv, logger: false });
    const payload = {
      shopDomain: '',
      topic: 'customers/redact',
      eventId: 'evt-gdpr-1',
    };
    const signature = signBody(payload, process.env.SHOPIFY_API_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/shopify',
      payload,
      headers: { 'x-shopify-hmac-sha256': signature },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'INVALID_GDPR_WEBHOOK' });
    await app.close();
  });

  it('returns 429 when API_RATE_LIMIT_MAX is exceeded', async () => {
    process.env.API_RATE_LIMIT_MAX = '1';
    process.env.API_RATE_LIMIT_WINDOW_MS = '60000';
    const app = await buildApp({ env: testEnv, logger: false });

    const first = await app.inject({ method: 'GET', url: '/health' });
    const second = await app.inject({ method: 'GET', url: '/health' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ error: 'RATE_LIMITED' });
    await app.close();
  });
});
