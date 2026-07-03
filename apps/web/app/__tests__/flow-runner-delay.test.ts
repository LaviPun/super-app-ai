import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R3.5 durable scheduler — the linear runner's DELAY behaviour (flow-runner.service.ts).
 *
 * Drives the public `runFlowById` with an in-memory prisma + mocked JobService,
 * RecipeService, connectors, engine, and auth resolver. Asserts:
 *  - a long DELAY parks the REMAINDER into a WorkflowRun and stops the linear run
 *    (post-DELAY step does NOT run inline);
 *  - a short DELAY sleeps inline and the run continues in-pass;
 *  - a trailing DELAY does not park;
 *  - a redelivery (P2002 on the idempotent runId) does not double-park;
 *  - a missing shopId fails the step loudly.
 */

const h = vi.hoisted(() => ({
  emailSends: [] as unknown[],
  tagSends: [] as unknown[],
  startRunCalls: [] as Array<{ workflow: unknown; runId: string }>,
  startRunImpl: null as null | (() => Promise<unknown>),
  currentSpec: null as unknown,
  shopRow: { id: 'shop_1', shopDomain: 'demo.myshopify.com', accessToken: 'tok' } as Record<string, unknown> | null,
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: {
      findFirst: async () => ({
        id: 'module_flow',
        name: 'Dunning',
        type: 'flow.automation',
        status: 'PUBLISHED',
        activeVersion: { specJson: '{}' },
      }),
      findMany: async () => [],
    },
    shop: {
      findUnique: async () => h.shopRow,
      findFirst: async () => h.shopRow,
    },
    flowStepLog: { create: async () => ({}) },
  }),
}));

vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse() {
      return h.currentSpec;
    }
  },
}));

vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    async create() {
      return { id: 'job_1' };
    }
    async start() {}
    async succeed() {}
    async fail() {}
  },
}));

vi.mock('~/services/workflows/shopify-flow-bridge', () => ({
  emitFlowTriggerSafe: () => undefined,
  FLOW_TRIGGER_TOPICS: { WORKFLOW_COMPLETED: 'c', WORKFLOW_FAILED: 'f' },
}));

vi.mock('~/services/flows/auth-resolver.server', () => ({
  buildShopAuthResolver: () => async () => ({ type: 'none' }),
}));

vi.mock('~/services/workflows/workflow-engine.service', () => ({
  WorkflowEngineService: class {
    async startRun(workflow: unknown, _payload: unknown, opts: { runId: string }) {
      h.startRunCalls.push({ workflow, runId: opts.runId });
      if (h.startRunImpl) return h.startRunImpl();
      return { status: 'WAITING' };
    }
  },
}));

vi.mock('~/services/workflows/connectors/index', () => ({
  getConnector: (provider: string) => ({
    invoke: async (_auth: unknown, req: { operation: string; inputs: unknown }) => {
      if (provider === 'email') h.emailSends.push(req.inputs);
      return { ok: true, output: { echoed: true } };
    },
  }),
}));

const flowSpec = (steps: unknown[]) => ({
  type: 'flow.automation',
  name: 'Dunning',
  config: { trigger: 'MANUAL', steps },
});

const admin = {
  graphql: async () => ({ json: async () => ({ data: { tagsAdd: { userErrors: [] } } }) }),
} as never;

beforeEach(() => {
  h.emailSends.length = 0;
  h.tagSends.length = 0;
  h.startRunCalls.length = 0;
  h.startRunImpl = null;
  h.shopRow = { id: 'shop_1', shopDomain: 'demo.myshopify.com', accessToken: 'tok' };
});

describe('FlowRunner DELAY (R3.5)', () => {
  it('parks the remainder on a long DELAY; post-DELAY step does NOT run inline', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Payment issue', body: 'retry' },
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
      { kind: 'TAG_CUSTOMER', tag: 'dunning-lapsed' },
    ]);

    await new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {
      customer: { admin_graphql_api_id: 'gid://shopify/Customer/1' },
    });

    expect(h.emailSends).toHaveLength(1); // email ran inline
    expect(h.startRunCalls).toHaveLength(1); // remainder parked as a WorkflowRun
    expect(h.startRunCalls[0]!.runId).toBe('flowpark_job_1_1'); // idempotent runId (jobId + stepIdx)
    // The parked workflow carries only the remainder (the TAG_CUSTOMER step).
    const wf = h.startRunCalls[0]!.workflow as { nodes: Array<{ id: string; name: string; type: string }> };
    expect(wf.nodes.map((n) => n.id)).toEqual(['wait', 'body_0', 'end']);
    expect(wf.nodes.find((n) => n.id === 'body_0')!.name).toBe('TAG_CUSTOMER');
  });

  it('sleeps inline on a short DELAY and runs the whole flow in one pass', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Hi', body: 'x' },
      { kind: 'DELAY', mode: 'duration', durationMs: 5 }, // ≤ threshold ⇒ inline
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'c@d.com', subject: 'Bye', body: 'y' },
    ]);

    await new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {});

    expect(h.startRunCalls).toHaveLength(0); // no park
    expect(h.emailSends).toHaveLength(2); // both emails ran in the same pass
  });

  it('does not park a trailing DELAY (nothing to resume)', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([
      { kind: 'SEND_EMAIL_NOTIFICATION', to: 'a@b.com', subject: 'Hi', body: 'x' },
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
    ]);

    await new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {});

    expect(h.startRunCalls).toHaveLength(0); // trailing delay ⇒ no park
    expect(h.emailSends).toHaveLength(1);
  });

  it('swallows a P2002 (redelivery) without double-parking or failing the run', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.startRunImpl = async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    };
    h.currentSpec = flowSpec([
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
      { kind: 'TAG_CUSTOMER', tag: 't' },
    ]);

    // Must NOT throw — the duplicate park is treated as already-parked.
    await expect(
      new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {}),
    ).resolves.toBeTruthy();
    expect(h.startRunCalls).toHaveLength(1); // attempted once, swallowed
  });

  it('fails the DELAY step loudly when the shop (tenant) is missing', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.shopRow = null; // no shop row ⇒ no shopId to park against
    h.currentSpec = flowSpec([
      { kind: 'DELAY', mode: 'duration', durationMs: 3 * 24 * 3600_000 },
      { kind: 'TAG_CUSTOMER', tag: 't' },
    ]);

    await expect(
      new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {}),
    ).rejects.toThrow(/shopId/);
    expect(h.startRunCalls).toHaveLength(0); // never parked
  });
});
