import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ops health sweep (DevOps hardening 2026-09). In-memory prisma stub with a
 * persisted store (same discipline as ops-alert.service.test.ts): job/errorLog
 * counts actually filter the seeded rows, and appSettings upsert/update
 * mutates a real row — so the tests catch a wrong WHERE window or a heartbeat
 * that never lands, not just "the function returned".
 */
type JobRow = { status: string; createdAt: Date; startedAt: Date | null; finishedAt: Date | null };
type ErrRow = { level: string; createdAt: Date };
const state: {
  jobs: JobRow[];
  errors: ErrRow[];
  settings: { cronLastTickAt: Date | null; aiDailySpendCapCents: number | null; opsHealthSnapshot: string | null };
  usageCents: number;
} = {
  jobs: [],
  errors: [],
  settings: { cronLastTickAt: null, aiDailySpendCapCents: null, opsHealthSnapshot: null },
  usageCents: 0,
};

function jobMatches(r: JobRow, where: Record<string, unknown>): boolean {
  const w = where as {
    status?: string;
    createdAt?: { lte?: Date };
    startedAt?: { lte?: Date };
    finishedAt?: { gte?: Date };
  };
  if (w.status && r.status !== w.status) return false;
  if (w.createdAt?.lte && r.createdAt.getTime() > w.createdAt.lte.getTime()) return false;
  if (w.startedAt?.lte && (r.startedAt == null || r.startedAt.getTime() > w.startedAt.lte.getTime())) return false;
  if (w.finishedAt?.gte && (r.finishedAt == null || r.finishedAt.getTime() < w.finishedAt.gte.getTime())) return false;
  return true;
}

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.jobs.filter((r) => jobMatches(r, where)).length),
    },
    errorLog: {
      count: vi.fn(async ({ where }: { where: { level: string; createdAt: { gte: Date } } }) =>
        state.errors.filter((r) => r.level === where.level && r.createdAt.getTime() >= where.createdAt.gte.getTime()).length),
    },
    appSettings: {
      findUnique: vi.fn(async () => ({ ...state.settings })),
      upsert: vi.fn(async ({ update }: { update: { cronLastTickAt: Date } }) => {
        state.settings.cronLastTickAt = update.cronLastTickAt;
        return { ...state.settings };
      }),
      update: vi.fn(async ({ data }: { data: { opsHealthSnapshot: string } }) => {
        state.settings.opsHealthSnapshot = data.opsHealthSnapshot;
        return { ...state.settings };
      }),
    },
    aiUsage: {
      aggregate: vi.fn(async () => ({ _sum: { costCents: state.usageCents } })),
    },
  }),
}));

import {
  classifyCronStaleness,
  classifyDlqDepth,
  classifyErrorSpike,
  classifyQueueBacklog,
  classifyStuckRunning,
  collectOpsHealth,
  overallStatus,
  parseOpsHealthSnapshot,
  runOpsHealthSweep,
  DLQ_FAIL,
  DLQ_WARN,
  QUEUE_BACKLOG_FAIL,
  QUEUE_BACKLOG_WARN,
} from '~/services/observability/ops-health.server';

const NOW = new Date('2026-09-02T12:00:00Z');
const minAgo = (min: number) => new Date(NOW.getTime() - min * 60_000);

beforeEach(() => {
  state.jobs = [];
  state.errors = [];
  state.settings = { cronLastTickAt: null, aiDailySpendCapCents: null, opsHealthSnapshot: null };
  state.usageCents = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('threshold classifiers', () => {
  it('queue backlog: ok / warn / fail bands', () => {
    expect(classifyQueueBacklog(0).status).toBe('ok');
    expect(classifyQueueBacklog(QUEUE_BACKLOG_WARN).status).toBe('warn');
    expect(classifyQueueBacklog(QUEUE_BACKLOG_FAIL).status).toBe('fail');
  });

  it('DLQ depth: ok / warn / fail bands', () => {
    expect(classifyDlqDepth(DLQ_WARN - 1).status).toBe('ok');
    expect(classifyDlqDepth(DLQ_WARN).status).toBe('warn');
    expect(classifyDlqDepth(DLQ_FAIL).status).toBe('fail');
  });

  it('stuck running: any stuck job is at least a warn', () => {
    expect(classifyStuckRunning(0).status).toBe('ok');
    expect(classifyStuckRunning(1).status).toBe('warn');
    expect(classifyStuckRunning(10).status).toBe('fail');
  });

  it('error spike bands', () => {
    expect(classifyErrorSpike(0).status).toBe('ok');
    expect(classifyErrorSpike(25).status).toBe('warn');
    expect(classifyErrorSpike(100).status).toBe('fail');
  });

  it('cron staleness: skipped before first tick, ok when fresh, warn at 15m, fail at 60m', () => {
    expect(classifyCronStaleness(null, NOW).status).toBe('skipped');
    expect(classifyCronStaleness(minAgo(4), NOW).status).toBe('ok');
    expect(classifyCronStaleness(minAgo(15), NOW).status).toBe('warn');
    expect(classifyCronStaleness(minAgo(60), NOW).status).toBe('fail');
  });

  it('overall status is the worst non-skipped signal', () => {
    const sig = (status: 'ok' | 'warn' | 'fail' | 'skipped') => ({ name: 'x', status, value: 0, detail: '' });
    expect(overallStatus([sig('ok'), sig('skipped')])).toBe('ok');
    expect(overallStatus([sig('ok'), sig('warn')])).toBe('warn');
    expect(overallStatus([sig('warn'), sig('fail')])).toBe('fail');
  });
});

describe('collectOpsHealth', () => {
  it('counts only rows inside each signal window', async () => {
    state.jobs = [
      { status: 'QUEUED', createdAt: minAgo(11), startedAt: null, finishedAt: null }, // backlog
      { status: 'QUEUED', createdAt: minAgo(1), startedAt: null, finishedAt: null }, // fresh — not backlog
      { status: 'RUNNING', createdAt: minAgo(60), startedAt: minAgo(16), finishedAt: null }, // stuck
      { status: 'FAILED', createdAt: minAgo(120), startedAt: minAgo(119), finishedAt: minAgo(118) }, // DLQ (24h)
      { status: 'FAILED', createdAt: minAgo(60 * 48), startedAt: null, finishedAt: minAgo(60 * 47) }, // old — excluded
    ];
    state.errors = [{ level: 'ERROR', createdAt: minAgo(5) }, { level: 'ERROR', createdAt: minAgo(30) }];
    state.settings.cronLastTickAt = minAgo(3);

    const snapshot = await collectOpsHealth(NOW);
    const byName = new Map(snapshot.signals.map((s) => [s.name, s]));
    const get = (name: string) => {
      const signal = byName.get(name);
      if (!signal) throw new Error(`missing signal ${name}`);
      return signal;
    };
    expect(get('queueBacklog').value).toBe(1);
    expect(get('stuckRunning').value).toBe(1);
    expect(get('stuckRunning').status).toBe('warn');
    expect(get('dlqDepth').value).toBe(1);
    expect(get('errorSpike').value).toBe(1); // only the 5-min-old row is in the 15-min window
    expect(get('cronHeartbeat').status).toBe('ok');
    expect(get('aiSpend').status).toBe('ok');
    expect(snapshot.status).toBe('warn'); // the stuck job
  });
});

describe('runOpsHealthSweep', () => {
  it('writes the heartbeat, persists the snapshot, and fires no alerts when healthy', async () => {
    const fire = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
    const result = await runOpsHealthSweep({ alerts: { fire }, now: NOW });

    expect(state.settings.cronLastTickAt?.toISOString()).toBe(NOW.toISOString());
    expect(state.settings.opsHealthSnapshot).toBeTruthy();
    const persisted = parseOpsHealthSnapshot(state.settings.opsHealthSnapshot);
    expect(persisted?.status).toBe('ok');
    expect(fire).not.toHaveBeenCalled();
    expect(result.alertsFired).toEqual([]);
  });

  it('fires OPS_HEALTH_DEGRADED for a fail-level signal (DLQ flood)', async () => {
    state.jobs = Array.from({ length: DLQ_FAIL }, () => ({
      status: 'FAILED',
      createdAt: minAgo(30),
      startedAt: minAgo(29),
      finishedAt: minAgo(28),
    }));
    const fire = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
    const result = await runOpsHealthSweep({ alerts: { fire }, now: NOW });

    expect(result.status).toBe('fail');
    expect(result.alertsFired).toContain('OPS_HEALTH_DEGRADED:dlqDepth');
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ kind: 'OPS_HEALTH_DEGRADED' }));
  });

  it('fires AI_SPEND_CAP_EXCEEDED when today’s spend crosses the cap', async () => {
    state.settings.aiDailySpendCapCents = 100;
    state.usageCents = 150;
    const fire = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
    const result = await runOpsHealthSweep({ alerts: { fire }, now: NOW });

    expect(result.alertsFired).toContain('AI_SPEND_CAP_EXCEEDED:aiSpend');
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ kind: 'AI_SPEND_CAP_EXCEEDED' }));
  });

  it('warn-level signals do NOT page (banner-only)', async () => {
    state.jobs = Array.from({ length: DLQ_WARN }, () => ({
      status: 'FAILED',
      createdAt: minAgo(30),
      startedAt: minAgo(29),
      finishedAt: minAgo(28),
    }));
    const fire = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
    const result = await runOpsHealthSweep({ alerts: { fire }, now: NOW });

    expect(result.status).toBe('warn');
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('parseOpsHealthSnapshot', () => {
  it('round-trips a snapshot and rejects garbage', () => {
    expect(parseOpsHealthSnapshot(null)).toBeNull();
    expect(parseOpsHealthSnapshot('not json')).toBeNull();
    expect(parseOpsHealthSnapshot('{"nope":true}')).toBeNull();
    const snapshot = { status: 'ok', checkedAt: NOW.toISOString(), signals: [] };
    expect(parseOpsHealthSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
