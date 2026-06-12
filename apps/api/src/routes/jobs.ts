import type { FastifyInstance } from 'fastify';
import {
  getJobOrchestrator,
  handleJobEnqueue,
  handleJobMode,
  resetJobOrchestratorForTests,
} from '../handlers/job-handlers.js';

export { getJobOrchestrator, resetJobOrchestratorForTests };

/**
 * Platform-queue job routes backed by the shared Fastify/CF-Worker handlers.
 * `GET /v1/jobs/:jobId` is owned by `registerJobRoutes` in `routes/index.ts`,
 * which checks the BullMQ store first and falls back to the platform job
 * status store, so it is intentionally not registered here.
 */
export async function registerPlatformJobRoutes(app: FastifyInstance) {
  app.post('/v1/jobs/enqueue', async (request, reply) => {
    const result = await handleJobEnqueue(request.body);
    return reply.status(result.status).send(result.body);
  });

  app.get('/v1/jobs/mode', async () => {
    const result = await handleJobMode();
    return result.body;
  });
}
