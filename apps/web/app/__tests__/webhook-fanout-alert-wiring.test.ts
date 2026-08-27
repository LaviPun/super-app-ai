import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 7 (WS-G) + Task 16 (WS-G): the four best-effort fan-out siblings in
 * webhooks.tsx (messaging, httpSync, restock, loyalty) CLAIM + ENQUEUE (via
 * ops-queue.server's enqueueOwnedJob, Task 14's registry) + ACK — an enqueue
 * failure must fire an OpsAlertService WEBHOOK_FANOUT_FAILED alert alongside
 * the existing logger.error, and the webhook must still return 200 (the flow
 * run already succeeded and consumed the claim; a fan-out failure must never
 * release the event or 500 the webhook). Mirrors webhooks-main.test.ts's
 * mocking pattern exactly so both files can coexist against the same route
 * module.
 */

const { authWebhookMock, checkAndMarkMock, unmarkMock, extractEventIdMock, flowRunMock, enqueueMock, loggerMock, fireMock } =
  vi.hoisted(() => ({
    authWebhookMock: vi.fn(),
    checkAndMarkMock: vi.fn(),
    unmarkMock: vi.fn(),
    extractEventIdMock: vi.fn(() => 'wh_event_1'),
    flowRunMock: vi.fn(),
    enqueueMock: vi.fn(async (_input: { type: string }) => ({ jobId: 'job_x', queued: true })),
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

vi.mock('~/services/jobs/ops-queue.server', () => ({
  enqueueOwnedJob: enqueueMock,
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

vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
}));

function webhookRequest() {
  return new Request('https://example.test/webhooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-webhook-id': 'wh_event_1' },
    body: JSON.stringify({ id: 1 }),
  });
}

/** Makes enqueueMock reject only for the given owned job type; succeed otherwise. */
function rejectEnqueueFor(type: string, error: Error) {
  enqueueMock.mockImplementation(async (input: { type: string }) => {
    if (input.type === type) throw error;
    return { jobId: 'job_x', queued: true };
  });
}

describe('webhooks.tsx fan-out → claim + enqueue + ACK (WS-G Task 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractEventIdMock.mockReturnValue('wh_event_1');
    checkAndMarkMock.mockResolvedValue(true);
    unmarkMock.mockResolvedValue(undefined);
    flowRunMock.mockResolvedValue(undefined);
    enqueueMock.mockResolvedValue({ jobId: 'job_x', queued: true });
    shopFindUniqueMock.mockResolvedValue({ id: 'shop-1' });
    fireMock.mockResolvedValue({ sentry: true, email: false, slack: false });
  });

  it('messaging/httpSync/loyalty fan-out enqueues jobs instead of running inline, then ACKs 200', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'MESSAGING_RUN' }));
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'HTTP_SYNC_RUN' }));
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOYALTY_ACCRUAL_RUN' }));
  });

  it('fires WEBHOOK_FANOUT_FAILED when the messaging enqueue throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('MESSAGING_RUN', new Error('messaging enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'WEBHOOK_FANOUT_FAILED',
        context: expect.objectContaining({ fanout: 'messaging', shopDomain: 'shop.example.myshopify.com', topic: 'orders/create' }),
      }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the httpSync enqueue throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('HTTP_SYNC_RUN', new Error('httpSync enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'httpSync' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the restock enqueue throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 100, variants: [] },
      shop: 'shop.example.myshopify.com',
      topic: 'products/update',
    });
    rejectEnqueueFor('RESTOCK_WATCH_RUN', new Error('restock enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'restock' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the loyalty enqueue throws, and still 200s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('LOYALTY_ACCRUAL_RUN', new Error('loyalty enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(200);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'loyalty' }) }),
    );
  });

  it('does NOT fire an alert when every enqueue succeeds', async () => {
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
