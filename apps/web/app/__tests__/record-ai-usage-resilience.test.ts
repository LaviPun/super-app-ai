import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordAiUsage } from '~/services/ai/llm.server';

/**
 * The fan-out quota unit rides on a single AiUsage write (only idx 0 carries the
 * billable unit — see optionCallBillableUnits). Before this fix recordAiUsage
 * swallowed EVERY write error, so one flaky DB write silently dropped a
 * merchant's whole billed generation → free generation, invisible in the data.
 *
 * These lock the resilience contract: transient failures retry, a persistent
 * failure on a quota-bearing write is logged LOUD (alertable) not swallowed, and
 * the generation flow is never broken (recordAiUsage never throws).
 */
type RecordFn = (args: unknown) => Promise<void>;
const fakeUsage = (record: RecordFn) => ({ record } as unknown as Parameters<typeof recordAiUsage>[0]);

// providerId: null takes the env branch and never touches prisma.
const baseParams = {
  providerId: null,
  shopId: 'shop_1',
  action: 'RECIPE_GENERATION_OPTION',
  tokensIn: 100,
  tokensOut: 50,
  costCents: 1.2,
  requestCount: 1,
};

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordAiUsage resilience', () => {
  it('writes once on the happy path', async () => {
    const record = vi.fn<RecordFn>().mockResolvedValue(undefined);
    await recordAiUsage(fakeUsage(record), { ...baseParams });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and succeeds without logging an error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const record = vi
      .fn<RecordFn>()
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce(undefined);
    await recordAiUsage(fakeUsage(record), { ...baseParams });
    expect(record).toHaveBeenCalledTimes(2);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('logs a LOUD quota-leak error when a quota-bearing write fails for good — and never throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const record = vi.fn<RecordFn>().mockRejectedValue(new Error('db down'));
    await expect(recordAiUsage(fakeUsage(record), { ...baseParams, requestCount: 1 })).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('quota-bearing usage write failed');
  });

  it('does NOT raise a quota-leak error for an observability-only (requestCount 0) write', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const record = vi.fn<RecordFn>().mockRejectedValue(new Error('db down'));
    await recordAiUsage(fakeUsage(record), { ...baseParams, requestCount: 0 });
    expect(record).toHaveBeenCalledTimes(3);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
