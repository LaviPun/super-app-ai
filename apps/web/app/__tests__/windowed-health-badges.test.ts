import { describe, expect, it, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();
const countMock = vi.fn(async (..._args: unknown[]) => 0);

vi.mock('~/internal-admin/session.server', () => ({ requireInternalAdmin: vi.fn(async () => ({})) }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
    },
  }),
}));

import { computeHealthWindows } from '~/routes/internal.jobs';

beforeEach(() => {
  vi.clearAllMocks();
  countMock.mockResolvedValue(0);
});

describe('computeHealthWindows (pure)', () => {
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000);

  it('computes success-rate percentage per window, per job type', () => {
    const jobs = [
      { type: 'CONNECTOR_TEST', status: 'SUCCESS', createdAt: minutesAgo(5) },
      { type: 'CONNECTOR_TEST', status: 'SUCCESS', createdAt: minutesAgo(5) },
      { type: 'CONNECTOR_TEST', status: 'FAILED', createdAt: minutesAgo(5) },
      { type: 'CONNECTOR_TEST', status: 'SUCCESS', createdAt: minutesAgo(5) },
    ];
    const result = computeHealthWindows(jobs);
    const win15m = result.CONNECTOR_TEST!.find((w) => w.window === '15m')!;
    expect(win15m.total).toBe(4);
    expect(win15m.successRatePct).toBe(75);
  });

  it('never divides by zero — reports null successRatePct when total is 0, not a fabricated 100%', () => {
    const result = computeHealthWindows([]);
    expect(result).toEqual({});

    const jobs = [{ type: 'FLOW_RUN', status: 'SUCCESS', createdAt: minutesAgo(20) }]; // outside the 15m window
    const win15m = computeHealthWindows(jobs).FLOW_RUN!.find((w) => w.window === '15m')!;
    expect(win15m.total).toBe(0);
    expect(win15m.successRatePct).toBeNull();
  });

  it('excludes RUNNING/QUEUED jobs from the success-rate denominator', () => {
    const jobs = [
      { type: 'HTTP_SYNC_RUN', status: 'SUCCESS', createdAt: minutesAgo(1) },
      { type: 'HTTP_SYNC_RUN', status: 'RUNNING', createdAt: minutesAgo(1) },
      { type: 'HTTP_SYNC_RUN', status: 'QUEUED', createdAt: minutesAgo(1) },
    ];
    const win15m = computeHealthWindows(jobs).HTTP_SYNC_RUN!.find((w) => w.window === '15m')!;
    expect(win15m.total).toBe(1);
    expect(win15m.successRatePct).toBe(100);
  });

  it('a job outside all windows (>24h old) contributes to none of the three windows', () => {
    const jobs = [{ type: 'MESSAGING_RUN', status: 'FAILED', createdAt: minutesAgo(60 * 30) }];
    const result = computeHealthWindows(jobs);
    for (const w of result.MESSAGING_RUN!) {
      expect(w.total).toBe(0);
      expect(w.successRatePct).toBeNull();
    }
  });

  it('returns exactly the three windows 15m/1h/24h per type', () => {
    const jobs = [{ type: 'CONNECTOR_TEST', status: 'SUCCESS', createdAt: minutesAgo(1) }];
    const windows = computeHealthWindows(jobs).CONNECTOR_TEST!.map((w) => w.window).sort();
    expect(windows).toEqual(['15m', '1h', '24h']);
  });
});

describe('internal.jobs loader → healthWindows', () => {
  it('the loader response includes healthWindows computed from the last-24h job set', async () => {
    findManyMock.mockImplementation(async (args: { distinct?: string[]; select?: unknown }) => {
      if (args?.distinct) return [{ type: 'CONNECTOR_TEST' }];
      if (args?.select) {
        return [
          { type: 'CONNECTOR_TEST', status: 'SUCCESS', createdAt: new Date() },
          { type: 'CONNECTOR_TEST', status: 'FAILED', createdAt: new Date() },
        ];
      }
      return []; // the paginated jobs list itself
    });
    const { loader } = await import('~/routes/internal.jobs');
    const res = await loader({ request: new Request('https://admin.test/internal/jobs') } as never);
    const body = await res.json();
    expect(body.healthWindows.CONNECTOR_TEST).toBeDefined();
    const win15m = body.healthWindows.CONNECTOR_TEST!.find((w: { window: string }) => w.window === '15m')!;
    expect(win15m.total).toBe(2);
    expect(win15m.successRatePct).toBe(50);
  });
});
