import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as dns } from 'node:dns';
import {
  createConnectorCallProcessor,
  createConnectorTestProcessor,
  createStubConnectorHttpClient,
  type ConnectorExecutionAdapter,
  type ConnectorHttpClient,
  type ConnectorRecord,
} from '../connector-execution.js';
import { createProcessorRegistry } from '../processors.js';

const baseJob = {
  id: 'job-connector-1',
  queueName: 'connector-execution' as const,
  trace: { correlationId: 'corr-connector-1' },
};

describe('connector execution processors', () => {
  beforeEach(() => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes CONNECTOR_TEST via injected http client (no inline fetch)', async () => {
    const httpClient = vi.fn<ConnectorHttpClient>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyPreview: '{"ok":true}',
    });

    const processor = createConnectorTestProcessor({
      adapter: new StubConnectorAdapter(),
      httpClient,
      logger: silentLogger(),
    });

    const result = await processor({
      ...baseJob,
      type: 'CONNECTOR_TEST',
      payload: { connectorId: 'conn-1', path: '/v1/ping', method: 'GET' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(httpClient).toHaveBeenCalledTimes(1);
    expect(result.events.at(-1)?.type).toBe('JOB_COMPLETED');
  });

  it('blocks SSRF via connector allowlist before http client runs', async () => {
    const httpClient = vi.fn<ConnectorHttpClient>();
    const processor = createConnectorTestProcessor({
      adapter: new StubConnectorAdapter({
        baseUrl: 'https://api.partner.test',
        allowlistDomains: ['other.partner.test'],
      }),
      httpClient,
      logger: silentLogger(),
    });

    await expect(processor({
      ...baseJob,
      type: 'CONNECTOR_TEST',
      payload: { connectorId: 'conn-1', path: '/v1/ping' },
    })).rejects.toThrow(/allowlisted/i);

    expect(httpClient).not.toHaveBeenCalled();
  });

  it('surfaces provider failures from the http client', async () => {
    const processor = createConnectorTestProcessor({
      adapter: new StubConnectorAdapter(),
      httpClient: async () => {
        throw new Error('upstream timeout');
      },
      logger: silentLogger(),
    });

    await expect(processor({
      ...baseJob,
      type: 'CONNECTOR_TEST',
      payload: { connectorId: 'conn-1', path: '/v1/ping' },
    })).rejects.toThrow(/upstream timeout/);
  });

  it('redacts sensitive headers in completion metadata', async () => {
    const processor = createConnectorTestProcessor({
      adapter: new StubConnectorAdapter(),
      httpClient: createStubConnectorHttpClient({
        ok: true,
        status: 200,
        headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
        bodyPreview: '{}',
      }),
      logger: silentLogger(),
    });

    const result = await processor({
      ...baseJob,
      type: 'CONNECTOR_TEST',
      payload: { connectorId: 'conn-1', path: '/v1/ping' },
    });

    const metadata = result.events.at(-1)?.metadata as { headers?: Record<string, string> } | undefined;
    expect(metadata?.headers?.authorization).toBe('[REDACTED]');
  });

  it('registers real connector processors instead of contract-only stubs', async () => {
    const registry = createProcessorRegistry({
      logger: silentLogger(),
      connectorHttpClient: createStubConnectorHttpClient(),
    });

    const result = await registry.CONNECTOR_CALL({
      ...baseJob,
      type: 'CONNECTOR_CALL',
      payload: { connectorId: 'conn-1', endpointId: 'endpoint-1' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events.at(-1)?.message).toContain('Connector call completed');
  });
});

class StubConnectorAdapter implements ConnectorExecutionAdapter {
  constructor(private readonly connector?: Partial<ConnectorRecord>) {}

  async loadConnector(connectorId: string, shopDomain = 'demo.myshopify.com') {
    return {
      id: connectorId,
      shopDomain,
      baseUrl: this.connector?.baseUrl ?? 'https://api.example.com',
      allowlistDomains: this.connector?.allowlistDomains ?? ['api.example.com'],
      auth: this.connector?.auth ?? { type: 'API_KEY', headerName: 'X-API-Key', apiKey: 'stub-key' },
    };
  }

  async loadEndpoint(connectorId: string, endpointId: string) {
    return {
      id: endpointId,
      path: `/endpoints/${connectorId}/${endpointId}`,
      method: 'POST' as const,
    };
  }
}

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}
