/**
 * Structured JSON logger for stdout.
 *
 * In production (NODE_ENV=production) all log calls emit a single JSON line per
 * event — compatible with Datadog, GCP Cloud Logging, AWS CloudWatch, Axiom, etc.
 *
 * In development, logs are pretty-printed for readability.
 * In test, logs are suppressed.
 *
 * Schema per log line:
 * {
 *   ts:          ISO8601 timestamp
 *   level:       "debug" | "info" | "warn" | "error"
 *   msg:         string
 *   actor?:      "merchant" | "internal" | "webhook" | "app_proxy" | "system"
 *   shopDomain?: string
 *   requestId?:  string
 *   jobId?:      string
 *   moduleId?:   string
 *   providerId?: string
 *   durationMs?: number
 *   [key]:       any additional context
 * }
 */

import { safeMeta } from '~/services/observability/redact.server';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  actor?: 'merchant' | 'internal' | 'webhook' | 'app_proxy' | 'system';
  shopDomain?: string;
  requestId?: string;
  jobId?: string;
  moduleId?: string;
  versionId?: string;
  providerId?: string;
  model?: string;
  durationMs?: number;
  status?: number;
  path?: string;
  [key: string]: unknown;
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';
const MIN_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  if (IS_TEST) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL];
}

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  if (!shouldLog(level)) return;
  const safeCtx = safeMeta(ctx) as LogContext | undefined;

  if (IS_PRODUCTION) {
    // Single-line JSON for log aggregators
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...safeCtx,
    });
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  } else {
    // Human-friendly for local development
    const prefix = `[${level.toUpperCase()}]`;
    const parts = [prefix, msg];
    if (safeCtx && Object.keys(safeCtx).length > 0) parts.push(JSON.stringify(safeCtx));
    const out = parts.join(' ');
    if (level === 'error') console.error(out);
    else if (level === 'warn') console.warn(out);
    else console.info(out);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
} as const;
