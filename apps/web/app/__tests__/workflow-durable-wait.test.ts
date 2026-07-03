import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connector, Workflow, AuthContext } from '@superapp/core';

/**
 * Durable-wait park + resume. A top-level wait longer than its inline threshold
 * parks the run (status WAITING + resumeAt + resumeNodeId, with the compiled graph
 * persisted); resumeRun continues from the wait's `next` edge to completion.
 */

// ── in-memory prisma + a memory connector (hoisted for vi.mock) ───────────────
const h = vi.hoisted(() => {
  const sink: unknown[] = [];
  const runs = new Map<string, Record<string, unknown>>();
  const registry = new Map<string, Connector>();
  const memory: Connector = {
    manifest: () => ({
      provider: 'memory',
      displayName: 'Memory',
      version: '1.0.0',
      auth: { type: 'none' },
      operations: [],
    }),
    validate: () => ({ ok: true }),
    invoke: async (_auth, req) => {
      if (req.operation === 'push') sink.push(req.inputs.value);
      return { ok: true, output: { ...req.inputs, echoed: true } };
    },
  };
  registry.set('memory', memory);
  return { sink, runs, registry };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    workflowRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.runs.set(String(data.id), { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const merged = { ...(h.runs.get(where.id) ?? {}), ...data };
        h.runs.set(where.id, merged);
        return merged;
      },
      findUnique: async ({ where }: { where: { id: string } }) => h.runs.get(where.id) ?? null,
      // Ordered, bounded due-run scan for the resume sweep.
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
      // Atomic CAS: only mutates when every `where` field still matches (the
      // resumeAt guard is what makes concurrent sweeps resume a run exactly once).
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

const authResolver = async (): Promise<AuthContext> => ({ type: 'none' });

const longWaitWorkflow = (): Workflow => ({
  id: 'wf-wait-0001',
  version: 1,
  name: 'Durable wait',
  status: 'active',
  tenantId: 'shop_1',
  trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
  nodes: [
    { id: 'w', type: 'wait', name: 'Wait 7 days', wait: { mode: 'duration', durationMs: 7 * 24 * 3600 * 1000, inlineThresholdMs: 60_000 } },
    { id: 'act', type: 'action', name: 'After wait', action: { provider: 'memory', operation: 'push', inputs: { value: 'AFTER' }, timeoutMs: 1000 } },
    { id: 'done', type: 'end', name: 'Done' },
  ],
  edges: [
    { from: 'w', to: 'act', label: 'next' },
    { from: 'act', to: 'done', label: 'next' },
  ],
});

beforeEach(() => {
  h.sink.length = 0;
  h.runs.clear();
});

describe('WorkflowEngine — durable wait (park + resume)', () => {
  it('parks a long top-level wait without running the post-wait step', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();
    const runId = 'run_park_1';

    const parked = await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId, authResolver });

    expect(parked.status).toBe('WAITING');
    expect(parked.resumeAt).toBeTruthy();
    expect(h.sink).toEqual([]); // post-wait action did NOT run yet

    const row = h.runs.get(runId)!;
    expect(row.status).toBe('WAITING');
    expect(row.resumeNodeId).toBe('w');
    expect(row.resumeAt).toBeInstanceOf(Date);
    expect(typeof row.workflowJson).toBe('string'); // graph persisted for self-contained resume
  });

  it('resumes a parked run from the wait node to completion', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();
    const runId = 'run_park_2';

    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId, authResolver });
    expect(h.runs.get(runId)!.status).toBe('WAITING');

    const resumed = await engine.resumeRun(runId, authResolver);

    expect(resumed.status).toBe('SUCCEEDED');
    expect(h.sink).toEqual(['AFTER']); // post-wait action ran on resume
    expect(h.runs.get(runId)!.status).toBe('SUCCEEDED');
  });

  it('does not park a wait shorter than its inline threshold', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const wf = longWaitWorkflow();
    (wf.nodes[0] as { wait: { durationMs: number } }).wait.durationMs = 2; // 2ms ≤ 60s threshold
    const r = await new WorkflowEngineService().startRun(wf, {}, { tenantId: 'shop_1', runId: 'run_inline', authResolver });
    expect(r.status).toBe('SUCCEEDED');
    expect(h.sink).toEqual(['AFTER']); // ran inline, no park
  });

  it('does not re-execute a run that is no longer parked', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();
    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId: 'run_done', authResolver });
    // simulate the run having already completed (e.g. a duplicate cron tick)
    h.runs.set('run_done', { ...h.runs.get('run_done'), status: 'SUCCEEDED' });

    const r = await engine.resumeRun('run_done', authResolver);

    expect(r.error).toBe('run is not parked'); // reports it, no-ops
    expect(h.sink).toEqual([]); // post-wait action did NOT run again
  });

  it('reports FAILED when asked to resume an unknown run', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const r = await new WorkflowEngineService().resumeRun('does_not_exist', authResolver);
    expect(r.status).toBe('FAILED');
  });
});

describe('WorkflowEngine — resume sweep (R3.5 durable scheduler)', () => {
  const authResolverFor = () => authResolver;

  it('resumes a WAITING run whose resumeAt is due and skips a future one', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();

    // Park two runs: one due (resumeAt in the past), one not yet due.
    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId: 'due', authResolver });
    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId: 'future', authResolver });
    // Force the "due" run's resumeAt into the past; leave "future" ahead.
    h.runs.set('due', { ...h.runs.get('due'), resumeAt: new Date(Date.now() - 1000) });

    const out = await engine.resumeDueWorkflowRuns({ authResolverFor });

    expect(out.map((o) => o.runId)).toEqual(['due']); // only the due run swept
    expect(out[0]!.status).toBe('SUCCEEDED');
    expect(h.sink).toEqual(['AFTER']); // due run's post-wait action ran
    expect(h.runs.get('due')!.status).toBe('SUCCEEDED');
    expect(h.runs.get('future')!.status).toBe('WAITING'); // untouched
  });

  it('resumes exactly once under two concurrent sweeps (CAS idempotency)', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();
    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId: 'race', authResolver });
    h.runs.set('race', { ...h.runs.get('race'), resumeAt: new Date(Date.now() - 1000) });

    const [a, b] = await Promise.all([
      engine.resumeDueWorkflowRuns({ authResolverFor }),
      engine.resumeDueWorkflowRuns({ authResolverFor }),
    ]);

    // Exactly one sweep claimed+resumed the run; the other saw it already claimed.
    const claimed = [...a, ...b].filter((o) => o.runId === 'race');
    expect(claimed).toHaveLength(1);
    expect(h.sink).toEqual(['AFTER']); // post-wait action ran only once
    expect(h.runs.get('race')!.status).toBe('SUCCEEDED');
  });

  it('re-parks a chained DELAY with a later resumeAt', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();

    // A workflow whose post-wait step is ANOTHER long wait (a chained DELAY).
    const chained: Workflow = {
      ...longWaitWorkflow(),
      id: 'wf-chained-01',
      nodes: [
        { id: 'w', type: 'wait', name: 'Wait 1', wait: { mode: 'duration', durationMs: 7 * 24 * 3600 * 1000, inlineThresholdMs: 60_000 } },
        { id: 'w2', type: 'wait', name: 'Wait 2', wait: { mode: 'duration', durationMs: 7 * 24 * 3600 * 1000, inlineThresholdMs: 60_000 } },
        { id: 'act', type: 'action', name: 'After', action: { provider: 'memory', operation: 'push', inputs: { value: 'AFTER' }, timeoutMs: 1000 } },
        { id: 'done', type: 'end', name: 'Done' },
      ],
      edges: [
        { from: 'w', to: 'w2', label: 'next' },
        { from: 'w2', to: 'act', label: 'next' },
        { from: 'act', to: 'done', label: 'next' },
      ],
    };
    await engine.startRun(chained, {}, { tenantId: 'shop_1', runId: 'chain', authResolver });
    h.runs.set('chain', { ...h.runs.get('chain'), resumeAt: new Date(Date.now() - 1000) });

    const out = await engine.resumeDueWorkflowRuns({ authResolverFor });

    expect(out[0]!.status).toBe('WAITING'); // re-parked on the second wait
    expect(h.sink).toEqual([]); // action still hasn't run
    const row = h.runs.get('chain')!;
    expect(row.status).toBe('WAITING');
    expect(row.resumeNodeId).toBe('w2'); // parked on the chained DELAY now
    expect((row.resumeAt as Date).getTime()).toBeGreaterThan(Date.now()); // later resumeAt
  });

  it('leaves an empty result when nothing is due', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const engine = new WorkflowEngineService();
    await engine.startRun(longWaitWorkflow(), {}, { tenantId: 'shop_1', runId: 'notdue', authResolver });
    // resumeAt is ~7 days out; nothing due now.
    const out = await engine.resumeDueWorkflowRuns({ authResolverFor });
    expect(out).toEqual([]);
    expect(h.runs.get('notdue')!.status).toBe('WAITING');
  });
});
