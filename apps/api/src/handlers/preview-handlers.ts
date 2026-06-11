import { PreviewSandboxService } from '../services/preview-sandbox.js';
import type { HandlerResult } from './job-handlers.js';
import { createPreviewStorage, type InlineHandlerEnv } from './inline-handlers.js';

let previewServiceSingleton: PreviewSandboxService | undefined;

export function getPreviewSandboxService(env: InlineHandlerEnv = process.env): PreviewSandboxService {
  if (!previewServiceSingleton) {
    previewServiceSingleton = new PreviewSandboxService({
      storage: createPreviewStorage(env),
    });
  }
  return previewServiceSingleton;
}

export function resetPreviewSandboxServiceForTests() {
  previewServiceSingleton = undefined;
}

export type PreviewRouteParams = {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId?: string;
};

export async function handlePreviewEnvelope(
  params: PreviewRouteParams,
  env: InlineHandlerEnv = process.env,
): Promise<HandlerResult> {
  const service = getPreviewSandboxService(env);
  const parsed = service.parseQuery(params);

  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid preview query' } };
  }

  const loaded = await service.loadPreviewHtml(parsed.data);
  if (!loaded) {
    return { status: 404, body: { error: 'Preview artifact not found' } };
  }

  return { status: 200, body: loaded.envelope };
}

export async function handlePreviewContent(
  params: PreviewRouteParams,
  env: InlineHandlerEnv = process.env,
): Promise<HandlerResult> {
  const service = getPreviewSandboxService(env);
  const parsed = service.parseQuery(params);

  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid preview query' } };
  }

  const loaded = await service.loadPreviewHtml(parsed.data);
  if (!loaded) {
    return { status: 404, body: { error: 'Preview artifact not found' } };
  }

  const { envelope, html } = loaded;
  return {
    status: 200,
    body: html,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': envelope.policy.csp,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  };
}
