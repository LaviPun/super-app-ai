import type { PlatformWorkerEvent } from '@superapp/platform-contracts';

const PII_KEYS = new Set(['email', 'phone', 'token', 'secret', 'password', 'authorization']);

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[redacted]';
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export type TelemetrySink = (event: PlatformWorkerEvent) => void;

export function createConsoleTelemetrySink(service = '@superapp/workers'): TelemetrySink {
  return (event) => {
    const payload = {
      level: event.type === 'JOB_FAILED' ? 'error' : 'info',
      service,
      eventType: event.type,
      jobId: event.jobId,
      queueName: event.queueName,
      correlationId: event.trace.correlationId,
      shopId: event.trace.shopId,
      progress: event.progress,
      message: event.message,
      timestamp: event.timestamp,
      metadata: sanitizeMetadata(event.metadata),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };
}

let defaultSink: TelemetrySink = createConsoleTelemetrySink();

export function setWorkerTelemetrySink(sink: TelemetrySink): void {
  defaultSink = sink;
}

export function emitWorkerTelemetry(event: PlatformWorkerEvent): void {
  defaultSink(event);
}

export function resetWorkerTelemetrySink(): void {
  defaultSink = createConsoleTelemetrySink();
}
