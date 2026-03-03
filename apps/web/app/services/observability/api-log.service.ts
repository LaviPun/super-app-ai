import { getPrisma } from '~/db.server';
import { getRequestId, runWithRequestContext, generateRequestId } from '~/services/observability/correlation.server';

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

export async function withApiLogging(
  input: { actor: 'INTERNAL'|'MERCHANT'|'WEBHOOK'|'APP_PROXY'; method: string; path: string; shopId?: string; meta?: unknown },
  fn: () => Promise<Response>
): Promise<Response> {
  const requestId = getRequestId();
  const start = Date.now();
  const logger = new ApiLogService();

  const run = async (): Promise<Response> => {
    try {
      const res = await fn();
      await logger.write({
        actor: input.actor,
        method: input.method,
        path: input.path,
        status: res.status,
        durationMs: Date.now() - start,
        success: res.status < 400,
        requestId,
        shopId: input.shopId,
        meta: input.meta,
      });
      // Propagate requestId in response header for client-side correlation.
      const headers = new Headers(res.headers);
      headers.set('x-request-id', requestId);
      return new Response(res.body, { status: res.status, headers });
    } catch (err: any) {
      await logger.write({
        actor: input.actor,
        method: input.method,
        path: input.path,
        status: err?.status ?? 500,
        durationMs: Date.now() - start,
        success: false,
        requestId,
        shopId: input.shopId,
        meta: { ...(input.meta as any), error: String(err) },
      });
      throw err;
    }
  };

  // If we're already inside a request context, just run; otherwise wrap in one.
  return runWithRequestContext({ requestId, actor: input.actor }, run);
}
