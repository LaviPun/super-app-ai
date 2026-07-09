/**
 * R3.6 integration — a scheduled subscription reminder FIRES via the R3.5 cron
 * resume sweep. This is the end-to-end proof the advancement rides the real
 * durable scheduler (not a mocked engine): `scheduleAdvancement` parks a WAITING
 * WorkflowRun through the REAL WorkflowEngineService; `resumeDueWorkflowRuns`
 * (the cron sweep) picks it up once due and runs the email action node.
 *
 * Uses the same in-memory prisma + memory-connector harness as
 * workflow-durable-wait.test.ts so the engine runs for real against fakes.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { Connector, AuthContext } from '@superapp/core';

const h = vi.hoisted(() => {
  const sent: Array<Record<string, unknown>> = [];
  const runs = new Map<string, Record<string, unknown>>();
  const registry = new Map<string, Connector>();
  const email: Connector = {
    manifest: () => ({ provider: 'email', displayName: 'Email', version: '1.0.0', auth: { type: 'none' }, operations: [] }),
    validate: () => ({ ok: true }),
    invoke: async (_auth, req) => {
      if (req.operation === 'send') sent.push(req.inputs);
      return { ok: true, output: { messageId: 'm1', accepted: true } };
    },
  };
  registry.set('email', email);
  return { sent, runs, registry };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    workflowRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (h.runs.has(String(data.id))) {
          // Mimic the unique-id violation the real DB raises on a duplicate runId.
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        h.runs.set(String(data.id), { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const merged = { ...(h.runs.get(where.id) ?? {}), ...data };
        h.runs.set(where.id, merged);
        return merged;
      },
      findUnique: async ({ where }: { where: { id: string } }) => h.runs.get(where.id) ?? null,
      findMany: async ({ where, orderBy, take }: {
        where: { status: string; resumeAt?: { lte: Date } };
        orderBy?: { resumeAt: 'asc' | 'desc' };
        take?: number;
      }) => {
        let rows = Array.from(h.runs.values()).filter((r) => {
          if (r.status !== where.status) return false;
          if (where.resumeAt?.lte) {
            const at = r.resumeAt as Date | undefined;
            if (!at || at.getTime() > where.resumeAt.lte.getTime()) return false;
          }
          return true;
        });
        if (orderBy?.resumeAt) {
          rows = rows.sort((a, b) => {
            const av = (a.resumeAt as Date | undefined)?.getTime() ?? 0;
            const bv = (b.resumeAt as Date | undefined)?.getTime() ?? 0;
            return orderBy.resumeAt === 'asc' ? av - bv : bv - av;
          });
        }
        return (take ? rows.slice(0, take) : rows).map((r) => ({ ...r }));
      },
      updateMany: async ({ where, data }: {
        where: { id: string; status?: string; resumeAt?: Date | null };
        data: Record<string, unknown>;
      }) => {
        const row = h.runs.get(where.id);
        if (!row) return { count: 0 };
        if (where.status !== undefined && row.status !== where.status) return { count: 0 };
        if (where.resumeAt !== undefined) {
          const rowAt = (row.resumeAt as Date | null) ?? null;
          const wantAt = where.resumeAt;
          const same = rowAt === wantAt || (rowAt instanceof Date && wantAt instanceof Date && rowAt.getTime() === wantAt.getTime());
          if (!same) return { count: 0 };
        }
        h.runs.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
    workflowRunStep: { create: async () => ({}) },
  }),
}));

vi.mock('~/services/workflows/connectors/index', () => ({
  getConnectorRegistry: () => h.registry,
}));

vi.mock('~/services/flows/auth-resolver.server', () => ({
  buildShopAuthResolver: () => async (): Promise<AuthContext> => ({ type: 'none' }),
}));

import { scheduleAdvancement, type ContractMirror, type ReminderStage } from '~/services/composites/subscription-advancement.server';
import { WorkflowEngineService } from '~/services/workflows/workflow-engine.service';

// The engine's wait node measures `remaining` against wall-clock Date.now()
// (workflow-engine.service.ts, by design). A hardcoded past NOW is a time bomb —
// once the calendar passes the pinned resumeAt the wait is "already due", never
// parks, and the reminder sends inline. Freeze the clock instead: vi.setSystemTime
// (below) pins Date.now() so BOTH the test's NOW and the engine's internal
// Date.now() see the same instant — deterministic and DST-proof.
const FROZEN_NOW = new Date('2026-07-04T00:00:00.000Z');
const NOW = FROZEN_NOW;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const contract: ContractMirror = {
  contractId: 'gid://shopify/SubscriptionContract/900',
  customerId: 'gid://shopify/Customer/42',
  email: 'buyer@example.com',
  status: 'active',
  nextBillingAt: new Date(NOW.getTime() + 3 * DAY).toISOString(), // renewal in 3 days
  updatedAt: NOW.toISOString(),
};

const stage: ReminderStage = { id: 'renewal-1d', offsetMs: -1 * DAY, subject: 'Renews tomorrow', body: 'Your plan renews soon.' };

beforeEach(() => {
  h.sent.length = 0;
  h.runs.clear();
});

describe('subscription reminder — end-to-end via the durable resume sweep', () => {
  it('parks WAITING and does NOT send until the sweep fires it', async () => {
    const out = await scheduleAdvancement('shop_1', contract, [stage], { now: NOW });
    expect(out[0]!.scheduled).toBe(true);
    // Parked, not sent yet.
    expect(h.sent).toEqual([]);
    const runId = out[0]!.runId;
    expect(h.runs.get(runId)!.status).toBe('WAITING');

    // Sweep BEFORE due → nothing resumes, still no send.
    const early = await new WorkflowEngineService().resumeDueWorkflowRuns({
      now: NOW,
      authResolverFor: () => async () => ({ type: 'none' }),
    });
    expect(early).toEqual([]);
    expect(h.sent).toEqual([]);

    // Sweep AFTER due (resumeAt = nextBilling - 1d = now+2d) → the reminder fires.
    const due = new Date(NOW.getTime() + 3 * DAY);
    const swept = await new WorkflowEngineService().resumeDueWorkflowRuns({
      now: due,
      authResolverFor: () => async () => ({ type: 'none' }),
    });
    expect(swept).toHaveLength(1);
    expect(swept[0]!.status).toBe('SUCCEEDED');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.to).toBe('buyer@example.com');
    expect(h.sent[0]!.subject).toBe('Renews tomorrow');
    expect(h.runs.get(runId)!.status).toBe('SUCCEEDED');
  });

  it('a second schedule for the same contract+stage does not double-park (idempotent)', async () => {
    await scheduleAdvancement('shop_1', contract, [stage], { now: NOW });
    const before = h.runs.size;
    const second = await scheduleAdvancement('shop_1', contract, [stage], { now: NOW });
    expect(h.runs.size).toBe(before); // no new run parked
    expect(second[0]!.scheduled).toBe(false);
    expect(second[0]!.reason).toMatch(/already scheduled/i);
  });
});
