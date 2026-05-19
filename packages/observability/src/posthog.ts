/**
 * PostHog product-analytics boundaries for Platform V2.
 *
 * Browser-safe (merchant-facing frontend only):
 * - Page views and navigation within embedded app shells
 * - Feature discovery events (module opened, wizard step viewed)
 * - Non-identifying funnel markers (plan tier, module catalog id)
 * - Explicit opt-in UX experiments
 *
 * Server-only (API, workers, Remix loaders/actions):
 * - Job lifecycle, queue depth, worker heartbeat
 * - AI provider latency/error rates
 * - Webhook lag, publish failure rate, connector health
 * - Any event that could include shop domain, staff email, tokens, or raw payloads
 *
 * Never send from the browser:
 * - shopDomain, customer email, access tokens, webhook payloads, prompt text, PII flags
 */

export const POSTHOG_BROWSER_ALLOWED_PROPERTIES = [
  'surface',
  'route',
  'moduleCatalogId',
  'planTier',
  'experimentKey',
  'variant',
] as const;

export const POSTHOG_SERVER_ONLY_PROPERTIES = [
  'shopDomain',
  'shopId',
  'requestId',
  'correlationId',
  'jobId',
  'queueName',
  'workerId',
  'providerId',
  'prompt',
  'payload',
  'email',
  'accessToken',
] as const;

export type PostHogSurface = 'browser' | 'server';

export function assertPostHogPropertyBoundary(
  surface: PostHogSurface,
  properties: Record<string, unknown>,
): { ok: true } | { ok: false; blocked: string[] } {
  const blocked: string[] = [];
  if (surface !== 'browser') return { ok: true };

  for (const key of Object.keys(properties)) {
    const normalized = key.toLowerCase();
    if (POSTHOG_SERVER_ONLY_PROPERTIES.some((candidate) => candidate.toLowerCase() === normalized)) {
      blocked.push(key);
    }
    if (/email|token|password|secret|phone|address|prompt|payload/i.test(key)) {
      blocked.push(key);
    }
  }

  return blocked.length === 0 ? { ok: true } : { ok: false, blocked: [...new Set(blocked)] };
}

export function filterBrowserPostHogProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(POSTHOG_BROWSER_ALLOWED_PROPERTIES.map((key) => key.toLowerCase()));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (allowed.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}
