import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export type RequestContext = {
  requestId: string;
  /**
   * Cross-request correlation id. Lives longer than `requestId` (defaults to it,
   * but can be overridden via the `x-correlation-id` header so a cron retry can
   * point back at the original request). Recorded on ApiLog/Job/ErrorLog/AiUsage/
   * FlowStepLog rows so the entire trace assembles from any single record.
   */
  correlationId: string;
  shopDomain?: string;
  actor?: string;
  startedAt: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateCorrelationId(): string {
  return `corr_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Run a function within a request context so that all observability utilities
 * can access the requestId without explicit threading.
 */
export function runWithRequestContext<T>(
  ctx: Partial<RequestContext> & { requestId?: string; correlationId?: string },
  fn: () => T
): T {
  const requestId = ctx.requestId ?? generateRequestId();
  const fullCtx: RequestContext = {
    requestId,
    correlationId: ctx.correlationId ?? requestId,
    shopDomain: ctx.shopDomain,
    actor: ctx.actor,
    startedAt: ctx.startedAt ?? Date.now(),
  };
  return storage.run(fullCtx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string {
  return storage.getStore()?.requestId ?? generateRequestId();
}

/** Returns the current correlationId, or a fresh one when called outside a context. */
export function getCorrelationId(): string {
  return storage.getStore()?.correlationId ?? generateCorrelationId();
}

/**
 * Remix-compatible middleware helper.
 * Call this at the top of every loader/action to establish request context.
 *
 * Reads `x-correlation-id` so an upstream caller (cron, agent, retry) can keep
 * the same correlation across multiple requests.
 */
export async function withRequestContext<T>(
  request: Request,
  actor: 'MERCHANT' | 'INTERNAL' | 'WEBHOOK' | 'APP_PROXY',
  fn: () => Promise<T>
): Promise<T> {
  const requestId =
    request.headers.get('x-request-id') ??
    request.headers.get('x-shopify-request-id') ??
    generateRequestId();
  const correlationId = request.headers.get('x-correlation-id') ?? requestId;

  return runWithRequestContext({ requestId, correlationId, actor, startedAt: Date.now() }, fn);
}
