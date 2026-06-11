import { JobRecordSchema, WorkerEventSchema, type JobRecord, type JobStatus, type WorkerEvent } from '@superapp/platform-contracts';
import { parseSseChunk } from './sse-parse';

export type JobStatusResponse = JobRecord & {
  transportStatus?: string;
  events?: WorkerEvent[];
  links?: { status: string; events: string };
};

export type JobEventsClientOptions = {
  baseUrl: string;
  jobId: string;
  eventsPath: string;
  statusPath: string;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export type JobEventsTransport = 'sse' | 'polling' | 'idle';

export type JobEventsSubscription = {
  close: () => void;
};

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.replace(/\/$/, '') + '/').toString();
}

export async function fetchJobStatus(
  options: Pick<JobEventsClientOptions, 'baseUrl' | 'statusPath' | 'fetchImpl'>,
): Promise<JobStatusResponse> {
  const fetchFn = options.fetchImpl ?? fetch;
  const res = await fetchFn(joinUrl(options.baseUrl, options.statusPath));
  if (!res.ok) throw new Error(`Job status failed: ${res.status}`);
  const json = (await res.json()) as JobStatusResponse;
  return {
    ...JobRecordSchema.parse(json),
    transportStatus: json.transportStatus,
    events: (json.events ?? []).map((event) => WorkerEventSchema.parse(event)),
    links: json.links,
  };
}

export function subscribeJobEvents(
  options: JobEventsClientOptions,
  callbacks: {
    onEvent: (event: WorkerEvent) => void;
    onStatus?: (status: JobStatusResponse) => void;
    onTransport?: (transport: JobEventsTransport) => void;
    onError?: (error: Error) => void;
  },
): JobEventsSubscription {
  const fetchFn = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let abortController: AbortController | undefined;

  const emitStatus = async () => {
    try {
      const status = await fetchJobStatus({
        baseUrl: options.baseUrl,
        statusPath: options.statusPath,
        fetchImpl: fetchFn,
      });
      callbacks.onStatus?.(status);
      for (const event of status.events ?? []) {
        callbacks.onEvent(WorkerEventSchema.parse(event));
      }
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const startPolling = () => {
    if (pollTimer) return;
    callbacks.onTransport?.('polling');
    void emitStatus();
    pollTimer = setInterval(() => {
      if (!closed) void emitStatus();
    }, pollIntervalMs);
  };

  const consumeFetchSse = async () => {
    abortController = new AbortController();
    callbacks.onTransport?.('sse');
    const res = await fetchFn(joinUrl(options.baseUrl, options.eventsPath), {
      signal: abortController.signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.remainder;
      for (const message of parsed.messages) {
        if (message.event === 'message' && !message.data) continue;
        try {
          const event = WorkerEventSchema.parse(JSON.parse(message.data));
          callbacks.onEvent(event);
        } catch {
          // ignore comment frames and malformed chunks
        }
      }
    }
  };

  void consumeFetchSse().catch(() => {
    if (!closed) startPolling();
  });

  return {
    close: () => {
      closed = true;
      abortController?.abort();
      if (pollTimer) clearInterval(pollTimer);
      callbacks.onTransport?.('idle');
    },
  };
}

export function mergeWorkerEvents(existing: WorkerEvent[], incoming: WorkerEvent[]): WorkerEvent[] {
  const seen = new Set(existing.map((event) => `${event.type}:${event.timestamp}`));
  const merged = [...existing];
  for (const event of incoming) {
    const key = `${event.type}:${event.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function latestJobStatus(events: WorkerEvent[], fallback: JobStatus): JobStatus {
  const last = events.at(-1);
  if (!last) return fallback;
  switch (last.type) {
    case 'JOB_COMPLETED':
      return 'SUCCESS';
    case 'JOB_FAILED':
      return 'FAILED';
    case 'JOB_CANCELLED':
      return 'CANCELLED';
    case 'JOB_STARTED':
    case 'JOB_PROGRESS':
      return 'RUNNING';
    default:
      return fallback;
  }
}
