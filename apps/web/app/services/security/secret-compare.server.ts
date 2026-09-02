import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a client-provided secret against the expected
 * value. Hashing both sides first makes `timingSafeEqual` usable on inputs of
 * different lengths without leaking length information.
 *
 * Extracted from api.cron.tsx (DevOps hardening 2026-09) so /healthz/deep can
 * reuse the identical check instead of growing a second, subtly-different copy.
 */
export function constantTimeSecretMatch(provided: string, expected: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}
