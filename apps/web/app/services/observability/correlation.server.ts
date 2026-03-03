import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export type RequestContext = {
  requestId: string;
  shopDomain?: string;
  actor?: string;
  startedAt: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new request ID.
 */
export function generateRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Run a function within a request context so that all observability utilities
 * can access the requestId without explicit threading.
 */
export function runWithRequestContext<T>(
  ctx: Partial<RequestContext> & { requestId?: string },
  fn: () => T
): T {
  const fullCtx: RequestContext = {
    requestId: ctx.requestId ?? generateRequestId(),
    shopDomain: ctx.shopDomain,
    actor: ctx.actor,
    startedAt: ctx.startedAt ?? Date.now(),
  };
  return storage.run(fullCtx, fn);
}

/**
 * Get the current request context (if any).
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Get just the current requestId, generating a transient one if called outside a context.
 */
export function getRequestId(): string {
  return storage.getStore()?.requestId ?? generateRequestId();
}

/**
 * Remix-compatible middleware helper.
 * Call this at the top of every loader/action to establish request context.
 *
 * Usage:
 *   export async function loader({ request }) {
 *     return withRequestContext(request, 'MERCHANT', async () => { ... });
 *   }
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

  return runWithRequestContext({ requestId, actor, startedAt: Date.now() }, fn);
}
