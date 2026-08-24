import { describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter, RedisRateLimiter, getClientIp } from '~/services/security/rate-limit.server';

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

describe('getClientIp', () => {
  it('prefers cf-connecting-ip when present', () => {
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '203.0.113.1',
        'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      },
    });
    expect(getClientIp(request)).toBe('203.0.113.1');
  });

  it('uses rightmost entry of x-forwarded-for (appended by nearest proxy)', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      },
    });
    expect(getClientIp(request)).toBe('10.0.0.1');
  });

  it('handles x-forwarded-for with spaces around entries', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '1.2.3.4 , 10.0.0.1 , 192.168.1.1',
      },
    });
    expect(getClientIp(request)).toBe('192.168.1.1');
  });

  it('returns unknown when neither header is present', () => {
    const request = new Request('https://example.com', {
      headers: {},
    });
    expect(getClientIp(request)).toBe('unknown');
  });

  it('returns unknown when x-forwarded-for is empty', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '',
      },
    });
    expect(getClientIp(request)).toBe('unknown');
  });

  it('returns unknown when x-forwarded-for contains only whitespace', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '  ,  ,  ',
      },
    });
    expect(getClientIp(request)).toBe('unknown');
  });

  it('trims whitespace from cf-connecting-ip', () => {
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '  203.0.113.1  ',
      },
    });
    expect(getClientIp(request)).toBe('203.0.113.1');
  });

  it('handles single entry in x-forwarded-for correctly', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '203.0.113.1',
      },
    });
    expect(getClientIp(request)).toBe('203.0.113.1');
  });
});
