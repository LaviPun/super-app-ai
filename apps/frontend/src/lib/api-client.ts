import {
  EnqueueJobResponseSchema,
  HealthResponseSchema,
  type EnqueueJobRequest,
  type EnqueueJobResponse,
  type HealthResponse,
} from '@superapp/platform-contracts';

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function fetchApiHealth(options: ApiClientOptions): Promise<HealthResponse> {
  const fetchFn = options.fetchImpl ?? fetch;
  const url = new URL('/health', options.baseUrl.replace(/\/$/, ''));
  const res = await fetchFn(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`API health check failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  return HealthResponseSchema.parse(json);
}

export type EnqueueJobResponseWithLinks = EnqueueJobResponse & {
  links?: { status: string; events: string };
};

export async function enqueueJob(
  options: ApiClientOptions,
  request: EnqueueJobRequest,
): Promise<EnqueueJobResponseWithLinks> {
  const fetchFn = options.fetchImpl ?? fetch;
  const url = new URL('/v1/jobs', options.baseUrl.replace(/\/$/, ''));
  const res = await fetchFn(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`API job enqueue failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  return EnqueueJobResponseSchema.parse(json) as EnqueueJobResponseWithLinks;
}

export function defaultApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_FASTIFY_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000';
}
