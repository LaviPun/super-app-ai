import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signHttpSyncBody,
  verifyHttpSyncSignature,
  buildHttpSyncSignatureHeaders,
  HTTP_SYNC_SIGNATURE_HEADER,
  HTTP_SYNC_SHOP_HEADER,
  HTTP_SYNC_TIMESTAMP_HEADER,
} from '~/services/integration/http-sync-signature.server';

/**
 * integration.httpSync runtime (build #7a):
 *  - the outbound leg maps the declared fields, signs the body, and dispatches to the
 *    merchant-connected service;
 *  - a transient failure retries then dead-letters (the previously caller-less
 *    DeadLetterService.record now has a real caller);
 *  - a proactive rate-limit backoff consults RateLimitService (previously caller-less);
 *  - the signature helpers round-trip (sign → verify) and reject tampering / staleness.
 */

const h = vi.hoisted(() => ({
  currentSpec: null as unknown,
  modules: [] as unknown[],
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: { findMany: async () => h.modules, findFirst: async () => null },
    shop: { findUnique: async () => ({ id: 'shop_1' }) },
  }),
}));

vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse() {
      return h.currentSpec;
    }
  },
}));

vi.mock('~/services/observability/logger.server', () => ({
  logger: { warn: () => {}, error: () => {}, info: () => {} },
}));
vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: () => ({}),
}));

// Ensure a stable ENCRYPTION_KEY for the signature derivation (32 bytes base64).
beforeEach(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

import { HttpSyncRunnerService } from '~/services/integration/http-sync-runner.service';
import { mapPayload } from '~/services/integration/http-sync-runner.service';

const SHOP = 'demo.myshopify.com';

function makeModule() {
  return {
    id: 'mod_httpsync',
    type: 'integration.httpSync',
    status: 'PUBLISHED',
    activeVersionId: 'v1',
    activeVersion: { specJson: '{}' },
  };
}

function makeSpec(overrides: Record<string, unknown> = {}) {
  return {
    type: 'integration.httpSync',
    name: 'ERP sync',
    config: {
      connectorId: 'conn_erp',
      endpointPath: '/ingest',
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      payloadMapping: { id: '{{admin_graphql_api_id}}', total: '{{total_price}}' },
      ...overrides,
    },
  };
}

function fakeDeps() {
  const jobs = {
    create: vi.fn(async () => ({ id: 'job_1' })),
    start: vi.fn(async () => {}),
    succeed: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
  const deadLetter = {
    record: vi.fn(async () => ({ id: 'dl_1' })),
    claimDue: vi.fn(async () => []),
    markResolved: vi.fn(async () => ({})),
    recordFailure: vi.fn(async () => ({})),
  };
  const rateLimit = {
    getByDomain: vi.fn(async () => null),
  };
  return { jobs, deadLetter, rateLimit };
}

describe('mapPayload', () => {
  it('resolves {{dot.path}} against the event and passes literals through', () => {
    const out = mapPayload(
      { id: '{{admin_graphql_api_id}}', who: '{{customer.email}}', src: 'shopify' },
      { admin_graphql_api_id: 'gid://shopify/Order/1', customer: { email: 'a@b.co' } },
    ) as Record<string, unknown>;
    expect(out.id).toBe('gid://shopify/Order/1');
    expect(out.who).toBe('a@b.co');
    expect(out.src).toBe('shopify');
  });

  it('sends the whole event when mapping is empty', () => {
    const event = { a: 1 };
    expect(mapPayload({}, event)).toBe(event);
  });
});

describe('httpSync signature', () => {
  it('round-trips sign → verify', () => {
    const body = JSON.stringify({ hello: 'world' });
    const headers = buildHttpSyncSignatureHeaders(SHOP, body);
    const ok = verifyHttpSyncSignature({
      shopDomain: SHOP,
      body,
      signature: headers[HTTP_SYNC_SIGNATURE_HEADER]!,
      timestamp: headers[HTTP_SYNC_TIMESTAMP_HEADER]!,
    });
    expect(ok).toBe(true);
    expect(headers[HTTP_SYNC_SHOP_HEADER]).toBe(SHOP);
  });

  it('rejects a tampered body', () => {
    const ts = Date.now().toString();
    const sig = signHttpSyncBody(SHOP, 'original', ts);
    expect(verifyHttpSyncSignature({ shopDomain: SHOP, body: 'tampered', signature: sig, timestamp: ts })).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const stale = (Date.now() - 10 * 60_000).toString();
    const sig = signHttpSyncBody(SHOP, 'body', stale);
    expect(verifyHttpSyncSignature({ shopDomain: SHOP, body: 'body', signature: sig, timestamp: stale })).toBe(false);
  });

  it('rejects a wrong shop (different derived secret)', () => {
    const ts = Date.now().toString();
    const sig = signHttpSyncBody(SHOP, 'body', ts);
    expect(verifyHttpSyncSignature({ shopDomain: 'other.myshopify.com', body: 'body', signature: sig, timestamp: ts })).toBe(false);
  });
});

describe('HttpSyncRunnerService.runForTrigger', () => {
  beforeEach(() => {
    h.modules = [makeModule()];
    h.currentSpec = makeSpec();
  });

  it('dispatches to the connector with a signature header on a matching trigger', async () => {
    const { jobs, deadLetter, rateLimit } = fakeDeps();
    const dispatch = vi.fn(
      async (_shop: string, _req: { headers: Record<string, string>; body: string; connectorId: string }) => ({
        ok: true,
        status: 200,
        bodyPreview: '',
        durationMs: 5,
        retryable: false,
      }),
    );
    const connectors = { dispatch } as never;

    const runner = new HttpSyncRunnerService({
      connectors,
      jobs: jobs as never,
      deadLetter: deadLetter as never,
      rateLimit: rateLimit as never,
      sleep: async () => {},
    });

    const results = await runner.runForTrigger(SHOP, null, 'SHOPIFY_WEBHOOK_ORDER_CREATED', {
      admin_graphql_api_id: 'gid://shopify/Order/9',
      total_price: '42.00',
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.dispatched).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const call = dispatch.mock.calls[0]![1];
    expect(call.connectorId).toBe('conn_erp');
    expect(call.headers[HTTP_SYNC_SIGNATURE_HEADER]).toBeDefined();
    // The signed body carries the MAPPED payload.
    const sent = JSON.parse(call.body);
    expect(sent.data.id).toBe('gid://shopify/Order/9');
    expect(sent.data.total).toBe('42.00');
    expect(deadLetter.record).not.toHaveBeenCalled();
    expect(jobs.succeed).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure then dead-letters (DeadLetterService gets a real caller)', async () => {
    const { jobs, deadLetter, rateLimit } = fakeDeps();
    const dispatch = vi.fn(async () => ({
      ok: false,
      status: 500,
      bodyPreview: 'boom',
      durationMs: 5,
      retryable: true,
      error: 'Connected service returned 500',
    }));
    const connectors = { dispatch } as never;

    const runner = new HttpSyncRunnerService({
      connectors,
      jobs: jobs as never,
      deadLetter: deadLetter as never,
      rateLimit: rateLimit as never,
      sleep: async () => {},
    });

    const results = await runner.runForTrigger(SHOP, null, 'SHOPIFY_WEBHOOK_ORDER_CREATED', {});

    expect(results[0]!.dispatched).toBe(false);
    expect(results[0]!.deadLettered).toBe(true);
    // 1 initial + 2 retries.
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(deadLetter.record).toHaveBeenCalledTimes(1);
    expect(jobs.fail).toHaveBeenCalledTimes(1);
  });

  it('consults RateLimitService.backoffMs before dispatch (rate-limit record gets a caller)', async () => {
    const { jobs, deadLetter } = fakeDeps();
    const getByDomain = vi.fn(async () => ({
      currentlyAvailable: 10,
      maximumAvailable: 1000,
      restoreRate: 50,
    }));
    const rateLimit = { getByDomain };
    const sleep = vi.fn(async () => {});
    const dispatch = vi.fn(async () => ({ ok: true, status: 200, bodyPreview: '', durationMs: 1, retryable: false }));

    const runner = new HttpSyncRunnerService({
      connectors: { dispatch } as never,
      jobs: jobs as never,
      deadLetter: deadLetter as never,
      rateLimit: rateLimit as never,
      sleep,
    });

    await runner.runForTrigger(SHOP, null, 'SHOPIFY_WEBHOOK_ORDER_CREATED', {});
    expect(getByDomain).toHaveBeenCalledWith(SHOP);
    // Bucket at 1% capacity < 10% floor → backoff computed → sleep invoked.
    expect(sleep).toHaveBeenCalled();
  });

  it('skips modules whose trigger does not match', async () => {
    h.currentSpec = makeSpec({ trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' });
    const { jobs, deadLetter, rateLimit } = fakeDeps();
    const dispatch = vi.fn(async () => ({ ok: true, status: 200, bodyPreview: '', durationMs: 1, retryable: false }));
    const runner = new HttpSyncRunnerService({
      connectors: { dispatch } as never,
      jobs: jobs as never,
      deadLetter: deadLetter as never,
      rateLimit: rateLimit as never,
      sleep: async () => {},
    });
    const results = await runner.runForTrigger(SHOP, null, 'SHOPIFY_WEBHOOK_ORDER_CREATED', {});
    expect(results).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
