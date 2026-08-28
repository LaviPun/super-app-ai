import { describe, expect, it } from 'vitest';
import { attachLiveTail } from '~/hooks/useLiveTail';
import type { EventSourceLike, LiveTailStatus } from '~/hooks/useLiveTail';

const READY_STATE_CONNECTING = 0;
const READY_STATE_CLOSED = 2;

/** Minimal fake matching the EventSourceLike surface `attachLiveTail` needs. */
function makeFakeEventSource(): EventSourceLike & {
  emitLog: (data: unknown) => void;
  emitRawLog: (raw: string) => void;
  closed: boolean;
} {
  let logListener: ((evt: { data: string }) => void) | null = null;
  return {
    readyState: READY_STATE_CONNECTING,
    onopen: null,
    onerror: null,
    closed: false,
    addEventListener(type, listener) {
      if (type === 'log') logListener = listener;
    },
    close() {
      this.closed = true;
      this.readyState = READY_STATE_CLOSED;
    },
    emitLog(data: unknown) {
      logListener?.({ data: JSON.stringify(data) });
    },
    emitRawLog(raw: string) {
      logListener?.({ data: raw });
    },
  };
}

describe('attachLiveTail', () => {
  it('reports "live" once the connection opens', () => {
    const es = makeFakeEventSource();
    const statuses: LiveTailStatus[] = [];
    attachLiveTail(es, { onEvent: () => {}, onStatus: (s) => statuses.push(s), onGiveUp: () => {} });

    es.onopen?.();

    expect(statuses).toEqual(['live']);
  });

  it('forwards parsed log events and marks the stream live', () => {
    const es = makeFakeEventSource();
    const rows: unknown[] = [];
    const statuses: LiveTailStatus[] = [];
    attachLiveTail(es, { onEvent: (r) => rows.push(r), onStatus: (s) => statuses.push(s), onGiveUp: () => {} });

    es.emitLog({ id: '1', action: 'LOGIN' });

    expect(rows).toEqual([{ id: '1', action: 'LOGIN' }]);
    expect(statuses).toEqual(['live']);
  });

  it('ignores malformed log frames instead of throwing', () => {
    const es = makeFakeEventSource();
    const rows: unknown[] = [];
    const statuses: LiveTailStatus[] = [];
    attachLiveTail(es, { onEvent: (r) => rows.push(r), onStatus: (s) => statuses.push(s), onGiveUp: () => {} });

    expect(() => es.emitRawLog('not json')).not.toThrow();

    expect(rows).toEqual([]);
    expect(statuses).toEqual([]); // status only flips to 'live' on a successfully parsed row
  });

  it('surfaces "reconnecting" on a transient drop (readyState stays CONNECTING) without giving up', () => {
    const es = makeFakeEventSource();
    const statuses: LiveTailStatus[] = [];
    const giveUps: string[] = [];
    attachLiveTail(es, { onEvent: () => {}, onStatus: (s) => statuses.push(s), onGiveUp: (m) => giveUps.push(m) });

    es.readyState = READY_STATE_CONNECTING;
    es.onerror?.();

    expect(statuses).toEqual(['reconnecting']);
    expect(giveUps).toEqual([]);
    expect(es.closed).toBe(false);
  });

  it('gives up loudly — closes the connection and reports "failed" — after exceeding maxRetries transient drops', () => {
    const es = makeFakeEventSource();
    const statuses: LiveTailStatus[] = [];
    const giveUps: string[] = [];
    attachLiveTail(es, {
      onEvent: () => {},
      onStatus: (s) => statuses.push(s),
      onGiveUp: (m) => giveUps.push(m),
      maxRetries: 3,
    });

    es.readyState = READY_STATE_CONNECTING;
    for (let i = 0; i < 3; i++) es.onerror?.();
    expect(giveUps).toEqual([]); // still under the cap

    es.onerror?.(); // 4th consecutive failure — exceeds maxRetries: 3
    expect(statuses.at(-1)).toBe('failed');
    expect(giveUps).toHaveLength(1);
    expect(giveUps[0]).toMatch(/gave up after repeated retries/i);
    expect(es.closed).toBe(true);
  });

  it('resets the retry counter after a successful reconnect (onopen)', () => {
    const es = makeFakeEventSource();
    const statuses: LiveTailStatus[] = [];
    const giveUps: string[] = [];
    attachLiveTail(es, {
      onEvent: () => {},
      onStatus: (s) => statuses.push(s),
      onGiveUp: (m) => giveUps.push(m),
      maxRetries: 2,
    });

    es.readyState = READY_STATE_CONNECTING;
    es.onerror?.(); // 1 failure
    es.onopen?.(); // recovers — retry counter resets
    es.onerror?.(); // 1 failure again (would have been 2 without the reset)
    es.onerror?.(); // 2 failures — still within cap of 2

    expect(giveUps).toEqual([]);
    expect(es.closed).toBe(false);
  });

  it('gives up immediately (no retry) when readyState is already CLOSED — a fatal, non-retriable failure', () => {
    const es = makeFakeEventSource();
    const statuses: LiveTailStatus[] = [];
    const giveUps: string[] = [];
    attachLiveTail(es, { onEvent: () => {}, onStatus: (s) => statuses.push(s), onGiveUp: (m) => giveUps.push(m) });

    es.readyState = READY_STATE_CLOSED;
    es.onerror?.();

    expect(statuses).toEqual(['failed']);
    expect(giveUps).toEqual(['Live tail disconnected.']);
  });

  it('returns a cleanup function that closes the connection', () => {
    const es = makeFakeEventSource();
    const cleanup = attachLiveTail(es, { onEvent: () => {}, onStatus: () => {}, onGiveUp: () => {} });

    expect(es.closed).toBe(false);
    cleanup();
    expect(es.closed).toBe(true);
  });
});
