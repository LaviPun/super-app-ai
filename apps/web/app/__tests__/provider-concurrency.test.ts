/**
 * WS-C Task 11. `withProviderSlot` is a process-local semaphore per provider
 * key — caps how many LLM calls are in flight at once for a given provider,
 * so a worker's option fan-out (up to 3 calls per job) times
 * `WORKER_CONCURRENCY` concurrent jobs doesn't burst far more simultaneous
 * calls at one provider than it can absorb.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetProviderSlotsForTest,
  getOptionCallStaggerMs,
  getProviderConcurrencyCap,
  withProviderSlot,
} from '~/services/ai/provider-concurrency.server';
import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';

afterEach(() => {
  __resetProviderSlotsForTest();
  delete process.env.AI_PROVIDER_MAX_CONCURRENT;
  delete process.env.OPTION_CALL_STAGGER_MS;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const hoisted = vi.hoisted(() => ({
  appSettingsFindUnique: vi.fn(async () => null as unknown),
  anthropicGenerateRecipe: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: hoisted.appSettingsFindUnique },
    aiModelPrice: { findFirst: vi.fn(async () => null) },
    aiUsage: { create: vi.fn(async () => ({})), findFirst: vi.fn(async () => null) },
    aiProvider: {
      findFirst: vi.fn(async () => ({ id: 'env-provider-row' })),
      create: vi.fn(async () => ({ id: 'env-provider-row' })),
    },
  }),
}));
vi.mock('~/services/ai/provider-routing.server', () => ({
  resolveShopProviderOverrideId: vi.fn(async () => null),
  resolveProviderIdForShop: vi.fn(async () => null),
}));
vi.mock('~/services/ai/clients/anthropic-messages.client.server', () => ({
  anthropicGenerateRecipe: (...args: unknown[]) => hoisted.anthropicGenerateRecipe(...args),
}));

describe('getProviderConcurrencyCap', () => {
  it('defaults to 4', () => {
    delete process.env.AI_PROVIDER_MAX_CONCURRENT;
    expect(getProviderConcurrencyCap()).toBe(4);
  });

  it('reads AI_PROVIDER_MAX_CONCURRENT at call time', () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = '7';
    expect(getProviderConcurrencyCap()).toBe(7);
  });

  it('falls back to the default on an invalid value', () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = 'not-a-number';
    expect(getProviderConcurrencyCap()).toBe(4);
    process.env.AI_PROVIDER_MAX_CONCURRENT = '0';
    expect(getProviderConcurrencyCap()).toBe(4);
    process.env.AI_PROVIDER_MAX_CONCURRENT = '-3';
    expect(getProviderConcurrencyCap()).toBe(4);
  });
});

describe('getOptionCallStaggerMs', () => {
  it('defaults to 350', () => {
    delete process.env.OPTION_CALL_STAGGER_MS;
    expect(getOptionCallStaggerMs()).toBe(350);
  });

  it('reads OPTION_CALL_STAGGER_MS at call time, including 0', () => {
    process.env.OPTION_CALL_STAGGER_MS = '0';
    expect(getOptionCallStaggerMs()).toBe(0);
    process.env.OPTION_CALL_STAGGER_MS = '900';
    expect(getOptionCallStaggerMs()).toBe(900);
  });
});

describe('withProviderSlot', () => {
  it('admits at most `cap` concurrent tasks for one key, lets all complete, FIFO order', async () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = '2';
    let active = 0;
    let maxActive = 0;
    const admissionOrder: number[] = [];
    const releasers: Array<() => void> = [];

    const run = (id: number) =>
      withProviderSlot('provider-a', () => {
        active++;
        maxActive = Math.max(maxActive, active);
        admissionOrder.push(id);
        return new Promise<number>((resolve) => {
          releasers.push(() => {
            active--;
            resolve(id);
          });
        });
      });

    const p0 = run(0);
    const p1 = run(1);
    const p2 = run(2);
    const p3 = run(3);

    // Only the cap (2) can have been admitted synchronously-ish; give the
    // microtask queue a chance to settle admission of the first two.
    await Promise.resolve();
    await Promise.resolve();
    expect(admissionOrder).toEqual([0, 1]);
    expect(maxActive).toBe(2);
    expect(releasers).toHaveLength(2);

    // Release task 0 -> task 2 (next in FIFO queue) should be admitted next.
    releasers[0]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(admissionOrder).toEqual([0, 1, 2]);
    expect(maxActive).toBe(2);

    // Release task 1 -> task 3 admitted.
    releasers[1]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(admissionOrder).toEqual([0, 1, 2, 3]);
    expect(maxActive).toBe(2);

    // Drain the rest.
    releasers[2]!();
    releasers[3]!();

    const results = await Promise.all([p0, p1, p2, p3]);
    expect(results.sort()).toEqual([0, 1, 2, 3]);
    expect(active).toBe(0);
  });

  it('a task that throws still releases its slot for the next waiter', async () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = '1';

    const first = withProviderSlot('provider-b', async () => {
      throw new Error('boom');
    });
    await expect(first).rejects.toThrow('boom');

    // If the slot leaked, this would hang forever — the test's own timeout
    // would fail it. It should resolve immediately since cap is 1 and the
    // failed task released its slot in `finally`.
    const second = await withProviderSlot('provider-b', async () => 'ok');
    expect(second).toBe('ok');
  });

  it('different provider keys do not share a cap', async () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = '1';
    let activeA = 0;
    let activeB = 0;

    const releaseA = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

    const taskA = withProviderSlot('provider-x', async () => {
      activeA++;
      await releaseA();
    });
    const taskB = withProviderSlot('provider-y', async () => {
      activeB++;
    });

    // Both should be able to start immediately — they use different keys —
    // even though cap is 1 per key.
    await Promise.all([taskA, taskB]);
    expect(activeA).toBe(1);
    expect(activeB).toBe(1);
  });

  it('reads the cap fresh from env on each acquire (call-time, not import-time)', async () => {
    process.env.AI_PROVIDER_MAX_CONCURRENT = '1';
    const releasers: Array<() => void> = [];
    const admitted: number[] = [];

    const run = (id: number) =>
      withProviderSlot('provider-z', () => {
        admitted.push(id);
        return new Promise<void>((resolve) => releasers.push(resolve));
      });

    const p0 = run(0);
    const p1 = run(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(admitted).toEqual([0]);

    // Raising the cap should not retroactively admit the already-queued
    // waiter until a release cycles it through — but proves the getter is
    // read fresh (no stale closed-over cap from the first acquire call).
    process.env.AI_PROVIDER_MAX_CONCURRENT = '5';
    releasers[0]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(admitted).toEqual([0, 1]);

    releasers[1]!();
    await Promise.all([p0, p1]);
  });
});

describe('postJsonWithRetries: honored retry-after under a deadline budget (WS-C Task 11)', () => {
  it('with a generous deadlineAt, honors retry-after across two 429s (2 sleeps of 20s) before the third attempt succeeds', async () => {
    vi.useFakeTimers();
    const deadlineAt = Date.now() + 90_000;

    let callIndex = 0;
    const fetchMock = vi.fn(async () => {
      const idx = callIndex++;
      if (idx < 2) {
        return {
          status: 429,
          headers: new Headers({ 'retry-after': '20' }),
          text: async () => '{"error":"rate limited"}',
        } as unknown as Response;
      }
      return {
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: true }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      deadlineAt,
      maxRetries: 2,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });

    await vi.advanceTimersByTimeAsync(50_000);
    const { json } = await promise;

    expect(json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('without a deadlineAt, behavior is unchanged: a single 429 retry capped at 10s, then fails', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async () => ({
      status: 429,
      headers: new Headers({ 'retry-after': '20' }),
      text: async () => '{"error":"rate limited"}',
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      maxRetries: 2,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    const assertion = expect(promise).rejects.toMatchObject({ nonRetryable: true, statusCode: 429 });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;

    // One initial attempt + one retry (capped at 10s, honoring the tunnel-era
    // discipline) = 2 total fetch calls, same as before this task.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tags a budget-exhausted 429 non-retry with deadlineExhausted (WS-C Task 11 scope addition, cosmetic)', async () => {
    vi.useFakeTimers();
    // Deadline leaves less than retryAfterMs(20s) + 5s margin remaining, so
    // the retry is skipped even though a 429-retry slot is technically free.
    const deadlineAt = Date.now() + 10_000;

    const fetchMock = vi.fn(async () => ({
      status: 429,
      headers: new Headers({ 'retry-after': '20' }),
      text: async () => '{"error":"rate limited"}',
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      deadlineAt,
      maxRetries: 2,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    await expect(promise).rejects.toMatchObject({ nonRetryable: true, statusCode: 429, deadlineExhausted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('option fan-out stagger (WS-C Task 11)', () => {
  // A non-visual FUNCTION-type recipe: `runDesignQa` no-ops on non-visual
  // recipes and `runRenderQa`/`runRichnessQa` no-op on non-renderable /
  // config-less-archetype recipes, so this option passes design-QA on the
  // first try with zero extra LLM calls — keeping the call sequence exactly
  // one call per option, in idx order, for a clean stagger measurement.
  const DISCOUNT_RECIPE = {
    type: 'functions.discountRules',
    name: 'Stub Discount Rules',
    category: 'FUNCTION',
    requires: ['DISCOUNT_FUNCTION'],
    config: {
      rules: [{ when: { customerTags: ['VIP'], minSubtotal: 100 }, apply: { percentageOff: 15 } }],
      combineWithOtherDiscounts: true,
    },
  };

  const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
  const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
  const ORIGINAL_COST_ROUTING = process.env.AI_COST_ROUTING_ENABLED;

  function setUpEnv() {
    hoisted.appSettingsFindUnique.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_COST_ROUTING_ENABLED;
  }

  function restoreEnv() {
    if (ORIGINAL_ANTHROPIC_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    if (ORIGINAL_GEMINI_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
    if (ORIGINAL_COST_ROUTING === undefined) delete process.env.AI_COST_ROUTING_ENABLED;
    else process.env.AI_COST_ROUTING_ENABLED = ORIGINAL_COST_ROUTING;
  }

  afterEach(() => {
    restoreEnv();
  });

  it('generateValidatedRecipeOptionsParallel: option idx starts >= idx * OPTION_CALL_STAGGER_MS after idx 0', async () => {
    setUpEnv();
    process.env.OPTION_CALL_STAGGER_MS = '100';
    vi.useFakeTimers();

    const { generateValidatedRecipeOptionsParallel } = await import('~/services/ai/llm.server');

    const callTimes: number[] = [];
    hoisted.anthropicGenerateRecipe.mockImplementation(async () => {
      callTimes.push(Date.now());
      return {
        rawJson: JSON.stringify({ recipe: DISCOUNT_RECIPE, explanation: 'test option' }),
        tokensIn: 10,
        tokensOut: 20,
        model: 'claude-test',
      };
    });

    const promise = generateValidatedRecipeOptionsParallel(
      'give VIP customers 15% off',
      { moduleType: 'functions.discountRules' as never },
      { optionCount: 3 },
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes).toHaveLength(3);
    expect(callTimes[1]! - callTimes[0]!).toBeGreaterThanOrEqual(100);
    expect(callTimes[2]! - callTimes[0]!).toBeGreaterThanOrEqual(200);
  });

  it('OPTION_CALL_STAGGER_MS=0 disables the stagger (all calls fire without an inter-option delay)', async () => {
    setUpEnv();
    process.env.OPTION_CALL_STAGGER_MS = '0';
    vi.useFakeTimers();

    const { generateValidatedRecipeOptionsParallel } = await import('~/services/ai/llm.server');

    const callTimes: number[] = [];
    hoisted.anthropicGenerateRecipe.mockImplementation(async () => {
      callTimes.push(Date.now());
      return {
        rawJson: JSON.stringify({ recipe: DISCOUNT_RECIPE, explanation: 'test option' }),
        tokensIn: 10,
        tokensOut: 20,
        model: 'claude-test',
      };
    });

    const promise = generateValidatedRecipeOptionsParallel(
      'give VIP customers 15% off',
      { moduleType: 'functions.discountRules' as never },
      { optionCount: 3 },
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes).toHaveLength(3);
    expect(callTimes[2]! - callTimes[0]!).toBe(0);
  });
});
