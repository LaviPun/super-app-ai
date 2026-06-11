import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  captureException,
  createLogger,
  extractTraceFromHeaders,
  mergeTraceContext,
  serializeQueueTrace,
  type StructuredLogger,
} from '@superapp/observability';
import type { TraceContext } from '@superapp/platform-contracts';
import type { ApiEnv } from '../env.js';
import type { JobSystem } from '../services/jobs/factory.js';

declare module 'fastify' {
  interface FastifyInstance {
    platformEnv: ApiEnv;
    jobs: JobSystem;
    platformLogger: StructuredLogger;
  }

  interface FastifyRequest {
    traceContext: TraceContext;
  }
}

function headerRecord(request: FastifyRequest): Record<string, string | string[] | undefined> {
  return request.headers as Record<string, string | string[] | undefined>;
}

export async function registerObservabilityPlugin(app: FastifyInstance, env: ApiEnv, jobs: JobSystem): Promise<void> {
  const logger = createLogger('api');

  app.decorate('platformEnv', env);
  app.decorate('jobs', jobs);
  app.decorate('platformLogger', logger);

  app.addHook('onRequest', async (request, reply) => {
    const extracted = extractTraceFromHeaders(headerRecord(request));
    const traceContext = serializeQueueTrace(mergeTraceContext(undefined, extracted));
    request.traceContext = traceContext;

    logger.info('request', {
      method: request.method,
      url: request.url,
      trace: traceContext,
    });

    for (const [key, value] of Object.entries({
      'x-request-id': traceContext.requestId,
      'x-correlation-id': traceContext.correlationId,
      ...(traceContext.traceparent ? { traceparent: traceContext.traceparent } : {}),
      ...(traceContext.tracestate ? { tracestate: traceContext.tracestate } : {}),
    })) {
      if (value) reply.header(key, value);
    }
  });

  app.setErrorHandler((err, request, reply) => {
    const error = err instanceof Error ? err : new Error(String(err));
    captureException(error, {
      ...request.traceContext,
      service: 'api',
    });
    logger.error('request failed', { url: request.url, method: request.method }, error);
    reply.status((error as { statusCode?: number }).statusCode ?? 500).send({
      error: 'INTERNAL_ERROR',
      message: error.message,
    });
  });
}
