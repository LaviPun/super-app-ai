import { z } from 'zod';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { ConnectorService, type TestRequest } from '~/services/connectors/connector.service';
import { JobService } from '~/services/jobs/job.service';
import { persistJsonSafely, safeErrorMeta } from '~/services/observability/redact.server';

const connectorTestMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const connectorTestRequestSchema = z.object({
  connectorId: z.string().min(1),
  path: z.string().min(1),
  method: connectorTestMethodSchema.default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
}).strict();

export const connectorTestJobPayloadSchema = connectorTestRequestSchema.extend({
  shopDomain: z.string().min(1),
  shopId: z.string().min(1).optional(),
  source: z.enum(['merchant_api', 'agent_api']).default('merchant_api'),
});

export type ConnectorTestRequestInput = z.input<typeof connectorTestRequestSchema>;
export type ConnectorTestRequest = z.output<typeof connectorTestRequestSchema>;
export type ConnectorTestJobPayload = z.output<typeof connectorTestJobPayloadSchema>;

export type ConnectorTestJobStatus = {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
};

export type ConnectorTestJobHandle = ConnectorTestJobStatus & {
  statusUrl: string;
};

type ConnectorTestJobRow = {
  id: string;
  status: string;
};

type ConnectorTestJobStore = {
  create(params: Parameters<JobService['create']>[0]): Promise<ConnectorTestJobRow>;
  start(jobId: string): Promise<unknown>;
  succeed(jobId: string, result?: unknown): Promise<unknown>;
  fail(jobId: string, error: unknown): Promise<unknown>;
};

export type ConnectorTestJobDeps = {
  jobs?: ConnectorTestJobStore;
  connectorService?: Pick<ConnectorService, 'test'>;
  activityLog?: Pick<ActivityLogService, 'log'>;
  getShopId?: (shopDomain: string) => Promise<string | undefined>;
};

export function parseConnectorTestRequest(input: unknown): ConnectorTestRequest {
  return connectorTestRequestSchema.parse(input);
}

export function parseConnectorTestJobPayload(input: unknown): ConnectorTestJobPayload {
  return connectorTestJobPayloadSchema.parse(input);
}

export async function enqueueConnectorTestJob(
  shopDomain: string,
  input: unknown,
  deps: ConnectorTestJobDeps = {},
): Promise<ConnectorTestJobHandle> {
  const request = parseConnectorTestRequest(input);
  const shopId = await resolveShopId(shopDomain, deps);
  const jobs = deps.jobs ?? new JobService();
  const job = await jobs.create({
    shopId,
    type: 'CONNECTOR_TEST',
    payload: {
      ...request,
      shopDomain,
      shopId,
      source: 'merchant_api',
    } satisfies ConnectorTestJobPayload,
  });

  return toJobHandle(job);
}

export async function enqueueAgentConnectorTestJob(
  shopDomain: string,
  connectorId: string,
  input: unknown,
  deps: ConnectorTestJobDeps = {},
): Promise<ConnectorTestJobHandle> {
  const request = parseConnectorTestRequest({ ...(asRecord(input) ?? {}), connectorId });
  const shopId = await resolveShopId(shopDomain, deps);
  const jobs = deps.jobs ?? new JobService();
  const job = await jobs.create({
    shopId,
    type: 'CONNECTOR_TEST',
    payload: {
      ...request,
      shopDomain,
      shopId,
      source: 'agent_api',
    } satisfies ConnectorTestJobPayload,
  });

  return toJobHandle(job);
}

export async function runConnectorTestJob(
  jobId: string,
  rawPayload: unknown,
  deps: ConnectorTestJobDeps = {},
): Promise<unknown> {
  const payload = parseConnectorTestJobPayload(rawPayload);
  const jobs = deps.jobs ?? new JobService();
  const connectorService = deps.connectorService ?? new ConnectorService();
  const activityLog = deps.activityLog ?? new ActivityLogService();

  await jobs.start(jobId);
  try {
    const result = await connectorService.test(payload.shopDomain, toTestRequest(payload));
    const safeResult = JSON.parse(persistJsonSafely(result)) as unknown;
    await jobs.succeed(jobId, safeResult);
    await activityLog.log({
      actor: 'SYSTEM',
      action: 'CONNECTOR_TESTED',
      resource: `connector:${payload.connectorId}`,
      shopId: payload.shopId,
      details: {
        path: payload.path,
        method: payload.method,
        status: result.status,
        source: payload.source,
      },
    }).catch(() => {});

    return safeResult;
  } catch (error) {
    const safeError = safeErrorMeta(error);
    await jobs.fail(jobId, safeError.message);
    throw new Error(safeError.message);
  }
}

async function resolveShopId(shopDomain: string, deps: ConnectorTestJobDeps): Promise<string | undefined> {
  if (deps.getShopId) return deps.getShopId(shopDomain);
  const shop = await getPrisma().shop.findUnique({ where: { shopDomain }, select: { id: true } });
  return shop?.id;
}

function toJobHandle(job: ConnectorTestJobRow): ConnectorTestJobHandle {
  return {
    jobId: job.id,
    status: normalizeJobStatus(job.status),
    statusUrl: `/jobs?type=CONNECTOR_TEST&q=${encodeURIComponent(job.id)}`,
  };
}

function normalizeJobStatus(status: string): ConnectorTestJobStatus['status'] {
  return status === 'RUNNING' || status === 'SUCCESS' || status === 'FAILED' ? status : 'QUEUED';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toTestRequest(payload: ConnectorTestJobPayload): TestRequest {
  return {
    connectorId: payload.connectorId,
    path: payload.path,
    method: payload.method,
    headers: payload.headers,
    body: payload.body,
  };
}
