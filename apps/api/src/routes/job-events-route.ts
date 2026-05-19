import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { WorkerEventSchema } from '@superapp/platform-contracts';
import { toSseEvent, writeSseReady } from './sse.js';

export async function streamJobEvents(
  request: FastifyRequest,
  reply: FastifyReply,
  jobId: string,
): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  writeSseReady(reply);

  for (const event of await request.server.jobs.events.list(jobId)) {
    reply.raw.write(toSseEvent(event.type.toLowerCase(), event));
  }

  const unsubscribe = request.server.jobs.events.subscribe(jobId, (event) => {
    reply.raw.write(toSseEvent(event.type.toLowerCase(), WorkerEventSchema.parse(event)));
  });
  request.raw.on('close', unsubscribe);
}

export function jobEventLinks(jobId: string): { status: string; events: string } {
  return {
    status: `/v1/jobs/${jobId}`,
    events: `/v1/jobs/${jobId}/events`,
  };
}

export async function registerGenericJobEventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/jobs/:jobId/events', async (request, reply) => {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) return reply.status(400).send({ error: 'MISSING_JOB_ID' });
    const job = await app.jobs.store.get(jobId);
    if (!job) return reply.status(404).send({ error: 'JOB_NOT_FOUND' });
    await streamJobEvents(request, reply, jobId);
  });
}
