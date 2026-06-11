/**
 * Cloudflare Workers entry for @superapp/api.
 * Local dev continues to use Fastify (`src/index.ts`). Deploy with `pnpm deploy:cf`.
 */
export interface ApiWorkerEnv {
  JOB_EXECUTION_MODE?: string;
  PLATFORM_V2_ENABLED?: string;
  ASSETS?: R2Bucket;
}

export default {
  async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: '@superapp/api',
        runtime: 'cloudflare-workers',
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method === 'GET' && url.pathname === '/ready') {
      return Response.json({
        status: 'ready',
        jobExecutionMode: env.JOB_EXECUTION_MODE ?? 'inline',
        r2Bound: Boolean(env.ASSETS),
      });
    }

    if (request.method === 'GET' && url.pathname === '/v1/jobs/mode') {
      return Response.json({
        executionMode: env.JOB_EXECUTION_MODE ?? 'inline',
        platformV2Enabled: env.PLATFORM_V2_ENABLED !== 'false',
      });
    }

    return Response.json(
      { error: 'Not found', hint: 'Use Fastify locally for full API surface until Workers port completes.' },
      { status: 404 },
    );
  },
};
