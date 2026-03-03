import { InMemoryRateLimiter } from '@superapp/rate-limit';
import { AppError } from '~/services/errors/app-error.server';

// Defaults: 30 requests per 60-second window per key.
// Extend with per-plan limits by passing different limiter configs once BillingService is consulted.
const limiter = new InMemoryRateLimiter(30, 60);

export function enforceRateLimit(key: string) {
  const decision = limiter.take(key);
  if (!decision.ok) {
    throw new AppError({
      code: 'RATE_LIMITED',
      message: `Too many requests. Retry in ${decision.retryAfterSec ?? 60} seconds.`,
      details: { retryAfterSec: String(decision.retryAfterSec ?? 60) },
    });
  }
}
