import { describe, expect, it } from 'vitest';
import {
  childTraceParent,
  extractTraceFromHeaders,
  generateTraceParent,
  injectTraceHeaders,
  mergeTraceContext,
  parseTraceParent,
  runWithObservabilityContext,
  serializeQueueTrace,
} from '../trace.js';

describe('trace context propagation', () => {
  it('parses and generates W3C traceparent values', () => {
    const parent = generateTraceParent(true);
    const parsed = parseTraceParent(parent);
    expect(parsed).not.toBeNull();
    expect(parsed?.traceId).toHaveLength(32);
    expect(parsed?.spanId).toHaveLength(16);
    expect(parsed?.sampled).toBe(true);
  });

  it('creates a child span while preserving trace id', () => {
    const parent = generateTraceParent(true);
    const child = childTraceParent(parent);
    expect(parseTraceParent(parent)?.traceId).toBe(parseTraceParent(child)?.traceId);
    expect(parseTraceParent(parent)?.spanId).not.toBe(parseTraceParent(child)?.spanId);
  });

  it('extracts trace headers from inbound requests', () => {
    const traceparent = generateTraceParent(true);
    const extracted = extractTraceFromHeaders({
      'x-request-id': 'req-123',
      'x-correlation-id': 'corr-456',
      traceparent,
      tracestate: 'vendor=1',
      'x-shop-id': 'shop-1',
    });
    expect(extracted).toEqual({
      requestId: 'req-123',
      correlationId: 'corr-456',
      traceparent,
      tracestate: 'vendor=1',
      shopId: 'shop-1',
    });
  });

  it('merges queue trace context with defaults', () => {
    const traceparent = generateTraceParent(true);
    const merged = mergeTraceContext(undefined, { correlationId: 'corr-queue-1', traceparent });
    expect(merged.correlationId).toBe('corr-queue-1');
    expect(merged.traceparent).toBe(traceparent);
    expect(merged.requestId).toBeDefined();
  });

  it('serializes queue trace for BullMQ payloads', () => {
    const trace = serializeQueueTrace({
      correlationId: 'corr-1',
      traceparent: generateTraceParent(true),
    });
    expect(trace.correlationId).toBe('corr-1');
    expect(trace.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i);
  });

  it('injects trace headers for downstream calls', () => {
    const trace = mergeTraceContext(undefined, { correlationId: 'corr-1' });
    const headers = injectTraceHeaders(trace);
    expect(headers['x-correlation-id']).toBe('corr-1');
    expect(headers.traceparent).toMatch(/^00-/);
  });

  it('runs processors inside async observability context', () => {
    const traceparent = generateTraceParent(true);
    runWithObservabilityContext(
      { correlationId: 'corr-worker-1', traceparent, service: 'workers' },
      () => {
        const headers = injectTraceHeaders(serializeQueueTrace({
          correlationId: 'corr-worker-1',
          traceparent,
        }));
        expect(headers['x-correlation-id']).toBe('corr-worker-1');
        expect(headers.traceparent).toBe(traceparent);
      },
    );
  });
});
