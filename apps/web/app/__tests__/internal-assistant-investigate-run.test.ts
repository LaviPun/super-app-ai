import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  shop: { findFirst: vi.fn() },
  errorLog: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  job: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  apiLog: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  activityLog: { findFirst: vi.fn(), findMany: vi.fn() },
  aiUsage: { findMany: vi.fn() },
  flowStepLog: { findMany: vi.fn() },
};

vi.mock('~/db.server', () => ({ getPrisma: () => prismaMock }));

function emptyTrace() {
  prismaMock.apiLog.findMany.mockResolvedValue([]);
  prismaMock.job.findMany.mockResolvedValue([]);
  prismaMock.errorLog.findMany.mockResolvedValue([]);
  prismaMock.aiUsage.findMany.mockResolvedValue([]);
  prismaMock.flowStepLog.findMany.mockResolvedValue([]);
  prismaMock.activityLog.findMany.mockResolvedValue([]);
}

describe('investigateLogEntry tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shop.findFirst.mockResolvedValue(null);
    prismaMock.errorLog.findFirst.mockResolvedValue(null);
    prismaMock.job.findFirst.mockResolvedValue(null);
    prismaMock.apiLog.findFirst.mockResolvedValue(null);
    prismaMock.activityLog.findFirst.mockResolvedValue(null);
    prismaMock.errorLog.count.mockResolvedValue(0);
    prismaMock.job.count.mockResolvedValue(0);
    emptyTrace();
  });

  it('resolves a failed job by id, redacts, and reports recurrence', async () => {
    prismaMock.job.findFirst.mockResolvedValue({
      id: 'cmrezggie001m11h4wulhkams',
      type: 'PUBLISH',
      status: 'FAILED',
      error: 'Error: ensureMetafieldDefinition error for owner bob@example.com',
      result: null,
      payload: null,
      correlationId: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      shop: { shopDomain: 'demo.myshopify.com' },
    });
    prismaMock.job.count.mockResolvedValue(6);
    prismaMock.job.findMany.mockImplementation((args: { where?: { status?: string } }) => {
      // recurrence query (status FAILED + type) returns a latest example; trace join returns []
      if (args?.where?.status === 'FAILED') {
        return Promise.resolve([
          {
            id: 'cmrezftuu001k11h4cq5leu8n',
            type: 'PUBLISH',
            status: 'FAILED',
            createdAt: new Date('2026-07-13T00:00:00.000Z'),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('investigateLogEntry', {
      prompt: 'why did job cmrezggie001m11h4wulhkams fail?',
    });

    expect(result.ok).toBe(true);
    const entry = result.data.entry as { table: string; id: string; message?: string };
    expect(entry.table).toBe('job');
    expect(entry.id).toBe('cmrezggie001m11h4wulhkams');
    expect(JSON.stringify(result.data)).not.toContain('bob@example.com');
    const related = result.data.related as { count: number } | null;
    expect(related?.count).toBe(6);
    // whole-payload budget enforced
    expect(JSON.stringify(result.data).length).toBeLessThanOrEqual(3200);
  });

  it('returns a not-found payload when the id resolves to nothing', async () => {
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('investigateLogEntry', {
      prompt: 'investigate cmrezggie001m11h4wulhkams',
    });
    expect(result.ok).toBe(false);
    expect(result.data.found).toBe(false);
  });

  it('returns a not-target payload when no identifier or latest phrasing is present', async () => {
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('investigateLogEntry', { prompt: 'hello there' });
    expect(result.ok).toBe(false);
    expect(result.data.found).toBe(false);
  });

  it('latest sentinel resolves to the most recent ERROR errorLog', async () => {
    prismaMock.errorLog.findFirst.mockResolvedValue({
      id: 'err-latest',
      level: 'ERROR',
      message: 'Boom failed while publishing',
      route: '/apps/demo',
      source: 'SERVER',
      stack: null,
      meta: null,
      correlationId: null,
      createdAt: new Date('2026-07-14T01:00:00.000Z'),
      shop: null,
    });
    prismaMock.errorLog.count.mockResolvedValue(3);
    prismaMock.errorLog.findMany.mockResolvedValue([
      { id: 'err-older', level: 'ERROR', message: 'Boom failed while publishing', createdAt: new Date('2026-07-13T00:00:00.000Z') },
    ]);

    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('investigateLogEntry', {
      prompt: 'investigate the latest error',
    });
    expect(result.ok).toBe(true);
    const entry = result.data.entry as { table: string; id: string };
    expect(entry.table).toBe('errorLog');
    expect(entry.id).toBe('err-latest');
  });
});
