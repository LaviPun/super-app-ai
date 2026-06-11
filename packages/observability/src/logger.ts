import { safeErrorMeta, safeMeta } from './redact.js';
import type { TraceContext } from '@superapp/platform-contracts';
import { getActiveTraceContext } from './trace.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogRecord = {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  trace?: TraceContext;
  context?: Record<string, unknown>;
  error?: { message: string; stack?: string };
};

export type LogSink = (record: LogRecord) => void;

export type StructuredLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, err?: unknown): void;
};

export function createLogger(service: string, sink: LogSink = consoleSink): StructuredLogger {
  const write = (level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown) => {
    const record: LogRecord = {
      level,
      message,
      service,
      timestamp: new Date().toISOString(),
      trace: getActiveTraceContext(),
      context: safeMeta(context),
      error: err ? safeErrorMeta(err) : undefined,
    };
    sink(record);
  };

  return {
    debug(message, context) {
      write('debug', message, context);
    },
    info(message, context) {
      write('info', message, context);
    },
    warn(message, context) {
      write('warn', message, context);
    },
    error(message, context, err) {
      write('error', message, context, err);
    },
  };
}

function consoleSink(record: LogRecord): void {
  const payload = {
    level: record.level,
    service: record.service,
    message: record.message,
    timestamp: record.timestamp,
    trace: record.trace,
    context: record.context,
    error: record.error,
  };
  const line = JSON.stringify(payload);
  if (record.level === 'error') console.error(line);
  else if (record.level === 'warn') console.warn(line);
  else console.info(line);
}
