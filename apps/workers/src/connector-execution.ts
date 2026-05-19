import {
  ConnectorCallPayloadSchema,
  ConnectorTestPayloadSchema,
  type WorkerEvent,
} from '@superapp/platform-contracts';
import {
  assertConnectorTargetUrl,
  redactHeaders,
  truncateBodyPreview,
  type ConnectorHttpMethod,
} from '@superapp/network-security';
import type { JobLedgerRepository } from '@superapp/db';
import type { WorkerJobEnvelope, WorkerProcessorResult } from './processors.js';
import type { WorkerLogger } from './logger.js';

export type ConnectorAuth =
  | { type: 'API_KEY'; headerName: string; apiKey: string }
  | { type: 'BASIC'; username: string; password: string }
  | { type: 'OAUTH2'; bearerToken: string };

export type ConnectorEndpointRecord = {
  id: string;
  path: string;
  method: ConnectorHttpMethod;
  headers?: Record<string, string>;
};

export type ConnectorRecord = {
  id: string;
  shopDomain: string;
  baseUrl: string;
  allowlistDomains: string[];
  auth: ConnectorAuth;
};

export type ConnectorHttpRequest = {
  url: string;
  method: ConnectorHttpMethod;
  headers: Record<string, string>;
  body?: unknown;
};

export type ConnectorHttpResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyPreview: string;
};

export type ConnectorExecutionAdapter = {
  loadConnector(connectorId: string, shopDomain?: string): Promise<ConnectorRecord>;
  loadEndpoint(connectorId: string, endpointId: string, shopDomain?: string): Promise<ConnectorEndpointRecord>;
};

export type ConnectorHttpClient = (
  request: ConnectorHttpRequest,
  options: { timeoutMs: number; maxResponseBytes: number },
) => Promise<ConnectorHttpResult>;

export type ConnectorExecutionOptions = {
  adapter: ConnectorExecutionAdapter;
  httpClient: ConnectorHttpClient;
  jobRepository?: JobLedgerRepository;
  logger: WorkerLogger;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 50_000;

export class StubConnectorExecutionAdapter implements ConnectorExecutionAdapter {
  async loadConnector(connectorId: string, shopDomain = 'demo.myshopify.com'): Promise<ConnectorRecord> {
    return {
      id: connectorId,
      shopDomain,
      baseUrl: 'https://api.example.com',
      allowlistDomains: ['api.example.com'],
      auth: { type: 'API_KEY', headerName: 'X-API-Key', apiKey: 'stub-key' },
    };
  }

  async loadEndpoint(connectorId: string, endpointId: string): Promise<ConnectorEndpointRecord> {
    return {
      id: endpointId,
      path: `/endpoints/${connectorId}/${endpointId}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    };
  }
}

export function createStubConnectorHttpClient(result: ConnectorHttpResult = {
  ok: true,
  status: 200,
  headers: { 'content-type': 'application/json' },
  bodyPreview: '{"ok":true}',
}): ConnectorHttpClient {
  return async () => result;
}

function applyAuth(headers: Record<string, string>, auth: ConnectorAuth): void {
  if (auth.type === 'API_KEY') headers[auth.headerName] = auth.apiKey;
  if (auth.type === 'BASIC') {
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }
  if (auth.type === 'OAUTH2') headers.Authorization = `Bearer ${auth.bearerToken}`;
  if (!headers['content-type']) headers['content-type'] = 'application/json';
}

async function buildRequest(input: {
  connector: ConnectorRecord;
  path: string;
  method: ConnectorHttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<ConnectorHttpRequest> {
  const safeUrl = await assertConnectorTargetUrl({
    baseUrl: input.connector.baseUrl,
    path: input.path,
    allowlistDomains: input.connector.allowlistDomains,
  });

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  applyAuth(headers, input.connector.auth);

  return {
    url: safeUrl.toString(),
    method: input.method,
    headers,
    body: input.body,
  };
}

function event(
  job: WorkerJobEnvelope,
  type: WorkerEvent['type'],
  progress: number,
  message: string,
  metadata?: Record<string, unknown>,
): WorkerEvent {
  return {
    type,
    jobId: job.id,
    queueName: job.queueName,
    trace: job.trace,
    timestamp: new Date().toISOString(),
    progress,
    message,
    metadata,
  };
}

export function createConnectorTestProcessor(options: ConnectorExecutionOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    const payload = ConnectorTestPayloadSchema.parse(job.payload);
    await options.jobRepository?.update(job.id, {
      status: 'RUNNING',
      attempts: 1,
      startedAt: new Date().toISOString(),
    });

    const started = event(job, 'JOB_STARTED', 5, 'Connector test started');
    try {
      const connector = await options.adapter.loadConnector(payload.connectorId, payload.shopDomain);
      const endpoint = payload.endpointId
        ? await options.adapter.loadEndpoint(payload.connectorId, payload.endpointId, payload.shopDomain)
        : null;
      const path = endpoint?.path ?? payload.path;
      if (!path) throw new Error('Connector test path could not be resolved');

      const request = await buildRequest({
        connector,
        path,
        method: payload.method ?? endpoint?.method ?? 'GET',
        headers: { ...(endpoint?.headers ?? {}), ...(payload.headers ?? {}) },
        body: payload.body,
      });

      const result = await options.httpClient(request, {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      });

      const safeResult = {
        ok: result.ok,
        status: result.status,
        headers: redactHeaders(result.headers),
        bodyPreview: truncateBodyPreview(result.bodyPreview),
      };

      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result: safeResult,
        finishedAt: new Date().toISOString(),
      });

      options.logger.info('connector test completed', {
        jobId: job.id,
        connectorId: payload.connectorId,
        status: result.status,
      });

      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 90, 'Connector test executed in worker', {
            status: safeResult.status,
            headerKeys: Object.keys(safeResult.headers),
          }),
          event(job, 'JOB_COMPLETED', 100, 'Connector test completed', safeResult),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, {
        status: 'FAILED',
        error: message,
        finishedAt: new Date().toISOString(),
      });
      options.logger.warn('connector test failed', { jobId: job.id, message });
      throw err;
    }
  };
}

export function createConnectorCallProcessor(options: ConnectorExecutionOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    const payload = ConnectorCallPayloadSchema.parse(job.payload);
    await options.jobRepository?.update(job.id, {
      status: 'RUNNING',
      attempts: 1,
      startedAt: new Date().toISOString(),
    });

    const started = event(job, 'JOB_STARTED', 5, 'Connector call started');
    try {
      const connector = await options.adapter.loadConnector(payload.connectorId, payload.shopDomain);
      const endpoint = await options.adapter.loadEndpoint(
        payload.connectorId,
        payload.endpointId,
        payload.shopDomain,
      );

      const request = await buildRequest({
        connector,
        path: endpoint.path,
        method: endpoint.method,
        headers: endpoint.headers,
        body: payload.input,
      });

      const result = await options.httpClient(request, {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      });

      const safeResult = {
        ok: result.ok,
        status: result.status,
        headers: redactHeaders(result.headers),
        bodyPreview: truncateBodyPreview(result.bodyPreview),
      };

      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result: safeResult,
        finishedAt: new Date().toISOString(),
      });

      options.logger.info('connector call completed', {
        jobId: job.id,
        connectorId: payload.connectorId,
        endpointId: payload.endpointId,
        status: result.status,
      });

      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 90, 'Connector call executed in worker', {
            endpointId: payload.endpointId,
            status: safeResult.status,
          }),
          event(job, 'JOB_COMPLETED', 100, 'Connector call completed', safeResult),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, {
        status: 'FAILED',
        error: message,
        finishedAt: new Date().toISOString(),
      });
      options.logger.warn('connector call failed', { jobId: job.id, message });
      throw err;
    }
  };
}

export async function defaultConnectorHttpClient(
  request: ConnectorHttpRequest,
  options: { timeoutMs: number; maxResponseBytes: number },
): Promise<ConnectorHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: truncateBodyPreview(text, options.maxResponseBytes),
    };
  } finally {
    clearTimeout(timer);
  }
}
