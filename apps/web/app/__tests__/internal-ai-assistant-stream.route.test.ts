import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

const requireInternalAdminMock = vi.fn();
const enforceInternalAiRateLimitMock = vi.fn();

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceInternalAiRateLimit: enforceInternalAiRateLimitMock,
}));

describe('internal.ai-assistant.chat.stream route action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue({ adminId: 'admin-1' });
    enforceInternalAiRateLimitMock.mockResolvedValue(undefined);
  });

  it('returns 429 when stream rate limit is exceeded', async () => {
    enforceInternalAiRateLimitMock.mockRejectedValueOnce(
      new AppError({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: { retryAfterSec: '9' },
      }),
    );
    const mod = await import('~/routes/internal.ai-assistant.chat.stream');
    const response = await mod.action({
      request: new Request('http://test/internal/ai-assistant/chat/stream', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
  });
});
