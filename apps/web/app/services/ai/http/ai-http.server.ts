import crypto from 'node:crypto';
import { ApiLogService } from '~/services/observability/api-log.service';

export type AiHttpMeta = {
  provider: string;
  model: string;
  endpoint: string;
  status: number;
  durationMs: number;
  requestId?: string;
};

/**
 * Provider HTTP helper with:
 * - timeouts
 * - bounded retries for 429/5xx
 * - metadata logging (no raw prompt/output persisted here)
 */
export async function postJsonWithRetries(opts: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  logMeta: { provider: string; model: string; actor: 'INTERNAL' };
  shopId?: string;
}): Promise<{ json: any; meta: AiHttpMeta }> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRetries = opts.maxRetries ?? 2;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...opts.headers,
        },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - started;
      const requestId =
        res.headers.get('x-request-id') ??
        res.headers.get('request-id') ??
        res.headers.get('x-amzn-requestid') ??
        undefined;

      const text = await res.text();
      const json = safeJsonParse(text);

      await new ApiLogService().write({
        actor: opts.logMeta.actor,
        method: 'POST',
        path: redactUrl(opts.url),
        status: res.status,
        durationMs,
        success: res.status < 400,
        requestId,
        shopId: opts.shopId,
        meta: {
          provider: opts.logMeta.provider,
          model: opts.logMeta.model,
          attempt,
          requestBodySha256: sha256(JSON.stringify(opts.body)),
          responseBodySha256: sha256(text),
          responseBytes: Buffer.byteLength(text, 'utf8'),
        },
      });

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }

      if (res.status >= 400) {
        // Mark client errors as non-retryable so the catch block doesn't retry them.
        const err = Object.assign(
          new Error(`AI provider HTTP ${res.status}: ${truncate(text, 800)}`),
          { nonRetryable: true }
        );
        throw err;
      }

      return {
        json,
        meta: {
          provider: opts.logMeta.provider,
          model: opts.logMeta.model,
          endpoint: opts.url,
          status: res.status,
          durationMs,
          requestId,
        },
      };
    } catch (e: any) {
      // Non-retryable errors (e.g. 4xx client errors) should propagate immediately.
      if (e?.nonRetryable) throw e;
      lastErr = e;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr ?? new Error('AI call failed');
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

function backoffMs(attempt: number) {
  const base = 400 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function redactUrl(url: string) {
  const u = new URL(url);
  u.search = '';
  return u.toString();
}
