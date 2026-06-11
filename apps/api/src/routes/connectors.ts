import type { FastifyInstance } from 'fastify';
import {
  ConnectorCallPayloadSchema,
  ConnectorTestPayloadSchema,
  EnqueueJobResponseSchema,
  IdempotencyKeySchema,
  TraceContextSchema,
} from '@superapp/platform-contracts';
import { z } from 'zod';

const ConnectorEnqueueBaseSchema = z.object({
  trace: TraceContextSchema,
  idempotencyKey: IdempotencyKeySchema.optional(),
});

const ConnectorTestEnqueueSchema = ConnectorEnqueueBaseSchema.extend({
  payload: ConnectorTestPayloadSchema,
});

const ConnectorCallEnqueueSchema = ConnectorEnqueueBaseSchema.extend({
  payload: ConnectorCallPayloadSchema,
});

/** Connector job initiation — enqueue only; workers perform network I/O. */
export async function registerConnectorRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/connectors/test', async (request, reply) => {
    const parsed = ConnectorTestEnqueueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_CONNECTOR_TEST_REQUEST', details: parsed.error.flatten() });
    }

    try {
      const response = await app.jobs.orchestrator.enqueue({
        type: 'CONNECTOR_TEST',
        payload: parsed.data.payload,
        trace: parsed.data.trace,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return reply.status(202).send(EnqueueJobResponseSchema.parse(response));
    } catch (err) {
      return sendEnqueueError(reply, err);
    }
  });

  app.post('/v1/connectors/call', async (request, reply) => {
    const parsed = ConnectorCallEnqueueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_CONNECTOR_CALL_REQUEST', details: parsed.error.flatten() });
    }

    try {
      const response = await app.jobs.orchestrator.enqueue({
        type: 'CONNECTOR_CALL',
        payload: parsed.data.payload,
        trace: parsed.data.trace,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return reply.status(202).send(EnqueueJobResponseSchema.parse(response));
    } catch (err) {
      return sendEnqueueError(reply, err);
    }
  });
}

function sendEnqueueError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
) {
  const known = err as { code?: string; statusCode?: number; message?: string; details?: unknown };
  return reply.status(known.statusCode ?? 500).send({
    error: known.code ?? 'CONNECTOR_ENQUEUE_FAILED',
    message: known.message ?? 'Connector job enqueue failed',
    details: known.details,
  });
}
