const SENSITIVE_KEYS_LOWER = new Set([
  'accesstoken',
  'access_token',
  'apikey',
  'api_key',
  'apikeyenc',
  'secretsenc',
  'secret',
  'client_secret',
  'clientsecret',
  'password',
  'passwd',
  'token',
  'authorization',
  'x-api-key',
  'encryption_key',
  'encryptionkey',
  'privatekey',
  'private_key',
  'refresh_token',
  'refreshtoken',
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

const SHOPIFY_TOKEN_RE = /\b(shpat_|shpca_|shpua_)[A-Za-z0-9_-]{6,}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,16}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS_LOWER.has(key.toLowerCase());
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(name.toLowerCase());
}

export function redactString(value: string): string {
  return value
    .replace(SHOPIFY_TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(CREDIT_CARD_RE, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 16 ? '[REDACTED_CC]' : match;
    });
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[DEEP]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? '[REDACTED]' : redact(nested, depth + 1);
    }
    return out;
  }
  return value;
}

export function safeMeta(meta: unknown): Record<string, unknown> | undefined {
  if (meta === null || meta === undefined) return undefined;
  const sanitized = redact(meta);
  if (typeof sanitized === 'object' && sanitized !== null && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return { value: sanitized };
}

export function safeErrorMeta(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: redactString(err.message),
      stack: err.stack ? redactString(err.stack) : undefined,
    };
  }
  return { message: redactString(String(err)) };
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveHeader(key) ? '[REDACTED]' : redactString(value);
  }
  return out;
}
