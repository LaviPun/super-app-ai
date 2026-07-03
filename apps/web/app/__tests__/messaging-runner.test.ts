import { describe, it, expect, vi } from 'vitest';
import type { Connector } from '@superapp/core';
import {
  MessagingRunnerService,
  triggerMatches,
  renderMergeVars,
  recordMatchesRuleEngine,
  type MessagingTrigger,
} from '~/services/messaging/messaging-runner.service';
import type { DataStoreService } from '~/services/data/data-store.service';
import type { JobService } from '~/services/jobs/job.service';

/**
 * The make-or-break runtime: bounded fan-out over a resolved audience, using the
 * SAME connector.invoke the live SEND_EMAIL_NOTIFICATION step makes. sms/push are
 * refused loudly (no connector call). Everything is DI-mocked (no DB, no network).
 */

type FakeConnector = Connector & { invoke: ReturnType<typeof vi.fn> };

function fakeEmailConnector(result: { ok: boolean; message?: string } = { ok: true }): FakeConnector {
  return {
    manifest: () => ({}) as never,
    validate: () => ({ ok: true }),
    invoke: vi.fn(async () =>
      result.ok
        ? ({ ok: true, output: { messageId: 'm1', accepted: true } } as never)
        : ({ ok: false, code: 'UPSTREAM', message: result.message ?? 'boom', retryable: false } as never),
    ),
  };
}

function makeCampaignSpec(config: Record<string, unknown>) {
  return JSON.stringify({
    type: 'messaging.campaign',
    name: 'Test Campaign',
    category: 'INTEGRATION',
    requires: [],
    config,
  });
}

function fakeModule(config: Record<string, unknown>, opts: { status?: string } = {}) {
  return {
    id: 'mod_1',
    name: 'Test Campaign',
    type: 'messaging.campaign',
    status: opts.status ?? 'PUBLISHED',
    activeVersionId: 'v1',
    activeVersion: { specJson: makeCampaignSpec(config) },
  };
}

function fakePrisma(opts: {
  modules?: unknown[];
  moduleFindFirst?: unknown;
}) {
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

function fakeDataStore(records: Array<Record<string, unknown>>, total?: number): DataStoreService {
  return {
    listRecords: vi.fn(async () => ({
      storeId: 's',
      storeKey: 'waitlist',
      label: 'Waitlist',
      total: total ?? records.length,
      records: records.map((payload, i) => ({
        id: `r${i}`,
        externalId: null,
        title: `rec ${i}`,
        payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    })),
    getStoreByKey: vi.fn(async () => ({ id: 's', key: 'waitlist' })),
    updateRecord: vi.fn(async () => ({})),
  } as unknown as DataStoreService;
}

/** A durable-scheduler seam that records park calls without touching the DB. */
function fakeEngine() {
  const startRun = vi.fn(async () => ({ status: 'WAITING' as const }));
  return { engine: { startRun } as never, startRun };
}

const EMAIL_BROADCAST = {
  channel: 'email',
  trigger: { kind: 'broadcast' },
  audience: { source: 'data_store', storeKey: 'waitlist', addressField: 'email', recipients: [] },
  templates: [{ channel: 'email', subject: 'Hi {{record.first_name}}', body: 'Hello {{record.first_name}}' }],
  batchSize: 200,
  respectConsent: true,
};

const admin = null as never;

describe('triggerMatches', () => {
  const cfg = (t: Record<string, unknown>) => ({ trigger: t }) as never;

  it('broadcast matches MANUAL and SCHEDULED, not webhooks', () => {
    expect(triggerMatches(cfg({ kind: 'broadcast' }), 'MANUAL', {})).toBe(true);
    expect(triggerMatches(cfg({ kind: 'broadcast' }), 'SCHEDULED', {})).toBe(true);
    expect(triggerMatches(cfg({ kind: 'broadcast' }), 'SHOPIFY_WEBHOOK_ORDER_CREATED', {})).toBe(false);
  });

  it('event matches its configured event only', () => {
    const c = cfg({ kind: 'event', event: 'SHOPIFY_WEBHOOK_ORDER_CREATED' });
    expect(triggerMatches(c, 'SHOPIFY_WEBHOOK_ORDER_CREATED', {})).toBe(true);
    expect(triggerMatches(c, 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', {})).toBe(false);
  });

  it('back_in_stock matches product/update only, guarded by inventory cross', () => {
    const c = cfg({ kind: 'back_in_stock' });
    expect(triggerMatches(c, 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { variants: [{ inventory_quantity: 5 }] })).toBe(true);
    expect(triggerMatches(c, 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { variants: [{ inventory_quantity: 0 }] })).toBe(false);
    expect(triggerMatches(c, 'SHOPIFY_WEBHOOK_ORDER_CREATED', { variants: [{ inventory_quantity: 5 }] })).toBe(false);
  });
});

describe('renderMergeVars', () => {
  it('substitutes {{record.*}} and {{event.*}} dot-paths', () => {
    const out = renderMergeVars('Hi {{record.first_name}} — order {{event.name}}', {
      record: { first_name: 'Sam' },
      event: { name: '#1001' },
    });
    expect(out).toBe('Hi Sam — order #1001');
  });
  it('renders missing vars as empty', () => {
    expect(renderMergeVars('X{{record.missing}}Y', { record: {}, event: {} })).toBe('XY');
  });
});

describe('MessagingRunnerService — fan-out', () => {
  it('resolves N DataStore records → N connector.invoke calls with correct to/subject/body', async () => {
    const email = fakeEmailConnector();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(EMAIL_BROADCAST)] }),
      dataStore: fakeDataStore([
        { email: 'a@x.com', first_name: 'Ana' },
        { email: 'b@x.com', first_name: 'Bo' },
      ]),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
    });

    const results = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    const result = results[0]!;
    expect(email.invoke).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    const firstCall = email.invoke.mock.calls[0]![1];
    expect(firstCall.inputs.to).toBe('a@x.com');
    expect(firstCall.inputs.subject).toBe('Hi Ana');
    expect(firstCall.inputs.body).toBe('Hello Ana');
  });

  it('respectConsent skips falsy-consent records', async () => {
    const email = fakeEmailConnector();
    const cfg = { ...EMAIL_BROADCAST, audience: { ...EMAIL_BROADCAST.audience, consentField: 'consent' } };
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(cfg)] }),
      dataStore: fakeDataStore([
        { email: 'a@x.com', first_name: 'Ana', consent: true },
        { email: 'b@x.com', first_name: 'Bo', consent: false },
      ]),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
    });

    const results = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    const result = results[0]!;
    expect(email.invoke).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('batchSize caps the run and records total (paging gap visible, not truncated-as-success)', async () => {
    const email = fakeEmailConnector();
    const cfg = { ...EMAIL_BROADCAST, batchSize: 1 };
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(cfg)] }),
      // 3 available, but listRecords honors limit:batchSize → returns 1; total reflects 3.
      dataStore: fakeDataStore([{ email: 'a@x.com', first_name: 'Ana' }], 3),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
    });

    const results = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    const result = results[0]!;
    expect(result.sent).toBe(1);
    expect(result.total).toBe(3);
    expect(result.paged).toBe(true);
    // Cross-run paging: the remainder is parked on the durable scheduler.
    expect(eng.startRun).toHaveBeenCalledTimes(1);
    expect(result.parkedNextOffset).toBe(1);
  });

  it('a per-recipient connector failure is counted, run continues', async () => {
    const email = fakeEmailConnector({ ok: false, message: 'rejected' });
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(EMAIL_BROADCAST)] }),
      dataStore: fakeDataStore([
        { email: 'a@x.com', first_name: 'Ana' },
        { email: 'b@x.com', first_name: 'Bo' },
      ]),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
    });

    const results = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    const result = results[0]!;
    expect(email.invoke).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(2);
  });
});

describe('MessagingRunnerService — channel gate (never fakes a send)', () => {
  it("channel:'sms' throws and never calls a connector", async () => {
    const email = fakeEmailConnector();
    const smsCfg = {
      ...EMAIL_BROADCAST,
      channel: 'sms',
      templates: [{ channel: 'sms', body: 'txt' }],
    };
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(smsCfg) }),
      dataStore: fakeDataStore([{ email: 'a@x.com' }]),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
    });

    await expect(
      runner.runCampaignById('test.myshopify.com', admin, 'mod_1', {}),
    ).rejects.toThrow(/no shipped runtime/);
    expect(email.invoke).not.toHaveBeenCalled();
  });
});

describe('MessagingRunnerService — runCampaignById (admin Send now / test)', () => {
  it('throws on a non-PUBLISHED campaign (Send now guard)', async () => {
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST, { status: 'DRAFT' }) }),
      dataStore: fakeDataStore([]),
      jobs: fakeJobs(),
      getConnector: () => fakeEmailConnector() as unknown as Connector,
    });
    await expect(runner.runCampaignById('test.myshopify.com', admin, 'mod_1', {})).rejects.toThrow(/not published/);
  });

  it('Send test forces a single literal recipient (no list blast)', async () => {
    const email = fakeEmailConnector();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST) }),
      // The data store would return many, but a test must ignore it entirely.
      dataStore: fakeDataStore([{ email: 'list1@x.com' }, { email: 'list2@x.com' }]),
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
    });

    const result = await runner.runCampaignById('test.myshopify.com', admin, 'mod_1', {}, {
      testRecipient: 'me@x.com',
    });
    expect(email.invoke).toHaveBeenCalledTimes(1);
    expect(email.invoke.mock.calls[0]![1].inputs.to).toBe('me@x.com');
    expect(result.sent).toBe(1);
  });
});

describe('recordMatchesRuleEngine', () => {
  it('passes a record when the rule-engine is disabled/absent', () => {
    expect(recordMatchesRuleEngine({ enabled: false, logic: 'AND', groups: [], matchAction: 'SHOW', onUnresolved: 'defer' } as never, { x: 1 })).toBe(true);
  });
});
