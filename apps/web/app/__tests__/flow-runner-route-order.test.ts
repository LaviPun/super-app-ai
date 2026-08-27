import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ROUTE_ORDER on the live linear runner (flow-runner.service.ts).
 *
 * Bug: `executeStep`'s if-chain had no ROUTE_ORDER branch, so it fell through to
 * the generic `return { skipped: true, kind: step.kind }` — a silent no-op. A
 * merchant order-routing flow would report SUCCESS on every run without ever
 * moving the fulfillment order (D8: no silent failures).
 *
 * A real order-routing capability already exists (ShopifyConnector's
 * `order.routeToLocation` operation, shopify.connector.ts, via
 * fulfillmentOrderMove) but its only caller is the dead `flowAutomationToWorkflow`
 * bridge (zero callers outside its own test). This test drives the SAME
 * `admin.graphql`-based pattern the linear runner already uses for its other
 * order steps (TAG_ORDER/ADD_ORDER_NOTE), mirroring the mock seam from
 * flow-runner-delay.test.ts: mock RecipeService.parse to hand back a hand-built
 * spec so the runner is exercised directly, independent of whether the current
 * Recipe schema accepts a ROUTE_ORDER step.
 *
 * Also covers the generic fallthrough: ANY unrecognized step kind reaching
 * executeStep must fail the run loudly, never silently skip.
 */

const h = vi.hoisted(() => ({
  currentSpec: null as unknown,
  shopRow: { id: 'shop_1', shopDomain: 'demo.myshopify.com', accessToken: 'tok' } as Record<string, unknown> | null,
  graphqlCalls: [] as Array<{ query: string; variables?: Record<string, unknown> }>,
  fulfillmentOrders: [] as Array<{ id: string; assignedLocation?: { location?: { id?: string } } }>,
  moveUserErrors: [] as Array<{ field?: string[]; message: string }>,
  jobFailCalls: [] as unknown[],
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: {
      findFirst: async () => ({
        id: 'module_flow',
        name: 'Router',
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
    async fail(_id: string, err: unknown) {
      h.jobFailCalls.push(err);
    }
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
    async startRun() {
      return { status: 'WAITING' };
    }
  },
}));

vi.mock('~/services/workflows/connectors/index', () => ({
  getConnector: () => ({
    invoke: async () => ({ ok: true, output: {} }),
  }),
}));

const flowSpec = (steps: unknown[]) => ({
  type: 'flow.automation',
  name: 'Router',
  config: { trigger: 'MANUAL', steps },
});

function makeAdmin() {
  return {
    graphql: async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      h.graphqlCalls.push({ query, variables: opts?.variables });
      if (query.includes('fulfillmentOrders')) {
        return {
          json: async () => ({
            data: { order: { fulfillmentOrders: { nodes: h.fulfillmentOrders } } },
          }),
        };
      }
      if (query.includes('fulfillmentOrderMove')) {
        return {
          json: async () => ({
            data: {
              fulfillmentOrderMove: {
                movedFulfillmentOrder: { id: h.fulfillmentOrders[0]?.id ?? 'gid://shopify/FulfillmentOrder/1' },
                userErrors: h.moveUserErrors,
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected graphql call in test: ${query.slice(0, 60)}`);
    },
  } as never;
}

beforeEach(() => {
  h.graphqlCalls.length = 0;
  h.jobFailCalls.length = 0;
  h.fulfillmentOrders = [
    { id: 'gid://shopify/FulfillmentOrder/1', assignedLocation: { location: { id: 'gid://shopify/Location/1' } } },
  ];
  h.moveUserErrors = [];
  h.shopRow = { id: 'shop_1', shopDomain: 'demo.myshopify.com', accessToken: 'tok' };
});

describe('FlowRunner ROUTE_ORDER', () => {
  it('moves the fulfillment order to the new location via fulfillmentOrderMove (not a silent skip)', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([
      { kind: 'ROUTE_ORDER', newLocationId: 'gid://shopify/Location/9' },
    ]);

    const admin = makeAdmin();
    await new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {
      admin_graphql_api_id: 'gid://shopify/Order/1',
    });

    // The step must have actually invoked the Shopify routing mutation, not
    // silently returned `{ skipped: true, kind: 'ROUTE_ORDER' }`.
    const moveCall = h.graphqlCalls.find(c => c.query.includes('fulfillmentOrderMove'));
    expect(moveCall).toBeTruthy();
    expect(moveCall!.variables).toMatchObject({
      id: 'gid://shopify/FulfillmentOrder/1',
      newLocationId: 'gid://shopify/Location/9',
    });
    expect(h.jobFailCalls).toHaveLength(0);
  });

  it('fails the run loudly when the destination userErrors come back non-empty', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([
      { kind: 'ROUTE_ORDER', newLocationId: 'gid://shopify/Location/9' },
    ]);
    h.moveUserErrors = [{ message: 'Location is not stocked for this order' }];

    const admin = makeAdmin();
    await expect(
      new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {
        admin_graphql_api_id: 'gid://shopify/Order/1',
      }),
    ).rejects.toThrow(/Location is not stocked/);
    expect(h.jobFailCalls).toHaveLength(1);
  });

  it('fails loudly (not a silent skip) when the step is missing newLocationId', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([{ kind: 'ROUTE_ORDER' }]);

    const admin = makeAdmin();
    await expect(
      new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {
        admin_graphql_api_id: 'gid://shopify/Order/1',
      }),
    ).rejects.toThrow(/newLocationId/);
  });

  it('fails the whole run loudly for ANY unrecognized step kind — never a silent skip', async () => {
    const { FlowRunnerService } = await import('~/services/flows/flow-runner.service');
    h.currentSpec = flowSpec([{ kind: 'SOME_FUTURE_STEP_KIND_NOBODY_IMPLEMENTED' }]);

    const admin = makeAdmin();
    await expect(
      new FlowRunnerService().runFlowById('demo.myshopify.com', admin, 'module_flow', {}),
    ).rejects.toThrow(/SOME_FUTURE_STEP_KIND_NOBODY_IMPLEMENTED/);
    expect(h.jobFailCalls).toHaveLength(1);
  });
});
