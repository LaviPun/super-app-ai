import { describe, it, expect, vi } from 'vitest';
import type { Connector } from '@superapp/core';
import {
  MessagingRunnerService,
  triggerMatches,
  dripEntryMatches,
} from '~/services/messaging/messaging-runner.service';
import {
  parkMessagingDripStepWorkflow,
  messagingDripRunId,
  type MessagingDripInputs,
} from '~/services/messaging/messaging-drip-park';
import type { DataStoreService } from '~/services/data/data-store.service';
import type { JobService } from '~/services/jobs/job.service';

/**
 * Multi-step DRIP (build #7b) on the R3.5 durable scheduler. The entry step fires on
 * the preset trigger and parks the next step; runDripStep delivers a step and parks
 * the one after; the last step parks nothing. Consent is enforced on every step.
 * Everything is DI-mocked — no DB, no network.
 */

type FakeConnector = Connector & { invoke: ReturnType<typeof vi.fn> };

function fakeOkConnector(): FakeConnector {
  return {
    manifest: () => ({}) as never,
    validate: () => ({ ok: true }),
    invoke: vi.fn(async () => ({ ok: true, output: { messageId: 'm1' } }) as never),
  };
}

function makeCampaignSpec(config: Record<string, unknown>) {
  return JSON.stringify({ type: 'messaging.campaign', name: 'Post-purchase drip', category: 'INTEGRATION', requires: [], config });
}

function fakeModule(config: Record<string, unknown>, opts: { status?: string } = {}) {
  return {
    id: 'mod_1',
    name: 'Post-purchase drip',
    type: 'messaging.campaign',
    status: opts.status ?? 'PUBLISHED',
    activeVersionId: 'v1',
    activeVersion: { specJson: makeCampaignSpec(config) },
  };
}

function fakePrisma(opts: { modules?: unknown[]; moduleFindFirst?: unknown }) {
  return {
    module: {
      findMany: vi.fn(async () => opts.modules ?? []),
      findFirst: vi.fn(async () => opts.moduleFindFirst ?? null),
    },
    shop: { findUnique: vi.fn(async () => ({ id: 'shop_1', shopDomain: 'test.myshopify.com' })) },
    flowStepLog: { create: vi.fn(async () => ({})) },
  } as never;
}

function fakeJobs(): JobService {
  return {
    create: vi.fn(async () => ({ id: 'job_1' })),
    start: vi.fn(async () => ({})),
    succeed: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
  } as unknown as JobService;
}

function fakeDataStore(): DataStoreService {
  return {
    listRecords: vi.fn(async () => ({ storeId: 's', storeKey: 'k', label: 'L', total: 0, records: [] })),
    getStoreByKey: vi.fn(async () => ({ id: 's', key: 'k' })),
    updateRecord: vi.fn(async () => ({})),
  } as unknown as DataStoreService;
}

function fakeEngine() {
  const startRun = vi.fn(async () => ({ status: 'WAITING' as const }));
  return { engine: { startRun } as never, startRun };
}

const admin = null as never;

const POST_PURCHASE_DRIP = {
  channel: 'email',
  trigger: {
    kind: 'drip',
    dripPreset: 'post_purchase',
    steps: [
      { label: 'thank you' }, // step 0 — entry
      { delayMs: 3 * 24 * 3600_000, label: 'cross-sell' }, // step 1
      { delayMs: 7 * 24 * 3600_000, label: 'review request' }, // step 2
    ],
  },
  audience: { source: 'event_recipient', recipients: [] },
  templates: [{ channel: 'email', subject: 'Thanks {{event.customer.first_name}}', body: 'Enjoy your order' }],
  batchSize: 200,
  respectConsent: false, // exercised separately; keep the timing test focused
};

// The person on the entry event (event_recipient).
const ORDER_EVENT = { customer: { email: 'buyer@x.com', first_name: 'Ana' }, id: 12345 };

describe('dripEntryMatches / triggerMatches — drip entry', () => {
  it('post_purchase enters on order/create', () => {
    expect(dripEntryMatches('post_purchase', 'SHOPIFY_WEBHOOK_ORDER_CREATED', {})).toBe(true);
    expect(dripEntryMatches('post_purchase', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', {})).toBe(false);
  });

  it('browse_abandon enters on a captured data record', () => {
    expect(dripEntryMatches('browse_abandon', 'SUPERAPP_DATA_RECORD_CREATED', {})).toBe(true);
  });

  it('back_in_stock drip keeps the inventory-cross guard', () => {
    expect(dripEntryMatches('back_in_stock', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { variants: [{ inventory_quantity: 3 }] })).toBe(true);
    expect(dripEntryMatches('back_in_stock', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { variants: [{ inventory_quantity: 0 }] })).toBe(false);
  });

  it('triggerMatches routes a drip campaign to its entry', () => {
    const cfg = { trigger: POST_PURCHASE_DRIP.trigger } as never;
    expect(triggerMatches(cfg, 'SHOPIFY_WEBHOOK_ORDER_CREATED', ORDER_EVENT)).toBe(true);
    expect(triggerMatches(cfg, 'SCHEDULED', {})).toBe(false);
  });
});

describe('drip park helper', () => {
  it('builds an idempotent per-step runId', () => {
    const a = messagingDripRunId({ moduleId: 'mod_1', dripToken: 'tok', stepIndex: 1 });
    const b = messagingDripRunId({ moduleId: 'mod_1', dripToken: 'tok', stepIndex: 1 });
    const c = messagingDripRunId({ moduleId: 'mod_1', dripToken: 'tok', stepIndex: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('compiles a wait → messaging.sendDripStep → end workflow', () => {
    const wf = parkMessagingDripStepWorkflow({
      shopId: 'shop_1',
      moduleId: 'mod_1',
      campaignName: 'Drip',
      stepIndex: 1,
      dripToken: 'tok',
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      entryEvent: ORDER_EVENT,
      resumeAt: new Date(Date.now() + 1000),
    });
    const wait = wf.nodes.find((n) => n.id === 'wait')!;
    const send = wf.nodes.find((n) => n.id === 'send_step')!;
    expect(wait.wait?.mode).toBe('until');
    expect(send.action?.provider).toBe('messaging');
    expect(send.action?.operation).toBe('sendDripStep');
    const vars = wf.variables?.__drip as unknown as MessagingDripInputs;
    expect(vars.stepIndex).toBe(1);
    expect(vars.dripToken).toBe('tok');
  });
});

describe('MessagingRunnerService — drip sequence', () => {
  it('entry send delivers step 0 and parks step 1', async () => {
    const email = fakeOkConnector();
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(POST_PURCHASE_DRIP)] }),
      dataStore: fakeDataStore(),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const results = await runner.runForTrigger('test.myshopify.com', admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', ORDER_EVENT);
    const result = results[0]!;
    expect(email.invoke).toHaveBeenCalledTimes(1); // step 0 entry
    expect(result.sent).toBe(1);
    // Step 1 parked on the durable scheduler.
    expect(eng.startRun).toHaveBeenCalledTimes(1);
  });

  it('runDripStep delivers a middle step and parks the next', async () => {
    const email = fakeOkConnector();
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(POST_PURCHASE_DRIP) }),
      dataStore: fakeDataStore(),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const out = await runner.runDripStep('test.myshopify.com', 'mod_1', {
      stepIndex: 1,
      dripToken: 'tok',
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      entryEvent: ORDER_EVENT,
    });
    expect(email.invoke).toHaveBeenCalledTimes(1); // step 1 delivered
    expect(out.sent).toBe(1);
    expect(out.parkedNextStep).toBe(2); // step 2 parked
    expect(eng.startRun).toHaveBeenCalledTimes(1);
  });

  it('runDripStep on the LAST step delivers it and parks nothing', async () => {
    const email = fakeOkConnector();
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(POST_PURCHASE_DRIP) }),
      dataStore: fakeDataStore(),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const out = await runner.runDripStep('test.myshopify.com', 'mod_1', {
      stepIndex: 2, // last step
      dripToken: 'tok',
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      entryEvent: ORDER_EVENT,
    });
    expect(email.invoke).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(1);
    expect(out.parkedNextStep).toBeUndefined();
    expect(eng.startRun).not.toHaveBeenCalled();
  });
});
