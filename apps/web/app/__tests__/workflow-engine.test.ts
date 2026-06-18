import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connector, Workflow, AuthContext } from '@superapp/core';

// ── shared test sink + a memory connector (hoisted for vi.mock) ──────────────
const h = vi.hoisted(() => {
  const sink: unknown[] = [];
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
  return { sink, registry };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    workflowRun: { create: async () => ({}), update: async () => ({}) },
    workflowRunStep: { create: async () => ({}) },
  }),
}));

vi.mock('~/services/workflows/connectors/index', () => ({
  getConnectorRegistry: () => h.registry,
}));

const baseWorkflow = (over: Partial<Workflow>): Workflow => ({
  id: 'wf-test-0001',
  version: 1,
  name: 'Test',
  status: 'active',
  tenantId: 'shop_1',
  trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
  nodes: [],
  edges: [],
  ...over,
});

const authResolver = async (): Promise<AuthContext> => ({ type: 'none' });

async function run(workflow: Workflow, payload: Record<string, unknown> = {}) {
  const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
  return new WorkflowEngineService().startRun(workflow, payload, {
    tenantId: 'shop_1',
    runId: `run_${Math.random().toString(36).slice(2)}`,
    authResolver,
  });
}

beforeEach(() => {
  h.sink.length = 0;
});

describe('WorkflowEngine — switch (multi-branch)', () => {
  const wf = baseWorkflow({
    nodes: [
      { id: 'sw', type: 'switch', name: 'Tier', switchOn: { on: { $ref: '$.trigger.payload.tier' } } },
      { id: 'gold', type: 'transform', name: 'Gold', transform: { assign: { picked: 'GOLD' } } },
      { id: 'silver', type: 'transform', name: 'Silver', transform: { assign: { picked: 'SILVER' } } },
      { id: 'other', type: 'transform', name: 'Other', transform: { assign: { picked: 'OTHER' } } },
      { id: 'done', type: 'end', name: 'Done' },
    ],
    edges: [
      { from: 'sw', to: 'gold', label: 'case:gold' },
      { from: 'sw', to: 'silver', label: 'case:silver' },
      { from: 'sw', to: 'other', label: 'default' },
      { from: 'gold', to: 'done', label: 'next' },
      { from: 'silver', to: 'done', label: 'next' },
      { from: 'other', to: 'done', label: 'next' },
    ],
  });

  it('routes to the matching case', async () => {
    const r = await run(wf, { tier: 'silver' });
    expect(r.status).toBe('SUCCEEDED');
    expect(r.context?.vars.picked).toBe('SILVER');
  });

  it('routes to default when no case matches', async () => {
    const r = await run(wf, { tier: 'bronze' });
    expect(r.context?.vars.picked).toBe('OTHER');
  });
});

describe('WorkflowEngine — loop (for-each)', () => {
  const wf = baseWorkflow({
    nodes: [
      { id: 'loop1', type: 'loop', name: 'Each item', loop: { items: { $ref: '$.trigger.payload.items' }, itemVar: 'item', indexVar: 'i', maxIterations: 100, mode: 'serial', concurrency: 1 } },
      { id: 'push', type: 'action', name: 'Push', action: { provider: 'memory', operation: 'push', inputs: { value: { $ref: '$.vars.item' } }, timeoutMs: 1000 } },
      { id: 'done', type: 'end', name: 'Done' },
    ],
    edges: [
      { from: 'loop1', to: 'push', label: 'loop' },
      { from: 'push', to: 'done', label: 'next' },
      { from: 'loop1', to: 'done', label: 'next' },
    ],
  });

  it('executes the body once per item, in order', async () => {
    const r = await run(wf, { items: [10, 20, 30] });
    expect(r.status).toBe('SUCCEEDED');
    expect(h.sink).toEqual([10, 20, 30]);
  });

  it('handles an empty array (zero iterations)', async () => {
    const r = await run(wf, { items: [] });
    expect(r.status).toBe('SUCCEEDED');
    expect(h.sink).toEqual([]);
  });
});

describe('WorkflowEngine — parallel (fan-out / join)', () => {
  const wf = baseWorkflow({
    nodes: [
      { id: 'par', type: 'parallel', name: 'Fan out', parallel: { join: 'all', maxConcurrency: 10 } },
      { id: 'a', type: 'action', name: 'A', action: { provider: 'memory', operation: 'push', inputs: { value: 'A' }, timeoutMs: 1000 } },
      { id: 'b', type: 'action', name: 'B', action: { provider: 'memory', operation: 'push', inputs: { value: 'B' }, timeoutMs: 1000 } },
      { id: 'done', type: 'end', name: 'Done' },
    ],
    edges: [
      { from: 'par', to: 'a', label: 'branch' },
      { from: 'par', to: 'b', label: 'branch' },
      { from: 'a', to: 'done', label: 'next' },
      { from: 'b', to: 'done', label: 'next' },
      { from: 'par', to: 'done', label: 'next' },
    ],
  });

  it('runs every branch then joins', async () => {
    const r = await run(wf);
    expect(r.status).toBe('SUCCEEDED');
    expect(h.sink.sort()).toEqual(['A', 'B']);
  });
});

describe('WorkflowEngine — wait + arithmetic transform', () => {
  it('waits a short duration then computes a value', async () => {
    const wf = baseWorkflow({
      nodes: [
        { id: 'w', type: 'wait', name: 'Wait', wait: { mode: 'duration', durationMs: 1, inlineThresholdMs: 60000 } },
        { id: 't', type: 'transform', name: 'Discount', transform: { assign: { final: { op: 'multiply', args: [{ $ref: '$.trigger.payload.total' }, 0.9] } } } },
        { id: 'done', type: 'end', name: 'Done' },
      ],
      edges: [
        { from: 'w', to: 't', label: 'next' },
        { from: 't', to: 'done', label: 'next' },
      ],
    });
    const r = await run(wf, { total: 200 });
    expect(r.status).toBe('SUCCEEDED');
    expect(r.context?.vars.final).toBe(180);
  });
});
