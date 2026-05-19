import type { FastifyInstance } from 'fastify';
import {
  EnqueueJobRequestSchema,
  HealthResponseSchema,
  JobRecordSchema,
  ReadinessResponseSchema,
  WorkerEventSchema,
} from '@superapp/platform-contracts';
import { mergeTraceContext, serializeQueueTrace } from '@superapp/observability';
import type { ApiEnv } from '../env.js';
import { jobEventLinks, registerGenericJobEventRoutes } from './job-events-route.js';

export async function registerHealthRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  app.get('/health', async () => {
    const body = HealthResponseSchema.parse({
      ok: true,
      service: 'api',
      version: env.API_SERVICE_VERSION,
      timestamp: new Date().toISOString(),
    });
    return body;
  });

  app.get('/ready', async () => {
    const body = ReadinessResponseSchema.parse({
      ok: true,
      service: 'api',
      version: env.API_SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      checks: { config: true },
    });
    return body;
  });
}

/** Thin jobs route — validates and acknowledges enqueue; workers execute later. */
export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  await registerGenericJobEventRoutes(app);

  app.get('/v1/jobs/:jobId', async (request, reply) => {
    const params = request.params as { jobId?: string };
    if (!params.jobId) return reply.status(400).send({ error: 'MISSING_JOB_ID' });
    const job = await app.jobs.store.get(params.jobId);
    if (!job) return reply.status(404).send({ error: 'JOB_NOT_FOUND' });
    const transportStatus = await app.jobs.queue.getStatus?.(job.id, job.queueName);
    const events = await app.jobs.events.list(job.id);
    return {
      ...JobRecordSchema.parse(job),
      transportStatus: transportStatus ?? 'unknown',
      events: events.map((event) => WorkerEventSchema.parse(event)),
      links: jobEventLinks(job.id),
    };
  });

  app.post('/v1/jobs', async (request, reply) => {
    const parsed = EnqueueJobRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_JOB_REQUEST', details: parsed.error.flatten() });
    }

    const trace = serializeQueueTrace(
      mergeTraceContext(request.traceContext, parsed.data.trace),
    );
    const enqueueRequest = { ...parsed.data, trace };

    try {
      const response = await app.jobs.orchestrator.enqueue(enqueueRequest);
      return reply.status(202).send({
        ...response,
        links: jobEventLinks(response.jobId),
      });
    } catch (err) {
      const known = err as { code?: string; statusCode?: number; message?: string; details?: unknown };
      return reply.status(known.statusCode ?? 500).send({
        error: known.code ?? 'JOB_ENQUEUE_FAILED',
        message: known.message ?? 'Job enqueue failed',
        details: known.details,
      });
    }
  });
}
