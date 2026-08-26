/**
 * WS-C Task 9. The async worker processor for `PUBLISH` jobs (flag-gated
 * behind `PUBLISH_ASYNC_ENABLED`, C10): parses the payload, re-validates
 * `target` via the real `DeployTargetSchema`, re-reads the RecipeSpec fresh
 * from `moduleVersion.specJson` (never trusts the queue payload for it —
 * same "DB is the source of truth" rule Task 8 established for hydrate),
 * runs `PublishService.publish` BEFORE `markPublishedWithTransition` (drift
 * rule — never report published before the Shopify write actually
 * happened), and persists a `PublishPartialFailureError`'s structured
 * `failedOp`/`completedOps`/`guidance` (WS-E finding 4) so the poll route
 * surfaces the same republish guidance the sync `api.publish.tsx` path
 * returns directly.
 *
 * `PublishService` itself is mocked here (processor orchestration only) —
 * its real Shopify-writing behavior and idempotency guarantees are WS-E's
 * own test coverage. The three thrown-error classes are redefined as real
 * `Error` subclasses inside the SAME mocked module the processor imports,
 * so `instanceof` checks in the processor see the exact class the test
 * throws (same trick `ai-hydrate-processor.test.ts` uses for
 * `AiProviderNotConfiguredError`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobEnvelope } from '@superapp/platform-contracts';
import type { WebJobEnvelope } from '~/services/jobs/worker-runtime.server';

const hoisted = vi.hoisted(() => ({
  publish: vi.fn(),
  publishCtorArgs: [] as Array<{ admin: unknown; session: unknown }>,
  callOrder: [] as string[],
  jobStart: vi.fn(async () => {}),
  jobSetStage: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  versionFindUnique: vi.fn(),
  markPublishedWithTransition: vi.fn(),
  activityLog: vi.fn(async () => {}),
  provisionModuleDataStore: vi.fn(async () => null),
  getThemeEmbedStatus: vi.fn(async () => 'enabled'),
  unauthenticatedAdmin: vi.fn(async () => ({ admin: { fake: 'admin-client' } })),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    moduleVersion: { findUnique: hoisted.versionFindUnique },
  }),
}));

vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    start = hoisted.jobStart;
    setStage = hoisted.jobSetStage;
    succeed = hoisted.jobSucceed;
    failWithPayload = hoisted.jobFailWithPayload;
  },
}));

vi.mock('~/shopify.server', () => ({
  shopify: { unauthenticated: { admin: hoisted.unauthenticatedAdmin } },
}));

vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    markPublishedWithTransition = (input: unknown) => {
      hoisted.callOrder.push('markPublishedWithTransition');
      return hoisted.markPublishedWithTransition(input);
    };
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.activityLog;
  },
}));

vi.mock('~/services/publish/provision-data-store.server', () => ({
  provisionModuleDataStore: hoisted.provisionModuleDataStore,
}));

vi.mock('~/services/publish/embed-status.server', () => ({
  getThemeEmbedStatus: hoisted.getThemeEmbedStatus,
}));

vi.mock('~/env.server', () => ({
  getPublishJobBudgetMs: () => 120_000,
}));

vi.mock('~/services/publish/publish.service', () => {
  class PublishPartialFailureError extends Error {
    code = 'PUBLISH_PARTIAL_FAILURE';
    failedOp: string;
    completed: unknown[];
    constructor(failedOp: string, completed: unknown[], cause: unknown) {
      super(
        `Publish failed at "${failedOp}" after ${completed.length} completed step(s): ` +
          `${cause instanceof Error ? cause.message : String(cause)}. Republishing is safe.`,
      );
      this.name = 'PublishPartialFailureError';
      this.failedOp = failedOp;
      this.completed = completed;
    }
  }
  class ModuleNotPublishableError extends Error {
    code = 'MODULE_NOT_PUBLISHABLE';
    preflight: { status: string; reasons: string[] };
    constructor(preflight: { status: string; reasons: string[] }) {
      super(preflight.reasons[0] ?? 'not publishable');
      this.name = 'ModuleNotPublishableError';
      this.preflight = preflight;
    }
  }
  class FunctionKeyAlreadyPublishedError extends Error {
    code = 'FUNCTION_KEY_ALREADY_PUBLISHED';
    constructor(moduleType: string, otherModuleName: string) {
      super(`A "${moduleType}" module is already published on this store ("${otherModuleName}").`);
      this.name = 'FunctionKeyAlreadyPublishedError';
    }
  }
  class PublishService {
    constructor(admin: unknown, session: unknown) {
      hoisted.publishCtorArgs.push({ admin, session });
    }
    publish(spec: unknown, target: unknown) {
      hoisted.callOrder.push('publish');
      return hoisted.publish(spec, target);
    }
  }
  return { PublishService, PublishPartialFailureError, ModuleNotPublishableError, FunctionKeyAlreadyPublishedError };
});

import { createPublishJobHandler } from '~/services/jobs/processors/publish.processor.server';
import { PublishPartialFailureError } from '~/services/publish/publish.service';

const RECIPE_SPEC_JSON = JSON.stringify({
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
});

const validPayload = {
  kind: 'WEB_PUBLISH',
  shopId: 'shop-1',
  shopDomain: 'x.myshopify.com',
  moduleId: 'mod-1',
  versionId: 'ver-1',
  target: { kind: 'PLATFORM', moduleId: 'mod-1' },
  source: 'merchant_api',
  idempotencyKey: 'publish:x.myshopify.com:mod-1:ver-1:platform',
  trace: { correlationId: 'corr-1', shopId: 'shop-1' },
};

function envelope(
  payload: Record<string, unknown>,
  attempt?: Partial<Pick<WebJobEnvelope, 'attemptsMade' | 'attemptsTotal' | 'isFinalAttempt'>>,
): WebJobEnvelope {
  const base: JobEnvelope = {
    id: 'job-publish-1',
    queueName: 'publish',
    jobType: 'PUBLISH',
    payload,
    trace: { correlationId: 'corr-1', shopId: 'shop-1' },
  };
  return { ...base, attemptsMade: 0, attemptsTotal: 1, isFinalAttempt: true, ...attempt };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.publishCtorArgs.length = 0;
  hoisted.callOrder.length = 0;
  hoisted.versionFindUnique.mockResolvedValue({
    id: 'ver-1',
    moduleId: 'mod-1',
    specJson: RECIPE_SPEC_JSON,
  });
  hoisted.publish.mockResolvedValue({
    compiledJson: '{}',
    preflight: { willDeploy: true, status: 'DEPLOYABLE', reasons: [], moduleType: 'theme.section' },
    ledger: [{ op: 'THEME_MODULE_UPSERT', detail: 'created' }],
  });
});

describe('createPublishJobHandler', () => {
  it('invalid payload -> failWithPayload VALIDATION_ERROR, FAILED, no throw', async () => {
    const handler = createPublishJobHandler();
    const result = await handler(envelope({ kind: 'WEB_PUBLISH' }));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(hoisted.jobStart).not.toHaveBeenCalled();
  });

  it('unknown versionId -> failWithPayload NOT_FOUND, FAILED (never calls PublishService)', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce(null);
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({ error: 'NOT_FOUND' }),
    );
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('a version whose moduleId does not match the payload -> failWithPayload NOT_FOUND', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce({
      id: 'ver-1',
      moduleId: 'some-other-module',
      specJson: RECIPE_SPEC_JSON,
    });
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({ error: 'NOT_FOUND' }),
    );
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('invalid RecipeSpec JSON on the version -> failWithPayload VALIDATION_ERROR, FAILED', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce({
      id: 'ver-1',
      moduleId: 'mod-1',
      specJson: '{not json',
    });
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('parses payload, starts the job, publishes BEFORE markPublishedWithTransition, and succeeds the job with ledger + embedStatus', async () => {
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));

    expect(hoisted.jobStart).toHaveBeenCalledWith('job-publish-1');
    expect(hoisted.versionFindUnique).toHaveBeenCalledWith({ where: { id: 'ver-1' } });

    expect(hoisted.publish).toHaveBeenCalledTimes(1);
    const [specArg, targetArg] = hoisted.publish.mock.calls[0]!;
    expect(specArg).toMatchObject({ type: 'theme.section', name: 'Test Section' });
    expect(targetArg).toEqual({ kind: 'PLATFORM', moduleId: 'mod-1' });
    expect(hoisted.publishCtorArgs[0]).toEqual({
      admin: { fake: 'admin-client' },
      session: { shop: 'x.myshopify.com', shopId: 'shop-1' },
    });

    // Drift rule: the Shopify write (publish) happens strictly before the
    // DB is told the module is published.
    expect(hoisted.callOrder).toEqual(['publish', 'markPublishedWithTransition']);
    expect(hoisted.markPublishedWithTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        moduleId: 'mod-1',
        versionId: 'ver-1',
        source: 'merchant_api',
        idempotencyKey: 'publish:x.myshopify.com:mod-1:ver-1:platform',
      }),
    );

    expect(hoisted.getThemeEmbedStatus).toHaveBeenCalledTimes(1); // theme.section -> isThemeModule
    expect(hoisted.jobSucceed).toHaveBeenCalledWith('job-publish-1', {
      ok: true,
      ledger: [{ op: 'THEME_MODULE_UPSERT', detail: 'created' }],
      embedStatus: 'enabled',
    });
    expect(result).toEqual({
      status: 'SUCCESS',
      result: { ok: true, ledger: [{ op: 'THEME_MODULE_UPSERT', detail: 'created' }], embedStatus: 'enabled' },
    });
    expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
  });

  it('PublishPartialFailureError -> persists failedOp/completedOps/guidance, never calls markPublishedWithTransition', async () => {
    hoisted.publish.mockImplementationOnce(async () => {
      hoisted.callOrder.push('publish');
      throw new PublishPartialFailureError(
        'FUNCTION_CONFIG_UPSERT',
        [{ op: 'THEME_MODULE_UPSERT' }],
        new Error('Shopify API blew up'),
      );
    });
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));

    expect(result.status).toBe('FAILED');
    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledTimes(1);
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({
        error: 'PUBLISH_ERROR',
        message: expect.stringMatching(/Republishing is safe/),
        details: {
          failedOp: 'FUNCTION_CONFIG_UPSERT',
          completedOps: JSON.stringify([{ op: 'THEME_MODULE_UPSERT' }]),
          guidance: expect.stringMatching(/Republish to converge/),
        },
      }),
    );
  });

  it('a generic thrown error -> failWithPayload PUBLISH_ERROR (never a bare String(e))', async () => {
    hoisted.publish.mockRejectedValueOnce(new Error('boom'));
    const handler = createPublishJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-publish-1',
      expect.objectContaining({ error: 'PUBLISH_ERROR', message: 'boom' }),
    );
    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
  });

  // failFinalOnly parity with ai-generation/ai-hydrate processors. Every
  // enqueue uses attempts: 1 (C10 — publish retries are a human decision),
  // so attemptsTotal is always 1 and isFinalAttempt is always true in
  // production; this still asserts the guard behaves correctly if that
  // ever changes, keeping the three processors' shape identical.
  describe('attempt-aware terminal writes (failFinalOnly parity)', () => {
    it('a thrown error on a NON-final attempt -> returns FAILED (BullMQ retries) WITHOUT calling failWithPayload; sets stage retrying', async () => {
      hoisted.publish.mockRejectedValueOnce(new Error('transient'));
      const handler = createPublishJobHandler();
      const result = await handler(envelope(validPayload, { attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false }));
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
      expect(hoisted.jobSetStage).toHaveBeenCalledWith('job-publish-1', 'retrying');
    });

    it('a thrown error on the FINAL attempt -> calls failWithPayload (terminal)', async () => {
      hoisted.publish.mockRejectedValueOnce(new Error('transient'));
      const handler = createPublishJobHandler();
      const result = await handler(envelope(validPayload, { attemptsMade: 1, attemptsTotal: 2, isFinalAttempt: true }));
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).toHaveBeenCalledTimes(1);
    });

    it('the malformed-payload branch stays un-gated (unconditional failWithPayload) even on a non-final attempt', async () => {
      const handler = createPublishJobHandler();
      const result = await handler(
        envelope({ kind: 'WEB_PUBLISH' }, { attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false }),
      );
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
        'job-publish-1',
        expect.objectContaining({ error: 'VALIDATION_ERROR' }),
      );
      expect(hoisted.jobSetStage).not.toHaveBeenCalled();
    });
  });
});
