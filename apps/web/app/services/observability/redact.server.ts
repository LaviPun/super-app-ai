/**
 * Log redaction utilities.
 *
 * Rules:
 * - Known secret field names → replaced with "[REDACTED]"
 * - Shopify access tokens (shpat_*, shpca_*, shpua_*) → "[REDACTED_TOKEN]"
 * - API keys that look like secrets (long hex/base64 strings in sensitive fields) → "[REDACTED]"
 * - Email addresses → "[REDACTED_EMAIL]"
 * - Credit-card-like 16-digit numbers → "[REDACTED_CC]"
 * - OAuth bearer tokens in Authorization headers → "Bearer [REDACTED]"
 */

const SENSITIVE_KEYS = new Set([
  'accessToken',
  'access_token',
  'apiKey',
  'api_key',
  'apiKeyEnc',
  'secretsEnc',
  'secret',
  'client_secret',
  'clientSecret',
  'password',
  'passwd',
  'token',
  'Authorization',
  'authorization',
  'x-api-key',
  'ENCRYPTION_KEY',
  'encryptionKey',
  'privateKey',
  'private_key',
  'refresh_token',
  'refreshToken',
]);

const SHOPIFY_TOKEN_RE = /\b(shpat_|shpca_|shpua_)[A-Za-z0-9_-]{6,}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,16}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;

/**
 * Deep-clone and redact an arbitrary object before writing to logs.
 * Handles plain objects, arrays, strings, and primitives.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[DEEP]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Redact sensitive patterns from a raw string (e.g. log lines).
 */
export function redactString(s: string): string {
  return s
    .replace(SHOPIFY_TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(CREDIT_CARD_RE, (match) => {
      // Only redact if it's plausibly a credit card (mostly digits, correct length)
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 16 ? '[REDACTED_CC]' : match;
    });
}

/**
 * Build a safe meta object from any unknown error for logging.
 * Ensures no stack traces expose secrets.
 */
export function safeErrorMeta(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: redactString(err.message),
      stack: err.stack ? redactString(err.stack) : undefined,
    };
  }
  return { message: redactString(String(err)) };
}
