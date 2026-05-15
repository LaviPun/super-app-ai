import { describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter, RedisRateLimiter } from '~/services/security/rate-limit.server';

describe('InMemoryRateLimiter', () => {
  it('allows requests until the configured limit and then blocks', async () => {
    const limiter = new InMemoryRateLimiter(2, 60);
    const now = 1_000;

    await expect(limiter.take('shop:a', now)).resolves.toEqual({ ok: true, remaining: 1 });
    await expect(limiter.take('shop:a', now + 1)).resolves.toEqual({ ok: true, remaining: 0 });
    await expect(limiter.take('shop:a', now + 2)).resolves.toMatchObject({
      ok: false,
      retryAfterSec: 60,
    });
  });

  it('resets buckets when the window expires', async () => {
    const limiter = new InMemoryRateLimiter(1, 10);
    const now = 5_000;

    await expect(limiter.take('shop:a', now)).resolves.toEqual({ ok: true, remaining: 0 });
    await expect(limiter.take('shop:a', now + 10_001)).resolves.toEqual({ ok: true, remaining: 0 });
  });
});

describe('RedisRateLimiter', () => {
  it('maps redis counter/ttl to allow decisions', async () => {
    const evalMock = vi.fn().mockResolvedValue([2, 42]);
    const limiter = new RedisRateLimiter({ eval: evalMock }, 3, 60, 'test');

    await expect(limiter.take('shop:a')).resolves.toEqual({ ok: true, remaining: 1 });
    expect(evalMock).toHaveBeenCalledWith(expect.any(String), 1, 'test:shop:a', '60');
  });

  it('returns blocked decision when counter exceeds max', async () => {
    const evalMock = vi.fn().mockResolvedValue([4, 9]);
    const limiter = new RedisRateLimiter({ eval: evalMock }, 3, 60);

    await expect(limiter.take('shop:a')).resolves.toEqual({ ok: false, retryAfterSec: 9 });
  });
});
