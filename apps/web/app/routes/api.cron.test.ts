import { beforeEach, describe, expect, it, vi } from 'vitest';

const claimDue = vi.fn();
const runForTrigger = vi.fn();

vi.mock('~/services/flows/schedule.service', () => ({
  ScheduleService: vi.fn(() => ({ claimDue })),
}));

vi.mock('~/services/flows/flow-runner.service', () => ({
  FlowRunnerService: vi.fn(() => ({ runForTrigger })),
}));

describe('api.cron loader', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    claimDue.mockReset();
    runForTrigger.mockReset();
  });

  it('runs due schedules with the SCHEDULED flow trigger', async () => {
    claimDue.mockResolvedValue([
      {
        id: 'schedule-1',
        shopId: 'shop-1',
        shopDomain: 'demo.myshopify.com',
        eventJson: '{"source":"test"}',
      },
    ]);
    runForTrigger.mockResolvedValue(undefined);

    const { loader } = await import('./api.cron');
    const response = await loader({
      request: new Request('https://example.com/api/cron', {
        headers: { 'x-cron-secret': 'cron-secret' },
      }),
    });

    await expect(response.json()).resolves.toEqual({
      ran: 1,
      results: [{ scheduleId: 'schedule-1', shopDomain: 'demo.myshopify.com', ok: true }],
    });
    expect(runForTrigger).toHaveBeenCalledWith(
      'demo.myshopify.com',
      null,
      'SCHEDULED',
      { source: 'test', kind: 'schedule', scheduleId: 'schedule-1' },
    );
  });

  it('keeps the default scheduled event when stored eventJson is malformed', async () => {
    claimDue.mockResolvedValue([
      {
        id: 'schedule-2',
        shopId: 'shop-1',
        shopDomain: 'demo.myshopify.com',
        eventJson: '{malformed',
      },
    ]);
    runForTrigger.mockResolvedValue(undefined);

    const { loader } = await import('./api.cron');
    const response = await loader({
      request: new Request('https://example.com/api/cron', {
        headers: { 'x-cron-secret': 'cron-secret' },
      }),
    });

    await expect(response.json()).resolves.toMatchObject({ ran: 1 });
    expect(runForTrigger).toHaveBeenCalledWith(
      'demo.myshopify.com',
      null,
      'SCHEDULED',
      { kind: 'schedule', scheduleId: 'schedule-2' },
    );
  });
});
