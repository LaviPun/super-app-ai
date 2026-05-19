export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type MemoryRateLimiterOptions = {
  max: number;
  windowMs: number;
};

/**
 * In-memory sliding-window limiter for local API tests and staging stubs.
 * Not suitable for multi-instance production without a shared store.
 */
export function createMemoryRateLimiter(options: MemoryRateLimiterOptions) {
  const max = Math.max(0, options.max);
  const windowMs = Math.max(1, options.windowMs);
  const hits = new Map<string, number[]>();

  function prune(now: number, key: string): number[] {
    const windowStart = now - windowMs;
    const existing = hits.get(key) ?? [];
    const kept = existing.filter((ts) => ts > windowStart);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  }

  return {
    check(key: string, now = Date.now()): RateLimitDecision {
      if (max === 0) return { allowed: true };
      const recent = prune(now, key);
      if (recent.length >= max) {
        const oldest = recent[0] ?? now;
        return { allowed: false, retryAfterMs: Math.max(1, oldest + windowMs - now) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { allowed: true };
    },
    reset(): void {
      hits.clear();
    },
  };
}
