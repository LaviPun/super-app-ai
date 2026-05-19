import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  assertSafeTargetUrl,
  assertGdprWebhookIngress,
  createMemoryRateLimiter,
  isShopifyGdprComplianceTopic,
  verifyShopifyWebhookHmac,
} from '@superapp/network-security';

let configuredRateLimitMax = -1;
let rateLimiter = createMemoryRateLimiter({ max: 0, windowMs: 60_000 });

function checkRateLimit(key: string) {
  const max = Number(process.env.API_RATE_LIMIT_MAX ?? 0);
  const windowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (max !== configuredRateLimitMax) {
    configuredRateLimitMax = max;
    rateLimiter = createMemoryRateLimiter({ max, windowMs });
  }
  return rateLimiter.check(key);
}

function resolveClientKey(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.ip;
}

function serializeWebhookBody(body: unknown): string {
  if (typeof body === 'string') return body;
  return JSON.stringify(body ?? {});
}

function readWebhookHmac(
  request: FastifyRequest,
  body: unknown,
): string | undefined {
  const header =
    request.headers['x-shopify-hmac-sha256'] ??
    request.headers['http-x-shopify-hmac-sha256'];
  if (typeof header === 'string' && header.trim()) return header;

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const legacy = (body as Record<string, unknown>).hmac;
    if (typeof legacy === 'string' && legacy.trim()) return legacy;
  }
  return undefined;
}

/** Baseline API security: headers, rate-limit stub, webhook HMAC, connector SSRF. */
export async function registerSecurityPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  app.addHook('preHandler', async (request, reply) => {
    const limit = checkRateLimit(resolveClientKey(request));
    if (!limit.allowed) {
      reply.header('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
      return reply.status(429).send({ error: 'RATE_LIMITED' });
    }

    if (request.method === 'POST' && request.url.startsWith('/v1/webhooks/shopify')) {
      const body = request.body;
      const rawBody = serializeWebhookBody(body);
      const hmac = readWebhookHmac(request, body);
      if (!verifyShopifyWebhookHmac(rawBody, hmac, { secret: process.env.SHOPIFY_API_SECRET })) {
        return reply.status(401).send({ error: 'INVALID_WEBHOOK_HMAC' });
      }

      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const record = body as Record<string, unknown>;
        const topic = typeof record.topic === 'string' ? record.topic : '';
        if (isShopifyGdprComplianceTopic(topic)) {
          try {
            assertGdprWebhookIngress({
              shopDomain: String(record.shopDomain ?? ''),
              topic,
              eventId: String(record.eventId ?? ''),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Invalid GDPR webhook ingress';
            return reply.status(400).send({ error: 'INVALID_GDPR_WEBHOOK', message });
          }
        }
      }
    }

    if (!request.url.startsWith('/v1/connectors/')) return;
    const envelope = request.body as Record<string, unknown> | undefined;
    const payload = envelope?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

    const path = (payload as Record<string, unknown>).path;
    if (typeof path !== 'string') return;
    if (!/^https?:\/\//i.test(path)) return;

    try {
      await assertSafeTargetUrl(path, { context: 'Connector enqueue path override' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unsafe connector path';
      return reply.status(400).send({ error: 'UNSAFE_CONNECTOR_PATH', message });
    }
  });
}
