import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

/**
 * Generic HTTP connector — sends HTTP requests to external endpoints.
 * Includes SSRF protections (HTTPS-only, private network blocking).
 */
export class HttpConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'http',
      displayName: 'HTTP Request',
      version: '1.0.0',
      description: 'Send HTTP requests to external APIs with SSRF protection.',
      icon: 'globe',
      auth: {
        type: 'none',
      },
      operations: [
        {
          name: 'request',
          displayName: 'Send HTTP request',
          description: 'Send a request to any HTTPS endpoint.',
          inputSchema: {
            type: 'object',
            required: ['url', 'method'],
            properties: {
              url: { type: 'string', description: 'Full URL (must be https://)' },
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
              headers: { type: 'object', additionalProperties: { type: 'string' } },
              body: { description: 'Request body (JSON serialized)' },
              authHeader: { type: 'string', description: 'Optional Authorization header value' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              status: { type: 'number' },
              headers: { type: 'object' },
              body: { description: 'Parsed JSON or raw text' },
            },
          },
          idempotency: { supported: false },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    if (operation !== 'request') {
      return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };
    }

    const errors: { path: string; message: string }[] = [];

    if (!inputs.url || typeof inputs.url !== 'string') {
      errors.push({ path: 'url', message: 'url is required and must be a string' });
    } else {
      try {
        const u = new URL(inputs.url);
        if (u.protocol !== 'https:') {
          errors.push({ path: 'url', message: 'Only HTTPS URLs are allowed' });
        }
      } catch {
        errors.push({ path: 'url', message: 'Invalid URL format' });
      }
    }

    if (!inputs.method || typeof inputs.method !== 'string') {
      errors.push({ path: 'method', message: 'method is required' });
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    const { url, method, headers: customHeaders, body, authHeader } = req.inputs;

    if (typeof url !== 'string') {
      return connectorError('VALIDATION', 'url must be a string');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return connectorError('VALIDATION', `Invalid URL: ${url}`);
    }

    if (parsed.protocol !== 'https:') {
      return connectorError('VALIDATION', 'Only HTTPS URLs are allowed (SSRF protection)');
    }

    if (isBlockedHost(parsed.hostname)) {
      return connectorError('VALIDATION', 'Private/local hosts are blocked (SSRF protection)');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders && typeof customHeaders === 'object' ? customHeaders as Record<string, string> : {}),
    };

    if (authHeader && typeof authHeader === 'string') {
      headers['Authorization'] = authHeader;
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch(url, {
        method: String(method ?? 'GET'),
        headers,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text.slice(0, 50000);
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        return connectorError('RATE_LIMIT', `Rate limited by ${parsed.hostname}`, {
          retryable: true,
          retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000,
        });
      }

      if (res.status >= 500) {
        return connectorError('UPSTREAM', `Upstream returned ${res.status}`, {
          retryable: true,
          details: { status: res.status, body: parsedBody },
        });
      }

      return connectorSuccess(
        { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: parsedBody },
        { statusCode: res.status, meta: { durationMs: Date.now() - start } },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', `Request to ${parsed.hostname} timed out`, { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(lower)) return true;
  if (lower.endsWith('.local')) return true;
  for (const range of PRIVATE_RANGES) {
    if (range.test(lower)) return true;
  }
  return false;
}
