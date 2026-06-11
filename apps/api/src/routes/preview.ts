import { createStorageAdapter } from '@superapp/workers';
import type { FastifyInstance } from 'fastify';
import { PreviewSandboxService } from '../services/preview-sandbox.js';

let previewServiceSingleton: PreviewSandboxService | undefined;

export function getPreviewSandboxService(): PreviewSandboxService {
  if (!previewServiceSingleton) {
    previewServiceSingleton = new PreviewSandboxService({
      storage: createStorageAdapter({
        localRoot: process.env.LOCAL_STORAGE_PATH,
      }),
    });
  }
  return previewServiceSingleton;
}

export async function registerPreviewRoutes(app: FastifyInstance) {
  app.get('/v1/preview/:shopId/:moduleId/envelope', async (request, reply) => {
    const params = request.params as { shopId?: string; moduleId?: string };
    const queryParams = request.query as { revisionId?: string; assetId?: string };
    const service = getPreviewSandboxService();
    const parsed = service.parseQuery({
      shopId: params.shopId ?? '',
      moduleId: params.moduleId ?? '',
      revisionId: queryParams.revisionId,
      assetId: queryParams.assetId,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid preview query' });
    }

    const loaded = await service.loadPreviewHtml(parsed.data);
    if (!loaded) {
      return reply.status(404).send({ error: 'Preview artifact not found' });
    }

    return reply.send(loaded.envelope);
  });

  app.get('/v1/preview/:shopId/:moduleId/content', async (request, reply) => {
    const params = request.params as { shopId?: string; moduleId?: string };
    const queryParams = request.query as { revisionId?: string; assetId?: string };
    const service = getPreviewSandboxService();
    const parsed = service.parseQuery({
      shopId: params.shopId ?? '',
      moduleId: params.moduleId ?? '',
      revisionId: queryParams.revisionId,
      assetId: queryParams.assetId,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid preview query' });
    }

    const loaded = await service.loadPreviewHtml(parsed.data);
    if (!loaded) {
      return reply.status(404).send({ error: 'Preview artifact not found' });
    }

    const { envelope, html } = loaded;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Security-Policy', envelope.policy.csp);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    return reply.send(html);
  });
}

export function resetPreviewSandboxServiceForTests() {
  previewServiceSingleton = undefined;
}
