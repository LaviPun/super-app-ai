import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiLogService, withApiLogging } from '~/services/observability/api-log.service';

describe('withApiLogging redaction hardening', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts captured headers and bodies before persistence', async () => {
    const startSpy = vi.spyOn(ApiLogService.prototype, 'start');
    const completeSpy = vi.spyOn(ApiLogService.prototype, 'complete');

    const request = new Request('https://example.com/internal', {
      method: 'POST',
      headers: {
        authorization: 'Bearer super-secret-token',
        cookie: 'session=abc',
        'x-shopify-access-token': 'shpat_sensitive',
        'x-api-key': 'top-secret',
        'proxy-authorization': 'proxy-creds',
        'x-amz-security-token': 'aws-token',
        'x-csrf-token': 'csrf-secret',
      },
      body: JSON.stringify({
        password: 'my-password',
        email: 'buyer@example.com',
        nested: { accessToken: 'shpat_nested_secret' },
      }),
    });

    await withApiLogging(
      {
        actor: 'INTERNAL',
        method: 'POST',
        path: '/internal',
        request,
        captureRequestBody: true,
        captureResponseBody: true,
      },
      async () =>
        new Response(
          JSON.stringify({
            token: 'shpat_router_reply_secret',
            email: 'merchant@example.com',
          }),
          { status: 200 },
        ),
    );

    const startMeta = startSpy.mock.calls[0]?.[0]?.meta as Record<string, unknown> | undefined;
    expect(startMeta).toBeDefined();
    const requestHeaders = startMeta?.requestHeaders as Record<string, string> | undefined;
    expect(requestHeaders).toBeDefined();
    expect(requestHeaders?.authorization).toBe('[REDACTED]');
    expect(requestHeaders?.cookie).toBe('[REDACTED]');
    expect(requestHeaders?.['x-shopify-access-token']).toBe('[REDACTED]');
    expect(requestHeaders?.['x-api-key']).toBe('[REDACTED]');
    expect(requestHeaders?.['proxy-authorization']).toBe('[REDACTED]');
    expect(requestHeaders?.['x-amz-security-token']).toBe('[REDACTED]');
    expect(requestHeaders?.['x-csrf-token']).toBe('[REDACTED]');

    const completeMeta = completeSpy.mock.calls[0]?.[1]?.meta as Record<string, unknown> | undefined;
    const requestBody = String(completeMeta?.requestBody ?? '');
    const responseBody = String(completeMeta?.responseBody ?? '');
    expect(requestBody).toContain('[REDACTED]');
    expect(requestBody).toContain('[REDACTED_EMAIL]');
    expect(requestBody).not.toContain('shpat_nested_secret');
    expect(responseBody).toContain('[REDACTED]');
    expect(responseBody).toContain('[REDACTED_EMAIL]');
  });

  it('redacts error metadata and adds truncation marker at 4096 chars', async () => {
    const completeSpy = vi.spyOn(ApiLogService.prototype, 'complete');
    const longSecret = `${'A'.repeat(4200)} shpat_truncate_me`;
    const request = new Request('https://example.com/internal', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: longSecret,
    });

    await expect(
      withApiLogging(
        {
          actor: 'INTERNAL',
          method: 'POST',
          path: '/internal',
          request,
          captureRequestBody: true,
        },
        async () => {
          throw new Error('failure with token shpat_error_secret');
        },
      ),
    ).rejects.toThrow('failure with token shpat_error_secret');

    const completeMeta = completeSpy.mock.calls[0]?.[1]?.meta as Record<string, unknown> | undefined;
    const requestBody = String(completeMeta?.requestBody ?? '');
    const error = completeMeta?.error as Record<string, string> | undefined;
    expect(requestBody).toContain('[TRUNCATED total=');
    expect(requestBody).not.toContain('shpat_truncate_me');
    expect(error?.message).toContain('[REDACTED_TOKEN]');
    expect(error?.message).not.toContain('shpat_error_secret');
  });
});
