import { EnqueueJobResponseSchema } from '@superapp/platform-contracts';
import type { JobEventsClientOptions } from './job-events-client';

export type InternalAssistantEnqueueInput = {
  sessionId: string;
  message: string;
  target?: 'localMachine' | 'modalRemote';
  clientRequestId?: string;
  retryCount?: number;
  idempotencyKey?: string;
  correlationId: string;
};

export type InternalAssistantEnqueueResponse = {
  jobId: string;
  queueName: string;
  status: 'QUEUED';
  deduped: boolean;
  links: { status: string; events: string };
};

export type InternalAssistantApiOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function enqueueInternalAssistantJob(
  options: InternalAssistantApiOptions,
  input: InternalAssistantEnqueueInput,
): Promise<InternalAssistantEnqueueResponse> {
  const fetchFn = options.fetchImpl ?? fetch;
  const url = new URL('/v1/internal/assistant/jobs', options.baseUrl.replace(/\/$/, '') + '/');
  const res = await fetchFn(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: input.sessionId,
      message: input.message,
      target: input.target,
      clientRequestId: input.clientRequestId,
      retryCount: input.retryCount,
      idempotencyKey: input.idempotencyKey,
      trace: { correlationId: input.correlationId },
    }),
  });
  if (!res.ok) throw new Error(`Internal assistant enqueue failed: ${res.status}`);
  const json: unknown = await res.json();
  EnqueueJobResponseSchema.parse(json);
  return json as InternalAssistantEnqueueResponse;
}

export function internalAssistantEventClientOptions(
  baseUrl: string,
  jobId: string,
  links?: { status: string; events: string },
): JobEventsClientOptions {
  return {
    baseUrl,
    jobId,
    statusPath: links?.status ?? `/v1/internal/assistant/jobs/${jobId}`,
    eventsPath: links?.events ?? `/v1/internal/assistant/jobs/${jobId}/events`,
  };
}
