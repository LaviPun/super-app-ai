import { describe, it, expect, vi } from 'vitest';
import type { Connector } from '@superapp/core';
import {
  MessagingRunnerService,
  deriveRunToken,
  recipientAlreadySent,
  isPageableSource,
} from '~/services/messaging/messaging-runner.service';
import {
  parkMessagingPageWorkflow,
  messagingPageRunId,
  type MessagingPageInputs,
} from '~/services/messaging/messaging-page-park';
import type { DataStoreService } from '~/services/data/data-store.service';
import type { JobService } from '~/services/jobs/job.service';

/**
 * Cross-run PAGING (R3.4 on the R3.5 durable scheduler). A >1-batch audience parks
 * the remainder; the sweep sends the next page; a double-resume never double-sends;
 * a single-batch audience never parks. Everything is DI-mocked — no DB, no network.
 */

type FakeConnector = Connector & { invoke: ReturnType<typeof vi.fn> };

function fakeEmailConnector(result: { ok: boolean; message?: string } = { ok: true }): FakeConnector {
  return {
    manifest: () => ({}) as never,
    validate: () => ({ ok: true }),
    invoke: vi.fn(async () =>
      result.ok
        ? ({ ok: true, output: { messageId: 'm1' } } as never)
        : ({ ok: false, code: 'UPSTREAM', message: result.message ?? 'boom', retryable: false } as never),
    ),
  };
}

function makeCampaignSpec(config: Record<string, unknown>) {
  return JSON.stringify({ type: 'messaging.campaign', name: 'Waitlist Blast', category: 'INTEGRATION', requires: [], config });
}

function fakeModule(config: Record<string, unknown>, opts: { status?: string } = {}) {
  return {
    id: 'mod_1',
    name: 'Waitlist Blast',
    type: 'messaging.campaign',
    status: opts.status ?? 'PUBLISHED',
    activeVersionId: 'v1',
    activeVersion: { specJson: makeCampaignSpec(config) },
  };
}

/**
 * Fix round (Critical #1): a durable in-memory MessagingRecipientSent store,
 * mirroring the real table's create()+P2002 idempotency and
 * findUnique-by-compound-key lookup — so the literal/event_recipient dedupe
 * guard (recipientAlreadySentDurable/markRecipientSent) can be exercised
 * end-to-end without a real DB.
 */
function memoryRecipientSentStore() {
  const marks = new Set<string>(); // `${runToken}::${recipientKey}`
  const findUnique = vi.fn(async ({ where }: { where: { runToken_recipientKey: { runToken: string; recipientKey: string } } }) => {
    const key = `${where.runToken_recipientKey.runToken}::${where.runToken_recipientKey.recipientKey}`;
    return marks.has(key) ? { id: key } : null;
  });
  const create = vi.fn(async ({ data }: { data: { runToken: string; recipientKey: string } }) => {
    const key = `${data.runToken}::${data.recipientKey}`;
    if (marks.has(key)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    marks.add(key);
    return { id: key, ...data, sentAt: new Date() };
  });
  return { findUnique, create, marks };
}

function fakePrisma(opts: { modules?: unknown[]; moduleFindFirst?: unknown; recipientSent?: ReturnType<typeof memoryRecipientSentStore> }) {
  const recipientSent = opts.recipientSent ?? memoryRecipientSentStore();
  return {
    module: {
      findMany: vi.fn(async () => opts.modules ?? []),
      findFirst: vi.fn(async () => opts.moduleFindFirst ?? null),
    },
    shop: { findUnique: vi.fn(async () => ({ id: 'shop_1', shopDomain: 'test.myshopify.com' })) },
    flowStepLog: { create: vi.fn(async () => ({})) },
    messagingRecipientSent: { findUnique: recipientSent.findUnique, create: recipientSent.create },
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

/**
 * A data store backed by an in-memory record array that HONORS offset/limit and
 * reflects sent-marker writes — so paging + dedupe can be exercised end-to-end.
 */
function memoryDataStore(seed: Array<Record<string, unknown>>) {
  // Stable order (the runner's cursor relies on a stable order + offset + total).
  const rows = seed.map((payload, i) => ({ id: `r${i}`, title: `rec ${i}`, payload: { ...payload } }));
  const listRecords = vi.fn(async (_shopId: string, _key: string, o?: { limit?: number; offset?: number }) => {
    const offset = o?.offset ?? 0;
    const limit = o?.limit ?? 50;
    return {
      storeId: 's',
      storeKey: 'waitlist',
      label: 'Waitlist',
      total: rows.length,
      records: rows.slice(offset, offset + limit).map((r) => ({
        id: r.id,
        externalId: null,
        title: r.title,
        payload: { ...r.payload },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    };
  });
  const updateRecord = vi.fn(async (recordId: string, _storeId: string, data: { payload?: unknown }) => {
    const row = rows.find((r) => r.id === recordId);
    if (row && data.payload && typeof data.payload === 'object') row.payload = data.payload as Record<string, unknown>;
    return {};
  });
  const getStoreByKey = vi.fn(async () => ({ id: 's', key: 'waitlist' }));
  return { service: { listRecords, updateRecord, getStoreByKey } as unknown as DataStoreService, rows, listRecords, updateRecord };
}

/** A durable-scheduler seam that records park calls without touching the DB. */
function fakeEngine(opts: { throwP2002OnRunIds?: string[] } = {}) {
  const startRun = vi.fn(async (_wf: unknown, _payload: unknown, o: { runId: string }) => {
    if (opts.throwP2002OnRunIds?.includes(o.runId)) {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    }
    return { status: 'WAITING' as const };
  });
  return { engine: { startRun } as never, startRun };
}

const EMAIL_BROADCAST = {
  channel: 'email',
  trigger: { kind: 'broadcast' },
  audience: { source: 'data_store', storeKey: 'waitlist', addressField: 'email', recipients: [] },
  templates: [{ channel: 'email', subject: 'Back in stock', body: 'Hi {{record.email}}' }],
  batchSize: 2,
  respectConsent: false,
};

const admin = null as never;

describe('paging park helper (pure)', () => {
  it('builds an idempotent per-page runId (module + token + offset)', () => {
    const id = messagingPageRunId({ moduleId: 'mod_1', runToken: 'tok-A', offset: 200 });
    expect(id).toBe('msgpage_mod1_tokA_200');
    // Distinct offset → distinct runId; same inputs → same runId (idempotent).
    expect(messagingPageRunId({ moduleId: 'mod_1', runToken: 'tok-A', offset: 200 })).toBe(id);
    expect(messagingPageRunId({ moduleId: 'mod_1', runToken: 'tok-A', offset: 400 })).not.toBe(id);
  });

  it('compiles a wait → messaging.sendPage → end workflow carrying the cursor', () => {
    const wf = parkMessagingPageWorkflow({
      shopId: 'shop_1',
      moduleId: 'mod_1',
      campaignName: 'Waitlist Blast',
      offset: 2,
      runToken: 'tok-A',
      trigger: 'MANUAL',
      resumeAt: new Date('2026-07-04T00:00:05Z'),
    });
    const send = wf.nodes.find((n) => n.id === 'send_page')!;
    expect(send.action?.provider).toBe('messaging');
    expect(send.action?.operation).toBe('sendPage');
    const vars = wf.variables?.__page as unknown as MessagingPageInputs;
    expect(vars.offset).toBe(2);
    expect(vars.runToken).toBe('tok-A');
    // The wait head parks immediately (inlineThresholdMs 0).
    const wait = wf.nodes.find((n) => n.id === 'wait')!;
    expect(wait.wait?.inlineThresholdMs).toBe(0);
  });
});

describe('paging helpers (pure)', () => {
  it('deriveRunToken is stable for the same trigger identity, distinct across events', () => {
    const a = deriveRunToken('mod_1', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { admin_graphql_api_id: 'gid://p/1' });
    const b = deriveRunToken('mod_1', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { admin_graphql_api_id: 'gid://p/1' });
    const c = deriveRunToken('mod_1', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED', { admin_graphql_api_id: 'gid://p/2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('recipientAlreadySent reads the __sentRuns marker', () => {
    expect(recipientAlreadySent({ __sentRuns: ['tok-A'] }, 'tok-A')).toBe(true);
    expect(recipientAlreadySent({ __sentRuns: ['tok-B'] }, 'tok-A')).toBe(false);
    expect(recipientAlreadySent({}, 'tok-A')).toBe(false);
  });

  it('only data_store is pageable (literal/event are single-shot)', () => {
    expect(isPageableSource({ audience: { source: 'data_store' } } as never)).toBe(true);
    expect(isPageableSource({ audience: { source: 'literal' } } as never)).toBe(false);
    expect(isPageableSource({ audience: { source: 'event_recipient' } } as never)).toBe(false);
  });
});

describe('cross-run paging — park the remainder', () => {
  it('a >1-batch audience sends the first page AND parks the next', async () => {
    const email = fakeEmailConnector();
    const store = memoryDataStore([
      { email: 'a@x.com' },
      { email: 'b@x.com' },
      { email: 'c@x.com' },
      { email: 'd@x.com' },
      { email: 'e@x.com' },
    ]);
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(EMAIL_BROADCAST)] }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const [result] = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    // First page = batchSize (2), 5 total → paged, next page parked at offset 2.
    expect(result!.sent).toBe(2);
    expect(result!.total).toBe(5);
    expect(result!.paged).toBe(true);
    expect(result!.parkedNextOffset).toBe(2);
    expect(eng.startRun).toHaveBeenCalledTimes(1);
    const parkedRunId = (eng.startRun.mock.calls[0]![2] as { runId: string }).runId;
    expect(parkedRunId).toBe(
      messagingPageRunId({ moduleId: 'mod_1', runToken: result!.runToken, offset: 2 }),
    );
    // The first-page recipients now carry the sent-marker.
    expect((store.rows[0]!.payload as { __sentRuns?: string[] }).__sentRuns).toContain(result!.runToken);
  });
});

describe('cross-run paging — the sweep sends the next page', () => {
  it('runCampaignPage resumes at the cursor and parks the page after it', async () => {
    const email = fakeEmailConnector();
    const store = memoryDataStore([
      { email: 'a@x.com' }, // offset 0 (page 1, already sent by the head run)
      { email: 'b@x.com' },
      { email: 'c@x.com' }, // offset 2 (page 2 — this resume)
      { email: 'd@x.com' },
      { email: 'e@x.com' }, // offset 4 (page 3 — parked next)
    ]);
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST) }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const result = await runner.runCampaignPage('test.myshopify.com', 'mod_1', {
      offset: 2,
      runToken: 'tok-A',
      trigger: 'SCHEDULED',
    });
    expect(result.offset).toBe(2);
    expect(result.sent).toBe(2); // c@x.com, d@x.com
    expect(email.invoke.mock.calls[0]![1].inputs.to).toBe('c@x.com');
    // 5 total, offset 2 + batch 2 = 4 < 5 → still paged, next page parked at offset 4.
    expect(result.paged).toBe(true);
    expect(result.parkedNextOffset).toBe(4);
    expect(eng.startRun).toHaveBeenCalledTimes(1);
  });

  it('the final page sends the tail and parks nothing', async () => {
    const email = fakeEmailConnector();
    const store = memoryDataStore([{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }]);
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST) }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    // offset 2, batch 2 → only c@x.com remains; 2 + 2 = 4 ≥ 3 total → not paged.
    const result = await runner.runCampaignPage('test.myshopify.com', 'mod_1', {
      offset: 2,
      runToken: 'tok-A',
      trigger: 'SCHEDULED',
    });
    expect(result.sent).toBe(1);
    expect(result.paged).toBe(false);
    expect(result.parkedNextOffset).toBeUndefined();
    expect(eng.startRun).not.toHaveBeenCalled();
  });
});

describe('cross-run paging — a double-resume does not double-send', () => {
  it('re-sending the SAME page skips already-marked recipients (sent-marker dedupe)', async () => {
    const email = fakeEmailConnector();
    // Two records already carry the sent-marker for tok-A (a prior resume sent them).
    const store = memoryDataStore([
      { email: 'a@x.com', __sentRuns: ['tok-A'] },
      { email: 'b@x.com', __sentRuns: ['tok-A'] },
    ]);
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST) }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const result = await runner.runCampaignPage('test.myshopify.com', 'mod_1', {
      offset: 0,
      runToken: 'tok-A',
      trigger: 'SCHEDULED',
    });
    // Both recipients are skipped — no connector call, no double-send.
    expect(email.invoke).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('re-parking the SAME page is idempotent (P2002 swallowed, no throw)', async () => {
    const email = fakeEmailConnector();
    const store = memoryDataStore([
      { email: 'a@x.com' },
      { email: 'b@x.com' },
      { email: 'c@x.com' },
    ]);
    // The scheduler already has the offset-2 page parked → startRun throws P2002.
    const parkedRunId = messagingPageRunId({ moduleId: 'mod_1', runToken: 'tok-A', offset: 2 });
    const eng = fakeEngine({ throwP2002OnRunIds: [parkedRunId] });
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ moduleFindFirst: fakeModule(EMAIL_BROADCAST) }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    // The head run sends page 1 and re-parks page 2 — the P2002 is swallowed.
    const result = await runner.runCampaignPage('test.myshopify.com', 'mod_1', {
      offset: 0,
      runToken: 'tok-A',
      trigger: 'SCHEDULED',
    });
    expect(result.sent).toBe(2);
    expect(result.paged).toBe(true);
    expect(result.parkedNextOffset).toBe(2); // reported even though the park was a no-op
    expect(eng.startRun).toHaveBeenCalledTimes(1);
  });
});

describe('back-compat — a single-batch audience never parks', () => {
  it('an audience that fits one batch behaves exactly as before (no park)', async () => {
    const email = fakeEmailConnector();
    const store = memoryDataStore([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(EMAIL_BROADCAST)] }),
      dataStore: store.service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const [result] = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    expect(result!.sent).toBe(2);
    expect(result!.total).toBe(2);
    expect(result!.paged).toBe(false);
    expect(result!.parkedNextOffset).toBeUndefined();
    expect(eng.startRun).not.toHaveBeenCalled();
  });

  it('a literal audience is never paged even when it exceeds batchSize by count', async () => {
    // literal is a single-shot set — not cursor-pageable — so the runner must not park.
    const email = fakeEmailConnector();
    const literalCfg = {
      ...EMAIL_BROADCAST,
      batchSize: 1,
      audience: { source: 'literal', addressField: 'email', recipients: ['a@x.com', 'b@x.com', 'c@x.com'] },
    };
    const eng = fakeEngine();
    const runner = new MessagingRunnerService({
      prisma: fakePrisma({ modules: [fakeModule(literalCfg)] }),
      dataStore: memoryDataStore([]).service,
      jobs: fakeJobs(),
      getConnector: () => email as unknown as Connector,
      emailApiKey: 'key',
      engine: eng.engine,
      pageDelayMs: 0,
    });

    const [result] = await runner.runForTrigger('test.myshopify.com', admin, 'MANUAL', {});
    // batchSize 1 caps the send, total 3 → paged is TRUE (gap visible), but a literal
    // source is not cursor-pageable so nothing is parked (honest: we page what we can).
    expect(result!.sent).toBe(1);
    expect(result!.paged).toBe(true);
    expect(result!.parkedNextOffset).toBeUndefined();
    expect(eng.startRun).not.toHaveBeenCalled();
  });
});

describe('fix round (Critical #1) — literal/event_recipient idempotency guard survives an automatic BullMQ retry', () => {
  /**
   * MESSAGING_RUN keeps `attempts: 3` (job-retry-policy.ts) because a retry
   * re-invokes runForTrigger with the SAME event — deriveRunToken is
   * deterministic (module + trigger + event), so the retry produces the
   * SAME runToken. Previously literal/event_recipient recipients had no
   * durable marker at all (recipientAlreadySent only reads a __sentRuns
   * field data_store records carry); this proves the new
   * MessagingRecipientSent-backed guard makes a second call with the same
   * runToken a no-op for already-sent recipients — the actual fix this
   * test exists to prove.
   */
  it('a literal audience: calling runForTrigger twice with the same event sends once, not twice', async () => {
    const email = fakeEmailConnector();
    const recipientSent = memoryRecipientSentStore();
    const literalCfg = {
      channel: 'email',
      trigger: { kind: 'event', event: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
      audience: { source: 'literal', addressField: 'email', recipients: ['a@x.com', 'b@x.com'] },
      templates: [{ channel: 'email', subject: 'Back in stock', body: 'Hi {{record.email}}' }],
      batchSize: 10,
      respectConsent: false,
    };
    const eng = fakeEngine();
    const buildRunner = () =>
      new MessagingRunnerService({
        prisma: fakePrisma({ modules: [fakeModule(literalCfg)], recipientSent }),
        dataStore: memoryDataStore([]).service,
        jobs: fakeJobs(),
        getConnector: () => email as unknown as Connector,
        emailApiKey: 'key',
        engine: eng.engine,
        pageDelayMs: 0,
      });
    const event = { admin_graphql_api_id: 'gid://shopify/Order/999' };

    const [first] = await buildRunner().runForTrigger('test.myshopify.com', admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', event);
    expect(first!.sent).toBe(2);
    expect(first!.skipped).toBe(0);

    // Simulates BullMQ retrying the same job — a fresh runner instance (matches a
    // fresh executor invocation), same event → same deriveRunToken result.
    const [retry] = await buildRunner().runForTrigger('test.myshopify.com', admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', event);
    expect(retry!.runToken).toBe(first!.runToken);
    expect(retry!.sent).toBe(0);
    expect(retry!.skipped).toBe(2);
    // Only the first call actually invoked the connector — twice (2 recipients),
    // never four times.
    expect(email.invoke).toHaveBeenCalledTimes(2);
  });

  it('an event_recipient audience: the same guard applies to the single derived recipient', async () => {
    const email = fakeEmailConnector();
    const recipientSent = memoryRecipientSentStore();
    const eventRecipientCfg = {
      channel: 'email',
      trigger: { kind: 'event', event: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
      audience: { source: 'event_recipient', addressField: 'email' },
      templates: [{ channel: 'email', subject: 'Order received', body: 'Hi' }],
      batchSize: 10,
      respectConsent: false,
    };
    const eng = fakeEngine();
    const buildRunner = () =>
      new MessagingRunnerService({
        prisma: fakePrisma({ modules: [fakeModule(eventRecipientCfg)], recipientSent }),
        dataStore: memoryDataStore([]).service,
        jobs: fakeJobs(),
        getConnector: () => email as unknown as Connector,
        emailApiKey: 'key',
        engine: eng.engine,
        pageDelayMs: 0,
      });
    const event = { admin_graphql_api_id: 'gid://shopify/Order/42', customer: { email: 'buyer@x.com' } };

    const [first] = await buildRunner().runForTrigger('test.myshopify.com', admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', event);
    expect(first!.sent).toBe(1);

    const [retry] = await buildRunner().runForTrigger('test.myshopify.com', admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', event);
    expect(retry!.sent).toBe(0);
    expect(retry!.skipped).toBe(1);
    expect(email.invoke).toHaveBeenCalledTimes(1);
  });
});
