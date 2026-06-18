import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connector, Workflow, AuthContext } from '@superapp/core';

/**
 * Engine safety caps: a flow that would execute a runaway number of nodes is failed
 * with SAFETY_LIMIT rather than looping/regressing. (The DAG is acyclic so true
 * back-edges are impossible; this guards against a pathologically large loop.)
 */

const h = vi.hoisted(() => {
  const registry = new Map<string, Connector>();
  const noop: Connector = {
    manifest: () => ({ provider: 'noop', displayName: 'Noop', version: '1.0.0', auth: { type: 'none' }, operations: [] }),
    validate: () => ({ ok: true }),
    invoke: async (_a, req) => ({ ok: true, output: { ...req.inputs } }),
  };
  registry.set('noop', noop);
  return { registry };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    workflowRun: { create: async () => ({}), update: async () => ({}), findUnique: async () => null },
    workflowRunStep: { create: async () => ({}) },
  }),
}));
vi.mock('~/services/workflows/connectors/index', () => ({ getConnectorRegistry: () => h.registry }));

const authResolver = async (): Promise<AuthContext> => ({ type: 'none' });

describe('WorkflowEngine — safety caps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails a runaway loop with SAFETY_LIMIT instead of running forever', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    // 20000 iterations × a body node would blow past the 10k node-execution cap.
    const items = Array.from({ length: 20_000 }, (_, i) => i);
    const wf: Workflow = {
      id: 'wf-runaway-1', version: 1, name: 'Runaway', status: 'active', tenantId: 'shop_1',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        { id: 'loop1', type: 'loop', name: 'Each', loop: { items, itemVar: 'it', indexVar: 'i', maxIterations: 100000, mode: 'serial', concurrency: 1 } },
        { id: 'body', type: 'action', name: 'Body', action: { provider: 'noop', operation: 'x', inputs: {}, timeoutMs: 1000 } },
        { id: 'done', type: 'end', name: 'Done' },
      ],
      edges: [
        { from: 'loop1', to: 'body', label: 'loop' },
        { from: 'body', to: 'done', label: 'next' },
        { from: 'loop1', to: 'done', label: 'next' },
      ],
    };
    const r = await new WorkflowEngineService().startRun(wf, {}, { tenantId: 'shop_1', runId: 'run_runaway', authResolver });
    expect(r.status).toBe('FAILED');
    expect(r.error).toMatch(/SAFETY_LIMIT/);
  });

  it('runs a normal small loop to completion (cap not tripped)', async () => {
    const { WorkflowEngineService } = await import('~/services/workflows/workflow-engine.service');
    const wf: Workflow = {
      id: 'wf-ok-1', version: 1, name: 'OK', status: 'active', tenantId: 'shop_1',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        { id: 'loop1', type: 'loop', name: 'Each', loop: { items: [1, 2, 3], itemVar: 'it', indexVar: 'i', maxIterations: 100, mode: 'serial', concurrency: 1 } },
        { id: 'body', type: 'action', name: 'Body', action: { provider: 'noop', operation: 'x', inputs: {}, timeoutMs: 1000 } },
        { id: 'done', type: 'end', name: 'Done' },
      ],
      edges: [
        { from: 'loop1', to: 'body', label: 'loop' },
        { from: 'body', to: 'done', label: 'next' },
        { from: 'loop1', to: 'done', label: 'next' },
      ],
    };
    const r = await new WorkflowEngineService().startRun(wf, {}, { tenantId: 'shop_1', runId: 'run_ok', authResolver });
    expect(r.status).toBe('SUCCEEDED');
  });
});
