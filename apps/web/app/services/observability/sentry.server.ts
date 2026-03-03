/**
 * Sentry integration — completely optional.
 *
 * Set SENTRY_DSN in the environment to enable. Without it, all functions are no-ops.
 * This avoids pulling the Sentry SDK into builds that don't need it.
 *
 * Usage:
 *   import { captureException, captureMessage } from '~/services/observability/sentry.server';
 *   captureException(err, { shopDomain: 'shop.myshopify.com', requestId: 'req_xxx' });
 *
 * To activate Sentry:
 *   1. pnpm add @sentry/node --filter web
 *   2. Set SENTRY_DSN in .env and production secrets
 *   3. Uncomment the Sentry.init block below
 */

export type SentryContext = {
  shopDomain?: string;
  requestId?: string;
  jobId?: string;
  moduleId?: string;
  versionId?: string;
  providerId?: string;
  [key: string]: string | undefined;
};

let _initialised = false;

function init() {
  if (_initialised) return;
  _initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // no-op when SENTRY_DSN not set

  /**
   * Uncomment after running: pnpm add @sentry/node --filter web
   *
   * import * as Sentry from '@sentry/node';
   * Sentry.init({
   *   dsn,
   *   environment: process.env.NODE_ENV ?? 'development',
   *   tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
   *   // Scrub PII before sending
   *   beforeSend(event) {
   *     // strip credit card patterns from any string field
   *     return event;
   *   },
   * });
   */
}

export function captureException(err: unknown, ctx?: SentryContext): void {
  init();
  if (!process.env.SENTRY_DSN) return;

  /**
   * Uncomment with Sentry SDK:
   *
   * import * as Sentry from '@sentry/node';
   * Sentry.withScope(scope => {
   *   if (ctx) {
   *     scope.setTags(ctx);
   *     if (ctx.shopDomain) scope.setUser({ username: ctx.shopDomain });
   *   }
   *   Sentry.captureException(err);
   * });
   */

  // Fallback: log to stderr when Sentry SDK is not yet installed
  if (process.env.NODE_ENV !== 'test') {
    console.error('[sentry:captureException]', err, ctx);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', ctx?: SentryContext): void {
  init();
  if (!process.env.SENTRY_DSN) return;

  /**
   * Uncomment with Sentry SDK:
   *
   * import * as Sentry from '@sentry/node';
   * Sentry.withScope(scope => {
   *   if (ctx) scope.setTags(ctx);
   *   Sentry.captureMessage(message, level);
   * });
   */

  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[sentry:captureMessage:${level}]`, message, ctx);
  }
}
