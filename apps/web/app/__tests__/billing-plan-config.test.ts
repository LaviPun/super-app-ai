/**
 * Unit tests for plan pricing/quota config.
 *
 * Covers the static PLAN_CONFIGS table (prices + quotas + derived math per tier)
 * and the DB-backed getPlanConfig / getAllPlanConfigs / updatePlanTier logic
 * (DB-row parsing, fallback to code defaults, price/trial clamping, sort order).
 *
 * Prisma is fully mocked — no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    planTierConfig: {
      findUnique: hoisted.findUnique,
      findMany: hoisted.findMany,
      count: hoisted.count,
      create: hoisted.create,
      upsert: hoisted.upsert,
    },
  }),
}));

import { PLAN_CONFIGS } from '~/services/billing/billing.service';
import {
  getPlanConfig,
  getAllPlanConfigs,
  updatePlanTier,
} from '~/services/billing/plan-config.service';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── static table ───────────────────────────────────────────────────────────────

describe('PLAN_CONFIGS static table', () => {
  it('has the correct monthly USD price per tier', () => {
    expect(PLAN_CONFIGS.FREE.price).toBe(0);
    expect(PLAN_CONFIGS.STARTER.price).toBe(19);
    expect(PLAN_CONFIGS.GROWTH.price).toBe(79);
    expect(PLAN_CONFIGS.PRO.price).toBe(299);
    expect(PLAN_CONFIGS.ENTERPRISE.price).toBe(-1); // "contact us"
  });

  it('has the correct trial length per tier', () => {
    expect(PLAN_CONFIGS.FREE.trialDays).toBe(0);
    expect(PLAN_CONFIGS.STARTER.trialDays).toBe(14);
    expect(PLAN_CONFIGS.GROWTH.trialDays).toBe(14);
    expect(PLAN_CONFIGS.PRO.trialDays).toBe(7);
    expect(PLAN_CONFIGS.ENTERPRISE.trialDays).toBe(0);
  });

  it('has the correct AI-request quota per tier', () => {
    expect(PLAN_CONFIGS.FREE.quotas.aiRequestsPerMonth).toBe(10);
    expect(PLAN_CONFIGS.STARTER.quotas.aiRequestsPerMonth).toBe(200);
    expect(PLAN_CONFIGS.GROWTH.quotas.aiRequestsPerMonth).toBe(1000);
    expect(PLAN_CONFIGS.PRO.quotas.aiRequestsPerMonth).toBe(10000);
    expect(PLAN_CONFIGS.ENTERPRISE.quotas.aiRequestsPerMonth).toBe(-1); // unlimited
  });

  it('encodes ENTERPRISE as fully unlimited (all quotas -1)', () => {
    for (const v of Object.values(PLAN_CONFIGS.ENTERPRISE.quotas)) {
      expect(v).toBe(-1);
    }
  });

  it('derived math: PRO AI quota is 10x Growth (per the source comment)', () => {
    expect(PLAN_CONFIGS.PRO.quotas.aiRequestsPerMonth).toBe(
      PLAN_CONFIGS.GROWTH.quotas.aiRequestsPerMonth * 10
    );
  });

  it('quotas increase monotonically with price across finite paid tiers', () => {
    const finite = ['FREE', 'STARTER', 'GROWTH', 'PRO'] as const;
    for (let i = 1; i < finite.length; i++) {
      const prev = PLAN_CONFIGS[finite[i - 1]!].quotas;
      const cur = PLAN_CONFIGS[finite[i]!].quotas;
      expect(cur.aiRequestsPerMonth).toBeGreaterThan(prev.aiRequestsPerMonth);
      expect(cur.publishOpsPerMonth).toBeGreaterThan(prev.publishOpsPerMonth);
      expect(cur.modulesTotal).toBeGreaterThan(prev.modulesTotal);
    }
  });
});

// ─── getPlanConfig ──────────────────────────────────────────────────────────────

describe('getPlanConfig', () => {
  it('parses a DB row (quotasJson) when present', async () => {
    hoisted.findUnique.mockResolvedValue({
      name: 'GROWTH',
      displayName: 'Growth (custom)',
      price: 99,
      trialDays: 30,
      quotasJson: JSON.stringify({
        aiRequestsPerMonth: 2000,
        publishOpsPerMonth: 700,
        workflowRunsPerMonth: 20000,
        connectorCallsPerMonth: 60000,
        modulesTotal: 150,
      }),
    });
    const cfg = await getPlanConfig('GROWTH');
    expect(cfg.displayName).toBe('Growth (custom)');
    expect(cfg.price).toBe(99);
    expect(cfg.trialDays).toBe(30);
    expect(cfg.quotas.aiRequestsPerMonth).toBe(2000);
    expect(cfg.quotas.modulesTotal).toBe(150);
  });

  it('falls back to the code default when no DB row exists', async () => {
    hoisted.findUnique.mockResolvedValue(null);
    const cfg = await getPlanConfig('PRO');
    expect(cfg).toEqual(PLAN_CONFIGS.PRO);
  });

  it('falls back to FREE for an unknown plan name', async () => {
    hoisted.findUnique.mockResolvedValue(null);
    const cfg = await getPlanConfig('NON_EXISTENT');
    expect(cfg).toEqual(PLAN_CONFIGS.FREE);
  });

  it('preserves -1 (unlimited) quotas when parsing a DB row', async () => {
    hoisted.findUnique.mockResolvedValue({
      name: 'ENTERPRISE',
      displayName: 'Enterprise',
      price: -1,
      trialDays: 0,
      quotasJson: JSON.stringify({
        aiRequestsPerMonth: -1,
        publishOpsPerMonth: -1,
        workflowRunsPerMonth: -1,
        connectorCallsPerMonth: -1,
        modulesTotal: -1,
      }),
    });
    const cfg = await getPlanConfig('ENTERPRISE');
    expect(cfg.quotas.aiRequestsPerMonth).toBe(-1);
    expect(cfg.quotas.modulesTotal).toBe(-1);
  });
});

// ─── getAllPlanConfigs ──────────────────────────────────────────────────────────

describe('getAllPlanConfigs', () => {
  it('returns all five tiers sorted by price with ENTERPRISE (-1) last', async () => {
    hoisted.findMany.mockResolvedValue([]); // no DB rows → all code defaults
    const all = await getAllPlanConfigs();
    expect(all.map(c => c.name)).toEqual(['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']);
  });

  it('overlays DB rows on top of code defaults', async () => {
    hoisted.findMany.mockResolvedValue([
      {
        name: 'STARTER',
        displayName: 'Starter DB',
        price: 25,
        trialDays: 14,
        quotasJson: JSON.stringify(PLAN_CONFIGS.STARTER.quotas),
      },
    ]);
    const all = await getAllPlanConfigs();
    const starter = all.find(c => c.name === 'STARTER')!;
    expect(starter.displayName).toBe('Starter DB');
    expect(starter.price).toBe(25);
  });
});

// ─── updatePlanTier ─────────────────────────────────────────────────────────────

describe('updatePlanTier', () => {
  it('clamps a negative price (except -1) and rounds, clamps trialDays', async () => {
    hoisted.upsert.mockResolvedValue({});
    hoisted.findUnique.mockResolvedValue({
      name: 'STARTER',
      displayName: 'Starter',
      price: 0,
      trialDays: 0,
      quotasJson: JSON.stringify(PLAN_CONFIGS.STARTER.quotas),
    });
    await updatePlanTier('STARTER', {
      displayName: 'Starter',
      price: -5,
      trialDays: -3,
      quotas: PLAN_CONFIGS.STARTER.quotas,
    });
    const arg = hoisted.upsert.mock.calls[0]![0] as { create: any; update: any };
    expect(arg.create.price).toBe(0);
    expect(arg.create.trialDays).toBe(0);
    expect(arg.update.trialDays).toBe(0);
  });

  it('preserves price -1 (contact us) verbatim', async () => {
    hoisted.upsert.mockResolvedValue({});
    hoisted.findUnique.mockResolvedValue(null);
    await updatePlanTier('ENTERPRISE', {
      displayName: 'Enterprise',
      price: -1,
      trialDays: 0,
      quotas: PLAN_CONFIGS.ENTERPRISE.quotas,
    });
    const arg = hoisted.upsert.mock.calls[0]![0] as { create: any };
    expect(arg.create.price).toBe(-1);
  });

  it('rounds a fractional price to a whole number', async () => {
    hoisted.upsert.mockResolvedValue({});
    hoisted.findUnique.mockResolvedValue(null);
    await updatePlanTier('GROWTH', {
      displayName: 'Growth',
      price: 79.6,
      trialDays: 14,
      quotas: PLAN_CONFIGS.GROWTH.quotas,
    });
    const arg = hoisted.upsert.mock.calls[0]![0] as { create: any };
    expect(arg.create.price).toBe(80);
  });
});
