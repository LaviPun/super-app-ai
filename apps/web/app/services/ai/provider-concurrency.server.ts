/**
 * WS-C Task 11. Process-local (per worker instance) concurrency control for
 * outbound LLM provider calls.
 *
 * Two independent knobs:
 *  - `withProviderSlot` caps how many calls are in flight AT ONCE for a given
 *    provider key (DB `AiProvider.id` in production). Without this, a worker
 *    fans out up to 3 option calls per generation job, and `WORKER_CONCURRENCY`
 *    jobs can run at once — that's up to `3 * WORKER_CONCURRENCY` simultaneous
 *    calls hitting one provider account, which is exactly the kind of burst a
 *    provider-side rate limiter punishes hardest.
 *  - `getOptionCallStaggerMs` gives the option fan-out a small per-index delay
 *    so even a single job's 3 option calls don't start in the same instant —
 *    they ramp in over ~2x the stagger window instead of bursting together.
 *
 * Both are process-local, not a distributed limiter — sized to blunt bursts
 * from THIS process, not to enforce a hard global cap across the fleet.
 */

const DEFAULT_PROVIDER_CONCURRENCY_CAP = 4;
const DEFAULT_OPTION_CALL_STAGGER_MS = 350;

/** `AI_PROVIDER_MAX_CONCURRENT` — max concurrent in-flight calls per provider key. Default 4. */
export function getProviderConcurrencyCap(): number {
  const raw = Number(process.env.AI_PROVIDER_MAX_CONCURRENT?.trim() || '');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_PROVIDER_CONCURRENCY_CAP;
}

/** `OPTION_CALL_STAGGER_MS` — per-index delay between option fan-out calls. Default 350ms. Read at call time so tests can override. */
export function getOptionCallStaggerMs(): number {
  const trimmed = process.env.OPTION_CALL_STAGGER_MS?.trim();
  if (!trimmed) return DEFAULT_OPTION_CALL_STAGGER_MS;
  const raw = Number(trimmed);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_OPTION_CALL_STAGGER_MS;
}

type ProviderSlot = {
  active: number;
  /** FIFO queue of waiters. Each entry both admits (`active++`) and resolves the waiter when invoked. */
  queue: Array<() => void>;
};

const slots = new Map<string, ProviderSlot>();

function getOrCreateSlot(key: string): ProviderSlot {
  let slot = slots.get(key);
  if (!slot) {
    slot = { active: 0, queue: [] };
    slots.set(key, slot);
  }
  return slot;
}

function acquire(slot: ProviderSlot, cap: number): Promise<void> {
  if (slot.active < cap) {
    slot.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    // Admission happens synchronously inside the queued callback (see
    // `release`) so `active` transfers directly from the releasing call to
    // the next waiter with no window where a third caller could slip in.
    slot.queue.push(() => {
      slot.active++;
      resolve();
    });
  });
}

function release(slot: ProviderSlot): void {
  const next = slot.queue.shift();
  if (next) {
    next();
    return;
  }
  slot.active--;
}

/**
 * Runs `fn` once fewer than `getProviderConcurrencyCap()` calls are already
 * in flight for `providerKey`. Waiters are admitted first-in-first-out. The
 * slot is always released — whether `fn` resolves or throws — so a failing
 * call never leaks a permanently-held slot.
 */
export async function withProviderSlot<T>(providerKey: string, fn: () => Promise<T>): Promise<T> {
  const cap = getProviderConcurrencyCap();
  const slot = getOrCreateSlot(providerKey);
  await acquire(slot, cap);
  try {
    return await fn();
  } finally {
    release(slot);
  }
}

/** Test-only: clears all in-memory concurrency state between test cases. */
export function __resetProviderSlotsForTest(): void {
  slots.clear();
}
