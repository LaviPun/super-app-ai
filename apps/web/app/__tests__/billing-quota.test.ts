/**
 * Unit tests for QuotaService.enforce — server-side quota enforcement.
 *
 * Covers: allow under limit, block AT/over limit (>=), unlimited (-1) bypass,
 * default-to-FREE when a shop has no subscription, and per-kind usage sources
 * (aiUsage aggregate / job count / module count).
 *
 * getPlanConfig + Prisma are mocked — no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlanConfig } from '~/services/billing/billing.service';

const hoisted = vi.hoisted(() => ({
  subFindUnique: vi.fn(),
  aiAggregate: vi.fn(),
  jobCount: vi.fn(),
  apiLogCount: vi.fn(),
  moduleCount: vi.fn(),
  getPlanConfig: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSubscription: { findUnique: hoisted.subFindUnique },
    aiUsage: { aggregate: hoisted.aiAggregate },
    job: { count: hoisted.jobCount },
    apiLog: { count: hoisted.apiLogCount },
    module: { count: hoisted.moduleCount },
  }),
}));

vi.mock('~/services/billing/plan-config.service', () => ({
  getPlanConfig: hoisted.getPlanConfig,
}));

import { QuotaService } from '~/services/billing/quota.service';
import { AppError } from '~/services/errors/app-error.server';

function config(quotas: Partial<PlanConfig['quotas']>): PlanConfig {
  return {
    name: 'STARTER',
    displayName: 'Starter',
    price: 19,
    trialDays: 14,
    quotas: {
      aiRequestsPerMonth: 200,
      publishOpsPerMonth: 50,
      workflowRunsPerMonth: 1000,
      connectorCallsPerMonth: 5000,
      modulesTotal: 20,
      ...quotas,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.subFindUnique.mockResolvedValue({ planName: 'STARTER' });
  hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 0 } });
  hoisted.jobCount.mockResolvedValue(0);
  hoisted.apiLogCount.mockResolvedValue(0);
  hoisted.moduleCount.mockResolvedValue(0);
});

describe('QuotaService.enforce — aiRequest', () => {
  it('allows usage under the limit', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 200 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 199 } });
    await expect(new QuotaService().enforce('shop_1', 'aiRequest')).resolves.toBeUndefined();
  });

  it('blocks AT the limit (used === limit)', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 200 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 200 } });
    await expect(new QuotaService().enforce('shop_1', 'aiRequest')).rejects.toBeInstanceOf(AppError);
  });

  it('blocks over the limit and throws RATE_LIMITED with usage details', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 200 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 250 } });
    try {
      await new QuotaService().enforce('shop_1', 'aiRequest');
      throw new Error('expected enforce to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.details).toMatchObject({ kind: 'aiRequest', used: '250', limit: '200', plan: 'STARTER' });
    }
  });

  it('treats a null aggregate sum as zero usage (allows)', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 10 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: null } });
    await expect(new QuotaService().enforce('shop_1', 'aiRequest')).resolves.toBeUndefined();
  });
});

describe('QuotaService.enforce — unlimited', () => {
  it('never blocks when the limit is -1 (unlimited), even with high usage', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: -1 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 999999 } });
    await expect(new QuotaService().enforce('shop_1', 'aiRequest')).resolves.toBeUndefined();
    // short-circuits before counting usage
    expect(hoisted.aiAggregate).not.toHaveBeenCalled();
  });
});

describe('QuotaService.enforce — default plan', () => {
  it('defaults to FREE when the shop has no subscription row', async () => {
    hoisted.subFindUnique.mockResolvedValue(null);
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 10 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 5 } });
    await new QuotaService().enforce('shop_1', 'aiRequest');
    expect(hoisted.getPlanConfig).toHaveBeenCalledWith('FREE');
  });
});

describe('QuotaService.enforce — moduleCount', () => {
  it('allows when published modules are under the total limit', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: 3 }));
    hoisted.moduleCount.mockResolvedValue(2);
    await expect(new QuotaService().enforce('shop_1', 'moduleCount')).resolves.toBeUndefined();
  });

  it('blocks at the module limit with the module-specific message', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: 3 }));
    hoisted.moduleCount.mockResolvedValue(3);
    try {
      await new QuotaService().enforce('shop_1', 'moduleCount');
      throw new Error('expected enforce to throw');
    } catch (e) {
      const err = e as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.message).toMatch(/Module limit reached/);
      expect(err.details).toMatchObject({ kind: 'moduleCount', used: '3', limit: '3' });
    }
  });
});

describe('QuotaService.enforce — publishOp / workflowRun / connectorCall', () => {
  it('publishOp counts jobs and allows under limit', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ publishOpsPerMonth: 50 }));
    hoisted.jobCount.mockResolvedValue(49);
    await expect(new QuotaService().enforce('shop_1', 'publishOp')).resolves.toBeUndefined();
    expect(hoisted.jobCount).toHaveBeenCalled();
  });

  it('workflowRun blocks at the limit', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ workflowRunsPerMonth: 1000 }));
    hoisted.jobCount.mockResolvedValue(1000);
    await expect(new QuotaService().enforce('shop_1', 'workflowRun')).rejects.toBeInstanceOf(AppError);
  });

  it('connectorCall counts apiLog rows and blocks at the limit', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ connectorCallsPerMonth: 5000 }));
    hoisted.apiLogCount.mockResolvedValue(5000);
    await expect(new QuotaService().enforce('shop_1', 'connectorCall')).rejects.toBeInstanceOf(AppError);
  });
});
