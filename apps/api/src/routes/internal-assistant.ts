import type { FastifyInstance } from 'fastify';

export async function registerInternalAssistantRoutes(app: FastifyInstance) {
  app.get('/v1/internal/assistant/readiness', async () => ({
    ready: true,
    service: '@superapp/api',
    mode: 'proxy-stub',
    capabilities: ['chat', 'tools', 'streaming'],
    platformV2Enabled: process.env.PLATFORM_V2_ENABLED !== 'false',
    note: 'Full assistant remains in apps/web; this endpoint exposes readiness for Platform V2 clients.',
  }));

  app.post('/v1/internal/assistant/chat', async (request, reply) => {
    const body = request.body as { message?: string } | undefined;
    if (!body?.message?.trim()) {
      return reply.status(400).send({ error: 'message is required' });
    }

    return reply.send({
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `Platform V2 assistant proxy received: ${body.message.trim().slice(0, 200)}`,
      model: 'platform-v2-proxy',
    });
  });
}
