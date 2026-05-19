import { describe, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import {
  enqueueAgentConnectorTestJob,
  enqueueConnectorTestJob,
  parseConnectorTestRequest,
  runConnectorTestJob,
} from '~/services/connectors/connector-test-job.server';
import { resolveConnectorRequestUrl } from '~/services/connectors/connector-security-policy.server';

function makeJobs() {
  return {
    create: vi.fn(async (input) => ({ id: 'job_1', status: 'QUEUED', ...input })),
    start: vi.fn(async () => undefined),
    succeed: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

describe('connector worker boundary', () => {
  it('validates connector test requests before enqueueing', () => {
    expect(() => parseConnectorTestRequest({
      connectorId: 'connector_1',
      path: '/customers',
      method: 'TRACE',
    })).toThrow();
  });

  it('enqueues merchant connector tests without executing the provider call inline', async () => {
    const jobs = makeJobs();
    const connectorService = { test: vi.fn() };

    const job = await enqueueConnectorTestJob('shop.example.myshopify.com', {
      connectorId: 'connector_1',
      path: '/customers',
      method: 'POST',
      headers: { 'x-request-id': 'req_1' },
      body: { limit: 1 },
    }, {
      jobs,
      connectorService,
      getShopId: async () => 'shop_1',
    });

    expect(job).toEqual({
      jobId: 'job_1',
      status: 'QUEUED',
      statusUrl: '/jobs?type=CONNECTOR_TEST&q=job_1',
    });
    expect(jobs.create).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 'shop_1',
      type: 'CONNECTOR_TEST',
      payload: expect.objectContaining({
        connectorId: 'connector_1',
        method: 'POST',
        shopDomain: 'shop.example.myshopify.com',
        source: 'merchant_api',
      }),
    }));
    expect(connectorService.test).not.toHaveBeenCalled();
  });

  it('enqueues agent connector tests with a connector id from route params', async () => {
    const jobs = makeJobs();

    await enqueueAgentConnectorTestJob('shop.example.myshopify.com', 'connector_from_params', {
      path: '/ping',
    }, {
      jobs,
      getShopId: async () => undefined,
    });

    expect(jobs.create).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        connectorId: 'connector_from_params',
        method: 'GET',
        source: 'agent_api',
      }),
    }));
  });

  it('applies connector allowlist and SSRF checks before worker execution', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '10.0.0.5', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );

    await expect(resolveConnectorRequestUrl({
      baseUrl: 'https://internal.example.com',
      path: '/metadata',
      allowlistDomains: ['internal.example.com'],
    })).rejects.toThrow(/private ipv4/i);
  });

  it('marks provider failures failed with a redacted error', async () => {
    const jobs = makeJobs();
    const connectorService = {
      test: vi.fn(async () => {
        throw new Error('provider rejected Bearer sk_live_secret for user@example.com');
      }),
    };

    await expect(runConnectorTestJob('job_1', {
      shopDomain: 'shop.example.myshopify.com',
      shopId: 'shop_1',
      connectorId: 'connector_1',
      path: '/ping',
      method: 'GET',
      source: 'merchant_api',
    }, {
      jobs,
      connectorService,
      activityLog: { log: vi.fn() },
    })).rejects.toThrow(/provider rejected Bearer \[REDACTED\] for \[REDACTED_EMAIL\]/);

    expect(jobs.start).toHaveBeenCalledWith('job_1');
    expect(jobs.succeed).not.toHaveBeenCalled();
    expect(jobs.fail).toHaveBeenCalledWith(
      'job_1',
      'provider rejected Bearer [REDACTED] for [REDACTED_EMAIL]',
    );
  });
});
