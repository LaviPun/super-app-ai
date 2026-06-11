import type { ApiRuntimeEnv } from './api-context.js';
import type { HandlerResult } from './job-handlers.js';

export async function handleHealth(): Promise<HandlerResult> {
  return {
    status: 200,
    body: {
      status: 'ok',
      service: '@superapp/api',
      timestamp: new Date().toISOString(),
    },
  };
}

export async function handleReady(env: ApiRuntimeEnv = process.env): Promise<HandlerResult> {
  return {
    status: 200,
    body: {
      status: 'ready',
      jobExecutionMode: env.JOB_EXECUTION_MODE ?? 'inline',
      r2Bound: Boolean(env.ASSETS),
    },
  };
}

export async function handleHealthWorker(): Promise<HandlerResult> {
  const result = await handleHealth();
  return {
    ...result,
    body: {
      ...(result.body as Record<string, unknown>),
      runtime: 'cloudflare-workers',
    },
  };
}
