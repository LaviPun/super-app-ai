import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(async () => []),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ activityLog: { findMany: hoisted.findMany } }),
}));
vi.mock('~/services/observability/correlation.server', () => ({
  getRequestContext: () => undefined,
}));
vi.mock('~/services/observability/telemetry-budget.server', () => ({
  applyTelemetryBudget: (d: unknown) => d,
}));

import { ActivityLogService } from '~/services/activity/activity.service';

beforeEach(() => vi.clearAllMocks());

function whereOfLastCall(): Record<string, unknown> {
  const args = hoisted.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
  return args.where;
}

describe('ActivityLogService.list action filters', () => {
  it('action alone → exact match', async () => {
    await new ActivityLogService().list({ action: 'MODULE_PUBLISHED' });
    expect(whereOfLastCall().action).toBe('MODULE_PUBLISHED');
  });

  it('excludeActions alone → notIn', async () => {
    await new ActivityLogService().list({ excludeActions: ['PAGE_LOAD', 'APP_NAV'] });
    expect(whereOfLastCall().action).toEqual({ notIn: ['PAGE_LOAD', 'APP_NAV'] });
  });

  it('BOTH → combined (excludeActions must not clobber the action filter)', async () => {
    await new ActivityLogService().list({
      action: 'MODULE_PUBLISHED',
      excludeActions: ['PAGE_LOAD', 'APP_NAV'],
    });
    expect(whereOfLastCall().action).toEqual({
      equals: 'MODULE_PUBLISHED',
      notIn: ['PAGE_LOAD', 'APP_NAV'],
    });
  });

  it('empty excludeActions with action → exact match (no useless notIn)', async () => {
    await new ActivityLogService().list({ action: 'LOGIN', excludeActions: [] });
    expect(whereOfLastCall().action).toBe('LOGIN');
  });
});
