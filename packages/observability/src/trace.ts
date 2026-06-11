import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { TraceContextSchema, type TraceContext } from '@superapp/platform-contracts';

export type ObservabilityContext = TraceContext & {
  service?: string;
  startedAt: number;
};

const storage = new AsyncLocalStorage<ObservabilityContext>();

const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateCorrelationId(): string {
  return `corr_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateTraceParent(sampled = true): string {
  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

export function parseTraceParent(value: string): { traceId: string; spanId: string; sampled: boolean } | null {
  const match = TRACEPARENT_RE.exec(value.trim());
  if (!match) return null;
  const [, traceId, spanId, flags] = match;
  if (!traceId || !spanId || !flags) return null;
  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 0x1) === 1,
  };
}

export function childTraceParent(parent: string): string {
  const parsed = parseTraceParent(parent);
  if (!parsed) return generateTraceParent();
  const childSpanId = crypto.randomBytes(8).toString('hex');
  const flags = parsed.sampled ? '01' : '00';
  return `00-${parsed.traceId}-${childSpanId}-${flags}`;
}

export function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function extractTraceFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Partial<TraceContext> {
  const requestId =
    normalizeHeaderValue(headers['x-request-id']) ??
    normalizeHeaderValue(headers['x-shopify-request-id']);
  const correlationId = normalizeHeaderValue(headers['x-correlation-id']);
  const traceparent = normalizeHeaderValue(headers.traceparent);
  const tracestate = normalizeHeaderValue(headers.tracestate);
  const shopId = normalizeHeaderValue(headers['x-shop-id']);

  const out: Partial<TraceContext> = {};
  if (requestId) out.requestId = requestId;
  if (correlationId) out.correlationId = correlationId;
  if (traceparent) out.traceparent = traceparent;
  if (tracestate) out.tracestate = tracestate;
  if (shopId) out.shopId = shopId;
  return out;
}

export function mergeTraceContext(
  base: Partial<TraceContext> | undefined,
  incoming: Partial<TraceContext> | undefined,
): TraceContext {
  const requestId = incoming?.requestId ?? base?.requestId ?? generateRequestId();
  const correlationId = incoming?.correlationId ?? base?.correlationId ?? requestId;
  return TraceContextSchema.parse({
    requestId,
    correlationId,
    shopId: incoming?.shopId ?? base?.shopId,
    traceparent: incoming?.traceparent ?? base?.traceparent ?? generateTraceParent(),
    tracestate: incoming?.tracestate ?? base?.tracestate,
  });
}

export function injectTraceHeaders(trace: TraceContext): Record<string, string> {
  const headers: Record<string, string> = {
    'x-correlation-id': trace.correlationId,
  };
  if (trace.requestId) headers['x-request-id'] = trace.requestId;
  if (trace.traceparent) headers.traceparent = trace.traceparent;
  if (trace.tracestate) headers.tracestate = trace.tracestate;
  if (trace.shopId) headers['x-shop-id'] = trace.shopId;
  return headers;
}

export function serializeQueueTrace(trace: TraceContext): TraceContext {
  return TraceContextSchema.parse(trace);
}

export function runWithObservabilityContext<T>(
  ctx: Partial<ObservabilityContext> & { correlationId?: string; requestId?: string },
  fn: () => T,
): T {
  const requestId = ctx.requestId ?? generateRequestId();
  const fullCtx: ObservabilityContext = {
    ...mergeTraceContext(undefined, ctx),
    service: ctx.service,
    startedAt: ctx.startedAt ?? Date.now(),
    requestId,
  };
  return storage.run(fullCtx, fn);
}

export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

export function getActiveTraceContext(): TraceContext {
  const ctx = storage.getStore();
  if (!ctx) {
    return mergeTraceContext(undefined, undefined);
  }
  return TraceContextSchema.parse(ctx);
}
