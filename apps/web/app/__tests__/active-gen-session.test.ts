/**
 * WS-C Task 8 commit-0 fold-in (b). `readActiveGenSession` must keep its
 * exact-match guard when the caller has a known prompt (state/`?prompt=`),
 * but trust the persisted session's own prompt when the caller has none —
 * the reload-resume path for a `modules._index.tsx` state-seeded nav (which
 * carries no `?prompt=` and loses `location.state` on a hard reload).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_GEN_SESSION_KEY,
  clearActiveGenSession,
  readActiveGenSession,
  writeActiveGenSession,
} from '~/utils/active-gen-session';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('active-gen-session', () => {
  let originalSessionStorage: Storage | undefined;

  beforeEach(() => {
    originalSessionStorage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = makeMemoryStorage();
  });

  afterEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = originalSessionStorage;
    vi.restoreAllMocks();
  });

  it('round-trips a session and clears it', () => {
    writeActiveGenSession({ jobId: 'job_1', correlationId: 'corr_1', prompt: 'make a banner' });
    expect(readActiveGenSession('make a banner')).toEqual({
      jobId: 'job_1',
      correlationId: 'corr_1',
      prompt: 'make a banner',
    });
    clearActiveGenSession();
    expect(readActiveGenSession('make a banner')).toBeNull();
  });

  it('with an expected prompt, requires an exact match (guard unchanged)', () => {
    writeActiveGenSession({ jobId: 'job_1', correlationId: 'corr_1', prompt: 'make a banner' });
    expect(readActiveGenSession('a totally different prompt')).toBeNull();
  });

  it('with NO expected prompt, trusts whatever prompt is persisted (reload-resume, state-seeded nav)', () => {
    writeActiveGenSession({ jobId: 'job_1', correlationId: 'corr_1', prompt: 'make a banner' });
    // No `?prompt=` and no router state survived the reload — the caller
    // has nothing to compare against, so the persisted prompt is trusted.
    expect(readActiveGenSession()).toEqual({
      jobId: 'job_1',
      correlationId: 'corr_1',
      prompt: 'make a banner',
    });
  });

  it('returns null for a missing, corrupt, or incomplete record regardless of guard mode', () => {
    expect(readActiveGenSession()).toBeNull();
    expect(readActiveGenSession('x')).toBeNull();

    sessionStorage.setItem(ACTIVE_GEN_SESSION_KEY, '{not json');
    expect(readActiveGenSession()).toBeNull();

    sessionStorage.setItem(ACTIVE_GEN_SESSION_KEY, JSON.stringify({ jobId: 'job_1' }));
    expect(readActiveGenSession()).toBeNull();
  });

  it('is best-effort when sessionStorage throws (private browsing / quota)', () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(() => writeActiveGenSession({ jobId: 'j', correlationId: 'c', prompt: 'p' })).not.toThrow();
    expect(readActiveGenSession()).toBeNull();
    expect(() => clearActiveGenSession()).not.toThrow();
  });
});
