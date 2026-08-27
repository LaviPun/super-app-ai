import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 7 (WS-G): the four best-effort fan-out catches in webhooks.tsx (messaging,
 * httpSync, restock, loyalty) must fire an OpsAlertService WEBHOOK_FANOUT_FAILED
 * alert alongside their existing logger.error — and must still return 200 (the
 * flow run already succeeded and consumed the claim; a fan-out failure must never
 * release the event or 500 the webhook). Mirrors webhooks-main.test.ts's mocking
 * pattern exactly so both files can coexist against the same route module.
 */

const {
  authWebhookMock,
  checkAndMarkMock,
  unmarkMock,
  extractEventIdMock,
  flowRunMock,
  messagingRunMock,
  httpSyncRunMock,
  accrueForOrderMock,
  restockRunMock,
  loggerMock,
  fireMock,
} = vi.hoisted(() => ({
  authWebhookMock: vi.fn(),
  checkAndMarkMock: vi.fn(),
  unmarkMock: vi.fn(),
  extractEventIdMock: vi.fn(() => 'wh_event_1'),
  flowRunMock: vi.fn(),
  messagingRunMock: vi.fn(),
  httpSyncRunMock: vi.fn(),
  accrueForOrderMock: vi.fn(),
  restockRunMock: vi.fn(),
  loggerMock: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  fireMock: vi.fn(async () => ({ sentry: true, email: false, slack: false })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: (...args: unknown[]) => authWebhookMock(...args),
    },
  },
}));

const shopFindUniqueMock = vi.fn(async () => ({ id: 'shop-1' }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: shopFindUniqueMock },
  }),
}));

vi.mock('~/services/flows/flow-runner.service', () => ({
  FlowRunnerService: class {
    runForTrigger = flowRunMock;
  },
}));

vi.mock('~/services/messaging/messaging-runner.service', () => ({
  MessagingRunnerService: class {
    runForTrigger = messagingRunMock;
  },
}));

vi.mock('~/services/integration/http-sync-runner.service', () => ({
  HttpSyncRunnerService: class {
    runForTrigger = httpSyncRunMock;
  },
}));

vi.mock('~/services/messaging/restock-watcher.server', () => ({
  RestockWatcherService: class {
    runForProductUpdate = restockRunMock;
  },
}));

vi.mock('~/services/composites/loyalty-accrual.server', () => ({
  accrueForOrder: accrueForOrderMock,
}));

vi.mock('~/services/flows/idempotency.server', () => ({
  checkAndMarkWebhookEvent: checkAndMarkMock,
  unmarkWebhookEvent: unmarkMock,
  extractWebhookEventId: extractEventIdMock,
}));

vi.mock('~/services/jobs/shopify-metaobject-cleanup.job', () => ({
  SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE: 'SHOPIFY_METAOBJECT_CLEANUP',
}));

vi.mock('~/services/observability/logger.server', () => ({
  logger: loggerMock,
}));

vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: (err: unknown) => ({ error: String(err) }),
}));

// Fix round 1: webhooks.tsx also imports markOpsAlerted/wasOpsAlerted from this
// module (the cross-call-site dedup marker) — reimplement them with the same
// `__opsAlerted` convention as the real module rather than pulling in the real
// module (which would transitively import ~/db.server et al) via importOriginal.
vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
  markOpsAlerted: (error: unknown) => {
    if (error && typeof error === 'object') (error as { __opsAlerted?: boolean }).__opsAlerted = true;
  },
  wasOpsAlerted: (error: unknown) =>
    !!(error && typeof error === 'object' && (error as { __opsAlerted?: boolean }).__opsAlerted === true),
}));

function webhookRequest() {
  return new Request('https://example.test/webhooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-webhook-id': 'wh_event_1' },
    body: JSON.stringify({ id: 1 }),
  });
}

describe('webhooks.tsx fan-out → OpsAlertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractEventIdMock.mockReturnValue('wh_event_1');
    checkAndMarkMock.mockResolvedValue(true);
    unmarkMock.mockResolvedValue(undefined);
    flowRunMock.mockResolvedValue(undefined);
    messagingRunMock.mockResolvedValue(undefined);
    httpSyncRunMock.mockResolvedValue(undefined);
    accrueForOrderMock.mockResolvedValue(undefined);
    restockRunMock.mockResolvedValue(undefined);
    shopFindUniqueMock.mockResolvedValue({ id: 'shop-1' });
    fireMock.mockResolvedValue({ sentry: true, email: false, slack: false });
  });

  it('fires WEBHOOK_FANOUT_FAILED when the messaging fan-out throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    messagingRunMock.mockRejectedValue(new Error('messaging boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    // Exactly ONE alert for this failure (fix round 1 — the messaging path must
    // never double-fire): this test's error is an ordinary, unmarked rejection
    // (MessagingRunnerService is fully mocked here, so no real jobs.fail runs),
    // so the webhook catch is the only place that can fire — pin it to exactly once.
    expect(fireMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'WEBHOOK_FANOUT_FAILED',
        context: expect.objectContaining({ fanout: 'messaging', shopDomain: 'shop.example.myshopify.com', topic: 'orders/create' }),
      }),
    );
  });

  it('fix round 1: does NOT fire a second alert when the messaging error is already marked opsAlerted (jobs.fail already fired one)', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    // Simulates MessagingRunnerService.runCampaign's real behavior: jobs.fail()
    // already fired a JOB_FAILED ops alert, and the error was tagged before
    // re-throwing so this outer catch knows not to fire a redundant one.
    const err = new Error('messaging boom — already alerted by jobs.fail');
    (err as { __opsAlerted?: boolean }).__opsAlerted = true;
    messagingRunMock.mockRejectedValue(err);

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).not.toHaveBeenCalled();
  });

  it('fires WEBHOOK_FANOUT_FAILED when the httpSync fan-out throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    httpSyncRunMock.mockRejectedValue(new Error('httpSync boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'httpSync' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the restock watcher throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 100, variants: [] },
      shop: 'shop.example.myshopify.com',
      topic: 'products/update',
    });
    restockRunMock.mockRejectedValue(new Error('watcher boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'restock' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when loyalty accrual throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    accrueForOrderMock.mockRejectedValue(new Error('loyalty boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'loyalty' }) }),
    );
  });

  it('does NOT fire an alert when every fan-out succeeds', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).not.toHaveBeenCalled();
  });
});
