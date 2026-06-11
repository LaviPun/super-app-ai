const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'cookie',
  'set-cookie',
  'x-shopify-access-token',
  'x-csrf-token',
]);

const SENSITIVE_KEYS_LOWER = new Set([
  'accesstoken',
  'access_token',
  'apikey',
  'api_key',
  'secret',
  'client_secret',
  'clientsecret',
  'password',
  'token',
  'refresh_token',
  'refreshtoken',
  'private_key',
  'privatekey',
]);

const SHOPIFY_TOKEN_RE = /\b(shpat_|shpca_|shpua_)[A-Za-z0-9_-]{6,}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.toLowerCase());
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveHeader(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    redacted[key] = redactString(value);
  }
  return redacted;
}

export function redactString(value: string): string {
  return value
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(SHOPIFY_TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]');
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[DEEP]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS_LOWER.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactValue(entry, depth + 1);
  }
  return out;
}

export function truncateBodyPreview(body: string, maxBytes = 50_000): string {
  return body.slice(0, maxBytes);
}
