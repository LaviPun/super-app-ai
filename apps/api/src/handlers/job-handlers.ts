import { randomUUID } from 'node:crypto';
import {
  createJobOrchestrator,
  getJobStatusStore,
  type JobOrchestrator,
} from '@superapp/job-orchestration';
import { isPlatformJobType } from '@superapp/platform-contracts';
import { z } from 'zod';
import { createApiJobOrchestrator, type ApiRuntimeEnv } from './api-context.js';

const EnqueueJobBodySchema = z.object({
  jobType: z.string().min(1),
  payload: z.unknown(),
  shopId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
});

export type HandlerResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

let orchestratorSingleton: JobOrchestrator | undefined;

export function getJobOrchestrator(env: ApiRuntimeEnv = process.env): JobOrchestrator {
  if (!orchestratorSingleton) {
    orchestratorSingleton = createApiJobOrchestrator(env);
  }
  return orchestratorSingleton;
}

export function resetJobOrchestratorForTests() {
  orchestratorSingleton = undefined;
}

export async function handleJobMode(env: ApiRuntimeEnv = process.env): Promise<HandlerResult> {
  const orchestrator = getJobOrchestrator(env);
  return {
    status: 200,
    body: {
      executionMode: orchestrator.executionMode,
      platformV2Enabled: env.PLATFORM_V2_ENABLED !== 'false',
    },
  };
}

export async function handleJobEnqueue(
  body: unknown,
  env: ApiRuntimeEnv = process.env,
): Promise<HandlerResult> {
  const parsed = EnqueueJobBodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid job enqueue payload' } };
  }

  if (!isPlatformJobType(parsed.data.jobType)) {
    return { status: 400, body: { error: 'Unknown jobType', jobType: parsed.data.jobType } };
  }

  const orchestrator = getJobOrchestrator(env);
  const jobId = randomUUID();
  const correlationId = parsed.data.correlationId ?? jobId;

  const result = await orchestrator.enqueue({
    id: jobId,
    jobType: parsed.data.jobType,
    payload: parsed.data.payload,
    trace: {
      correlationId,
      requestId: parsed.data.requestId,
      shopId: parsed.data.shopId,
    },
  });

  const statusCode =
    result.status === 'invalid' ? 400 : result.status === 'skipped' ? 503 : 202;

  return {
    status: statusCode,
    body: {
      jobId,
      executionMode: orchestrator.executionMode,
      result,
    },
  };
}

export async function handleJobStatus(jobId: string): Promise<HandlerResult> {
  if (!jobId.trim()) {
    return { status: 400, body: { error: 'Invalid job id' } };
  }

  const record = await getJobStatusStore().get(jobId);
  if (!record) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  return { status: 200, body: record };
}

/** @deprecated Prefer getJobOrchestrator(env) */
export function createJobOrchestratorSingleton(options?: Parameters<typeof createJobOrchestrator>[0]) {
  return createJobOrchestrator(options);
}