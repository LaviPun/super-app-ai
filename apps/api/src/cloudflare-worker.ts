import type { ApiRuntimeEnv } from './handlers/api-context.js';
import { handleAssistantChat, handleAssistantReadiness } from './handlers/internal-assistant-handlers.js';
import { handleHealthWorker, handleReady } from './handlers/health-handlers.js';
import {
  handleJobEnqueue,
  handleJobMode,
  handleJobStatus,
} from './handlers/job-handlers.js';
import { handlePreviewContent, handlePreviewEnvelope } from './handlers/preview-handlers.js';
import { toJsonResponse } from './http/response.js';

export type ApiWorkerEnv = ApiRuntimeEnv;

type RouteHandler = (request: Request, env: ApiWorkerEnv, params: Record<string, string>) => Promise<Response>;

const routes: Array<{
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}> = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    paramNames: [],
    handler: async () => toJsonResponse(await handleHealthWorker()),
  },
  {
    method: 'GET',
    pattern: /^\/ready$/,
    paramNames: [],
    handler: async (_request, env) => toJsonResponse(await handleReady(env)),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/jobs\/mode$/,
    paramNames: [],
    handler: async (_request, env) => toJsonResponse(await handleJobMode(env)),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/jobs\/enqueue$/,
    paramNames: [],
    handler: async (request, env) => {
      const body = await request.json().catch(() => undefined);
      return toJsonResponse(await handleJobEnqueue(body, env));
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/jobs\/([^/]+)$/,
    paramNames: ['jobId'],
    handler: async (_request, _env, params) => toJsonResponse(await handleJobStatus(params.jobId ?? '')),
  },
  {
    method: 'GET',
    pattern: /^\/v1\/preview\/([^/]+)\/([^/]+)\/envelope$/,
    paramNames: ['shopId', 'moduleId'],
    handler: async (request, env, params) => {
      const url = new URL(request.url);
      return toJsonResponse(
        await handlePreviewEnvelope(
          {
            shopId: params.shopId ?? '',
            moduleId: params.moduleId ?? '',
            revisionId: url.searchParams.get('revisionId') ?? undefined,
            assetId: url.searchParams.get('assetId') ?? undefined,
          },
          env,
        ),
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/preview\/([^/]+)\/([^/]+)\/content$/,
    paramNames: ['shopId', 'moduleId'],
    handler: async (request, env, params) => {
      const url = new URL(request.url);
      return toJsonResponse(
        await handlePreviewContent(
          {
            shopId: params.shopId ?? '',
            moduleId: params.moduleId ?? '',
            revisionId: url.searchParams.get('revisionId') ?? undefined,
            assetId: url.searchParams.get('assetId') ?? undefined,
          },
          env,
        ),
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/internal\/assistant\/readiness$/,
    paramNames: [],
    handler: async (_request, env) => toJsonResponse(await handleAssistantReadiness(env)),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/internal\/assistant\/chat$/,
    paramNames: [],
    handler: async (request, env) => {
      const body = await request.json().catch(() => undefined);
      return toJsonResponse(await handleAssistantChat(body, env));
    },
  },
];

function matchRoute(method: string, pathname: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = match[index + 1] ?? '';
    });

    return { route, params };
  }

  return undefined;
}

export default {
  async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const matched = matchRoute(request.method, url.pathname);

    if (!matched) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return matched.route.handler(request, env, matched.params);
  },
};
