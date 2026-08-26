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
 * Below this much remaining deadline budget, don't fire (or retry into)
 * another HTTP attempt — there isn't enough time left for a round-trip to
 * plausibly land. WS-C Task 10 (C7) fix round 1.
 */
const MIN_DEADLINE_BUDGET_MS = 1_000;

/** True when there's enough `deadlineAt` budget left to attempt another call (or always true when no deadline is set). */
function hasDeadlineBudget(deadlineAt: number | undefined): boolean {
  return deadlineAt === undefined || deadlineAt - Date.now() >= MIN_DEADLINE_BUDGET_MS;
}

/** Typed, non-retryable error for "ran out of deadline budget", distinct from "ran out of retry attempts". */
function deadlineExhaustedError(cause?: unknown): Error & { nonRetryable: true; deadlineExhausted: true } {
  const causeMessage = cause instanceof Error ? cause.message : cause !== undefined ? String(cause) : undefined;
  const message = causeMessage
    ? `AI provider call deadline exhausted (last attempt: ${causeMessage}). Please try again.`
    : 'AI provider call deadline exhausted before an attempt could be made. Please try again.';
  return Object.assign(new Error(message), { nonRetryable: true as const, deadlineExhausted: true as const });
}

/**
 * Provider HTTP helper with:
 * - timeouts, re-derived against `deadlineAt` on every attempt (never a
 *   once-computed value that lets each retry silently re-claim a full
 *   fresh window — see `deadlineAt` below)
 * - bounded retries for 429/5xx, each gated on remaining deadline budget
 * - metadata logging (no raw prompt/output persisted here)
 */
export async function postJsonWithRetries(opts: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  /**
   * WS-C Task 10 (C7). Epoch ms after which the caller's job/request budget
   * is exhausted (worker job budgets: generation 150s, hydrate 90s; inline
   * mode passes a 55s deadline). Both provider clients
   * (`anthropic-messages.client.server.ts`, `openai-responses.client.server.ts`)
   * forward `GenerateHints.deadlineAt` here directly (alongside the
   * `ConfiguredLlmClient`-derived `timeoutMs`) — this is the ONE place that
   * re-derives the effective timeout on EVERY attempt, so a 429/5xx/network
   * retry can never re-claim a full fresh window: each attempt's timeout is
   * `min(timeoutMs ?? 120_000, deadlineAt - now)`, computed fresh right
   * before that attempt fires, and once the remaining budget drops below
   * `MIN_DEADLINE_BUDGET_MS` no further attempt (initial OR retry) is made
   * at all — the failure is reported immediately as a typed, non-retryable
   * `deadlineExhausted` error instead of sleeping into (or firing) a call
   * that has no realistic chance of finishing.
   */
  deadlineAt?: number;
  maxRetries?: number;
  logMeta: { provider: string; model: string; actor: 'INTERNAL' };
  shopId?: string;
}): Promise<{ json: any; meta: AiHttpMeta }> {
  const requestedTimeoutMs = opts.timeoutMs ?? 120_000;
  const maxRetries = opts.maxRetries ?? 2;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Re-derive the timeout, and check the deadline, EVERY attempt — a
    // value computed once before the loop would let each retry re-claim
    // the full window, multiplying total wall-clock spend up to
    // (maxRetries+1)x the caller's actual budget.
    if (!hasDeadlineBudget(opts.deadlineAt)) {
      throw deadlineExhaustedError(lastErr);
    }
    const timeoutMs =
      opts.deadlineAt !== undefined
        ? Math.max(0, Math.min(requestedTimeoutMs, opts.deadlineAt - Date.now()))
        : requestedTimeoutMs;

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
          maxOutputTokensRequested: (opts.body as any)?.max_output_tokens ?? null,
          outputTokens: json?.usage?.output_tokens ?? json?.usage?.completion_tokens ?? null,
          inputTokens: json?.usage?.input_tokens ?? json?.usage?.prompt_tokens ?? null,
          responseStatus: json?.status ?? null,
          outputMessageStatus: json?.output?.[0]?.status ?? null,
          requestBodySha256: sha256(JSON.stringify(opts.body)),
          responseBodySha256: sha256(text),
          responseBytes: Buffer.byteLength(text, 'utf8'),
        },
      });

      if (res.status >= 500 && res.status <= 599) {
        if (attempt < maxRetries && hasDeadlineBudget(opts.deadlineAt)) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }

      // Rate limits: retry once with a short delay, then fail fast.
      // Long backoffs cause upstream timeouts (Cloudflare, proxies).
      if (res.status === 429) {
        if (attempt === 0 && hasDeadlineBudget(opts.deadlineAt)) {
          const retryAfter = parseRetryAfterMs(res.headers);
          await sleep(retryAfter ? Math.min(retryAfter, 10_000) : 5_000);
          continue;
        }
        // After one retry (or no deadline budget left for one), fail
        // immediately with a descriptive error.
        const err = Object.assign(
          new Error(`AI provider rate limited (HTTP 429). ${truncate(text, 400)}`),
          { nonRetryable: true, statusCode: 429 },
        );
        throw err;
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
      // A timed-out/aborted attempt (or a network error) with no deadline
      // budget left for another round-trip is NOT retryable either — sleep
      // into a fresh window only when there's actually time for one.
      if (attempt < maxRetries) {
        if (!hasDeadlineBudget(opts.deadlineAt)) {
          throw deadlineExhaustedError(e);
        }
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

/** Parse retry-after header (seconds or HTTP-date) into ms. Returns undefined if missing/invalid. */
function parseRetryAfterMs(headers: Headers): number | undefined {
  const val = headers.get('retry-after');
  if (!val) return undefined;
  const secs = Number(val);
  if (!Number.isNaN(secs) && secs > 0) return Math.min(secs * 1000, 120_000);
  const date = Date.parse(val);
  if (!Number.isNaN(date)) {
    const ms = date - Date.now();
    return ms > 0 ? Math.min(ms, 120_000) : undefined;
  }
  return undefined;
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
