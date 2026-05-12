import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeMock = vi.fn();

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      admin: vi.fn().mockRejectedValue(new Error('no session')),
    },
  },
}));

vi.mock('~/db.server', () => ({
  getPrisma: vi.fn(),
}));

vi.mock('~/services/observability/error-log.service', () => ({
  ErrorLogService: class {
    write = writeMock;
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = vi.fn().mockResolvedValue(undefined);
  },
}));

const takeMock = vi.fn();
vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimit: vi.fn((key: string) => {
    takeMock(key);
  }),
}));

import { action as reportErrorAction } from '../routes/api.report-error';

describe('api.report-error', () => {
  beforeEach(() => {
    writeMock.mockReset();
    takeMock.mockReset();
  });

  it('rejects oversized JSON bodies', async () => {
    const big = 'x'.repeat(60_000);
    const res = await reportErrorAction({
      request: new Request('http://test/api/report-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: big }),
      }),
    } as never);
    expect(res.status).toBe(413);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('applies rate limit key and persists redacted client errors', async () => {
    const res = await reportErrorAction({
      request: new Request('http://test/api/report-error', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        },
        body: JSON.stringify({
          message: 'boom',
          meta: { apiKey: 'secret-key', note: 'ok' },
        }),
      }),
    } as never);

    expect(res.status).toBe(200);
    expect(takeMock).toHaveBeenCalledWith('report-error:ip:203.0.113.9');
    expect(writeMock).toHaveBeenCalled();
    const firstCall = writeMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const metaArg = firstCall![3];
    expect(metaArg).toEqual({ apiKey: '[REDACTED]', note: 'ok' });
  });
});
