/**
 * R3.6 — subscription-contract advancement engine (makes the composite real).
 *
 * Covers: the contract MIRROR into the typed store (find-or-create, idempotent by
 * contract id); scheduling reminder stages on the R3.5 durable scheduler via the
 * SAME park helper the flow runner uses (parks a WAITING run, idempotent P2002
 * swallow on a re-schedule, past stages skipped); and the billing honesty fence
 * (`advanceBilling` fakes no charge).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '@superapp/core';

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const findFirst = vi.fn();
  const recipeFindMany = vi.fn();
  const getStoreByKey = vi.fn();
  const createRecord = vi.fn(async (_storeId: string, _data: { externalId?: string; customerId?: string; title?: string; payload: unknown }) => ({ id: 'rec_new' }));
  const updateRecord = vi.fn(async (_recordId: string, _storeId: string, _data: { title?: string; payload?: unknown }) => ({ count: 1 }));
  const startRun = vi.fn(async (_wf: import('@superapp/core').Workflow, _payload: Record<string, unknown>, _opts: { tenantId: string; runId: string }) => ({ status: 'WAITING' as const }));
  return { findFirst, recipeFindMany, getStoreByKey, createRecord, updateRecord, startRun };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    dataStoreRecord: { findFirst: hoisted.findFirst },
    recipe: { findMany: hoisted.recipeFindMany },
  }),
}));

vi.mock('~/services/data/data-store.service', () => ({
  DataStoreService: vi.fn().mockImplementation(() => ({
    getStoreByKey: hoisted.getStoreByKey,
    createRecord: hoisted.createRecord,
    updateRecord: hoisted.updateRecord,
  })),
}));

vi.mock('~/services/workflows/workflow-engine.service', () => ({
  WorkflowEngineService: vi.fn().mockImplementation(() => ({ startRun: hoisted.startRun })),
}));

vi.mock('~/services/flows/auth-resolver.server', () => ({
  buildShopAuthResolver: () => async () => ({ type: 'none' }),
}));

vi.mock('~/services/blueprints/blueprint.service', () => ({
  parseCompositeManifest: (json: string | null) => (json ? JSON.parse(json) : null),
}));

import {
  mirrorContract,
  scheduleAdvancement,
  advanceContract,
  advanceBilling,
  type ContractMirror,
  type ReminderStage,
} from '~/services/composites/subscription-advancement.server';

const NOW = new Date('2026-07-04T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const subRecord = {
  ref: 'subscribe-save',
  kind: 'subscription-contract',
  backing: 'SHOPIFY_CONTRACT',
  dataModel: { fields: [{ name: 'contractId', type: 'text', required: true, piiFlag: false }] },
};

function contract(overrides: Partial<ContractMirror> = {}): ContractMirror {
  return {
    contractId: 'gid://shopify/SubscriptionContract/500',
    customerId: 'gid://shopify/Customer/42',
    email: 'buyer@example.com',
    status: 'active',
    nextBillingAt: new Date(NOW.getTime() + 10 * DAY).toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const stages: ReminderStage[] = [
  { id: 'renewal-3d', offsetMs: -3 * DAY, subject: 'Renews in 3 days', body: 'Heads up…' },
  { id: 'dunning-3d', offsetMs: 3 * DAY, subject: 'Payment issue', body: 'Please update…' },
];

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.getStoreByKey.mockResolvedValue({ id: 'store_1', key: 'subscribe_save' });
  hoisted.recipeFindMany.mockResolvedValue([
    { id: 'recipe_1', compositeJson: JSON.stringify({ sharedRecords: [subRecord], bindings: [], memberRoles: [] }) },
  ]);
  hoisted.startRun.mockResolvedValue({ status: 'WAITING' });
});

// ─── contract mirror ──────────────────────────────────────────────────────────

describe('mirrorContract', () => {
  it('creates a new mirror row keyed by contract id', async () => {
    hoisted.findFirst.mockResolvedValue(null);
    const out = await mirrorContract('shop_1', contract(), { now: NOW });
    expect(out[0]!.mirrored).toBe(true);
    expect(out[0]!.created).toBe(true);
    const [, data] = hoisted.createRecord.mock.calls[0]!;
    expect(data.externalId).toBe('gid://shopify/SubscriptionContract/500');
    expect((data.payload as ContractMirror).status).toBe('active');
  });

  it('updates an existing mirror row (idempotent by contract id)', async () => {
    hoisted.findFirst.mockResolvedValue({
      id: 'rec_1',
      payload: JSON.stringify(contract({ status: 'active', scheduledStages: ['renewal-3d'] })),
    });
    const out = await mirrorContract('shop_1', contract({ status: 'past_due' }), { now: NOW });
    expect(out[0]!.created).toBe(false);
    expect(out[0]!.mirrored).toBe(true);
    const [, , data] = hoisted.updateRecord.mock.calls[0]!;
    // Prior scheduledStages are preserved across a re-mirror.
    expect((data.payload as ContractMirror).status).toBe('past_due');
    expect((data.payload as ContractMirror).scheduledStages).toContain('renewal-3d');
  });
});

// ─── scheduled advancement (durable scheduler) ─────────────────────────────────

describe('scheduleAdvancement', () => {
  it('parks a WAITING reminder for each future stage via startRun', async () => {
    const out = await scheduleAdvancement('shop_1', contract(), stages, { now: NOW });
    // Both stages are in the future (nextBillingAt is +10d; -3d and +3d are both > now).
    expect(out.every((r) => r.scheduled)).toBe(true);
    expect(hoisted.startRun).toHaveBeenCalledTimes(2);

    // The parked workflow is the SAME shape the flow runner parks: a durable wait
    // head (inlineThresholdMs 0) chained to a SEND_EMAIL_NOTIFICATION action node.
    const [wf] = hoisted.startRun.mock.calls[0]! as [Workflow, unknown, { runId: string }];
    const head = wf.nodes.find((n) => n.id === 'wait')!;
    expect(head.type).toBe('wait');
    expect(head.wait?.inlineThresholdMs).toBe(0);
    expect(wf.nodes.some((n) => n.type === 'action' && n.action?.provider === 'email')).toBe(true);
  });

  it('uses an idempotent runId (contract + stage) so a re-schedule swallows P2002', async () => {
    // First schedule records the runIds.
    const first = await scheduleAdvancement('shop_1', contract(), stages, { now: NOW });
    const runIds = first.map((r) => r.runId);
    expect(new Set(runIds).size).toBe(2); // distinct per stage

    // Second schedule: startRun throws a unique violation (already parked).
    hoisted.startRun.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const second = await scheduleAdvancement('shop_1', contract(), stages, { now: NOW });
    expect(second.every((r) => !r.scheduled && /already scheduled/i.test(r.reason ?? ''))).toBe(true);
    // The runIds are stable across the two calls (idempotent).
    expect(second.map((r) => r.runId)).toEqual(runIds);
  });

  it('skips a stage whose resume instant is already in the past', async () => {
    // nextBillingAt is only +1 day, so the -3d renewal stage lands in the past.
    const out = await scheduleAdvancement('shop_1', contract({ nextBillingAt: new Date(NOW.getTime() + 1 * DAY).toISOString() }), stages, { now: NOW });
    const renewal = out.find((r) => r.stageId === 'renewal-3d')!;
    expect(renewal.scheduled).toBe(false);
    expect(renewal.reason).toMatch(/past/i);
    // The future dunning stage still schedules.
    expect(out.find((r) => r.stageId === 'dunning-3d')!.scheduled).toBe(true);
  });

  it('skips scheduling when the contract has no email (only email channel is shipped)', async () => {
    const out = await scheduleAdvancement('shop_1', contract({ email: undefined }), stages, { now: NOW });
    expect(out.every((r) => !r.scheduled)).toBe(true);
    expect(hoisted.startRun).not.toHaveBeenCalled();
  });

  it('skips everything when there is no nextBillingAt', async () => {
    const out = await scheduleAdvancement('shop_1', contract({ nextBillingAt: null }), stages, { now: NOW });
    expect(out.every((r) => r.status === 'SKIPPED')).toBe(true);
    expect(hoisted.startRun).not.toHaveBeenCalled();
  });
});

describe('advanceContract — mirror + schedule together', () => {
  it('schedules reminders then mirrors the contract with the scheduled stage ids', async () => {
    hoisted.findFirst.mockResolvedValue(null);
    const { mirror, reminders } = await advanceContract('shop_1', contract(), stages, { now: NOW });
    expect(reminders.every((r) => r.scheduled)).toBe(true);
    expect(mirror[0]!.mirrored).toBe(true);
    const [, data] = hoisted.createRecord.mock.calls[0]!;
    expect((data.payload as ContractMirror).scheduledStages).toEqual(['renewal-3d', 'dunning-3d']);
  });
});

// ─── billing honesty fence ─────────────────────────────────────────────────

describe('advanceBilling — the scoped Shopify-API follow-up', () => {
  it('records NO charge and returns needsShopifyApi', () => {
    const r = advanceBilling('gid://shopify/SubscriptionContract/500');
    expect(r.ok).toBe(false);
    expect(r.needsShopifyApi).toBe(true);
    expect(r.reason).toMatch(/write_own_subscription_contracts|scoped follow-up/i);
  });
});
