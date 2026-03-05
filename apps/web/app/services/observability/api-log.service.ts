import { getPrisma } from '~/db.server';
import { getRequestId, runWithRequestContext, generateRequestId } from '~/services/observability/correlation.server';
import { ErrorLogService } from '~/services/observability/error-log.service';

export class ApiLogService {
  async write(params: {
    actor: 'INTERNAL'|'MERCHANT'|'WEBHOOK'|'APP_PROXY';
    method: string;
    path: string;
    status: number;
    durationMs: number;
    success: boolean;
    requestId?: string;
    shopId?: string;
    meta?: unknown;
  }) {
    // Unit tests run without a database; skip logging there.
    if (process.env.NODE_ENV === 'test') return;

    const prisma = getPrisma();
    await prisma.apiLog.create({
      data: {
        actor: params.actor,
        method: params.method,
        path: params.path,
        status: params.status,
        durationMs: params.durationMs,
        success: params.success,
        requestId: params.requestId ?? null,
        shopId: params.shopId ?? null,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  }
}

const META_BODY_MAX = 20000;

export async function withApiLogging(
  input: {
    actor: 'INTERNAL'|'MERCHANT'|'WEBHOOK'|'APP_PROXY';
    method: string;
    path: string;
    shopId?: string;
    meta?: unknown;
    /** When set, request headers (sensitive ones redacted) are stored in meta.requestHeaders */
    request?: Request;
    /** When true, request body is read from request.clone() before fn() and stored in meta.requestBody (truncated) */
    captureRequestBody?: boolean;
    /** When true, response body is stored in meta.responseBody (truncated) */
    captureResponseBody?: boolean;
  },
  fn: () => Promise<Response>
): Promise<Response> {
  const requestId = getRequestId();
  const start = Date.now();
  const logger = new ApiLogService();

  const run = async (): Promise<Response> => {
    const meta: Record<string, unknown> = input.meta ? { ...(input.meta as Record<string, unknown>) } : {};
    if (input.request) {
      const headers: Record<string, string> = {};
      input.request.headers.forEach((v, k) => {
        const lower = k.toLowerCase();
        headers[k] = (lower === 'authorization' || lower === 'cookie') ? '[redacted]' : v;
      });
      meta.requestHeaders = headers;
      if (input.captureRequestBody && input.request.body) {
        try {
          const text = await input.request.clone().text();
          meta.requestBody = text.slice(0, META_BODY_MAX);
        } catch {
          // ignore
        }
      }
    }
    try {
      const res = await fn();
      if (res?.body && input.captureResponseBody) {
        try {
          const text = await res.clone().text();
          meta.responseBody = text.slice(0, META_BODY_MAX);
        } catch {
          // ignore
        }
      }
      const success = res.status < 400;
      await logger.write({
        actor: input.actor,
        method: input.method,
        path: input.path,
        status: res.status,
        durationMs: Date.now() - start,
        success,
        requestId,
        shopId: input.shopId,
        meta: Object.keys(meta).length > 0 ? meta : input.meta,
      });
      if (!success) {
        const errLog = new ErrorLogService();
        await errLog.write('ERROR', `API ${input.method} ${input.path} → ${res.status}`, undefined, meta, `${input.method} ${input.path}`, input.shopId);
      }
      const headers = new Headers(res.headers);
      headers.set('x-request-id', requestId);
      return new Response(res.body, { status: res.status, headers });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status ?? 500;
      const meta = { ...(input.meta as Record<string, unknown>), error: err instanceof Error ? err.message : String(err) };
      await logger.write({
        actor: input.actor,
        method: input.method,
        path: input.path,
        status,
        durationMs: Date.now() - start,
        success: false,
        requestId,
        shopId: input.shopId,
        meta,
      });
      const errLog = new ErrorLogService();
      const route = `${input.method} ${input.path}`;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      await errLog.write('ERROR', message, stack, meta, route, input.shopId);
      throw err;
    }
  };

  return runWithRequestContext({ requestId, actor: input.actor }, run);
}
