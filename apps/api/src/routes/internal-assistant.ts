import type { FastifyInstance } from 'fastify';
import {
  handleAssistantChat,
  handleAssistantReadiness,
} from '../handlers/internal-assistant-handlers.js';

export async function registerInternalAssistantRoutes(app: FastifyInstance) {
  app.get('/v1/internal/assistant/readiness', async () => {
    const result = await handleAssistantReadiness();
    return result.body;
  });

  app.post('/v1/internal/assistant/chat', async (request, reply) => {
    const result = await handleAssistantChat(request.body);
    return reply.status(result.status).send(result.body);
  });
}
