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
