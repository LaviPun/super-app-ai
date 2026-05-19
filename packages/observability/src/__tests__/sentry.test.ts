import { describe, expect, it, vi } from 'vitest';
import {
  captureException,
  captureMessage,
  sanitizeSentryPayload,
  setSentryHook,
  shapeExceptionCapture,
  shapeMessageCapture,
} from '../sentry.js';

describe('sentry capture shape', () => {
  it('shapes exception events with redacted tags and stack', () => {
    const shaped = shapeExceptionCapture(new Error('failed for merchant@example.com'), {
      correlationId: 'corr-1',
      service: 'api',
      jobId: 'job-1',
    });
    expect(shaped.kind).toBe('exception');
    expect(shaped.level).toBe('error');
    expect(shaped.exception?.value).toContain('[REDACTED_EMAIL]');
    expect(shaped.tags.correlationId).toBe('corr-1');
    expect(shaped.extra?.service).toBe('api');
  });

  it('shapes message events without leaking secrets in extra', () => {
    const shaped = shapeMessageCapture('publish failed', 'warning', {
      correlationId: 'corr-2',
      shopDomain: 'secret-shop.myshopify.com',
    });
    expect(shaped.kind).toBe('message');
    expect(shaped.level).toBe('warning');
    expect(shaped.tags.shopDomain).toBe('secret-shop.myshopify.com');
  });

  it('forwards capture calls to the active hook', () => {
    const hook = {
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    };
    setSentryHook(hook);
    captureException(new Error('boom'), { correlationId: 'corr-3' });
    captureMessage('retry exhausted', 'error', { correlationId: 'corr-3' });
    expect(hook.captureException).toHaveBeenCalledOnce();
    expect(hook.captureMessage).toHaveBeenCalledOnce();
    setSentryHook(null);
  });

  it('sanitizes arbitrary sentry payloads', () => {
    expect(
      sanitizeSentryPayload({
        headers: { authorization: 'Bearer abc' },
        email: 'merchant@example.com',
      }),
    ).toEqual({
      headers: { authorization: '[REDACTED]' },
      email: '[REDACTED_EMAIL]',
    });
  });
});
