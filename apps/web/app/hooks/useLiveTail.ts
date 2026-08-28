import { useEffect, useState } from 'react';

export type LiveTailStatus = 'connecting' | 'live' | 'reconnecting' | 'failed';

/** The slice of the DOM `EventSource` API this module depends on — kept
 * minimal so tests can pass a plain object instead of a real EventSource
 * (not available outside a browser/jsdom environment). */
export interface EventSourceLike {
  readyState: number;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: 'log', listener: (evt: { data: string }) => void): void;
  close(): void;
}

const READY_STATE_CLOSED = 2; // EventSource.CLOSED

/**
 * Wires connection-state tracking onto an already-open EventSource-like
 * object: dev-tooling-independent, DOM-independent, and unit-testable.
 *
 * `EventSource.onerror` fires on every transient drop, not just fatal ones —
 * per spec, the browser auto-retries and `readyState` stays `CONNECTING`
 * through those retries; it only becomes `CLOSED` once the browser gives up
 * for good (or the server sends a non-retriable response). Reacting only to
 * `CLOSED` (the original per-route implementations' bug) leaves a stalled
 * connection that keeps failing to reconnect — a proxy black-holing the
 * stream, a backend restart, Railway's edge timing out an idle response
 * without ever closing it — stuck showing "active" forever with no new rows
 * and no indication anything was wrong: a blank hang. This surfaces the
 * intermediate `reconnecting` state and gives up loudly (closes the
 * connection, calls `onGiveUp`) after too many consecutive failed retries,
 * instead of retrying silently forever.
 */
export function attachLiveTail<T>(
  es: EventSourceLike,
  opts: {
    onEvent: (row: T) => void;
    onStatus: (status: LiveTailStatus) => void;
    onGiveUp: (message: string) => void;
    maxRetries?: number;
  },
): () => void {
  const { onEvent, onStatus, onGiveUp, maxRetries = 5 } = opts;
  let retries = 0;

  es.onopen = () => {
    retries = 0;
    onStatus('live');
  };
  es.addEventListener('log', (evt) => {
    try {
      onEvent(JSON.parse(evt.data) as T);
      onStatus('live');
    } catch {
      // ignore malformed frames
    }
  });
  es.onerror = () => {
    if (es.readyState === READY_STATE_CLOSED) {
      onStatus('failed');
      onGiveUp('Live tail disconnected.');
      return;
    }
    // readyState CONNECTING: the browser is auto-retrying. Surface that
    // instead of silently pretending the stream is still healthy, and stop
    // retrying forever if it can't recover.
    retries += 1;
    if (retries > maxRetries) {
      es.close();
      onStatus('failed');
      onGiveUp('Live tail lost the connection and gave up after repeated retries — toggle it back on to reconnect.');
      return;
    }
    onStatus('reconnecting');
  };

  return () => es.close();
}

/** React wrapper around {@link attachLiveTail} for the internal-admin "Live
 * tail" toggles (Activity, API Logs, Support tickets — see
 * ~/services/internal/log-tail.server.ts for the matching server half). */
export function useLiveTail<T>(opts: {
  enabled: boolean;
  url: string | null;
  onEvent: (row: T) => void;
  onGiveUp: (message: string) => void;
  maxRetries?: number;
}): LiveTailStatus {
  const { enabled, url, onEvent, onGiveUp, maxRetries } = opts;
  const [status, setStatus] = useState<LiveTailStatus>('connecting');

  useEffect(() => {
    if (!enabled || !url) return;
    setStatus('connecting');
    const es = new EventSource(url);
    // DOM's EventSource types onopen/onerror as `(ev: Event) => any`, which
    // structurally can't satisfy the deliberately-simplified EventSourceLike
    // (kept 0-arg so plain test fakes don't need to fabricate Event objects —
    // see attachLiveTail's unit tests). At runtime a real EventSource happily
    // invokes a 0-arg handler, so this cast is safe.
    return attachLiveTail<T>(es as unknown as EventSourceLike, { onEvent, onStatus: setStatus, onGiveUp, maxRetries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  return status;
}
