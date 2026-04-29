/**
 * Sentry integration.
 *
 * Activates when `SENTRY_DSN` is set in the environment. The SDK is loaded
 * lazily so builds without a DSN do not pay the runtime cost. All events run
 * through the redaction helpers in `redact.server.ts` before being sent so we
 * never leak secrets/PII to Sentry.
 */

import * as Sentry from '@sentry/node';
import { redact, redactString } from '~/services/observability/redact.server';

export type SentryContext = {
  shopDomain?: string;
  requestId?: string;
  correlationId?: string;
  jobId?: string;
  moduleId?: string;
  versionId?: string;
  providerId?: string;
  [key: string]: string | undefined;
};

let _initialised = false;
let _enabled = false;

function init(): boolean {
  if (_initialised) return _enabled;
  _initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: process.env.SENTRY_RELEASE ?? undefined,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      sendDefaultPii: false,
      beforeSend(event) {
        try {
          if (event.message) event.message = redactString(event.message);
          if (event.exception?.values) {
            event.exception.values = event.exception.values.map((v) => ({
              ...v,
              value: v.value ? redactString(v.value) : v.value,
              stacktrace: v.stacktrace
                ? {
                    ...v.stacktrace,
                    frames: v.stacktrace.frames?.map((f) => ({
                      ...f,
                      vars: f.vars ? (redact(f.vars) as Record<string, unknown>) : f.vars,
                    })),
                  }
                : v.stacktrace,
            }));
          }
          if (event.request) {
            const req = event.request;
            if (req.headers) req.headers = redact(req.headers) as Record<string, string>;
            if (req.cookies) req.cookies = redact(req.cookies) as Record<string, string>;
            if (req.data) req.data = redact(req.data);
            if (req.query_string && typeof req.query_string === 'string') {
              req.query_string = redactString(req.query_string);
            }
          }
          if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>;
          if (event.tags) {
            const safeTags: Record<string, string> = {};
            for (const [k, v] of Object.entries(event.tags)) {
              if (typeof v === 'string') safeTags[k] = redactString(v);
              else if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') safeTags[k] = String(v);
              else if (v != null) safeTags[k] = '[redacted]';
            }
            event.tags = safeTags;
          }
        } catch {
          // never block telemetry on redaction failure
        }
        return event;
      },
    });
    _enabled = true;
    return true;
  } catch (err) {
    console.error('[sentry:init] failed', err);
    return false;
  }
}

function applyContext(scope: Sentry.Scope, ctx?: SentryContext) {
  if (!ctx) return;
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string') scope.setTag(k, v);
  }
  if (ctx.shopDomain) scope.setUser({ username: ctx.shopDomain });
}

export function captureException(err: unknown, ctx?: SentryContext): void {
  if (!init()) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[sentry:captureException]', err, ctx);
    }
    return;
  }
  Sentry.withScope((scope) => {
    applyContext(scope, ctx);
    Sentry.captureException(err);
  });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', ctx?: SentryContext): void {
  if (!init()) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[sentry:captureMessage:${level}]`, message, ctx);
    }
    return;
  }
  Sentry.withScope((scope) => {
    applyContext(scope, ctx);
    Sentry.captureMessage(message, level);
  });
}

/**
 * Flush queued Sentry events before exiting (e.g. in serverless lambdas).
 * Safe to call when Sentry is disabled.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!_enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // ignore flush failures
  }
}
