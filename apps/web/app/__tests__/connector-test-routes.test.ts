import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAdminMock = vi.fn();
const enforceRateLimitMock = vi.fn(async () => undefined);
const withApiLoggingMock = vi.fn(async (_meta, handler: () => Promise<Response>) => handler());
const enqueueConnectorTestJobMock = vi.fn();
const enqueueAgentConnectorTestJobMock = vi.fn();

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      admin: authenticateAdminMock,
    },
  },
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock('~/services/observability/api-log.service', () => ({
  withApiLogging: withApiLoggingMock,
}));

vi.mock('~/services/connectors/connector-test-job.server', () => ({
  enqueueConnectorTestJob: enqueueConnectorTestJobMock,
  enqueueAgentConnectorTestJob: enqueueAgentConnectorTestJobMock,
}));

vi.mock('~/services/connectors/connector.service', () => ({
  ConnectorService: class {
    test = vi.fn();
  },
}));

describe('connector test routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAdminMock.mockResolvedValue({ session: { shop: 'shop.example.myshopify.com' } });
    enqueueConnectorTestJobMock.mockResolvedValue({
      jobId: 'job_1',
      status: 'QUEUED',
      statusUrl: '/jobs?type=CONNECTOR_TEST&q=job_1',
    });
    enqueueAgentConnectorTestJobMock.mockResolvedValue({
      jobId: 'job_2',
      status: 'QUEUED',
      statusUrl: '/jobs?type=CONNECTOR_TEST&q=job_2',
    });
  });

  it('merchant test route returns 202 queued job shape', async () => {
    const mod = await import('~/routes/api.connectors.test');
    const response = await mod.action({
      request: new Request('http://test/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId: 'connector_1', path: '/ping' }),
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: true,
      job: {
        jobId: 'job_1',
        status: 'QUEUED',
        statusUrl: '/jobs?type=CONNECTOR_TEST&q=job_1',
      },
    });
    expect(enqueueConnectorTestJobMock).toHaveBeenCalledWith('shop.example.myshopify.com', {
      connectorId: 'connector_1',
      path: '/ping',
    });
  });

  it('agent test route returns 202 queued job shape', async () => {
    const mod = await import('~/routes/api.agent.connectors.$connectorId.test');
    const response = await mod.action({
      params: { connectorId: 'connector_2' },
      request: new Request('http://test/api/agent/connectors/connector_2/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/ping' }),
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: true,
      job: {
        jobId: 'job_2',
        status: 'QUEUED',
        statusUrl: '/jobs?type=CONNECTOR_TEST&q=job_2',
      },
    });
    expect(enqueueAgentConnectorTestJobMock).toHaveBeenCalledWith(
      'shop.example.myshopify.com',
      'connector_2',
      { path: '/ping' },
    );
  });
});
