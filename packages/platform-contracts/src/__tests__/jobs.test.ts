import { describe, expect, it } from 'vitest';
import {
  AiGeneratePayloadSchema,
  ConnectorCallPayloadSchema,
  ConnectorTestPayloadSchema,
  EnqueueJobRequestSchema,
  EnqueueJobResponseSchema,
  JobTypeQueueName,
  JobTypeSchema,
  WorkerEventSchema,
  PublishPayloadSchema,
  validateJobPayload,
  WebhookReceivedPayloadSchema,
} from '../jobs.js';

describe('JobTypeSchema', () => {
  it('accepts all planned job types', () => {
    const types = [
      'AI_GENERATE',
      'AI_HYDRATE',
      'AI_MODIFY',
      'INTERNAL_TOOL_RUN',
      'PUBLISH',
      'CONNECTOR_TEST',
      'CONNECTOR_CALL',
      'FLOW_RUN',
      'WEBHOOK_RECEIVED',
      'THEME_ANALYZE',
      'RETENTION_RUN',
    ] as const;
    for (const t of types) {
      expect(JobTypeSchema.parse(t)).toBe(t);
    }
    expect(JobTypeQueueName.AI_GENERATE).toBe('ai-generation');
    expect(JobTypeQueueName.INTERNAL_TOOL_RUN).toBe('internal-tool-run');
    expect(JobTypeQueueName.PUBLISH).toBe('publish-execution');
    expect(JobTypeQueueName.WEBHOOK_RECEIVED).toBe('webhook-processing');
  });
});

describe('validateJobPayload', () => {
  it('validates AI_GENERATE sample', () => {
    const payload = validateJobPayload('AI_GENERATE', {
      prompt: 'Add a banner for summer sale',
      catalogId: 'theme.section',
    });
    expect(payload.prompt).toContain('banner');
    expect(AiGeneratePayloadSchema.parse(payload)).toEqual(payload);
  });

  it('validates PUBLISH sample', () => {
    const payload = validateJobPayload('PUBLISH', {
      moduleId: 'mod_123',
      dryRun: true,
    });
    expect(PublishPayloadSchema.parse(payload).dryRun).toBe(true);
  });

  it('validates INTERNAL_TOOL_RUN sample', () => {
    const payload = validateJobPayload('INTERNAL_TOOL_RUN', {
      sessionId: 'sess-1',
      message: 'Summarize failed jobs',
      target: 'localMachine',
      clientRequestId: 'request-123',
    });
    expect(payload.target).toBe('localMachine');
  });

  it('validates CONNECTOR_TEST sample with explicit path', () => {
    const payload = validateJobPayload('CONNECTOR_TEST', {
      connectorId: 'conn-1',
      path: '/v1/ping',
      method: 'GET',
    });
    expect(ConnectorTestPayloadSchema.parse(payload).path).toBe('/v1/ping');
  });

  it('rejects CONNECTOR_TEST without path or endpointId', () => {
    expect(() => validateJobPayload('CONNECTOR_TEST', { connectorId: 'conn-1' })).toThrow();
  });

  it('validates CONNECTOR_CALL sample', () => {
    const payload = validateJobPayload('CONNECTOR_CALL', {
      connectorId: 'conn-1',
      endpointId: 'endpoint-1',
      input: { ping: true },
    });
    expect(ConnectorCallPayloadSchema.parse(payload).endpointId).toBe('endpoint-1');
  });

  it('validates WEBHOOK_RECEIVED sample', () => {
    const payload = validateJobPayload('WEBHOOK_RECEIVED', {
      shopDomain: 'demo.myshopify.com',
      topic: 'orders/create',
      eventId: 'evt-1',
    });
    expect(WebhookReceivedPayloadSchema.parse(payload).topic).toBe('orders/create');
  });

  it('rejects invalid AI_GENERATE payload via validateJobPayload', () => {
    expect(() => validateJobPayload('AI_GENERATE', {})).toThrow();
  });

  it('accepts enqueue request envelope with typed payload validation', () => {
    const req = EnqueueJobRequestSchema.parse({
      type: 'AI_GENERATE',
      payload: { prompt: 'hello' },
      trace: { correlationId: 'c1' },
    });
    expect(validateJobPayload('AI_GENERATE', req.payload).prompt).toBe('hello');
  });

  it('validates enqueue responses and worker events', () => {
    expect(EnqueueJobResponseSchema.parse({
      jobId: 'job_000001',
      queueName: 'ai-generation',
      status: 'QUEUED',
      deduped: false,
    }).queueName).toBe('ai-generation');

    expect(WorkerEventSchema.parse({
      type: 'JOB_QUEUED',
      jobId: 'job_000001',
      queueName: 'ai-generation',
      trace: { correlationId: 'corr-1' },
      timestamp: new Date().toISOString(),
      progress: 0,
    }).type).toBe('JOB_QUEUED');
  });
});
