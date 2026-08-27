import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 7 (WS-G) + Task 16 (WS-G) + fix round (Important #5): the four
 * best-effort fan-out siblings in webhooks.tsx (messaging, httpSync,
 * restock, loyalty) CLAIM + ENQUEUE (via ops-queue.server's
 * enqueueOwnedJob, Task 14's registry) + ACK — an enqueue failure fires an
 * OpsAlertService WEBHOOK_FANOUT_FAILED alert alongside the existing
 * logger.error, AND (fix round) releases the webhook-event claim and 500s
 * the webhook so Shopify redelivers it — an enqueue failure is a fast local
 * queue-write failure (Redis/DB unreachable), a structural problem worth a
 * retry, unlike the executor's own downstream work which stays genuinely
 * best-effort/async. Mirrors webhooks-main.test.ts's mocking pattern
 * exactly so both files can coexist against the same route module.
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

  it('fires WEBHOOK_FANOUT_FAILED when the messaging enqueue throws, releases the claim, and 500s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('MESSAGING_RUN', new Error('messaging enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    expect(unmarkMock).toHaveBeenCalledWith({ shopDomain: 'shop.example.myshopify.com', topic: 'orders/create', eventId: 'wh_event_1' });
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'WEBHOOK_FANOUT_FAILED',
        context: expect.objectContaining({ fanout: 'messaging', shopDomain: 'shop.example.myshopify.com', topic: 'orders/create' }),
      }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the httpSync enqueue throws, releases the claim, and 500s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('HTTP_SYNC_RUN', new Error('httpSync enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    expect(unmarkMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'httpSync' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the restock enqueue throws, releases the claim, and 500s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      payload: { id: 100, variants: [] },
      shop: 'shop.example.myshopify.com',
      topic: 'products/update',
    });
    rejectEnqueueFor('RESTOCK_WATCH_RUN', new Error('restock enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    expect(unmarkMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'restock' }) }),
    );
  });

  it('fires WEBHOOK_FANOUT_FAILED when the loyalty enqueue throws, releases the claim, and 500s the webhook', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('LOYALTY_ACCRUAL_RUN', new Error('loyalty enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    expect(unmarkMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEBHOOK_FANOUT_FAILED', context: expect.objectContaining({ fanout: 'loyalty' }) }),
    );
  });

  it('fix round (Important #5): a sibling enqueue failure does not stop the OTHER siblings from being attempted', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('MESSAGING_RUN', new Error('messaging enqueue boom'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
    // httpSync and loyalty were still attempted even though messaging failed.
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'HTTP_SYNC_RUN' }));
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOYALTY_ACCRUAL_RUN' }));
  });

  it('fix round (Important #5): a release failure itself never throws out of the action', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    rejectEnqueueFor('MESSAGING_RUN', new Error('messaging enqueue boom'));
    unmarkMock.mockRejectedValue(new Error('release also failed'));

    const { action } = await import('~/routes/webhooks');
    const res = await action({ request: webhookRequest() });

    expect(res.status).toBe(500);
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

  it('fix round (Important #5): enqueue-failure → claim released → the second (redelivered) request reprocesses instead of being dropped as a duplicate', async () => {
    authWebhookMock.mockResolvedValue({
      admin: {},
      payload: { id: 42 },
      shop: 'shop.example.myshopify.com',
      topic: 'orders/create',
    });
    // First delivery: messaging enqueue fails transiently.
    rejectEnqueueFor('MESSAGING_RUN', new Error('messaging enqueue boom'));
    // checkAndMarkWebhookEvent/unmarkWebhookEvent are mocked, not a real
    // claim table — model the claim's actual lifecycle: the first call
    // claims (isNew), the release call un-claims it (so a same-eventId
    // redelivery is new again), exactly like the real checkAndMarkWebhookEvent/
    // unmarkWebhookEvent pair backed by WebhookEvent's unique constraint.
    let claimed = false;
    checkAndMarkMock.mockImplementation(async () => {
      if (claimed) return false; // already claimed — a true duplicate delivery
      claimed = true;
      return true;
    });
    unmarkMock.mockImplementation(async () => {
      claimed = false;
    });

    const { action } = await import('~/routes/webhooks');

    const first = await action({ request: webhookRequest() });
    expect(first.status).toBe(500);
    expect(claimed).toBe(false); // the claim was released after the enqueue failure

    // Second delivery (Shopify redelivering the same X-Shopify-Webhook-Id):
    // now let every enqueue succeed, simulating the transient issue clearing.
    enqueueMock.mockResolvedValue({ jobId: 'job_x', queued: true });
    const second = await action({ request: webhookRequest() });

    expect(second.status).toBe(200);
    expect(flowRunMock).toHaveBeenCalledTimes(2); // reprocessed, not dropped as a duplicate
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'MESSAGING_RUN' }));
  });
});
