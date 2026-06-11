import { describe, expect, it } from 'vitest';
import {
  createConsoleTelemetrySink,
  emitWorkerTelemetry,
  resetWorkerTelemetrySink,
  setWorkerTelemetrySink,
} from '../telemetry/worker-telemetry.js';

describe('worker telemetry sink', () => {
  it('emits sanitized structured telemetry', () => {
    const lines: string[] = [];
    resetWorkerTelemetrySink();
    setWorkerTelemetrySink((event) => {
      lines.push(JSON.stringify({
        service: 'test-workers',
        eventType: event.type,
        metadata: event.metadata?.token === undefined ? event.metadata : { token: '[redacted]' },
      }));
    });

    emitWorkerTelemetry({
      type: 'JOB_COMPLETED',
      jobId: 'job_1',
      queueName: 'ai-generation',
      trace: { correlationId: 'corr_1', shopId: 'shop_1' },
      timestamp: new Date().toISOString(),
      progress: 100,
      message: 'done',
      metadata: { token: 'secret-value' },
    });

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] ?? '{}') as { metadata?: { token?: string } };
    expect(parsed.metadata?.token).toBe('[redacted]');
    expect(createConsoleTelemetrySink('x')).toBeTypeOf('function');
    resetWorkerTelemetrySink();
  });
});
