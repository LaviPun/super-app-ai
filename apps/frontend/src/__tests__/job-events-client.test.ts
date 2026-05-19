import { describe, expect, it, vi } from 'vitest';
import { WorkerEventSchema } from '@superapp/platform-contracts';
import { fetchJobStatus, mergeWorkerEvents, subscribeJobEvents } from '@/lib/job-events-client';

describe('job-events-client', () => {
  it('mergeWorkerEvents dedupes by type and timestamp', () => {
    const base = WorkerEventSchema.parse({
      type: 'JOB_STARTED',
      jobId: 'job-1',
      queueName: 'ai-generation',
      trace: { correlationId: 'corr-1' },
      timestamp: '2026-05-19T00:00:00.000Z',
    });
    const merged = mergeWorkerEvents([base], [base, { ...base, message: 'still running' }]);
    expect(merged).toHaveLength(1);
  });

  it('fetchJobStatus parses job record and events', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'job-1',
        type: 'FLOW_RUN',
        queueName: 'flow-execution',
        status: 'RUNNING',
        payload: {},
        trace: { correlationId: 'corr-1' },
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        events: [{
          type: 'JOB_PROGRESS',
          jobId: 'job-1',
          queueName: 'flow-execution',
          trace: { correlationId: 'corr-1' },
          timestamp: '2026-05-19T00:00:01.000Z',
          message: 'Running step',
        }],
      }),
    })) as unknown as typeof fetch;

    const status = await fetchJobStatus({
      baseUrl: 'http://127.0.0.1:4000',
      statusPath: '/v1/jobs/job-1',
      fetchImpl,
    });
    expect(status.status).toBe('RUNNING');
    expect(status.events).toHaveLength(1);
  });

  it('subscribeJobEvents falls back to polling when SSE fails', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/events')) {
        return { ok: false, status: 500, body: null } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          id: 'job-1',
          type: 'PUBLISH',
          queueName: 'publish-execution',
          status: 'QUEUED',
          payload: {},
          trace: { correlationId: 'corr-1' },
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
          events: [],
        }),
      } as Response;
    }) as typeof fetch;

    const transports: string[] = [];
    const subscription = subscribeJobEvents(
      {
        baseUrl: 'http://127.0.0.1:4000',
        jobId: 'job-1',
        eventsPath: '/v1/jobs/job-1/events',
        statusPath: '/v1/jobs/job-1',
        pollIntervalMs: 1000,
        fetchImpl,
      },
      {
        onTransport: (mode) => transports.push(mode),
        onEvent: () => {},
      },
    );

    await vi.waitFor(() => expect(transports).toContain('polling'));
    subscription.close();
    vi.useRealTimers();
  });
});
