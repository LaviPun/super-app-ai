import type { FastifyInstance } from 'fastify';
import {
  getPreviewSandboxService,
  handlePreviewContent,
  handlePreviewEnvelope,
  resetPreviewSandboxServiceForTests,
} from '../handlers/preview-handlers.js';

export { getPreviewSandboxService, resetPreviewSandboxServiceForTests };

export async function registerPreviewRoutes(app: FastifyInstance) {
  app.get('/v1/preview/:shopId/:moduleId/envelope', async (request, reply) => {
    const params = request.params as { shopId?: string; moduleId?: string };
    const queryParams = request.query as { revisionId?: string; assetId?: string };
    const result = await handlePreviewEnvelope({
      shopId: params.shopId ?? '',
      moduleId: params.moduleId ?? '',
      revisionId: queryParams.revisionId,
      assetId: queryParams.assetId,
    });
    return reply.status(result.status).send(result.body);
  });

  app.get('/v1/preview/:shopId/:moduleId/content', async (request, reply) => {
    const params = request.params as { shopId?: string; moduleId?: string };
    const queryParams = request.query as { revisionId?: string; assetId?: string };
    const result = await handlePreviewContent({
      shopId: params.shopId ?? '',
      moduleId: params.moduleId ?? '',
      revisionId: queryParams.revisionId,
      assetId: queryParams.assetId,
    });

    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        reply.header(key, value);
      }
    }

    return reply.status(result.status).send(result.body);
  });
}
