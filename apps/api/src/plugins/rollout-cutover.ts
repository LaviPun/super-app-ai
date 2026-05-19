import type { FastifyInstance } from 'fastify';
import { parsePlatformV2RolloutFlags, shouldExposeFastifyV1Routes } from '@superapp/platform-contracts';

export async function registerRolloutCutoverPlugin(
  app: FastifyInstance,
  source: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const flags = parsePlatformV2RolloutFlags(source);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/health' || path === '/ready') {
      return;
    }

    if (!shouldExposeFastifyV1Routes(flags) && path.startsWith('/v1')) {
      return reply.status(503).send({
        error: 'FASTIFY_API_DISABLED',
        message:
          'Fastify V2 API routes are gated. Set FASTIFY_API_ENABLED=true after deployment validation.',
        rollout: flags,
      });
    }
  });
}
