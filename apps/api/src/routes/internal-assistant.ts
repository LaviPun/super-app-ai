import type { FastifyInstance } from 'fastify';
import {
  EnqueueJobRequestSchema,
  InternalToolRunPayloadSchema,
} from '@superapp/platform-contracts';
import { z } from 'zod';
import { streamJobEvents } from './job-events-route.js';

const InternalAssistantEnqueueSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  target: z.enum(['localMachine', 'modalRemote']).optional(),
  clientRequestId: z.string().trim().min(8).max(120).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  trace: z.object({
    requestId: z.string().min(1).optional(),
    correlationId: z.string().min(1),
  }),
});

export async function registerInternalAssistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/internal/assistant/jobs', async (request, reply) => {
    const parsed = InternalAssistantEnqueueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INTERNAL_ASSISTANT_JOB', details: parsed.error.flatten() });
    }

    const payload = InternalToolRunPayloadSchema.parse({
      sessionId: parsed.data.sessionId,
      message: parsed.data.message,
      target: parsed.data.target ?? 'localMachine',
      clientRequestId: parsed.data.clientRequestId,
      retryCount: parsed.data.retryCount,
    });
    const requestEnvelope = EnqueueJobRequestSchema.parse({
      type: 'INTERNAL_TOOL_RUN',
      payload,
      idempotencyKey: parsed.data.idempotencyKey,
      trace: parsed.data.trace,
    });

    try {
      const response = await app.jobs.orchestrator.enqueue(requestEnvelope);
      return reply.status(202).send({
        ...response,
        links: {
          status: `/v1/internal/assistant/jobs/${response.jobId}`,
          events: `/v1/internal/assistant/jobs/${response.jobId}/events`,
        },
      });
    } catch (err) {
      const known = err as { code?: string; statusCode?: number; message?: string; details?: unknown };
      return reply.status(known.statusCode ?? 500).send({
        error: known.code ?? 'INTERNAL_ASSISTANT_JOB_ENQUEUE_FAILED',
        message: known.message ?? 'Internal assistant job enqueue failed',
        details: known.details,
      });
    }
  });

  app.get('/v1/internal/assistant/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) return reply.status(400).send({ error: 'MISSING_JOB_ID' });
    const job = await app.jobs.store.get(jobId);
    if (!job || job.type !== 'INTERNAL_TOOL_RUN') return reply.status(404).send({ error: 'INTERNAL_ASSISTANT_JOB_NOT_FOUND' });
    const transportStatus = await app.jobs.queue.getStatus?.(job.id, job.queueName);
    const events = await app.jobs.events.list(job.id);
    return {
      ...job,
      transportStatus: transportStatus ?? 'unknown',
      events,
    };
  });

  app.get('/v1/internal/assistant/jobs/:jobId/events', async (request, reply) => {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) return reply.status(400).send({ error: 'MISSING_JOB_ID' });
    const job = await app.jobs.store.get(jobId);
    if (!job || job.type !== 'INTERNAL_TOOL_RUN') return reply.status(404).send({ error: 'INTERNAL_ASSISTANT_JOB_NOT_FOUND' });
    await streamJobEvents(request, reply, jobId);
  });
}
