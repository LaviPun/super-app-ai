import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

const hoisted = vi.hoisted(() => ({
  enforceRateLimitWithPolicy: vi.fn(async () => {}),
  getClientIp: vi.fn(() => '203.0.113.9'),
  log: vi.fn(async () => {}),
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimitWithPolicy: hoisted.enforceRateLimitWithPolicy,
  getClientIp: hoisted.getClientIp,
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

function loginRequest(password: string) {
  const form = new FormData();
  form.set('password', password);
  form.set('to', '/internal');
  return new Request('https://app.test/internal/login', { method: 'POST', body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_ADMIN_PASSWORD = 'correct-horse-battery';
});

describe('internal.login action rate limiting + audit', () => {
  it('applies a per-IP rate limit BEFORE comparing the password', async () => {
    hoisted.enforceRateLimitWithPolicy.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Too many requests. Retry in 60 seconds.' }),
    );
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('correct-horse-battery') });
    expect(res.status).toBe(429);
    expect(hoisted.enforceRateLimitWithPolicy).toHaveBeenCalledWith(
      'internal-login:203.0.113.9',
      expect.objectContaining({ limit: expect.any(Number), windowSec: expect.any(Number) }),
    );
    // Rate-limited requests must not even evaluate the password (no audit row).
    expect(hoisted.log).not.toHaveBeenCalled();
  });

  it('audits a failed password attempt with the client IP and still returns 401', async () => {
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('wrong-password') });
    expect(res.status).toBe(401);
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'INTERNAL_ADMIN',
        action: 'LOGIN',
        resource: 'internal:password',
        ip: '203.0.113.9',
        details: expect.objectContaining({ outcome: 'failed' }),
      }),
    );
  });

  it('audits a successful login and redirects', async () => {
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('correct-horse-battery') });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/internal');
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'internal:password', details: expect.objectContaining({ outcome: 'success' }) }),
    );
  });

  it('a failed audit write never blocks the login flow', async () => {
    hoisted.log.mockRejectedValueOnce(new Error('db down'));
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('wrong-password') });
    expect(res.status).toBe(401);
  });
});
