import Redis from 'ioredis';
import { AppError } from '~/services/errors/app-error.server';

export type RateLimitDecision =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  take(key: string, now?: number): Promise<RateLimitDecision>;
}

type RedisEvalResult = [number, number] | [string, string];

interface RedisEvalClient {
  eval(script: string, numKeys: number, key: string, windowSec: string): Promise<RedisEvalResult>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowSec: number) {}

  async take(key: string, now = Date.now()): Promise<RateLimitDecision> {
    const bucket = this.hits.get(key);
    const resetAt = now + this.windowSec * 1000;

    if (!bucket || bucket.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt });
      return { ok: true, remaining: this.max - 1 };
    }

    if (bucket.count >= this.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return { ok: false, retryAfterSec };
    }

    bucket.count += 1;
    return { ok: true, remaining: this.max - bucket.count };
  }
}

const REDIS_TAKE_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisEvalClient,
    private readonly max: number,
    private readonly windowSec: number,
    private readonly keyPrefix = 'rl',
  ) {}

  async take(key: string): Promise<RateLimitDecision> {
    const bucketKey = `${this.keyPrefix}:${key}`;
    const [rawCount, rawTtl] = await this.client.eval(REDIS_TAKE_SCRIPT, 1, bucketKey, String(this.windowSec));
    const count = Number(rawCount);
    const ttl = Number(rawTtl);
    const retryAfterSec = ttl > 0 ? ttl : this.windowSec;

    if (count > this.max) {
      return { ok: false, retryAfterSec };
    }

    return { ok: true, remaining: Math.max(0, this.max - count) };
  }
}

class FallbackRateLimiter implements RateLimiter {
  private fallbackWarned = false;

  constructor(
    private readonly primary: RateLimiter,
    private readonly fallback: RateLimiter,
  ) {}

  async take(key: string, now?: number): Promise<RateLimitDecision> {
    try {
      return await this.primary.take(key, now);
    } catch (error) {
      if (!this.fallbackWarned) {
        this.fallbackWarned = true;
        console.warn('[rate-limit] Redis unavailable; falling back to in-memory rate limiting.', error);
      }
      return this.fallback.take(key, now);
    }
  }
}

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_SEC = 60;

function buildRateLimiter(): RateLimiter {
  const fallback = new InMemoryRateLimiter(DEFAULT_LIMIT, DEFAULT_WINDOW_SEC);
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return fallback;
  }

  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  const redisClient: RedisEvalClient = {
    eval: (script, numKeys, key, windowSec) =>
      redis.eval(script, numKeys, key, windowSec) as Promise<RedisEvalResult>,
  };
  const redisLimiter = new RedisRateLimiter(redisClient, DEFAULT_LIMIT, DEFAULT_WINDOW_SEC);
  return new FallbackRateLimiter(redisLimiter, fallback);
}

const limiter = buildRateLimiter();

export async function enforceRateLimit(key: string) {
  const decision = await limiter.take(key);
  if (!decision.ok) {
    throw new AppError({
      code: 'RATE_LIMITED',
      message: `Too many requests. Retry in ${decision.retryAfterSec ?? 60} seconds.`,
      details: { retryAfterSec: String(decision.retryAfterSec ?? 60) },
    });
  }
}
