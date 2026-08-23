import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';
// A known-valid RecipeSpec: the route validates body.spec with the REAL
// RecipeSpecSchema, so use a shipped template spec rather than a hand-rolled one.
import { MODULE_TEMPLATES } from '@superapp/core';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  createDraft: vi.fn(async () => ({ id: 'mod-new', name: 'X', type: 'theme.section', status: 'DRAFT', versions: [{ version: 1 }] })),
  enforce: vi.fn(async () => {}),
  shopFindUnique: vi.fn(async () => ({ id: 'shop-1' })),
  log: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    createDraft = hoisted.createDraft;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.enforce;
  },
}));
vi.mock('~/db.server', () => ({ getPrisma: () => ({ shop: { findUnique: hoisted.shopFindUnique } }) }));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

function createRequest() {
  const spec = MODULE_TEMPLATES.find((t) => t.spec.type === 'theme.section')!.spec;
  return new Request('https://app.test/api/agent/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('api.agent.modules create quota', () => {
  it('enforces the moduleCount quota BEFORE creating the draft', async () => {
    hoisted.enforce.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Module limit reached. 3/3.' }),
    );
    const { action } = await import('~/routes/api.agent.modules');
    const res = await action({ request: createRequest() });
    expect(res.status).toBe(429);
    expect(hoisted.enforce).toHaveBeenCalledWith('shop-1', 'moduleCount');
    expect(hoisted.createDraft).not.toHaveBeenCalled();
  });

  it('creates the draft when under quota (201)', async () => {
    const { action } = await import('~/routes/api.agent.modules');
    const res = await action({ request: createRequest() });
    expect(res.status).toBe(201);
    expect(hoisted.createDraft).toHaveBeenCalled();
  });
});
