/**
 * Connector SDK — TypeScript interfaces for building workflow connectors.
 *
 * Every connector implements: manifest(), validate(), invoke().
 * The engine uses these to discover capabilities, validate inputs at build time,
 * and execute operations at runtime.
 */

// ─── Auth ─────────────────────────────────────────────────────────────
export type AuthType = 'oauth' | 'api_key' | 'shopify' | 'none';

export type AuthContext =
  | { type: 'oauth'; accessToken: string; refreshToken?: string; expiresAt?: string }
  | { type: 'api_key'; apiKey: string; headerName?: string }
  | { type: 'shopify'; shop: string; accessToken: string }
  | { type: 'none' };

export interface AuthResolver {
  resolve(tenantId: string, provider: string): Promise<AuthContext>;
  refresh?(tenantId: string, provider: string): Promise<AuthContext>;
}

// ─── Connector Manifest ───────────────────────────────────────────────
export interface OperationSchema {
  name: string;
  displayName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  idempotency: {
    supported: boolean;
    keyHint?: string;
  };
  retryHints?: {
    retryOn: Array<'429' | '5xx' | 'network' | 'timeout'>;
    rateLimitStrategy?: 'respect-retry-after' | 'fixed-backoff';
  };
}

export interface ConnectorManifest {
  provider: string;
  displayName: string;
  version: string;
  description?: string;
  icon?: string;
  auth: {
    type: AuthType;
    scopes?: string[];
    tokenStore?: 'tenant' | 'global';
  };
  operations: OperationSchema[];
}

// ─── Invoke Request / Response ────────────────────────────────────────
export interface InvokeRequest {
  runId: string;
  stepId: string;
  tenantId: string;
  operation: string;
  inputs: Record<string, unknown>;
  timeoutMs: number;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface InvokeResponse {
  ok: true;
  statusCode?: number;
  output: Record<string, unknown>;
  meta?: {
    rateLimited?: boolean;
    retryAfterMs?: number;
    cost?: number;
    durationMs?: number;
  };
}

export type ConnectorErrorCode =
  | 'VALIDATION'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'CONFLICT'
  | 'UNKNOWN';

export interface InvokeError {
  ok: false;
  code: ConnectorErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
  retryAfterMs?: number;
}

export type InvokeResult = InvokeResponse | InvokeError;

// ─── Connector Interface ──────────────────────────────────────────────
export interface Connector {
  manifest(): ConnectorManifest;
  validate(operation: string, inputs: Record<string, unknown>): ValidationResult;
  invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult>;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

export interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

// ─── Error Helpers ────────────────────────────────────────────────────
export function connectorError(
  code: ConnectorErrorCode,
  message: string,
  opts?: { retryable?: boolean; retryAfterMs?: number; details?: unknown },
): InvokeError {
  return {
    ok: false,
    code,
    message,
    retryable: opts?.retryable ?? false,
    retryAfterMs: opts?.retryAfterMs,
    details: opts?.details,
  };
}

export function connectorSuccess(
  output: Record<string, unknown>,
  opts?: { statusCode?: number; meta?: InvokeResponse['meta'] },
): InvokeResponse {
  return {
    ok: true,
    output,
    statusCode: opts?.statusCode,
    meta: opts?.meta,
  };
}

export function isRetryableError(error: InvokeResult): boolean {
  if (error.ok) return false;
  return error.retryable;
}

export function isRateLimited(result: InvokeResult): result is InvokeError {
  return !result.ok && result.code === 'RATE_LIMIT';
}
