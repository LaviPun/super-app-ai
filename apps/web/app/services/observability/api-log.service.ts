import { getPrisma } from '~/db.server';
import { getRequestId, runWithRequestContext, getCorrelationId } from '~/services/observability/correlation.server';
import { ErrorLogService } from '~/services/observability/error-log.service';
import { isSensitiveHeader, redact, redactString, safeErrorMeta, safeMeta } from '~/services/observability/redact.server';

export class ApiLogService {
  /** Create an in-progress API log entry (status 0, finishedAt null). Returns id for later complete(). */
  async start(params: {
    actor: 'INTERNAL'|'MERCHANT'|'WEBHOOK'|'APP_PROXY';
    method: string;
    path: string;
    requestId?: string;
    correlationId?: string;
    shopId?: string;
    meta?: unknown;
  }): Promise<string | null> {
    if (process.env.NODE_ENV === 'test') return null;
    try {
      const prisma = getPrisma();
      const row = await prisma.apiLog.create({
        data: {
          actor: params.actor,
          method: params.method,
          path: params.path,
          status: 0,
          durationMs: 0,
          success: true,
          requestId: params.requestId ?? null,
          correlationId: params.correlationId ?? params.requestId ?? null,
          shop: params.shopId ? { connect: { id: params.shopId } } : undefined,
          meta: params.meta ? JSON.stringify(params.meta) : null,
          finishedAt: null,
        },
      });
      return row.id;
    } catch {
      return null;
    }
  }

  /** Mark an in-progress API log as finished. No-op if id is null. */
  async complete(
    id: string | null,
    params: {
      status: number;
      durationMs: number;
      success: boolean;
      meta?: unknown;
    }
  ): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !id) return;
    try {
      const prisma = getPrisma();
      await prisma.apiLog.update({
        where: { id },
        data: {
          status: params.status,
          durationMs: params.durationMs,
          success: params.success,
          meta: params.meta ? JSON.stringify(params.meta) : null,
          finishedAt: new Date(),
        },
      });
    } catch {
      // Logging failures must not crash the main request
    }
  }

  async write(params: {
    actor: 'INTERNAL'|'MERCHANT'|'WEBHOOK'|'APP_PROXY';
    method: string;
    path: string;
    status: number;
    durationMs: number;
    success: boolean;
    requestId?: string;
    correlationId?: string;
    shopId?: string;
    meta?: unknown;
  }) {
    if (process.env.NODE_ENV === 'test') return;
    try {
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
          correlationId: params.correlationId ?? params.requestId ?? null,
          shop: params.shopId ? { connect: { id: params.shopId } } : undefined,
          meta: params.meta ? JSON.stringify(params.meta) : null,
          finishedAt: new Date(),
        },
      });
    } catch {
      // Logging failures must not crash the main request
    }
  }
}

const META_BODY_MAX = 4096;

/** Conservative estimate: chars per token (JSON/mixed content). Used to cap logged body size by token limit. */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN_ESTIMATE);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[TRUNCATED total=${text.length} chars ~${Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)} tokens]`;
}

function truncateWithMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[TRUNCATED total=${text.length} chars]`;
}

function redactCapturedBody(
  text: string,
  maxChars: number,
  maxTokens?: number,
): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    const redactedJson = JSON.stringify(redact(parsed));
    if (maxTokens != null) return truncateToTokenLimit(redactedJson, maxTokens);
    return truncateWithMarker(redactedJson, maxChars);
  } catch {
    const redactedText = redactString(text);
    if (maxTokens != null) return truncateToTokenLimit(redactedText, maxTokens);
    return truncateWithMarker(redactedText, maxChars);
  }
}

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
    /** Max chars to store for request body (default META_BODY_MAX). Ignored if requestBodyMaxTokens is set. */
    requestBodyMax?: number;
    /** Max chars to store for response body (default META_BODY_MAX). Ignored if responseBodyMaxTokens is set. */
    responseBodyMax?: number;
    /** Max input tokens for request body; stored body is truncated to stay under this (estimate: ~3.5 chars/token). */
    requestBodyMaxTokens?: number;
    /** Max input tokens for response body; stored body is truncated to stay under this (estimate: ~3.5 chars/token). */
    responseBodyMaxTokens?: number;
  },
  fn: () => Promise<Response>
): Promise<Response> {
  const requestId = getRequestId();
  const correlationId = getCorrelationId();
  const start = Date.now();
  const logger = new ApiLogService();

  const run = async (): Promise<Response> => {
    const meta: Record<string, unknown> = input.meta ? { ...(input.meta as Record<string, unknown>) } : {};
    if (input.request) {
      const headers: Record<string, string> = {};
      input.request.headers.forEach((v, k) => {
        headers[k] = isSensitiveHeader(k) ? '[redacted]' : redactString(v);
      });
      meta.requestHeaders = headers;
      if (input.captureRequestBody && input.request.body) {
        try {
          const text = await input.request.clone().text();
          const max = input.requestBodyMax ?? META_BODY_MAX;
          meta.requestBody = redactCapturedBody(text, max, input.requestBodyMaxTokens);
        } catch {
          // ignore
        }
      }
    }
    const apiLogId = await logger.start({
      actor: input.actor,
      method: input.method,
      path: input.path,
      requestId,
      correlationId,
      shopId: input.shopId,
      meta: safeMeta(Object.keys(meta).length > 0 ? meta : undefined),
    });
    try {
      const res = await fn();
      if (res?.body && input.captureResponseBody) {
        try {
          const text = await res.clone().text();
          const max = input.responseBodyMax ?? META_BODY_MAX;
          meta.responseBody = redactCapturedBody(text, max, input.responseBodyMaxTokens);
        } catch {
          // ignore
        }
      }
      const success = res.status < 400;
      await logger.complete(apiLogId, {
        status: res.status,
        durationMs: Date.now() - start,
        success,
        meta: safeMeta(Object.keys(meta).length > 0 ? meta : input.meta),
      });
      if (!success) {
        const errLog = new ErrorLogService();
        await errLog.write(
          'ERROR',
          `API ${input.method} ${input.path} → ${res.status}`,
          undefined,
          safeMeta(meta),
          `${input.method} ${input.path}`,
          input.shopId,
          'API',
        );
      }
      const headers = new Headers(res.headers);
      headers.set('x-request-id', requestId);
      headers.set('x-correlation-id', correlationId);
      return new Response(res.body, { status: res.status, headers });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status ?? 500;
      const errorMeta = safeMeta({
        ...(meta as Record<string, unknown>),
        error: safeErrorMeta(err),
      });
      await logger.complete(apiLogId, {
        status,
        durationMs: Date.now() - start,
        success: false,
        meta: errorMeta,
      });
      const errLog = new ErrorLogService();
      const route = `${input.method} ${input.path}`;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      await errLog.write('ERROR', message, stack, errorMeta, route, input.shopId, 'API');
      throw err;
    }
  };

  return runWithRequestContext({ requestId, correlationId, actor: input.actor }, run);
}
