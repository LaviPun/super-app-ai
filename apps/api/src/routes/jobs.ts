import type { FastifyInstance } from 'fastify';
import {
  getJobOrchestrator,
  handleJobEnqueue,
  handleJobMode,
  handleJobStatus,
  resetJobOrchestratorForTests,
} from '../handlers/job-handlers.js';

export { getJobOrchestrator, resetJobOrchestratorForTests };

export async function registerJobRoutes(app: FastifyInstance) {
  app.post('/v1/jobs/enqueue', async (request, reply) => {
    const result = await handleJobEnqueue(request.body);
    return reply.status(result.status).send(result.body);
  });

  app.get('/v1/jobs/mode', async () => {
    const result = await handleJobMode();
    return result.body;
  });

  app.get('/v1/jobs/:jobId', async (request, reply) => {
    const params = request.params as { jobId?: string };
    const result = await handleJobStatus(params.jobId ?? '');
    return reply.status(result.status).send(result.body);
  });
}
