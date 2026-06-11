import { redact, redactString, safeMeta } from './redact.js';
import type { TraceContext } from '@superapp/platform-contracts';

export type SentryCaptureContext = TraceContext & {
  service?: string;
  jobId?: string;
  moduleId?: string;
  queueName?: string;
  [key: string]: string | undefined;
};

export type SentryEventShape = {
  kind: 'exception' | 'message';
  message: string;
  level?: 'info' | 'warning' | 'error';
  tags: Record<string, string>;
  extra?: Record<string, unknown>;
  exception?: {
    type?: string;
    value: string;
    stack?: string;
  };
};

export type SentryHook = {
  captureException(err: unknown, ctx?: SentryCaptureContext): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error', ctx?: SentryCaptureContext): void;
};

const noopHook: SentryHook = {
  captureException() {},
  captureMessage() {},
};

let activeHook: SentryHook = noopHook;

export function setSentryHook(hook: SentryHook | null): void {
  activeHook = hook ?? noopHook;
}

export function getSentryHook(): SentryHook {
  return activeHook;
}

export function buildSentryTags(ctx?: SentryCaptureContext): Record<string, string> {
  if (!ctx) return {};
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string' && value.length > 0) {
      tags[key] = redactString(value);
    }
  }
  return tags;
}

export function shapeExceptionCapture(err: unknown, ctx?: SentryCaptureContext): SentryEventShape {
  const tags = buildSentryTags(ctx);
  if (err instanceof Error) {
    return {
      kind: 'exception',
      message: redactString(err.message),
      level: 'error',
      tags,
      extra: safeMeta(ctx),
      exception: {
        type: err.name,
        value: redactString(err.message),
        stack: err.stack ? redactString(err.stack) : undefined,
      },
    };
  }
  return {
    kind: 'exception',
    message: redactString(String(err)),
    level: 'error',
    tags,
    extra: safeMeta(ctx),
    exception: {
      value: redactString(String(err)),
    },
  };
}

export function shapeMessageCapture(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  ctx?: SentryCaptureContext,
): SentryEventShape {
  return {
    kind: 'message',
    message: redactString(message),
    level,
    tags: buildSentryTags(ctx),
    extra: safeMeta(ctx),
  };
}

export function sanitizeSentryPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return redact(payload) as Record<string, unknown>;
}

export function captureException(err: unknown, ctx?: SentryCaptureContext): SentryEventShape {
  const shaped = shapeExceptionCapture(err, ctx);
  activeHook.captureException(err, ctx);
  return shaped;
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  ctx?: SentryCaptureContext,
): SentryEventShape {
  const shaped = shapeMessageCapture(message, level, ctx);
  activeHook.captureMessage(message, level, ctx);
  return shaped;
}
