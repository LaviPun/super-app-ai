import { randomUUID } from 'node:crypto';
import {
  createJobOrchestrator,
  type JobOrchestrator,
} from '@superapp/job-orchestration';
import {
  createImageStorageProcessor,
  createScaffoldWorkerHandlers,
} from '@superapp/workers';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const EnqueueJobBodySchema = z.object({
  jobType: z.string().min(1),
  payload: z.unknown(),
  shopId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
});

let orchestratorSingleton: JobOrchestrator | undefined;

export function getJobOrchestrator(): JobOrchestrator {
  if (!orchestratorSingleton) {
    orchestratorSingleton = createJobOrchestrator({
      inlineHandlers: {
        'asset-storage': async (job) => {
          const processor = createImageStorageProcessor();
          const result = await processor({
            id: job.id,
            queueName: job.queueName,
            payload: job.payload,
            trace: job.trace,
          });
          return {
            status: result.status,
            result: result.result,
            events: result.events,
          };
        },
        ...createScaffoldWorkerHandlers(),
      },
    });
  }
  return orchestratorSingleton;
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.post('/v1/jobs/enqueue', async (request, reply) => {
    const parsed = EnqueueJobBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid job enqueue payload' });
    }

    const orchestrator = getJobOrchestrator();
    const jobId = randomUUID();
    const correlationId = parsed.data.correlationId ?? jobId;

    const result = await orchestrator.enqueue({
      id: jobId,
      jobType: parsed.data.jobType as never,
      payload: parsed.data.payload,
      trace: {
        correlationId,
        requestId: parsed.data.requestId,
        shopId: parsed.data.shopId,
      },
    });

    const statusCode =
      result.status === 'invalid' ? 400 : result.status === 'skipped' ? 503 : 202;

    return reply.status(statusCode).send({
      jobId,
      executionMode: orchestrator.executionMode,
      result,
    });
  });

  app.get('/v1/jobs/mode', async () => ({
    executionMode: getJobOrchestrator().executionMode,
  }));
}

export function resetJobOrchestratorForTests() {
  orchestratorSingleton = undefined;
}
