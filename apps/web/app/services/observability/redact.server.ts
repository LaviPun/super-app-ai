import { isStrictPiiRedactionEnabled } from '~/env.server';

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
  'x-shopify-access-token',
  'x-csrf-token',
  'proxy-authorization',
  'x-amz-security-token',
  'cookie',
  'set-cookie',
]);

export const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-shopify-access-token',
  'x-amz-security-token',
  'x-csrf-token',
]);

const SENSITIVE_KEYS_LOWER = new Set(
  Array.from(SENSITIVE_KEYS).map((key) => key.toLowerCase()),
);

const SHOPIFY_TOKEN_RE = /\b(shpat_|shpca_|shpua_)[A-Za-z0-9_-]{6,}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,16}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;
const CONTACT_PII_KEY_RE =
  /(email|e_mail|phone|mobile|first_?name|last_?name|full_?name|name|address|street|city|state|province|postal|zip|country)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS_LOWER.has(key.toLowerCase());
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(name.toLowerCase());
}

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
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : redact(v, depth + 1);
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
 * Normalize unknown metadata into a safe log object.
 * Always applies deep redaction before returning.
 */
export function safeMeta(meta: unknown): Record<string, unknown> | undefined {
  if (meta === null || meta === undefined) return undefined;
  const sanitized = redact(meta);
  if (typeof sanitized === 'object' && sanitized !== null && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return { value: sanitized };
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTruthyPiiFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function containsContactPii(piiFlags: unknown): boolean {
  if (!isObjectRecord(piiFlags)) return false;
  return isTruthyPiiFlag(piiFlags.contains_contact_pii);
}

function dropContactPiiKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => dropContactPiiKeys(entry));
  }
  if (!isObjectRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (CONTACT_PII_KEY_RE.test(key)) continue;
    out[key] = dropContactPiiKeys(nested);
  }
  return out;
}

function stringifySafely(value: unknown): string {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (typeof nestedValue === 'bigint') return nestedValue.toString();
    if (typeof nestedValue === 'object' && nestedValue !== null) {
      if (seen.has(nestedValue as object)) return '[CIRCULAR]';
      seen.add(nestedValue as object);
    }
    return nestedValue;
  });
  return serialized ?? 'null';
}

export function persistJsonSafely(
  value: unknown,
  options?: { piiFlags?: unknown; strictPiiRedaction?: boolean },
): string {
  const strictMode = options?.strictPiiRedaction ?? isStrictPiiRedactionEnabled();
  const base = redact(value);
  const hardened =
    strictMode && containsContactPii(options?.piiFlags)
      ? dropContactPiiKeys(base)
      : base;
  return stringifySafely(hardened);
}
