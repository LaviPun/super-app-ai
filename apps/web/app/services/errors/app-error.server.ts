import crypto from 'node:crypto';
import { json } from '@remix-run/node';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'COMPILE_ERROR'
  | 'PUBLISH_ERROR'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export interface AppErrorPayload {
  error: ErrorCode;
  message: string;
  requestId: string;
  /** Field-level validation details (for VALIDATION_ERROR only). */
  details?: Record<string, string>;
}

/**
 * Typed application error that serializes to a consistent JSON shape.
 * Every error carries a requestId so support can correlate logs.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details?: Record<string, string>;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    details?: Record<string, string>;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = 'AppError';
    this.code = opts.code;
    this.status = opts.status ?? statusForCode(opts.code);
    this.requestId = opts.requestId ?? generateRequestId();
    this.details = opts.details;
  }

  toPayload(): AppErrorPayload {
    return {
      error: this.code,
      message: this.message,
      requestId: this.requestId,
      ...(this.details ? { details: this.details } : {}),
    };
  }

  toResponse(): Response {
    return json(this.toPayload(), { status: this.status });
  }
}

// --- helpers ---

function statusForCode(code: ErrorCode): number {
  const map: Record<ErrorCode, number> = {
    VALIDATION_ERROR: 422,
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    RATE_LIMITED: 429,
    PROVIDER_ERROR: 502,
    COMPILE_ERROR: 422,
    PUBLISH_ERROR: 500,
    AI_PROVIDER_NOT_CONFIGURED: 503,
    INTERNAL_ERROR: 500,
  };
  return map[code] ?? 500;
}

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Wrap an unknown thrown value into an AppError response.
 * Preserves AppError identity; converts generic errors to INTERNAL_ERROR.
 * Attach a requestId for log correlation.
 */
export function toErrorResponse(err: unknown, requestId?: string): Response {
  if (err instanceof AppError) {
    return err.toResponse();
  }

  const id = requestId ?? generateRequestId();
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err instanceof Error
        ? err.message
        : String(err);

  return json<AppErrorPayload>(
    { error: 'INTERNAL_ERROR', message, requestId: id },
    { status: 500 }
  );
}
