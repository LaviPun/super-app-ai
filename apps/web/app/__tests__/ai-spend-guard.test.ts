import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory prisma stub: aggregate sums the seeded AiUsage rows; appSettings
// returns the seeded cap. Mirrors the persisted-store style of
// ops-alert.service.test.ts (a canned return can't catch a wrong WHERE window).
type UsageRow = { costCents: number; createdAt: Date };
const state: { usage: UsageRow[]; settingsCap: number | null } = { usage: [], settingsCap: null };

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiUsage: {
      aggregate: vi.fn(async ({ where }: { where: { createdAt: { gte: Date } } }) => {
        const sum = state.usage
          .filter((r) => r.createdAt.getTime() >= where.createdAt.gte.getTime())
          .reduce((acc, r) => acc + r.costCents, 0);
        return { _sum: { costCents: state.usage.length ? sum : null } };
      }),
    },
    appSettings: {
      findUnique: vi.fn(async () => ({ aiDailySpendCapCents: state.settingsCap })),
    },
  }),
}));

import {
  DEFAULT_DAILY_CAP_CENTS,
  checkDailySpend,
  classifySpend,
  getTodaySpendCents,
  resolveDailyCapCents,
  utcDayStart,
} from '~/services/observability/ai-spend-guard.server';

afterEach(() => {
  state.usage = [];
  state.settingsCap = null;
  delete process.env.AI_DAILY_SPEND_CAP_CENTS;
  vi.restoreAllMocks();
});

describe('resolveDailyCapCents', () => {
  it('prefers the operator-set AppSettings cap over env and default', () => {
    expect(resolveDailyCapCents(500, 1000)).toBe(500);
  });

  it('falls back to the env cap when settings cap is null', () => {
    expect(resolveDailyCapCents(null, 1000)).toBe(1000);
  });

  it('falls back to the $20 default when neither is set', () => {
    expect(resolveDailyCapCents(null, undefined)).toBe(DEFAULT_DAILY_CAP_CENTS);
  });

  it('a settings cap of 0 is respected (explicit disable), not treated as unset', () => {
    expect(resolveDailyCapCents(0, 1000)).toBe(0);
  });
});

describe('classifySpend', () => {
  it('ok below 80% of cap', () => {
    expect(classifySpend(1599, 2000).status).toBe('ok');
  });

  it('warn at >= 80% of cap', () => {
    const check = classifySpend(1600, 2000);
    expect(check.status).toBe('warn');
    expect(check.ratio).toBe(0.8);
  });

  it('fail at >= 100% of cap', () => {
    expect(classifySpend(2000, 2000).status).toBe('fail');
    expect(classifySpend(9999, 2000).status).toBe('fail');
  });

  it('cap <= 0 disables the check (skipped, null cap/ratio)', () => {
    const check = classifySpend(5000, 0);
    expect(check.status).toBe('skipped');
    expect(check.capCents).toBeNull();
    expect(check.ratio).toBeNull();
  });
});

describe('getTodaySpendCents', () => {
  it('sums only rows since UTC midnight', async () => {
    const now = new Date('2026-09-02T10:00:00Z');
    state.usage = [
      { costCents: 100, createdAt: new Date('2026-09-02T01:00:00Z') }, // today
      { costCents: 50, createdAt: new Date('2026-09-02T09:59:00Z') }, // today
      { costCents: 999, createdAt: new Date('2026-09-01T23:59:00Z') }, // yesterday — excluded
    ];
    expect(await getTodaySpendCents(now)).toBe(150);
  });

  it('returns 0 when there are no rows (aggregate _sum null)', async () => {
    expect(await getTodaySpendCents(new Date())).toBe(0);
  });
});

describe('utcDayStart', () => {
  it('is UTC-midnight regardless of local timezone', () => {
    expect(utcDayStart(new Date('2026-09-02T23:59:59Z')).toISOString()).toBe('2026-09-02T00:00:00.000Z');
  });
});

describe('checkDailySpend', () => {
  it('uses the AppSettings cap read from the DB', async () => {
    const now = new Date('2026-09-02T10:00:00Z');
    state.settingsCap = 100;
    state.usage = [{ costCents: 100, createdAt: new Date('2026-09-02T01:00:00Z') }];
    const check = await checkDailySpend({ now });
    expect(check.status).toBe('fail');
    expect(check.capCents).toBe(100);
  });

  it('uses the env cap when no settings cap exists', async () => {
    const now = new Date('2026-09-02T10:00:00Z');
    process.env.AI_DAILY_SPEND_CAP_CENTS = '200';
    state.usage = [{ costCents: 160, createdAt: new Date('2026-09-02T01:00:00Z') }];
    const check = await checkDailySpend({ now });
    expect(check.status).toBe('warn');
    expect(check.capCents).toBe(200);
  });
});
