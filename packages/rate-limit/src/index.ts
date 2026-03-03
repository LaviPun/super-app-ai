export type RateLimitKey = string;

export type RateLimitDecision =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

/**
 * In production, back this with Redis (e.g. Upstash) to be multi-instance safe.
 * This in-memory version is for local dev and tests.
 */
export class InMemoryRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowSec: number) {}

  take(key: RateLimitKey, now = Date.now()): RateLimitDecision {
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
